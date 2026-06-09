import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../src/team/task-store.js";
import { TaskConnectionStore } from "../src/team/task-connection-store.js";
import { TaskDependencyStore } from "../src/team/task-dependency-store.js";
import { SourceConnectionStore } from "../src/team/source-connection-store.js";
import { SourceNodeStore } from "../src/team/source-node-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { CanvasTaskRunService } from "../src/team/task-run-service.js";
import type {
	CheckerInput,
	CheckerOutput,
	DecomposerInput,
	DecomposerOutput,
	DiscoveryDispatchInput,
	DiscoveryDispatchOutput,
	FinalizerInput,
	FinalizerOutput,
	TeamRoleRunner,
	WatcherInput,
	WatcherOutput,
	WorkerInput,
	WorkerOutput,
} from "../src/team/role-runner.js";
import {
	ProcessEventRoleRunner,
	removeTempRoot,
	type ProcessAwareWorkerInput,
	validDiscoverySpec,
	validTaskInput,
	waitForAttemptDelivery,
	waitForTaskRuns,
	waitForTerminalRun,
} from "./team-task-run-process-helpers.js";

test("direct Canvas Task run injects connected source node input into worker prompt and payload", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-source-input-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_text", label: "Source text", type: "string" }],
			},
		});
		const sourceNodeStore = new SourceNodeStore(join(root, "team"));
		const source = await sourceNodeStore.create({
			title: "需求说明",
			nodeType: "text",
			content: { text: "请优先使用这段画布文本。" },
		});
		const sourceConnectionStore = new SourceConnectionStore(join(root, "team"), sourceNodeStore, taskStore);
		const connection = await sourceConnectionStore.create({
			fromSourceNodeId: source.sourceNodeId,
			fromOutputPortId: "value",
			toTaskId: task.taskId,
			toInputPortId: "source_text",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedWorkerInput: WorkerInput | undefined;
		class CaptureSourceWorkerInputRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				capturedWorkerInput = input;
				return { content: "worker result", artifactRefs: [] };
			}
		}
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new CaptureSourceWorkerInputRunner(),
			sourceNodeStore,
			sourceConnectionStore,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(task.taskId, { includeSourceBindings: true });
		const boundInput = created.source?.boundInputs?.[0];
		assert.equal(boundInput?.source, "canvas-source");
		assert.equal(boundInput?.connectionId, connection.connectionId);
		assert.equal(boundInput?.inputPortId, "source_text");
		assert.equal(boundInput?.artifact.type, "string");
		assert.equal(boundInput?.artifact.sourceNodeId, source.sourceNodeId);
		assert.equal(boundInput?.artifact.sourceOutputPortId, "value");
		assert.equal(boundInput?.artifact.content, "请优先使用这段画布文本。");

		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		assert.ok(capturedWorkerInput, "worker input should have been captured");
		assert.match(capturedWorkerInput!.task.input.text, /画布 source node 输入/);
		assert.match(capturedWorkerInput!.task.input.text, new RegExp("sourceNodeId: " + source.sourceNodeId));
		assert.match(capturedWorkerInput!.task.input.text, /请优先使用这段画布文本。/);
		assert.doesNotMatch(capturedWorkerInput!.task.input.text, /sourceTaskId/);
		const payload = capturedWorkerInput!.task.input.payload as { boundInputs?: Array<{ source?: string; artifact: { sourceNodeId?: string } }> } | undefined;
		assert.equal(payload?.boundInputs?.[0]?.source, "canvas-source");
		assert.equal(payload?.boundInputs?.[0]?.artifact.sourceNodeId, source.sourceNodeId);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("direct Canvas Task run skips stale source node connection without invalid binding", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-source-stale-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_text", label: "Source text", type: "string" }],
			},
		});
		const sourceNodeStore = new SourceNodeStore(join(root, "team"));
		const source = await sourceNodeStore.create({
			title: "需求说明",
			nodeType: "text",
			content: { text: "stale input" },
		});
		const sourceConnectionStore = new SourceConnectionStore(join(root, "team"), sourceNodeStore, taskStore);
		await sourceConnectionStore.create({
			fromSourceNodeId: source.sourceNodeId,
			fromOutputPortId: "value",
			toTaskId: task.taskId,
			toInputPortId: "source_text",
		});
		await taskStore.update(task.taskId, {
			workUnit: {
				...task.workUnit,
				inputPorts: [{ id: "source_text", label: "HTML source", type: "html" }],
			},
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedWorkerInput: WorkerInput | undefined;
		class CaptureNoSourceWorkerInputRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				capturedWorkerInput = input;
				return { content: "worker result", artifactRefs: [] };
			}
		}
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new CaptureNoSourceWorkerInputRunner(),
			sourceNodeStore,
			sourceConnectionStore,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(task.taskId, { includeSourceBindings: true });
		assert.equal(created.source?.boundInputs, undefined);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		assert.ok(capturedWorkerInput);
		assert.equal(capturedWorkerInput!.task.input.payload, undefined);
		assert.doesNotMatch(capturedWorkerInput!.task.input.text, /stale input/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("source node connections do not auto-trigger task runs by themselves", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-source-no-autostart-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_text", label: "Source text", type: "string" }],
			},
		});
		const sourceNodeStore = new SourceNodeStore(join(root, "team"));
		const source = await sourceNodeStore.create({
			title: "需求说明",
			nodeType: "text",
			content: { text: "x" },
		});
		const sourceConnectionStore = new SourceConnectionStore(join(root, "team"), sourceNodeStore, taskStore);
		await sourceConnectionStore.create({
			fromSourceNodeId: source.sourceNodeId,
			fromOutputPortId: "value",
			toTaskId: task.taskId,
			toInputPortId: "source_text",
		});

		const service = new CanvasTaskRunService({
			taskStore,
			workspace: new RunWorkspace(join(root, "task-runs")),
			createRoleRunner: () => new ProcessEventRoleRunner(),
			sourceNodeStore,
			sourceConnectionStore,
			dataDir: join(root, "task-runs"),
		});
		await new Promise(resolve => setTimeout(resolve, 50));
		assert.deepEqual(await service.listRuns(task.taskId), []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("task output fan-out delivers same artifact to two downstream Tasks independently", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-fanout-delivery-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetB = await taskStore.create({
			title: "Target B",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "Target B",
				input: { text: "Process markdown B." },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "Output B." },
				acceptance: { rules: ["must include B"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});
		const targetC = await taskStore.create({
			title: "Target C",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "Target C",
				input: { text: "Process markdown C." },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "Output C." },
				acceptance: { rules: ["must include C"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connB = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetB.taskId,
			toInputPortId: "source_md",
		});
		const connC = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetC.taskId,
			toInputPortId: "source_md",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");
		assert.equal(upstreamFinished.taskStates[sourceTask.taskId]?.status, "succeeded");

		const downstreamBRuns = await waitForTaskRuns(service, targetB.taskId, 1);
		const downstreamBFinished = await waitForTerminalRun(service, downstreamBRuns[0]!.runId);
		assert.equal(downstreamBFinished.status, "completed");
		assert.equal(downstreamBFinished.source?.triggeredBy?.type, "task-connection");
		assert.equal(downstreamBFinished.source?.triggeredBy?.fromTaskId, sourceTask.taskId);
		assert.equal(downstreamBFinished.source?.triggeredBy?.fromRunId, upstreamRun.runId);
		assert.equal(downstreamBFinished.source?.boundInputs?.length, 1);
		assert.equal(downstreamBFinished.source?.boundInputs?.[0]?.inputPortId, "source_md");
		assert.equal(downstreamBFinished.source?.boundInputs?.[0]?.artifact?.type, "md");
		assert.equal(downstreamBFinished.source?.boundInputs?.[0]?.connectionId, connB.connectionId);

		const downstreamCRuns = await waitForTaskRuns(service, targetC.taskId, 1);
		const downstreamCFinished = await waitForTerminalRun(service, downstreamCRuns[0]!.runId);
		assert.equal(downstreamCFinished.status, "completed");
		assert.equal(downstreamCFinished.source?.triggeredBy?.type, "task-connection");
		assert.equal(downstreamCFinished.source?.triggeredBy?.fromTaskId, sourceTask.taskId);
		assert.equal(downstreamCFinished.source?.triggeredBy?.fromRunId, upstreamRun.runId);
		assert.equal(downstreamCFinished.source?.boundInputs?.length, 1);
		assert.equal(downstreamCFinished.source?.boundInputs?.[0]?.inputPortId, "source_md");
		assert.equal(downstreamCFinished.source?.boundInputs?.[0]?.artifact?.type, "md");
		assert.equal(downstreamCFinished.source?.boundInputs?.[0]?.connectionId, connC.connectionId);

		const delivery = await waitForAttemptDelivery(workspace, upstreamRun.runId, sourceTask.taskId, 2);
		assert.equal(delivery.length, 2);
		const deliveryByConn = Object.fromEntries(delivery.map((d): [string, typeof d] => [(d as import('../src/team/types.js').TeamTaskTypedConnectionDeliveryOutcome).connectionId, d]));
		assert.equal(deliveryByConn[connB.connectionId]?.status, "delivered");
		assert.equal(deliveryByConn[connC.connectionId]?.status, "delivered");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("task output fan-out isolates downstream failure: B blocked by active run, C succeeds", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-fanout-isolation-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetB = await taskStore.create({
			title: "Target B (blocked)",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "Target B",
				input: { text: "Process markdown B." },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "Output B." },
				acceptance: { rules: ["must include B"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});
		const targetC = await taskStore.create({
			title: "Target C",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "Target C",
				input: { text: "Process markdown C." },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "Output C." },
				acceptance: { rules: ["must include C"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connB = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetB.taskId,
			toInputPortId: "source_md",
		});
		const connC = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetC.taskId,
			toInputPortId: "source_md",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));

		let gatedWorkerStarted!: () => void;
		const gatedWorkerStartedPromise = new Promise<void>((resolve) => { gatedWorkerStarted = resolve; });
		let gatedWorkerProceed!: () => void;
		const gatedWorkerProceedPromise = new Promise<void>((resolve) => { gatedWorkerProceed = resolve; });

		class GatedDownstreamRunner implements TeamRoleRunner {
			async runWorker(_input: WorkerInput): Promise<WorkerOutput> {
				gatedWorkerStarted();
				await gatedWorkerProceedPromise;
				return { content: "gated worker", artifactRefs: [] };
			}
			async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
				return { verdict: "pass", reason: "ok", resultContent: "accepted" };
			}
			async runWatcher(_input: WatcherInput): Promise<WatcherOutput> {
				return { decision: "accept_task", reason: "ok" };
			}
			async runFinalizer(_input: FinalizerInput): Promise<FinalizerOutput> {
				return { finalReport: "ok" };
			}
			async runDecomposer(_input: DecomposerInput): Promise<DecomposerOutput> {
				return { decision: "no_split", reason: "ok", children: [] };
			}
		}

		let runnerCallCount = 0;
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => {
				runnerCallCount++;
				return runnerCallCount === 1 ? new GatedDownstreamRunner() : new ProcessEventRoleRunner();
			},
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		// Pre-create an active run on target B (gated, stays active)
		const preCreatedBRun = await service.createRun(targetB.taskId);
		await gatedWorkerStartedPromise;

		// Run source task; B delivery should fail but C should succeed
		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed", "upstream must remain completed");
		assert.equal(upstreamFinished.taskStates[sourceTask.taskId]?.status, "succeeded");

		// Target C should have a completed downstream run
		const downstreamCRuns = await waitForTaskRuns(service, targetC.taskId, 1);
		const downstreamCFinished = await waitForTerminalRun(service, downstreamCRuns[0]!.runId);
		assert.equal(downstreamCFinished.status, "completed");
		assert.equal(downstreamCFinished.source?.triggeredBy?.fromTaskId, sourceTask.taskId);
		assert.equal(downstreamCFinished.source?.boundInputs?.[0]?.connectionId, connC.connectionId);

		// Delivery outcomes: B failed, C delivered
		const delivery = await waitForAttemptDelivery(workspace, upstreamRun.runId, sourceTask.taskId, 2);
		assert.equal(delivery.length, 2);
		const deliveryByConn = Object.fromEntries(delivery.map((d): [string, typeof d] => [(d as import('../src/team/types.js').TeamTaskTypedConnectionDeliveryOutcome).connectionId, d]));
		assert.equal(deliveryByConn[connB.connectionId]?.status, "failed");
		assert.match(deliveryByConn[connB.connectionId]?.error ?? "", /active task run already exists/);
		assert.equal(deliveryByConn[connC.connectionId]?.status, "delivered");

		// Release gated B worker for cleanup
		gatedWorkerProceed();
		await waitForTerminalRun(service, preCreatedBRun.runId);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

// ── Control dependency downstream trigger ──

test("control dependency triggers downstream Task when both Tasks have no ports", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dep-trigger-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const connectionStore = new TaskConnectionStore(root, taskStore);
		const dependencyStore = new TaskDependencyStore(root, taskStore);
		connectionStore.setExistingDependencies(() => dependencyStore.list());
		dependencyStore.setExistingConnections(() => connectionStore.list());
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dependencyStore,
			dataDir: join(root, "task-runs"),
		});

		const taskA = await taskStore.create(validTaskInput);
		const taskB = await taskStore.create({ ...validTaskInput, title: "下游任务" });
		await dependencyStore.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });

		const runA = await service.createRun(taskA.taskId);
		const finishedA = await waitForTerminalRun(service, runA.runId);
		assert.equal(finishedA.status, "completed");

		const runsB = await waitForTaskRuns(service, taskB.taskId);
		assert.equal(runsB.length, 1);
		const finishedB = await waitForTerminalRun(service, runsB[0]!.runId);
		assert.equal(finishedB.status, "completed");

		assert.ok(finishedB.source?.triggeredBy);
		const triggeredBy = finishedB.source!.triggeredBy!;
		assert.equal(triggeredBy.type, "task-dependency");
		if (triggeredBy.type === "task-dependency") {
			assert.equal(triggeredBy.fromTaskId, taskA.taskId);
			assert.equal(triggeredBy.fromRunId, runA.runId);
		}
		assert.equal(finishedB.source?.boundInputs, undefined);
	} finally {
		await rm(root, { recursive: true, force: true }).catch(() => {});
	}
});

