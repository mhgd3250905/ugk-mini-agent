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
	const siteAssetsDirs = [
		resolve(join(options.projectRoot, "imgs")),
		resolve(join(options.projectRoot, "docs", "assets")),
	];

	app.get("/", async (_request, reply) => {
		reply.type("text/html; charset=utf-8");
		reply.header("cache-control", "no-store, no-cache, must-revalidate");
		return renderPublicSitePage();
	});

	app.get("/site-assets/:fileName", async (request, reply) => {
		const { fileName } = request.params as { fileName: string };
		return await sendPublicSiteAsset(reply, siteAssetsDirs, fileName);
	});
}

async function sendPublicSiteAsset(
	reply: FastifyReply,
	siteAssetsDirs: string[],
	fileName: string,
) {
	const safeFileName = basename(fileName);
	if (!safeFileName || safeFileName !== fileName || safeFileName.startsWith(".")) {
		return reply.status(404).send();
	}

	if (!PUBLIC_SITE_ASSET_EXTENSIONS.has(extname(safeFileName).toLowerCase())) {
		return reply.status(404).send();
	}

	for (const siteAssetsDir of siteAssetsDirs) {
		const filePath = resolve(join(siteAssetsDir, safeFileName));
		if (!isPathInside(filePath, siteAssetsDir)) {
			continue;
		}

		try {
			const fileStat = await stat(filePath);
			if (!fileStat.isFile()) {
				continue;
			}
			reply.type(resolveContentType(filePath));
			reply.header("content-length", fileStat.size);
			reply.header("cache-control", "public, max-age=300");
			return reply.send(createReadStream(filePath));
		} catch {
			continue;
		}
	}

	return reply.status(404).send();
}
