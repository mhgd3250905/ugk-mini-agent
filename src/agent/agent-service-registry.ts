import {
	resolveAgentProfile,
	type AgentProfile,
} from "./agent-profile.js";

export interface AgentSummary {
	agentId: string;
	name: string;
	description: string;
	defaultModelProvider?: string;
	defaultModelId?: string;
}

export type AgentRegistryRunStatus =
	| {
			agentId: string;
			name: string;
			status: "idle";
	  }
	| {
			agentId: string;
			name: string;
			status: "busy";
			activeConversationId: string;
			activeSince: string;
	  };

interface AgentRunStatusLike {
	getAgentRunStatus?():
		| { agentId: string; status: "idle" }
		| { agentId: string; status: "busy"; activeConversationId: string; activeSince: string };
}

export interface AgentServiceRegistryOptions<TService> {
	profiles: AgentProfile[];
	createService: (profile: AgentProfile) => TService;
}

export class AgentServiceRegistry<TService> {
	private readonly services = new Map<string, TService>();
	private readonly profiles = new Map<string, AgentProfile>();

	constructor(private readonly options: AgentServiceRegistryOptions<TService>) {
		for (const profile of options.profiles) {
			this.profiles.set(profile.agentId, profile);
		}
	}

	list(): AgentSummary[] {
		return Array.from(this.profiles.values()).map((profile) => ({
			agentId: profile.agentId,
			name: profile.name,
			description: profile.description,
			...(profile.defaultModelProvider && profile.defaultModelId
				? { defaultModelProvider: profile.defaultModelProvider, defaultModelId: profile.defaultModelId }
				: {}),
		}));
	}

	getAllRunStatus(): AgentRegistryRunStatus[] {
		return Array.from(this.profiles.values()).map((profile) => {
			const service = this.services.get(profile.agentId) as (TService & AgentRunStatusLike) | undefined;
			const runStatus = service?.getAgentRunStatus?.() ?? {
				agentId: profile.agentId,
				status: "idle" as const,
			};
			return {
				...runStatus,
				agentId: profile.agentId,
				name: profile.name,
			};
		});
	}

	getProfile(agentId: string | undefined): AgentProfile | undefined {
		return resolveAgentProfile(Array.from(this.profiles.values()), agentId);
	}

	add(profile: AgentProfile): void {
		this.profiles.set(profile.agentId, profile);
		this.services.delete(profile.agentId);
	}

	updateProfile(profile: AgentProfile): void {
		this.profiles.set(profile.agentId, profile);
		this.services.delete(profile.agentId);
	}

	remove(agentId: string): void {
		this.services.delete(agentId);
		this.profiles.delete(agentId);
	}

	get(agentId: string | undefined): TService | undefined {
		const profile = resolveAgentProfile(Array.from(this.profiles.values()), agentId);
		if (!profile) {
			return undefined;
		}

		const existing = this.services.get(profile.agentId);
		if (existing) {
			return existing;
		}

		const service = this.options.createService(profile);
		this.services.set(profile.agentId, service);
		return service;
	}
}
