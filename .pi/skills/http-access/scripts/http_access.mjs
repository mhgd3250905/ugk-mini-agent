#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_USER_AGENT = "UgkHttpAccess/1.0";
const TEXT_PREVIEW_CHARS = 12_000;

function parseArgs(argv) {
	const [command, ...rest] = argv;
	const args = { command, headers: [] };
	for (let i = 0; i < rest.length; i += 1) {
		const token = rest[i];
		if (!token?.startsWith("--")) continue;
		const key = token.slice(2);
		if (key === "overwrite") {
			args.overwrite = true;
			continue;
		}
		const value = rest[i + 1];
		if (value === undefined || value.startsWith("--")) {
			throw new Error(`missing value for --${key}`);
		}
		i += 1;
		if (key === "header") {
			args.headers.push(value);
		} else {
			args[key] = value;
		}
	}
	return args;
}

function usage() {
	return [
		"Usage:",
		"  http_access.mjs request --url <url> [--method GET] [--header 'accept: application/json'] [--body text]",
		"  http_access.mjs json --url <url>",
		"  http_access.mjs html --url <url>",
		"  http_access.mjs extract --url <url> [--limit 20]",
		"  http_access.mjs head --url <url>",
		"  http_access.mjs download --url <url> --out <path> [--overwrite]",
	].join("\n");
}

function parsePositiveInt(value, fallback, fieldName) {
	if (value === undefined) return fallback;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`${fieldName} must be a positive integer`);
	}
	return parsed;
}

function parseUrl(value) {
	if (!value || typeof value !== "string") throw new Error("url is required");
	const url = new URL(value);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("only http and https URLs are supported");
	}
	return url;
}

function parseHeaders(rawHeaders = []) {
	const headers = new Headers();
	headers.set("user-agent", DEFAULT_USER_AGENT);
	for (const raw of rawHeaders) {
		const index = raw.indexOf(":");
		if (index <= 0) throw new Error(`invalid header '${raw}', expected 'name: value'`);
		const name = raw.slice(0, index).trim();
		const value = raw.slice(index + 1).trim();
		if (!name) throw new Error(`invalid header '${raw}'`);
		headers.set(name, value);
	}
	return headers;
}

function buildRequest(args, fallbackMethod = "GET") {
	const url = parseUrl(args.url);
	const method = String(args.method || fallbackMethod).toUpperCase();
	const headers = parseHeaders(args.headers);
	const timeoutMs = parsePositiveInt(args["timeout-ms"], DEFAULT_TIMEOUT_MS, "timeout-ms");
	const maxBytes = parsePositiveInt(args["max-bytes"], DEFAULT_MAX_BYTES, "max-bytes");
	return { url, method, headers, timeoutMs, maxBytes, body: args.body };
}

async function fetchWithTimeout(request) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(new Error("request timeout")), request.timeoutMs);
	try {
		const init = {
			method: request.method,
			headers: request.headers,
			redirect: "follow",
			signal: controller.signal,
		};
		if (request.body !== undefined && request.method !== "GET" && request.method !== "HEAD") {
			init.body = request.body;
		}
		return await fetch(request.url, init);
	} finally {
		clearTimeout(timeout);
	}
}

async function readLimitedText(response, maxBytes) {
	const reader = response.body?.getReader();
	if (!reader) return "";
	const chunks = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new Error(`response body exceeded max-bytes (${maxBytes})`);
		}
		chunks.push(value);
	}
	return new TextDecoder().decode(concatUint8(chunks, total));
}

function concatUint8(chunks, total) {
	const output = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}

function headersObject(headers) {
	const obj = {};
	for (const [key, value] of headers.entries()) obj[key] = value;
	return obj;
}

function responseMeta(response) {
	return {
		ok: response.ok,
		status: response.status,
		statusText: response.statusText,
		url: response.url,
		contentType: response.headers.get("content-type"),
		contentLength: response.headers.get("content-length"),
	};
}

