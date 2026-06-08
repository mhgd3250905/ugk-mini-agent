import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { renameWithTransientRetry } from "../file-system.js";

export interface CustomModelProviderInput {
	id: string;
	name?: string;
	vendor?: string;
	region?: string;
	priority?: number;
	baseUrl: string;
	api: "anthropic-messages";
	apiKeyEnvVar: string;
	authHeader?: boolean;
	models: CustomModelInput[];
}

export interface CustomModelInput {
	id: string;
	name?: string;
	contextWindow?: number;
	maxTokens?: number;
}

export interface ModelProviderStore {
	listCustomProviders(): Promise<Record<string, ProjectModelProviderJson>>;
	createProvider(input: CustomModelProviderInput): Promise<ProjectModelProviderJson & { id: string }>;
}

export interface ModelProviderStoreOptions {
	customProvidersPath?: string;
}

export interface ProjectModelProviderJson {
	name?: string;
	vendor?: string;
	region?: string;
	priority?: number;
	baseUrl?: string;
	api?: string;
	apiKey?: string;
	authHeader?: boolean;
	models?: ProjectModelJson[];
}

export interface ProjectModelJson {
	id?: string;
	name?: string;
	contextWindow?: number;
	maxTokens?: number;
}

interface ProjectModelsJson {
	providers?: Record<string, ProjectModelProviderJson>;
}

const SUPPORTED_PROVIDER_APIS = new Set(["anthropic-messages"]);

export function getCustomModelProvidersPath(projectRoot: string): string {
	return process.env.UGK_MODEL_PROVIDERS_PATH?.trim() || join(projectRoot, ".data", "agent", "model-providers.json");
}

export function getBundledProjectModelsPath(projectRoot: string): string {
	return join(projectRoot, "runtime", "pi-agent", "models.json");
}

export function getEffectiveProjectModelsPath(projectRoot: string, options: ModelProviderStoreOptions = {}): string {
	const customProvidersPath = options.customProvidersPath ?? getCustomModelProvidersPath(projectRoot);
	if (!existsSync(customProvidersPath)) {
		return getBundledProjectModelsPath(projectRoot);
	}
	const effectivePath = join(projectRoot, ".data", "agent", "effective-models.json");
	const content = readMergedProjectModelsContentSync(projectRoot, { customProvidersPath });
	mkdirSyncForFile(effectivePath);
	writeFileSync(effectivePath, content, "utf8");
	return effectivePath;
}

export function createFileModelProviderStore(projectRoot: string, options: ModelProviderStoreOptions = {}): ModelProviderStore {
	const customProvidersPath = options.customProvidersPath ?? getCustomModelProvidersPath(projectRoot);
	return {
		async listCustomProviders() {
			return readCustomProviders(await readOptionalText(customProvidersPath));
		},
		async createProvider(input) {
			const bundled = readProviders(await readRequiredText(getBundledProjectModelsPath(projectRoot)));
			const currentCustom = readCustomProviders(await readOptionalText(customProvidersPath));
			const provider = normalizeCustomProviderInput(input);
			if (Object.hasOwn(bundled, provider.id) || Object.hasOwn(currentCustom, provider.id)) {
				throw new Error(`model provider already exists: ${provider.id}`);
			}
			const nextProviders = {
				...currentCustom,
				[provider.id]: providerToJson(provider),
			};
			await writeCustomProvidersFile(customProvidersPath, nextProviders);
			return { id: provider.id, ...nextProviders[provider.id] };
		},
	};
}

export async function readMergedProjectModelsContent(projectRoot: string, options: ModelProviderStoreOptions = {}): Promise<string> {
	const customProvidersPath = options.customProvidersPath ?? getCustomModelProvidersPath(projectRoot);
	return mergeProjectModelsContent(
		await readRequiredText(getBundledProjectModelsPath(projectRoot)),
		await readOptionalText(customProvidersPath),
	);
}

