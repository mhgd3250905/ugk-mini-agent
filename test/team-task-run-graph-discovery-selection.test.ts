import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../src/team/task-store.js";
import { TaskConnectionStore } from "../src/team/task-connection-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { CanvasTaskRunService } from "../src/team/task-run-service.js";
import type {
	CheckerInput,
	CheckerOutput,
	DiscoveryDispatchInput,
	DiscoveryDispatchOutput,
	WorkerInput,
	WorkerOutput,
} from "../src/team/role-runner.js";
import {
	ProcessEventRoleRunner,
	removeTempRoot,
	validDiscoverySpec,
	validTaskInput,
	waitForTaskRuns,
	waitForTerminalRun,
} from "./team-task-run-process-helpers.js";

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
