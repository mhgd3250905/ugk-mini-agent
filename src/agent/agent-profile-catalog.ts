import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { renameWithTransientRetry } from "../file-system.js";
import {
	DEFAULT_AGENT_ID,
	SEARCH_AGENT_ID,
	createAgentProfileFromSummary,
	createDefaultAgentProfiles,
	isValidAgentId,
	type AgentProfile,
	type AgentProfileSummaryInput,
} from "./agent-profile.js";
import { DEFAULT_AGENT_SYSTEM_SKILLS, ensureAgentProfileRuntime } from "./agent-profile-bootstrap.js";
import { getDefaultAllowedSkillPaths } from "./agent-session-factory.js";

interface StoredAgentSkillSettings {
	disabledSkillNames?: string[];
}

interface StoredAgentProfiles {
	agents?: AgentProfileSummaryInput[];
	archivedAgentIds?: string[];
	skillSettingsByAgentId?: Record<string, StoredAgentSkillSettings>;
}

const catalogWriteQueues = new Map<string, Promise<void>>();

export interface CreateAgentProfileInput {
	agentId: string;
	name?: string;
	description?: string;
	defaultBrowserId?: string;
	defaultModelProvider?: string;
	defaultModelId?: string;
	initialSystemSkillNames?: string[];
}

export interface ArchiveAgentProfileResult {
	agentId: string;
	archivedPath: string;
}

export interface UpdateAgentProfileInput {
	name?: string;
	description?: string;
	defaultBrowserId?: string | null;
	defaultModelProvider?: string | null;
	defaultModelId?: string | null;
}

export interface AgentProfileSkillChangeResult {
	agentId: string;
	skillName: string;
	targetRoot: string;
	targetDir: string;
}

export function getAgentProfilesCatalogPath(projectRoot: string): string {
	return join(projectRoot, ".data", "agents", "profiles.json");
}

function getCatalogQueueKey(projectRoot: string): string {
	return resolve(projectRoot);
}

function normalizeAgentName(agentId: string, name: string | undefined): string {
	const normalized = String(name || "").trim();
	return normalized || `${agentId} Agent`;
}

function normalizeAgentDescription(description: string | undefined): string {
	const normalized = String(description || "").trim();
	return normalized || "独立 agent profile。";
}

function normalizeOptionalBrowserId(browserId: unknown): string | undefined {
	if (browserId === undefined || browserId === null) {
		return undefined;
	}
	const normalized = String(browserId).trim();
	if (!normalized) {
		return undefined;
	}
	if (!/^[a-z][a-z0-9-]{0,62}$/.test(normalized)) {
		throw new Error("defaultBrowserId must start with a lowercase letter and contain only lowercase letters, digits, or hyphens");
	}
	return normalized;
}

export function normalizeOptionalModelSelection(input: {
	defaultModelProvider?: unknown;
	defaultModelId?: unknown;
}): { defaultModelProvider?: string; defaultModelId?: string } {
	const providerRaw = input.defaultModelProvider;
	const modelRaw = input.defaultModelId;

	const provider = providerRaw === undefined || providerRaw === null
		? ""
		: String(providerRaw).trim();
	const model = modelRaw === undefined || modelRaw === null
		? ""
		: String(modelRaw).trim();

	if (!provider && !model) {
		return {};
	}
	if (!provider || !model) {
		throw new Error("defaultModelProvider and defaultModelId must be provided together");
	}
	return {
		defaultModelProvider: provider,
		defaultModelId: model,
	};
}

function normalizeInitialSystemSkillNames(skillNames: unknown): string[] {
	if (!Array.isArray(skillNames)) {
		return [];
	}
	const reserved = new Set(DEFAULT_AGENT_SYSTEM_SKILLS.map((skill) => skill.name));
	const normalized = skillNames
		.map((skillName) => String(skillName || "").trim())
		.filter((skillName) => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(skillName))
		.filter((skillName) => !reserved.has(skillName));
	return Array.from(new Set(normalized));
}

function normalizeSkillName(skillName: unknown): string {
	const normalized = String(skillName || "").trim();
	if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(normalized)) {
		throw new Error("skillName must start with a letter or digit and contain only letters, digits, underscores, or hyphens");
	}
	return normalized;
}

