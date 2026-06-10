import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentProfileRoleRunner } from "../src/team/agent-profile-role-runner.js";
import type { BackgroundAgentSessionFactory } from "../src/agent/background-agent-runner.js";
import { fakeProfileResolver } from "./team-agent-profile-runner-helpers.js";

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
