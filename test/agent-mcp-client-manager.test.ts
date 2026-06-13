import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentMcpClientManager } from "../src/agent/mcp-client-manager.js";
import type { AgentMcpServerConfig } from "../src/agent/mcp-server-catalog.js";

function fixtureServer(overrides: Partial<AgentMcpServerConfig> = {}): AgentMcpServerConfig {
	return {
		serverId: "fixture",
		name: "Fixture MCP",
		enabled: true,
		transport: {
			type: "stdio",
			command: process.execPath,
			args: [join(process.cwd(), "test", "fixtures", "mcp-stdio-server.mjs")],
		},
		timeoutMs: 5_000,
		createdAt: new Date(0).toISOString(),
		updatedAt: new Date(0).toISOString(),
		...overrides,
	};
}

async function waitForProcessExit(pid: number, timeoutMs = 5_000): Promise<void> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		try {
			process.kill(pid, 0);
		} catch {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	assert.fail(`process ${pid} did not exit within ${timeoutMs}ms`);
}

test("AgentMcpClientManager lists tools from a stdio MCP server", async () => {
	const manager = new AgentMcpClientManager();
	const tools = await manager.listTools(fixtureServer());

	assert.deepEqual(
		tools.map((tool) => tool.name),
		["echo_types"],
	);
	assert.equal(tools[0]?.description, "Echo argument values and types");
	assert.equal(tools[0]?.inputSchema?.type, "object");
});

test("AgentMcpClientManager callTool preserves native JSON argument types", async () => {
	const manager = new AgentMcpClientManager();
	const result = await manager.callTool(fixtureServer(), "echo_types", {
		flag: true,
		count: 2,
		nested: { ok: true },
	});
	const payload = JSON.parse(result.text);

	assert.equal(result.isError, false);
	assert.equal(payload.name, "echo_types");
	assert.deepEqual(payload.arguments, { flag: true, count: 2, nested: { ok: true } });
	assert.deepEqual(payload.types, { flag: "boolean", count: "number", nested: "object" });
});

test("AgentMcpClientManager times out slow stdio servers and closes the child process", async () => {
	const root = await mkdtemp(join(tmpdir(), "agent-mcp-manager-"));
	const pidFile = join(root, "pid.txt");
	const manager = new AgentMcpClientManager();

	await assert.rejects(
		manager.listTools(fixtureServer({
			timeoutMs: 100,
			transport: {
				type: "stdio",
				command: process.execPath,
				args: [join(process.cwd(), "test", "fixtures", "mcp-stdio-server.mjs")],
				env: {
					MCP_FIXTURE_PID_FILE: pidFile,
					MCP_FIXTURE_DELAY_TOOLS_LIST_MS: "10000",
				},
			},
		})),
		/MCP server fixture timed out after 100ms/,
	);

	const pid = Number(await readFile(pidFile, "utf8"));
	await waitForProcessExit(pid);
});

test("AgentMcpClientManager closes stdio child processes after successful calls", async () => {
	const root = await mkdtemp(join(tmpdir(), "agent-mcp-manager-"));
	const pidFile = join(root, "pid.txt");
	const manager = new AgentMcpClientManager();

	await manager.listTools(fixtureServer({
		transport: {
			type: "stdio",
			command: process.execPath,
			args: [join(process.cwd(), "test", "fixtures", "mcp-stdio-server.mjs")],
			env: { MCP_FIXTURE_PID_FILE: pidFile },
		},
	}));

	const pid = Number(await readFile(pidFile, "utf8"));
	await waitForProcessExit(pid);
});
