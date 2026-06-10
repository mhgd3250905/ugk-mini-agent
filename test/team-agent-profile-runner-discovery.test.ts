import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentProfileRoleRunner } from "../src/team/agent-profile-role-runner.js";
import type { BackgroundAgentSessionFactory } from "../src/agent/background-agent-runner.js";
import type { ResolvedBackgroundAgentSnapshot } from "../src/agent/background-agent-profile.js";
import {
	type CapturedSessionInput,
	fakeProfileResolver,
	makeCapturingSessionFactory,
	makeDiscoveryDispatchInput,
	makeDiscoveryDispatchPatchJson,
	makeFakeProfileResolver,
	makeFakeSessionFactory,
} from "./team-agent-profile-runner-helpers.js";

// ── Discovery dispatcher runner ──

test("runDiscoveryDispatcher uses dispatcherProfileId and discovery-dispatcher scope with sanitized item key", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dispatcher-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory([makeDiscoveryDispatchPatchJson("vendor/slash")]);
		const runner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			workerProfileId: "p-worker",
			checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher",
			finalizerProfileId: "p-finalizer",
			decomposerProfileId: "p-decomposer",
			dispatcherProfileId: "p-dispatcher",
			profileResolver: makeFakeProfileResolver({
				"p-dispatcher": { defaultBrowserId: "browser-dispatcher" },
				"p-decomposer": { defaultBrowserId: "browser-decomposer" },
				"p-worker": { defaultBrowserId: "browser-worker" },
			}) as never,
			sessionFactory: factory,
		});

		const out = await runner.runDiscoveryDispatcher(makeDiscoveryDispatchInput({
			itemId: "vendor/slash",
			itemPayload: { id: "vendor/slash", title: "Slash Vendor", type: "vendor" },
		}));

		assert.equal(captured[0]!.snapshot.profileId, "p-dispatcher");
		assert.equal(captured[0]!.browserId, "browser-dispatcher");
		assert.ok(captured[0]!.browserScope?.includes("discovery-dispatcher"));
		assert.ok(captured[0]!.workspaceRootPath?.includes("discovery-dispatcher"));
		assert.ok(!captured[0]!.browserScope?.includes("vendor/slash"), "browser scope must not include raw path-like item id");
		assert.ok(!captured[0]!.workspaceRootPath?.includes("vendor/slash"), "workspace path must not include raw path-like item id");
		assert.equal(out.ok, true);
		assert.equal(out.runtimeContext?.requestedProfileId, "p-dispatcher");
		assert.equal(out.runtimeContext?.browserId, "browser-dispatcher");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runDiscoveryDispatcher prompt asks for semantic patch and includes discovery dispatch context and exact item payload", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dispatcher-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: makeDiscoveryDispatchPatchJson() }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;
		const runner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			workerProfileId: "p-worker",
			checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher",
			finalizerProfileId: "p-finalizer",
			decomposerProfileId: "p-decomposer",
			dispatcherProfileId: "p-dispatcher",
			profileResolver: makeFakeProfileResolver({ "p-dispatcher": {} }) as never,
			sessionFactory,
		});

		await runner.runDiscoveryDispatcher(makeDiscoveryDispatchInput());

		assert.ok(capturedPrompt.includes("Vendor discovery"), "prompt must include Discovery task title");
		assert.ok(capturedPrompt.includes("Find qualified vendors"), "prompt must include Discovery goal");
		assert.ok(capturedPrompt.includes("Create one due-diligence work unit"), "prompt must include dispatch goal");
		assert.ok(capturedPrompt.includes("vendor_1"), "prompt must include exact item id");
		assert.ok(capturedPrompt.includes('"website": "https://example.com"'), "prompt must include full item payload JSON");
		assert.ok(capturedPrompt.includes('"workerInstruction"'), "prompt must ask for semantic worker instruction");
		assert.ok(capturedPrompt.includes('"itemAcceptanceHints"'), "prompt must ask for optional semantic acceptance hints");
		assert.ok(!capturedPrompt.includes('"workUnit": {'), "prompt must not ask for full WorkUnit");
		assert.ok(capturedPrompt.includes("workerAgentId") && capturedPrompt.includes("generatedSource"), "prompt must include forbidden output fields");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runDiscoveryDispatcher compiles semantic patch into full WorkUnit plus runtime context", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dispatcher-"));
	try {
		const runner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			workerProfileId: "p-worker",
			checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher",
			finalizerProfileId: "p-finalizer",
			dispatcherProfileId: "p-dispatcher",
			profileResolver: makeFakeProfileResolver({ "p-dispatcher": { defaultBrowserId: "browser-dispatcher" } }) as never,
			sessionFactory: makeFakeSessionFactory([makeDiscoveryDispatchPatchJson()]),
		});

		const out = await runner.runDiscoveryDispatcher(makeDiscoveryDispatchInput());

		assert.equal(out.ok, true);
		if (out.ok) {
			assert.equal(out.itemId, "vendor_1");
			assert.equal(out.workUnit.title, "Assess Acme Sensors");
			assert.ok(out.workUnit.input.text.includes("Research Acme Sensors"));
			assert.ok(out.workUnit.input.text.includes('"website": "https://example.com"'));
			assert.ok(out.workUnit.outputContract.text.includes("Include BLE validation fit evidence."));
			assert.ok(out.workUnit.acceptance.rules.includes("Cites relevant sources"));
		}
		assert.equal(out.runtimeContext?.requestedProfileId, "p-dispatcher");
		assert.equal(out.runtimeContext?.browserId, "browser-dispatcher");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runDiscoveryDispatcher retries once with parser feedback and compiles repaired semantic patch", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dispatcher-"));
	try {
		const responses = [
			`Here is the semantic patch:\n${makeDiscoveryDispatchPatchJson()}`,
			makeDiscoveryDispatchPatchJson(),
		];
		let callIndex = 0;
		const captured: CapturedSessionInput[] = [];
		const prompts: string[] = [];
		const sessionFactory = {
			createSession: async (input: {
				runId: string;
				connId: string;
				browserId?: string;
				browserScope?: string;
				snapshot: ResolvedBackgroundAgentSnapshot;
				workspace?: { rootPath?: string };
			}) => {
				captured.push({
					runId: input.runId,
					connId: input.connId,
					browserId: input.browserId,
					browserScope: input.browserScope,
					snapshot: input.snapshot,
					workspaceRootPath: input.workspace?.rootPath,
				});
				const content = responses[callIndex] ?? "ok";
				callIndex++;
				return {
					prompt: async (prompt: string) => { prompts.push(prompt); },
					subscribe: () => () => {},
					messages: [{ role: "assistant", content: [{ type: "text", text: content }], stopReason: "end_turn" }],
				};
			},
		} as unknown as BackgroundAgentSessionFactory;
		const runner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			workerProfileId: "p-worker",
			checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher",
			finalizerProfileId: "p-finalizer",
			dispatcherProfileId: "p-dispatcher",
			profileResolver: makeFakeProfileResolver({ "p-dispatcher": { defaultBrowserId: "browser-dispatcher" } }) as never,
			sessionFactory,
		});

		const out = await runner.runDiscoveryDispatcher(makeDiscoveryDispatchInput());

		assert.equal(out.ok, true);
		assert.equal(captured.length, 2, "dispatcher should create one repair session after parse failure");
		assert.equal(prompts.length, 2);
		assert.ok(prompts[1]!.includes("Previous output was rejected"), "repair prompt must include parser feedback section");
		assert.ok(prompts[1]!.includes("discovery dispatcher semantic patch parse error"), "repair prompt must include parse error");
		assert.ok(prompts[1]!.includes("Here is the semantic patch"), "repair prompt must include rejected raw output");
		if (out.ok) {
			assert.equal(out.workUnit.title, "Assess Acme Sensors");
		}
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runDiscoveryDispatcher returns ok false with runtime context on invalid session output", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dispatcher-"));
	try {
		const runner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			workerProfileId: "p-worker",
			checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher",
			finalizerProfileId: "p-finalizer",
			dispatcherProfileId: "p-dispatcher",
			profileResolver: makeFakeProfileResolver({ "p-dispatcher": { defaultBrowserId: "browser-dispatcher" } }) as never,
			sessionFactory: makeFakeSessionFactory(["not json", "still not json"]),
		});

		const out = await runner.runDiscoveryDispatcher(makeDiscoveryDispatchInput());

		assert.equal(out.ok, false);
		assert.equal(out.itemId, "vendor_1");
		assert.match(out.error, /json/i);
		assert.equal(out.runtimeContext?.requestedProfileId, "p-dispatcher");
		assert.equal(out.runtimeContext?.browserId, "browser-dispatcher");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runDiscoveryDispatcher rejects invalid semantic patch and preserves runtime context", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dispatcher-"));
	try {
		const runner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			workerProfileId: "p-worker",
			checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher",
			finalizerProfileId: "p-finalizer",
			dispatcherProfileId: "p-dispatcher",
			profileResolver: makeFakeProfileResolver({ "p-dispatcher": { defaultBrowserId: "browser-dispatcher" } }) as never,
			sessionFactory: makeFakeSessionFactory([JSON.stringify({
				itemId: "vendor_1",
				title: "Assess Acme Sensors",
				workerInstruction: "Research vendor",
				workUnit: { title: "rogue full WorkUnit" },
			}), JSON.stringify({
				itemId: "vendor_1",
				title: "Assess Acme Sensors",
				workerInstruction: "Research vendor",
				workUnit: { title: "rogue full WorkUnit" },
			})]),
		});

		const out = await runner.runDiscoveryDispatcher(makeDiscoveryDispatchInput());

		assert.equal(out.ok, false);
		assert.equal(out.itemId, "vendor_1");
		assert.match(out.error, /workUnit/);
		assert.equal(out.runtimeContext?.requestedProfileId, "p-dispatcher");
		assert.equal(out.runtimeContext?.browserId, "browser-dispatcher");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runDiscoveryDispatcher falls back from dispatcherProfileId to decomposerProfileId then workerProfileId", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dispatcher-"));
	try {
		const capturedProfiles: string[] = [];
		const profileResolver = {
			resolve: async (ref: { profileId: string }) => {
				capturedProfiles.push(ref.profileId);
				return {
					profileId: ref.profileId,
					profileVersion: "1",
					agentSpecId: "team-default",
					agentSpecVersion: "1",
					skillSetId: "team-default",
					skillSetVersion: "1",
					skills: [],
					modelPolicyId: "team-default",
					modelPolicyVersion: "1",
					provider: "test",
					model: "test-model",
					upgradePolicy: "latest" as const,
					resolvedAt: new Date().toISOString(),
				};
			},
		};
		const withDecomposer = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			workerProfileId: "p-worker",
			checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher",
			finalizerProfileId: "p-finalizer",
			decomposerProfileId: "p-decomposer",
			profileResolver: profileResolver as never,
			sessionFactory: makeFakeSessionFactory([makeDiscoveryDispatchPatchJson()]),
		});
		const workerFallback = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			workerProfileId: "p-worker",
			checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher",
			finalizerProfileId: "p-finalizer",
			profileResolver: profileResolver as never,
			sessionFactory: makeFakeSessionFactory([makeDiscoveryDispatchPatchJson()]),
		});

		await withDecomposer.runDiscoveryDispatcher(makeDiscoveryDispatchInput());
		await workerFallback.runDiscoveryDispatcher(makeDiscoveryDispatchInput());

		assert.deepEqual(capturedProfiles, ["p-decomposer", "p-worker"]);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

