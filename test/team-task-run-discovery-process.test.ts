import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../src/team/task-store.js";
import { TaskConnectionStore } from "../src/team/task-connection-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { CanvasTaskRunService } from "../src/team/task-run-service.js";
import { DiscoveryChannelSetStore } from "../src/team/discovery-channel-set-store.js";
import type {
	CheckerInput,
	CheckerOutput,
	DiscoveryDispatchInput,
	DiscoveryDispatchOutput,
	WorkerInput,
	WorkerOutput,
} from "../src/team/role-runner.js";
import type { TeamRunState } from "../src/team/types.js";
import {
	DiscoveryDispatchingRunner,
	GatedDiscoveryGeneratedRunner,
	GatedDiscoveryGeneratedWithDownstreamRunner,
	ProcessEventRoleRunner,
	StreamingDispatchGatedGeneratedRunner,
	StreamingDispatchGatedGeneratedWithDownstreamRunner,
	delayMs,
	removeTempRoot,
	validDiscoverySpec,
	validTaskInput,
	waitForAttemptDelivery,
	waitForAttemptDiscoveryDispatch,
	waitForAttemptDiscoveryGeneratedRuns,
	waitForDispatchInputs,
	waitForGeneratedWorkerStarts,
	waitForTaskRuns,
	waitForTerminalRun,
} from "./team-task-run-process-helpers.js";

