import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import {
	getDefaultAllowedSkillPaths,
	getDefaultRuntimeAgentRulesPath,
	getProjectAgentDirPath,
	readProjectSettingsContent,
	resolveAgentDefaultModelContext,
	resolveProjectDefaultModelContext,
} from "./agent-session-factory.js";
import { DEFAULT_AGENT_ID, type AgentProfile } from "./agent-profile.js";
import { isAgentProfileArchivedSync, loadAgentProfilesSync } from "./agent-profile-catalog.js";
import type { ConnUpgradePolicy } from "./conn-store.js";
import { listEnabledAgentMcpServers, type AgentMcpServerConfig } from "./mcp-server-catalog.js";

export interface AgentTemplateRef {
	profileId: string;
	agentSpecId: string;
	skillSetId: string;
	modelPolicyId: string;
	modelProvider?: string;
	modelId?: string;
	upgradePolicy: ConnUpgradePolicy;
	now?: Date;
}

export interface AgentTemplateSkill {
	id: string;
	name: string;
	path: string;
	version: string;
}

export interface AgentTemplate {
	requestedAgentId?: string;
	agentId?: string;
	agentName?: string;
	defaultBrowserId?: string;
	agentDir?: string;
	rulesPath?: string;
	skillPaths?: string[];
	fallbackUsed?: boolean;
	fallbackReason?: "profile_not_found" | "profile_archived" | "legacy_profile";
	profileId: string;
	profileVersion: string;
	agentSpecVersion: string;
	skillSetVersion: string;
	skills: AgentTemplateSkill[];
	mcpServers?: AgentMcpServerConfig[];
	modelPolicyVersion: string;
	provider: string;
	model: string;
	version: string;
	builtAt: string;
	source: "playground" | "legacy";
}

export interface AgentTemplateRegistryOptions {
	projectRoot: string;
	registryDir?: string;
	onBuildError?: (error: unknown, ref: AgentTemplateRef) => void;
}

interface ProfileRegistry {
	profiles?: Array<{
		id: string;
		version?: string;
		agentSpecId?: string;
		skillSetId?: string;
		modelPolicyId?: string;
	}>;
}

interface AgentSpecRegistry {
	agentSpecs?: Array<{ id: string; version?: string }>;
}

interface SkillSetRegistry {
	skillSets?: Array<{
		id: string;
		version?: string;
		skillPaths?: string[];
	}>;
}

interface ModelPolicyRegistry {
	modelPolicies?: Array<{
		id: string;
		version?: string;
		provider?: string;
		model?: string;
	}>;
}

interface CacheEntry {
	signature: string;
	template: AgentTemplate;
}

const DEFAULT_PROFILE_ID = "background.default";
const DEFAULT_AGENT_SPEC_ID = "agent.default";
const DEFAULT_SKILL_SET_ID = "skills.default";
const DEFAULT_MODEL_POLICY_ID = "model.default";
const BUILTIN_VERSION = "builtin:1";

export class AgentTemplateRegistry {
	private readonly registryDir: string;
	private readonly templates = new Map<string, CacheEntry>();

	constructor(private readonly options: AgentTemplateRegistryOptions) {
		this.registryDir = options.registryDir ?? join(options.projectRoot, ".pi", "background-agent");
	}

	async getTemplate(ref: AgentTemplateRef): Promise<AgentTemplate> {
		const key = buildTemplateCacheKey(ref);
		const existing = this.templates.get(key);
		try {
			const context = await this.resolveTemplateContext(ref);
			const signature = await this.buildSignature(ref, context);
			if (existing?.signature === signature) {
				return existing.template;
			}
			const template = await this.buildTemplate(ref, context, signature);
			this.templates.set(key, { signature, template });
			return template;
		} catch (error) {
			if (existing) {
				this.options.onBuildError?.(error, ref);
				return existing.template;
			}
			throw error;
		}
	}

	invalidate(profileId?: string): void {
		const normalizedProfileId = profileId?.trim();
		if (!normalizedProfileId) {
			this.templates.clear();
			return;
		}
		for (const key of this.templates.keys()) {
			if (key.startsWith(`${normalizedProfileId}\0`)) {
				this.templates.delete(key);
			}
		}
	}