// ── P21-B: decomposer runner ──

test("runDecomposer uses decomposerProfileId and decomposer browser scope", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-decomposer-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(['{"decision":"no_split","reason":"small enough"}']);
		const resolver = makeFakeProfileResolver({
			"p-worker": { defaultBrowserId: "browser-worker" },
			"p-decomposer": { defaultBrowserId: "browser-decomposer" },
		});
		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			decomposerProfileId: "p-decomposer",
			profileResolver: resolver as never, sessionFactory: factory,
		});

		const out = await runner.runDecomposer({
			runId: "run_decomp_profile",
			plan: { schemaVersion: "team/plan-1", planId: "plan_1", title: "Plan", defaultTeamUnitId: "tu", goal: { text: "Goal text" }, tasks: [], outputContract: { text: "out" }, archived: false, createdAt: "", updatedAt: "", runCount: 0 },
			task: { id: "task_1", title: "Task", input: { text: "do" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "leaf" } },
			maxChildren: 8,
		});

		assert.equal(captured.length, 1);
		assert.equal(captured[0]!.snapshot.profileId, "p-decomposer");
		assert.equal(captured[0]!.browserId, "browser-decomposer");
		assert.ok(captured[0]!.browserScope?.includes("decomposer"));
		assert.equal(out.runtimeContext?.requestedProfileId, "p-decomposer");
		assert.equal(out.runtimeContext?.browserId, "browser-decomposer");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runDecomposer prompt includes plan task policy and strict JSON schema", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-decomposer-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: '{"decision":"no_split","reason":"ok"}' }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;
		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			decomposerProfileId: "p-decomposer",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});

		await runner.runDecomposer({
			runId: "run_decomp_prompt",
			plan: { schemaVersion: "team/plan-1", planId: "plan_1", title: "Plan", defaultTeamUnitId: "tu", goal: { text: "Investigate domains" }, tasks: [], outputContract: { text: "out" }, archived: false, createdAt: "", updatedAt: "", runCount: 0 },
			task: { id: "reverse_dns", title: "Reverse DNS lookup", input: { text: "Check reverse DNS" }, acceptance: { rules: ["must cite sources"] }, decomposer: { mode: "propagate", maxChildren: 5 } },
			maxChildren: 5,
		});

		assert.ok(capturedPrompt.includes("Investigate domains"));
		assert.ok(capturedPrompt.includes("Reverse DNS lookup"));
		assert.ok(capturedPrompt.includes("Check reverse DNS"));
		assert.ok(capturedPrompt.includes("must cite sources"));
		assert.ok(capturedPrompt.includes("propagate"));
		assert.ok(capturedPrompt.includes("maxChildren"));
		assert.ok(capturedPrompt.includes('"decision":"split|no_split"'));
		assert.ok(capturedPrompt.includes("只输出一个 JSON object"));
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runDecomposer parses strict no_split and split JSON", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-decomposer-"));
	try {
		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			decomposerProfileId: "p-decomposer",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory([
				'{"decision":"no_split","reason":"already atomic"}',
				'{"decision":"split","reason":"needs steps","children":[{"id":"collect_ips","title":"Collect IPs","input":{"text":"Collect known IPs"},"acceptance":{"rules":["IPs listed"]},"decomposer":{"mode":"none"}}]}',
			]),
		});
		const input = {
			runId: "run_decomp_parse",
			plan: { schemaVersion: "team/plan-1" as const, planId: "plan_1", title: "Plan", defaultTeamUnitId: "tu", goal: { text: "Goal" }, tasks: [], outputContract: { text: "out" }, archived: false, createdAt: "", updatedAt: "", runCount: 0 },
			task: { id: "task_1", title: "Task", input: { text: "do" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "leaf" as const } },
			maxChildren: 8,
		};

		const noSplit = await runner.runDecomposer(input);
		assert.equal(noSplit.decision, "no_split");
		assert.deepEqual(noSplit.children, []);

		const split = await runner.runDecomposer(input);
		assert.equal(split.decision, "split");
		assert.equal(split.children?.[0]?.id, "collect_ips");
		assert.equal(split.children?.[0]?.decomposer?.mode, "none");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runDecomposer returns safe no_split on invalid JSON", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-decomposer-"));
	try {
		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			decomposerProfileId: "p-decomposer",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory(["not json"]),
		});

		const out = await runner.runDecomposer({
			runId: "run_decomp_bad",
			plan: { schemaVersion: "team/plan-1", planId: "plan_1", title: "Plan", defaultTeamUnitId: "tu", goal: { text: "Goal" }, tasks: [], outputContract: { text: "out" }, archived: false, createdAt: "", updatedAt: "", runCount: 0 },
			task: { id: "task_1", title: "Task", input: { text: "do" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "leaf" } },
			maxChildren: 8,
		});

		assert.equal(out.decision, "no_split");
		assert.match(out.reason, /parse error/);
		assert.deepEqual(out.children, []);
		assert.ok(out.runtimeContext);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runDecomposer rejects child task decomposer policy above schema cap", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-decomposer-"));
	try {
		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			decomposerProfileId: "p-decomposer",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory([
				'{"decision":"split","reason":"too broad","children":[{"id":"child_1","title":"Child","input":{"text":"do child"},"acceptance":{"rules":["ok"]},"decomposer":{"mode":"leaf","maxChildren":21}}]}',
			]),
		});

		const out = await runner.runDecomposer({
			runId: "run_decomp_child_cap",
			plan: { schemaVersion: "team/plan-1", planId: "plan_1", title: "Plan", defaultTeamUnitId: "tu", goal: { text: "Goal" }, tasks: [], outputContract: { text: "out" }, archived: false, createdAt: "", updatedAt: "", runCount: 0 },
			task: { id: "task_1", title: "Task", input: { text: "do" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "leaf" } },
			maxChildren: 8,
		});

		assert.equal(out.decision, "no_split");
		assert.match(out.reason, /invalid schema/);
		assert.deepEqual(out.children, []);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runDecomposer rejects non-normal generated child tasks", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-decomposer-"));
	try {
		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			decomposerProfileId: "p-decomposer",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory([
				'{"decision":"split","reason":"needs discovery","children":[{"id":"child_1","type":"discovery","title":"Child","input":{"text":"do child"},"acceptance":{"rules":["ok"]},"decomposer":{"mode":"none"}}]}',
			]),
		});

		const out = await runner.runDecomposer({
			runId: "run_decomp_child_type",
			plan: { schemaVersion: "team/plan-1", planId: "plan_1", title: "Plan", defaultTeamUnitId: "tu", goal: { text: "Goal" }, tasks: [], outputContract: { text: "out" }, archived: false, createdAt: "", updatedAt: "", runCount: 0 },
			task: { id: "task_1", title: "Task", input: { text: "do" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "leaf" } },
			maxChildren: 8,
		});

		assert.equal(out.decision, "no_split");
		assert.match(out.reason, /invalid schema/);
		assert.deepEqual(out.children, []);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

