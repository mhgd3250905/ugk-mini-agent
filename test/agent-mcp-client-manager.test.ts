import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
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

// ---------------------------------------------------------------------------
// HTTP transport
// ---------------------------------------------------------------------------

const HTTP_FIXTURE_TOKEN = "test-token-123";

interface StartedHttpFixture {
	url: string;
	pid: number;
	root: string;
}

async function startHttpFixture(options: { delayListMs?: number; token?: string } = {}): Promise<StartedHttpFixture> {
	const root = await mkdtemp(join(tmpdir(), "agent-mcp-http-"));
	const pidFile = join(root, "pid.txt");
	const child = spawn(process.execPath, [join(process.cwd(), "test", "fixtures", "mcp-http-server.mjs")], {
		env: {
			...process.env,
			MCP_HTTP_PID_FILE: pidFile,
			MCP_HTTP_PORT: "0",
			MCP_HTTP_TOKEN: options.token ?? HTTP_FIXTURE_TOKEN,
			...(options.delayListMs ? { MCP_HTTP_DELAY_LIST_MS: String(options.delayListMs) } : {}),
		},
		stdio: ["ignore", "ignore", "ignore"],
	});
	// Surface spawn failures if the child dies immediately.
	child.on("error", (error) => {
		throw error;
	});

	const startedAt = Date.now();
	while (Date.now() - startedAt < 5_000) {
		try {
			const content = await readFile(pidFile, "utf8");
			const [portLine, pidLine] = content.trim().split("\n");
			const port = Number(portLine);
			const pid = Number(pidLine);
			if (port > 0 && pid > 0) {
				return { url: `http://127.0.0.1:${port}/mcp`, pid, root };
			}
		} catch {
			// pid file not written yet
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("HTTP MCP fixture did not start within 5s");
}

async function stopHttpFixture(fixture: StartedHttpFixture): Promise<void> {
	try {
		process.kill(fixture.pid);
	} catch {
		// already gone
	}
	await waitForProcessExit(fixture.pid);
	await rm(fixture.root, { recursive: true, force: true }).catch(() => undefined);
}

function httpFixtureServer(
	url: string,
	overrides: Partial<AgentMcpServerConfig> = {},
	headers: Record<string, string> = { Authorization: `Bearer ${HTTP_FIXTURE_TOKEN}` },
): AgentMcpServerConfig {
	return {
		serverId: "fixture-http",
		name: "Fixture HTTP MCP",
		enabled: true,
		transport: { type: "http", url, headers },
		timeoutMs: 5_000,
		createdAt: new Date(0).toISOString(),
		updatedAt: new Date(0).toISOString(),
		...overrides,
	};
}

test("AgentMcpClientManager lists tools from an HTTP MCP server", async () => {
	const fixture = await startHttpFixture();
	try {
		const manager = new AgentMcpClientManager();
		const tools = await manager.listTools(httpFixtureServer(fixture.url));

		assert.deepEqual(
			tools.map((tool) => tool.name),
			["echo_http"],
		);
		assert.equal(tools[0]?.description, "Echo HTTP MCP arguments and types");
		assert.equal(tools[0]?.inputSchema?.type, "object");
		await manager.close();
	} finally {
		await stopHttpFixture(fixture);
	}
});

test("AgentMcpClientManager testServer succeeds against an HTTP MCP server", async () => {
	const fixture = await startHttpFixture();
	try {
		const manager = new AgentMcpClientManager();
		const result = await manager.testServer(httpFixtureServer(fixture.url));

		assert.equal(result.ok, true);
		assert.equal(result.serverId, "fixture-http");
		assert.deepEqual(
			result.tools.map((tool) => tool.name),
			["echo_http"],
		);
		await manager.close();
	} finally {
		await stopHttpFixture(fixture);
	}
});

test("AgentMcpClientManager callTool preserves native JSON argument types over HTTP", async () => {
	const fixture = await startHttpFixture();
	try {
		const manager = new AgentMcpClientManager();
		const result = await manager.callTool(httpFixtureServer(fixture.url), "echo_http", {
			flag: true,
			count: 2,
			nested: { ok: true },
		});
		const payload = JSON.parse(result.text);

		assert.equal(result.isError, false);
		assert.equal(payload.name, "echo_http");
		assert.deepEqual(payload.arguments, { flag: true, count: 2, nested: { ok: true } });
		assert.deepEqual(payload.types, { flag: "boolean", count: "number", nested: "object" });
		await manager.close();
	} finally {
		await stopHttpFixture(fixture);
	}
});

test("AgentMcpClientManager HTTP errors are redacted and never leak the bearer token", async () => {
	// A guarded fixture expects a specific token; the client sends a different
	// one, so the request is rejected. Neither token must appear in the
	// returned error message.
	const secretToken = "super-secret-token-do-not-leak-1234567890";
	const guardedFixture = await startHttpFixture({ token: secretToken });
	try {
		const manager = new AgentMcpClientManager();
		const wrongTokenServer = httpFixtureServer(guardedFixture.url, {
			serverId: "guarded-http",
			timeoutMs: 3_000,
		}, { Authorization: "Bearer wrong-but-also-secret-token-abcdef" });
		const result = await manager.testServer(wrongTokenServer);

		assert.equal(result.ok, false);
		assert.equal(result.serverId, "guarded-http");
		assert.match(result.error ?? "", /guarded-http/);
		// The wrong token in the request header must NOT appear in the error.
		assert.doesNotMatch(result.error ?? "", /wrong-but-also-secret-token-abcdef/);
		// The expected token on the server side must NOT appear either.
		assert.doesNotMatch(result.error ?? "", /super-secret-token-do-not-leak/);
		await manager.close();
	} finally {
		await stopHttpFixture(guardedFixture);
	}
});

test("AgentMcpClientManager times out slow HTTP MCP servers", async () => {
	const fixture = await startHttpFixture({ delayListMs: 5_000 });
	try {
		const manager = new AgentMcpClientManager();
		await assert.rejects(
			manager.listTools(httpFixtureServer(fixture.url, { timeoutMs: 200 })),
			/timed out after 200ms/,
		);
		await manager.close();
	} finally {
		await stopHttpFixture(fixture);
	}
});
