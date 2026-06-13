import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, posix, resolve } from "node:path";
import type {
	ConnRunEventRecord,
	ConnRunFileRecord,
	ConnRunListCursor,
	ConnRunRecord,
	ListConnRunEventsOptions,
	ListConnRunsOptions,
} from "../agent/conn-run-store.js";
import type { ConnDefinition, ConnExecution, ConnSchedule, ConnTarget } from "../agent/conn-store.js";
import { sanitizeBackgroundPathSegment } from "../agent/background-workspace.js";
import {
	sortConnListBodiesByRecentRun,
	toConnBody,
	toConnListBody,
	toConnRunBody,
	toConnRunEventBody,
	toConnRunFileBody,
} from "./conn-route-presenters.js";
import { parseConnIdList, parseConnMutationBody } from "./conn-route-parsers.js";
import {
	buildContentDispositionHeader,
	resolveFileResponseContentType,
	shouldForceDownload,
	supportsInlinePreview,
} from "./file-route-utils.js";
import { sendBadRequest, sendConflict, sendInternalError } from "./http-errors.js";
import type {
	ConnBulkDeleteRequestBody,
	ConnBulkDeleteResponseBody,
	ConnDetailResponseBody,
	ConnListResponseBody,
	ConnRunDetailResponseBody,
	ConnRunEventsResponseBody,
	ConnRunListResponseBody,
} from "../types/api.js";

interface ConnRouteOptions {
	connStore: ConnStoreLike;
	connRunStore: ConnRunStoreLike;
	backgroundDataDir: string;
	publicBaseUrl?: string;
}

interface ConnStoreLike {
	list(): Promise<ConnDefinition[]>;
	get(connId: string): Promise<ConnDefinition | undefined>;
	create(input: {
		title: string;
		prompt: string;
		target: ConnTarget;
		schedule: ConnSchedule;
		execution?: ConnExecution;
		assetRefs?: string[];
		maxRunMs?: number;
		profileId?: string;
		agentSpecId?: string;
		skillSetId?: string;
		modelPolicyId?: string;
		modelProvider?: string;
		modelId?: string;
		upgradePolicy?: "latest" | "pinned" | "manual";
		publicSiteId?: string;
			artifactDelivery?: import("../agent/artifact-contract.js").ArtifactDeliveryConfig;
	}): Promise<ConnDefinition>;
	update(
		connId: string,
		patch: Partial<
			Pick<
				ConnDefinition,
				| "title"
				| "prompt"
				| "target"
				| "schedule"
				| "execution"
				| "assetRefs"
				| "maxRunMs"
				| "profileId"
				| "agentSpecId"
				| "skillSetId"
				| "modelPolicyId"
				| "modelProvider"
				| "modelId"
				| "upgradePolicy"
				| "publicSiteId"
				| "artifactDelivery"
			>
		>,
	): Promise<ConnDefinition | undefined>;
	delete(connId: string): Promise<boolean>;
	deleteMany?(connIds: readonly string[]): Promise<ConnBulkDeleteResponseBody>;
	pause(connId: string): Promise<ConnDefinition | undefined>;
	resume(connId: string): Promise<ConnDefinition | undefined>;
}

