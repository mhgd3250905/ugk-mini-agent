import { sanitizeStateId } from "./agent-active-run-view.js";
import { runWithAgentScope } from "./agent-scope-context.js";

export function createAgentRunScope(conversationId: string, ownerId?: string): string {
	const scopedId = ownerId?.trim() ? `${ownerId}:${conversationId}` : conversationId;
	return sanitizeStateId(scopedId);
}

export async function runWithScopedAgentEnvironment<T>(scope: string, operation: () => Promise<T>): Promise<T> {
	return await runWithAgentScope(scope, operation);
}
