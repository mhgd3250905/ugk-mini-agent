import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentProfileRoleRunner } from "../src/team/agent-profile-role-runner.js";
import type { DiscoveryDispatchInput, TeamRoleRunner } from "../src/team/role-runner.js";
import type { BackgroundAgentSessionFactory } from "../src/agent/background-agent-runner.js";
import type { ResolvedBackgroundAgentSnapshot } from "../src/agent/background-agent-profile.js";

function makeFakeSessionFactory(responses: string[]): BackgroundAgentSessionFactory {
	let callIndex = 0;
	return {
		createSession: async () => {
			const content = responses[callIndex] ?? "ok";
			callIndex++;
			const messages = [
				{ role: "assistant", content: [{ type: "text", text: content }], stopReason: "end_turn" },
			];
			return {
				prompt: async () => {},
				subscribe: () => () => {},
				messages,
			};
		},
	} as unknown as BackgroundAgentSessionFactory;
}

const fakeProfileResolver = {
	resolve: async () => ({}),
};

function makeFakeProfileResolver(snapshotsByProfileId: Record<string, Partial<ResolvedBackgroundAgentSnapshot>>) {
	return {
		resolve: async (ref: { profileId: string }) => {
			const partial = snapshotsByProfileId[ref.profileId] ?? {};
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
				...partial,
			};
		},
	};
}

interface CapturedSessionInput {
	runId: string;
	connId: string;
	browserId?: string;
	browserScope?: string;
	snapshot: ResolvedBackgroundAgentSnapshot;
	workspaceRootPath?: string;
}

function makeCapturingSessionFactory(responses: string[]) {
	const captured: CapturedSessionInput[] = [];
	let callIndex = 0;
	const factory = {
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
				prompt: async () => {},
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: content }], stopReason: "end_turn" }],
			};
		},
	};
	return { factory: factory as unknown as BackgroundAgentSessionFactory, captured };
}

function makeDiscoveryDispatchInput(overrides: Partial<DiscoveryDispatchInput> = {}): DiscoveryDispatchInput {
	return {
		runId: "run_discovery_dispatch",
		discoveryTaskId: "task_discovery",
		discoveryTaskTitle: "Vendor discovery",
		discoveryGoal: "Find qualified vendors for Android 16 BLE validation.",
		dispatchGoal: "Create one due-diligence work unit for each discovered vendor.",
		outputKey: "vendors",
		itemId: "vendor_1",
		itemPayload: {
			id: "vendor_1",
			title: "Acme Sensors",
			type: "vendor",
			website: "https://example.com",
		},
		requiredItemFields: ["id"],
		recommendedItemFields: ["title", "type"],
		generatedWorkerAgentId: "worker-default",
		generatedCheckerAgentId: "checker-default",
		...overrides,
	};
}

function makeDiscoveryDispatchOutputJson(itemId = "vendor_1"): string {
	return JSON.stringify({
		itemId,
		workUnit: {
			title: "Assess Acme Sensors",
			input: { text: "Research Acme Sensors and summarize BLE validation fit." },
			outputContract: { text: "Markdown due-diligence report with cited evidence." },
			acceptance: { rules: ["Cites relevant sources"] },
		},
	});
}

interface CapturedRouteCall {
	scope: string;
	browserId: string | undefined;
}

interface CapturedCleanupCall {
	scope: string;
	options?: { browserId?: string };
}

