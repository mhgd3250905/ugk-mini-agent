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
	DiscoveryDispatchInput,
	DiscoveryDispatchOutput,
	WorkerInput,
	WorkerOutput,
} from "../src/team/role-runner.js";
import {
	ProcessEventRoleRunner,
	validDiscoverySpec,
	validTaskInput,
	waitForTaskRuns,
	waitForTerminalRun,
} from "./team-task-run-process-helpers.js";

test("Discovery downstream receives aggregation when accepted result is a worker file reference", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-discovery-downstream-json-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "发现论坛来源",
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
			workUnit: {
				...validTaskInput.workUnit,
				title: "发现论坛来源",
				input: { text: "发现并输出论坛来源 JSON。" },
				outputPorts: [{ id: "forum_sources", label: "Forum sources", type: "json" }],
				outputContract: { text: "输出 JSON object，vendors 为数组，每项包含稳定 id。" },
				acceptance: { rules: ["vendors 必须是数组", "每项必须有 id"] },
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
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "forum_sources",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_json",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedDownstreamInput: WorkerInput | undefined;

		class ReferencedDiscoveryResultRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.type === "discovery") {
					const workerDir = join(root, "task-runs", "runs", input.runId, "agent-workspaces", input.attemptId, "worker");
					await mkdir(workerDir, { recursive: true });
					await writeFile(
						join(workerDir, "forum-sources.json"),
						JSON.stringify({ vendors: [{ id: "vultr", name: "Vultr" }] }),
						"utf8",
					);
					return { content: "worker/forum-sources.json", artifactRefs: [] };
				}
				if (input.task.title === "HTML 制作") {
					capturedDownstreamInput = input;
					return { content: "downstream worker result", artifactRefs: [] };
				}
				return { content: `generated ${input.task.id} result`, artifactRefs: [] };
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.type === "discovery") {
					return { verdict: "pass", reason: "ok", resultContent: "worker/forum-sources.json" };
				}
				return { verdict: "pass", reason: "ok", resultContent: `${input.task.id} accepted` };
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
			createRoleRunner: () => new ReferencedDiscoveryResultRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");

		const upstreamAttempts = await workspace.listAttempts(upstreamRun.runId, sourceTask.taskId);
		const upstreamAttempt = upstreamAttempts[0]!;
		assert.equal(await workspace.readAttemptFile(upstreamRun.runId, sourceTask.taskId, upstreamAttempt.attemptId, "accepted-result.md"), "worker/forum-sources.json");

		const downstreamRuns = await waitForTaskRuns(service, targetTask.taskId, 1);
		const downstreamFinished = await waitForTerminalRun(service, downstreamRuns[0]!.runId);
		assert.equal(downstreamFinished.status, "completed");

		assert.ok(capturedDownstreamInput, "downstream worker input should have been captured");
		const boundInputPayload = capturedDownstreamInput!.task.input.payload as { boundInputs?: Array<{ artifact: { fileRef: string; content?: string; preview: string; workspaceFileRef?: string } }> } | undefined;
		const artifact = boundInputPayload!.boundInputs![0]!.artifact;
		assert.equal(artifact.fileRef, `tasks/${sourceTask.taskId}/attempts/${upstreamAttempt.attemptId}/discovery-aggregation.json`);
		assert.notEqual(artifact.content, "worker/forum-sources.json");
		const aggregation = JSON.parse(artifact.content ?? "");
		assert.equal(aggregation.schemaVersion, "team/discovery-aggregation-1");
		assert.equal(aggregation.sourceResultRef, `tasks/${sourceTask.taskId}/attempts/${upstreamAttempt.attemptId}/discovery-result.json`);
		assert.equal(aggregation.items[0]?.itemId, "vultr");
		assert.equal(aggregation.items[0]?.result?.status, "succeeded");
		assert.doesNotMatch(artifact.content ?? "", /worker\/forum-sources\.json/);
		assert.ok(artifact.workspaceFileRef, "workspaceFileRef should point to materialized aggregation");
		const materializedAggregation = JSON.parse(await readFile(join(capturedDownstreamInput!.workDir, artifact.workspaceFileRef), "utf8"));
		assert.equal(materializedAggregation.items[0]?.itemId, "vultr");
		assert.match(capturedDownstreamInput!.task.input.text, /BEGIN_TYPED_ARTIFACT_PREVIEW/);
		assert.match(capturedDownstreamInput!.task.input.text, /workspaceFileRef:/);
		assert.match(capturedDownstreamInput!.task.input.text, /discovery-aggregation\.json/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Discovery downstream receives aggregated generated child results after auto-runs finish", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-discovery-downstream-aggregation-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "发现论坛来源",
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
			workUnit: {
				...validTaskInput.workUnit,
				title: "发现论坛来源",
				input: { text: "发现并输出论坛来源 JSON。" },
				outputPorts: [{ id: "forum_sources", label: "Forum sources", type: "json" }],
				outputContract: { text: "输出 JSON object，vendors 为数组，每项包含稳定 id。" },
				acceptance: { rules: ["vendors 必须是数组", "每项必须有 id"] },
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
				acceptance: { rules: ["必须使用 generated child 搜索结果"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "forum_sources",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_json",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedDownstreamInput: WorkerInput | undefined;

		class AggregatingDiscoveryRunner extends ProcessEventRoleRunner {
			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.type === "discovery") {
					return {
						verdict: "pass",
						reason: "ok",
						resultContent: JSON.stringify({
							vendors: [
								{ id: "reddit", name: "Reddit" },
								{ id: "github", name: "GitHub" },
							],
						}),
					};
				}
				if (input.task.title === "HTML 制作") {
					return { verdict: "pass", reason: "ok", resultContent: "downstream accepted" };
				}
				const itemId = input.task.title.replace(/^核查\s+/, "");
				return {
					verdict: "pass",
					reason: "ok",
					resultContent: JSON.stringify({
						itemId,
						findings: [`${itemId} 用户反馈摘要`],
						sources: [`https://example.com/${itemId}`],
					}),
				};
			}

			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.type === "discovery") return { content: "root worker", artifactRefs: [] };
				if (input.task.title === "HTML 制作") {
					capturedDownstreamInput = input;
					return { content: "downstream worker result", artifactRefs: [] };
				}
				const itemId = input.task.title.replace(/^核查\s+/, "");
				return {
					content: JSON.stringify({ itemId, workerOnly: true }),
					artifactRefs: [],
				};
			}

			async runDiscoveryDispatcher(input: DiscoveryDispatchInput): Promise<DiscoveryDispatchOutput> {
				return {
					ok: true,
					itemId: input.itemId,
					workUnit: {
						title: `核查 ${input.itemId}`,
						input: { text: `核查 ${input.itemId} 的用户反馈` },
						outputContract: { text: `输出 ${input.itemId} 的结构化搜索结果。` },
						acceptance: { rules: [`结果必须覆盖 ${input.itemId}`] },
					},
				};
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new AggregatingDiscoveryRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");

		const upstreamAttempts = await workspace.listAttempts(upstreamRun.runId, sourceTask.taskId);
		const upstreamAttempt = upstreamAttempts[0]!;
		const downstreamRuns = await waitForTaskRuns(service, targetTask.taskId, 1);
		await waitForTerminalRun(service, downstreamRuns[0]!.runId);

		assert.ok(capturedDownstreamInput, "downstream worker input should have been captured");
		const boundInputPayload = capturedDownstreamInput!.task.input.payload as { boundInputs?: Array<{ artifact: { fileRef: string; content?: string; preview: string } }> } | undefined;
		const artifact = boundInputPayload!.boundInputs![0]!.artifact;
		assert.equal(artifact.fileRef, `tasks/${sourceTask.taskId}/attempts/${upstreamAttempt.attemptId}/discovery-aggregation.json`);
		assert.ok(artifact.content, "aggregation content should be included in the downstream prompt payload");
		const aggregation = JSON.parse(artifact.content!);
		assert.equal(aggregation.schemaVersion, "team/discovery-aggregation-1");
		assert.equal(aggregation.discoveryTaskId, sourceTask.taskId);
		assert.equal(aggregation.discoveryRunId, upstreamRun.runId);
		assert.equal(aggregation.discoveryAttemptId, upstreamAttempt.attemptId);
		assert.deepEqual(aggregation.summary, {
			totalItems: 2,
			generatedTasks: 2,
			succeeded: 2,
			failed: 0,
			cancelled: 0,
			skipped: 0,
			missingResult: 0,
		});
		assert.deepEqual(aggregation.items.map((item: { itemId: string }) => item.itemId), ["reddit", "github"]);
		assert.equal(aggregation.items[0].result.status, "succeeded");
		assert.match(aggregation.items[0].result.content, /reddit 用户反馈摘要/);
		assert.equal(aggregation.items[1].result.status, "succeeded");
		assert.match(aggregation.items[1].result.content, /github 用户反馈摘要/);
		assert.match(capturedDownstreamInput!.task.input.text, /discovery-aggregation\.json/);
		assert.match(capturedDownstreamInput!.task.input.text, /reddit 用户反馈摘要/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
