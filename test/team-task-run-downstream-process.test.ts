import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../src/team/task-store.js";
import { TaskConnectionStore } from "../src/team/task-connection-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { CanvasTaskRunService } from "../src/team/task-run-service.js";
import type {
	CheckerInput,
	CheckerOutput,
	DecomposerInput,
	DecomposerOutput,
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
	type ProcessAwareWorkerInput,
	validTaskInput,
	waitForAttemptDelivery,
	waitForTaskRuns,
	waitForTerminalRun,
} from "./team-task-run-process-helpers.js";

test("canvas task with input ports cannot run without bound upstream input", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-missing-input-port-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create({
			title: "消费分片结果",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "消费分片结果",
				input: { text: "读取上游 worklist-results。" },
				inputPorts: [{ id: "source_results", label: "分片结果", type: "worklist-results" }],
				outputPorts: [{ id: "cleaned_json", label: "清洗 JSON", type: "json" }],
				outputContract: { text: "输出 JSON。" },
				acceptance: { rules: ["必须使用上游输入"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			dataDir: join(root, "task-runs"),
		});

		await assert.rejects(
			() => service.createRun(task.taskId),
			/task input ports require bound upstream input before run: source_results:worklist-results/,
		);
		assert.equal((await service.listRuns(task.taskId)).length, 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("archived source task mid-run blocks downstream triggering", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-mid-archive-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "制作 HTML 页面。" },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须包含 HTML"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_md",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));

		let workerStartedResolve!: () => void;
		const workerStarted = new Promise<void>((resolve) => { workerStartedResolve = resolve; });
		let workerProceedResolve!: () => void;
		const workerProceed = new Promise<void>((resolve) => { workerProceedResolve = resolve; });

		class GatedWorkerRunner implements TeamRoleRunner {
			async runWorker(_input: WorkerInput): Promise<WorkerOutput> {
				workerStartedResolve();
				await workerProceed;
				return { content: "worker result", artifactRefs: [] };
			}
			async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
				return { verdict: "pass", reason: "ok", resultContent: "accepted result" };
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

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new GatedWorkerRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(sourceTask.taskId);

		await workerStarted;
		await taskStore.archive(sourceTask.taskId);
		workerProceedResolve();

		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		assert.equal(finished.taskStates[sourceTask.taskId]?.status, "succeeded");

		const downstreamRuns = await service.listRuns(targetTask.taskId);
		assert.deepEqual(downstreamRuns, []);

		// Verify skipped outcome was recorded for the archived source task (poll since delivery writes after terminal state)
		const delivery = await waitForAttemptDelivery(workspace, created.runId, sourceTask.taskId);
		assert.equal(delivery.length, 1);
		assert.equal(delivery[0]!.status, "skipped");
		assert.equal(delivery[0]!.staleReason, "source_task_archived");
		assert.equal(delivery[0]!.downstreamRunId, undefined);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("failed downstream delivery records error without failing upstream", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-delivery-fail-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "制作 HTML 页面。" },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须包含 HTML"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connection = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_md",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		const fixtureFileRef = "tasks/source/attempts/attempt_fixture_source/accepted-result.md";
		await mkdir(join(root, "task-runs", "runs", "run_fixture_source", "tasks/source/attempts/attempt_fixture_source"), { recursive: true });
		await writeFile(join(root, "task-runs", "runs", "run_fixture_source", fixtureFileRef), "fixture markdown");

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

		// First call is for the pre-created downstream run (gated), second call is for the source run (fast pass-through)
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

		// Pre-create an active downstream run that stays active (gated worker).
		// Input-port tasks must still receive a bound input, even in this fixture.
		const preCreatedRun = await service.createRun(targetTask.taskId, {
			boundInputs: [{
				connectionId: connection.connectionId,
				inputPortId: "source_md",
				artifact: {
					schemaVersion: "team/task-artifact-1",
					artifactId: "artifact_fixture_source_md",
					type: "md",
					sourceTaskId: sourceTask.taskId,
					sourceRunId: "run_fixture_source",
					sourceAttemptId: "attempt_fixture_source",
					sourceOutputPortId: "draft_md",
					fileRef: fixtureFileRef,
					preview: "fixture markdown",
					content: "fixture markdown",
					createdAt: new Date().toISOString(),
				},
			}],
		});
		await gatedWorkerStartedPromise;

		// Now run the source task - downstream delivery should fail because active run exists
		const created = await service.createRun(sourceTask.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed", "upstream must remain completed despite delivery failure");
		assert.equal(finished.taskStates[sourceTask.taskId]?.status, "succeeded");

		// Verify failed outcome was recorded (poll since delivery writes after terminal state)
		const delivery = await waitForAttemptDelivery(workspace, created.runId, sourceTask.taskId);
		assert.equal(delivery.length, 1);
		assert.equal(delivery[0]!.status, "failed");
		assert.equal((delivery[0] as import("../src/team/types.js").TeamTaskTypedConnectionDeliveryOutcome).connectionId, connection.connectionId);
		assert.equal(delivery[0]!.toTaskId, targetTask.taskId);
		assert.equal(delivery[0]!.downstreamRunId, undefined);
		assert.ok(delivery[0]!.error, "error must be recorded");
		assert.match(delivery[0]!.error!, /active task run already exists/);

		// Let the gated worker proceed so cleanup can succeed
		gatedWorkerProceed();
		await waitForTerminalRun(service, preCreatedRun.runId);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("downstream connection listing failure does not fail accepted upstream run", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-listing-fail-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "制作 HTML 页面。" },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须包含 HTML"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_md",
		});

		// Monkey-patch listFromTask to simulate corrupt JSON / store failure
		connectionStore.listFromTask = async () => {
			throw new Error("task connection store contains invalid JSON");
		};

		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(sourceTask.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed", `upstream must remain completed despite connection listing failure, got "${finished.status}"`);
		assert.equal(finished.taskStates[sourceTask.taskId]?.status, "succeeded");

		// Settle then re-read to confirm no late reversal of the accepted run
		await new Promise(resolve => setTimeout(resolve, 200));
		const settled = await service.getRun(created.runId);
		assert.ok(settled);
		assert.equal(settled!.status, "completed", `upstream must still be completed after settle, got "${settled!.status}"`);
		assert.notEqual(settled!.lastError, "task connection store contains invalid JSON", "lastError must not reflect the listing failure");
		assert.ok(!settled!.lastError || settled!.lastError !== "task connection store contains invalid JSON");
	} finally {
		await new Promise(resolve => setTimeout(resolve, 100));
		await rm(root, { recursive: true, force: true });
	}
});