// ── P23 Task 2: source item identity in role prompts ──

test("worker prompt for generated child includes source item identity block", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p23-prompt-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});

		await runner.runWorker({
			runId: "run_p23_w",
			task: {
				id: "score__battle_08", title: "Score battle_08",
				input: { text: "Score the battle" }, acceptance: { rules: ["output is valid"] },
				parentTaskId: "score", sourceItemId: "battle_08",
				sourceItem: { id: "battle_08", data: { id: "battle_08", title: "藏经阁大战", chapter: "第8章" } },
				generated: true,
			},
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"),
			acceptanceRules: ["output is valid"],
		});

		assert.ok(capturedPrompt.includes("battle_08"), "worker prompt must mention item id");
		assert.ok(capturedPrompt.includes("藏经阁大战"), "worker prompt must mention item title");
		assert.ok(capturedPrompt.includes("最高优先级"), "worker prompt must include identity enforcement");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("checker prompt for generated child includes source item identity and reject instruction", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p23-prompt-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: '{"verdict":"pass","reason":"ok"}' }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});

		await runner.runChecker({
			runId: "run_p23_c",
			task: {
				id: "score__battle_08", title: "Score battle_08",
				input: { text: "Score the battle" }, acceptance: { rules: ["output is valid"] },
				sourceItemId: "battle_08",
				sourceItem: { id: "battle_08", data: { id: "battle_08", title: "藏经阁大战" } },
				generated: true,
			},
			attemptId: "att_1", workerOutputRef: "output/w1.md",
			acceptanceRules: ["output is valid"],
		});

		assert.ok(capturedPrompt.includes("battle_08"), "checker prompt must mention item id");
		assert.ok(capturedPrompt.includes("藏经阁大战"), "checker prompt must mention item title");
		assert.ok(capturedPrompt.includes("verdict\":\"fail") || capturedPrompt.includes("fail"), "checker prompt must say mismatch leads to fail");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("watcher prompt for generated child includes source item identity and reject instruction", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p23-prompt-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: '{"decision":"accept_task","reason":"ok"}' }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});

		await runner.runWatcher({
			runId: "run_p23_wa",
			task: {
				id: "score__battle_08", title: "Score battle_08",
				input: { text: "Score the battle" }, acceptance: { rules: ["ok"] },
				sourceItemId: "battle_08",
				sourceItem: { id: "battle_08", data: { id: "battle_08", title: "藏经阁大战" } },
				generated: true,
			},
			attemptId: "att_1", workUnitStatus: "passed", resultRef: "r.md", errorSummary: null,
		});

		assert.ok(capturedPrompt.includes("battle_08"), "watcher prompt must mention item id");
		assert.ok(capturedPrompt.includes("藏经阁大战"), "watcher prompt must mention item title");
		assert.ok(capturedPrompt.includes("不得接受") || capturedPrompt.includes("不得认可"), "watcher must reject switched-item");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("normal task prompt does not include source item identity block", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p23-prompt-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});

		await runner.runWorker({
			runId: "run_normal",
			task: { id: "task_1", title: "Normal task", input: { text: "do work" }, acceptance: { rules: ["ok"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"),
			acceptanceRules: ["ok"],
		});

		assert.ok(!capturedPrompt.includes("最高优先级"), "normal task must not have identity block");
		assert.ok(!capturedPrompt.includes("for_each item 身份"), "normal task must not have identity block");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("generated child with only id still produces clear identity block", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p23-prompt-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});

		await runner.runWorker({
			runId: "run_bare",
			task: {
				id: "proc__bare_id", title: "Process bare_id",
				input: { text: "Do work" }, acceptance: { rules: ["ok"] },
				sourceItemId: "bare_id",
				sourceItem: { id: "bare_id", data: { id: "bare_id" } },
				generated: true,
			},
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"),
			acceptanceRules: ["ok"],
		});

		assert.ok(capturedPrompt.includes("bare_id"), "identity block must mention item id");
		assert.ok(capturedPrompt.includes("最高优先级"), "identity block must be present");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

// ── P23 Review Task 1: sourceItemId-only fallback identity prompts ──

test("worker prompt for sourceItemId-only generated child includes identity block", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p23r-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});

		await runner.runWorker({
			runId: "run_p23r_w",
			task: {
				id: "score__battle_08", title: "Score battle_08",
				input: { text: "Score the battle" }, acceptance: { rules: ["output is valid"] },
				parentTaskId: "score", sourceItemId: "battle_08",
				generated: true,
			},
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"),
			acceptanceRules: ["output is valid"],
		});

		assert.ok(capturedPrompt.includes("battle_08"), "worker prompt must mention item id from sourceItemId fallback");
		assert.ok(capturedPrompt.includes("最高优先级"), "worker prompt must include identity enforcement");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("checker prompt for sourceItemId-only generated child includes identity and fail instruction", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p23r-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: '{"verdict":"pass","reason":"ok"}' }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});

		await runner.runChecker({
			runId: "run_p23r_c",
			task: {
				id: "score__battle_08", title: "Score battle_08",
				input: { text: "Score the battle" }, acceptance: { rules: ["output is valid"] },
				sourceItemId: "battle_08",
				generated: true,
			},
			attemptId: "att_1", workerOutputRef: "output/w1.md",
			acceptanceRules: ["output is valid"],
		});

		assert.ok(capturedPrompt.includes("battle_08"), "checker prompt must mention item id from sourceItemId fallback");
		assert.ok(capturedPrompt.includes("fail"), "checker prompt must say mismatch leads to fail");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("watcher prompt for sourceItemId-only generated child includes identity and reject instruction", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p23r-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: '{"decision":"accept_task","reason":"ok"}' }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});

		await runner.runWatcher({
			runId: "run_p23r_wa",
			task: {
				id: "score__battle_08", title: "Score battle_08",
				input: { text: "Score the battle" }, acceptance: { rules: ["ok"] },
				sourceItemId: "battle_08",
				generated: true,
			},
			attemptId: "att_1", workUnitStatus: "passed", resultRef: "r.md", errorSummary: null,
		});

		assert.ok(capturedPrompt.includes("battle_08"), "watcher prompt must mention item id from sourceItemId fallback");
		assert.ok(capturedPrompt.includes("不得认可") || capturedPrompt.includes("不得接受"), "watcher must reject switched-item");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("normal task with coincidental sourceItemId must not get identity block", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p23r-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});

		// generated is false/undefined but sourceItemId happens to be set
		await runner.runWorker({
			runId: "run_normal_sid",
			task: { id: "task_1", title: "Normal", input: { text: "do work" }, acceptance: { rules: ["ok"] }, sourceItemId: "battle_08" },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"),
			acceptanceRules: ["ok"],
		});

		assert.ok(!capturedPrompt.includes("最高优先级"), "non-generated task must not have identity block even with sourceItemId");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