test("control dependency downstream run has no boundInputs", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dep-nobound-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const dependencyStore = new TaskDependencyStore(root, taskStore);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			dependencyStore,
			dataDir: join(root, "task-runs"),
		});

		const taskA = await taskStore.create(validTaskInput);
		const taskB = await taskStore.create({ ...validTaskInput, title: "下游" });
		await dependencyStore.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });

		const runA = await service.createRun(taskA.taskId);
		await waitForTerminalRun(service, runA.runId);

		const runsB = await waitForTaskRuns(service, taskB.taskId);
		const finishedB = await waitForTerminalRun(service, runsB[0]!.runId);
		assert.equal(finishedB.status, "completed");
		assert.equal(finishedB.source?.boundInputs, undefined);
	} finally {
		await rm(root, { recursive: true, force: true }).catch(() => {});
	}
});

test("upstream failed run does not trigger dependency downstream", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dep-nofail-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const dependencyStore = new TaskDependencyStore(root, taskStore);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const failRunner: TeamRoleRunner = {
			async runWorker() { return { content: "fail output", artifactRefs: [], runtimeContext: undefined }; },
			async runChecker() { return { verdict: "fail", reason: "not good enough", runtimeContext: undefined }; },
			async runWatcher() { return { decision: "accept_task" as const, reason: "", runtimeContext: undefined }; },
			async runFinalizer() { return { finalReport: "done", runtimeContext: undefined }; },
			async runDecomposer() { return { decision: "no_split" as const, reason: "", subtasks: [], runtimeContext: undefined }; },
		};
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => failRunner,
			dependencyStore,
			dataDir: join(root, "task-runs"),
		});

		const taskA = await taskStore.create(validTaskInput);
		const taskB = await taskStore.create({ ...validTaskInput, title: "下游" });
		await dependencyStore.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });

		const runA = await service.createRun(taskA.taskId);
		const finishedA = await waitForTerminalRun(service, runA.runId);
		assert.equal(finishedA.status, "completed_with_failures");

		const runsB = await service.listRuns(taskB.taskId);
		assert.equal(runsB.length, 0, "downstream should not be triggered when upstream fails");
	} finally {
		await rm(root, { recursive: true, force: true }).catch(() => {});
	}
});