function stripTags(html) {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function decodeBasicEntities(text) {
	return text
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function matchFirst(html, regex) {
	const match = html.match(regex);
	return match ? decodeBasicEntities(match[1].trim()) : "";
}

function extractHtml(html, baseUrl, limit = 20) {
	const title = matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
	const description = matchFirst(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i)
		|| matchFirst(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
	const canonical = matchFirst(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/i)
		|| matchFirst(html, /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["'][^>]*>/i);
	const links = [];
	const seen = new Set();
	for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
		if (links.length >= limit) break;
		try {
			const href = new URL(decodeBasicEntities(match[1]), baseUrl).toString();
			if (seen.has(href)) continue;
			seen.add(href);
			links.push({
				text: decodeBasicEntities(stripTags(match[2])).slice(0, 200),
				url: href,
			});
		} catch {
			// Ignore invalid href.
		}
	}
	return {
		title,
		description,
		canonical: canonical ? new URL(canonical, baseUrl).toString() : "",
		textPreview: decodeBasicEntities(stripTags(html)).slice(0, TEXT_PREVIEW_CHARS),
		links,
	};
}

function printJson(payload) {
	console.log(JSON.stringify(payload, null, 2));
}

async function runRequest(args) {
	const request = buildRequest(args);
	const response = await fetchWithTimeout(request);
	const text = await readLimitedText(response, request.maxBytes);
	printJson({
		command: "request",
		request: { method: request.method, url: request.url.toString() },
		response: responseMeta(response),
		headers: headersObject(response.headers),
		bodyPreview: text.slice(0, TEXT_PREVIEW_CHARS),
		truncated: text.length > TEXT_PREVIEW_CHARS,
	});
	return response.ok ? 0 : 2;
}

async function runJson(args) {
	const request = buildRequest(args);
	if (!request.headers.has("accept")) request.headers.set("accept", "application/json");
	const response = await fetchWithTimeout(request);
	const text = await readLimitedText(response, request.maxBytes);
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		printJson({
			command: "json",
			response: responseMeta(response),
			error: `response is not valid JSON: ${error.message}`,
			bodyPreview: text.slice(0, TEXT_PREVIEW_CHARS),
		});
		return 2;
	}
	printJson({
		command: "json",
		request: { method: request.method, url: request.url.toString() },
		response: responseMeta(response),
		data: parsed,
	});
	return response.ok ? 0 : 2;
}

async function runHtml(args, shouldExtract) {
	const request = buildRequest(args);
	if (!request.headers.has("accept")) {
		request.headers.set("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
	}
	const response = await fetchWithTimeout(request);
	const html = await readLimitedText(response, request.maxBytes);
	const limit = parsePositiveInt(args.limit, 20, "limit");
	const extracted = extractHtml(html, response.url, limit);
	printJson({
		command: shouldExtract ? "extract" : "html",
		request: { method: request.method, url: request.url.toString() },
		response: responseMeta(response),
		html: shouldExtract ? undefined : {
			title: extracted.title,
			description: extracted.description,
			textPreview: extracted.textPreview,
		},
		extracted: shouldExtract ? extracted : undefined,
	});
	return response.ok ? 0 : 2;
}

async function runHead(args) {
	const request = buildRequest(args, "HEAD");
	request.method = "HEAD";
	const response = await fetchWithTimeout(request);
	printJson({
		command: "head",
		request: { method: "HEAD", url: request.url.toString() },
		response: responseMeta(response),
		headers: headersObject(response.headers),
	});
	return response.ok ? 0 : 2;
}

async function fileExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function runDownload(args) {
	if (!args.out) throw new Error("out is required for download");
	const request = buildRequest(args);
	const response = await fetchWithTimeout(request);
	if (!response.ok) {
		const text = await readLimitedText(response, Math.min(request.maxBytes, 64_000)).catch(error => String(error.message));
		printJson({
			command: "download",
			request: { method: request.method, url: request.url.toString() },
			response: responseMeta(response),
			error: `download failed with HTTP ${response.status}`,
			bodyPreview: text.slice(0, 2000),
		});
		return 2;
	}
	const outPath = resolve(args.out);
	if (!args.overwrite && await fileExists(outPath)) {
		throw new Error(`output file already exists: ${outPath}`);
	}
	await mkdir(dirname(outPath), { recursive: true });
	let bytes = 0;
	const limit = request.maxBytes;
	const limiter = new TransformStream({
		transform(chunk, controller) {
			bytes += chunk.byteLength;
			if (bytes > limit) {
				throw new Error(`download exceeded max-bytes (${limit})`);
			}
			controller.enqueue(chunk);
		},
	});
	await pipeline(response.body.pipeThrough(limiter), createWriteStream(outPath));
	const fileStat = await stat(outPath);
	printJson({
		command: "download",
		request: { method: request.method, url: request.url.toString() },
		response: responseMeta(response),
		output: { path: outPath, bytes: fileStat.size },
	});
	return 0;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.command || args.command === "help" || args.command === "--help") {
		console.error(usage());
		return args.command ? 0 : 1;
	}
	switch (args.command) {
		case "request":
			return await runRequest(args);
		case "json":
			return await runJson(args);
		case "html":
			return await runHtml(args, false);
		case "extract":
			return await runHtml(args, true);
		case "head":
			return await runHead(args);
		case "download":
			return await runDownload(args);
		default:
			throw new Error(`unknown command: ${args.command}\n${usage()}`);
	}
}

main()
	.then(code => {
		process.exitCode = code;
	})
	.catch(error => {
		console.error(`http-access failed: ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	});
