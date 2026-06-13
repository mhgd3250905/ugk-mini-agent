import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	resolveAgentDefaultModelContext,
	resolveProjectDefaultModelContext,
} from "../src/agent/agent-session-factory.js";

async function setupProjectWithModels(
	models: Record<string, { models: Array<{ id: string; contextWindow: number; maxTokens: number }> }>,
	settings: { defaultProvider: string; defaultModel: string; compaction?: { reserveTokens: number } },
): Promise<string> {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-default-ctx-"));
	await mkdir(join(projectRoot, ".pi"), { recursive: true });
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await mkdir(join(projectRoot, ".data", "agent"), { recursive: true });
	await writeFile(join(projectRoot, ".pi", "settings.json"), JSON.stringify(settings), "utf8");
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({ providers: {} }),
		"utf8",
	);
	await writeFile(
		join(projectRoot, ".data", "agent", "model-providers.json"),
		JSON.stringify({
			providers: Object.fromEntries(
				Object.entries(models).map(([providerId, provider]) => [
					providerId,
					{
						name: providerId,
						api: "anthropic-messages",
						baseUrl: "https://example.invalid",
						apiKey: "TEST_API_KEY",
						models: provider.models,
					},
				]),
			),
		}),
		"utf8",
	);
	return projectRoot;
}

test("resolveAgentDefaultModelContext uses agent model when both provider and model are given", async () => {
	const projectRoot = await setupProjectWithModels(
		{
			"global-provider": { models: [{ id: "global-model", contextWindow: 64000, maxTokens: 4096 }] },
			"agent-provider": { models: [{ id: "agent-model", contextWindow: 128000, maxTokens: 8192 }] },
		},
		{ defaultProvider: "global-provider", defaultModel: "global-model", compaction: { reserveTokens: 4096 } },
	);

	const ctx = resolveAgentDefaultModelContext(projectRoot, {
		provider: "agent-provider",
		model: "agent-model",
	});

	assert.equal(ctx.provider, "agent-provider");
	assert.equal(ctx.model, "agent-model");
	assert.ok(typeof ctx.contextWindow === "number" && ctx.contextWindow > 0);
	assert.ok(typeof ctx.maxResponseTokens === "number" && ctx.maxResponseTokens > 0);
	assert.equal(ctx.reserveTokens, 4096);
});

test("resolveAgentDefaultModelContext falls back to project global when agent input is empty", async () => {
	const projectRoot = await setupProjectWithModels(
		{ "global-provider": { models: [{ id: "global-model", contextWindow: 64000, maxTokens: 4096 }] } },
		{ defaultProvider: "global-provider", defaultModel: "global-model" },
	);

	const withEmpty = resolveAgentDefaultModelContext(projectRoot, {});
	const withUndef = resolveAgentDefaultModelContext(projectRoot, undefined);
	const globalCtx = resolveProjectDefaultModelContext(projectRoot);

	assert.equal(withEmpty.provider, globalCtx.provider);
	assert.equal(withEmpty.model, globalCtx.model);
	assert.equal(withUndef.provider, globalCtx.provider);
	assert.equal(withUndef.model, globalCtx.model);
});

test("resolveAgentDefaultModelContext falls back to project global when agent model is unknown", async () => {
	const projectRoot = await setupProjectWithModels(
		{ "global-provider": { models: [{ id: "global-model", contextWindow: 64000, maxTokens: 4096 }] } },
		{ defaultProvider: "global-provider", defaultModel: "global-model", compaction: { reserveTokens: 8192 } },
	);

	const ctx = resolveAgentDefaultModelContext(projectRoot, {
		provider: "unknown-provider",
		model: "unknown-model",
	});

	assert.equal(ctx.provider, "global-provider");
	assert.equal(ctx.model, "global-model");
	assert.equal(ctx.reserveTokens, 8192);
});
