import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentActivityStore } from "../src/agent/agent-activity-store.js";
import { writeStoredAgentProfileSummaries } from "../src/agent/agent-profile-catalog.js";
import { BackgroundAgentProfileResolver } from "../src/agent/background-agent-profile.js";
import { ConnDatabase } from "../src/agent/conn-db.js";
import type { ConnRunRecord } from "../src/agent/conn-run-store.js";
import { ConnRunStore } from "../src/agent/conn-run-store.js";
import { ConnSqliteStore } from "../src/agent/conn-sqlite-store.js";
import type { ConnDefinition } from "../src/agent/conn-store.js";
import type { NotificationBroadcastEvent } from "../src/agent/notification-hub.js";
import { ConnWorker, createBackgroundResourceLoader, resolveBackgroundSessionModel } from "../src/workers/conn-worker.js";

class FakeRunner {
	calls: Array<{ conn: ConnDefinition; run: ConnRunRecord }> = [];

	async run(conn: ConnDefinition, run: ConnRunRecord, now: Date): Promise<ConnRunRecord | undefined> {
		this.calls.push({ conn, run });
		return {
			...run,
			status: "succeeded",
			resultSummary: `summary for ${conn.title}`,
			resultText: `result for ${conn.title}`,
			resolvedSnapshot: {
				provider: conn.modelProvider ?? "xiaomi-mimo-cn",
				model: conn.modelId ?? "mimo-v2.5-pro",
			},
			finishedAt: now.toISOString(),
		};
	}
}

class FailingRunner {
	calls = 0;

	async run(_conn: ConnDefinition, run: ConnRunRecord, now: Date): Promise<ConnRunRecord | undefined> {
		this.calls += 1;
		return {
			...run,
			status: "failed",
			resultSummary: "boom",
			errorText: "boom",
			resolvedSnapshot: {
				provider: "xiaomi-mimo-cn",
				model: "mimo-v2.5-pro",
			},
			finishedAt: now.toISOString(),
		};
	}
}

test("resolveBackgroundSessionModel returns the model selected by the background snapshot", () => {
	const expectedModel = {
		provider: "deepseek",
		id: "deepseek-v4-pro",
		name: "DeepSeek V4 Pro",
		api: "openai-completions",
		baseUrl: "https://example.test",
		reasoning: true,
		contextWindow: 1000000,
		maxTokens: 384000,
		input: ["text"],
		output: ["text"],
	} as const;
	const calls: Array<{ provider: string; model: string }> = [];
	const modelRegistry = {
		find(provider: string, model: string) {
			calls.push({ provider, model });
			return provider === expectedModel.provider && model === expectedModel.id ? expectedModel : undefined;
		},
	};

	const resolved = resolveBackgroundSessionModel(modelRegistry as never, {
		provider: "deepseek",
		model: "deepseek-v4-pro",
	});

	assert.equal(resolved, expectedModel);
	assert.deepEqual(calls, [{ provider: "deepseek", model: "deepseek-v4-pro" }]);
});

test("createBackgroundResourceLoader loads project extensions while sessions run in isolated workspaces", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-background-loader-"));
	const workspaceRoot = join(projectRoot, ".data", "agent", "background", "runs", "run-1");
	const extensionPath = join(projectRoot, ".pi", "extensions", "background-probe.ts");
	const skillPath = join(projectRoot, ".pi", "skills", "background-skill", "SKILL.md");

	await mkdir(join(projectRoot, ".pi", "extensions"), { recursive: true });
	await mkdir(join(projectRoot, ".pi", "skills", "background-skill"), { recursive: true });
	await mkdir(workspaceRoot, { recursive: true });
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		JSON.stringify({
			extensions: ["extensions"],
			skills: ["skills"],
		}),
		"utf8",
	);
	await writeFile(
		extensionPath,
		[
			'import { Type } from "@sinclair/typebox";',
			"export default function backgroundProbeExtension(pi) {",
			"  pi.registerTool({",
			'    name: "background_probe",',
			'    label: "Background Probe",',
			'    description: "Verifies background runs load project extensions.",',
			"    parameters: Type.Object({}),",
			"    async execute() { return { ok: true }; },",
			"  });",
			"}",
		].join("\n"),
		"utf8",
	);
	await writeFile(
		skillPath,
		"---\nname: background-skill\ndescription: allowed background skill\n---\n",
		"utf8",
	);

	const loader = createBackgroundResourceLoader({
		projectRoot,
		workspaceRoot,
		skillPaths: [join(projectRoot, ".pi", "skills")],
	});

	await loader.reload();

	assert.deepEqual(loader.getExtensions().errors, []);
	assert.deepEqual(loader.getExtensions().extensions.map((extension) => extension.path), [extensionPath]);
	assert.deepEqual(
		loader.getSkills().skills.map((skill) => skill.name),
		["background-skill"],
	);
});