test("AgentProfileRoleRunner runWorker returns content", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory(["任务执行完毕"]),
		});

		const out = await runner.runWorker({
			runId: "run_test1",
			task: { id: "task_1", title: "测试任务", input: { text: "完成某事" }, acceptance: { rules: ["完成"] } },
			attemptId: "att_1",
			workDir: join(root, "work"),
			outputDir: join(root, "output"),
			acceptanceRules: ["完成"],
		});
		assert.equal(out.content, "任务执行完毕");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("AgentProfileRoleRunner forwards raw worker session events", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const forwarded: unknown[] = [];
		let unsubscribed = false;
		const sessionFactory = {
			createSession: async () => {
				let listener: ((event: unknown) => void) | undefined;
				return {
					prompt: async () => {
						listener?.({ type: "tool_execution_start", toolCallId: "tool_1", toolName: "x-search", args: { q: "test" } });
					},
					subscribe: (next: (event: unknown) => void) => {
						listener = next;
						return () => { unsubscribed = true; };
					},
					messages: [{ role: "assistant", content: [{ type: "text", text: "任务执行完毕" }], stopReason: "end_turn" }],
				};
			},
		};
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: sessionFactory as unknown as BackgroundAgentSessionFactory,
		});

		await runner.runWorker({
			runId: "run_test_events",
			task: { id: "task_1", title: "测试任务", input: { text: "完成某事" }, acceptance: { rules: ["完成"] } },
			attemptId: "att_1",
			workDir: join(root, "work"),
			outputDir: join(root, "output"),
			acceptanceRules: ["完成"],
			onSessionEvent: (event: unknown) => forwarded.push(event),
		});

		assert.equal((forwarded[0] as { type?: string }).type, "tool_execution_start");
		assert.equal(unsubscribed, true);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("AgentProfileRoleRunner runChecker parses pass JSON", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const jsonOutput = JSON.stringify({ verdict: "pass", reason: "all good", resultContent: "accepted" });
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory([jsonOutput]),
		});

		const out = await runner.runChecker({
			runId: "run_test2",
			task: { id: "task_1", title: "测试", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1",
			workerOutputRef: "output/worker-1.md",
			acceptanceRules: ["r1"],
		});
		assert.equal(out.verdict, "pass");
		assert.equal(out.reason, "all good");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("AgentProfileRoleRunner runChecker handles invalid JSON gracefully", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory(["this is not json"]),
		});

		const out = await runner.runChecker({
			runId: "run_test3",
			task: { id: "task_1", title: "测试", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1",
			workerOutputRef: "output/worker-1.md",
			acceptanceRules: ["r1"],
		});
		assert.equal(out.verdict, "fail");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("AgentProfileRoleRunner runWatcher parses accept_task JSON", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const jsonOutput = JSON.stringify({ decision: "accept_task", reason: "looks good" });
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory([jsonOutput]),
		});

		const out = await runner.runWatcher({
			runId: "run_test4",
			task: { id: "task_1", title: "测试", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1",
			workUnitStatus: "passed",
			resultRef: "result/accepted-1.md",
			errorSummary: null,
		});
		assert.equal(out.decision, "accept_task");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("AgentProfileRoleRunner runWatcher confirms failure on parse error", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory(["not json"]),
		});

		const out = await runner.runWatcher({
			runId: "run_test5",
			task: { id: "task_1", title: "测试", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1",
			workUnitStatus: "passed",
			resultRef: null,
			errorSummary: null,
		});
		assert.equal(out.decision, "confirm_failed");
		assert.match(out.reason, /parse error/);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("AgentProfileRoleRunner aborts session when AbortSignal fires during runWorker", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		let abortCalled = false;
		let promptPromiseResolve: () => void;
		const promptPromise = new Promise<void>(r => { promptPromiseResolve = r; });
		const sessionFactory = {
			createSession: async () => ({
				prompt: async () => {
					await promptPromise;
				},
				subscribe: () => () => {},
				abort: async () => {
					abortCalled = true;
					promptPromiseResolve!();
				},
				messages: [{ role: "assistant", content: [{ type: "text", text: "aborted output" }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory,
		});

		const controller = new AbortController();
		const workerPromise = runner.runWorker({
			runId: "run_abort1",
			task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1",
			workDir: join(root, "work"),
			outputDir: join(root, "output"),
			acceptanceRules: ["r1"],
			signal: controller.signal,
		});

		controller.abort(new Error("user cancel"));
		await assert.rejects(() => workerPromise, { message: "user cancel" });

		assert.equal(abortCalled, true);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("AgentProfileRoleRunner aborts session when AbortSignal fires during runChecker", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		let abortCalled = false;
		let promptPromiseResolve: () => void;
		const promptPromise = new Promise<void>(r => { promptPromiseResolve = r; });
		const sessionFactory = {
			createSession: async () => ({
				prompt: async () => { await promptPromise; },
				subscribe: () => () => {},
				abort: async () => {
					abortCalled = true;
					promptPromiseResolve!();
				},
				messages: [{ role: "assistant", content: [{ type: "text", text: "aborted" }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory,
		});

		const controller = new AbortController();
		const checkerPromise = runner.runChecker({
			runId: "run_abort2",
			task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1",
			workerOutputRef: "output/w1.md",
			acceptanceRules: ["r1"],
			signal: controller.signal,
		});

		controller.abort(new Error("user cancel"));
		await assert.rejects(() => checkerPromise, { message: "user cancel" });

		assert.equal(abortCalled, true);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("AgentProfileRoleRunner runFinalizer returns final report", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const report = "# 汇总报告\n\n全部完成。";
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory([report]),
		});

		const out = await runner.runFinalizer({
			runId: "run_test6",
			plan: {
				schemaVersion: "team/plan-1",
				planId: "plan_1",
				title: "测试计划",
				defaultTeamUnitId: "tu_1",
				goal: { text: "目标" },
				tasks: [{ id: "task_1", title: "任务1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
				outputContract: { text: "输出" },
				runCount: 0,
				archived: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			taskResults: [{ taskId: "task_1", status: "succeeded", resultRef: "r.md", errorSummary: null }],
		});
		assert.equal(out.finalReport, report);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("finalizer prompt includes resultRef file content", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		// Create a resultRef file
		const resultsDir = join(root, "runs", "run_ref_test", "results");
		await mkdir(resultsDir, { recursive: true });
		const resultContent = "# Worker Result\n\nThis is the actual output from the worker.";
		await writeFile(join(resultsDir, "accepted-1.md"), resultContent, "utf8");

		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: "report" }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory,
		});

		await runner.runFinalizer({
			runId: "run_ref_test",
			plan: {
				schemaVersion: "team/plan-1",
				planId: "plan_1",
				title: "测试计划",
				defaultTeamUnitId: "tu_1",
				goal: { text: "目标" },
				tasks: [{ id: "task_1", title: "任务1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
				outputContract: { text: "输出" },
				runCount: 0,
				archived: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			taskResults: [{ taskId: "task_1", status: "succeeded", resultRef: "results/accepted-1.md", errorSummary: null }],
		});

		assert.ok(capturedPrompt.includes("Worker Result"), "prompt should include resultRef file content");
		assert.ok(capturedPrompt.includes("actual output"), "prompt should include resultRef file content body");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("AgentProfileRoleRunner runChecker parses pass from mixed text with fenced JSON", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const mixedOutput = `以下是 checker 的验收意见：

worker 的输出基本满足验收标准，代码结构清晰。

\`\`\`json
{"verdict":"pass","reason":"代码满足所有验收标准","resultContent":"验收通过"}
\`\`\`

如有疑问请联系。`;
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory([mixedOutput]),
		});

		const out = await runner.runChecker({
			runId: "run_mixed",
			task: { id: "task_1", title: "测试", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1",
			workerOutputRef: "output/worker-1.md",
			acceptanceRules: ["r1"],
		});
		assert.equal(out.verdict, "pass");
		assert.equal(out.reason, "代码满足所有验收标准");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("AgentProfileRoleRunner runChecker parses bare JSON object embedded in text", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const embeddedOutput = `Based on my review, the verdict is {"verdict":"revise","reason":"needs work","feedback":"add more tests"} and that's my conclusion.`;
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory([embeddedOutput]),
		});

		const out = await runner.runChecker({
			runId: "run_embedded",
			task: { id: "task_1", title: "测试", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1",
			workerOutputRef: "output/worker-1.md",
			acceptanceRules: ["r1"],
		});
		assert.equal(out.verdict, "revise");
		assert.equal(out.feedback, "add more tests");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("AgentProfileRoleRunner runChecker tolerates unescaped quotes inside reason", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const jsonishOutput = `{"verdict":"pass","reason":"符合"连续3次问好"的核心目标","resultContent":"## 验收通过\\n\\n完成。"}`;
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory([jsonishOutput]),
		});

		const out = await runner.runChecker({
			runId: "run_jsonish_checker",
			task: { id: "task_1", title: "测试", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1",
			workerOutputRef: "output/worker-1.md",
			acceptanceRules: ["r1"],
		});
		assert.equal(out.verdict, "pass");
		assert.match(out.reason, /连续3次问好/);
		assert.match(out.resultContent ?? "", /验收通过/);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

// ── P3 tests: strict prompt + normalize output ──

test("checker prompt contains strict JSON constraints", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
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
			runId: "run_prompt_check", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "output/w1.md", acceptanceRules: ["r1"],
		});

		assert.ok(capturedPrompt.includes("字符串中的双引号必须转义"), "checker prompt must mention quote escaping");
		assert.ok(capturedPrompt.includes("不要在 JSON 前后添加任何文字"), "checker prompt must say no extra text");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("watcher prompt contains strict JSON constraints", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
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
			runId: "run_prompt_check2", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workUnitStatus: "passed", resultRef: null, errorSummary: null,
		});

		assert.ok(capturedPrompt.includes("字符串中的双引号必须转义"), "watcher prompt must mention quote escaping");
		assert.ok(capturedPrompt.includes("不要在 JSON 前后添加任何文字"), "watcher prompt must say no extra text");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("checker rejects invalid verdict and returns fail parse error", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory(['{"verdict":"ok","reason":"bad"}']),
		});

		const out = await runner.runChecker({
			runId: "run_bad_verdict", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "output/w1.md", acceptanceRules: ["r1"],
		});
		assert.equal(out.verdict, "fail");
		assert.match(out.reason, /parse error/);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("checker uppercase verdict PASS is rejected as parse error", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory(['{"verdict":"PASS","reason":"looks good"}']),
		});

		const out = await runner.runChecker({
			runId: "run_upper_verdict", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "output/w1.md", acceptanceRules: ["r1"],
		});
		assert.equal(out.verdict, "fail");
		assert.match(out.reason, /parse error/);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("watcher rejects invalid decision and returns confirm_failed parse error", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory(['{"decision":"yes","reason":"bad"}']),
		});

		const out = await runner.runWatcher({
			runId: "run_bad_decision", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workUnitStatus: "passed", resultRef: null, errorSummary: null,
		});
		assert.equal(out.decision, "confirm_failed");
		assert.match(out.reason, /parse error/);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("checker revise without feedback gets default feedback", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory(['{"verdict":"revise","reason":"needs improvement"}']),
		});

		const out = await runner.runChecker({
			runId: "run_no_feedback", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "output/w1.md", acceptanceRules: ["r1"],
		});
		assert.equal(out.verdict, "revise");
		assert.equal(out.feedback, "checker requested revision");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("watcher request_revision without feedback gets default feedback", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory(['{"decision":"request_revision","reason":"redo it"}']),
		});

		const out = await runner.runWatcher({
			runId: "run_no_watcher_feedback", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workUnitStatus: "failed", resultRef: null, errorSummary: null,
		});
		assert.equal(out.decision, "request_revision");
		assert.equal(out.feedback, "watcher requested revision");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("watcher ignores invalid revisionMode", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-runner-"));
	try {
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory: makeFakeSessionFactory(['{"decision":"accept_task","reason":"ok","revisionMode":"invalid"}']),
		});

		const out = await runner.runWatcher({
			runId: "run_bad_mode", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workUnitStatus: "passed", resultRef: null, errorSummary: null,
		});
		assert.equal(out.decision, "accept_task");
		assert.equal(out.revisionMode, undefined);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

// ── P8-A: profile-aware browser binding ──

test("session receives snapshot.defaultBrowserId when profile has one", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["done"]);
		const resolver = makeFakeProfileResolver({ wo: { defaultBrowserId: "browser_profile_a" } });

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
			defaultBrowserId: "fallback_browser",
		});

		await runner.runWorker({
			runId: "run_br_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 1);
		assert.equal(captured[0]!.browserId, "browser_profile_a");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("session falls back to options.defaultBrowserId when profile has none", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["done"]);
		const resolver = makeFakeProfileResolver({});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
			defaultBrowserId: "fallback_browser",
		});

		await runner.runWorker({
			runId: "run_br_2", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 1);
		assert.equal(captured[0]!.browserId, "fallback_browser");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("worker and checker in same run get different browserScope", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["worker out", '{"verdict":"pass","reason":"ok"}']);
		const resolver = makeFakeProfileResolver({});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
		});

		await runner.runWorker({
			runId: "run_scope_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		await runner.runChecker({
			runId: "run_scope_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "output/w1.md", acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 2);
		assert.notEqual(captured[0]!.browserScope, captured[1]!.browserScope);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("two worker attempts get different browserScope", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["att1", "att2"]);
		const resolver = makeFakeProfileResolver({});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
		});

		await runner.runWorker({
			runId: "run_scope_2", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		await runner.runWorker({
			runId: "run_scope_2", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_2", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 2);
		assert.notEqual(captured[0]!.browserScope, captured[1]!.browserScope);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("cleanup receives same browserScope as session", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["done"]);
		const resolver = makeFakeProfileResolver({ wo: { defaultBrowserId: "chrome-01" } });

		const cleanupCalls: CapturedCleanupCall[] = [];
		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
			closeBrowserTargetsForScope: async (scope: string, options?: { browserId?: string }) => { cleanupCalls.push({ scope, options }); },
		});

		await runner.runWorker({
			runId: "run_cleanup_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 1);
		assert.equal(cleanupCalls.length, 1);
		assert.equal(cleanupCalls[0]!.scope, captured[0]!.browserScope);
		assert.equal(cleanupCalls[0]!.options?.browserId, "chrome-01");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("team role runner writes and clears browser scope route like background runner", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["done"]);
		const resolver = makeFakeProfileResolver({ wo: { defaultBrowserId: "work-01" } });
		const routeCalls: CapturedRouteCall[] = [];
		const cleanupCalls: CapturedCleanupCall[] = [];

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
			setBrowserScopeRoute: async (scope: string, browserId: string | undefined) => { routeCalls.push({ scope, browserId }); },
			closeBrowserTargetsForScope: async (scope: string, options?: { browserId?: string }) => { cleanupCalls.push({ scope, options }); },
		});

		const out = await runner.runWorker({
			runId: "run_route_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 1);
		const scope = captured[0]!.browserScope;
		assert.ok(scope, "session should receive canonical browser scope");
		assert.deepEqual(routeCalls, [
			{ scope, browserId: "work-01" },
			{ scope, browserId: undefined },
		]);
		assert.deepEqual(cleanupCalls, [
			{ scope, options: { browserId: "work-01" } },
		]);
		assert.equal(out.runtimeContext?.browserScope, scope);
		assert.equal(out.runtimeContext?.browserId, "work-01");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("team role runner clears browser scope route when browserId is absent", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["done"]);
		const resolver = makeFakeProfileResolver({});
		const routeCalls: CapturedRouteCall[] = [];
		const cleanupCalls: CapturedCleanupCall[] = [];

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
			setBrowserScopeRoute: async (scope: string, browserId: string | undefined) => { routeCalls.push({ scope, browserId }); },
			closeBrowserTargetsForScope: async (scope: string, options?: { browserId?: string }) => { cleanupCalls.push({ scope, options }); },
		});

		const out = await runner.runWorker({
			runId: "run_route_none", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 1);
		const scope = captured[0]!.browserScope;
		assert.ok(scope, "session should still receive a scoped browser route key");
		assert.equal(captured[0]!.browserId, undefined);
		assert.deepEqual(routeCalls, [
			{ scope, browserId: undefined },
			{ scope, browserId: undefined },
		]);
		assert.deepEqual(cleanupCalls, [
			{ scope, options: undefined },
		]);
		assert.equal(out.runtimeContext?.browserId, null);
		assert.equal(out.runtimeContext?.browserScope, scope);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("team role runner clears browser scope route when session creation fails", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const resolver = makeFakeProfileResolver({ wo: { defaultBrowserId: "work-01" } });
		const routeCalls: CapturedRouteCall[] = [];
		const cleanupCalls: CapturedCleanupCall[] = [];
		const sessionFactory = {
			createSession: async () => {
				throw new Error("session init failed");
			},
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory,
			setBrowserScopeRoute: async (scope: string, browserId: string | undefined) => { routeCalls.push({ scope, browserId }); },
			closeBrowserTargetsForScope: async (scope: string, options?: { browserId?: string }) => { cleanupCalls.push({ scope, options }); },
		});

		await assert.rejects(
			() => runner.runWorker({
				runId: "run_route_fail", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
				attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
			}),
			{ message: "session init failed" },
		);

		assert.equal(routeCalls.length, 2);
		assert.equal(routeCalls[0]!.browserId, "work-01");
		assert.equal(routeCalls[1]!.scope, routeCalls[0]!.scope);
		assert.equal(routeCalls[1]!.browserId, undefined);
		assert.deepEqual(cleanupCalls, [
			{ scope: routeCalls[0]!.scope, options: { browserId: "work-01" } },
		]);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runWorker returns profile and browser runtime context", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory } = makeCapturingSessionFactory(["done"]);
		const resolver = makeFakeProfileResolver({
			missing_worker: {
				profileId: "main",
				fallbackUsed: true,
				fallbackReason: "profile_not_found",
				defaultBrowserId: "chrome-main",
			},
		});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "missing_worker", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
			defaultBrowserId: "fallback_browser",
		});

		const out = await runner.runWorker({
			runId: "run_ctx_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(out.runtimeContext?.requestedProfileId, "missing_worker");
		assert.equal(out.runtimeContext?.resolvedProfileId, "main");
		assert.equal(out.runtimeContext?.fallbackUsed, true);
		assert.equal(out.runtimeContext?.fallbackReason, "profile_not_found");
		assert.equal(out.runtimeContext?.browserId, "chrome-main");
		assert.equal(out.runtimeContext?.browserScope, "chrome-main-team-run_ctx_1-worker-att_1-main");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});


// ── P17: multi-role browser binding coverage ──

test("P17: each role resolves its own profile and gets its own browserId", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p17-multi-"));
	try {
		const responses = [
			"worker output",
			'{"verdict":"pass","reason":"ok","resultContent":"ok"}',
			'{"decision":"accept_task","reason":"ok"}',
			"# final report",
		];
		const { factory, captured } = makeCapturingSessionFactory(responses);
		const resolver = makeFakeProfileResolver({
			"p-worker": { defaultBrowserId: "browser-worker" },
			"p-checker": { defaultBrowserId: "browser-checker" },
			"p-watcher": { defaultBrowserId: "browser-watcher" },
			"p-finalizer": { defaultBrowserId: "browser-finalizer" },
		});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			profileResolver: resolver as never, sessionFactory: factory,
		});

		// Worker
		const workerOut = await runner.runWorker({
			runId: "run_multi_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});
		assert.equal(workerOut.runtimeContext?.requestedProfileId, "p-worker");
		assert.equal(workerOut.runtimeContext?.browserId, "browser-worker");
		assert.ok(workerOut.runtimeContext?.browserScope?.includes("worker"));

		// Checker
		const checkerOut = await runner.runChecker({
			runId: "run_multi_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "output/w1.md", acceptanceRules: ["r1"],
		});
		assert.equal(checkerOut.runtimeContext?.requestedProfileId, "p-checker");
		assert.equal(checkerOut.runtimeContext?.browserId, "browser-checker");
		assert.ok(checkerOut.runtimeContext?.browserScope?.includes("checker"));

		// Watcher
		const watcherOut = await runner.runWatcher({
			runId: "run_multi_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workUnitStatus: "passed", resultRef: "r.md", errorSummary: null,
		});
		assert.equal(watcherOut.runtimeContext?.requestedProfileId, "p-watcher");
		assert.equal(watcherOut.runtimeContext?.browserId, "browser-watcher");
		assert.ok(watcherOut.runtimeContext?.browserScope?.includes("watcher"));

		// Finalizer
		const finalizerOut = await runner.runFinalizer({
			runId: "run_multi_1",
			plan: {
				schemaVersion: "team/plan-1", planId: "plan_1", title: "t",
				defaultTeamUnitId: "tu_1", goal: { text: "g" },
				tasks: [{ id: "task_1", title: "t1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
				outputContract: { text: "out" }, runCount: 0, archived: false,
				createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
			},
			taskResults: [{ taskId: "task_1", status: "succeeded", resultRef: "r.md", errorSummary: null }],
		});
		assert.equal(finalizerOut.runtimeContext?.requestedProfileId, "p-finalizer");
		assert.equal(finalizerOut.runtimeContext?.browserId, "browser-finalizer");
		assert.ok(finalizerOut.runtimeContext?.browserScope?.includes("finalizer"));

		// Prove all 4 sessions got different browser IDs
		assert.equal(captured.length, 4);
		const browserIds = captured.map(c => c.browserId);
		assert.deepEqual(browserIds, ["browser-worker", "browser-checker", "browser-watcher", "browser-finalizer"]);

		// Prove all 4 scopes are unique (no scope collapse)
		const scopes = captured.map(c => c.browserScope);
		const uniqueScopes = new Set(scopes);
		assert.equal(uniqueScopes.size, 4, "each role must get a unique browser scope");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("P17: all roles falling back to shared browser must not collapse scopes", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p17-nocollapse-"));
	try {
		const responses = [
			"worker out", '{"verdict":"pass","reason":"ok"}',
			'{"decision":"accept_task","reason":"ok"}', "# report",
		];
		const { factory, captured } = makeCapturingSessionFactory(responses);
		const resolver = makeFakeProfileResolver({
			"p-worker": { defaultBrowserId: "shared-chrome" },
			"p-checker": { defaultBrowserId: "shared-chrome" },
			"p-watcher": { defaultBrowserId: "shared-chrome" },
			"p-finalizer": { defaultBrowserId: "shared-chrome" },
		});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			profileResolver: resolver as never, sessionFactory: factory,
		});

		await runner.runWorker({
			runId: "run_nocollapse", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});
		await runner.runChecker({
			runId: "run_nocollapse", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "w.md", acceptanceRules: ["r1"],
		});
		await runner.runWatcher({
			runId: "run_nocollapse", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workUnitStatus: "passed", resultRef: null, errorSummary: null,
		});
		await runner.runFinalizer({
			runId: "run_nocollapse",
			plan: {
				schemaVersion: "team/plan-1", planId: "p", title: "t",
				defaultTeamUnitId: "tu", goal: { text: "g" },
				tasks: [{ id: "task_1", title: "t1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
				outputContract: { text: "out" }, runCount: 0, archived: false,
				createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
			},
			taskResults: [{ taskId: "task_1", status: "succeeded", resultRef: "r.md", errorSummary: null }],
		});

		assert.equal(captured.length, 4);
		for (const c of captured) {
			assert.equal(c.browserId, "shared-chrome");
		}
		const scopes = captured.map(c => c.browserScope);
		const uniqueScopes = new Set(scopes);
		assert.equal(uniqueScopes.size, 4, "scopes must remain role-specific even with shared browserId");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("P17: route setup/cleanup/clear use matching scope and browserId per role", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p17-routes-"));
	try {
		const responses = [
			"worker out", '{"verdict":"pass","reason":"ok"}',
			'{"decision":"accept_task","reason":"ok"}', "# report",
		];
		const { factory, captured } = makeCapturingSessionFactory(responses);
		const resolver = makeFakeProfileResolver({
			"p-worker": { defaultBrowserId: "bw" },
			"p-checker": { defaultBrowserId: "bc" },
			"p-watcher": { defaultBrowserId: "bwa" },
			"p-finalizer": { defaultBrowserId: "bf" },
		});

		const routeCalls: CapturedRouteCall[] = [];
		const cleanupCalls: CapturedCleanupCall[] = [];

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			profileResolver: resolver as never, sessionFactory: factory,
			setBrowserScopeRoute: async (scope, browserId) => { routeCalls.push({ scope, browserId }); },
			closeBrowserTargetsForScope: async (scope, options) => { cleanupCalls.push({ scope, options }); },
		});

		await runner.runWorker({
			runId: "run_route_multi", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});
		await runner.runChecker({
			runId: "run_route_multi", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "w.md", acceptanceRules: ["r1"],
		});
		await runner.runWatcher({
			runId: "run_route_multi", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workUnitStatus: "passed", resultRef: null, errorSummary: null,
		});
		await runner.runFinalizer({
			runId: "run_route_multi",
			plan: {
				schemaVersion: "team/plan-1", planId: "p", title: "t",
				defaultTeamUnitId: "tu", goal: { text: "g" },
				tasks: [{ id: "task_1", title: "t1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
				outputContract: { text: "out" }, runCount: 0, archived: false,
				createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
			},
			taskResults: [{ taskId: "task_1", status: "succeeded", resultRef: "r.md", errorSummary: null }],
		});

		assert.equal(routeCalls.length, 8);
		assert.equal(cleanupCalls.length, 4);

		for (let i = 0; i < 4; i++) {
			const setup = routeCalls[i * 2]!;
			const clear = routeCalls[i * 2 + 1]!;
			const cleanup = cleanupCalls[i]!;
			assert.equal(setup.scope, clear.scope, "role " + i + ": setup and clear must use same scope");
			assert.equal(setup.scope, cleanup.scope, "role " + i + ": setup and cleanup must use same scope");
			assert.equal(setup.browserId, cleanup.options?.browserId, "role " + i + ": setup browserId must match cleanup");
			assert.equal(clear.browserId, undefined, "role " + i + ": clear must set browserId to undefined");
		}

		assert.equal(routeCalls[0]!.browserId, "bw");
		assert.equal(routeCalls[2]!.browserId, "bc");
		assert.equal(routeCalls[4]!.browserId, "bwa");
		assert.equal(routeCalls[6]!.browserId, "bf");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("P17: worker and checker with different browserId must not silently share", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p17-mainfail-"));
	try {
		const responses = ["w out", '{"verdict":"pass","reason":"ok"}'];
		const { factory, captured } = makeCapturingSessionFactory(responses);
		const resolver = makeFakeProfileResolver({
			"p-worker": { defaultBrowserId: "dedicated-browser" },
			"p-checker": {},
		});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			profileResolver: resolver as never, sessionFactory: factory,
		});

		await runner.runWorker({
			runId: "run_fail_main", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});
		await runner.runChecker({
			runId: "run_fail_main", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "w.md", acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 2);
		assert.equal(captured[0]!.browserId, "dedicated-browser");
		assert.equal(captured[1]!.browserId, undefined);
		assert.notEqual(captured[0]!.browserId, captured[1]!.browserId,
			"worker and checker must not silently share browserId");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

// ── Discovery dispatcher runner ──

test("runDiscoveryDispatcher uses dispatcherProfileId and discovery-dispatcher scope with sanitized item key", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dispatcher-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory([makeDiscoveryDispatchOutputJson("vendor/slash")]);
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

test("runDiscoveryDispatcher prompt includes discovery dispatch context and exact item payload", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dispatcher-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: makeDiscoveryDispatchOutputJson() }], stopReason: "end_turn" }],
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
		assert.ok(capturedPrompt.includes("workerAgentId") && capturedPrompt.includes("generatedSource"), "prompt must include forbidden output fields");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runDiscoveryDispatcher returns valid parsed output plus runtime context", async () => {
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
			sessionFactory: makeFakeSessionFactory([makeDiscoveryDispatchOutputJson()]),
		});

		const out = await runner.runDiscoveryDispatcher(makeDiscoveryDispatchInput());

		assert.equal(out.ok, true);
		if (out.ok) {
			assert.equal(out.itemId, "vendor_1");
			assert.equal(out.workUnit.title, "Assess Acme Sensors");
		}
		assert.equal(out.runtimeContext?.requestedProfileId, "p-dispatcher");
		assert.equal(out.runtimeContext?.browserId, "browser-dispatcher");
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
			sessionFactory: makeFakeSessionFactory(["not json"]),
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
			sessionFactory: makeFakeSessionFactory([makeDiscoveryDispatchOutputJson()]),
		});
		const workerFallback = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			workerProfileId: "p-worker",
			checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher",
			finalizerProfileId: "p-finalizer",
			profileResolver: profileResolver as never,
			sessionFactory: makeFakeSessionFactory([makeDiscoveryDispatchOutputJson()]),
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


// ── P25 Task 1: authoritative run summary in finalizer prompt ──

test("P25: finalizer prompt includes authoritative run summary and previous error audit", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p25-t1-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: "report" }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});

		await runner.runFinalizer({
			runId: "run_p25_auth",
			plan: {
				schemaVersion: "team/plan-1", planId: "plan_1", title: "P25 auth",
				defaultTeamUnitId: "tu_1", goal: { text: "Medtrum investigation" },
				tasks: [
					{ id: "t_ok", title: "OK task", input: { text: "do" }, acceptance: { rules: ["r"] } },
					{ id: "t_skip", title: "Skipped task", input: { text: "do" }, acceptance: { rules: ["r"] } },
					{ id: "t_fail", title: "Failed task", input: { text: "do" }, acceptance: { rules: ["r"] } },
				],
				outputContract: { text: "output" }, runCount: 0, archived: false,
				createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
			},
			runSummary: { totalTasks: 3, succeededTasks: 1, failedTasks: 1, cancelledTasks: 0, skippedTasks: 1 },
			taskResults: [
				{ taskId: "t_ok", status: "succeeded", resultRef: null, errorSummary: null },
				{ taskId: "t_skip", status: "skipped", resultRef: null, errorSummary: null, previousErrorSummary: "worker timeout" },
				{ taskId: "t_fail", status: "failed", resultRef: null, errorSummary: "some error" },
			],
		});

		// 1. Authoritative summary with exact counts
		assert.ok(capturedPrompt.includes("总任务数：3"), "prompt must include totalTasks=3");
		assert.match(capturedPrompt, /成功：1/, "prompt must include succeededTasks=1");
		assert.match(capturedPrompt, /跳过：1/, "prompt must include skippedTasks=1");
		assert.match(capturedPrompt, /失败：1/, "prompt must include failedTasks=1");

		// 2. Instruction not to recalculate
		assert.ok(capturedPrompt.includes("不得") && capturedPrompt.includes("重新计算"), "must instruct not to recalculate");

		// 3. Skipped task rendered as 跳过, not 失败
		const tSkipLines = capturedPrompt.split("\n").filter(l => l.includes("t_skip"));
		assert.ok(tSkipLines.length > 0, "prompt must mention t_skip");
		assert.ok(tSkipLines.some(l => l.includes("跳过")), "t_skip must show 跳过");
		assert.ok(tSkipLines.every(l => !l.includes("失败")), "t_skip must NOT show 失败");

		// 4. Previous error labeled as audit context, not current failure
		assert.ok(capturedPrompt.includes("worker timeout"), "previous error must be preserved for audit");
		assert.ok(
			capturedPrompt.includes("历史错误") || capturedPrompt.includes("原始错误"),
			"previous error must be labeled as history/audit, not current failure",
		);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

// ── P25 Task 3: limited success stays out of failure summary ──

test("P25: finalizer prompt keeps limited successful task out of failure section", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p25-t3-"));
	try {
		let capturedPrompt = "";
		const resultsDir = join(root, "runs", "run_p25_limited", "results");
		await mkdir(resultsDir, { recursive: true });
		const limitedContent = "# Query Result\n\nThe SecurityTrails API required authentication. Only partial data was available from the public endpoint. Found 3 subdomains instead of expected 15.";
		await writeFile(join(resultsDir, "accepted-limited.md"), limitedContent, "utf8");

		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: "report" }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never, sessionFactory,
		});

		await runner.runFinalizer({
			runId: "run_p25_limited",
			plan: {
				schemaVersion: "team/plan-1", planId: "plan_1", title: "P25 limited",
				defaultTeamUnitId: "tu_1", goal: { text: "Medtrum" },
				tasks: [
					{ id: "t_limited", title: "SecurityTrails query", input: { text: "query subdomains" }, acceptance: { rules: ["r"] } },
					{ id: "t_normal", title: "Normal task", input: { text: "do" }, acceptance: { rules: ["r"] } },
				],
				outputContract: { text: "output" }, runCount: 0, archived: false,
				createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
			},
			runSummary: { totalTasks: 2, succeededTasks: 2, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
			taskResults: [
				{ taskId: "t_limited", status: "succeeded", resultRef: "results/accepted-limited.md", errorSummary: null },
				{ taskId: "t_normal", status: "succeeded", resultRef: null, errorSummary: null },
			],
		});

		// Both tasks must show as 成功
		const tLimitedLines = capturedPrompt.split("\n").filter(l => l.includes("t_limited"));
		assert.ok(tLimitedLines.some(l => l.includes("成功")), "limited task must show 成功");
		assert.ok(tLimitedLines.every(l => !l.includes("失败")), "limited task must NOT show 失败");

		// Summary must show 0 failures
		assert.match(capturedPrompt, /失败：0/, "summary must show failedTasks=0");

		// Prompt must include limitation warning instruction
		assert.ok(
			capturedPrompt.includes("限制与警告") || capturedPrompt.includes("限制"),
			"prompt must include limitations/warnings section instruction",
		);
		assert.ok(
			capturedPrompt.includes("外部数据源限制") || capturedPrompt.includes("部分数据"),
			"prompt must mention external data source limitation guidance",
		);

		// The actual limited content must be present for the finalizer to cite
		assert.ok(capturedPrompt.includes("partial data"), "limited result content must be in prompt");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("P24: finalizer prompt includes skipped distinctly from failed", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-p24-"));
	try {
		let capturedPrompt = "";
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (p: string) => { capturedPrompt = p; },
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: "report" }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory,
		});

		await runner.runFinalizer({
			runId: "run_p24",
			plan: {
				schemaVersion: "team/plan-1",
				planId: "plan_1",
				title: "P24 test",
				defaultTeamUnitId: "tu_1",
				goal: { text: "test" },
				tasks: [
					{ id: "t_ok", title: "OK", input: { text: "do" }, acceptance: { rules: ["r"] } },
					{ id: "t_skip", title: "Skipped", input: { text: "do" }, acceptance: { rules: ["r"] } },
					{ id: "t_fail", title: "Failed", input: { text: "do" }, acceptance: { rules: ["r"] } },
				],
				outputContract: { text: "output" },
				runCount: 0,
				archived: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			taskResults: [
				{ taskId: "t_ok", status: "succeeded", resultRef: null, errorSummary: null },
				{ taskId: "t_skip", status: "skipped", resultRef: null, errorSummary: null },
				{ taskId: "t_fail", status: "failed", resultRef: null, errorSummary: "timeout" },
			],
		});

		assert.ok(capturedPrompt.includes("t_ok: 成功"), "succeeded task shows 成功");
		assert.ok(capturedPrompt.includes("t_skip: 跳过"), "skipped task shows 跳过, not 失败");
		assert.ok(capturedPrompt.includes("t_fail: 失败"), "failed task shows 失败");
		assert.ok(!capturedPrompt.includes("t_skip: 失败"), "skipped must NOT show as 失败");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});
