import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getAppConfig } from "../config.js";
import { createBrowserRegistryFromEnv } from "../browser/browser-registry.js";
import {
	BackgroundAgentRunner,
} from "../agent/background-agent-runner.js";
import { ProjectBackgroundSessionFactory } from "../agent/background-agent-session-factory.js";
export {
	createBackgroundResourceLoader,
	resolveBackgroundSessionModel,
} from "../agent/background-agent-session-factory.js";
import { BackgroundAgentProfileResolver } from "../agent/background-agent-profile.js";
import { BackgroundWorkspaceManager } from "../agent/background-workspace.js";
import type { AgentActivityItem, AgentActivityStore, CreateAgentActivityInput } from "../agent/agent-activity-store.js";
import { AgentActivityStore as DefaultAgentActivityStore } from "../agent/agent-activity-store.js";
import type { ActivityFile } from "../agent/activity-file.js";
import { AssetStore } from "../agent/asset-store.js";
import { ConnDatabase } from "../agent/conn-db.js";
import type { ConnRunFileRecord, ConnRunRecord, ConnRunStore } from "../agent/conn-run-store.js";
import { ConnRunStore as DefaultConnRunStore } from "../agent/conn-run-store.js";
import type { ConnSqliteStore } from "../agent/conn-sqlite-store.js";
import { ConnSqliteStore as DefaultConnSqliteStore } from "../agent/conn-sqlite-store.js";
import type { ConnDefinition } from "../agent/conn-store.js";
import type { NotificationBroadcastEvent } from "../agent/notification-hub.js";
import { TeamGroupConnRunner } from "./team-group-conn-runner.js";

export interface ConnWorkerRunner {
	run(conn: ConnDefinition, run: ConnRunRecord, now: Date, signal?: AbortSignal): Promise<ConnRunRecord | undefined>;
}

export interface ConnWorkerOptions {
	workerId: string;
	backgroundDataDir: string;
	connStore: Pick<ConnSqliteStore, "list" | "get">;
	runStore: ConnRunStore;
	activityStore?: Pick<AgentActivityStore, "create">;
	notificationBroadcaster?: NotificationBroadcaster;
	activityNotifier?: ActivityNotifier;
	runner: ConnWorkerRunner;
	teamGroupRunner?: ConnWorkerRunner;
	leaseMs?: number;
	heartbeatMs?: number;
	maxConcurrency?: number;
}

export interface NotificationBroadcaster {
	broadcast(event: NotificationBroadcastEvent): Promise<void>;
}

export interface ActivityNotifier {
	notify(activity: AgentActivityItem): Promise<void>;
}

export class ConnWorker {
	constructor(private readonly options: ConnWorkerOptions) {}

	async tick(now: Date = new Date()): Promise<void> {
		await this.recoverStaleRuns(now);
		await this.enqueueDueRuns(now);
		const maxConcurrency = Math.max(1, Math.trunc(this.options.maxConcurrency ?? 1));
		const executions: Array<Promise<void>> = [];

		for (let index = 0; index < maxConcurrency; index += 1) {
			const run = await this.options.runStore.claimNextDue({
				workerId: this.options.workerId,
				now,
				leaseMs: this.options.leaseMs,
			});
			if (!run) {
				break;
			}
			executions.push(this.executeClaimedRun(run, now));
		}

		if (executions.length > 0) {
			await Promise.all(executions);
		}
	}

	private async recoverStaleRuns(now: Date): Promise<void> {
		const staleRuns = await this.options.runStore.listStaleRuns(now);
		for (const run of staleRuns) {
			const summary = "Run lease expired without heartbeat";
			await this.options.runStore.appendEvent({
				runId: run.runId,
				eventType: "run_stale",
				event: {
					leaseOwner: run.leaseOwner,
					leaseUntil: run.leaseUntil,
					recoveredAt: now.toISOString(),
				},
				createdAt: now,
			});
			const failedRun = await this.options.runStore.failRun({
				runId: run.runId,
				summary,
				errorText: summary,
				finishedAt: now,
			});
			const conn = await this.options.connStore.get(run.connId);
			if (conn && failedRun) {
				await this.deliverRunResult(conn, failedRun, now);
			}
		}
	}

	private async enqueueDueRuns(now: Date): Promise<void> {
		const nowIso = now.toISOString();
		const conns = await this.options.connStore.list();

		for (const conn of conns) {
			if (conn.status !== "active" || !conn.nextRunAt || conn.nextRunAt > nowIso) {
				continue;
			}
			const existingRuns = await this.options.runStore.listRunsForConn(conn.connId);
			if (existingRuns.some((run) => run.scheduledAt === conn.nextRunAt)) {
				continue;
			}
			const runId = randomUUID();
			await this.options.runStore.createRun({
				runId,
				connId: conn.connId,
				scheduledAt: conn.nextRunAt,
				workspacePath: join(this.options.backgroundDataDir, "runs", runId),
				now,
			});
		}
	}