export function readMergedProjectModelsContentSync(projectRoot: string, options: ModelProviderStoreOptions = {}): string {
	const customProvidersPath = options.customProvidersPath ?? getCustomModelProvidersPath(projectRoot);
	return mergeProjectModelsContent(
		readFileSync(getBundledProjectModelsPath(projectRoot), "utf8"),
		readOptionalTextSync(customProvidersPath),
	);
}

function mergeProjectModelsContent(bundledContent: string, customContent: string): string {
	const bundled = readProviders(bundledContent);
	const custom = readCustomProviders(customContent);
	const merged = { providers: { ...bundled } };
	for (const [providerId, provider] of Object.entries(custom)) {
		if (Object.hasOwn(merged.providers, providerId)) {
			continue;
		}
		merged.providers[providerId] = provider;
	}
	return `${JSON.stringify(merged, null, 2)}\n`;
}

function readProviders(content: string): Record<string, ProjectModelProviderJson> {
	if (!content.trim()) {
		return {};
	}
	const parsed = JSON.parse(content) as ProjectModelsJson;
	return parsed.providers && typeof parsed.providers === "object" ? parsed.providers : {};
}

function readCustomProviders(content: string): Record<string, ProjectModelProviderJson> {
	const providers = readProviders(content);
	const normalized: Record<string, ProjectModelProviderJson> = {};
	for (const [providerId, provider] of Object.entries(providers)) {
		try {
			const input = providerJsonToInput(providerId, provider);
			normalized[input.id] = providerToJson(input);
		} catch {
			// A malformed runtime provider should not take down the whole model config page.
		}
	}
	return normalized;
}

function providerJsonToInput(providerId: string, provider: ProjectModelProviderJson): CustomModelProviderInput {
	return normalizeCustomProviderInput({
		id: providerId,
		name: provider.name,
		vendor: provider.vendor,
		region: provider.region,
		priority: provider.priority,
		baseUrl: provider.baseUrl ?? "",
		api: provider.api as "anthropic-messages",
		apiKeyEnvVar: provider.apiKey ?? "",
		authHeader: provider.authHeader,
		models: provider.models?.map((model) => ({
			id: model.id ?? "",
			name: model.name,
			contextWindow: model.contextWindow,
			maxTokens: model.maxTokens,
		})) ?? [],
	});
}

function normalizeCustomProviderInput(input: CustomModelProviderInput): Required<Pick<CustomModelProviderInput, "id" | "baseUrl" | "api" | "apiKeyEnvVar" | "models">> & Omit<CustomModelProviderInput, "id" | "baseUrl" | "api" | "apiKeyEnvVar" | "models"> {
	const id = normalizeProviderId(input.id);
	const baseUrl = normalizeBaseUrl(input.baseUrl);
	const api = normalizeProviderApi(input.api);
	const apiKeyEnvVar = normalizeApiKeyEnvVar(input.apiKeyEnvVar);
	const models = normalizeModels(input.models);
	return {
		id,
		...(normalizeOptionalString(input.name) ? { name: normalizeOptionalString(input.name) } : {}),
		...(normalizeOptionalString(input.vendor) ? { vendor: normalizeOptionalString(input.vendor) } : {}),
		...(normalizeOptionalString(input.region) ? { region: normalizeOptionalString(input.region) } : {}),
		...(normalizePositiveNumber(input.priority) !== undefined ? { priority: normalizePositiveNumber(input.priority) } : {}),
		baseUrl,
		api,
		apiKeyEnvVar,
		...(typeof input.authHeader === "boolean" ? { authHeader: input.authHeader } : {}),
		models,
	};
}