test("stale dependency records skipped outcome without failing upstream", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dep-stale-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const dependencyStore = new TaskDependencyStore(root, taskStore);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			dependencyStore,
			dataDir: join(root, "task-runs"),
		});

		const taskA = await taskStore.create(validTaskInput);
		const taskB = await taskStore.create({ ...validTaskInput, title: "下游" });
		await dependencyStore.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });

		// Archive target between dep creation and run completion
		await taskStore.archive(taskB.taskId);

		const runA = await service.createRun(taskA.taskId);
		const finishedA = await waitForTerminalRun(service, runA.runId);
		assert.equal(finishedA.status, "completed", "upstream should succeed even if dependency target is stale");

		const delivery = await waitForAttemptDelivery(workspace, runA.runId, taskA.taskId);
		assert.equal(delivery.length, 1);
		const depOutcome = delivery[0] as import("../src/team/types.js").TeamTaskControlDependencyDeliveryOutcome;
		assert.equal(depOutcome.edgeKind, "control-dependency");
		assert.equal(depOutcome.status, "skipped");
		assert.equal(depOutcome.staleReason, "target_task_archived");
	} finally {
		await rm(root, { recursive: true, force: true }).catch(() => {});
	}
});

test("dependency fan-out triggers multiple independent downstream Tasks", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dep-fanout-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const dependencyStore = new TaskDependencyStore(root, taskStore);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			dependencyStore,
			dataDir: join(root, "task-runs"),
		});

		const taskA = await taskStore.create(validTaskInput);
		const taskB = await taskStore.create({ ...validTaskInput, title: "B" });
		const taskC = await taskStore.create({ ...validTaskInput, title: "C" });
		await dependencyStore.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });
		await dependencyStore.create({ fromTaskId: taskA.taskId, toTaskId: taskC.taskId });

		const runA = await service.createRun(taskA.taskId);
		await waitForTerminalRun(service, runA.runId);

		const runsB = await waitForTaskRuns(service, taskB.taskId);
		const runsC = await waitForTaskRuns(service, taskC.taskId);
		const finishedB = await waitForTerminalRun(service, runsB[0]!.runId);
		const finishedC = await waitForTerminalRun(service, runsC[0]!.runId);
		assert.equal(finishedB.status, "completed");
		assert.equal(finishedC.status, "completed");
		assert.equal(finishedB.source?.triggeredBy?.type, "task-dependency");
		assert.equal(finishedC.source?.triggeredBy?.type, "task-dependency");
	} finally {
		await rm(root, { recursive: true, force: true }).catch(() => {});
	}
});

