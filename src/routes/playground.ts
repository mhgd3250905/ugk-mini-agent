import type { FastifyInstance, FastifyReply } from "fastify";
import { renderConnPage } from "../ui/conn-page.js";
import { renderInboxPage } from "../ui/inbox-page.js";
import { renderAgentsPage } from "../ui/agents-page.js";
import { renderModelSourcesPage } from "../ui/model-sources-page.js";
import { renderTeamPage } from "../ui/team-page.js";
import { renderPlaygroundPage } from "../ui/playground.js";
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

	app.get("/playground/team", async (_request, reply) => {
		reply.type("text/html; charset=utf-8");
		reply.header("cache-control", "no-store, no-cache, must-revalidate");
		reply.header("pragma", "no-cache");
		reply.header("expires", "0");
		return renderTeamPage();
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