// ── P26: output contract prompt evidence ──

test("P26: worker discovery prompt includes machine-consumable output contract", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p26-prompt-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;
		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});

		await runner.runWorker({
			runId: "run_p26_worker",
			task: { id: "scan_vendors", type: "discovery", title: "Scan", input: { text: "scan" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "vendors" } },
			attemptId: "attempt_1",
			workDir: join(root, "work"),
			outputDir: join(root, "output"),
			acceptanceRules: ["ok"],
		});

		assert.ok(capturedPrompt.includes("vendors"), "prompt must mention outputKey");
		assert.ok(capturedPrompt.includes("machine-consumable") || capturedPrompt.includes("机器可消费"), "prompt must require machine-consumable output");
		assert.ok(capturedPrompt.includes("id"), "prompt must mention stable item id");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("P26: checker and watcher prompts include validation evidence and forbid pass/accept on ok=false", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p26-prompt-"));
	try {
		const prompts: string[] = [];
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { prompts.push(p); },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: prompts.length === 1 ? '{"verdict":"fail","reason":"validation failed"}' : '{"decision":"confirm_failed","reason":"validation failed"}' }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;
		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});
		const validation = {
			ok: false,
			kind: "discovery" as const,
			sourceRef: null,
			checks: [{ name: "json_parse", ok: false, message: "no parseable JSON found" }],
			normalizedRef: null,
		};

		await runner.runChecker({
			runId: "run_p26_checker",
			task: { id: "scan_vendors", type: "discovery", title: "Scan", input: { text: "scan" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "vendors" } },
			attemptId: "attempt_1",
			workerOutputRef: "missing.md",
			acceptanceRules: ["ok"],
			outputValidation: validation,
		});
		await runner.runWatcher({
			runId: "run_p26_watcher",
			task: { id: "scan_vendors", type: "discovery", title: "Scan", input: { text: "scan" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "vendors" } },
			attemptId: "attempt_1",
			workUnitStatus: "failed",
			resultRef: null,
			errorSummary: "validation failed",
			outputValidation: validation,
		});

		assert.ok(prompts[0]!.includes('"ok":false'), "checker prompt must include serialized validation result");
		assert.ok(prompts[0]!.includes("不得") && prompts[0]!.includes("pass"), "checker must not pass ok=false");
		assert.ok(prompts[1]!.includes('"ok":false'), "watcher prompt must include serialized validation result");
		assert.ok(prompts[1]!.includes("不得") && prompts[1]!.includes("accept_task"), "watcher must not accept ok=false");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});