test("Step04: Discovery Canvas Task run writes standard discovery result after accepted output", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create({
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
		let capturedWorkerInput: WorkerInput | undefined;

		class DiscoveryAcceptedRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				capturedWorkerInput = input;
				return { content: "ordinary worker text that old normal tasks would accept", artifactRefs: [] };
			}
			async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
				return {
					verdict: "pass",
					reason: "ok",
					resultContent: JSON.stringify({ vendors: [{ id: "vultr", name: "Vultr" }] }),
				};
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new DiscoveryAcceptedRunner(),
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(task.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		assert.equal(finished.taskStates[task.taskId]?.status, "succeeded");
		assert.equal(capturedWorkerInput?.task.type, "discovery");
		assert.equal(capturedWorkerInput?.task.discovery?.outputKey, "vendors");

		const attempts = await workspace.listAttempts(created.runId, task.taskId);
		assert.equal(attempts.length, 1);
		const attempt = attempts[0]!;
		assert.equal(attempt.resultRef, `tasks/${task.taskId}/attempts/${attempt.attemptId}/accepted-result.md`);
		assert.ok(attempt.files.includes("accepted-result.md"));
		assert.ok(attempt.files.includes("discovery-result.json"));

		const result = await workspace.readDiscoveryResult(created.runId, task.taskId, attempt.attemptId);
		assert.ok(result);
		assert.equal(result.schemaVersion, "team/discovery-result-1");
		assert.equal(result.taskId, task.taskId);
		assert.equal(result.attemptId, attempt.attemptId);
		assert.equal(result.outputKey, "vendors");
		assert.deepEqual(result.items.map(item => item.id), ["vultr"]);
		assert.equal(result.sourceRef, `tasks/${task.taskId}/attempts/${attempt.attemptId}/accepted-result.md`);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Step07: successful Discovery dispatch auto-runs active generated Tasks", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-dispatch-"));
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
		const runner = new DiscoveryDispatchingRunner([
			{ id: "vultr", name: "Vultr", type: "cloud" },
			{ id: "hetzner", name: "Hetzner", type: "cloud" },
		]);
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(discovery.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		assert.equal(finished.taskStates[discovery.taskId]?.status, "succeeded");

		const dispatch = await waitForAttemptDiscoveryDispatch(workspace, created.runId, discovery.taskId, 2);
		assert.ok(runner.profileIdsHistory.some(profiles => profiles.dispatcherProfileId === "main"));
		assert.deepEqual(runner.dispatchInputs.map(input => input.itemId), ["vultr", "hetzner"]);
		assert.equal(runner.dispatchInputs[0]!.discoveryTaskId, discovery.taskId);
		assert.equal(runner.dispatchInputs[0]!.discoveryGoal, validDiscoverySpec.discoveryGoal);
		assert.equal(runner.dispatchInputs[0]!.dispatchGoal, validDiscoverySpec.dispatchGoal);
		assert.equal(runner.dispatchInputs[0]!.generatedWorkerAgentId, "search");
		assert.equal(runner.dispatchInputs[0]!.generatedCheckerAgentId, "main");

		assert.deepEqual(dispatch.map(outcome => outcome.status), ["created", "created"]);
		assert.deepEqual(dispatch.map(outcome => outcome.itemId), ["vultr", "hetzner"]);
		assert.ok(dispatch.every(outcome => outcome.generatedTaskId));
		assert.ok(dispatch.every(outcome => outcome.workUnitMode === "managed"));

		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		assert.equal(generated.length, 2);
		const byItemId = Object.fromEntries(generated.map(task => [task.generatedSource!.sourceItemId, task]));
		for (const itemId of ["vultr", "hetzner"]) {
			const generatedTask = byItemId[itemId]!;
			assert.equal(generatedTask.status, "ready");
			assert.equal(generatedTask.leaderAgentId, "main");
			assert.equal(generatedTask.workUnit.workerAgentId, "search");
			assert.equal(generatedTask.workUnit.checkerAgentId, "main");
			assert.equal(generatedTask.generatedSource?.itemStatus, "active");
			assert.equal(generatedTask.generatedSource?.latestDiscoveryRunId, created.runId);
			assert.ok(generatedTask.generatedSource?.latestDiscoveryAttemptId);
			assert.ok(generatedTask.generatedSource?.latestDiscoveredAt);
			assert.equal(generatedTask.workUnit.title, `核查 ${itemId}`);
		}

		const launchOutcomes = await waitForAttemptDiscoveryGeneratedRuns(workspace, created.runId, discovery.taskId, 2);
		assert.deepEqual(new Set(launchOutcomes.map(outcome => outcome.status)), new Set(["started"]));
		assert.deepEqual(new Set(launchOutcomes.map(outcome => outcome.itemId)), new Set(["vultr", "hetzner"]));
		for (const outcome of launchOutcomes) {
			assert.ok(outcome.generatedRunId);
			const generatedTask = byItemId[outcome.itemId]!;
			assert.equal(outcome.generatedTaskId, generatedTask.taskId);
			const runs = await service.listRuns(generatedTask.taskId);
			assert.equal(runs.length, 1);
			const generatedRun = runs[0]!;
			assert.equal(generatedRun.runId, outcome.generatedRunId);
			await waitForTerminalRun(service, generatedRun.runId);
			assert.equal(generatedRun.source?.type, "canvas-task");
			assert.equal(generatedRun.source?.taskId, generatedTask.taskId);
			assert.equal(generatedRun.source?.triggeredBy?.type, "discovery-generated-task");
			if (generatedRun.source?.triggeredBy?.type === "discovery-generated-task") {
				assert.equal(generatedRun.source.triggeredBy.discoveryTaskId, discovery.taskId);
				assert.equal(generatedRun.source.triggeredBy.discoveryRunId, created.runId);
				assert.equal(generatedRun.source.triggeredBy.discoveryAttemptId, generatedTask.generatedSource?.latestDiscoveryAttemptId);
				assert.equal(generatedRun.source.triggeredBy.sourceItemId, outcome.itemId);
			}
		}
	} finally {
		await removeTempRoot(root);
	}
});

