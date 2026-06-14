// Minimal StreamableHTTP MCP server used by agent-mcp-client-manager tests.
//
// Implements just enough of the MCP Streamable HTTP transport to exercise
// AgentMcpClientManager over HTTP:
//   - POST /mcp with Content-Type: application/json
//   - Bearer token check (Authorization: Bearer <expected>)
//   - JSON-RPC initialize / notifications/initialized / tools/list / tools/call
//   - Responds with Content-Type: application/json (no SSE)
//
// Env knobs:
//   MCP_HTTP_TOKEN           expected bearer token (default: test-token-123)
//   MCP_HTTP_PORT            port to listen on (default: 0 = ephemeral)
//   MCP_HTTP_PID_FILE        if set, writes the listening port + PID here
//   MCP_HTTP_DELAY_LIST_MS   if set, delays tools/list response to test timeout
//
// Output protocol on MCP_HTTP_PID_FILE: first line = port, second line = pid.
// This avoids races where the parent would otherwise have to probe the port.

import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const EXPECTED_TOKEN = process.env.MCP_HTTP_TOKEN || "test-token-123";
const REQUESTED_PORT = Number(process.env.MCP_HTTP_PORT || "0");
const DELAY_LIST_MS = Number(process.env.MCP_HTTP_DELAY_LIST_MS || "0");

function delay(ms) {
	return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function send(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json",
		"cache-control": "no-store",
		"access-control-allow-origin": "*",
	});
	res.end(payload);
}

function unauthorized(res) {
	res.writeHead(401, {
		"content-type": "application/json",
		"www-authenticate": 'Bearer realm="mcp-fixture"',
	});
	res.end(JSON.stringify({ error: "unauthorized" }));
}

function handleJsonRpc(req, body) {
	const { id, method, params } = body;
	if (method === "initialize") {
		return {
			jsonrpc: "2.0",
			id,
			result: {
				protocolVersion: params?.protocolVersion ?? "2025-06-18",
				capabilities: { tools: {} },
				serverInfo: { name: "fixture-http-mcp", version: "1.0.0" },
			},
		};
	}
	if (method === "notifications/initialized") {
		// Acknowledge with 202, no body. Caller handles this before calling here
		// because it has no id.
		return null;
	}
	if (method === "tools/list") {
		return {
			jsonrpc: "2.0",
			id,
			result: {
				tools: [
					{
						name: "echo_http",
						description: "Echo HTTP MCP arguments and types",
						inputSchema: {
							type: "object",
							properties: {
								flag: { type: "boolean" },
								count: { type: "number" },
								nested: { type: "object" },
							},
						},
					},
				],
			},
		};
	}
	if (method === "tools/call") {
		return {
			jsonrpc: "2.0",
			id,
			result: {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							name: params?.name,
							arguments: params?.arguments ?? {},
							types: Object.fromEntries(
								Object.entries(params?.arguments ?? {}).map(([key, value]) => [
									key,
									Array.isArray(value) ? "array" : typeof value,
								]),
							),
						}),
					},
				],
			},
		};
	}
	return {
		jsonrpc: "2.0",
		id,
		error: { code: -32601, message: `Unknown method: ${method}` },
	};
}

const server = createServer(async (req, res) => {
	// CORS preflight (not used by the SDK, but harmless).
	if (req.method === "OPTIONS") {
		res.writeHead(204, {
			"access-control-allow-origin": "*",
			"access-control-allow-methods": "POST, GET, OPTIONS",
			"access-control-allow-headers": "*",
		});
		res.end();
		return;
	}
	if (req.method !== "POST") {
		send(res, 405, { error: `method ${req.method} not allowed` });
		return;
	}

	const auth = req.headers["authorization"] || "";
	if (auth !== `Bearer ${EXPECTED_TOKEN}`) {
		unauthorized(res);
		return;
	}

	const chunks = [];
	for await (const chunk of req) {
		chunks.push(chunk);
	}
	const raw = Buffer.concat(chunks).toString("utf8");
	let body;
	try {
		body = JSON.parse(raw);
	} catch {
		send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
		return;
	}

	// Notification: no id -> 202 Accepted, no body.
	if (body.id === undefined) {
		res.writeHead(202);
		res.end();
		return;
	}

	if (body.method === "tools/list") {
		await delay(DELAY_LIST_MS);
	}

	const result = handleJsonRpc(req, body);
	send(res, 200, result);
});

server.listen(REQUESTED_PORT, "127.0.0.1", () => {
	const { port } = server.address();
	const pidFile = process.env.MCP_HTTP_PID_FILE;
	if (pidFile) {
		// First line: port, second line: pid. Parent reads this to know we're ready.
		writeFileSync(pidFile, `${port}\n${process.pid}\n`, "utf8");
	}
	// Signal readiness on stdout too, for environments that prefer it.
	process.stdout.write(`mcp-http-fixture listening on 127.0.0.1:${port}\n`);
});

// Keep the process alive; parent kills it via the pid.
process.on("SIGTERM", () => {
	server.close(() => process.exit(0));
});