test("delivery outcome persistence failure does not fail accepted upstream run", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-persist-fail-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "制作 HTML 页面。" },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须包含 HTML"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_md",
		});
		await taskStore.update(targetTask.taskId, {
			workUnit: {
				...targetTask.workUnit,
				inputPorts: [{ id: "source_md", label: "HTML input", type: "html" }],
			},
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let recordAttemptDeliveryOutcomesCalled = false;
		// Monkey-patch recordAttemptDeliveryOutcomes to simulate persistence failure
		workspace.recordAttemptDeliveryOutcomes = async () => {
			recordAttemptDeliveryOutcomesCalled = true;
			throw new Error("disk full: delivery outcome write failed");
		};

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(sourceTask.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed", `upstream must remain completed despite delivery persistence failure, got "${finished.status}"`);
		assert.equal(finished.taskStates[sourceTask.taskId]?.status, "succeeded");

		// Settle then re-read to confirm no late reversal of the accepted run
		await new Promise(resolve => setTimeout(resolve, 200));
		const settled = await service.getRun(created.runId);
		assert.ok(settled);
		assert.equal(settled!.status, "completed", `upstream must still be completed after settle, got "${settled!.status}"`);
		assert.equal(recordAttemptDeliveryOutcomesCalled, true);
		const downstreamRuns = await service.listRuns(targetTask.taskId);
		assert.deepEqual(downstreamRuns, []);
	} finally {
		await new Promise(resolve => setTimeout(resolve, 100));
		await rm(root, { recursive: true, force: true });
	}
});

