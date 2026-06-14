import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { renderConnPage } from "../ui/conn-page.js";
import { renderInboxPage } from "../ui/inbox-page.js";
import { renderAgentsPage } from "../ui/agents-page.js";
import { renderModelSourcesPage } from "../ui/model-sources-page.js";
import { renderPlaygroundPage } from "../ui/playground.js";
import { renderUpdatePage } from "../ui/update-page.js";
import {
	isPlaygroundExternalizedEnabled,
	openPlaygroundRuntimeFile,
	readPlaygroundRuntimeIndex,
	resetPlaygroundRuntime,
} from "../ui/playground-externalized.js";

export interface PlaygroundRouteOptions {
	projectRoot: string;
}

const PLAYGROUND_RUNTIME_EXTENSIONS = new Set([".css", ".html", ".js", ".json"]);
const TEAM_CONSOLE_EXTENSIONS = new Set([".css", ".html", ".ico", ".js", ".json", ".map", ".mjs", ".png", ".svg", ".woff", ".woff2"]);
const TEAM_CONSOLE_CONTENT_TYPES = new Map([
	[".css", "text/css; charset=utf-8"],
	[".html", "text/html; charset=utf-8"],
	[".ico", "image/x-icon"],
	[".js", "application/javascript; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
	[".map", "application/json; charset=utf-8"],
	[".mjs", "application/javascript; charset=utf-8"],
	[".png", "image/png"],
	[".svg", "image/svg+xml"],
	[".woff", "font/woff"],
	[".woff2", "font/woff2"],
]);

export function registerPlaygroundRoute(app: FastifyInstance, options: PlaygroundRouteOptions): void {
	app.get("/playground", async (_request, reply) => {
		reply.type("text/html; charset=utf-8");
		reply.header("cache-control", "no-store, no-cache, must-revalidate");
		reply.header("pragma", "no-cache");
		reply.header("expires", "0");
		if (isPlaygroundExternalizedEnabled()) {
			return await readPlaygroundRuntimeIndex(options.projectRoot);
		}
		return renderPlaygroundPage();
	});

	app.get("/playground/conn", async (_request, reply) => {
		reply.type("text/html; charset=utf-8");
		reply.header("cache-control", "no-store, no-cache, must-revalidate");
		reply.header("pragma", "no-cache");
		reply.header("expires", "0");
		return renderConnPage();
	});

	app.get("/playground/inbox", async (_request, reply) => {
		reply.type("text/html; charset=utf-8");
		reply.header("cache-control", "no-store, no-cache, must-revalidate");
		reply.header("pragma", "no-cache");
		reply.header("expires", "0");
		return renderInboxPage();
	});

	app.get("/playground/agents", async (_request, reply) => {
		reply.type("text/html; charset=utf-8");
		reply.header("cache-control", "no-store, no-cache, must-revalidate");
		reply.header("pragma", "no-cache");
		reply.header("expires", "0");
		return renderAgentsPage();
	});

	app.get("/playground/model-sources", async (_request, reply) => {
		reply.type("text/html; charset=utf-8");
		reply.header("cache-control", "no-store, no-cache, must-revalidate");
		reply.header("pragma", "no-cache");
		reply.header("expires", "0");
		return renderModelSourcesPage();
	});

	app.get("/playground/update", async (_request, reply) => {
		reply.type("text/html; charset=utf-8");
		reply.header("cache-control", "no-store, no-cache, must-revalidate");
		reply.header("pragma", "no-cache");
		reply.header("expires", "0");
		return renderUpdatePage();
	});

	app.get("/playground/team", async (_request, reply) => {
		return await sendTeamConsoleFile(reply, options.projectRoot, "index.html");
	});

	app.get("/playground/team/*", async (request, reply) => {
		const { "*": fileName } = request.params as { "*": string };
		return await sendTeamConsoleFile(reply, options.projectRoot, fileName || "index.html");
	});

	app.get("/playground/:fileName", async (request, reply) => {
		const { fileName } = request.params as { fileName: string };
		return await sendRuntimePlaygroundFile(reply, options.projectRoot, fileName);
	});

	app.get("/playground/vendor/:fileName", async (request, reply) => {
		const { fileName } = request.params as { fileName: string };
		return await sendRuntimePlaygroundFile(reply, options.projectRoot, `vendor/${fileName}`);
	});

	app.get("/playground/extensions/:fileName", async (request, reply) => {
		const { fileName } = request.params as { fileName: string };
		return await sendRuntimePlaygroundFile(reply, options.projectRoot, `extensions/${fileName}`);
	});

	app.post("/playground/reset", async (_request, reply) => {
		const paths = await resetPlaygroundRuntime(options.projectRoot);
		return reply.send({
			ok: true,
			runtimeDir: paths.runtimeDir,
			factoryDir: paths.factoryDir,
		});
	});
}

async function sendTeamConsoleFile(
	reply: FastifyReply,
	projectRoot: string,
	relativePath: string,
) {
	const distDir = resolve(projectRoot, "apps", "team-console", "dist");
	const safeRelativePath = relativePath.replace(/^\/+/, "") || "index.html";
	const extension = extname(safeRelativePath).toLowerCase();
	if (!TEAM_CONSOLE_EXTENSIONS.has(extension)) {
		return reply.status(404).send();
	}
	const filePath = resolve(distDir, safeRelativePath);
	if (!isPathInside(filePath, distDir)) {
		return reply.status(404).send();
	}
	const fileStat = await stat(filePath).catch(() => undefined);
	if (!fileStat?.isFile()) {
		return reply
			.status(404)
			.type("text/plain; charset=utf-8")
			.send("Team Console bundle is missing. Run npm run team-console:build.");
	}
	reply.type(TEAM_CONSOLE_CONTENT_TYPES.get(extension) ?? "application/octet-stream");
	reply.header("content-length", fileStat.size);
	reply.header("cache-control", "no-store, no-cache, must-revalidate");
	reply.header("pragma", "no-cache");
	reply.header("expires", "0");
	return reply.send(createReadStream(filePath));
}

function isPathInside(filePath: string, parentPath: string): boolean {
	const normalizedFilePath = resolve(filePath);
	const normalizedParentPath = resolve(parentPath);
	return normalizedFilePath === normalizedParentPath || normalizedFilePath.startsWith(`${normalizedParentPath}\\`) || normalizedFilePath.startsWith(`${normalizedParentPath}/`);
}

async function sendRuntimePlaygroundFile(
	reply: FastifyReply,
	projectRoot: string,
	relativePath: string,
) {
	const file = await openPlaygroundRuntimeFile(projectRoot, relativePath, PLAYGROUND_RUNTIME_EXTENSIONS);
	if (!file) {
		return reply.status(404).send();
	}
	reply.type(file.contentType);
	reply.header("content-length", file.contentLength);
	reply.header("cache-control", "no-store, no-cache, must-revalidate");
	return reply.send(file.stream);
}