function parseStoredCatalog(raw: string): Required<StoredAgentProfiles> {
	const parsed = JSON.parse(raw) as StoredAgentProfiles;
	return {
		agents: Array.isArray(parsed.agents) ? parsed.agents : [],
		archivedAgentIds: Array.isArray(parsed.archivedAgentIds) ? parsed.archivedAgentIds : [],
		skillSettingsByAgentId: normalizeStoredSkillSettings(parsed.skillSettingsByAgentId),
	};
}

function normalizeDisabledSkillNames(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const normalized = value
		.map((entry) => String(entry || "").trim())
		.filter((entry) => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(entry));
	return Array.from(new Set(normalized)).sort();
}

function normalizeStoredSkillSettings(
	value: unknown,
): Record<string, StoredAgentSkillSettings> {
	if (!value || typeof value !== "object") {
		return {};
	}
	const result: Record<string, StoredAgentSkillSettings> = {};
	for (const [agentId, rawSettings] of Object.entries(value as Record<string, unknown>)) {
		if (!isValidAgentId(agentId)) {
			continue;
		}
		result[agentId] = {
			disabledSkillNames: normalizeDisabledSkillNames(
				(rawSettings as { disabledSkillNames?: unknown })?.disabledSkillNames,
			),
		};
	}
	return result;
}

function applySkillSettingsToProfiles(
	profiles: AgentProfile[],
	settingsByAgentId: Record<string, StoredAgentSkillSettings>,
): AgentProfile[] {
	return profiles.map((profile) => {
		const settings = settingsByAgentId[profile.agentId];
		const disabledSkillNames = settings?.disabledSkillNames ?? [];
		return {
			...profile,
			...(disabledSkillNames.length > 0 ? { disabledSkillNames } : {}),
		};
	});
}

export function normalizeAgentProfileInput(input: CreateAgentProfileInput): AgentProfileSummaryInput {
	const agentId = String(input.agentId || "").trim();
	if (!isValidAgentId(agentId)) {
		throw new Error("agentId must start with a lowercase letter and contain only lowercase letters, digits, or hyphens");
	}
	if (agentId === DEFAULT_AGENT_ID || agentId === SEARCH_AGENT_ID) {
		throw new Error(`agentId ${agentId} is reserved`);
	}
	const modelSelection = normalizeOptionalModelSelection({
		defaultModelProvider: input.defaultModelProvider,
		defaultModelId: input.defaultModelId,
	});
	return {
		agentId,
		name: normalizeAgentName(agentId, input.name),
		description: normalizeAgentDescription(input.description),
		...((() => { const id = normalizeOptionalBrowserId(input.defaultBrowserId); return id ? { defaultBrowserId: id } : {}; })()),
		...modelSelection,
	};
}

function isPathWithin(parentPath: string, childPath: string): boolean {
	const parent = resolve(parentPath);
	const child = resolve(childPath);
	return child === parent || child.startsWith(parent + "\\") || child.startsWith(parent + "/");
}

