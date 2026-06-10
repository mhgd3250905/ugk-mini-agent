import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentProfileRoleRunner } from "../src/team/agent-profile-role-runner.js";
import type { TeamRoleRunner } from "../src/team/role-runner.js";
import type { BackgroundAgentSessionFactory } from "../src/agent/background-agent-runner.js";
import type { ResolvedBackgroundAgentSnapshot } from "../src/agent/background-agent-profile.js";
import { getCurrentBackgroundWorkspaceEnvironment } from "../src/agent/background-workspace-context.js";
import {
	type CapturedCleanupCall,
	type CapturedRouteCall,
	fakeProfileResolver,
	makeCapturingSessionFactory,
	makeFakeProfileResolver,
	makeFakeSessionFactory,
} from "./team-agent-profile-runner-helpers.js";

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

test("AgentProfileRoleRunner exposes Team artifact public directory and URL to worker sessions", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-artifact-public-"));
	try {
		let capturedPrompt = "";
		let capturedEnv: Record<string, string | undefined> = {};
		const sessionFactory = {
			createSession: async () => ({
				prompt: async (prompt: string) => {
					capturedPrompt = prompt;
					capturedEnv = getCurrentBackgroundWorkspaceEnvironment();
				},
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "end_turn" }],
			}),
		} as unknown as BackgroundAgentSessionFactory;
		const runner: TeamRoleRunner = new AgentProfileRoleRunner({
			projectRoot: root,
			teamDataDir: root,
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			profileResolver: fakeProfileResolver as never,
			sessionFactory,
		});

		await runner.runWorker({
			runId: "run_public_artifact",
			task: { id: "task_1", title: "公开报告", input: { text: "生成报告" }, acceptance: { rules: ["生成 HTML"] } },
			attemptId: "attempt_public",
			workDir: join(root, "work"),
			outputDir: join(root, "output"),
			artifactPublicBaseUrl: "http://example.test/v1/team/task-runs/run_public_artifact/artifacts/attempt_public/worker",
			acceptanceRules: ["生成 HTML"],
		});

		assert.ok(capturedPrompt.includes("ARTIFACT_PUBLIC_DIR"), "worker prompt must mention official artifact directory");
		assert.match(capturedEnv.ARTIFACT_PUBLIC_DIR ?? "", /agent-workspaces[\\/]+attempt_public[\\/]+worker[\\/]+output$/);
		assert.equal(
			capturedEnv.ARTIFACT_PUBLIC_BASE_URL,
			"http://example.test/v1/team/task-runs/run_public_artifact/artifacts/attempt_public/worker",
		);
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
