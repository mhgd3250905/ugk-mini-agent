import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TeamOrchestrator } from "../src/team/orchestrator.js";
import { PlanStore } from "../src/team/plan-store.js";
import { MockRoleRunner } from "../src/team/role-runner.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { TeamUnitStore } from "../src/team/team-unit-store.js";
import type { CheckerInput, CheckerOutput, WatcherInput, WatcherOutput, WorkerInput, WorkerOutput } from "../src/team/role-runner.js";

class HongKongCloudDiscoveryRunner extends MockRoleRunner {
	constructor(
		private readonly root: string,
		private readonly mode: "valid-reference" | "missing-reference" | "invalid-json",
	) {
		super();
	}

	override async runWorker(input: WorkerInput): Promise<WorkerOutput> {
		if (input.task.type === "discovery") {
			if (this.mode !== "missing-reference") {
				const dir = join(this.root, "runs", input.runId, "agent-workspaces", input.attemptId, "worker");
				await mkdir(dir, { recursive: true });
				const payload = this.mode === "invalid-json"
					? { vendorList: [{ id: "vultr", name: "Vultr" }] }
					: { vendors: [{ id: "vultr", name: "Vultr" }, { id: "dmit", name: "DMIT" }] };
				await writeFile(join(dir, "hk-cloud-server-scan.json"), JSON.stringify(payload, null, 2), "utf8");
			}
			return {
				content: [
					"已产出两个文件：",
					"- `hk-cloud-server-scan.json`",
					"- `hk-cloud-server-scan-report.md`",
				].join("\n"),
				artifactRefs: [],
			};
		}
		return { content: `已完成 ${input.task.id}`, artifactRefs: [] };
	}

	override async runChecker(input: CheckerInput): Promise<CheckerOutput> {
		if (input.task.type === "discovery") {
			return {
				verdict: "pass",
				reason: "验收通过",
				resultContent: "验收通过。JSON 数据文件：worker/hk-cloud-server-scan.json（10 家厂商完整结构化数据）",
			};
		}
		return { verdict: "pass", reason: "ok", resultContent: "accepted result" };
	}

	override async runWatcher(input: WatcherInput): Promise<WatcherOutput> {
		return input.workUnitStatus === "failed"
			? { decision: "confirm_failed", reason: "runtime validation failed" }
			: { decision: "accept_task", reason: "ok" };
	}
}

async function setupIncidentPlan(mode: "valid-reference" | "missing-reference" | "invalid-json") {
	const root = await mkdtemp(join(tmpdir(), "team-p26-incident-"));
	const planStore = new PlanStore(root);
	const unitStore = new TeamUnitStore(root);
	const workspace = new RunWorkspace(root);
	const runner = new HongKongCloudDiscoveryRunner(root, mode);
	const unit = await unitStore.create({
		title: "hk cloud research",
		description: "incident regression",
		workerProfileId: "worker",
		checkerProfileId: "checker",
		watcherProfileId: "watcher",
		finalizerProfileId: "finalizer",
	});
	const plan = await planStore.create({
		title: "香港云服务器性价比调研",
		defaultTeamUnitId: unit.teamUnitId,
		goal: { text: "调研香港云服务器性价比" },
		tasks: [
			{
				id: "scan_vendors",
				type: "discovery",
				title: "扫描候选厂商",
				input: { text: "输出 vendors 数组" },
				acceptance: { rules: ["vendors contains stable ids"] },
				discovery: { outputKey: "vendors" },
			},
			{
				id: "evaluate_each",
				type: "for_each",
				title: "逐个评估厂商",
				input: { text: "evaluate" },
				acceptance: { rules: ["ok"] },
				forEach: {
					itemsFrom: "scan_vendors.vendors",
					mode: "sequential",
					taskTemplate: {
						title: "评估 {{item.name}}",
						input: { text: "评估 {{item.id}}" },
						acceptance: { rules: ["must mention {{item.id}}"] },
					},
				},
			},
		],
		outputContract: { text: "最终报告" },
	});
	const orchestrator = new TeamOrchestrator({
		planStore,
		teamUnitStore: unitStore,
		workspace,
		roleRunner: runner,
		dataDir: root,
		maxCheckerRevisions: 1,
		maxWatcherRevisions: 1,
		maxRunDurationMinutes: 60,
	});
	return { root, plan, orchestrator, workspace };
}

test("P26: run_943b995d6adc shape resolves worker role workspace reference and expands evaluate_each", async () => {
	const { root, plan, orchestrator, workspace } = await setupIncidentPlan("valid-reference");
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates["scan_vendors"]?.status, "succeeded");
		assert.equal(final.taskStates["evaluate_each"]?.status, "succeeded");
		assert.equal(final.taskStates["evaluate_each__vultr"]?.status, "succeeded");
		assert.equal(final.taskStates["evaluate_each__dmit"]?.status, "succeeded");

		const scanAttemptId = final.taskStates["scan_vendors"]?.activeAttemptId;
		assert.ok(scanAttemptId);
		const discovery = await workspace.readDiscoveryResult(state.runId, "scan_vendors", scanAttemptId);
		assert.equal(discovery?.outputKey, "vendors");
		assert.deepEqual(discovery?.items.map(item => item.id), ["vultr", "dmit"]);
		assert.equal(discovery?.sourceRef, "worker/hk-cloud-server-scan.json");

		const expansion = await workspace.readExpansion(state.runId, "evaluate_each");
		assert.deepEqual(expansion?.children.map(child => child.taskId), ["evaluate_each__vultr", "evaluate_each__dmit"]);
	} finally {
		await rm(root, { recursive: true });
	}
});

for (const [mode, expectedMessage] of [
	["missing-reference", /referenced file not found: worker\/hk-cloud-server-scan\.json/],
	["invalid-json", /missing or non-array outputKey 'vendors'/],
] as const) {
	test(`P26: ${mode} discovery reference is blocked before checker pass can expand for_each`, async () => {
		const { root, plan, orchestrator, workspace } = await setupIncidentPlan(mode);
		try {
			const state = await orchestrator.createRun(plan.planId);
			const final = await orchestrator.runToCompletion(state.runId);

			assert.equal(final.taskStates["scan_vendors"]?.status, "failed");
			assert.match(final.taskStates["scan_vendors"]?.errorSummary ?? "", expectedMessage);
			assert.equal(final.taskStates["evaluate_each"]?.status, "failed");
			assert.equal(final.taskStates["evaluate_each__vultr"], undefined);
			assert.equal(await workspace.readExpansion(state.runId, "evaluate_each"), null);
		} finally {
			await rm(root, { recursive: true });
		}
	});
}