	private async executeClaimedRun(run: ConnRunRecord, now: Date): Promise<void> {
		const conn = await this.options.connStore.get(run.connId);
		if (!conn) {
			await this.options.runStore.failRun({
				runId: run.runId,
				leaseOwner: run.leaseOwner,
				summary: "Conn definition no longer exists",
				errorText: "Conn definition no longer exists",
				finishedAt: now,
			});
			return;
		}

		const heartbeatMs = resolveHeartbeatMs(this.options.heartbeatMs, this.options.leaseMs);
		let timeoutHandle: NodeJS.Timeout | undefined;
		let timeoutEventPromise: Promise<void> | undefined;
		const runController = new AbortController();
		const heartbeat = startRunHeartbeat({
			runStore: this.options.runStore,
			runId: run.runId,
			workerId: this.options.workerId,
			leaseMs: this.options.leaseMs,
			heartbeatMs,
			onCancelled: (cancelledRun) => {
				runController.abort(new Error(cancelledRun.resultSummary ?? "Conn run cancelled"));
			},
		});
		if (conn.maxRunMs) {
			timeoutHandle = setTimeout(() => {
				const message = `Conn run exceeded maxRunMs (${conn.maxRunMs}ms)`;
				timeoutEventPromise = this.options.runStore
					.appendEvent({
						runId: run.runId,
						leaseOwner: run.leaseOwner,
						eventType: "run_timed_out",
						event: {
							maxRunMs: conn.maxRunMs,
							timedOutAt: new Date().toISOString(),
						},
					})
					.then(() => undefined)
					.catch((error) => {
						console.warn("[conn-worker] run_timed_out event failed:", error);
					});
				runController.abort(new Error(message));
			}, conn.maxRunMs);
		}

		try {
			const runner = conn.execution?.type === "team_group"
				? this.options.teamGroupRunner
				: this.options.runner;
			if (!runner) {
				throw new Error("Team group conn runner is not configured");
			}
			const result = await runner.run(conn, run, now, runController.signal);
			await heartbeat.stop();
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
			await timeoutEventPromise;
			const latestRun = await this.options.runStore.getRun(run.runId);
			if (latestRun?.status === "cancelled") {
				await this.deliverRunResult(conn, latestRun, resolveRunResultDate(latestRun, new Date()));
				return;
			}
			if (isDeliverableFinalStatus(result?.status)) {
				await this.deliverRunResult(conn, result, resolveRunResultDate(result, new Date()));
			}
		} catch (error) {
			await heartbeat.stop();
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
			await timeoutEventPromise;
			const failedAt = new Date();
			const message = error instanceof Error ? error.message : "Unknown conn worker error";
			const latestRun = await this.options.runStore.getRun(run.runId);
			if (latestRun && ["failed", "succeeded", "cancelled"].includes(latestRun.status)) {
				await this.deliverRunResult(conn, latestRun, resolveRunResultDate(latestRun, failedAt));
				return;
			}
			const failedRun = await this.options.runStore.failRun({
				runId: run.runId,
				leaseOwner: this.options.workerId,
				summary: message,
				errorText: message,
				finishedAt: failedAt,
			});
			if (failedRun) {
				await this.deliverRunResult(conn, failedRun, failedAt);
			}
		}
	}

	private async deliverRunResult(conn: ConnDefinition, run: ConnRunRecord, now: Date): Promise<void> {
		try {
			const files = await this.resolveRunActivityFiles(conn, run);
			const activity = await this.options.activityStore?.create(toAgentActivityInput(conn, run, now, files));
			if (activity) {
				try {
					await this.options.notificationBroadcaster?.broadcast(toNotificationBroadcastEvent(activity));
				} catch (error) {
					console.warn("[conn-worker] notification broadcast failed:", error);
				}
				try {
					await this.options.activityNotifier?.notify(activity);
				} catch (error) {
					console.warn("[conn-worker] activity notifier failed:", error);
				}
			}
		} catch (error) {
			console.warn("[conn-worker] activity write failed:", error);
		}
	}

	private async resolveRunActivityFiles(conn: ConnDefinition, run: ConnRunRecord): Promise<ActivityFile[]> {
		try {
			const files = await this.options.runStore.listFiles(run.runId);
			return toActivityOutputFiles(conn.connId, run.runId, files);
		} catch (error) {
			console.warn("[conn-worker] output file activity link build failed:", error);
			return [];
		}
	}
}

