import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { ConnDatabase } from "../../../src/agent/conn-db.js";
import { ConnRunStore, type ConnRunRecord } from "../../../src/agent/conn-run-store.js";
import { ConnSqliteStore } from "../../../src/agent/conn-sqlite-store.js";
import type { ConnDefinition } from "../../../src/agent/conn-store.js";
import { normalizeArtifactDeliveryInput } from "../../../src/agent/artifact-contract.js";
import { getAppConfig } from "../../../src/config.js";

function findProjectRoot(startPath: string): string {
	let current = resolve(startPath);

	while (true) {
		if (existsSync(join(current, ".pi"))) {
			return current;
		}

		const parent = dirname(current);
		if (parent === current) {
			return resolve(startPath);
		}
		current = parent;
	}
}

function createConnRuntime(projectRoot: string): {
	connStore: ConnSqliteStore;
	runStore: ConnRunStore;
	backgroundDataDir: string;
	close(): void;
} {
	const config = getAppConfig(projectRoot);
	const database = new ConnDatabase({
		dbPath: config.connDatabasePath,
		legacyDbPath: join(config.connDataDir, "conn.sqlite"),
	});
	database.initializeSync();
	return {
		connStore: new ConnSqliteStore({ database }),
		runStore: new ConnRunStore({ database }),
		backgroundDataDir: config.backgroundDataDir,
		close() {
			database.close();
		},
	};
}

function summarizeConn(conn: ConnDefinition): string {
	return [
		`connId: ${conn.connId}`,
		`title: ${conn.title}`,
		`status: ${conn.status}`,
		`target: ${JSON.stringify(conn.target)}`,
		`schedule: ${JSON.stringify(conn.schedule)}`,
		`model: ${conn.modelProvider && conn.modelId ? `${conn.modelProvider} / ${conn.modelId}` : "(default)"}`,
		`assetRefs: ${conn.assetRefs.join(", ") || "(none)"}`,
		`nextRunAt: ${conn.nextRunAt ?? "(none)"}`,
		`lastRunAt: ${conn.lastRunAt ?? "(none)"}`,
		`lastRunId: ${conn.lastRunId ?? "(none)"}`,
	`artifactDelivery: ${conn.artifactDelivery ? JSON.stringify(conn.artifactDelivery) : "(disabled)"}`,
	].join("\n");
}

function summarizeRun(run: ConnRunRecord): string {
	return [
		`runId: ${run.runId}`,
		`connId: ${run.connId}`,
		`status: ${run.status}`,
		`scheduledAt: ${run.scheduledAt}`,
		`startedAt: ${run.startedAt ?? "(none)"}`,
		`finishedAt: ${run.finishedAt ?? "(none)"}`,
		`resultSummary: ${run.resultSummary ?? "(none)"}`,
		`errorText: ${run.errorText ?? "(none)"}`,
	].join("\n");
}

function createErrorResult(message: string, details: Record<string, unknown>) {
	return {
		content: [{ type: "text" as const, text: message }],
		details,
		isError: true,
	};
}

const ConnTargetSchema = Type.Union([
	Type.Object({
		type: Type.Literal("task_inbox"),
	}),
	Type.Object({
		type: Type.Literal("conversation"),
		conversationId: Type.String(),
	}),
]);

const ConnScheduleSchema = Type.Union([
	Type.Object({
		kind: Type.Literal("once"),
		at: Type.String(),
		timezone: Type.Optional(Type.String()),
	}),
	Type.Object({
		kind: Type.Literal("interval"),
		everyMs: Type.Number(),
		startAt: Type.Optional(Type.String()),
		timezone: Type.Optional(Type.String()),
	}),
	Type.Object({
		kind: Type.Literal("cron"),
		expression: Type.String(),
		timezone: Type.Optional(Type.String()),
	}),
]);