	private async buildSignature(ref: AgentTemplateRef, context: TemplateContext): Promise<string> {
		const hash = createHash("sha256");
		hash.update(JSON.stringify({
			ref: {
				profileId: ref.profileId,
				agentSpecId: ref.agentSpecId,
				skillSetId: ref.skillSetId,
				modelPolicyId: ref.modelPolicyId,
			},
			context: context.signatureShape,
			projectSettings: readProjectSettingsContent(this.options.projectRoot) ?? "",
		}));
		hash.update("\n---rules---\n");
		if (context.rulesPath) {
			hash.update(await readFileOrEmpty(context.rulesPath));
		}
		hash.update("\n---skills---\n");
		await hashSkillRoots(hash, context.skillPaths);
		return hash.digest("hex");
	}

	private async buildTemplate(
		ref: AgentTemplateRef,
		context: TemplateContext,
		signature: string,
	): Promise<AgentTemplate> {
		if (context.kind === "playground") {
			return await this.buildPlaygroundTemplate(ref, context, signature);
		}
		return await this.buildLegacyTemplate(ref, context, signature);
	}

	private async buildPlaygroundTemplate(
		ref: AgentTemplateRef,
		context: PlaygroundTemplateContext,
		signature: string,
	): Promise<AgentTemplate> {
		const defaultModel = resolveAgentDefaultModelContext(this.options.projectRoot, {
			provider: context.profile.defaultModelProvider,
			model: context.profile.defaultModelId,
		});
		const skills = await collectSkills(context.skillPaths);
		const skillSetVersion = hashStrings([
			...context.skillPaths,
			...skills.flatMap((skill) => [skill.path, skill.version]),
		]);
		const builtAt = (ref.now ?? new Date()).toISOString();
		return {
			requestedAgentId: ref.profileId,
			agentId: context.profile.agentId,
			agentName: context.profile.name,
			...(context.profile.defaultBrowserId ? { defaultBrowserId: context.profile.defaultBrowserId } : {}),
			agentDir: context.agentDir,
			...(context.rulesPath ? { rulesPath: context.rulesPath } : {}),
			skillPaths: context.skillPaths,
			fallbackUsed: context.fallbackUsed,
			...(context.fallbackReason ? { fallbackReason: context.fallbackReason } : {}),
			profileId: context.profile.agentId,
			profileVersion: BUILTIN_VERSION,
			agentSpecVersion: BUILTIN_VERSION,
			skillSetVersion,
			skills,
			...(context.mcpServers.length ? { mcpServers: context.mcpServers.map((server) => ({ ...server })) } : {}),
			modelPolicyVersion: BUILTIN_VERSION,
			provider: defaultModel.provider,
			model: defaultModel.model,
			version: signature,
			builtAt,
			source: "playground",
		};
	}

	private async buildLegacyTemplate(
		ref: AgentTemplateRef,
		context: LegacyTemplateContext,
		signature: string,
	): Promise<AgentTemplate> {
		const profileAgentSpecId = context.profile.agentSpecId ?? DEFAULT_AGENT_SPEC_ID;
		const profileSkillSetId = context.profile.skillSetId ?? DEFAULT_SKILL_SET_ID;
		const profileModelPolicyId = context.profile.modelPolicyId ?? DEFAULT_MODEL_POLICY_ID;
		if (profileAgentSpecId !== ref.agentSpecId) {
			throw new Error(`Background agent profile ${ref.profileId} expects agent spec ${profileAgentSpecId}`);
		}
		if (profileSkillSetId !== ref.skillSetId) {
			throw new Error(`Background agent profile ${ref.profileId} expects skill set ${profileSkillSetId}`);
		}
		if (profileModelPolicyId !== ref.modelPolicyId) {
			throw new Error(`Background agent profile ${ref.profileId} expects model policy ${profileModelPolicyId}`);
		}

		const agentSpec = resolveRegistryEntry(
			context.agentSpecs.agentSpecs,
			ref.agentSpecId,
			DEFAULT_AGENT_SPEC_ID,
			"Unknown background agent spec",
		);
		const skillSet = resolveRegistryEntry(
			context.skillSets.skillSets,
			ref.skillSetId,
			DEFAULT_SKILL_SET_ID,
			"Unknown background skill set",
		);
		const modelPolicy = resolveRegistryEntry(
			context.modelPolicies.modelPolicies,
			ref.modelPolicyId,
			DEFAULT_MODEL_POLICY_ID,
			"Unknown background model policy",
		);
		const defaultModel = resolveProjectDefaultModelContext(this.options.projectRoot);
		const provider = modelPolicy.provider ?? defaultModel.provider;
		const model = modelPolicy.model ?? defaultModel.model;
		const skillPaths = skillSet.skillPaths?.length ? skillSet.skillPaths : getDefaultAllowedSkillPaths(this.options.projectRoot);
		const skills = await collectSkills(skillPaths);
		const computedSkillSetVersion = hashStrings([
			...skillPaths,
			...skills.flatMap((skill) => [skill.path, skill.version]),
		]);
		return {
			profileId: ref.profileId,
			profileVersion: context.profile.version ?? BUILTIN_VERSION,
			agentSpecVersion: agentSpec.version ?? BUILTIN_VERSION,
			skillSetVersion: skillSet.version && skillSet.version !== BUILTIN_VERSION ? skillSet.version : computedSkillSetVersion,
			skills,
			modelPolicyVersion: modelPolicy.version ?? BUILTIN_VERSION,
			provider,
			model,
			version: signature,
			builtAt: (ref.now ?? new Date()).toISOString(),
			source: "legacy",
		};
	}