function isDeliverableFinalStatus(status: ConnRunRecord["status"] | undefined): status is "succeeded" | "failed" | "cancelled" {
	return status === "succeeded" || status === "failed" || status === "cancelled";
}

function resolveRunResultDate(run: ConnRunRecord, fallback: Date): Date {
	if (!run.finishedAt) {
		return fallback;
	}
	const date = new Date(run.finishedAt);
	return Number.isNaN(date.getTime()) ? fallback : date;
}

function resolveNotificationTitleSuffix(status: ConnRunRecord["status"]): string {
	if (status === "failed") {
		return "failed";
	}
	if (status === "cancelled") {
		return "cancelled";
	}
	return "completed";
}

function resolveNotificationText(run: ConnRunRecord): string {
	const executionLine = resolveRunExecutionLine(run);
	const modelLine = resolveRunModelLine(run);
	const body = resolveNotificationBodyText(run);
	const headerLines = [executionLine, modelLine].filter(Boolean);
	return headerLines.length > 0 ? `${headerLines.join("\n")}\n\n${body}` : body;
}

function resolveNotificationBodyText(run: ConnRunRecord): string {
	if (run.status === "failed") {
		return run.errorText ?? run.resultText ?? run.resultSummary ?? "Conn run failed";
	}
	if (run.status === "cancelled") {
		return run.resultText ?? run.resultSummary ?? "Conn run cancelled";
	}
	return run.resultText ?? run.resultSummary ?? "Conn run completed";
}

function resolveRunModelLine(run: ConnRunRecord): string | undefined {
	const snapshot = run.resolvedSnapshot;
	if (!snapshot || typeof snapshot !== "object") {
		return undefined;
	}
	const provider = typeof snapshot.provider === "string" ? snapshot.provider.trim() : "";
	const model = typeof snapshot.model === "string" ? snapshot.model.trim() : "";
	if (!provider || !model) {
		return undefined;
	}
	return `执行模型：${provider} / ${model}`;
}

function resolveRunExecutionLine(run: ConnRunRecord): string | undefined {
	const snapshot = run.resolvedSnapshot;
	if (!snapshot || typeof snapshot !== "object") {
		return undefined;
	}
	const agentName = typeof snapshot.agentName === "string" ? snapshot.agentName.trim() : "";
	const agentId = typeof snapshot.agentId === "string" ? snapshot.agentId.trim() : "";
	const fallbackUsed = snapshot.fallbackUsed === true;
	if (fallbackUsed) {
		return `执行 Agent：原执行 Agent 不可用，已由 ${agentName || agentId || "默认 Agent"} 完成`;
	}
	if (!agentName && !agentId) {
		return undefined;
	}
	return `执行 Agent：${agentName || agentId}`;
}

function resolveHeartbeatMs(heartbeatMs: number | undefined, leaseMs: number | undefined): number {
	if (Number.isFinite(heartbeatMs) && Number(heartbeatMs) > 0) {
		return Math.max(10, Math.trunc(Number(heartbeatMs)));
	}
	const baseLeaseMs = Number.isFinite(leaseMs) && Number(leaseMs) > 0 ? Number(leaseMs) : 300_000;
	return Math.max(1_000, Math.min(Math.trunc(baseLeaseMs / 3), 10_000));
}

function startRunHeartbeat(input: {
	runStore: ConnRunStore;
	runId: string;
	workerId: string;
	leaseMs?: number;
	heartbeatMs: number;
	onCancelled?: (run: ConnRunRecord) => void;
}): { stop(): Promise<void> } {
	let timer: NodeJS.Timeout | undefined;
	let closed = false;
	let inFlight: Promise<void> | undefined;

	const beat = async (): Promise<void> => {
		if (closed) {
			return;
		}
		try {
			const run = await input.runStore.heartbeatRun({
				runId: input.runId,
				workerId: input.workerId,
				now: new Date(),
				leaseMs: input.leaseMs,
			});
			if (run?.status === "cancelled") {
				input.onCancelled?.(run);
				closed = true;
				if (timer) {
					clearInterval(timer);
					timer = undefined;
				}
			}
		} catch (error) {
			console.warn("[conn-worker] heartbeat failed:", error);
		}
	};

	timer = setInterval(() => {
		inFlight = beat();
	}, input.heartbeatMs);

	return {
		async stop(): Promise<void> {
			if (closed) {
				return;
			}
			closed = true;
			if (timer) {
				clearInterval(timer);
				timer = undefined;
			}
			await inFlight;
		},
	};
}

class HttpNotificationBroadcaster implements NotificationBroadcaster {
	constructor(private readonly broadcastUrl: string) {}