function providerToJson(provider: CustomModelProviderInput): ProjectModelProviderJson {
	return {
		...(provider.name ? { name: provider.name } : {}),
		...(provider.vendor ? { vendor: provider.vendor } : {}),
		...(provider.region ? { region: provider.region } : {}),
		...(provider.priority !== undefined ? { priority: provider.priority } : {}),
		baseUrl: provider.baseUrl,
		api: provider.api,
		apiKey: provider.apiKeyEnvVar,
		...(typeof provider.authHeader === "boolean" ? { authHeader: provider.authHeader } : {}),
		models: provider.models.map((model) => ({
			id: model.id,
			...(model.name ? { name: model.name } : {}),
			...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
			...(model.maxTokens !== undefined ? { maxTokens: model.maxTokens } : {}),
		})),
	};
}

function normalizeProviderId(value: string): string {
	const id = String(value ?? "").trim();
	if (!/^[a-z][a-z0-9-]{1,62}$/.test(id)) {
		throw new Error("provider id must start with a lowercase letter and contain only lowercase letters, digits, or hyphens");
	}
	return id;
}

function normalizeBaseUrl(value: string): string {
	const baseUrl = String(value ?? "").trim();
	try {
		const parsed = new URL(baseUrl);
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			throw new Error("invalid protocol");
		}
		return parsed.toString().replace(/\/$/, "");
	} catch {
		throw new Error("baseUrl must be a valid HTTP(S) URL");
	}
}

function normalizeProviderApi(value: string): "anthropic-messages" {
	const api = String(value ?? "").trim();
	if (!SUPPORTED_PROVIDER_APIS.has(api)) {
		throw new Error(`unsupported provider api: ${api}`);
	}
	return "anthropic-messages";
}

function normalizeApiKeyEnvVar(value: string): string {
	const envVar = String(value ?? "").trim();
	if (!/^[A-Z][A-Z0-9_]+$/.test(envVar)) {
		throw new Error("apiKeyEnvVar must be an environment variable name");
	}
	return envVar;
}

function normalizeModels(models: CustomModelInput[]): CustomModelInput[] {
	if (!Array.isArray(models) || models.length === 0) {
		throw new Error("models must contain at least one model");
	}
	const seen = new Set<string>();
	return models.map((model) => {
		const id = String(model.id ?? "").trim();
		if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) {
			throw new Error("model id must be non-empty and URL-safe");
		}
		if (seen.has(id)) {
			throw new Error(`duplicate model id: ${id}`);
		}
		seen.add(id);
		return {
			id,
			...(normalizeOptionalString(model.name) ? { name: normalizeOptionalString(model.name) } : {}),
			...(normalizePositiveNumber(model.contextWindow) !== undefined ? { contextWindow: normalizePositiveNumber(model.contextWindow) } : {}),
			...(normalizePositiveNumber(model.maxTokens) !== undefined ? { maxTokens: normalizePositiveNumber(model.maxTokens) } : {}),
		};
	});
}

function normalizeOptionalString(value: unknown): string | undefined {
	const normalized = String(value ?? "").trim();
	return normalized || undefined;
}

function normalizePositiveNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined;
}

async function writeCustomProvidersFile(filePath: string, providers: Record<string, ProjectModelProviderJson>): Promise<void> {
	const dir = dirname(filePath);
	const tempPath = join(dir, `.model-providers.${process.pid}.${process.hrtime.bigint()}.tmp`);
	await mkdir(dir, { recursive: true });
	try {
		await writeFile(tempPath, `${JSON.stringify({ providers }, null, 2)}\n`, "utf8");
		await renameWithTransientRetry(tempPath, filePath);
	} catch (error) {
		await unlink(tempPath).catch(() => undefined);
		throw error;
	}
}

async function readRequiredText(filePath: string): Promise<string> {
	return await readFile(filePath, "utf8");
}

async function readOptionalText(filePath: string): Promise<string> {
	try {
		return await readFile(filePath, "utf8");
	} catch (error) {
		if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
			return "";
		}
		throw error;
	}
}

function readOptionalTextSync(filePath: string): string {
	try {
		return readFileSync(filePath, "utf8");
	} catch {
		return "";
	}
}

function mkdirSyncForFile(filePath: string): void {
	mkdirSync(dirname(filePath), { recursive: true });
}