test("createBackgroundResourceLoader uses snapshot agent rules when provided", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-background-loader-rules-"));
	const runtimeRulesPath = join(projectRoot, ".data", "agents", "search", "AGENTS.md");
	await mkdir(join(projectRoot, ".data", "agents", "search"), { recursive: true });
	await mkdir(join(projectRoot, ".data", "agents", "search", "pi-agent"), { recursive: true });
	await mkdir(join(projectRoot, ".data", "agents", "search", "pi", "skills"), { recursive: true });
	await writeFile(join(projectRoot, "AGENTS.md"), "# Project Rules\n\nShould not leak.\n", "utf8");
	await writeFile(runtimeRulesPath, "# Search Runtime Rules\n\nUse scoped search behavior.\n", "utf8");

	const loader = createBackgroundResourceLoader({
		projectRoot,
		workspaceRoot: join(projectRoot, ".data", "agent", "background", "runs", "run-1"),
		agentDir: join(projectRoot, ".data", "agents", "search", "pi-agent"),
		runtimeAgentRulesPath: runtimeRulesPath,
		skillPaths: [join(projectRoot, ".data", "agents", "search", "pi", "skills")],
	});

	await loader.reload();

	const files = loader.getAgentsFiles().agentsFiles;
	assert.equal(files.some((file) => file.path === join(projectRoot, "AGENTS.md")), false);
	assert.deepEqual(files, [
		{
			path: runtimeRulesPath,
			content: "# Search Runtime Rules\n\nUse scoped search behavior.\n",
		},
	]);
});

test("BackgroundAgentProfileResolver resolves Playground agent profile snapshots", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-background-agent-profile-"));
	const searchSkillPath = join(projectRoot, ".data", "agents", "search", "pi", "skills", "search-skill", "SKILL.md");
	await mkdir(join(projectRoot, ".data", "agents", "search", "pi", "skills", "search-skill"), { recursive: true });
	await writeFile(
		searchSkillPath,
		"---\nname: search-skill\ndescription: search scoped skill\n---\n",
		"utf8",
	);

	const snapshot = await new BackgroundAgentProfileResolver({ projectRoot }).resolve({
		profileId: "search",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest",
		now: new Date("2026-05-04T00:00:00.000Z"),
	});

	assert.equal(snapshot.requestedAgentId, "search");
	assert.equal(snapshot.agentId, "search");
	assert.equal(snapshot.agentName, "搜索 Agent");
	assert.equal(snapshot.fallbackUsed, false);
	assert.equal(snapshot.rulesPath, join(projectRoot, ".data", "agents", "search", "AGENTS.md"));
	assert.deepEqual(snapshot.skillPaths, [
		join(projectRoot, ".data", "agents", "search", "pi", "skills"),
		join(projectRoot, ".data", "agents", "search", "user-skills"),
	]);
	assert.deepEqual(
		snapshot.skills.map((skill) => skill.name),
		["search-skill"],
	);
});