test("Discovery channel set run skips rediscovery and reruns selected generated Tasks", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-channel-set-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const channelSetStore = new DiscoveryChannelSetStore(root, taskStore);
		const discovery = await taskStore.create({
			...validTaskInput,
			title: "发现常用论坛渠道",
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
			workUnit: {
				...validTaskInput.workUnit,
				title: "发现常用论坛渠道",
				input: { text: "搜索并输出论坛渠道 JSON。" },
				outputContract: { text: "输出 JSON object，vendors 为数组，每项包含稳定 id。" },
				acceptance: { rules: ["vendors 必须是数组", "每项必须有 id"] },
			},
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const initialRunner = new DiscoveryDispatchingRunner([
			{ id: "reddit", name: "Reddit", type: "forum" },
			{ id: "github", name: "GitHub", type: "repo" },
		]);
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => initialRunner,
			discoveryChannelSetStore: channelSetStore,
			dataDir: join(root, "task-runs"),
		});

		const firstRun = await service.createRun(discovery.taskId);
		await waitForTerminalRun(service, firstRun.runId);
		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		const redditTask = generated.find(task => task.generatedSource?.sourceItemId === "reddit")!;
		const githubTask = generated.find(task => task.generatedSource?.sourceItemId === "github")!;
		assert.ok(redditTask);
		assert.ok(githubTask);

		const channelSet = await channelSetStore.create(discovery.taskId, {
			title: "常用论坛渠道",
			generatedTaskIds: [redditTask.taskId],
		});
		const channelRunner = new DiscoveryDispatchingRunner([
			{ id: "should-not-be-used", name: "Should not be used" },
		]);
		const channelService = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => channelRunner,
			discoveryChannelSetStore: channelSetStore,
			dataDir: join(root, "task-runs"),
		});

		const channelRun = await channelService.createRun(discovery.taskId, { discoveryChannelSetId: channelSet.channelSetId });
		const finished = await waitForTerminalRun(channelService, channelRun.runId);
		assert.equal(finished.status, "completed");
		assert.equal(finished.source?.taskId, discovery.taskId);
		assert.equal(finished.source?.discoveryChannelSetId, channelSet.channelSetId);
		assert.deepEqual(channelRunner.dispatchInputs, [], "channel-set run must not call the Discovery dispatcher");

		const attempts = await workspace.listAttempts(channelRun.runId, discovery.taskId);
		const attempt = attempts[0]!;
		const discoveryResult = await workspace.readDiscoveryResult(channelRun.runId, discovery.taskId, attempt.attemptId);
		assert.ok(discoveryResult);
		assert.equal(discoveryResult.sourceRef, null);
		assert.deepEqual(discoveryResult.items.map(item => item.id), ["reddit"]);

		const dispatch = await waitForAttemptDiscoveryDispatch(workspace, channelRun.runId, discovery.taskId, 1);
		assert.deepEqual(dispatch.map(outcome => outcome.itemId), ["reddit"]);
		assert.deepEqual(dispatch.map(outcome => outcome.generatedTaskId), [redditTask.taskId]);

		const generatedLaunches = await waitForAttemptDiscoveryGeneratedRuns(workspace, channelRun.runId, discovery.taskId, 1);
		assert.equal(generatedLaunches.length, 1);
		assert.equal(generatedLaunches[0]?.itemId, "reddit");
		assert.equal(generatedLaunches[0]?.generatedTaskId, redditTask.taskId);
		assert.equal(generatedLaunches[0]?.status, "started");

		const redditRuns = await channelService.listRuns(redditTask.taskId);
		const githubRuns = await channelService.listRuns(githubTask.taskId);
		assert.equal(redditRuns.length, 2, "selected generated Task should be rerun");
		assert.equal(githubRuns.length, 1, "unselected generated Task should not be rerun");

		const aggregation = await workspace.readDiscoveryAggregation(channelRun.runId, discovery.taskId, attempt.attemptId);
		assert.ok(aggregation);
		assert.deepEqual(aggregation.summary, {
			totalItems: 1,
			generatedTasks: 1,
			succeeded: 1,
			failed: 0,
			cancelled: 0,
			skipped: 0,
			missingResult: 0,
		});
		assert.deepEqual(aggregation.items.map(item => item.itemId), ["reddit"]);
		assert.equal(aggregation.items[0]?.generatedTaskId, redditTask.taskId);
		assert.equal(aggregation.items[0]?.result.status, "succeeded");
	} finally {
		await removeTempRoot(root);
	}
});