test("downstream worker receives bound input prompt and payload from upstream typed artifact", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-handoff-int-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "制作 HTML 页面。" },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须包含 HTML"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connection = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_md",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));

		let capturedWorkerInput: WorkerInput | undefined;

		class CaptureWorkerInputRunner implements TeamRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				capturedWorkerInput = input;
				return { content: "downstream worker result", artifactRefs: [] };
			}
			async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
				return { verdict: "pass", reason: "ok", resultContent: "accepted result" };
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
				return new CaptureWorkerInputRunner();
			},
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");

		const upstreamAttempts = await workspace.listAttempts(upstreamRun.runId, sourceTask.taskId);
		assert.equal(upstreamAttempts.length, 1);
		const upstreamAttemptId = upstreamAttempts[0]!.attemptId;

		const downstreamRuns = await waitForTaskRuns(service, targetTask.taskId, 1);
		const downstreamFinished = await waitForTerminalRun(service, downstreamRuns[0]!.runId);
		assert.equal(downstreamFinished.status, "completed");

		assert.ok(capturedWorkerInput, "downstream worker input should have been captured");
		const inputText = capturedWorkerInput!.task.input.text;
		assert.match(inputText, /制作 HTML 页面。/);
		assert.match(inputText, /typed artifact/);
		assert.match(inputText, new RegExp("connectionId: " + connection.connectionId));
		assert.match(inputText, /inputPortId: source_md/);

		const boundInputPayload = capturedWorkerInput!.task.input.payload as { boundInputs?: Array<{ artifact: { artifactId: string; workspaceFileRef?: string } }> } | undefined;
		const artifactId = boundInputPayload!.boundInputs![0]!.artifact.artifactId;
		assert.match(inputText, new RegExp("artifactId: " + artifactId));
		assert.match(inputText, new RegExp("sourceTaskId: " + sourceTask.taskId));
		assert.match(inputText, new RegExp("sourceRunId: " + upstreamRun.runId));
		assert.match(inputText, new RegExp("sourceAttemptId: " + upstreamAttemptId));
		assert.match(inputText, /sourceOutputPortId: draft_md/);
		assert.match(inputText, /fileRef:/);
		assert.match(inputText, new RegExp("BEGIN_TYPED_ARTIFACT_PREVIEW " + artifactId));
		assert.match(inputText, new RegExp("END_TYPED_ARTIFACT_PREVIEW " + artifactId));
		assert.match(inputText, /workspaceFileRef:/);
		assert.match(inputText, /accepted result/);
		const workspaceFileRef = boundInputPayload!.boundInputs![0]!.artifact.workspaceFileRef;
		assert.ok(workspaceFileRef, "workspaceFileRef should be materialized before worker runs");
		assert.equal(await readFile(join(capturedWorkerInput!.workDir, workspaceFileRef), "utf8"), "accepted result");

		const payload = capturedWorkerInput!.task.input.payload as { boundInputs?: Array<{ inputPortId: string }> } | undefined;
		assert.ok(payload?.boundInputs, "payload should contain boundInputs");
		assert.equal(payload!.boundInputs!.length, 1);
		assert.equal(payload!.boundInputs![0]!.inputPortId, "source_md");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("downstream worker receives public worker JSON for typed artifact instead of accepted summary", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-handoff-public-json-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "结构化数据采集",
			workUnit: {
				...validTaskInput.workUnit,
				title: "结构化数据采集",
				outputPorts: [{ id: "structured_json", label: "Structured JSON", type: "json" }],
				outputContract: { text: "输出 JSON object。" },
				acceptance: { rules: ["必须是合法 JSON"] },
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "根据上游 JSON 制作 HTML 页面。" },
				inputPorts: [{ id: "source_json", label: "Source JSON", type: "json" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须使用上游 JSON"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connection = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "structured_json",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_json",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedDownstreamInput: WorkerInput | undefined;

		class PublicJsonRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === sourceTask.taskId) {
					assert.ok(input.artifactPublicDir);
					await writeFile(
						join(input.artifactPublicDir, "structured-report.json"),
						JSON.stringify({ reportId: "real-json", rows: [{ title: "真实结构化数据" }] }),
						"utf8",
					);
					return { content: "worker wrote structured-report.json", artifactRefs: [] };
				}
				if (input.task.id === targetTask.taskId) {
					capturedDownstreamInput = input;
					return { content: "downstream worker result", artifactRefs: [] };
				}
				return super.runWorker(input as ProcessAwareWorkerInput);
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.id === sourceTask.taskId) {
					return { verdict: "pass", reason: "ok", resultContent: "合法 JSON，81KB，验收通过。" };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted downstream" };
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new PublicJsonRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");
		const downstreamRuns = await waitForTaskRuns(service, targetTask.taskId, 1);
		const downstreamFinished = await waitForTerminalRun(service, downstreamRuns[0]!.runId);
		assert.equal(downstreamFinished.status, "completed");

		const boundInput = downstreamFinished.source?.boundInputs?.[0];
		assert.ok(boundInput, "downstream run must persist bound input");
		assert.equal(boundInput.connectionId, connection.connectionId);
		const artifact = boundInput.artifact as import("../src/team/types.js").TeamTaskTypedArtifact;
		assert.equal(artifact.type, "json");
		assert.match(artifact.fileRef, /agent-workspaces\/attempt_[^/]+\/worker\/output\/structured-report\.json$/);
		assert.doesNotMatch(artifact.fileRef, /accepted-result\.md$/);
		const parsed = JSON.parse(artifact.content ?? artifact.preview);
		assert.equal(parsed.reportId, "real-json");
		assert.equal(parsed.rows[0].title, "真实结构化数据");
		assert.doesNotMatch(artifact.content ?? artifact.preview, /验收通过/);

		assert.ok(capturedDownstreamInput, "downstream worker input should be captured");
		const payload = capturedDownstreamInput!.task.input.payload as { boundInputs?: Array<{ artifact: { fileRef: string; content?: string; preview: string; workspaceFileRef?: string; workspaceFilePath?: string } }> } | undefined;
		const payloadArtifact = payload?.boundInputs?.[0]?.artifact;
		assert.ok(payloadArtifact, "downstream payload must include typed artifact");
		assert.equal(payloadArtifact.fileRef, artifact.fileRef);
		assert.equal(JSON.parse(payloadArtifact.content ?? payloadArtifact.preview).reportId, "real-json");
		assert.ok(payloadArtifact.workspaceFileRef, "workspaceFileRef should point to the complete input file");
		assert.ok(payloadArtifact.workspaceFilePath, "workspaceFilePath should point to the complete input file");
		const materializedContent = await readFile(join(capturedDownstreamInput!.workDir, payloadArtifact.workspaceFileRef), "utf8");
		assert.equal(JSON.parse(materializedContent).reportId, "real-json");
		assert.match(capturedDownstreamInput!.task.input.text, /真实结构化数据/);
		assert.doesNotMatch(capturedDownstreamInput!.task.input.text, /验收通过/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("downstream worker receives public worker worklist for worklist typed artifact", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-handoff-worklist-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "清单生成",
			workUnit: {
				...validTaskInput.workUnit,
				title: "清单生成",
				outputPorts: [{ id: "worklist_out", label: "Worklist", type: "worklist" }],
				outputContract: { text: "输出 worklist JSON。" },
				acceptance: { rules: ["必须是合法 worklist"] },
			},
		});
		const targetTask = await taskStore.create({
			title: "分片执行",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "分片执行",
				input: { text: "根据上游 worklist 执行。" },
				inputPorts: [{ id: "source_worklist", label: "Worklist", type: "worklist" }],
				outputContract: { text: "输出结果。" },
				acceptance: { rules: ["必须使用上游 worklist"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "worklist_out",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_worklist",
		});

		const validWorklist = JSON.stringify({
			schemaVersion: "team/worklist-1",
			worklistId: "worklist_news",
			title: "News chunks",
			items: [{ id: "chunk-001", title: "Chunk 1", input: { rows: [1] } }],
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));

		class WorklistRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === sourceTask.taskId) {
					await writeFile(join(input.artifactPublicDir!, "worklist.json"), validWorklist, "utf8");
					return { content: "worker wrote worklist.json", artifactRefs: [] };
				}
				return { content: "downstream worker result", artifactRefs: [] };
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.id === sourceTask.taskId) {
					return { verdict: "pass", reason: "ok", resultContent: "accepted summary that is not JSON" };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted downstream" };
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new WorklistRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");
		const downstreamRuns = await waitForTaskRuns(service, targetTask.taskId, 1);
		const downstreamFinished = await waitForTerminalRun(service, downstreamRuns[0]!.runId);
		assert.equal(downstreamFinished.status, "completed");
		const artifact = downstreamFinished.source?.boundInputs?.[0]?.artifact as import("../src/team/types.js").TeamTaskTypedArtifact;
		assert.equal(artifact.type, "worklist");
		assert.match(artifact.fileRef, /worklist\.json$/);
		assert.equal(JSON.parse(artifact.content ?? artifact.preview).schemaVersion, "team/worklist-1");
		assert.doesNotMatch(artifact.content ?? artifact.preview, /accepted summary/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("outputPath selects the canonical worklist artifact when multiple worker JSON files exist", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-handoff-worklist-output-path-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "清单生成 outputPath",
			workUnit: {
				...validTaskInput.workUnit,
				title: "清单生成 outputPath",
				outputPorts: [{ id: "worklist_out", label: "Worklist", type: "worklist" }],
				outputCheck: { type: "worklist" },
				outputContract: { text: "输出 worklist JSON 文件，并在最终消息返回 outputPath。" },
				acceptance: { rules: ["必须是合法 worklist"] },
			},
		});
		const targetTask = await taskStore.create({
			title: "分片执行 outputPath",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "分片执行 outputPath",
				input: { text: "根据上游 worklist 执行。" },
				inputPorts: [{ id: "source_worklist", label: "Worklist", type: "worklist" }],
				outputContract: { text: "输出结果。" },
				acceptance: { rules: ["必须使用上游 worklist"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "worklist_out",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_worklist",
		});

		const staleWorklist = JSON.stringify({
			schemaVersion: "team/worklist-1",
			worklistId: "stale_worklist",
			title: "Stale worklist",
			items: [{ id: "stale-001", title: "Stale chunk", input: { rows: ["stale"] } }],
		});
		const selectedWorklist = JSON.stringify({
			schemaVersion: "team/worklist-1",
			worklistId: "selected_worklist",
			title: "Selected worklist",
			items: [{ id: "selected-001", title: "Selected chunk", input: { rows: ["selected"] } }],
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));

		class OutputPathWorklistRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === sourceTask.taskId) {
					await writeFile(join(input.artifactPublicDir!, "aaa-stale-worklist.json"), staleWorklist, "utf8");
					await writeFile(join(input.artifactPublicDir!, "selected-worklist.json"), selectedWorklist, "utf8");
					return { content: JSON.stringify({ outputPath: "output/selected-worklist.json" }), artifactRefs: [] };
				}
				return { content: "downstream worker result", artifactRefs: [] };
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.id === sourceTask.taskId) {
					return { verdict: "pass", reason: "ok", resultContent: "accepted summary that is not JSON" };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted downstream" };
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new OutputPathWorklistRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");
		const downstreamRuns = await waitForTaskRuns(service, targetTask.taskId, 1);
		const downstreamFinished = await waitForTerminalRun(service, downstreamRuns[0]!.runId);
		assert.equal(downstreamFinished.status, "completed");
		const upstreamTaskState = upstreamFinished.taskStates[sourceTask.taskId]!;
		assert.match(upstreamTaskState.resultRef ?? "", /selected-worklist\.json$/);
		const artifact = downstreamFinished.source?.boundInputs?.[0]?.artifact as import("../src/team/types.js").TeamTaskTypedArtifact;
		assert.equal(artifact.type, "worklist");
		assert.match(artifact.fileRef, /selected-worklist\.json$/);
		assert.equal(JSON.parse(artifact.content ?? artifact.preview).worklistId, "selected_worklist");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("worklist typed artifact falls back to accepted result when public JSON is invalid", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-handoff-worklist-fallback-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "清单生成 fallback",
			workUnit: {
				...validTaskInput.workUnit,
				title: "清单生成 fallback",
				outputPorts: [{ id: "worklist_out", label: "Worklist", type: "worklist" }],
				outputContract: { text: "输出 worklist JSON。" },
				acceptance: { rules: ["必须是合法 worklist"] },
			},
		});
		const targetTask = await taskStore.create({
			title: "分片执行 fallback",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "分片执行 fallback",
				input: { text: "根据上游 worklist 执行。" },
				inputPorts: [{ id: "source_worklist", label: "Worklist", type: "worklist" }],
				outputContract: { text: "输出结果。" },
				acceptance: { rules: ["必须使用上游 worklist"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "worklist_out",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_worklist",
		});

		const acceptedWorklist = JSON.stringify({
			schemaVersion: "team/worklist-1",
			worklistId: "worklist_accepted",
			title: "Accepted worklist",
			items: [{ id: "chunk-001", title: "Chunk 1", input: { rows: [1] } }],
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));

		class WorklistFallbackRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === sourceTask.taskId) {
					await writeFile(join(input.artifactPublicDir!, "invalid-worklist.json"), JSON.stringify({ not: "a worklist" }), "utf8");
					return { content: "worker wrote invalid-worklist.json", artifactRefs: [] };
				}
				return { content: "downstream worker result", artifactRefs: [] };
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.id === sourceTask.taskId) {
					return { verdict: "pass", reason: "ok", resultContent: acceptedWorklist };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted downstream" };
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new WorklistFallbackRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");
		const downstreamRuns = await waitForTaskRuns(service, targetTask.taskId, 1);
		const downstreamFinished = await waitForTerminalRun(service, downstreamRuns[0]!.runId);
		assert.equal(downstreamFinished.status, "completed");
		const artifact = downstreamFinished.source?.boundInputs?.[0]?.artifact as import("../src/team/types.js").TeamTaskTypedArtifact;
		assert.equal(artifact.type, "worklist");
		assert.match(artifact.fileRef, /accepted-result\.md$/);
		assert.equal(JSON.parse(artifact.content ?? artifact.preview).worklistId, "worklist_accepted");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("downstream worker receives oversized typed artifact as materialized workspace file", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-handoff-large-json-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "大体量结构化数据采集",
			workUnit: {
				...validTaskInput.workUnit,
				title: "大体量结构化数据采集",
				outputPorts: [{ id: "structured_json", label: "Structured JSON", type: "json" }],
				outputContract: { text: "输出 JSON object。" },
				acceptance: { rules: ["必须是合法 JSON"] },
			},
		});
		const targetTask = await taskStore.create({
			title: "大体量 HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "大体量 HTML 制作",
				input: { text: "根据上游完整 JSON 制作 HTML 页面。" },
				inputPorts: [{ id: "source_json", label: "Source JSON", type: "json" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须使用上游完整 JSON"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "structured_json",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_json",
		});

		const oversizedJson = JSON.stringify({
			reportId: "large-json",
			rows: Array.from({ length: 80 }, (_, index) => ({
				id: `row-${index + 1}`,
				title: `真实结构化数据 ${index + 1}`,
				body: "x".repeat(800),
			})),
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedDownstreamInput: WorkerInput | undefined;

		class LargeJsonRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === sourceTask.taskId) {
					assert.ok(input.artifactPublicDir);
					await writeFile(join(input.artifactPublicDir, "structured-report.json"), oversizedJson, "utf8");
					return { content: "worker wrote large structured-report.json", artifactRefs: [] };
				}
				if (input.task.id === targetTask.taskId) {
					capturedDownstreamInput = input;
					return { content: "downstream worker result", artifactRefs: [] };
				}
				return super.runWorker(input as ProcessAwareWorkerInput);
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.id === sourceTask.taskId) {
					return { verdict: "pass", reason: "ok", resultContent: "合法大 JSON，验收通过。" };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted downstream" };
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new LargeJsonRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");
		const downstreamRuns = await waitForTaskRuns(service, targetTask.taskId, 1);
		const downstreamFinished = await waitForTerminalRun(service, downstreamRuns[0]!.runId);
		assert.equal(downstreamFinished.status, "completed");

		assert.ok(capturedDownstreamInput, "downstream worker input should be captured");
		const payload = capturedDownstreamInput!.task.input.payload as {
			boundInputs?: Array<{
				artifact: {
					content?: string;
					contentTruncated?: boolean;
					originalContentLength?: number;
					workspaceFileRef?: string;
					workspaceFilePath?: string;
				};
			}>;
		} | undefined;
		const payloadArtifact = payload?.boundInputs?.[0]?.artifact;
		assert.ok(payloadArtifact, "downstream payload must include typed artifact");
		assert.equal(payloadArtifact.contentTruncated, true);
		assert.equal(payloadArtifact.originalContentLength, oversizedJson.length);
		assert.ok(payloadArtifact.content, "truncated preview content should remain available");
		assert.ok(payloadArtifact.content.length < oversizedJson.length);
		assert.ok(payloadArtifact.workspaceFileRef, "workspaceFileRef should point to the complete materialized input");
		assert.ok(payloadArtifact.workspaceFilePath, "workspaceFilePath should point to the complete materialized input");
		const materializedContent = await readFile(join(capturedDownstreamInput!.workDir, payloadArtifact.workspaceFileRef), "utf8");
		const materializedJson = JSON.parse(materializedContent);
		assert.equal(materializedJson.reportId, "large-json");
		assert.equal(materializedJson.rows.length, 80);
		assert.match(capturedDownstreamInput!.task.input.text, /完整绑定输入文件/);
		assert.match(capturedDownstreamInput!.task.input.text, /workspaceFileRef:/);
		assert.match(capturedDownstreamInput!.task.input.text, /不得从预览片段重建/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("manual upstream run selection binds public worker JSON instead of accepted summary", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-manual-public-json-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "结构化数据采集",
			workUnit: {
				...validTaskInput.workUnit,
				title: "结构化数据采集",
				outputPorts: [{ id: "structured_json", label: "Structured JSON", type: "json" }],
				outputContract: { text: "输出 JSON object。" },
				acceptance: { rules: ["必须是合法 JSON"] },
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "根据指定历史 run 的 JSON 制作 HTML 页面。" },
				inputPorts: [{ id: "source_json", label: "Source JSON", type: "json" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须使用上游 JSON"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connection = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "structured_json",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_json",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedManualInput: WorkerInput | undefined;

		class ManualPublicJsonRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === sourceTask.taskId) {
					assert.ok(input.artifactPublicDir);
					await writeFile(
						join(input.artifactPublicDir, "structured-report.json"),
						JSON.stringify({ reportId: "selected-run-json", rows: [{ title: "被手动选择的真实数据" }] }),
						"utf8",
					);
					return { content: "worker wrote selected structured report", artifactRefs: [] };
				}
				if (input.task.id === targetTask.taskId) {
					capturedManualInput = input;
					return { content: "manual downstream worker result", artifactRefs: [] };
				}
				return super.runWorker(input as ProcessAwareWorkerInput);
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.id === sourceTask.taskId) {
					return { verdict: "pass", reason: "ok", resultContent: "合法 JSON，验收摘要，不是机器数据。" };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted downstream" };
			}
		}

		const serviceWithoutConnections = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ManualPublicJsonRunner(),
			dataDir: join(root, "task-runs"),
		});
		const upstreamRun = await serviceWithoutConnections.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(serviceWithoutConnections, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ManualPublicJsonRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});
		const manualRun = await service.createRun(targetTask.taskId, {
			upstreamRunSelections: [{ connectionId: connection.connectionId, fromRunId: upstreamRun.runId }],
		});
		const manualFinished = await waitForTerminalRun(service, manualRun.runId);
		assert.equal(manualFinished.status, "completed");
		assert.equal(manualFinished.source?.triggeredBy, undefined);

		const boundInput = manualFinished.source?.boundInputs?.[0];
		assert.ok(boundInput, "manual downstream run must persist bound input");
		const artifact = boundInput.artifact as import("../src/team/types.js").TeamTaskTypedArtifact;
		assert.equal(artifact.sourceRunId, upstreamRun.runId);
		assert.match(artifact.fileRef, /agent-workspaces\/attempt_[^/]+\/worker\/output\/structured-report\.json$/);
		assert.doesNotMatch(artifact.fileRef, /accepted-result\.md$/);
		assert.equal(JSON.parse(artifact.content ?? artifact.preview).reportId, "selected-run-json");
		assert.doesNotMatch(artifact.content ?? artifact.preview, /验收摘要/);

		assert.ok(capturedManualInput, "manual downstream worker input should be captured");
		const payload = capturedManualInput!.task.input.payload as { boundInputs?: Array<{ artifact: { fileRef: string; content?: string; preview: string } }> } | undefined;
		const payloadArtifact = payload?.boundInputs?.[0]?.artifact;
		assert.ok(payloadArtifact, "manual downstream payload must include typed artifact");
		assert.equal(payloadArtifact.fileRef, artifact.fileRef);
		assert.equal(JSON.parse(payloadArtifact.content ?? payloadArtifact.preview).reportId, "selected-run-json");
		assert.match(capturedManualInput!.task.input.text, /被手动选择的真实数据/);
		assert.doesNotMatch(capturedManualInput!.task.input.text, /验收摘要/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