	async broadcast(event: NotificationBroadcastEvent): Promise<void> {
		const response = await fetch(this.broadcastUrl, {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify(event),
		});
		if (!response.ok) {
			throw new Error(`Notification broadcast failed with ${response.status}`);
		}
	}
}

async function main(): Promise<void> {
	const config = getAppConfig();
	const database = new ConnDatabase({ dbPath: config.connDatabasePath });
	await database.initialize();

	const assetStore = new AssetStore({
		blobsDir: config.agentAssetBlobsDir,
		indexPath: config.assetIndexPath,
	});
	const connStore = new DefaultConnSqliteStore({ database });
	const runStore = new DefaultConnRunStore({ database });
	const activityStore = new DefaultAgentActivityStore({ database });
	const notificationBroadcaster = new HttpNotificationBroadcaster(
		process.env.NOTIFICATION_BROADCAST_URL?.trim() ||
			`http://127.0.0.1:${config.port}/v1/internal/notifications/broadcast`,
	);
	const browserRegistry = createBrowserRegistryFromEnv();
	const runner = new BackgroundAgentRunner({
		runStore,
		profileResolver: new BackgroundAgentProfileResolver({
			projectRoot: config.projectRoot,
		}),
		workspaceManager: new BackgroundWorkspaceManager({
			backgroundDataDir: config.backgroundDataDir,
			assetStore,
		}),
		sessionFactory: new ProjectBackgroundSessionFactory(config.projectRoot),
		defaultBrowserId: browserRegistry.defaultBrowserId,
		publicBaseUrl: config.publicBaseUrl,
		publicDir: resolve(config.projectRoot, "public"),
	});
	const teamGroupRunner = new TeamGroupConnRunner({
		runStore,
		apiBaseUrl:
			process.env.CONN_TEAM_API_BASE_URL?.trim() ||
			`http://127.0.0.1:${config.port}`,
	});
	const worker = new ConnWorker({
		workerId: process.env.CONN_WORKER_ID?.trim() || `conn-worker:${process.pid}`,
		backgroundDataDir: config.backgroundDataDir,
		connStore,
		runStore,
		activityStore,
		notificationBroadcaster,
		runner,
		teamGroupRunner,
		leaseMs: Number(process.env.CONN_WORKER_LEASE_MS ?? 300_000),
		maxConcurrency: Number(process.env.CONN_WORKER_MAX_CONCURRENCY ?? 1),
	});
	const pollIntervalMs = Math.max(1_000, Number(process.env.CONN_WORKER_POLL_INTERVAL_MS ?? 10_000));
	let running = false;
	let closed = false;

	async function tick(): Promise<void> {
		if (running || closed) {
			return;
		}
		running = true;
		try {
			await worker.tick();
		} catch (error) {
			console.error("[conn-worker] tick failed:", error);
		} finally {
			running = false;
		}
	}

	await tick();
	const interval = setInterval(() => {
		void tick();
	}, pollIntervalMs);

	function shutdown(): void {
		closed = true;
		clearInterval(interval);
		database.close();
	}

	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}

function toNotificationBroadcastEvent(activity: Awaited<ReturnType<AgentActivityStore["create"]>>): NotificationBroadcastEvent {
	return {
		activityId: activity.activityId,
		...(activity.conversationId ? { conversationId: activity.conversationId } : {}),
		source: activity.source,
		sourceId: activity.sourceId,
		...(activity.runId ? { runId: activity.runId } : {}),
		kind: activity.kind,
		title: activity.title,
		createdAt: activity.createdAt,
	};
}

function toAgentActivityInput(
	conn: ConnDefinition,
	run: ConnRunRecord,
	now: Date,
	files: ActivityFile[] = [],
): CreateAgentActivityInput {
	return {
		source: "conn",
		sourceId: conn.connId,
		runId: run.runId,
		kind: "conn_result",
		title: `${conn.title} ${resolveNotificationTitleSuffix(run.status)}`,
		text: resolveNotificationText(run),
		files,
		createdAt: now,
	};
}

function toActivityOutputFiles(
	connId: string,
	runId: string,
	files: ConnRunFileRecord[],
): ActivityFile[] {
	return files.flatMap((file) => {
		const outputPath = file.relativePath.startsWith("output/") ? file.relativePath.slice("output/".length) : "";
		if (!outputPath) {
			return [];
		}
		return [
			{
				fileName: file.fileName,
				downloadUrl: `/v1/conns/${encodeURIComponent(connId)}/runs/${encodeURIComponent(runId)}/output/${encodeOutputPath(outputPath)}`,
				mimeType: file.mimeType,
				sizeBytes: file.sizeBytes,
			},
		];
	});
}

function encodeOutputPath(outputPath: string): string {
	return outputPath
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (entrypoint && import.meta.url === entrypoint) {
	await main();
}