test("BackgroundAgentProfileResolver falls back to main-like snapshot when Playground agent is missing", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-background-agent-fallback-"));
	const defaultSkillPath = join(projectRoot, ".pi", "skills", "default-skill", "SKILL.md");
	await mkdir(join(projectRoot, ".pi", "skills", "default-skill"), { recursive: true });
	await writeFile(
		defaultSkillPath,
		"---\nname: default-skill\ndescription: default scoped skill\n---\n",
		"utf8",
	);

	const snapshot = await new BackgroundAgentProfileResolver({ projectRoot }).resolve({
		profileId: "missing-agent",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest",
		now: new Date("2026-05-04T00:00:00.000Z"),
	});

	assert.equal(snapshot.requestedAgentId, "missing-agent");
	assert.equal(snapshot.agentId, "main");
	assert.equal(snapshot.agentName, "主 Agent");
	assert.equal(snapshot.fallbackUsed, true);
	assert.equal(snapshot.fallbackReason, "profile_not_found");
	assert.equal(snapshot.rulesPath, join(projectRoot, ".data", "agent", "AGENTS.md"));
	assert.deepEqual(snapshot.skillPaths, [join(projectRoot, ".pi", "skills"), join(projectRoot, "runtime", "skills-user")]);
	assert.deepEqual(
		snapshot.skills.map((skill) => skill.name),
		["default-skill"],
	);
});

test("BackgroundAgentProfileResolver marks fallback reason when Playground agent is archived", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-background-agent-archived-"));
	await writeStoredAgentProfileSummaries(
		projectRoot,
		[{ agentId: "draft", name: "草稿 Agent", description: "已归档测试。" }],
		["draft"],
	);

	const snapshot = await new BackgroundAgentProfileResolver({ projectRoot }).resolve({
		profileId: "draft",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest",
		now: new Date("2026-05-04T00:00:00.000Z"),
	});

	assert.equal(snapshot.requestedAgentId, "draft");
	assert.equal(snapshot.agentId, "main");
	assert.equal(snapshot.fallbackUsed, true);
	assert.equal(snapshot.fallbackReason, "profile_archived");
});

test("resolveBackgroundSessionModel rejects missing background snapshot models instead of falling back", () => {
	const modelRegistry = {
		find() {
			return undefined;
		},
	};

	assert.throws(
		() =>
			resolveBackgroundSessionModel(modelRegistry as never, {
				provider: "missing-provider",
				model: "missing-model",
			}),
		/Background agent model not found: missing-provider\/missing-model/,
	);
});

test("resolveBackgroundSessionModel migrates deprecated DeepSeek Anthropic Pro snapshots to DeepSeek", () => {
	const replacementModel = {
		provider: "deepseek",
		id: "deepseek-v4-pro",
		name: "DeepSeek V4 Pro",
		api: "openai-completions",
		baseUrl: "https://example.test",
		reasoning: true,
		contextWindow: 1000000,
		maxTokens: 384000,
		input: ["text"],
		output: ["text"],
	} as const;
	const calls: Array<{ provider: string; model: string }> = [];
	const modelRegistry = {
		find(provider: string, model: string) {
			calls.push({ provider, model });
			return provider === replacementModel.provider && model === replacementModel.id ? replacementModel : undefined;
		},
	};

	const resolved = resolveBackgroundSessionModel(modelRegistry as never, {
		provider: "deepseek-anthropic",
		model: "deepseek-v4-pro",
	});

	assert.equal(resolved, replacementModel);
	assert.deepEqual(calls, [
		{ provider: "deepseek-anthropic", model: "deepseek-v4-pro" },
		{ provider: "deepseek", model: "deepseek-v4-pro" },
	]);
});

test("resolveBackgroundSessionModel migrates deprecated DeepSeek Anthropic Flash snapshots to restored DeepSeek Flash", () => {
	const replacementModel = {
		provider: "deepseek",
		id: "deepseek-v4-flash",
		name: "DeepSeek V4 Flash",
		api: "openai-completions",
		baseUrl: "https://example.test",
		reasoning: true,
		contextWindow: 1000000,
		maxTokens: 384000,
		input: ["text"],
		output: ["text"],
	} as const;
	const calls: Array<{ provider: string; model: string }> = [];
	const modelRegistry = {
		find(provider: string, model: string) {
			calls.push({ provider, model });
			return provider === replacementModel.provider && model === replacementModel.id ? replacementModel : undefined;
		},
	};

	const resolved = resolveBackgroundSessionModel(modelRegistry as never, {
		provider: "deepseek-anthropic",
		model: "deepseek-v4-flash",
	});

	assert.equal(resolved, replacementModel);
	assert.deepEqual(calls, [
		{ provider: "deepseek-anthropic", model: "deepseek-v4-flash" },
		{ provider: "deepseek", model: "deepseek-v4-flash" },
	]);
});

