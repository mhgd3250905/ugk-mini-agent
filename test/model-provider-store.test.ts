import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	createFileModelProviderStore,
	getEffectiveProjectModelsPath,
	readMergedProjectModelsContent,
} from "../src/agent/model-provider-store.js";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

async function createProjectRoot(): Promise<string> {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-model-provider-store-"));
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({
			providers: {
				bundled: {
					name: "Bundled",
					vendor: "test",
					region: "global",
					priority: 10,
					baseUrl: "https://bundled.example/anthropic",
					api: "anthropic-messages",
					apiKey: "BUNDLED_API_KEY",
					models: [{ id: "bundled-model", contextWindow: 128000 }],
				},
			},
		}),
		"utf8",
	);
	return projectRoot;
}

test("model provider store merges runtime custom providers with bundled providers", async () => {
	const projectRoot = await createProjectRoot();
	const customProvidersPath = join(projectRoot, ".data", "agent", "model-providers.json");
	const store = createFileModelProviderStore(projectRoot, { customProvidersPath });

	await store.createProvider({
		id: "custom-openai",
		name: "Custom OpenAI",
		vendor: "custom",
		region: "global",
		baseUrl: "https://custom.example/anthropic",
		api: "anthropic-messages",
		apiKeyEnvVar: "CUSTOM_OPENAI_API_KEY",
		models: [{ id: "custom-model", name: "Custom Model", contextWindow: 200000 }],
	});

	const merged = JSON.parse(await readMergedProjectModelsContent(projectRoot, { customProvidersPath }));

	assert.ok(merged.providers.bundled);
	assert.equal(merged.providers["custom-openai"].apiKey, "CUSTOM_OPENAI_API_KEY");
	assert.equal(merged.providers["custom-openai"].models[0].id, "custom-model");
});

test("model provider store rejects custom providers that collide with bundled providers", async () => {
	const projectRoot = await createProjectRoot();
	const store = createFileModelProviderStore(projectRoot, {
		customProvidersPath: join(projectRoot, ".data", "agent", "model-providers.json"),
	});

	await assert.rejects(
		() =>
			store.createProvider({
				id: "bundled",
				name: "Bundled Override",
				vendor: "custom",
				region: "global",
				baseUrl: "https://override.example/anthropic",
				api: "anthropic-messages",
				apiKeyEnvVar: "OVERRIDE_API_KEY",
				models: [{ id: "override-model" }],
			}),
		/provider already exists/,
	);
});

test("model provider store rejects literal API keys", async () => {
	const projectRoot = await createProjectRoot();
	const store = createFileModelProviderStore(projectRoot, {
		customProvidersPath: join(projectRoot, ".data", "agent", "model-providers.json"),
	});

	await assert.rejects(
		() =>
			store.createProvider({
				id: "unsafe",
				name: "Unsafe",
				vendor: "custom",
				region: "global",
				baseUrl: "https://unsafe.example/anthropic",
				api: "anthropic-messages",
				apiKeyEnvVar: "sk-should-not-be-here",
				models: [{ id: "unsafe-model" }],
			}),
		/apiKeyEnvVar must be an environment variable name/,
	);
});

test("model provider store writes custom providers outside bundled models.json", async () => {
	const projectRoot = await createProjectRoot();
	const bundledPath = join(projectRoot, "runtime", "pi-agent", "models.json");
	const customProvidersPath = join(projectRoot, ".data", "agent", "model-providers.json");
	const store = createFileModelProviderStore(projectRoot, { customProvidersPath });

	await store.createProvider({
		id: "custom-runtime",
		name: "Custom Runtime",
		vendor: "custom",
		region: "global",
		baseUrl: "https://runtime.example/anthropic",
		api: "anthropic-messages",
		apiKeyEnvVar: "CUSTOM_RUNTIME_API_KEY",
		models: [{ id: "runtime-model" }],
	});

	const bundled = await readFile(bundledPath, "utf8");
	const custom = await readFile(customProvidersPath, "utf8");

	assert.doesNotMatch(bundled, /custom-runtime/);
	assert.match(custom, /custom-runtime/);
});

test("effective project models path exposes runtime custom providers to ModelRegistry", async () => {
	const projectRoot = await createProjectRoot();
	const customProvidersPath = join(projectRoot, ".data", "agent", "model-providers.json");
	const store = createFileModelProviderStore(projectRoot, { customProvidersPath });
	await store.createProvider({
		id: "custom-registry",
		name: "Custom Registry",
		vendor: "custom",
		region: "global",
		baseUrl: "https://registry.example/anthropic",
		api: "anthropic-messages",
		apiKeyEnvVar: "CUSTOM_REGISTRY_API_KEY",
		models: [{ id: "registry-model", contextWindow: 300000 }],
	});

	const registry = ModelRegistry.create(AuthStorage.create(), getEffectiveProjectModelsPath(projectRoot, { customProvidersPath }));
	const model = registry.find("custom-registry", "registry-model");

	assert.equal(model?.provider, "custom-registry");
	assert.equal(model?.id, "registry-model");
	assert.equal(model?.contextWindow, 300000);
});