	private async resolveTemplateContext(ref: AgentTemplateRef): Promise<TemplateContext> {
		const [profileRegistry, agentSpecRegistry, skillSetRegistry, modelPolicyRegistry] = await Promise.all([
			this.readJson<ProfileRegistry>("profiles.json", {}),
			this.readJson<AgentSpecRegistry>("agent-specs.json", {}),
			this.readJson<SkillSetRegistry>("skill-sets.json", {}),
			this.readJson<ModelPolicyRegistry>("model-policies.json", {}),
		]);
		const agentProfiles = loadAgentProfilesSync(this.options.projectRoot);
		const requestedAgentProfile = agentProfiles.find((profile) => profile.agentId === ref.profileId);
		if (requestedAgentProfile) {
			return await this.resolvePlaygroundContext(ref, requestedAgentProfile, false);
		}

		const legacyProfile = findRegistryEntry(profileRegistry.profiles, ref.profileId);
		if (!legacyProfile && ref.profileId !== DEFAULT_PROFILE_ID) {
			const fallbackProfile = agentProfiles.find((entry) => entry.agentId === DEFAULT_AGENT_ID);
			if (fallbackProfile) {
				const fallbackReason = isAgentProfileArchivedSync(this.options.projectRoot, ref.profileId)
					? "profile_archived"
					: "profile_not_found";
				return await this.resolvePlaygroundContext(ref, fallbackProfile, true, fallbackReason);
			}
		}

		const resolvedProfile =
			legacyProfile ??
			resolveRegistryEntry(
				profileRegistry.profiles,
				ref.profileId,
				DEFAULT_PROFILE_ID,
				"Unknown background agent profile",
			);
		const skillSet = resolveRegistryEntry(
			skillSetRegistry.skillSets,
			ref.skillSetId,
			DEFAULT_SKILL_SET_ID,
			"Unknown background skill set",
		);
		const skillPaths = skillSet.skillPaths?.length ? skillSet.skillPaths : getDefaultAllowedSkillPaths(this.options.projectRoot);
		return {
			kind: "legacy",
			profile: resolvedProfile,
			agentSpecs: agentSpecRegistry,
			skillSets: skillSetRegistry,
			modelPolicies: modelPolicyRegistry,
			skillPaths,
			signatureShape: {
				source: "legacy",
				profile: resolvedProfile,
				agentSpecs: agentSpecRegistry,
				skillSets: skillSetRegistry,
				modelPolicies: modelPolicyRegistry,
				skillPaths,
			},
		};
	}

	private async resolvePlaygroundContext(
		ref: AgentTemplateRef,
		profile: AgentProfile,
		fallbackUsed: boolean,
		fallbackReason?: "profile_not_found" | "profile_archived" | "legacy_profile",
	): Promise<PlaygroundTemplateContext> {
		const skillPaths = profile.allowedSkillPaths.length
			? profile.allowedSkillPaths
			: getDefaultAllowedSkillPaths(this.options.projectRoot);
		const rulesPath =
			profile.runtimeAgentRulesPath ||
			(profile.agentId === DEFAULT_AGENT_ID
				? getDefaultRuntimeAgentRulesPath(this.options.projectRoot)
				: undefined);
		const agentDir = profile.agentDir || getProjectAgentDirPath(this.options.projectRoot);
		const mcpServers = await listEnabledAgentMcpServers(this.options.projectRoot, profile.agentId);
		return {
			kind: "playground",
			profile,
			agentDir,
			...(rulesPath ? { rulesPath } : {}),
			skillPaths,
			fallbackUsed,
			...(fallbackReason ? { fallbackReason } : {}),
			signatureShape: {
				source: "playground",
				requestedProfileId: ref.profileId,
				profile: {
					agentId: profile.agentId,
					name: profile.name,
					description: profile.description,
					defaultBrowserId: profile.defaultBrowserId,
					defaultModelProvider: profile.defaultModelProvider,
					defaultModelId: profile.defaultModelId,
					agentDir,
					rulesPath,
					skillPaths,
				},
				mcpServers,
				fallbackUsed,
				fallbackReason,
			},
			mcpServers,
		};
	}

