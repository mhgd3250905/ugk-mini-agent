import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../src/team/task-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { CanvasTaskRunService } from "../src/team/task-run-service.js";
import {
	DiscoveryAcceptedNoDispatcherRunner,
	DiscoveryDispatchingRunner,
	removeTempRoot,
	validDiscoverySpec,
	validTaskInput,
	waitForAttemptDiscoveryDispatch,
	waitForAttemptDiscoveryGeneratedRuns,
	waitForTerminalRun,
} from "./team-task-run-process-helpers.js";

test("Step06: Discovery rerun reuses managed generated Tasks and marks missing items stale", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-rerun-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
			...validTaskInput,
			title: "发现云服务器供应商",
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
			workUnit: {
				...validTaskInput.workUnit,
				title: "发现云服务器供应商",
				input: { text: "搜索并输出云服务器供应商 JSON。" },
				outputContract: { text: "输出 JSON object，vendors 为数组，每项包含稳定 id。" },
				acceptance: { rules: ["vendors 必须是数组", "每项必须有 id"] },
			},
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const runners = [
			new DiscoveryDispatchingRunner([{ id: "vultr", name: "Vultr" }, { id: "hetzner", name: "Hetzner" }]),
			new DiscoveryDispatchingRunner(
				[{ id: "vultr", name: "Vultr updated" }, { id: "ovh", name: "OVH" }],
				[{
					ok: true,
					itemId: "vultr",
					workUnit: {
						title: "更新核查 Vultr",
						input: { text: "使用最新 Discovery payload 重新核查 Vultr。" },
						outputContract: { text: "输出更新后的 Vultr 报告。" },
						acceptance: { rules: ["必须包含更新后的供应商名称"] },
					},
				}],
			),
		];
		let runnerIndex = 0;
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runners[Math.min(runnerIndex++, runners.length - 1)]!,
			dataDir: join(root, "task-runs"),
		});

		const firstRun = await service.createRun(discovery.taskId);
		await waitForTerminalRun(service, firstRun.runId);
		await waitForAttemptDiscoveryDispatch(workspace, firstRun.runId, discovery.taskId, 2);
		await waitForAttemptDiscoveryGeneratedRuns(workspace, firstRun.runId, discovery.taskId, 2);
		const firstGenerated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		const vultrTaskId = firstGenerated.find(task => task.generatedSource?.sourceItemId === "vultr")!.taskId;
		const hetznerTaskId = firstGenerated.find(task => task.generatedSource?.sourceItemId === "hetzner")!.taskId;

		const secondRun = await service.createRun(discovery.taskId);
		const secondFinished = await waitForTerminalRun(service, secondRun.runId);
		assert.equal(secondFinished.status, "completed");
		const secondDispatch = await waitForAttemptDiscoveryDispatch(workspace, secondRun.runId, discovery.taskId, 3);
		assert.deepEqual(new Set(secondDispatch.map(outcome => outcome.status)), new Set(["updated", "created", "stale_marked"]));

		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		const byItemId = Object.fromEntries(generated.map(task => [task.generatedSource!.sourceItemId, task]));
		assert.equal(byItemId.vultr?.taskId, vultrTaskId);
		assert.equal(byItemId.vultr?.title, "更新核查 Vultr");
		assert.equal(byItemId.vultr?.workUnit.input.text, "使用最新 Discovery payload 重新核查 Vultr。");
		assert.deepEqual(byItemId.vultr?.generatedSource?.itemPayload, { id: "vultr", name: "Vultr updated" });
		assert.equal(byItemId.vultr?.generatedSource?.latestDiscoveryRunId, secondRun.runId);
		assert.equal(byItemId.vultr?.generatedSource?.itemStatus, "active");
		assert.equal(byItemId.hetzner?.taskId, hetznerTaskId);
		assert.equal(byItemId.hetzner?.generatedSource?.itemStatus, "stale");
		assert.equal(byItemId.hetzner?.archived, false);
		assert.equal(byItemId.ovh?.generatedSource?.itemStatus, "active");
		await waitForAttemptDiscoveryGeneratedRuns(workspace, secondRun.runId, discovery.taskId, 2);
		for (const task of generated) {
			for (const run of await service.listRuns(task.taskId)) {
				await waitForTerminalRun(service, run.runId);
			}
		}
	} finally {
		await removeTempRoot(root);
	}
});

