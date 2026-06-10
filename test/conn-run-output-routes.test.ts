import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("GET /v1/conns/:connId/runs/:runId returns run detail with output files", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async (runId: string) =>
				runId === "run-2"
					? {
							runId: "run-2",
							connId: "conn-1",
							status: "succeeded",
							scheduledAt: "2026-04-21T09:00:00.000Z",
							claimedAt: "2026-04-21T09:00:01.000Z",
							startedAt: "2026-04-21T09:00:02.000Z",
							leaseOwner: "worker-a",
							leaseUntil: "2026-04-21T09:05:00.000Z",
							workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2",
							resultSummary: "done",
							createdAt: "2026-04-21T09:00:00.000Z",
							updatedAt: "2026-04-21T09:00:30.000Z",
						}
					: runId === "run-other"
						? {
								runId: "run-other",
								connId: "conn-other",
								status: "succeeded",
								scheduledAt: "2026-04-21T09:00:00.000Z",
								workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-other",
								createdAt: "2026-04-21T09:00:00.000Z",
								updatedAt: "2026-04-21T09:00:30.000Z",
							}
						: undefined,
			listEvents: async () => [],
			listFiles: async (runId: string) =>
				runId === "run-2"
					? [
							{
								fileId: "file-1",
								runId: "run-2",
								kind: "output",
								relativePath: "output/report.md",
								fileName: "report.md",
								mimeType: "text/markdown",
								sizeBytes: 42,
								createdAt: "2026-04-21T09:00:30.000Z",
							},
						]
					: [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs/run-2",
	});
	const wrongConnResponse = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs/run-other",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		run: {
			runId: "run-2",
			connId: "conn-1",
			status: "succeeded",
			scheduledAt: "2026-04-21T09:00:00.000Z",
			claimedAt: "2026-04-21T09:00:01.000Z",
			startedAt: "2026-04-21T09:00:02.000Z",
			leaseOwner: "worker-a",
			leaseUntil: "2026-04-21T09:05:00.000Z",
			workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2",
			resultSummary: "done",
			createdAt: "2026-04-21T09:00:00.000Z",
			updatedAt: "2026-04-21T09:00:30.000Z",
		},
		files: [
			{
				fileId: "file-1",
				runId: "run-2",
				kind: "output",
				relativePath: "output/report.md",
				fileName: "report.md",
				mimeType: "text/markdown",
				sizeBytes: 42,
				createdAt: "2026-04-21T09:00:30.000Z",
				url: "/v1/conns/conn-1/runs/run-2/output/report.md",
				latestUrl: "/v1/conns/conn-1/output/latest/report.md",
			},
		],
	});
	assert.equal(wrongConnResponse.statusCode, 404);
	await app.close();
});

test("GET /v1/conns/:connId/runs/:runId/output/* serves indexed conn output files", async () => {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-conn-output-"));
	const outputDir = join(root, "background", "runs", "run-2", "output");
	await mkdir(outputDir, { recursive: true });
	await writeFile(join(outputDir, "report.html"), "<h1>report</h1>", "utf8");
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {} as never,
		backgroundDataDir: join(root, "background"),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async (runId: string) =>
				runId === "run-2"
					? {
							runId: "run-2",
							connId: "conn-1",
							status: "succeeded",
							scheduledAt: "2026-04-21T09:00:00.000Z",
							workspacePath: join(root, "background", "runs", "run-2"),
							createdAt: "2026-04-21T09:00:00.000Z",
							updatedAt: "2026-04-21T09:00:30.000Z",
						}
					: undefined,
			listEvents: async () => [],
			listFiles: async () => [
				{
					fileId: "file-1",
					runId: "run-2",
					kind: "output",
					relativePath: "output/report.html",
					fileName: "report.html",
					mimeType: "text/html; charset=utf-8",
					sizeBytes: 15,
					createdAt: "2026-04-21T09:00:30.000Z",
				},
			],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs/run-2/output/report.html",
	});
	const downloadResponse = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs/run-2/output/report.html?download=true",
	});
	const traversalResponse = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs/run-2/output/../manifest.json",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /^text\/html/);
	assert.match(
		response.headers["content-disposition"] ?? "",
		/^inline;\s*filename="report\.html";\s*filename\*=UTF-8''report\.html$/,
	);
	assert.equal(response.body, "<h1>report</h1>");
	assert.match(downloadResponse.headers["content-disposition"] ?? "", /^attachment;/);
	assert.equal(traversalResponse.statusCode, 404);
	await app.close();
});

