import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { renderPublicSitePage } from "../ui/public-site.js";
import { isPathInside, resolveContentType } from "./file-route-utils.js";

export interface PublicSiteRouteOptions {
	projectRoot: string;
}

const PUBLIC_SITE_ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

export function registerPublicSiteRoutes(app: FastifyInstance, options: PublicSiteRouteOptions): void {
	const siteAssetsDir = resolve(join(options.projectRoot, "docs", "assets"));

	app.get("/", async (_request, reply) => {
		reply.type("text/html; charset=utf-8");
		reply.header("cache-control", "no-store, no-cache, must-revalidate");
		return renderPublicSitePage();
	});

	app.get("/site-assets/:fileName", async (request, reply) => {
		const { fileName } = request.params as { fileName: string };
		return await sendPublicSiteAsset(reply, siteAssetsDir, fileName);
	});
}

async function sendPublicSiteAsset(
	reply: FastifyReply,
	siteAssetsDir: string,
	fileName: string,
) {
	const safeFileName = basename(fileName);
	if (!safeFileName || safeFileName !== fileName || safeFileName.startsWith(".")) {
		return reply.status(404).send();
	}

	const filePath = resolve(join(siteAssetsDir, safeFileName));
	if (!isPathInside(filePath, siteAssetsDir)) {
		return reply.status(404).send();
	}

	if (!PUBLIC_SITE_ASSET_EXTENSIONS.has(extname(filePath).toLowerCase())) {
		return reply.status(404).send();
	}

	try {
		const fileStat = await stat(filePath);
		if (!fileStat.isFile()) {
			return reply.status(404).send();
		}
		reply.type(resolveContentType(filePath));
		reply.header("content-length", fileStat.size);
		reply.header("cache-control", "public, max-age=300");
		return reply.send(createReadStream(filePath));
	} catch {
		return reply.status(404).send();
	}
}