test("Step06: customized generated WorkUnit is protected on Discovery rerun", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-customized-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
			...validTaskInput,
			title: "发现云服务器供应商",
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
			workUnit: {
				...validTaskInput.workUnit,
				title: "发现云服务器供应商",
				input: { text: "搜索并输出云服务器供应商 JSON。" },
				outputContract: { text: "输出 JSON object，vendors 为数组，每项包含稳定 id。" },
				acceptance: { rules: ["vendors 必须是数组", "每项必须有 id"] },
			},
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const runners = [
			new DiscoveryDispatchingRunner([{ id: "vultr", name: "Vultr" }]),
			new DiscoveryDispatchingRunner(
				[{ id: "vultr", name: "Vultr rerun" }],
				[{
					ok: true,
					itemId: "vultr",
					workUnit: {
						title: "派发器新 Vultr 标题",
						input: { text: "派发器新输入。" },
						outputContract: { text: "派发器新输出。" },
						acceptance: { rules: ["派发器新规则"] },
					},
				}],
			),
		];
		let runnerIndex = 0;
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runners[Math.min(runnerIndex++, runners.length - 1)]!,
			dataDir: join(root, "task-runs"),
		});

		const firstRun = await service.createRun(discovery.taskId);
		await waitForTerminalRun(service, firstRun.runId);
		await waitForAttemptDiscoveryDispatch(workspace, firstRun.runId, discovery.taskId);
		await waitForAttemptDiscoveryGeneratedRuns(workspace, firstRun.runId, discovery.taskId);
		const generated = (await taskStore.listGeneratedForDiscoveryTask(discovery.taskId))[0]!;
		await taskStore.update(generated.taskId, {
			title: "用户保留标题",
			workUnit: {
				...generated.workUnit,
				title: "用户保留 WorkUnit",
				input: { text: "用户保留输入。" },
				outputContract: { text: "用户保留输出。" },
				acceptance: { rules: ["用户保留规则"] },
			},
		});

		const secondRun = await service.createRun(discovery.taskId);
		await waitForTerminalRun(service, secondRun.runId);
		const dispatch = await waitForAttemptDiscoveryDispatch(workspace, secondRun.runId, discovery.taskId);
		assert.equal(dispatch[0]!.status, "updated");
		assert.equal(dispatch[0]!.workUnitMode, "customized");

		const reused = await taskStore.get(generated.taskId);
		assert.equal(reused?.title, "用户保留标题");
		assert.equal(reused?.workUnit.title, "用户保留 WorkUnit");
		assert.equal(reused?.workUnit.input.text, "用户保留输入。");
		assert.equal(reused?.workUnit.outputContract.text, "用户保留输出。");
		assert.deepEqual(reused?.workUnit.acceptance.rules, ["用户保留规则"]);
		assert.deepEqual(reused?.generatedSource?.itemPayload, { id: "vultr", name: "Vultr rerun" });
		assert.equal(reused?.generatedSource?.latestDiscoveryRunId, secondRun.runId);
		assert.equal(reused?.generatedSource?.workUnitMode, "customized");
		await waitForAttemptDiscoveryGeneratedRuns(workspace, secondRun.runId, discovery.taskId);
		for (const run of await service.listRuns(generated.taskId)) {
			await waitForTerminalRun(service, run.runId);
		}
	} finally {
		await removeTempRoot(root);
	}
});

test("Step06: invalid dispatcher output blocks only that item and keeps Discovery run completed", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-blocked-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
			...validTaskInput,
			title: "发现云服务器供应商",
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
			workUnit: {
				...validTaskInput.workUnit,
				title: "发现云服务器供应商",
				input: { text: "搜索并输出云服务器供应商 JSON。" },
				outputContract: { text: "输出 JSON object，vendors 为数组，每项包含稳定 id。" },
				acceptance: { rules: ["vendors 必须是数组", "每项必须有 id"] },
			},
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const runner = new DiscoveryDispatchingRunner(
			[{ id: "broken", name: "Broken" }, { id: "vultr", name: "Vultr" }],
			[
				{ ok: false, itemId: "broken", error: "discovery dispatcher output parse error: invalid JSON" },
				{
					ok: true,
					itemId: "vultr",
					workUnit: {
						title: "核查 Vultr",
						input: { text: "核查 Vultr。" },
						outputContract: { text: "输出 Vultr 报告。" },
						acceptance: { rules: ["包含 Vultr"] },
					},
				},
			],
		);
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(discovery.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		const dispatch = await waitForAttemptDiscoveryDispatch(workspace, created.runId, discovery.taskId, 2);
		const byItemId = Object.fromEntries(dispatch.map(outcome => [outcome.itemId, outcome]));
		assert.equal(byItemId.broken?.status, "blocked");
		assert.match(byItemId.broken?.error ?? "", /invalid JSON/);
		assert.equal(byItemId.vultr?.status, "created");

		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		assert.deepEqual(generated.map(task => task.generatedSource?.sourceItemId), ["vultr"]);
		await waitForAttemptDiscoveryGeneratedRuns(workspace, created.runId, discovery.taskId);
		for (const run of await service.listRuns(generated[0]!.taskId)) {
			await waitForTerminalRun(service, run.runId);
		}
	} finally {
		await removeTempRoot(root);
	}
});

test("Step06: missing runDiscoveryDispatcher support records blocked outcomes without failing Discovery run", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-no-dispatcher-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
			...validTaskInput,
			title: "发现云服务器供应商",
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
			workUnit: {
				...validTaskInput.workUnit,
				title: "发现云服务器供应商",
				input: { text: "搜索并输出云服务器供应商 JSON。" },
				outputContract: { text: "输出 JSON object，vendors 为数组，每项包含稳定 id。" },
				acceptance: { rules: ["vendors 必须是数组", "每项必须有 id"] },
			},
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new DiscoveryAcceptedNoDispatcherRunner([{ id: "vultr" }, { id: "hetzner" }]),
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(discovery.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		const dispatch = await waitForAttemptDiscoveryDispatch(workspace, created.runId, discovery.taskId, 2);
		assert.deepEqual(dispatch.map(outcome => outcome.status), ["blocked", "blocked"]);
		assert.ok(dispatch.every(outcome => /runDiscoveryDispatcher/.test(outcome.error ?? "")));
		assert.deepEqual(await taskStore.listGeneratedForDiscoveryTask(discovery.taskId), []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
