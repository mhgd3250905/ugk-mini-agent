import { writeFileSync } from "node:fs";
import readline from "node:readline";

const pidFile = process.env.MCP_FIXTURE_PID_FILE;
if (pidFile) {
	writeFileSync(pidFile, String(process.pid), "utf8");
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(message) {
	process.stdout.write(JSON.stringify(message) + "\n");
}

async function handleRequest(request) {
	const { id, method, params } = request;
	if (method === "initialize") {
		send({
			jsonrpc: "2.0",
			id,
			result: {
				protocolVersion: params?.protocolVersion ?? "2025-03-26",
				capabilities: { tools: {} },
				serverInfo: { name: "fixture-mcp", version: "1.0.0" },
			},
		});
		return;
	}
	if (method === "tools/list") {
		const delayMs = Number(process.env.MCP_FIXTURE_DELAY_TOOLS_LIST_MS || "0");
		if (delayMs > 0) {
			await delay(delayMs);
		}
		send({
			jsonrpc: "2.0",
			id,
			result: {
				tools: [
					{
						name: "echo_types",
						description: "Echo argument values and types",
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
		});
		return;
	}
	if (method === "tools/call") {
		send({
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
								Object.entries(params?.arguments ?? {}).map(([key, value]) => [key, Array.isArray(value) ? "array" : typeof value]),
							),
						}),
					},
				],
			},
		});
		return;
	}
	send({
		jsonrpc: "2.0",
		id,
		error: { code: -32601, message: `Unknown method: ${method}` },
	});
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
	void (async () => {
		const trimmed = line.trim();
		if (!trimmed) {
			return;
		}
		const message = JSON.parse(trimmed);
		if (message.id === undefined) {
			return;
		}
		await handleRequest(message);
	})().catch((error) => {
		send({
			jsonrpc: "2.0",
			id: null,
			error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
		});
	});
});
