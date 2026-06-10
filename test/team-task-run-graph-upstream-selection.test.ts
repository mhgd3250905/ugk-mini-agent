import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../src/team/task-store.js";
import { TaskConnectionStore } from "../src/team/task-connection-store.js";
import { TaskDependencyStore } from "../src/team/task-dependency-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { CanvasTaskRunService } from "../src/team/task-run-service.js";
import type { CheckerInput, CheckerOutput, WorkerInput, WorkerOutput } from "../src/team/role-runner.js";
import {
	ProcessEventRoleRunner,
	removeTempRoot,
	type ProcessAwareWorkerInput,
	validTaskInput,
	waitForTaskRuns,
	waitForTerminalRun,
} from "./team-task-run-process-helpers.js";

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