test("Discovery dispatch starts generated auto-run before all items finish dispatching", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-streaming-dispatch-"));
	const runner = new StreamingDispatchGatedGeneratedRunner([
		{ id: "vultr" },
		{ id: "hetzner" },
		{ id: "ovh" },
		{ id: "linode" },
	]);
	let service: CanvasTaskRunService | undefined;
	let created: TeamRunState | undefined;
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
		service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});

		created = await service.createRun(discovery.taskId);
		await waitForDispatchInputs(runner, 2);
		await delayMs(150);

		assert.equal(runner.dispatchInputs[1]?.itemId, "hetzner");
		assert.equal(runner.maxActiveDispatchers, 1, "dispatcher producer must stay single-lane");
		assert.equal(runner.generatedWorkerStarts.length, 1, "first generated child should start while second item is still dispatching");
		assert.equal(runner.maxActiveGeneratedWorkers, 1);

		const attempts = await workspace.listAttempts(created.runId, discovery.taskId);
		assert.ok((attempts[0]?.discoveryDispatch?.length ?? 0) >= 1, "dispatch progress should be recorded before all items finish dispatching");

		runner.releaseDispatchGate();
		for (let i = 0; i < 40; i++) {
			for (const release of runner.releaseGeneratedWorkers.splice(0)) release();
			const latest = await service.getRun(created.runId);
			if (latest && ["completed", "completed_with_failures", "failed", "cancelled"].includes(latest.status)) break;
			await delayMs(25);
		}
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
	} finally {
		runner.releaseDispatchGate();
		for (let i = 0; i < 20; i++) {
			for (const release of runner.releaseGeneratedWorkers.splice(0)) release();
			if (service && created) {
				const latest = await service.getRun(created.runId).catch(() => null);
				if (latest && ["completed", "completed_with_failures", "failed", "cancelled"].includes(latest.status)) break;
			}
			await delayMs(25);
		}
		if (service && created) await waitForTerminalRun(service, created.runId).catch(() => {});
		await removeTempRoot(root);
	}
});

test("Step07: auto-run enforces concurrency 3", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-autorun-concurrency-"));
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
		const runner = new GatedDiscoveryGeneratedRunner([
			{ id: "vultr" },
			{ id: "hetzner" },
			{ id: "ovh" },
			{ id: "linode" },
		]);
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(discovery.taskId);
		await waitForAttemptDiscoveryDispatch(workspace, created.runId, discovery.taskId, 4);
		await waitForGeneratedWorkerStarts(runner, 3);
		const waitingParent = await service.getRun(created.runId);
		assert.equal(waitingParent?.status, "running");
		assert.equal(waitingParent?.taskStates[discovery.taskId]?.status, "running");
		assert.equal(runner.generatedWorkerStarts.length, 3);
		assert.equal(runner.activeGeneratedWorkers, 3);
		assert.equal(runner.maxActiveGeneratedWorkers, 3);

		runner.releaseGeneratedWorkers[0]!();
		await waitForGeneratedWorkerStarts(runner, 4);
		assert.equal(runner.maxActiveGeneratedWorkers, 3);
		for (const release of runner.releaseGeneratedWorkers.slice(1)) release();

		const launchOutcomes = await waitForAttemptDiscoveryGeneratedRuns(workspace, created.runId, discovery.taskId, 4);
		assert.deepEqual(new Set(launchOutcomes.map(outcome => outcome.status)), new Set(["started"]));
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		for (const task of generated) {
			const runs = await service.listRuns(task.taskId);
			assert.equal(runs.length, 1);
			const terminal = await waitForTerminalRun(service, runs[0]!.runId);
			assert.equal(terminal.status, "completed");
		}
		assert.equal(runner.maxActiveGeneratedWorkers, 3);
	} finally {
		await removeTempRoot(root);
	}
});