test("upstream run selection: B receives selected historical A run artifact, not latest A run", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-upstream-selection-"));
	let service: CanvasTaskRunService | undefined;
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const taskA = await taskStore.create({
			...validTaskInput,
			title: "Task A - collect",
			workUnit: {
				...validTaskInput.workUnit,
				title: "Task A",
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const taskB = await taskStore.create({
			...validTaskInput,
			title: "Task B - transform",
			workUnit: {
				...validTaskInput.workUnit,
				title: "Task B",
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputPorts: [{ id: "page_html", label: "HTML", type: "html" }],
			},
		});
		const taskC = await taskStore.create({
			...validTaskInput,
			title: "Task C - publish",
			workUnit: {
				...validTaskInput.workUnit,
				title: "Task C",
				inputPorts: [{ id: "input_html", label: "HTML", type: "html" }],
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const depStore = new TaskDependencyStore(join(root, "team"), taskStore);
		connectionStore.setExistingDependencies(() => depStore.list());
		depStore.setExistingConnections(() => connectionStore.list());
		const connAtoB = await connectionStore.create({
			fromTaskId: taskA.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: taskB.taskId,
			toInputPortId: "source_md",
		});
		await connectionStore.create({
			fromTaskId: taskB.taskId,
			fromOutputPortId: "page_html",
			toTaskId: taskC.taskId,
			toInputPortId: "input_html",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));

		let workerRunCount = 0;
		let lastWorkerContent = "";
		class VersionedResultRunner extends ProcessEventRoleRunner {
			async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
				workerRunCount++;
				if (input.task.id === taskA.taskId) {
					const version = workerRunCount === 1 ? "A result v1" : "A result v2";
					lastWorkerContent = version;
					return { content: version, artifactRefs: [] };
				}
				return { content: "result for " + input.task.id, artifactRefs: [] };
			}
			async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
				return { verdict: "pass", reason: "ok", resultContent: lastWorkerContent };
			}
		}

		service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new VersionedResultRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const firstRunA = await service.createRun(taskA.taskId);
		const firstFinishedA = await waitForTerminalRun(service, firstRunA.runId);
		assert.equal(firstFinishedA.status, "completed");

		const downstreamOfFirstA = await waitForTaskRuns(service, taskB.taskId, 1);
		await waitForTerminalRun(service, downstreamOfFirstA[0]!.runId).catch(() => {});
		const downstreamOfFirstB = await waitForTaskRuns(service, taskC.taskId, 1);
		await waitForTerminalRun(service, downstreamOfFirstB[0]!.runId).catch(() => {});

		const secondRunA = await service.createRun(taskA.taskId);
		const secondFinishedA = await waitForTerminalRun(service, secondRunA.runId);
		assert.equal(secondFinishedA.status, "completed");

		const downstreamOfSecondA = await waitForTaskRuns(service, taskB.taskId, 2);
		await waitForTerminalRun(service, downstreamOfSecondA[1]!.runId).catch(() => {});
		const downstreamOfSecondB = await waitForTaskRuns(service, taskC.taskId, 2);
		await waitForTerminalRun(service, downstreamOfSecondB[1]!.runId).catch(() => {});

		const runBFromSelectedA = await service.createRun(taskB.taskId, {
			upstreamRunSelections: [{ connectionId: connAtoB.connectionId, fromRunId: firstRunA.runId }],
		});
		const finishedB = await waitForTerminalRun(service, runBFromSelectedA.runId);
		assert.equal(finishedB.status, "completed");

		assert.equal(finishedB.source?.boundInputs?.length, 1);
		const boundInput = finishedB.source!.boundInputs![0]!;
		assert.equal(boundInput.connectionId, connAtoB.connectionId);
		assert.equal(boundInput.inputPortId, "source_md");
		const artifact = boundInput.artifact as import("../src/team/types.js").TeamTaskTypedArtifact;
		assert.equal(artifact.sourceTaskId, taskA.taskId);
		assert.equal(artifact.sourceRunId, firstRunA.runId, "B must use A first run, not second");
		assert.match(artifact.content ?? "", /A result v1/, "B artifact must contain A result v1");
		assert.doesNotMatch(artifact.content ?? "", /A result v2/, "B artifact must NOT contain A result v2");

		assert.equal(finishedB.source?.triggeredBy, undefined, "manually started B must not have triggeredBy");

		assert.equal(finishedB.source?.manualUpstreamSelections?.length, 1);
		const manualSelection = finishedB.source!.manualUpstreamSelections![0]!;
		assert.equal(manualSelection.connectionId, connAtoB.connectionId);
		assert.equal(manualSelection.fromTaskId, taskA.taskId);
		assert.equal(manualSelection.fromRunId, firstRunA.runId);
		assert.equal(manualSelection.toInputPortId, "source_md");

		const planFile = await workspace.readRunScopedFile(runBFromSelectedA.runId, "plan.json");
		assert.ok(planFile);
		assert.match(planFile, /A result v1/);
		assert.doesNotMatch(planFile, /A result v2/);

		const runCFromNewB = await waitForTaskRuns(service, taskC.taskId, 3);
		const triggeredCFromManualB = runCFromNewB.find(run => run.source?.triggeredBy?.fromRunId === runBFromSelectedA.runId);
		assert.ok(triggeredCFromManualB, "C must be triggered from the manual B run");
		const finishedC = await waitForTerminalRun(service, triggeredCFromManualB.runId);
		assert.equal(finishedC.status, "completed");
		assert.equal(finishedC.source?.triggeredBy?.type, "task-connection");
		assert.equal(finishedC.source?.triggeredBy?.fromTaskId, taskB.taskId);
		assert.equal(finishedC.source?.triggeredBy?.fromRunId, runBFromSelectedA.runId);
	} finally {
		await removeTempRoot(root);
	}
});

test("upstream run selection: service rejects connection that does not target requested task", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-upstream-selection-wrong-target-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const taskA = await taskStore.create({
			...validTaskInput,
			title: "Task A",
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const taskB = await taskStore.create({
			...validTaskInput,
			title: "Task B",
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			},
		});
		const taskC = await taskStore.create({
			...validTaskInput,
			title: "Task C",
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connAtoB = await connectionStore.create({
			fromTaskId: taskA.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: taskB.taskId,
			toInputPortId: "source_md",
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const serviceWithoutConnections = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			dataDir: join(root, "task-runs"),
		});
		const runA = await serviceWithoutConnections.createRun(taskA.taskId);
		await waitForTerminalRun(serviceWithoutConnections, runA.runId);

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});
		await assert.rejects(
			() => service.createRun(taskC.taskId, {
				upstreamRunSelections: [{ connectionId: connAtoB.connectionId, fromRunId: runA.runId }],
			}),
			/does not target task/,
		);
	} finally {
		await removeTempRoot(root);
	}
});

test("upstream run selection: service rejects stale selected connection", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-upstream-selection-stale-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const taskA = await taskStore.create({
			...validTaskInput,
			title: "Task A",
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const taskB = await taskStore.create({
			...validTaskInput,
			title: "Task B",
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connAtoB = await connectionStore.create({
			fromTaskId: taskA.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: taskB.taskId,
			toInputPortId: "source_md",
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const serviceWithoutConnections = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			dataDir: join(root, "task-runs"),
		});
		const runA = await serviceWithoutConnections.createRun(taskA.taskId);
		await waitForTerminalRun(serviceWithoutConnections, runA.runId);

		await taskStore.update(taskB.taskId, {
			workUnit: {
				...taskB.workUnit,
				inputPorts: [{ id: "source_md", label: "HTML", type: "html" }],
			},
		});

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});
		await assert.rejects(
			() => service.createRun(taskB.taskId, {
				upstreamRunSelections: [{ connectionId: connAtoB.connectionId, fromRunId: runA.runId }],
			}),
			/stale: target_input_port_type_mismatch/,
		);
	} finally {
		await removeTempRoot(root);
	}
});

test("upstream run selection: service rejects duplicate selected connection", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-upstream-selection-duplicate-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const taskA = await taskStore.create({
			...validTaskInput,
			title: "Task A",
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const taskB = await taskStore.create({
			...validTaskInput,
			title: "Task B",
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connAtoB = await connectionStore.create({
			fromTaskId: taskA.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: taskB.taskId,
			toInputPortId: "source_md",
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		await assert.rejects(
			() => service.createRun(taskB.taskId, {
				upstreamRunSelections: [
					{ connectionId: connAtoB.connectionId, fromRunId: "run_first" },
					{ connectionId: connAtoB.connectionId, fromRunId: "run_second" },
				],
			}),
			new RegExp("duplicate upstreamRunSelections connectionId: " + connAtoB.connectionId),
		);
	} finally {
		await removeTempRoot(root);
	}
});

test("upstream run selection: old asset name does not appear in bound input", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-upstream-selection-old-asset-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const taskA = await taskStore.create({
			...validTaskInput,
			title: "Upstream A",
			workUnit: {
				...validTaskInput.workUnit,
				title: "Upstream A",
				outputPorts: [{ id: "report_md", label: "Report", type: "md" }],
			},
		});
		const taskB = await taskStore.create({
			...validTaskInput,
			title: "Downstream B",
			workUnit: {
				...validTaskInput.workUnit,
				title: "Downstream B",
				input: { text: "旧的 biospace-diabetes-news.json 可能存在，不要使用它。只需要处理上游输入。" },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const depStore = new TaskDependencyStore(join(root, "team"), taskStore);
		connectionStore.setExistingDependencies(() => depStore.list());
		depStore.setExistingConnections(() => connectionStore.list());
		const connAtoB = await connectionStore.create({
			fromTaskId: taskA.taskId,
			fromOutputPortId: "report_md",
			toTaskId: taskB.taskId,
			toInputPortId: "source_md",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		const capturedBInputs = new Map<string, WorkerInput>();

		class FixedContentRunner extends ProcessEventRoleRunner {
			private lastWorkerContent = "";
			async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
				if (input.task.id === taskA.taskId) {
					this.lastWorkerContent = "正确的上游结果数据";
					return { content: this.lastWorkerContent, artifactRefs: [] };
				}
				if (input.task.id === taskB.taskId) {
					capturedBInputs.set(input.runId, input);
				}
				this.lastWorkerContent = "B result";
				return { content: this.lastWorkerContent, artifactRefs: [] };
			}
			async runChecker(): Promise<CheckerOutput> {
				return { verdict: "pass", reason: "ok", resultContent: this.lastWorkerContent };
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new FixedContentRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const runA = await service.createRun(taskA.taskId);
		await waitForTerminalRun(service, runA.runId);
		const autoBRuns = await waitForTaskRuns(service, taskB.taskId, 1);
		const autoBFromA = autoBRuns.find(run => run.source?.triggeredBy?.fromRunId === runA.runId);
		assert.ok(autoBFromA, "automatic B run should be triggered before manual B starts");
		await waitForTerminalRun(service, autoBFromA.runId);

		const runB = await service.createRun(taskB.taskId, {
			upstreamRunSelections: [{ connectionId: connAtoB.connectionId, fromRunId: runA.runId }],
		});
		const finishedB = await waitForTerminalRun(service, runB.runId);
		assert.equal(finishedB.status, "completed");

		const capturedBWorkerInput = capturedBInputs.get(runB.runId);
		assert.ok(capturedBWorkerInput, "B worker input should be captured");
		const payload = capturedBWorkerInput.task.input.payload as { boundInputs?: Array<{ artifact: { content?: string; preview: string } }> } | undefined;
		const selectedArtifact = payload?.boundInputs?.[0]?.artifact;
		assert.ok(selectedArtifact, "B worker payload must include selected bound artifact");
		assert.match(selectedArtifact.content ?? selectedArtifact.preview, /正确的上游结果数据/);
		assert.doesNotMatch(selectedArtifact.content ?? selectedArtifact.preview, /biospace-diabetes-news\.json/);
		assert.match(capturedBWorkerInput.task.input.text, /正确的上游结果数据/);
		assert.match(capturedBWorkerInput.task.input.text, /不要从旧资产/);

		const planFile = await workspace.readRunScopedFile(runB.runId, "plan.json");
		assert.ok(planFile);
		assert.match(planFile, /正确的上游结果数据/);
		assert.match(planFile, /BEGIN_TYPED_ARTIFACT_PREVIEW/);
		assert.match(planFile, /不要从旧资产/);
	} finally {
		await removeTempRoot(root);
	}
});

test("upstream run selection: Discovery historical run uses selected aggregation", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-upstream-selection-discovery-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discoveryTask = await taskStore.create({
			...validTaskInput,
			title: "Discovery A",
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
			workUnit: {
				...validTaskInput.workUnit,
				title: "Discovery A",
				input: { text: "发现来源并输出 JSON。" },
				outputPorts: [{ id: "sources_json", label: "Sources", type: "json" }],
				outputContract: { text: "输出 JSON object，vendors 为数组。" },
				acceptance: { rules: ["vendors 必须是数组"] },
			},
		});
		const taskB = await taskStore.create({
			...validTaskInput,
			title: "Task B",
			workUnit: {
				...validTaskInput.workUnit,
				title: "Task B",
				input: { text: "使用 Discovery JSON 制作报告。" },
				inputPorts: [{ id: "source_json", label: "Source JSON", type: "json" }],
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connAtoB = await connectionStore.create({
			fromTaskId: discoveryTask.taskId,
			fromOutputPortId: "sources_json",
			toTaskId: taskB.taskId,
			toInputPortId: "source_json",
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const capturedBInputs = new Map<string, WorkerInput>();
		let discoveryRunCount = 0;

		class VersionedDiscoveryRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === taskB.taskId) {
					capturedBInputs.set(input.runId, input);
					return { content: "B result", artifactRefs: [] };
				}
				if (input.task.type === "discovery") {
					return { content: "discovery worker result", artifactRefs: [] };
				}
				return { content: `generated worker result for ${input.task.title}`, artifactRefs: [] };
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.type === "discovery") {
					discoveryRunCount++;
					const selected = discoveryRunCount === 1;
					return {
						verdict: "pass",
						reason: "ok",
						resultContent: JSON.stringify({
							vendors: [{
								id: selected ? "first_item" : "second_item",
								name: selected ? "FIRST_DISCOVERY_SELECTED" : "SECOND_DISCOVERY_LATEST",
							}],
						}),
					};
				}
				if (input.task.title.includes("first_item")) {
					return { verdict: "pass", reason: "ok", resultContent: "FIRST_DISCOVERY_SELECTED generated result" };
				}
				if (input.task.title.includes("second_item")) {
					return { verdict: "pass", reason: "ok", resultContent: "SECOND_DISCOVERY_LATEST generated result" };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted " + input.task.id };
			}

			async runDiscoveryDispatcher(input: DiscoveryDispatchInput): Promise<DiscoveryDispatchOutput> {
				return {
					ok: true,
					itemId: input.itemId,
					workUnit: {
						title: `核查 ${input.itemId}`,
						input: { text: `核查 ${input.itemId}` },
						outputContract: { text: `输出 ${input.itemId} 的核查报告。` },
						acceptance: { rules: [`报告必须覆盖 ${input.itemId}`] },
					},
				};
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new VersionedDiscoveryRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const firstRunA = await service.createRun(discoveryTask.taskId);
		await waitForTerminalRun(service, firstRunA.runId);
		const firstAutoBRuns = await waitForTaskRuns(service, taskB.taskId, 1);
		const firstAutoB = firstAutoBRuns.find(run => run.source?.triggeredBy?.fromRunId === firstRunA.runId);
		assert.ok(firstAutoB, "first Discovery run should trigger B");
		await waitForTerminalRun(service, firstAutoB.runId);

		const secondRunA = await service.createRun(discoveryTask.taskId);
		await waitForTerminalRun(service, secondRunA.runId);
		const secondAutoBRuns = await waitForTaskRuns(service, taskB.taskId, 2);
		const secondAutoB = secondAutoBRuns.find(run => run.source?.triggeredBy?.fromRunId === secondRunA.runId);
		assert.ok(secondAutoB, "second Discovery run should trigger B");
		await waitForTerminalRun(service, secondAutoB.runId);

		const firstAttempts = await workspace.listAttempts(firstRunA.runId, discoveryTask.taskId);
		const firstAttempt = firstAttempts[0]!;
		const manualRunB = await service.createRun(taskB.taskId, {
			upstreamRunSelections: [{ connectionId: connAtoB.connectionId, fromRunId: firstRunA.runId }],
		});
		const finishedB = await waitForTerminalRun(service, manualRunB.runId);
		assert.equal(finishedB.status, "completed");

		const capturedBInput = capturedBInputs.get(manualRunB.runId);
		assert.ok(capturedBInput, "manual B worker input should be captured");
		const payload = capturedBInput!.task.input.payload as { boundInputs?: Array<{ artifact: { fileRef: string; content?: string; preview: string } }> } | undefined;
		const artifact = payload?.boundInputs?.[0]?.artifact;
		assert.ok(artifact, "manual B payload must include selected Discovery artifact");
		assert.equal(artifact.fileRef, `tasks/${discoveryTask.taskId}/attempts/${firstAttempt.attemptId}/discovery-aggregation.json`);
		const aggregation = JSON.parse(artifact.content ?? artifact.preview);
		assert.equal(aggregation.schemaVersion, "team/discovery-aggregation-1");
		assert.equal(aggregation.discoveryRunId, firstRunA.runId);
		assert.match(artifact.content ?? "", /FIRST_DISCOVERY_SELECTED/);
		assert.doesNotMatch(artifact.content ?? "", /SECOND_DISCOVERY_LATEST/);
	} finally {
		await removeTempRoot(root);
	}
});
