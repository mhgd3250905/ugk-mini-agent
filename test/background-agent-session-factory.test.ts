import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectBackgroundSessionFactory } from "../src/agent/background-agent-session-factory.js";
import type { ResolvedBackgroundAgentSnapshot } from "../src/agent/background-agent-profile.js";
import type { RunWorkspace } from "../src/agent/background-workspace.js";
import type { AgentMcpServerConfig } from "../src/agent/mcp-server-catalog.js";

async function createMinimalRuntimeProjectRoot(): Promise<string> {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-background-session-mcp-"));
	await mkdir(join(projectRoot, ".pi"), { recursive: true });
	await mkdir(join(projectRoot, ".data", "agent"), { recursive: true });
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		JSON.stringify({
			defaultProvider: "test-provider",
			defaultModel: "test-model",
		}),
		"utf8",
	);
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({
			providers: {},
		}),
		"utf8",
	);
	await writeFile(
		join(projectRoot, ".data", "agent", "model-providers.json"),
		JSON.stringify({
			providers: {
				"test-provider": {
					baseUrl: "https://example.test",
					api: "anthropic-messages",
					apiKey: "TEST_API_KEY",
					models: [{ id: "test-model", contextWindow: 100000, maxTokens: 12000 }],
				},
			},
		}),
		"utf8",
	);
	return projectRoot;
}

async function createWorkspace(root: string): Promise<RunWorkspace> {
	const workspaceRoot = join(root, ".data", "background", "runs", "run_1");
	const workspace: RunWorkspace = {
		rootPath: workspaceRoot,
		inputDir: join(workspaceRoot, "input"),
		workDir: join(workspaceRoot, "work"),
		outputDir: join(workspaceRoot, "output"),
		logsDir: join(workspaceRoot, "logs"),
		sessionDir: join(workspaceRoot, "session"),
		sharedDir: join(root, ".data", "background", "shared", "conn_1"),
		publicDir: join(root, ".data", "background", "shared", "conn_1", "public"),
		artifactPublicDir: join(workspaceRoot, "artifact-public"),
		manifestPath: join(workspaceRoot, "manifest.json"),
	};
	await Promise.all([
		mkdir(workspace.inputDir, { recursive: true }),
		mkdir(workspace.workDir, { recursive: true }),
		mkdir(workspace.outputDir, { recursive: true }),
		mkdir(workspace.logsDir, { recursive: true }),
		mkdir(workspace.sessionDir, { recursive: true }),
		mkdir(workspace.sharedDir, { recursive: true }),
		mkdir(workspace.publicDir, { recursive: true }),
		mkdir(workspace.artifactPublicDir, { recursive: true }),
	]);
	return workspace;
}

function mcpServer(): AgentMcpServerConfig {
	return {
		serverId: "qr-ocr",
		name: "QR OCR",
		enabled: true,
		transport: { type: "stdio", command: "python", args: ["ocr.py"] },
		timeoutMs: 120000,
		createdAt: "2026-06-13T00:00:00.000Z",
		updatedAt: "2026-06-13T00:00:00.000Z",
	};
}

function snapshot(projectRoot: string): ResolvedBackgroundAgentSnapshot {
	return {
		agentId: "ocr",
		agentName: "OCR",
		profileId: "ocr",
		profileVersion: "builtin:1",
		agentSpecId: "agent.default",
		agentSpecVersion: "builtin:1",
		skillSetId: "skills.default",
		skillSetVersion: "builtin:1",
		skills: [],
		mcpServers: [mcpServer()],
		modelPolicyId: "model.default",
		modelPolicyVersion: "builtin:1",
		provider: "test-provider",
		model: "test-model",
		upgradePolicy: "latest",
		resolvedAt: "2026-06-13T00:00:00.000Z",
		agentDir: join(projectRoot, "runtime", "pi-agent"),
		skillPaths: [],
	};
}

function getSessionTool(session: unknown, name: string) {
	const candidate = session as { getToolDefinition?: (toolName: string) => unknown };
	return candidate.getToolDefinition?.(name) as
		| {
				name: string;
				execute: (
					toolCallId: string,
					params: Record<string, unknown>,
					signal: AbortSignal | undefined,
					onUpdate: undefined,
					ctx: { cwd: string },
				) => Promise<{ content: Array<{ type: string; text?: string }> }>;
		  }
		| undefined;
}

test("ProjectBackgroundSessionFactory injects MCP proxy tool from the resolved agent snapshot", async () => {
	const projectRoot = await createMinimalRuntimeProjectRoot();
	const workspace = await createWorkspace(projectRoot);
	const factory = new ProjectBackgroundSessionFactory(projectRoot);

	const session = await factory.createSession({
		runId: "run_1",
		connId: "conn_1",
		workspace,
		snapshot: snapshot(projectRoot),
	});
	const tool = getSessionTool(session, "mcp");

	assert.ok(tool);
	const result = await tool.execute(
		"call-1",
		{ action: "list_servers" },
		undefined,
		undefined,
		{ cwd: workspace.rootPath },
	);
	assert.deepEqual(JSON.parse(result.content[0]?.text ?? "{}"), {
		ok: true,
		agentId: "ocr",
		servers: [
			{
				serverId: "qr-ocr",
				name: "QR OCR",
				transportType: "stdio",
			},
		],
	});
});