const ConnToolParams = Type.Object({
	action: Type.Union([
		Type.Literal("create"),
		Type.Literal("list"),
		Type.Literal("get"),
		Type.Literal("update"),
		Type.Literal("pause"),
		Type.Literal("resume"),
		Type.Literal("delete"),
		Type.Literal("run_now"),
		Type.Literal("list_runs"),
		Type.Literal("get_run"),
	]),
	connId: Type.Optional(Type.String()),
	runId: Type.Optional(Type.String()),
	title: Type.Optional(Type.String()),
	prompt: Type.Optional(Type.String()),
	target: Type.Optional(ConnTargetSchema),
	schedule: Type.Optional(ConnScheduleSchema),
	assetRefs: Type.Optional(Type.Array(Type.String())),
	maxRunMs: Type.Optional(Type.Number()),
	profileId: Type.Optional(Type.String()),
	agentSpecId: Type.Optional(Type.String()),
	skillSetId: Type.Optional(Type.String()),
	modelPolicyId: Type.Optional(Type.String()),
	modelProvider: Type.Optional(Type.String()),
	modelId: Type.Optional(Type.String()),
	upgradePolicy: Type.Optional(Type.Union([Type.Literal("latest"), Type.Literal("pinned"), Type.Literal("manual")])),
	artifactDelivery: Type.Optional(Type.Object({
		enabled: Type.Boolean(),
		expectedKind: Type.Optional(Type.Union([
			Type.Literal("auto"), Type.Literal("file"), Type.Literal("web"),
			Type.Literal("xlsx"), Type.Literal("pdf"), Type.Literal("csv"), Type.Literal("markdown"),
		])),
		repairMaxAttempts: Type.Optional(Type.Number()),
	})),
});