test("Discovery root cancel during streaming dispatch cancels active generated run and stops later launches", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-streaming-cancel-"));
	const runner = new StreamingDispatchGatedGeneratedRunner([
		{ id: "vultr" },
		{ id: "hetzner" },
		{ id: "ovh" },
		{ id: "linode" },
	]);
	let service: CanvasTaskRunService | undefined;
	let created: TeamRunState | undefined;
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
		service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});
		const runService = service;

		created = await runService.createRun(discovery.taskId);
		await waitForDispatchInputs(runner, 2);
		await waitForGeneratedWorkerStarts(runner, 1);

		const cancelled = await runService.cancelRun(created.runId, "user cancel");
		assert.equal(cancelled.status, "cancelled");
		assert.equal(cancelled.taskStates[discovery.taskId]?.status, "cancelled");

		runner.releaseDispatchGate();
		await delayMs(150);
		assert.equal(runner.generatedWorkerStarts.length, 1, "cancelled Discovery root must not launch later generated items");

		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		const generatedRuns = await Promise.all(generated.map(async task => [task, await runService.listRuns(task.taskId)] as const));
		const started = generatedRuns.filter(([, runs]) => runs.length > 0);
		assert.equal(started.length, 1);
		assert.equal(generated.length, 1, "cancelled Discovery root must not create later generated tasks after cancellation");
		assert.deepEqual(new Set(started.map(([, runs]) => runs[0]!.status)), new Set(["cancelled"]));

		const attempts = await workspace.listAttempts(created.runId, discovery.taskId);
		const attempt = attempts[0]!;
		assert.equal(await workspace.readAttemptFile(created.runId, discovery.taskId, attempt.attemptId, "discovery-aggregation.json"), null);
	} finally {
		runner.releaseDispatchGate();
		for (let i = 0; i < 20; i++) {
			for (const release of runner.releaseGeneratedWorkers.splice(0)) release();
			if (service && created) {
				const latest = await service.getRun(created.runId).catch(() => null);
				if (latest && ["completed", "completed_with_failures", "failed", "cancelled"].includes(latest.status)) break;
			}
			await delayMs(25);
		}
		if (service && created) await service.cancelRun(created.runId, "test cleanup").catch(() => {});
		await removeTempRoot(root);
	}
});