test("resolveBackgroundSessionModel rejects deprecated aliases when the replacement is missing", () => {
	const modelRegistry = {
		find() {
			return undefined;
		},
	};

	assert.throws(
		() =>
			resolveBackgroundSessionModel(modelRegistry as never, {
				provider: "deepseek-anthropic",
				model: "deepseek-v4-flash",
			}),
		/Background agent model not found: deepseek-anthropic\/deepseek-v4-flash; deprecated alias replacement missing: deepseek\/deepseek-v4-flash/,
	);
});

async function createWorker(runner: FakeRunner | FailingRunner): Promise<{
	database: ConnDatabase;
	connStore: ConnSqliteStore;
	runStore: ConnRunStore;
	activityStore: AgentActivityStore;
	broadcasts: NotificationBroadcastEvent[];
	worker: ConnWorker;
}> {
	return await createWorkerWithOptions(runner, {});
}

async function createWorkerWithOptions(
	runner: FakeRunner | FailingRunner | { run(conn: ConnDefinition, run: ConnRunRecord, now: Date, signal?: AbortSignal): Promise<ConnRunRecord | undefined> },
	options: {
		maxConcurrency?: number;
		leaseMs?: number;
		heartbeatMs?: number;
		activityNotifications?: string[];
	},
): Promise<{
	database: ConnDatabase;
	connStore: ConnSqliteStore;
	runStore: ConnRunStore;
	activityStore: AgentActivityStore;
	broadcasts: NotificationBroadcastEvent[];
	worker: ConnWorker;
}> {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-conn-worker-"));
	const database = new ConnDatabase({ dbPath: join(root, "conn.sqlite") });
	await database.initialize();
	const connStore = new ConnSqliteStore({ database });
	const runStore = new ConnRunStore({ database });
	const activityStore = new AgentActivityStore({ database });
	const broadcasts: NotificationBroadcastEvent[] = [];
	return {
		database,
		connStore,
		runStore,
		activityStore,
		broadcasts,
		worker: new ConnWorker({
			workerId: "worker-a",
			backgroundDataDir: join(root, "background"),
			connStore,
			runStore,
			activityStore,
			notificationBroadcaster: {
				broadcast: async (event) => {
					broadcasts.push(event);
				},
			},
			activityNotifier: options.activityNotifications
				? {
						notify: async (activity) => {
							options.activityNotifications?.push(`${activity.title}\n${activity.text}`);
						},
					}
				: undefined,
			runner,
			leaseMs: options.leaseMs ?? 30_000,
			heartbeatMs: options.heartbeatMs,
			maxConcurrency: options.maxConcurrency ?? 1,
		}),
	};
}

