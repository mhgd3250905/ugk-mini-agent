import {
	AgentTemplateRegistry,
	type AgentTemplate,
	type AgentTemplateRef,
	type AgentTemplateRegistryOptions,
} from "./agent-template-registry.js";
import type { ConnUpgradePolicy } from "./conn-store.js";
import type { AgentMcpServerConfig } from "./mcp-server-catalog.js";

export interface BackgroundAgentProfileRef {
	profileId: string;
	agentSpecId: string;
	skillSetId: string;
	modelPolicyId: string;
	modelProvider?: string;
	modelId?: string;
	upgradePolicy: ConnUpgradePolicy;
	now?: Date;
}

export interface ResolvedBackgroundAgentSnapshot {
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
	agentSpecId: string;
	agentSpecVersion: string;
	skillSetId: string;
	skillSetVersion: string;
	skills: Array<{
		id: string;
		name: string;
		path: string;
		version: string;
	}>;
	mcpServers?: AgentMcpServerConfig[];
	modelPolicyId: string;
	modelPolicyVersion: string;
	provider: string;
	model: string;
	upgradePolicy: ConnUpgradePolicy;
	resolvedAt: string;
	templateVersion?: string;
	templateBuiltAt?: string;
	templateSource?: "playground" | "legacy";
}

export interface BackgroundAgentProfileResolverOptions extends AgentTemplateRegistryOptions {}

export class BackgroundAgentProfileResolver {
	private readonly templateRegistry: AgentTemplateRegistry;

	constructor(options: BackgroundAgentProfileResolverOptions) {
		this.templateRegistry = new AgentTemplateRegistry(options);
	}

	async resolve(ref: BackgroundAgentProfileRef): Promise<ResolvedBackgroundAgentSnapshot> {
		const template = await this.templateRegistry.getTemplate(ref satisfies AgentTemplateRef);
		return snapshotFromTemplate(template, ref);
	}

	invalidate(profileId?: string): void {
		this.templateRegistry.invalidate(profileId);
	}
}

function snapshotFromTemplate(
	template: AgentTemplate,
	ref: BackgroundAgentProfileRef,
): ResolvedBackgroundAgentSnapshot {
	const provider = ref.modelProvider ?? template.provider;
	const model = ref.modelId ?? template.model;
	return {
		...(template.requestedAgentId ? { requestedAgentId: template.requestedAgentId } : {}),
		...(template.agentId ? { agentId: template.agentId } : {}),
		...(template.agentName ? { agentName: template.agentName } : {}),
		...(template.defaultBrowserId ? { defaultBrowserId: template.defaultBrowserId } : {}),
		...(template.agentDir ? { agentDir: template.agentDir } : {}),
		...(template.rulesPath ? { rulesPath: template.rulesPath } : {}),
		...(template.skillPaths ? { skillPaths: [...template.skillPaths] } : {}),
		fallbackUsed: template.fallbackUsed,
		...(template.fallbackReason ? { fallbackReason: template.fallbackReason } : {}),
		profileId: template.profileId,
		profileVersion: template.profileVersion,
		agentSpecId: ref.agentSpecId,
		agentSpecVersion: template.agentSpecVersion,
		skillSetId: ref.skillSetId,
		skillSetVersion: template.skillSetVersion,
		skills: template.skills.map((skill) => ({ ...skill })),
		...(template.mcpServers ? { mcpServers: template.mcpServers.map((server) => ({ ...server })) } : {}),
		modelPolicyId: ref.modelPolicyId,
		modelPolicyVersion: template.modelPolicyVersion,
		provider,
		model,
		upgradePolicy: ref.upgradePolicy,
		resolvedAt: (ref.now ?? new Date()).toISOString(),
		templateVersion: template.version,
		templateBuiltAt: template.builtAt,
		templateSource: template.source,
	};
}