test("Discovery typed downstream waits until generated auto-runs finish", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-downstream-gate-"));
	const runner = new StreamingDispatchGatedGeneratedWithDownstreamRunner([
		{ id: "vultr" },
		{ id: "hetzner" },
	]);
	let service: CanvasTaskRunService | undefined;
	let created: TeamRunState | undefined;
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
				outputPorts: [{ id: "vendors_json", label: "供应商 JSON", type: "json" }],
				outputContract: { text: "输出 JSON object，vendors 为数组，每项包含稳定 id。" },
				acceptance: { rules: ["vendors 必须是数组", "每项必须有 id"] },
			},
		});
		const downstream = await taskStore.create({
			title: "生成 HTML 报告",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "生成 HTML 报告",
				input: { text: "基于 JSON 数据生成 HTML 报告。" },
				inputPorts: [{ id: "source_json", label: "源 JSON", type: "json" }],
				outputContract: { text: "输出 HTML 报告。" },
				acceptance: { rules: ["必须包含 HTML"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connection = await connectionStore.create({
			fromTaskId: discovery.taskId,
			fromOutputPortId: "vendors_json",
			toTaskId: downstream.taskId,
			toInputPortId: "source_json",
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		created = await service.createRun(discovery.taskId);
		await waitForDispatchInputs(runner, 2);
		await waitForGeneratedWorkerStarts(runner, 1);

		const waitingParent = await service.getRun(created.runId);
		assert.equal(waitingParent?.status, "running");
		assert.equal(waitingParent?.taskStates[discovery.taskId]?.status, "running");
		assert.equal((await service.listRuns(downstream.taskId)).length, 0, "downstream must not start while generated child is running and dispatch is still active");

		runner.releaseDispatchGate();
		for (let i = 0; i < 40; i++) {
			for (const release of runner.releaseGeneratedWorkers.splice(0)) release();
			const latest = await service.getRun(created.runId);
			if (latest && ["completed", "completed_with_failures", "failed", "cancelled"].includes(latest.status)) break;
			await delayMs(25);
		}
		const parentFinished = await waitForTerminalRun(service, created.runId);
		assert.equal(parentFinished.status, "completed");
		assert.equal(parentFinished.taskStates[discovery.taskId]?.status, "succeeded");

		const downstreamRuns = await waitForTaskRuns(service, downstream.taskId, 1);
		const downstreamFinished = await waitForTerminalRun(service, downstreamRuns[0]!.runId);
		assert.equal(downstreamFinished.status, "completed");
		assert.equal(downstreamFinished.source?.triggeredBy?.type, "task-connection");
		assert.equal(downstreamFinished.source?.boundInputs?.[0]?.connectionId, connection.connectionId);
		assert.deepEqual(runner.downstreamWorkerStarts, [downstream.taskId]);

		const delivery = await waitForAttemptDelivery(workspace, created.runId, discovery.taskId);
		assert.equal(delivery[0]?.status, "delivered");
	} finally {
		runner.releaseDispatchGate();
		for (let i = 0; i < 20; i++) {
			for (const release of runner.releaseGeneratedWorkers.splice(0)) release();
			if (service && created) {
				const latest = await service.getRun(created.runId).catch(() => null);
				if (latest && ["completed", "completed_with_failures", "failed", "cancelled"].includes(latest.status)) break;
			}
			await delayMs(25);
		}
		if (service && created) await waitForTerminalRun(service, created.runId).catch(() => {});
		await removeTempRoot(root);
	}
});

test("Discovery root cancel cascades to active generated auto-runs and stops launching queued items", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-cancel-generated-"));
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
		const runner = new GatedDiscoveryGeneratedRunner([
			{ id: "vultr" },
			{ id: "hetzner" },
			{ id: "ovh" },
			{ id: "linode" },
		]);
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(discovery.taskId);
		await waitForAttemptDiscoveryDispatch(workspace, created.runId, discovery.taskId, 4);
		await waitForGeneratedWorkerStarts(runner, 3);
		assert.equal(runner.generatedWorkerStarts.length, 3);
		assert.equal(runner.activeGeneratedWorkers, 3);

		const cancelled = await service.cancelRun(created.runId, "user cancel");
		assert.equal(cancelled.status, "cancelled");
		assert.equal(cancelled.taskStates[discovery.taskId]?.status, "cancelled");

		await new Promise(resolve => setTimeout(resolve, 150));
		assert.equal(runner.generatedWorkerStarts.length, 3, "cancelled Discovery root must not launch queued generated items");

		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		const generatedRuns = await Promise.all(generated.map(async task => [task, await service.listRuns(task.taskId)] as const));
		const started = generatedRuns.filter(([, runs]) => runs.length > 0);
		const unstarted = generatedRuns.filter(([, runs]) => runs.length === 0);
		assert.equal(started.length, 3);
		assert.equal(unstarted.length, 1);
		assert.deepEqual(new Set(started.map(([, runs]) => runs[0]!.status)), new Set(["cancelled"]));

		for (const release of runner.releaseGeneratedWorkers) release();
		await new Promise(resolve => setTimeout(resolve, 50));
	} finally {
		await removeTempRoot(root);
	}
});

test("Step07: already-running generated Task is skipped without failing Discovery", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-already-running-"));
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
		const runner = new GatedDiscoveryGeneratedRunner([{ id: "vultr" }]);
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});

		const generated = await taskStore.create({
			title: "核查 vultr",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "核查 vultr",
				input: { text: "核查供应商 vultr" },
				outputContract: { text: "输出 vultr 的核查报告。" },
				acceptance: { rules: ["报告必须覆盖 vultr"] },
				workerAgentId: "search",
				checkerAgentId: "main",
			},
			generatedSource: {
				schemaVersion: "team/generated-task-source-1",
				sourceDiscoveryTaskId: discovery.taskId,
				sourceItemId: "vultr",
				itemStatus: "active",
				itemPayload: { id: "vultr" },
				workUnitMode: "managed",
			},
		});
		const existingRun = await service.createRun(generated.taskId);
		await waitForGeneratedWorkerStarts(runner, 1);
		const existingRunState = (await service.listRuns(generated.taskId)).find(run => run.status === "queued" || run.status === "running" || run.status === "paused");
		assert.ok(existingRunState);

		const secondRun = await service.createRun(discovery.taskId);
		const secondFinished = await waitForTerminalRun(service, secondRun.runId);
		assert.equal(secondFinished.status, "completed");
		const launchOutcomes = await waitForAttemptDiscoveryGeneratedRuns(workspace, secondRun.runId, discovery.taskId);
		assert.equal(launchOutcomes.length, 1);
		assert.equal(launchOutcomes[0]!.status, "skipped_already_running");
		assert.equal(launchOutcomes[0]!.generatedRunId, existingRunState.runId);
		assert.equal((await service.listRuns(generated.taskId)).length, 1);

		runner.releaseGeneratedWorkers[0]!();
		await waitForTerminalRun(service, existingRun.runId);
	} finally {
		await removeTempRoot(root);
	}
});