test("ConnWorker enqueues due conn runs, executes one claim, and creates a task inbox activity", async () => {
	const runner = new FakeRunner();
	const { database, connStore, runStore, activityStore, broadcasts, worker } = await createWorker(runner);
	const conn = await connStore.create({
		title: "Daily Digest",
		prompt: "Summarize",
		target: {
			type: "task_inbox",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	await worker.tick(new Date("2026-04-21T10:01:05.000Z"));

	assert.equal(runner.calls.length, 1);
	assert.equal(runner.calls[0].conn.connId, conn.connId);
	const runs = await runStore.listRunsForConn(conn.connId);
	assert.equal(runs.length, 1);
	assert.equal(runs[0].status, "running");
	assert.ok(runs[0].workspacePath.endsWith(join("background", "runs", runs[0].runId)));
	const activities = await activityStore.list();
	assert.deepEqual(broadcasts, [
		{
			activityId: activities[0]?.activityId,
			source: "conn",
			sourceId: conn.connId,
			runId: runs[0].runId,
			kind: "conn_result",
			title: "Daily Digest completed",
			createdAt: "2026-04-21T10:01:05.000Z",
		},
	]);
	assert.deepEqual(
		activities.map((activity) => ({
			source: activity.source,
			sourceId: activity.sourceId,
			runId: activity.runId,
			conversationId: activity.conversationId,
			title: activity.title,
			text: activity.text,
		})),
		[
			{
				source: "conn",
				sourceId: conn.connId,
				runId: runs[0].runId,
				conversationId: undefined,
				title: "Daily Digest completed",
				text: "执行模型：xiaomi-mimo-cn / mimo-v2.5-pro\n\nresult for Daily Digest",
			},
		],
	);

	database.close();
});

test("ConnWorker includes indexed output files in task inbox activity", async () => {
	let runStore: ConnRunStore;
	const runner = {
		async run(conn: ConnDefinition, run: ConnRunRecord, now: Date): Promise<ConnRunRecord | undefined> {
			await runStore.recordFile({
				runId: run.runId,
				kind: "output",
				relativePath: "output/zhihu-browse/report.html",
				fileName: "report.html",
				mimeType: "text/html; charset=utf-8",
				sizeBytes: 128,
				createdAt: now,
			});
			return {
				...run,
				status: "succeeded",
				resultSummary: `summary for ${conn.title}`,
				resultText: `result for ${conn.title}`,
				finishedAt: now.toISOString(),
			};
		},
	};
	const created = await createWorkerWithOptions(runner, {});
	const { database, connStore, activityStore, worker } = created;
	runStore = created.runStore;
	const conn = await connStore.create({
		title: "Zhihu Report",
		prompt: "Generate report",
		target: {
			type: "task_inbox",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	await worker.tick(new Date("2026-04-21T10:01:05.000Z"));

	const activities = await activityStore.list();
	const runs = await runStore.listRunsForConn(conn.connId);
	assert.deepEqual(activities[0]?.files, [
		{
			fileName: "report.html",
			downloadUrl: `/v1/conns/${conn.connId}/runs/${runs[0].runId}/output/zhihu-browse/report.html`,
			mimeType: "text/html; charset=utf-8",
			sizeBytes: 128,
		},
	]);
	database.close();
});

test("ConnWorker uses the run finishedAt timestamp when creating result activity", async () => {
	const runner = {
		async run(conn: ConnDefinition, run: ConnRunRecord): Promise<ConnRunRecord | undefined> {
			return {
				...run,
				status: "succeeded",
				resultSummary: `summary for ${conn.title}`,
				resultText: `result for ${conn.title}`,
				finishedAt: "2026-04-21T10:03:30.000Z",
			};
		},
	};
	const { database, connStore, activityStore, broadcasts, worker } = await createWorkerWithOptions(runner, {});
	const conn = await connStore.create({
		title: "Slow Digest",
		prompt: "Summarize",
		target: {
			type: "task_inbox",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	await worker.tick(new Date("2026-04-21T10:01:05.000Z"));

	const activities = await activityStore.list();
	assert.equal(activities[0]?.createdAt, "2026-04-21T10:03:30.000Z");
	assert.equal(broadcasts[0]?.createdAt, "2026-04-21T10:03:30.000Z");

	database.close();
});

test("ConnWorker sends global activity notifications to the optional activity notifier", async () => {
	const runner = new FakeRunner();
	const activityNotifications: string[] = [];
	const { database, connStore, activityStore, worker } = await createWorkerWithOptions(runner, {
		activityNotifications,
	});
	const conn = await connStore.create({
		title: "Activity Mirror",
		prompt: "Summarize",
		target: {
			type: "task_inbox",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:00:00.000Z",
		},
		now: new Date("2026-04-21T09:59:00.000Z"),
	});

	await worker.tick(new Date("2026-04-21T10:01:05.000Z"));

	const activities = await activityStore.list();
	assert.equal(activities.length, 1);
	assert.deepEqual(activityNotifications, [
		"Activity Mirror completed\n执行模型：xiaomi-mimo-cn / mimo-v2.5-pro\n\nresult for Activity Mirror",
	]);

	database.close();
});

test("ConnWorker failure does not abort the tick loop and creates a failure activity", async () => {
	const runner = new FailingRunner();
	const { database, connStore, activityStore, broadcasts, worker } = await createWorker(runner);
	const conn = await connStore.create({
		title: "Daily Digest",
		prompt: "Summarize",
		target: {
			type: "task_inbox",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	await worker.tick(new Date("2026-04-21T10:01:05.000Z"));

	assert.equal(runner.calls, 1);
	const activities = await activityStore.list();
	assert.deepEqual(
		activities.map((activity) => ({
			source: activity.source,
			sourceId: activity.sourceId,
			runId: activity.runId,
			title: activity.title,
			text: activity.text,
		})),
		[
			{
				source: "conn",
				sourceId: conn.connId,
				runId: activities[0]?.runId,
				title: "Daily Digest failed",
				text: "执行模型：xiaomi-mimo-cn / mimo-v2.5-pro\n\nboom",
			},
		],
	);
	assert.deepEqual(broadcasts, [
		{
			activityId: activities[0]?.activityId,
			source: "conn",
			sourceId: conn.connId,
			runId: activities[0]?.runId,
			kind: "conn_result",
			title: "Daily Digest failed",
			createdAt: "2026-04-21T10:01:05.000Z",
		},
	]);
	assert.deepEqual(
		activities.map((activity) => ({
			source: activity.source,
			sourceId: activity.sourceId,
			runId: activity.runId,
			conversationId: activity.conversationId,
			title: activity.title,
			text: activity.text,
		})),
		[
			{
				source: "conn",
				sourceId: conn.connId,
				runId: activities[0]?.runId,
				conversationId: undefined,
				title: "Daily Digest failed",
				text: "执行模型：xiaomi-mimo-cn / mimo-v2.5-pro\n\nboom",
			},
		],
	);

	database.close();
});

test("ConnWorker claims and starts multiple due runs before waiting for the first one to finish", async () => {
	const pending = new Map<
		string,
		{
			resolve: () => void;
		}
	>();
	const started: string[] = [];
	const runner = {
		run: async (conn: ConnDefinition, run: ConnRunRecord, now: Date): Promise<ConnRunRecord | undefined> => {
			started.push(conn.title);
			return await new Promise<ConnRunRecord>((resolve) => {
				pending.set(conn.title, {
					resolve: () =>
						resolve({
							...run,
							status: "succeeded",
							resultSummary: `summary for ${conn.title}`,
							resultText: `result for ${conn.title}`,
							finishedAt: now.toISOString(),
						}),
				});
			});
		},
	};
	const { database, connStore, worker } = await createWorkerWithOptions(runner, {
		maxConcurrency: 2,
	});

	await connStore.create({
		title: "Parallel A",
		prompt: "Summarize A",
		target: {
			type: "conversation",
			conversationId: "manual:parallel",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	await connStore.create({
		title: "Parallel B",
		prompt: "Summarize B",
		target: {
			type: "conversation",
			conversationId: "manual:parallel",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	const tickPromise = worker.tick(new Date("2026-04-21T10:01:05.000Z"));
	await new Promise((resolve) => setImmediate(resolve));

	assert.deepEqual(started.sort(), ["Parallel A", "Parallel B"]);

	pending.get("Parallel A")?.resolve();
	pending.get("Parallel B")?.resolve();

	await tickPromise;
	database.close();
});

test("ConnWorker refreshes lease heartbeat while a claimed run is still executing", async () => {
	const pending = new Map<
		string,
		{
			resolve: () => void;
		}
	>();
	const runner = {
		run: async (conn: ConnDefinition, run: ConnRunRecord, now: Date): Promise<ConnRunRecord | undefined> =>
			await new Promise<ConnRunRecord>((resolve) => {
				pending.set(conn.title, {
					resolve: () =>
						resolve({
							...run,
							status: "succeeded",
							resultSummary: `summary for ${conn.title}`,
							resultText: `result for ${conn.title}`,
							finishedAt: now.toISOString(),
						}),
				});
			}),
	};
	const { database, connStore, runStore, worker } = await createWorkerWithOptions(runner, {
		leaseMs: 60,
		heartbeatMs: 20,
	});

	const conn = await connStore.create({
		title: "Heartbeat Run",
		prompt: "Summarize",
		target: {
			type: "conversation",
			conversationId: "manual:heartbeat",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	const tickPromise = worker.tick(new Date("2026-04-21T10:01:05.000Z"));
	await new Promise((resolve) => setTimeout(resolve, 90));

	const runs = await runStore.listRunsForConn(conn.connId);
	assert.equal(runs.length, 1);
	assert.equal(runs[0].status, "running");
	assert.ok(runs[0].leaseUntil);
	assert.notEqual(runs[0].updatedAt, "2026-04-21T10:01:05.000Z");

	pending.get("Heartbeat Run")?.resolve();
	await tickPromise;

	database.close();
});