interface ConnRunStoreLike {
	createRun(input: {
		runId?: string;
		connId: string;
		scheduledAt: string;
		workspacePath: string;
	}): Promise<ConnRunRecord>;
	createRunUnlessActive?(input: {
		runId?: string;
		connId: string;
		scheduledAt: string;
		workspacePath: string;
	}): Promise<{ run: ConnRunRecord; reused: boolean }>;
	getActiveRunForConn?(connId: string): Promise<ConnRunRecord | undefined>;
	listRunsForConn(connId: string, options?: ListConnRunsOptions): Promise<ConnRunRecord[]>;
	listLatestRunsForConns?(connIds: readonly string[]): Promise<Record<string, ConnRunRecord | undefined>>;
	getRun(runId: string): Promise<ConnRunRecord | undefined>;
	listEvents(runId: string, options?: ListConnRunEventsOptions): Promise<ConnRunEventRecord[]>;
	listFiles(runId: string): Promise<ConnRunFileRecord[]>;
	markRunRead(runId: string): Promise<boolean>;
	cancelRun?(input: { runId: string; summary: string; text?: string; finishedAt?: Date }): Promise<ConnRunRecord | undefined>;
	getUnreadCountsByConn(connIds: readonly string[]): Promise<Record<string, number>>;
	getLatestUnreadTimesByConn?(connIds: readonly string[]): Promise<Record<string, string>>;
	getTotalUnreadCount(connIds?: readonly string[]): Promise<number>;
	markAllRunsRead(connIds?: readonly string[]): Promise<number>;
}

const RUN_EVENT_PAGE_SIZE = 2;
const RUN_EVENT_MAX_PAGE_SIZE = 20;
const RUN_LIST_PAGE_SIZE = 10;
const RUN_LIST_MAX_PAGE_SIZE = 100;

function parseRunListCursor(rawBefore: string): ConnRunListCursor | undefined {
	const parts = rawBefore.split("|");
	if (parts.length !== 3) {
		return undefined;
	}
	const [scheduledAt, createdAt, runId] = parts.map((part) => part.trim());
	if (!scheduledAt || !createdAt || !runId) {
		return undefined;
	}
	if (!Number.isFinite(Date.parse(scheduledAt)) || !Number.isFinite(Date.parse(createdAt))) {
		return undefined;
	}
	return { scheduledAt, createdAt, runId };
}

function encodeRunListCursor(run: ConnRunRecord): string {
	return `${run.scheduledAt}|${run.createdAt}|${run.runId}`;
}

function parseRunListPageQuery(query: Record<string, unknown>): {
	paginated: boolean;
	value?: { limit: number; before?: ConnRunListCursor };
	error?: string;
} {
	const rawLimit = query.limit;
	const rawBefore = query.before;
	if (rawLimit === undefined && rawBefore === undefined) {
		return { paginated: false };
	}

	let limit = RUN_LIST_PAGE_SIZE;
	if (rawLimit !== undefined) {
		if (typeof rawLimit !== "string" || rawLimit.trim().length === 0) {
			return { paginated: true, error: 'Field "limit" must be a positive integer when provided' };
		}
		const parsedLimit = Number(rawLimit);
		if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
			return { paginated: true, error: 'Field "limit" must be a positive integer when provided' };
		}
		limit = Math.min(parsedLimit, RUN_LIST_MAX_PAGE_SIZE);
	}

	if (rawBefore === undefined || rawBefore === "") {
		return { paginated: true, value: { limit } };
	}
	if (typeof rawBefore !== "string") {
		return { paginated: true, error: 'Field "before" must be a stable run cursor when provided' };
	}
	const before = parseRunListCursor(rawBefore);
	if (!before) {
		return { paginated: true, error: 'Field "before" must be a stable run cursor when provided' };
	}
	return { paginated: true, value: { limit, before } };
}

function parseRunEventPageQuery(query: Record<string, unknown>): {
	value?: { limit: number; beforeSeq?: number };
	error?: string;
} {
	const rawLimit = query.limit;
	let limit = RUN_EVENT_PAGE_SIZE;
	if (rawLimit !== undefined) {
		if (typeof rawLimit !== "string" || rawLimit.trim().length === 0) {
			return { error: 'Field "limit" must be a positive integer when provided' };
		}
		const parsedLimit = Number(rawLimit);
		if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
			return { error: 'Field "limit" must be a positive integer when provided' };
		}
		limit = Math.min(parsedLimit, RUN_EVENT_MAX_PAGE_SIZE);
	}

	const rawBefore = query.before;
	if (rawBefore === undefined || rawBefore === "") {
		return { value: { limit } };
	}
	if (typeof rawBefore !== "string") {
		return { error: 'Field "before" must be a positive integer when provided' };
	}
	const beforeSeq = Number(rawBefore);
	if (!Number.isInteger(beforeSeq) || beforeSeq <= 0) {
		return { error: 'Field "before" must be a positive integer when provided' };
	}
	return { value: { limit, beforeSeq } };
}