test("GET /v1/conns/:connId/output/latest/* serves the newest run output matching the path", async () => {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-conn-output-latest-"));
	const oldOutputDir = join(root, "background", "runs", "run-old", "output");
	const newOutputDir = join(root, "background", "runs", "run-new", "output");
	await mkdir(oldOutputDir, { recursive: true });
	await mkdir(newOutputDir, { recursive: true });
	await writeFile(join(oldOutputDir, "zhihu-browse-report.html"), "old", "utf8");
	await writeFile(join(newOutputDir, "zhihu-browse-report.html"), "new", "utf8");
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {} as never,
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [
				{
					runId: "run-new",
					connId: "conn-1",
					status: "succeeded",
					scheduledAt: "2026-04-21T10:00:00.000Z",
					workspacePath: join(root, "background", "runs", "run-new"),
					createdAt: "2026-04-21T10:00:00.000Z",
					updatedAt: "2026-04-21T10:00:30.000Z",
				},
				{
					runId: "run-old",
					connId: "conn-1",
					status: "succeeded",
					scheduledAt: "2026-04-21T09:00:00.000Z",
					workspacePath: join(root, "background", "runs", "run-old"),
					createdAt: "2026-04-21T09:00:00.000Z",
					updatedAt: "2026-04-21T09:00:30.000Z",
				},
			],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async (runId: string) => [
				{
					fileId: `file-${runId}`,
					runId,
					kind: "output",
					relativePath: "output/zhihu-browse-report.html",
					fileName: "zhihu-browse-report.html",
					mimeType: "text/html; charset=utf-8",
					sizeBytes: 3,
					createdAt: "2026-04-21T10:00:30.000Z",
				},
			],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/output/latest/zhihu-browse-report.html",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /^text\/html/);
	assert.match(response.headers["content-disposition"] ?? "", /^inline;/);
	assert.equal(response.body, "new");
	await app.close();
});

test("GET /v1/conns/:connId/public/* serves only conn public shared files", async () => {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-conn-public-"));
	const publicDir = join(root, "background", "shared", "conn-1", "public");
	await mkdir(publicDir, { recursive: true });
	await writeFile(join(publicDir, "site.html"), "<h1>public</h1>", "utf8");
	await writeFile(join(root, "background", "shared", "conn-1", "secret.txt"), "secret", "utf8");
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {} as never,
		backgroundDataDir: join(root, "background"),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/public/site.html",
	});
	const traversalResponse = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/public/../secret.txt",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /^text\/html/);
	assert.match(response.headers["content-disposition"] ?? "", /^inline;/);
	assert.equal(response.body, "<h1>public</h1>");
	assert.equal(traversalResponse.statusCode, 404);
	await app.close();
});

test("GET /v1/conns/:connId/runs/:runId/events returns ordered run events", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async (runId: string) =>
				runId === "run-2"
					? {
							runId: "run-2",
							connId: "conn-1",
							status: "running",
							scheduledAt: "2026-04-21T09:00:00.000Z",
							workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2",
							createdAt: "2026-04-21T09:00:00.000Z",
							updatedAt: "2026-04-21T09:00:01.000Z",
						}
					: undefined,
			listEvents: async (runId: string) =>
				runId === "run-2"
					? [
							{
								eventId: "event-1",
								runId: "run-2",
								seq: 1,
								eventType: "workspace_created",
								event: { rootPath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2" },
								createdAt: "2026-04-21T09:00:01.000Z",
							},
						]
					: [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs/run-2/events",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		events: [
			{
				eventId: "event-1",
				runId: "run-2",
				seq: 1,
				eventType: "workspace_created",
				event: { rootPath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2" },
				createdAt: "2026-04-21T09:00:01.000Z",
			},
		],
		hasMore: false,
		limit: 2,
	});
	await app.close();
});