test("Step07: not-ready generated Task launch is recorded without failing Discovery", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-not-ready-"));
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
			new DiscoveryDispatchingRunner([{ id: "vultr" }]),
			new DiscoveryDispatchingRunner([{ id: "vultr", name: "Vultr rerun" }]),
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
		await waitForAttemptDiscoveryGeneratedRuns(workspace, firstRun.runId, discovery.taskId);
		const generated = (await taskStore.listGeneratedForDiscoveryTask(discovery.taskId))[0]!;
		assert.equal((await service.listRuns(generated.taskId)).length, 1);

		await taskStore.update(generated.taskId, { status: "drafting" });
		const secondRun = await service.createRun(discovery.taskId);
		const secondFinished = await waitForTerminalRun(service, secondRun.runId);
		assert.equal(secondFinished.status, "completed");
		const dispatch = await waitForAttemptDiscoveryDispatch(workspace, secondRun.runId, discovery.taskId);
		assert.equal(dispatch[0]!.status, "updated");
		const launchOutcomes = await waitForAttemptDiscoveryGeneratedRuns(workspace, secondRun.runId, discovery.taskId);
		assert.equal(launchOutcomes.length, 1);
		assert.equal(launchOutcomes[0]!.status, "skipped_not_runnable");
		assert.match(launchOutcomes[0]!.error ?? "", /ready/);
		assert.equal((await service.listRuns(generated.taskId)).length, 1);

		const updated = await taskStore.get(generated.taskId);
		assert.equal(updated?.status, "drafting");
		assert.deepEqual(updated?.generatedSource?.itemPayload, { id: "vultr", name: "Vultr rerun" });
		assert.equal(updated?.generatedSource?.latestDiscoveryRunId, secondRun.runId);
	} finally {
		await removeTempRoot(root);
	}
});

test("Step07: blocked dispatch items and stale items are not auto-run", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-blocked-stale-autorun-"));
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
			new DiscoveryDispatchingRunner([{ id: "stale" }]),
			new DiscoveryDispatchingRunner(
				[{ id: "blocked" }, { id: "active" }],
				[
					{ ok: false, itemId: "blocked", error: "dispatcher blocked this item" },
					{
						ok: true,
						itemId: "active",
						workUnit: {
							title: "核查 active",
							input: { text: "核查 active。" },
							outputContract: { text: "输出 active 报告。" },
							acceptance: { rules: ["包含 active"] },
						},
					},
				],
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
		await waitForAttemptDiscoveryGeneratedRuns(workspace, firstRun.runId, discovery.taskId);
		const firstGenerated = (await taskStore.listGeneratedForDiscoveryTask(discovery.taskId))[0]!;
		assert.equal((await service.listRuns(firstGenerated.taskId)).length, 1);

		const secondRun = await service.createRun(discovery.taskId);
		await waitForTerminalRun(service, secondRun.runId);
		const dispatch = await waitForAttemptDiscoveryDispatch(workspace, secondRun.runId, discovery.taskId, 3);
		const dispatchByItem = Object.fromEntries(dispatch.map(outcome => [outcome.itemId, outcome]));
		assert.equal(dispatchByItem.blocked?.status, "blocked");
		assert.equal(dispatchByItem.stale?.status, "stale_marked");
		assert.equal(dispatchByItem.active?.status, "created");

		const launchOutcomes = await waitForAttemptDiscoveryGeneratedRuns(workspace, secondRun.runId, discovery.taskId);
		assert.equal(launchOutcomes.length, 1);
		assert.equal(launchOutcomes[0]!.itemId, "active");
		assert.equal(launchOutcomes[0]!.status, "started");
		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		const byItemId = Object.fromEntries(generated.map(task => [task.generatedSource!.sourceItemId, task]));
		assert.equal(byItemId.stale?.generatedSource?.itemStatus, "stale");
		assert.equal((await service.listRuns(byItemId.stale!.taskId)).length, 1);
		assert.equal(byItemId.blocked, undefined);
		assert.equal((await service.listRuns(byItemId.active!.taskId)).length, 1);
	} finally {
		await removeTempRoot(root);
	}
});