function isConnRunLogNoiseEvent(event: ConnRunEventRecord): boolean {
	const normalizedEventType = event.eventType.toLowerCase();
	const nestedType = typeof event.event?.type === "string" ? event.event.type.toLowerCase() : "";
	return normalizedEventType === "text_delta" || nestedType === "text_delta";
}

function normalizeOutputPath(value: string | undefined): string | undefined {
	const raw = String(value ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
	if (!raw || raw.includes("\0")) {
		return undefined;
	}
	const normalized = posix.normalize(raw);
	if (!normalized || normalized === "." || normalized.startsWith("../") || normalized === ".." || posix.isAbsolute(normalized)) {
		return undefined;
	}
	return normalized;
}

function isPathInside(filePath: string, parentDir: string): boolean {
	const normalizedFilePath = resolve(filePath);
	const normalizedParentDir = resolve(parentDir);
	return (
		normalizedFilePath === normalizedParentDir ||
		normalizedFilePath.startsWith(`${normalizedParentDir}\\`) ||
		normalizedFilePath.startsWith(`${normalizedParentDir}/`)
	);
}

function buildPublicUrl(publicBaseUrl: string | undefined, path: string): string {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	if (!publicBaseUrl) {
		return normalizedPath;
	}
	return new URL(normalizedPath, publicBaseUrl.endsWith("/") ? publicBaseUrl : `${publicBaseUrl}/`).toString();
}

function encodeOutputPath(relativePath: string): string {
	return relativePath
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

function inferPublicMimeType(filePath: string): string {
	const extension = filePath.split(".").pop()?.toLowerCase();
	if (extension === "txt" || extension === "md" || extension === "csv") {
		return "text/plain; charset=utf-8";
	}
	if (extension === "json") {
		return "application/json";
	}
	if (extension === "html" || extension === "htm") {
		return "text/html; charset=utf-8";
	}
	if (extension === "png") {
		return "image/png";
	}
	if (extension === "jpg" || extension === "jpeg") {
		return "image/jpeg";
	}
	if (extension === "webp") {
		return "image/webp";
	}
	if (extension === "pdf") {
		return "application/pdf";
	}
	return "application/octet-stream";
}

function toOutputFileLinks(
	connId: string,
	runId: string,
	file: ConnRunFileRecord,
	publicBaseUrl: string | undefined,
): { url?: string; latestUrl?: string } | undefined {
	const outputPath = file.relativePath.startsWith("output/") ? file.relativePath.slice("output/".length) : undefined;
	if (!outputPath) {
		return undefined;
	}
	const encodedPath = encodeOutputPath(outputPath);
	return {
		url: buildPublicUrl(publicBaseUrl, `/v1/conns/${encodeURIComponent(connId)}/runs/${encodeURIComponent(runId)}/output/${encodedPath}`),
		latestUrl: buildPublicUrl(publicBaseUrl, `/v1/conns/${encodeURIComponent(connId)}/output/latest/${encodedPath}`),
	};
}

async function sendConnOutputFile(
	reply: FastifyReply,
	run: ConnRunRecord,
	file: ConnRunFileRecord,
	outputPath: string,
	query: Record<string, unknown>,
): Promise<FastifyReply> {
	const outputRoot = resolve(run.workspacePath, "output");
	const filePath = resolve(outputRoot, outputPath);
	if (!isPathInside(filePath, outputRoot)) {
		return reply.status(404).send();
	}
	try {
		const fileStats = await stat(filePath);
		if (!fileStats.isFile()) {
			return reply.status(404).send();
		}
	} catch {
		return reply.status(404).send();
	}

	const contentType = resolveFileResponseContentType(file.mimeType);
	const disposition = shouldForceDownload(query.download as string | number | boolean | undefined) || !supportsInlinePreview(contentType)
		? "attachment"
		: "inline";
	reply.header("content-type", contentType);
	reply.header("content-disposition", buildContentDispositionHeader(disposition, file.fileName));
	return reply.send(createReadStream(filePath));
}

async function sendPublicDirectoryFile(
	reply: FastifyReply,
	publicRoot: string,
	publicPath: string,
	query: Record<string, unknown>,
): Promise<FastifyReply> {
	const rootPath = resolve(publicRoot);
	const filePath = resolve(rootPath, publicPath);
	if (!isPathInside(filePath, rootPath)) {
		return reply.status(404).send();
	}
	try {
		const fileStats = await stat(filePath);
		if (!fileStats.isFile()) {
			return reply.status(404).send();
		}
	} catch {
		return reply.status(404).send();
	}

	const contentType = resolveFileResponseContentType(inferPublicMimeType(filePath));
	const disposition = shouldForceDownload(query.download as string | number | boolean | undefined) || !supportsInlinePreview(contentType)
		? "attachment"
		: "inline";
	reply.header("content-type", contentType);
	reply.header("content-disposition", buildContentDispositionHeader(disposition, filePath.split(/[\\/]/).pop() ?? "file"));
	return reply.send(createReadStream(filePath));
}

function sendConnValidationError(reply: FastifyReply, error: unknown): FastifyReply | undefined {
	if (!(error instanceof Error)) {
		return undefined;
	}
	if (!/^Invalid conn /.test(error.message)) {
		return undefined;
	}
	return sendBadRequest(reply, error.message);
}

export function registerConnRoutes(app: FastifyInstance, options: ConnRouteOptions): void {
	app.get("/v1/conns", async (): Promise<ConnListResponseBody> => {
		const conns = await options.connStore.list();
		const connIds = conns.map((conn) => conn.connId);
		const [latestRunsByConnId, unreadRunCountsByConnId, unreadLatestRunTimesByConnId, totalUnreadRuns] = await Promise.all([
			options.connRunStore.listLatestRunsForConns
				? options.connRunStore.listLatestRunsForConns(connIds)
				: Promise.resolve(undefined),
			options.connRunStore.getUnreadCountsByConn(connIds),
			options.connRunStore.getLatestUnreadTimesByConn
				? options.connRunStore.getLatestUnreadTimesByConn(connIds)
				: Promise.resolve({}),
			options.connRunStore.getTotalUnreadCount(connIds),
		]);
		return {
			conns: sortConnListBodiesByRecentRun(conns.map((conn) => toConnListBody(conn, latestRunsByConnId))),
			unreadRunCountsByConnId,
			unreadLatestRunTimesByConnId,
			totalUnreadRuns,
		};
	});

	app.get("/v1/conns/:connId", async (request, reply): Promise<ConnDetailResponseBody | FastifyReply> => {
		const { connId } = request.params as { connId: string };
		const conn = await options.connStore.get(connId);
		if (!conn) {
			return reply.status(404).send();
		}
		return { conn: toConnBody(conn) };
	});

	app.get("/v1/conns/:connId/runs", async (request, reply): Promise<ConnRunListResponseBody | FastifyReply> => {
		const { connId } = request.params as { connId: string };
		const conn = await options.connStore.get(connId);
		if (!conn) {
			return reply.status(404).send();
		}
		const parsed = parseRunListPageQuery((request.query ?? {}) as Record<string, unknown>);
		if (parsed.error || (parsed.paginated && !parsed.value)) {
			return sendBadRequest(reply, parsed.error || "Invalid run list query");
		}
		if (parsed.paginated && parsed.value) {
			const runListOptions: ListConnRunsOptions = { limit: parsed.value.limit + 1 };
			if (parsed.value.before) {
				runListOptions.before = parsed.value.before;
			}
			const rows = await options.connRunStore.listRunsForConn(connId, runListOptions);
			const visibleRuns = rows.slice(0, parsed.value.limit);
			const lastVisible = visibleRuns.at(-1);
			const hasMore = rows.length > parsed.value.limit;
			return {
				runs: visibleRuns.map(toConnRunBody),
				hasMore,
				...(hasMore && lastVisible ? { nextBefore: encodeRunListCursor(lastVisible) } : {}),
				limit: parsed.value.limit,
			};
		}
		const runs = await options.connRunStore.listRunsForConn(connId);
		return {
			runs: runs.map(toConnRunBody),
		};
	});

	app.get("/v1/conns/:connId/runs/:runId", async (request, reply): Promise<ConnRunDetailResponseBody | FastifyReply> => {
		const { connId, runId } = request.params as { connId: string; runId: string };
		const run = await options.connRunStore.getRun(runId);
		if (!run || run.connId !== connId) {
			return reply.status(404).send();
		}
		const files = await options.connRunStore.listFiles(runId);
		return {
			run: toConnRunBody(run),
			files: files.map((file) =>
				toConnRunFileBody(file, toOutputFileLinks(connId, runId, file, options.publicBaseUrl)),
			),
		};
	});

	app.post("/v1/conns/runs/read-all", async () => {
		const conns = await options.connStore.list();
		const connIds = conns.map((conn) => conn.connId);
		const markedCount = await options.connRunStore.markAllRunsRead(connIds);
		const totalUnread = await options.connRunStore.getTotalUnreadCount(connIds);
		return { markedCount, totalUnreadRuns: totalUnread };
	});

		app.post("/v1/conns/:connId/runs/:runId/read", async (request, reply) => {
			const { connId, runId } = request.params as { connId: string; runId: string };
			const run = await options.connRunStore.getRun(runId);
			if (!run || run.connId !== connId) {
				return reply.status(404).send();
			}
			await options.connRunStore.markRunRead(runId);
			const updatedRun = await options.connRunStore.getRun(runId);
			const conns = await options.connStore.list();
			const connIds = conns.map((conn) => conn.connId);
			const totalUnread = await options.connRunStore.getTotalUnreadCount(connIds);
			return {
				run: toConnRunBody(updatedRun ?? run),
				totalUnreadRuns: totalUnread,
			};
		});

	app.post("/v1/conns/:connId/runs/:runId/cancel", async (request, reply): Promise<ConnRunDetailResponseBody | FastifyReply> => {
		const { connId, runId } = request.params as { connId: string; runId: string };
		const run = await options.connRunStore.getRun(runId);
		if (!run || run.connId !== connId) {
			return reply.status(404).send();
		}
		if (!options.connRunStore.cancelRun) {
			return sendConflict(reply, "Conn run cancellation is not supported by this store");
		}
		if (run.status !== "pending" && run.status !== "running") {
			return sendConflict(reply, `Conn run is already ${run.status}`);
		}
		const cancelled = await options.connRunStore.cancelRun({
			runId,
			summary: "Manually cancelled by operator",
			text: "Manually cancelled by operator",
		});
		if (!cancelled) {
			return sendConflict(reply, "Conn run could not be cancelled");
		}
		return { run: toConnRunBody(cancelled) };
	});

	app.get(
		"/v1/conns/:connId/runs/:runId/output/*",
		async (
			request: FastifyRequest<{
				Params: { connId: string; runId: string; "*": string };
				Querystring: { download?: string };
			}>,
			reply,
		): Promise<FastifyReply> => {
			const { connId, runId } = request.params;
			const outputPath = normalizeOutputPath(request.params["*"]);
			if (!outputPath) {
				return reply.status(404).send();
			}
			const run = await options.connRunStore.getRun(runId);
			if (!run || run.connId !== connId) {
				return reply.status(404).send();
			}
			const files = await options.connRunStore.listFiles(runId);
			const file = files.find((candidate) => candidate.relativePath === `output/${outputPath}`);
			if (!file) {
				return reply.status(404).send();
			}
			return await sendConnOutputFile(reply, run, file, outputPath, request.query ?? {});
		},
	);

	app.get(
		"/v1/conns/:connId/output/latest/*",
		async (
			request: FastifyRequest<{
				Params: { connId: string; "*": string };
				Querystring: { download?: string };
			}>,
			reply,
		): Promise<FastifyReply> => {
			const { connId } = request.params;
			const outputPath = normalizeOutputPath(request.params["*"]);
			if (!outputPath) {
				return reply.status(404).send();
			}
			const conn = await options.connStore.get(connId);
			if (!conn) {
				return reply.status(404).send();
			}
			const runs = await options.connRunStore.listRunsForConn(connId);
			for (const run of runs) {
				if (run.status !== "succeeded") {
					continue;
				}
				const files = await options.connRunStore.listFiles(run.runId);
				const file = files.find((candidate) => candidate.relativePath === `output/${outputPath}`);
				if (file) {
					return await sendConnOutputFile(reply, run, file, outputPath, request.query ?? {});
				}
			}
			return reply.status(404).send();
		},
	);

	app.get(
		"/v1/conns/:connId/public/*",
		async (
			request: FastifyRequest<{
				Params: { connId: string; "*": string };
				Querystring: { download?: string };
			}>,
			reply,
		): Promise<FastifyReply> => {
			const { connId } = request.params;
			const publicPath = normalizeOutputPath(request.params["*"]);
			if (!publicPath) {
				return reply.status(404).send();
			}
			const conn = await options.connStore.get(connId);
			if (!conn) {
				return reply.status(404).send();
			}
			const publicRoot = join(options.backgroundDataDir, "shared", sanitizeBackgroundPathSegment(conn.connId), "public");
			return await sendPublicDirectoryFile(reply, publicRoot, publicPath, request.query ?? {});
		},
	);

	app.get(
		"/v1/sites/:siteId/*",
		async (
			request: FastifyRequest<{
				Params: { siteId: string; "*": string };
				Querystring: { download?: string };
			}>,
			reply,
		): Promise<FastifyReply> => {
			const siteId = request.params.siteId.trim();
			const publicPath = normalizeOutputPath(request.params["*"]);
			if (!siteId || !publicPath) {
				return reply.status(404).send();
			}
			const publicRoot = join(options.backgroundDataDir, "sites", sanitizeBackgroundPathSegment(siteId), "public");
			return await sendPublicDirectoryFile(reply, publicRoot, publicPath, request.query ?? {});
		},
	);

	app.get(
		"/v1/conns/:connId/runs/:runId/events",
		async (
			request: FastifyRequest<{
				Params: { connId: string; runId: string };
				Querystring: { limit?: string; before?: string };
			}>,
			reply,
		): Promise<ConnRunEventsResponseBody | FastifyReply> => {
			const { connId, runId } = request.params as { connId: string; runId: string };
			const run = await options.connRunStore.getRun(runId);
			if (!run || run.connId !== connId) {
				return reply.status(404).send();
			}
			const parsed = parseRunEventPageQuery(request.query ?? {});
			if (parsed.error || !parsed.value) {
				return sendBadRequest(reply, parsed.error || "Invalid run event query");
			}
			const events = await options.connRunStore.listEvents(runId, {
				beforeSeq: parsed.value.beforeSeq,
				descending: true,
				limit: parsed.value.limit * 6 + 1,
			});
			const meaningfulEvents = events.filter((event) => !isConnRunLogNoiseEvent(event));
			const visibleEvents = meaningfulEvents.slice(0, parsed.value.limit);
			const lastVisible = visibleEvents.at(-1);
			const hasMore =
				!!lastVisible && (meaningfulEvents.length > parsed.value.limit || events.length > parsed.value.limit * 6);
			return {
				events: visibleEvents.map(toConnRunEventBody),
				hasMore,
				...(hasMore && lastVisible ? { nextBefore: String(lastVisible.seq) } : {}),
				limit: parsed.value.limit,
			};
		},
	);

	app.post("/v1/conns", async (request: FastifyRequest<{ Body: Record<string, unknown> }>, reply) => {
		try {
			const body = request.body ?? {};
			const parsed = await parseConnMutationBody(body, {
				requireTitle: true,
				requirePrompt: true,
				requireSchedule: true,
				resolveDefaultTarget: true,
			});
			if (parsed.error) {
				return sendBadRequest(reply, parsed.error);
			}
			const conn = await options.connStore.create({
				title: parsed.value!.title!,
				prompt: parsed.value!.prompt!,
				target: parsed.value!.target!,
				schedule: parsed.value!.schedule!,
				execution: parsed.value!.execution ?? { type: "agent_prompt" },
				assetRefs: parsed.value!.assetRefs,
				...(parsed.value!.maxRunMs !== undefined ? { maxRunMs: parsed.value!.maxRunMs } : {}),
				profileId: parsed.value!.profileId,
				agentSpecId: parsed.value!.agentSpecId,
				skillSetId: parsed.value!.skillSetId,
				modelPolicyId: parsed.value!.modelPolicyId,
				modelProvider: parsed.value!.modelProvider,
				modelId: parsed.value!.modelId,
				upgradePolicy: parsed.value!.upgradePolicy,
				...(parsed.value!.publicSiteId !== undefined ? { publicSiteId: parsed.value!.publicSiteId } : {}),
				...(parsed.value!.artifactDelivery !== undefined ? { artifactDelivery: parsed.value!.artifactDelivery } : {}),
			});
			return reply.status(201).send({ conn: toConnBody(conn) } satisfies ConnDetailResponseBody);
		} catch (error) {
			const validationReply = sendConnValidationError(reply, error);
			if (validationReply) {
				return validationReply;
			}
			return sendInternalError(reply, error);
		}
	});

	app.post(
		"/v1/conns/bulk-delete",
		async (request: FastifyRequest<{ Body: ConnBulkDeleteRequestBody }>, reply): Promise<ConnBulkDeleteResponseBody | FastifyReply> => {
			const parsed = parseConnIdList(request.body?.connIds);
			if (parsed.error) {
				return sendBadRequest(reply, parsed.error);
			}
			if (options.connStore.deleteMany) {
				return await options.connStore.deleteMany(parsed.connIds!);
			}
			const deletedConnIds: string[] = [];
			const missingConnIds: string[] = [];
			for (const connId of parsed.connIds!) {
				if (await options.connStore.delete(connId)) {
					deletedConnIds.push(connId);
				} else {
					missingConnIds.push(connId);
				}
			}
			return { deletedConnIds, missingConnIds };
		},
	);

	app.patch("/v1/conns/:connId", async (request: FastifyRequest<{ Body: Record<string, unknown> }>, reply) => {
		const { connId } = request.params as { connId: string };
		const body = request.body ?? {};
		const parsed = await parseConnMutationBody(body, {});
		if (parsed.error) {
			return sendBadRequest(reply, parsed.error);
		}
		try {
			const conn = await options.connStore.update(connId, {
				...(parsed.value!.title !== undefined ? { title: parsed.value!.title } : {}),
				...(parsed.value!.prompt !== undefined ? { prompt: parsed.value!.prompt } : {}),
				...(parsed.value!.target ? { target: parsed.value!.target } : {}),
				...(parsed.value!.schedule ? { schedule: parsed.value!.schedule } : {}),
				...(body.execution !== undefined ? { execution: parsed.value!.execution } : {}),
				...(body.assetRefs !== undefined ? { assetRefs: parsed.value!.assetRefs ?? [] } : {}),
				...(body.profileId !== undefined ? { profileId: parsed.value!.profileId } : {}),
				...(body.agentSpecId !== undefined ? { agentSpecId: parsed.value!.agentSpecId } : {}),
				...(body.skillSetId !== undefined ? { skillSetId: parsed.value!.skillSetId } : {}),
				...(body.modelPolicyId !== undefined ? { modelPolicyId: parsed.value!.modelPolicyId } : {}),
				...(body.modelProvider !== undefined ? { modelProvider: parsed.value!.modelProvider } : {}),
				...(body.modelId !== undefined ? { modelId: parsed.value!.modelId } : {}),
				...(body.upgradePolicy !== undefined ? { upgradePolicy: parsed.value!.upgradePolicy } : {}),
				...(body.publicSiteId !== undefined ? { publicSiteId: parsed.value!.publicSiteId } : {}),
				...(body.maxRunMs !== undefined ? { maxRunMs: parsed.value!.maxRunMs } : {}),
				...(body.artifactDelivery !== undefined ? { artifactDelivery: parsed.value!.artifactDelivery } : {}),
			});
			if (!conn) {
				return reply.status(404).send();
			}
			return { conn: toConnBody(conn) } satisfies ConnDetailResponseBody;
		} catch (error) {
			const validationReply = sendConnValidationError(reply, error);
			if (validationReply) {
				return validationReply;
			}
			return sendInternalError(reply, error);
		}
	});

	app.post("/v1/conns/:connId/pause", async (request, reply) => {
		const { connId } = request.params as { connId: string };
		const conn = await options.connStore.pause(connId);
		if (!conn) {
			return reply.status(404).send();
		}
		return { conn: toConnBody(conn) } satisfies ConnDetailResponseBody;
	});

	app.post("/v1/conns/:connId/resume", async (request, reply) => {
		const { connId } = request.params as { connId: string };
		const conn = await options.connStore.resume(connId);
		if (!conn) {
			return reply.status(404).send();
		}
		return { conn: toConnBody(conn) } satisfies ConnDetailResponseBody;
	});

	app.post("/v1/conns/:connId/run", async (request, reply) => {
		const { connId } = request.params as { connId: string };
		try {
			const conn = await options.connStore.get(connId);
			if (!conn) {
				return reply.status(404).send();
			}
			const scheduledAt = new Date().toISOString();
			const runId = randomUUID();
			if (options.connRunStore.createRunUnlessActive) {
				const result = await options.connRunStore.createRunUnlessActive({
					runId,
					connId,
					scheduledAt,
					workspacePath: join(options.backgroundDataDir, "runs", runId),
				});
				return reply.status(202).send({
					run: toConnRunBody(result.run),
					...(result.reused ? { reused: true } : {}),
				} satisfies ConnRunDetailResponseBody);
			}
			const activeRun = options.connRunStore.getActiveRunForConn
				? await options.connRunStore.getActiveRunForConn(connId)
				: (await options.connRunStore.listRunsForConn(connId)).find((run) => run.status === "pending" || run.status === "running");
			if (activeRun) {
				return reply.status(202).send({
					run: toConnRunBody(activeRun),
					reused: true,
				} satisfies ConnRunDetailResponseBody);
			}
			const run = await options.connRunStore.createRun({
				runId,
				connId,
				scheduledAt,
				workspacePath: join(options.backgroundDataDir, "runs", runId),
			});
			return reply.status(202).send({ run: toConnRunBody(run) } satisfies ConnRunDetailResponseBody);
		} catch (error) {
			return sendInternalError(reply, error);
		}
	});

	app.delete("/v1/conns/:connId", async (request, reply) => {
		const { connId } = request.params as { connId: string };
		const deleted = await options.connStore.delete(connId);
		if (!deleted) {
			return reply.status(404).send();
		}
		return reply.status(204).send();
	});
}