async function findMainAgentSkillDir(projectRoot: string, skillName: string): Promise<string | undefined> {
	for (const rootPath of getDefaultAllowedSkillPaths(projectRoot)) {
		const skillDir = join(rootPath, skillName);
		if (!isPathWithin(rootPath, skillDir)) {
			continue;
		}
		try {
			await readFile(join(skillDir, "SKILL.md"), "utf8");
			return skillDir;
		} catch (error) {
			if (!(error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT")) {
				throw error;
			}
		}
		const nestedSkillDir = await findNestedMainAgentSkillDir(rootPath, skillName);
		if (nestedSkillDir) {
			return nestedSkillDir;
		}
	}
	return undefined;
}

async function findNestedMainAgentSkillDir(rootPath: string, skillName: string): Promise<string | undefined> {
	const skillFiles = await collectSkillMetadataFiles(rootPath);
	for (const skillFile of skillFiles) {
		if (!isPathWithin(rootPath, skillFile)) {
			continue;
		}
		const content = await readFile(skillFile, "utf8");
		if (parseSkillMetadataName(content) === skillName) {
			return dirname(skillFile);
		}
	}
	return undefined;
}

async function collectSkillMetadataFiles(rootPath: string): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(rootPath, { encoding: "utf8", withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
	const skillFiles: string[] = [];
	for (const entry of entries) {
		const entryPath = join(rootPath, entry.name);
		if (!isPathWithin(rootPath, entryPath)) {
			continue;
		}
		if (entry.isFile() && entry.name === "SKILL.md") {
			skillFiles.push(entryPath);
		}
		if (entry.isDirectory()) {
			skillFiles.push(...(await collectSkillMetadataFiles(entryPath)));
		}
	}
	return skillFiles;
}

function parseSkillMetadataName(content: string): string | undefined {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
	if (!frontmatter) {
		return undefined;
	}
	const match = /^name:\s*["']?([^"'\r\n]+)["']?\s*$/m.exec(frontmatter[1]);
	return match?.[1]?.trim();
}

async function copyInitialSystemSkills(
	projectRoot: string,
	profile: AgentProfile,
	skillNames: string[],
): Promise<void> {
	const targetRoot = profile.allowedSkillPaths[0];
	if (!targetRoot || skillNames.length === 0) {
		return;
	}
	for (const skillName of skillNames) {
		const sourceDir = await findMainAgentSkillDir(projectRoot, skillName);
		if (!sourceDir) {
			throw new Error(`main agent does not have skill ${skillName}`);
		}
		const targetDir = join(targetRoot, skillName);
		if (!isPathWithin(targetRoot, targetDir)) {
			throw new Error(`invalid skill target: ${skillName}`);
		}
		await cp(sourceDir, targetDir, {
			recursive: true,
			force: false,
			errorOnExist: false,
		});
	}
}

async function assertMainAgentHasInitialSystemSkills(projectRoot: string, skillNames: string[]): Promise<void> {
	for (const skillName of skillNames) {
		const sourceDir = await findMainAgentSkillDir(projectRoot, skillName);
		if (!sourceDir) {
			throw new Error(`main agent does not have skill ${skillName}`);
		}
	}
}

function isCrossDeviceRenameError(error: unknown): boolean {
	return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EXDEV";
}

interface MoveAgentProfileDataDirOptions {
	rename?: typeof rename;
	cp?: typeof cp;
	rm?: typeof rm;
}

export async function moveAgentProfileDataDir(
	sourceDir: string,
	targetDir: string,
	options: MoveAgentProfileDataDirOptions = {},
): Promise<void> {
	const renameDir = options.rename ?? rename;
	const copyDir = options.cp ?? cp;
	const removeDir = options.rm ?? rm;
	try {
		await renameDir(sourceDir, targetDir);
	} catch (error) {
		if (!isCrossDeviceRenameError(error)) {
			throw error;
		}
		await copyDir(sourceDir, targetDir, {
			recursive: true,
			force: false,
			errorOnExist: true,
		});
		await removeDir(sourceDir, { recursive: true, force: true });
	}
}

function assertMutableAgentProfile(agentId: string): void {
	if (agentId === DEFAULT_AGENT_ID) {
		throw new Error("main agent skills cannot be managed through agent profile ops");
	}
}

async function resolveMutableAgentProfile(projectRoot: string, agentId: string): Promise<AgentProfile> {
	if (!isValidAgentId(agentId)) {
		throw new Error("agentId must start with a lowercase letter and contain only lowercase letters, digits, or hyphens");
	}
	assertMutableAgentProfile(agentId);
	const catalog = await readStoredAgentProfileCatalog(projectRoot);
	if (catalog.archivedAgentIds.includes(agentId)) {
		throw new Error(`agent ${agentId} is archived`);
	}
	const profile = createDefaultAgentProfiles(projectRoot, catalog.agents).find((entry) => entry.agentId === agentId);
	if (!profile) {
		throw new Error(`agent ${agentId} does not exist`);
	}
	return profile;
}

export async function readStoredAgentProfileSummaries(projectRoot: string): Promise<AgentProfileSummaryInput[]> {
	const catalogPath = getAgentProfilesCatalogPath(projectRoot);
	try {
		return parseStoredCatalog(await readFile(catalogPath, "utf8")).agents;
	} catch (error) {
		if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

export function readStoredAgentProfileSummariesSync(projectRoot: string): AgentProfileSummaryInput[] {
	const catalogPath = getAgentProfilesCatalogPath(projectRoot);
	if (!existsSync(catalogPath)) {
		return [];
	}
	const raw = readFileSync(catalogPath, "utf8");
	return parseStoredCatalog(raw).agents;
}

async function readStoredAgentProfileCatalogFromDisk(projectRoot: string): Promise<Required<StoredAgentProfiles>> {
	const catalogPath = getAgentProfilesCatalogPath(projectRoot);
	try {
		return parseStoredCatalog(await readFile(catalogPath, "utf8"));
	} catch (error) {
		if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
			return { agents: [], archivedAgentIds: [], skillSettingsByAgentId: {} };
		}
		throw error;
	}
}

async function readStoredAgentProfileCatalog(projectRoot: string): Promise<Required<StoredAgentProfiles>> {
	await catalogWriteQueues.get(getCatalogQueueKey(projectRoot));
	return await readStoredAgentProfileCatalogFromDisk(projectRoot);
}

function readStoredAgentProfileCatalogSync(projectRoot: string): Required<StoredAgentProfiles> {
	const catalogPath = getAgentProfilesCatalogPath(projectRoot);
	if (!existsSync(catalogPath)) {
		return { agents: [], archivedAgentIds: [], skillSettingsByAgentId: {} };
	}
	return parseStoredCatalog(readFileSync(catalogPath, "utf8"));
}

export async function writeStoredAgentProfileSummaries(
	projectRoot: string,
	agents: AgentProfileSummaryInput[],
	archivedAgentIds: string[] = [],
): Promise<void> {
	await queueStoredAgentProfileCatalogOperation(projectRoot, async () => {
		const current = await readStoredAgentProfileCatalogFromDisk(projectRoot);
		await writeStoredAgentProfileCatalogFile(projectRoot, { agents, archivedAgentIds, skillSettingsByAgentId: current.skillSettingsByAgentId });
	});
}

async function writeStoredAgentProfileCatalogFile(
	projectRoot: string,
	catalog: Required<StoredAgentProfiles>,
): Promise<void> {
	const catalogPath = getAgentProfilesCatalogPath(projectRoot);
	const catalogDir = dirname(catalogPath);
	const tempPath = join(catalogDir, `.${basename(catalogPath)}.${process.pid}.${process.hrtime.bigint()}.tmp`);
	await mkdir(catalogDir, { recursive: true });
	try {
		await writeFile(tempPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
		await renameWithTransientRetry(tempPath, catalogPath);
	} catch (error) {
		await unlink(tempPath).catch(() => undefined);
		throw error;
	}
}

async function queueStoredAgentProfileCatalogOperation<T>(
	projectRoot: string,
	operation: () => Promise<T>,
): Promise<T> {
	const key = getCatalogQueueKey(projectRoot);
	const previous = catalogWriteQueues.get(key) ?? Promise.resolve();
	let result: T;
	const current = previous
		.catch(() => undefined)
		.then(async () => {
			result = await operation();
		});
	const settled = current.then(
		() => undefined,
		() => undefined,
	);
	catalogWriteQueues.set(key, settled);
	try {
		await current;
		return result!;
	} finally {
		if (catalogWriteQueues.get(key) === settled) {
			catalogWriteQueues.delete(key);
		}
	}
}

async function mutateStoredAgentProfileCatalog<T>(
	projectRoot: string,
	mutator: (catalog: Required<StoredAgentProfiles>) => Promise<{ catalog: Required<StoredAgentProfiles>; result: T }>,
): Promise<T> {
	return await queueStoredAgentProfileCatalogOperation(projectRoot, async () => {
		const current = await readStoredAgentProfileCatalogFromDisk(projectRoot);
		const next = await mutator(current);
		await writeStoredAgentProfileCatalogFile(projectRoot, next.catalog);
		return next.result;
	});
}

export function loadAgentProfilesSync(projectRoot: string): AgentProfile[] {
	const catalog = readStoredAgentProfileCatalogSync(projectRoot);
	const archived = new Set(catalog.archivedAgentIds);
	return applySkillSettingsToProfiles(
		createDefaultAgentProfiles(projectRoot, catalog.agents).filter((profile) => !archived.has(profile.agentId)),
		catalog.skillSettingsByAgentId,
	);
}

export function isAgentProfileArchivedSync(projectRoot: string, agentId: string): boolean {
	const catalog = readStoredAgentProfileCatalogSync(projectRoot);
	return catalog.archivedAgentIds.includes(agentId);
}

export async function createStoredAgentProfile(
	projectRoot: string,
	input: CreateAgentProfileInput,
): Promise<AgentProfile> {
	const normalized = normalizeAgentProfileInput(input);
	const initialSystemSkillNames = normalizeInitialSystemSkillNames(input.initialSystemSkillNames);
	await assertMainAgentHasInitialSystemSkills(projectRoot, initialSystemSkillNames);
	return await mutateStoredAgentProfileCatalog(projectRoot, async (catalog) => {
		const existing = createDefaultAgentProfiles(projectRoot, catalog.agents).filter(
			(profile) => !catalog.archivedAgentIds.includes(profile.agentId),
		);
		if (existing.some((profile) => profile.agentId === normalized.agentId)) {
			throw new Error(`agent ${normalized.agentId} already exists`);
		}
		const profile = createAgentProfileFromSummary(projectRoot, normalized);
		await ensureAgentProfileRuntime(profile);
		await copyInitialSystemSkills(projectRoot, profile, initialSystemSkillNames);
		return {
			catalog: {
				agents: [...catalog.agents, normalized],
				archivedAgentIds: catalog.archivedAgentIds.filter((agentId) => agentId !== normalized.agentId),
				skillSettingsByAgentId: catalog.skillSettingsByAgentId,
			},
			result: profile,
		};
	});
}

export async function updateStoredAgentProfile(
	projectRoot: string,
	agentId: string,
	input: UpdateAgentProfileInput,
): Promise<AgentProfile> {
	if (!isValidAgentId(agentId)) {
		throw new Error("agentId must start with a lowercase letter and contain only lowercase letters, digits, or hyphens");
	}
	if (agentId === DEFAULT_AGENT_ID) {
		throw new Error("main agent cannot be edited");
	}
	return await mutateStoredAgentProfileCatalog(projectRoot, async (catalog) => {
		if (catalog.archivedAgentIds.includes(agentId)) {
			throw new Error(`agent ${agentId} is archived`);
		}
		const currentProfile = createDefaultAgentProfiles(projectRoot, catalog.agents).find(
			(profile) => profile.agentId === agentId,
		);
		if (!currentProfile) {
			throw new Error(`agent ${agentId} does not exist`);
		}
		const hasModelPatch =
				Object.hasOwn(input, "defaultModelProvider") ||
				Object.hasOwn(input, "defaultModelId");
			const nextModelSelection = hasModelPatch
				? normalizeOptionalModelSelection(input)
				: currentProfile.defaultModelProvider && currentProfile.defaultModelId
					? {
							defaultModelProvider: currentProfile.defaultModelProvider,
							defaultModelId: currentProfile.defaultModelId,
						}
					: {};
			const updatedSummary: AgentProfileSummaryInput = {
			agentId,
			name: normalizeAgentName(agentId, input.name ?? currentProfile.name),
			description: normalizeAgentDescription(input.description ?? currentProfile.description),
			...(Object.hasOwn(input, "defaultBrowserId")
				? (() => { const id = normalizeOptionalBrowserId(input.defaultBrowserId); return id ? { defaultBrowserId: id } : {}; })()
				: currentProfile.defaultBrowserId
					? { defaultBrowserId: currentProfile.defaultBrowserId }
					: {}),
			...nextModelSelection,
		};
		return {
			catalog: {
				agents: [
					...catalog.agents.filter((entry) => entry.agentId !== agentId),
					updatedSummary,
				],
				archivedAgentIds: catalog.archivedAgentIds,
				skillSettingsByAgentId: catalog.skillSettingsByAgentId,
			},
			result: createAgentProfileFromSummary(projectRoot, updatedSummary),
		};
	});
}

export async function installStoredAgentProfileSkill(
	projectRoot: string,
	agentId: string,
	inputSkillName: unknown,
): Promise<AgentProfileSkillChangeResult> {
	const skillName = normalizeSkillName(inputSkillName);
	const profile = await resolveMutableAgentProfile(projectRoot, agentId);
	const sourceDir = await findMainAgentSkillDir(projectRoot, skillName);
	if (!sourceDir) {
		throw new Error(`main agent does not have skill ${skillName}`);
	}
	const targetRoot = profile.allowedSkillPaths[1] ?? profile.allowedSkillPaths[0];
	if (!targetRoot) {
		throw new Error(`agent ${agentId} does not have a skill target root`);
	}
	const targetDir = join(targetRoot, skillName);
	if (!isPathWithin(targetRoot, targetDir)) {
		throw new Error(`invalid skill target: ${skillName}`);
	}
	await mkdir(targetRoot, { recursive: true });
	await cp(sourceDir, targetDir, {
		recursive: true,
		force: true,
		errorOnExist: false,
	});
	return { agentId, skillName, targetRoot, targetDir };
}

export async function removeStoredAgentProfileSkill(
	projectRoot: string,
	agentId: string,
	inputSkillName: unknown,
): Promise<AgentProfileSkillChangeResult> {
	const skillName = normalizeSkillName(inputSkillName);
	if (DEFAULT_AGENT_SYSTEM_SKILLS.some((skill) => skill.name === skillName)) {
		throw new Error("required agent skill cannot be removed");
	}
	const profile = await resolveMutableAgentProfile(projectRoot, agentId);
	for (const targetRoot of profile.allowedSkillPaths) {
		const targetDir = join(targetRoot, skillName);
		if (!isPathWithin(targetRoot, targetDir)) {
			throw new Error(`invalid skill target: ${skillName}`);
		}
		if (existsSync(targetDir)) {
			await rm(targetDir, { recursive: true, force: true });
			return { agentId, skillName, targetRoot, targetDir };
		}
	}
	throw new Error(`agent ${agentId} does not have skill ${skillName}`);
}

export async function archiveStoredAgentProfile(
	projectRoot: string,
	agentId: string,
): Promise<ArchiveAgentProfileResult> {
	if (agentId === DEFAULT_AGENT_ID) {
		throw new Error("main agent cannot be archived");
	}
	return await mutateStoredAgentProfileCatalog(projectRoot, async (catalog) => {
		const profile = createDefaultAgentProfiles(projectRoot, catalog.agents).find((entry) => entry.agentId === agentId);
		if (!profile) {
			throw new Error(`agent ${agentId} does not exist`);
		}
		const archivedPath = join(projectRoot, ".data", "agents-archive", `${agentId}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
		await mkdir(dirname(archivedPath), { recursive: true });
		if (existsSync(profile.dataDir)) {
			await moveAgentProfileDataDir(profile.dataDir, archivedPath);
		}
		return {
			catalog: {
				agents: catalog.agents.filter((entry) => entry.agentId !== agentId),
				archivedAgentIds: Array.from(new Set([...catalog.archivedAgentIds, agentId])),
				skillSettingsByAgentId: catalog.skillSettingsByAgentId,
			},
			result: { agentId, archivedPath },
		};
	});
}


export interface AgentProfileSkillInfo {
	name: string;
	path?: string;
	enabled: boolean;
	required?: boolean;
	storageKind?: "system" | "agent";
	storageRoot?: string;
}

function isRequiredAgentSkill(skillName: string): boolean {
	return DEFAULT_AGENT_SYSTEM_SKILLS.some((skill) => skill.name === skillName);
}

function collectInstalledSkillNames(skillPaths: string[]): Array<{ name: string; path: string; rootPath: string; rootIndex: number }> {
	const seen = new Map<string, { name: string; path: string; rootPath: string; rootIndex: number }>();
	for (const [rootIndex, rootPath] of skillPaths.entries()) {
		let entries;
		try {
			entries = readdirSync(rootPath, { encoding: "utf8", withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}
			const skillDir = join(rootPath, entry.name);
			if (!isPathWithin(rootPath, skillDir)) {
				continue;
			}
			const skillMdPath = join(skillDir, "SKILL.md");
			let skillName: string | undefined;
			try {
				const content = readFileSync(skillMdPath, "utf8");
				skillName = parseSkillMetadataName(content) ?? entry.name;
			} catch {
				skillName = entry.name;
			}
			if (skillName && !seen.has(skillName)) {
				seen.set(skillName, { name: skillName, path: skillDir, rootPath, rootIndex });
			}
		}
	}
	return Array.from(seen.values());
}

export function listStoredAgentProfileSkills(
	projectRoot: string,
	agentId: string,
): { agentId: string; skills: AgentProfileSkillInfo[] } {
	if (!isValidAgentId(agentId)) {
		throw new Error("agentId must start with a lowercase letter and contain only lowercase letters, digits, or hyphens");
	}
	const catalog = readStoredAgentProfileCatalogSync(projectRoot);
	if (catalog.archivedAgentIds.includes(agentId)) {
		throw new Error(`agent ${agentId} is archived`);
	}
	const profile = createDefaultAgentProfiles(projectRoot, catalog.agents)
		.find((p) => p.agentId === agentId);
	if (!profile) {
		throw new Error(`agent ${agentId} does not exist`);
	}
	const disabledSet = new Set(catalog.skillSettingsByAgentId[agentId]?.disabledSkillNames ?? []);
	const installed = collectInstalledSkillNames(profile.allowedSkillPaths);
	const skills: AgentProfileSkillInfo[] = installed.map(({ name, path, rootPath, rootIndex }) => ({
		name,
		path,
		enabled: !disabledSet.has(name),
		required: isRequiredAgentSkill(name),
		storageKind: rootIndex === 0 ? "system" : "agent",
		storageRoot: rootPath,
	}));
	skills.sort((a, b) => a.name.localeCompare(b.name));
	return { agentId, skills };
}

export async function updateStoredAgentProfileSkillEnabled(
	projectRoot: string,
	agentId: string,
	inputSkillName: unknown,
	inputEnabled: unknown,
): Promise<{ agentId: string; skillName: string; enabled: boolean; profile: AgentProfile }> {
	const skillName = normalizeSkillName(inputSkillName);
	if (typeof inputEnabled !== "boolean") {
		throw new Error("enabled must be a boolean");
	}
	if (!inputEnabled && isRequiredAgentSkill(skillName)) {
		throw new Error("required agent skill cannot be disabled");
	}
	return await mutateStoredAgentProfileCatalog(projectRoot, async (catalog) => {
		const profile = createDefaultAgentProfiles(projectRoot, catalog.agents)
			.find((p) => p.agentId === agentId);
		if (!profile) {
			throw new Error(`agent ${agentId} does not exist`);
		}
		if (catalog.archivedAgentIds.includes(agentId)) {
			throw new Error(`agent ${agentId} is archived`);
		}
		const installed = collectInstalledSkillNames(profile.allowedSkillPaths);
		if (!installed.some((s) => s.name === skillName)) {
			throw new Error(`agent ${agentId} does not have skill ${skillName}`);
		}
		const currentSettings = catalog.skillSettingsByAgentId[agentId] ?? { disabledSkillNames: [] };
		const currentDisabled = new Set(currentSettings.disabledSkillNames);
		if (inputEnabled) {
			currentDisabled.delete(skillName);
		} else {
			currentDisabled.add(skillName);
		}
		const nextDisabled = Array.from(currentDisabled).sort();
		const updatedSettings: Record<string, StoredAgentSkillSettings> = {
			...catalog.skillSettingsByAgentId,
			[agentId]: { disabledSkillNames: nextDisabled },
		};
		if (nextDisabled.length === 0) {
			delete updatedSettings[agentId];
		}
		const disabledSkillNames = updatedSettings[agentId]?.disabledSkillNames ?? [];
		return {
			catalog: {
				agents: catalog.agents,
				archivedAgentIds: catalog.archivedAgentIds,
				skillSettingsByAgentId: updatedSettings,
			},
			result: {
				agentId,
				skillName,
				enabled: inputEnabled,
				profile: { ...profile, ...(disabledSkillNames.length > 0 ? { disabledSkillNames } : {}) },
			},
		};
	});
}
