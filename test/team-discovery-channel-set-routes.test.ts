import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildServer } from "../src/server.js";
import type { AgentService } from "../src/agent/agent-service.js";
import { TaskStore } from "../src/team/task-store.js";

function createAgentServiceStub() {
	return {
		chat: async () => ({ reply: "ok", conversationId: "c1", runId: "r1" }),
		streamChat: async () => {},
		queueMessage: async () => ({ reply: "ok", conversationId: "c1", runId: "r1" }),
		interruptChat: async () => {},
		resetConversation: async () => {},
		getAgentRunStatus: async () => ({ conversationId: "c1", running: false }),
		getRunStatus: async () => ({ conversationId: "c1", running: false, contextUsage: { provider: "p", model: "m", currentTokens: 0, contextWindow: 128000, reserveTokens: 16000, maxResponseTokens: 8000, availableTokens: 112000, percent: 0, status: "safe" as const, mode: "usage" as const } }),
		subscribeRunEvents: () => ({ conversationId: "c1", running: false, unsubscribe: () => {} }),
		getRunEvents: async () => [],
		getConversations: async () => [],
		getConversation: async () => null,
		createConversation: async () => ({ id: "c1", title: "t", createdAt: "", updatedAt: "" }),
		switchConversation: async () => {},
		deleteConversation: async () => {},
	} as unknown as AgentService;
}

async function buildTestServer() {
	const root = await mkdtemp(join(tmpdir(), "team-discovery-channel-set-api-"));
	const teamDir = join(root, "team");
	process.env.TEAM_RUNTIME_ENABLED = "true";
	process.env.TEAM_DATA_DIR = teamDir;
	process.env.UGK_AGENT_DATA_DIR = join(root, "agent");
	process.env.CONN_DATABASE_PATH = join(root, "conn", "conn.sqlite");
	const app = await buildServer({ agentService: createAgentServiceStub() });
	return { app, root, teamDir };
}

const taskPayload = {
	title: "调查 Medtrum 相关云服务器资产",
	leaderAgentId: "main",
	status: "ready" as const,
	workUnit: {
		title: "调查 Medtrum 相关云服务器资产",
		input: { text: "围绕 Medtrum 相关公开云服务器资产进行搜索和证据整理。" },
		outputContract: { text: "输出中文 Markdown 报告，包含发现列表、证据来源和风险说明。" },
		acceptance: { rules: ["每条发现必须包含来源", "不确定项不能编造成结论"] },
		workerAgentId: "search",
		checkerAgentId: "main",
	},
};

const discoverySpec = {
	schemaVersion: "team/discovery-spec-1" as const,
	discoveryGoal: "发现 Medtrum 相关公开渠道。",
	outputKey: "items",
	itemIdField: "id" as const,
	requiredItemFields: ["id"],
	recommendedItemFields: ["title", "url"],
	dispatchGoal: "逐项核查渠道公开证据。",
	dispatcherAgentId: "main",
	generatedWorkerAgentId: "search",
	generatedCheckerAgentId: "main",
	autoRun: { enabled: true as const, concurrency: 3 as const },
};

async function createDiscoveryTask(app: Awaited<ReturnType<typeof buildTestServer>>["app"]) {
	const res = await app.inject({
		method: "POST",
		url: "/v1/team/tasks",
		payload: {
			...taskPayload,
			canvasKind: "discovery",
			discoverySpec,
		},
	});
	assert.equal(res.statusCode, 201);
	return res.json().task;
}

async function createNormalTask(app: Awaited<ReturnType<typeof buildTestServer>>["app"]) {
	const res = await app.inject({
		method: "POST",
		url: "/v1/team/tasks",
		payload: taskPayload,
	});
	assert.equal(res.statusCode, 201);
	return res.json().task;
}