export default function connExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "conn",
		label: "Conn",
		description:
			"Create, inspect, update, pause, resume, delete, trigger, and review scheduled conn tasks with run history.",
		parameters: ConnToolParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const projectRoot = findProjectRoot(ctx.cwd);
			const runtime = createConnRuntime(projectRoot);

			try {
				if (params.action === "list") {
					const conns = await runtime.connStore.list();
					return {
						content: [
							{
								type: "text",
								text: conns.length > 0 ? conns.map(summarizeConn).join("\n\n---\n\n") : "No conn tasks found.",
							},
						],
						details: {
							action: "list",
							conns,
						},
					};
				}

				if (params.action === "create") {
					if (!params.title || !params.prompt || !params.schedule) {
						return createErrorResult("create requires title, prompt, and schedule.", {
							action: "create",
						});
					}

					const conn = await runtime.connStore.create({
						title: params.title,
						prompt: params.prompt,
						target: params.target ?? { type: "task_inbox" },
						schedule: params.schedule,
						assetRefs: params.assetRefs,
						maxRunMs: params.maxRunMs,
						profileId: params.profileId,
						agentSpecId: params.agentSpecId,
						skillSetId: params.skillSetId,
						modelPolicyId: params.modelPolicyId,
						modelProvider: params.modelProvider,
						modelId: params.modelId,
						upgradePolicy: params.upgradePolicy,
						...(params.artifactDelivery !== undefined
							? { artifactDelivery: normalizeArtifactDeliveryInput(params.artifactDelivery) }
							: {}),
					});
					return {
						content: [{ type: "text", text: summarizeConn(conn) }],
						details: {
							action: "create",
							conn,
						},
					};
				}

				if (!params.connId) {
					return createErrorResult("connId is required for this action.", {
						action: params.action,
					});
				}

				if (params.action === "get") {
					const conn = await runtime.connStore.get(params.connId);
					if (!conn) {
						return createErrorResult(`Conn not found: ${params.connId}`, {
							action: "get",
							connId: params.connId,
						});
					}

					return {
						content: [{ type: "text", text: summarizeConn(conn) }],
						details: {
							action: "get",
							conn,
						},
					};
				}

				if (params.action === "list_runs") {
					const conn = await runtime.connStore.get(params.connId);
					if (!conn) {
						return createErrorResult(`Conn not found: ${params.connId}`, {
							action: "list_runs",
							connId: params.connId,
						});
					}
					const runs = await runtime.runStore.listRunsForConn(params.connId);
					return {
						content: [
							{
								type: "text",
								text: runs.length > 0 ? runs.map(summarizeRun).join("\n\n---\n\n") : `No runs found for ${params.connId}.`,
							},
						],
						details: {
							action: "list_runs",
							conn,
							runs,
						},
					};
				}

				if (params.action === "get_run") {
					if (!params.runId) {
						return createErrorResult("runId is required for get_run.", {
							action: "get_run",
							connId: params.connId,
						});
					}
					const run = await runtime.runStore.getRun(params.runId);
					if (!run || run.connId !== params.connId) {
						return createErrorResult(`Run not found: ${params.runId}`, {
							action: "get_run",
							connId: params.connId,
							runId: params.runId,
						});
					}
					const [events, files] = await Promise.all([
						runtime.runStore.listEvents(run.runId),
						runtime.runStore.listFiles(run.runId),
					]);
					return {
						content: [{ type: "text", text: summarizeRun(run) }],
						details: {
							action: "get_run",
							run,
							events,
							files,
						},
					};
				}

				if (params.action === "update") {
					const conn = await runtime.connStore.update(params.connId, {
						...(params.title !== undefined ? { title: params.title } : {}),
						...(params.prompt !== undefined ? { prompt: params.prompt } : {}),
						...(params.target !== undefined ? { target: params.target } : {}),
						...(params.schedule !== undefined ? { schedule: params.schedule } : {}),
						...(params.assetRefs !== undefined ? { assetRefs: params.assetRefs } : {}),
						...(params.maxRunMs !== undefined ? { maxRunMs: params.maxRunMs } : {}),
						...(params.profileId !== undefined ? { profileId: params.profileId } : {}),
						...(params.agentSpecId !== undefined ? { agentSpecId: params.agentSpecId } : {}),
						...(params.skillSetId !== undefined ? { skillSetId: params.skillSetId } : {}),
						...(params.modelPolicyId !== undefined ? { modelPolicyId: params.modelPolicyId } : {}),
						...(params.modelProvider !== undefined ? { modelProvider: params.modelProvider } : {}),
						...(params.modelId !== undefined ? { modelId: params.modelId } : {}),
						...(params.upgradePolicy !== undefined ? { upgradePolicy: params.upgradePolicy } : {}),
						...(params.artifactDelivery !== undefined
							? { artifactDelivery: normalizeArtifactDeliveryInput(params.artifactDelivery) }
							: {}),
					});
					if (!conn) {
						return createErrorResult(`Conn not found: ${params.connId}`, {
							action: "update",
							connId: params.connId,
						});
					}

					return {
						content: [{ type: "text", text: summarizeConn(conn) }],
						details: {
							action: "update",
							conn,
						},
					};
				}

				if (params.action === "pause") {
					const conn = await runtime.connStore.pause(params.connId);
					if (!conn) {
						return createErrorResult(`Conn not found: ${params.connId}`, {
							action: "pause",
							connId: params.connId,
						});
					}
					return {
						content: [{ type: "text", text: summarizeConn(conn) }],
						details: { action: "pause", conn },
					};
				}

				if (params.action === "resume") {
					const conn = await runtime.connStore.resume(params.connId);
					if (!conn) {
						return createErrorResult(`Conn not found: ${params.connId}`, {
							action: "resume",
							connId: params.connId,
						});
					}
					return {
						content: [{ type: "text", text: summarizeConn(conn) }],
						details: { action: "resume", conn },
					};
				}

				if (params.action === "delete") {
					const deleted = await runtime.connStore.delete(params.connId);
					return {
						content: [{ type: "text", text: deleted ? `Deleted ${params.connId}` : `Conn not found: ${params.connId}` }],
						details: { action: "delete", connId: params.connId, deleted },
						isError: !deleted,
					};
				}

				const conn = await runtime.connStore.get(params.connId);
				if (!conn) {
					return createErrorResult(`Conn not found: ${params.connId}`, {
						action: "run_now",
						connId: params.connId,
					});
				}
				const runId = randomUUID();
				const run = await runtime.runStore.createRun({
					runId,
					connId: conn.connId,
					scheduledAt: new Date().toISOString(),
					workspacePath: join(runtime.backgroundDataDir, "runs", runId),
				});
				return {
					content: [{ type: "text", text: `Triggered ${params.connId} for immediate execution.` }],
					details: {
						action: "run_now",
						conn,
						run,
					},
				};
			} finally {
				runtime.close();
			}
		},
	});
}
