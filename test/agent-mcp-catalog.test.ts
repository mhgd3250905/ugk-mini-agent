import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createAgentMcpServer,
	deleteAgentMcpServer,
	listAgentMcpServers,
	listEnabledAgentMcpServers,
	updateAgentMcpServer,
} from "../src/agent/mcp-server-catalog.js";
import { createStoredAgentProfile } from "../src/agent/agent-profile-catalog.js";

async function createProjectRoot(): Promise<string> {
	return await mkdtemp(join(tmpdir(), "agent-mcp-catalog-"));
}

function stdioServerInput(overrides: Record<string, unknown> = {}) {
	return {
		serverId: "qr-ocr",
		name: "QR OCR",
		description: "本机 OCR MCP server",
		enabled: true,
		transport: {
			type: "stdio",
			command: "python",
			args: ["ocr_mcp_server.py"],
			cwd: "E:\\AII\\ugk-qr-scan",
		},
		timeoutMs: 180000,
		...overrides,
	};
}

test("agent MCP catalog stores servers under the selected custom agent profile", async () => {
	const projectRoot = await createProjectRoot();
	await createStoredAgentProfile(projectRoot, { agentId: "ocr", name: "OCR", description: "OCR tools" });

	const created = await createAgentMcpServer(projectRoot, "ocr", stdioServerInput(), new Date("2026-06-13T00:00:00.000Z"));
	const listed = await listAgentMcpServers(projectRoot, "ocr");
	const raw = await readFile(join(projectRoot, ".data", "agents", "ocr", "mcp", "servers.json"), "utf8");

	assert.equal(created.serverId, "qr-ocr");
	assert.equal(created.name, "QR OCR");
	assert.equal(created.enabled, true);
	assert.equal(created.timeoutMs, 180000);
	assert.equal(created.createdAt, "2026-06-13T00:00:00.000Z");
	assert.equal(listed.agentId, "ocr");
	assert.equal(listed.servers.length, 1);
	assert.equal(listed.servers[0]?.transport.type, "stdio");
	assert.match(raw, /"schemaVersion": "agent\/mcp-servers-1"/);
});

test("agent MCP catalog keeps main and custom agent servers isolated", async () => {
	const projectRoot = await createProjectRoot();
	await createStoredAgentProfile(projectRoot, { agentId: "ocr", name: "OCR", description: "OCR tools" });

	await createAgentMcpServer(projectRoot, "main", stdioServerInput({ serverId: "main-ocr", name: "Main OCR" }));
	await createAgentMcpServer(projectRoot, "ocr", stdioServerInput({ serverId: "agent-ocr", name: "Agent OCR" }));

	const main = await listAgentMcpServers(projectRoot, "main");
	const ocr = await listAgentMcpServers(projectRoot, "ocr");

	assert.deepEqual(main.servers.map((server) => server.serverId), ["main-ocr"]);
	assert.deepEqual(ocr.servers.map((server) => server.serverId), ["agent-ocr"]);
});

test("agent MCP catalog updates deletes and filters enabled servers", async () => {
	const projectRoot = await createProjectRoot();
	await createStoredAgentProfile(projectRoot, { agentId: "ocr", name: "OCR", description: "OCR tools" });

	await createAgentMcpServer(projectRoot, "ocr", stdioServerInput({ serverId: "enabled-ocr", name: "Enabled OCR" }));
	await createAgentMcpServer(projectRoot, "ocr", stdioServerInput({ serverId: "disabled-ocr", name: "Disabled OCR", enabled: false }));

	const updated = await updateAgentMcpServer(
		projectRoot,
		"ocr",
		"disabled-ocr",
		{
			name: "Disabled OCR Updated",
			enabled: true,
			timeoutMs: 240000,
			transport: { type: "stdio", command: "python", args: ["server.py", "--stdio"] },
		},
		new Date("2026-06-13T01:00:00.000Z"),
	);
	const enabled = await listEnabledAgentMcpServers(projectRoot, "ocr");
	const deleted = await deleteAgentMcpServer(projectRoot, "ocr", "enabled-ocr");
	const remaining = await listAgentMcpServers(projectRoot, "ocr");

	assert.equal(updated.name, "Disabled OCR Updated");
	assert.equal(updated.timeoutMs, 240000);
	assert.deepEqual(updated.transport.args, ["server.py", "--stdio"]);
	assert.equal(updated.updatedAt, "2026-06-13T01:00:00.000Z");
	assert.deepEqual(enabled.map((server) => server.serverId), ["disabled-ocr", "enabled-ocr"]);
	assert.deepEqual(deleted, { deleted: true, agentId: "ocr", serverId: "enabled-ocr" });
	assert.deepEqual(remaining.servers.map((server) => server.serverId), ["disabled-ocr"]);
});

test("agent MCP catalog rejects malformed input and unknown agents", async () => {
	const projectRoot = await createProjectRoot();

	await assert.rejects(
		createAgentMcpServer(projectRoot, "missing", stdioServerInput()),
		/Unknown agentId: missing/,
	);
	await assert.rejects(
		createAgentMcpServer(projectRoot, "main", stdioServerInput({ serverId: "../bad" })),
		/serverId must start/,
	);
	await assert.rejects(
		createAgentMcpServer(projectRoot, "main", stdioServerInput({ timeoutMs: 999 })),
		/timeoutMs must be between 1000 and 600000/,
	);
	await assert.rejects(
		createAgentMcpServer(projectRoot, "main", stdioServerInput({ transport: { type: "http", url: "http://example.test" } })),
		/transport.type must be stdio/,
	);
	await assert.rejects(
		createAgentMcpServer(projectRoot, "main", stdioServerInput({ transport: { type: "stdio", command: "", args: [] } })),
		/transport.command is required/,
	);
	await assert.rejects(
		createAgentMcpServer(projectRoot, "main", stdioServerInput({ transport: { type: "stdio", command: "python", args: [], cwd: "relative" } })),
		/transport.cwd must be an absolute path/,
	);
});