async function seedGeneratedTask(
	teamDir: string,
	sourceDiscoveryTaskId: string,
	sourceItemId: string,
	options: { archived?: boolean } = {},
) {
	const store = new TaskStore(teamDir, { getAgentIds: () => ["main", "search"] });
	const task = await store.create({
		...taskPayload,
		title: `Generated ${sourceItemId}`,
		workUnit: {
			...taskPayload.workUnit,
			title: `核查渠道 ${sourceItemId}`,
			input: { text: `重新核查渠道 ${sourceItemId}。` },
		},
		generatedSource: {
			schemaVersion: "team/generated-task-source-1",
			sourceDiscoveryTaskId,
			sourceItemId,
			itemStatus: "active",
			itemPayload: { id: sourceItemId, title: `Channel ${sourceItemId}`, url: `https://${sourceItemId}.example.test` },
			latestDiscoveryRunId: `run_${sourceItemId}`,
			latestDiscoveryAttemptId: `attempt_${sourceItemId}`,
			latestDiscoveredAt: "2026-06-07T00:00:00.000Z",
			workUnitMode: "managed",
			latestManagedWorkUnit: {
				...taskPayload.workUnit,
				title: `核查渠道 ${sourceItemId}`,
				input: { text: `重新核查渠道 ${sourceItemId}。` },
			},
		},
		status: "ready",
	});
	return options.archived ? await store.archive(task.taskId) : task;
}

test("Discovery channel sets persist selected generated item snapshots", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const discovery = await createDiscoveryTask(app);
		const a = await seedGeneratedTask(teamDir, discovery.taskId, "a");
		const b = await seedGeneratedTask(teamDir, discovery.taskId, "b");

		const create = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${discovery.taskId}/discovery-channel-sets`,
			payload: { title: "常用渠道", generatedTaskIds: [a.taskId, b.taskId] },
		});

		assert.equal(create.statusCode, 201);
		const channelSet = create.json().channelSet;
		assert.equal(channelSet.schemaVersion, "team/discovery-channel-set-1");
		assert.equal(channelSet.sourceDiscoveryTaskId, discovery.taskId);
		assert.equal(channelSet.title, "常用渠道");
		assert.equal(channelSet.archived, false);
		assert.deepEqual(channelSet.items.map((item: { sourceItemId: string }) => item.sourceItemId), ["a", "b"]);
		assert.deepEqual(channelSet.items.map((item: { generatedTaskId: string }) => item.generatedTaskId), [a.taskId, b.taskId]);
		assert.equal(channelSet.items[0].itemPayload.title, "Channel a");
		assert.equal(channelSet.items[0].workUnitSnapshot.title, "核查渠道 a");

		const list = await app.inject({
			method: "GET",
			url: `/v1/team/tasks/${discovery.taskId}/discovery-channel-sets`,
		});
		assert.equal(list.statusCode, 200);
		assert.deepEqual(list.json().channelSets.map((set: { channelSetId: string }) => set.channelSetId), [channelSet.channelSetId]);

		const archive = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${discovery.taskId}/discovery-channel-sets/${channelSet.channelSetId}/archive`,
		});
		assert.equal(archive.statusCode, 200);
		assert.equal(archive.json().channelSet.archived, true);

		const afterArchive = await app.inject({
			method: "GET",
			url: `/v1/team/tasks/${discovery.taskId}/discovery-channel-sets`,
		});
		assert.equal(afterArchive.statusCode, 200);
		assert.deepEqual(afterArchive.json().channelSets, []);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("Discovery channel sets reject invalid generated selections", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const discovery = await createDiscoveryTask(app);
		const otherDiscovery = await createDiscoveryTask(app);
		const normal = await createNormalTask(app);
		const localGenerated = await seedGeneratedTask(teamDir, discovery.taskId, "local");
		const crossGenerated = await seedGeneratedTask(teamDir, otherDiscovery.taskId, "cross");
		const archivedGenerated = await seedGeneratedTask(teamDir, discovery.taskId, "archived", { archived: true });

		const empty = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${discovery.taskId}/discovery-channel-sets`,
			payload: { title: "空", generatedTaskIds: [] },
		});
		assert.equal(empty.statusCode, 400);
		assert.match(empty.json().error, /generatedTaskIds/i);

		const nonDiscovery = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${normal.taskId}/discovery-channel-sets`,
			payload: { title: "普通任务不能建", generatedTaskIds: [localGenerated.taskId] },
		});
		assert.equal(nonDiscovery.statusCode, 400);
		assert.match(nonDiscovery.json().error, /Discovery/);

		const cross = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${discovery.taskId}/discovery-channel-sets`,
			payload: { title: "跨 root", generatedTaskIds: [crossGenerated.taskId] },
		});
		assert.equal(cross.statusCode, 400);
		assert.match(cross.json().error, /does not belong/);

		const archived = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${discovery.taskId}/discovery-channel-sets`,
			payload: { title: "归档项", generatedTaskIds: [archivedGenerated.taskId] },
		});
		assert.equal(archived.statusCode, 409);
		assert.match(archived.json().error, /archived/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});