	private async readJson<T>(fileName: string, fallback: T): Promise<T> {
		try {
			return JSON.parse(await readFile(join(this.registryDir, fileName), "utf8")) as T;
		} catch (error) {
			if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
				return fallback;
			}
			throw error;
		}
	}
}

interface TemplateContextBase {
	signatureShape: unknown;
	rulesPath?: string;
	skillPaths: string[];
}

interface PlaygroundTemplateContext extends TemplateContextBase {
	kind: "playground";
	profile: AgentProfile;
	agentDir: string;
	fallbackUsed: boolean;
	fallbackReason?: "profile_not_found" | "profile_archived" | "legacy_profile";
	mcpServers: AgentMcpServerConfig[];
}

interface LegacyTemplateContext extends TemplateContextBase {
	kind: "legacy";
	profile: { id: string; version?: string; agentSpecId?: string; skillSetId?: string; modelPolicyId?: string };
	agentSpecs: AgentSpecRegistry;
	skillSets: SkillSetRegistry;
	modelPolicies: ModelPolicyRegistry;
}

type TemplateContext = PlaygroundTemplateContext | LegacyTemplateContext;

function buildTemplateCacheKey(ref: AgentTemplateRef): string {
	return [
		ref.profileId,
		ref.agentSpecId,
		ref.skillSetId,
		ref.modelPolicyId,
	].join("\0");
}

function findRegistryEntry<T extends { id: string; version?: string }>(entries: T[] | undefined, id: string): T | undefined {
	return entries?.find((entry) => entry.id === id);
}

function resolveRegistryEntry<T extends { id: string; version?: string }>(
	entries: T[] | undefined,
	id: string,
	defaultId: string,
	errorPrefix: string,
): T {
	const found = entries?.find((entry) => entry.id === id);
	if (found) {
		return found;
	}
	if (id === defaultId) {
		return { id, version: BUILTIN_VERSION } as T;
	}
	throw new Error(`${errorPrefix}: ${id}`);
}

async function hashSkillRoots(hash: ReturnType<typeof createHash>, rootPaths: readonly string[]): Promise<void> {
	for (const rootPath of rootPaths) {
		hash.update(`root:${rootPath}\n`);
		const skillFiles = (await collectSkillFiles(rootPath, rootPath)).sort((left, right) => left.path.localeCompare(right.path));
		for (const skill of skillFiles) {
			hash.update(`${skill.id}\n`);
			hash.update(skill.version);
			hash.update("\n---\n");
		}
	}
}

async function readFileOrEmpty(filePath: string): Promise<string> {
	try {
		return await readFile(filePath, "utf8");
	} catch (error) {
		if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
			return "";
		}
		throw error;
	}
}

async function collectSkills(skillPaths: readonly string[]): Promise<AgentTemplateSkill[]> {
	const skills = (await Promise.all(skillPaths.map((rootPath) => collectSkillFiles(rootPath, rootPath)))).flat();
	return skills.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
}

async function collectSkillFiles(rootPath: string, currentPath: string): Promise<AgentTemplateSkill[]> {
	try {
		const entries = await readdir(currentPath, { withFileTypes: true });
		const files = await Promise.all(
			entries.map(async (entry) => {
				const nextPath = join(currentPath, entry.name);
				if (entry.isDirectory()) {
					return await collectSkillFiles(rootPath, nextPath);
				}
				if (!entry.isFile() || entry.name !== "SKILL.md") {
					return [];
				}
				const content = await readFile(nextPath, "utf8");
				const id = relative(rootPath, nextPath).replace(/\\/g, "/");
				return [
					{
						id,
						name: inferSkillName(nextPath, content),
						path: nextPath,
						version: hashStrings([id, content]),
					},
				];
			}),
		);
		return files.flat();
	} catch (error) {
		if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

function inferSkillName(skillPath: string, content: string): string {
	const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
	if (heading) {
		return heading.toLowerCase().replace(/\s+/g, "-");
	}
	const parts = skillPath.replace(/\\/g, "/").split("/");
	return parts.at(-2) ?? "skill";
}

function hashStrings(parts: readonly string[]): string {
	const hash = createHash("sha256");
	for (const part of parts) {
		hash.update(part);
		hash.update("\n---\n");
	}
	return hash.digest("hex");
}
