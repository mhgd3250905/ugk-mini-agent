import { randomUUID } from "node:crypto";
import { buildEmptyConversationMetadata } from "./agent-conversation-catalog.js";
import type {
	AgentSessionFactory,
	AgentSessionLike,
	ProjectDefaultModelContext,
} from "./agent-session-factory.js";
import type { ConversationStore } from "./conversation-store.js";

export interface EnsureCurrentConversationIdInput {
	conversationStore: ConversationStore;
	generateConversationId?: () => string;
}

export interface CreateEmptyConversationInput {
	conversationStore: ConversationStore;
	generateConversationId?: () => string;
}

export interface OpenConversationSessionInput {
	agentRunScope?: string;
	conversationId: string;
	conversationStore: ConversationStore;
	sessionFactory: AgentSessionFactory;
}

export interface OpenConversationSessionResult {
	session: AgentSessionLike;
	skillFingerprint?: string;
}

const DEFAULT_MODEL_CONTEXT: ProjectDefaultModelContext = {
	provider: "unknown",
	model: "unknown",
	contextWindow: 128000,
	maxResponseTokens: 16384,
	reserveTokens: 16384,
};

export async function ensureCurrentConversationId(input: EnsureCurrentConversationIdInput): Promise<string> {
	const currentConversationId = await input.conversationStore.getCurrentConversationId();
	if (currentConversationId) {
		return currentConversationId;
	}

	const existingConversation = (await input.conversationStore.list()).at(0);
	if (existingConversation) {
		await input.conversationStore.setCurrentConversationId(existingConversation.conversationId);
		return existingConversation.conversationId;
	}

	return await createEmptyConversation(input);
}

export async function createEmptyConversation(input: CreateEmptyConversationInput): Promise<string> {
	const conversationId = input.generateConversationId?.() ?? `manual:${randomUUID()}`;
	await input.conversationStore.set(conversationId, undefined, buildEmptyConversationMetadata());
	await input.conversationStore.setCurrentConversationId(conversationId);
	return conversationId;
}

export async function openConversationSession(
	input: OpenConversationSessionInput,
): Promise<OpenConversationSessionResult> {
	const existingConversation = await input.conversationStore.get(input.conversationId);
	const skillFingerprint = await input.sessionFactory.getSkillFingerprint?.();
	const shouldReuseExistingSession = existingConversation?.sessionFile !== undefined;

	const session = await input.sessionFactory.createSession({
		...(input.agentRunScope ? { agentRunScope: input.agentRunScope } : {}),
		conversationId: input.conversationId,
		sessionFile: shouldReuseExistingSession ? existingConversation?.sessionFile : undefined,
	});

	return {
		session,
		skillFingerprint,
	};
}

export function resolveDefaultModelContext(sessionFactory: AgentSessionFactory): ProjectDefaultModelContext {
	return sessionFactory.getDefaultModelContext?.() ?? DEFAULT_MODEL_CONTEXT;
}
