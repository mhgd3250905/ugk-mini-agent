import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AgentService } from "../agent/agent-service.js";
import type { AgentServiceRegistry } from "../agent/agent-service-registry.js";
import {
	archiveStoredAgentProfile,
	createStoredAgentProfile,
	installStoredAgentProfileSkill,
	listStoredAgentProfileSkills,
	normalizeOptionalModelSelection,
	removeStoredAgentProfileSkill,
	refreshStoredAgentProfileSkillFromMain,
	updateStoredAgentProfile,
	updateStoredAgentProfileSkillEnabled,
} from "../agent/agent-profile-catalog.js";
import type { ModelConfigStore, ModelSelectionValidator } from "../agent/model-config.js";
import type { BrowserRegistry } from "../browser/browser-registry.js";
import { getAppConfig } from "../config.js";
import { getActiveTeamProfileLocks } from "../team/config-locks.js";
import {
	normalizeBrowserBindingAuditValue,
	recordBrowserBindingAudit,
	type BrowserBindingAuditChange,
	type BrowserBindingAuditLog,
} from "../browser/browser-binding-audit-log.js";
import {
	compactBrowserBindingChanges,
	createBrowserBindingChange,
	evaluateBrowserBindingWrite,
	readBrowserBindingRequestContext,
} from "../browser/browser-binding-policy.js";
import type {
	AgentRunStatusListResponseBody,
	AgentSkillListResponseBody,
	DebugSkillsResponseBody,
	UpdateAgentSkillRequestBody,
	UpdateAgentSkillResponseBody,
} from "../types/api.js";
import { resolveScopedAgentServiceOrSend, sendUnknownAgent, validateBrowserId } from "./agent-route-utils.js";
import { sendBadRequest, sendConflict, sendInternalError, sendNotImplemented, sendNotFound } from "./http-errors.js";

export interface AgentProfileRouteDependencies {
	agentServiceRegistry?: AgentServiceRegistry<AgentService>;
	browserRegistry?: BrowserRegistry;
	browserBindingAuditLog?: BrowserBindingAuditLog;
	agentTemplateRegistry?: { invalidate(profileId?: string): void };
	projectRoot?: string;
	modelConfigStore?: ModelConfigStore;
	modelSelectionValidator?: ModelSelectionValidator;
}

export function registerAgentProfileRoutes(app: FastifyInstance, deps: AgentProfileRouteDependencies): void {
	function resolveAgentRulesPath(agentId: string | undefined): string | undefined {
		if (!agentId || !deps.projectRoot) {
			return undefined;
		}
		return deps.agentServiceRegistry?.getProfile(agentId)?.runtimeAgentRulesPath;
	}

	function sendUnknownAgent(reply: FastifyReply, agentId: string | undefined): FastifyReply {
		return sendNotFound(reply, `Unknown agentId: ${agentId ?? ""}`);
	}

	function presentAgentSummary(agent: { agentId: string; name: string; description: string; defaultBrowserId?: string; defaultModelProvider?: string; defaultModelId?: string }): {
		agentId: string;
		name: string;
		description: string;
		defaultBrowserId?: string;
		defaultModelProvider?: string;
		defaultModelId?: string;
	} {
		return {
			agentId: agent.agentId,
			name: agent.name,
			description: agent.description,
			...(agent.defaultBrowserId ? { defaultBrowserId: agent.defaultBrowserId } : {}),
			...(agent.defaultModelProvider && agent.defaultModelId
				? { defaultModelProvider: agent.defaultModelProvider, defaultModelId: agent.defaultModelId }
				: {}),
		};
	}

	function sendRunningBrowserBindingChange(reply: FastifyReply, agentId: string): FastifyReply {
		return sendConflict(reply, `Agent ${agentId} has a running conversation. Stop the current run before changing its default browser.`);
	}

	function sendRunningModelBindingChange(reply: FastifyReply, agentId: string): FastifyReply {
		return sendConflict(reply, `Agent ${agentId} has a running conversation. Stop the current run before changing its default model.`);
	}

	function hasModelSelectionPatch(body: Record<string, unknown>): boolean {
		return Object.hasOwn(body, "defaultModelProvider") || Object.hasOwn(body, "defaultModelId");
	}

	async function sendTeamProfileLockIfNeeded(agentId: string | undefined, reply: FastifyReply): Promise<FastifyReply | undefined> {
		if (!agentId || !deps.projectRoot) {
			return undefined;
		}
		const lockedProfileIds = await getActiveTeamProfileLocks(getAppConfig(deps.projectRoot).teamDataDir);
		if (!lockedProfileIds.has(agentId)) {
			return undefined;
		}
		return sendConflict(reply, `Agent ${agentId} is locked by an active Team run.`);
	}

	async function validateAgentModelSelectionOrSend(
		reply: FastifyReply,
		selection: { defaultModelProvider?: string; defaultModelId?: string },
	): Promise<FastifyReply | undefined> {
		if (!selection.defaultModelProvider && !selection.defaultModelId) {
			return undefined;
		}
		if (!deps.modelConfigStore || !deps.modelSelectionValidator) {
			return sendNotImplemented(reply, "Model config validator is not available.");
		}
		const modelSelection = {
			provider: selection.defaultModelProvider!,
			model: selection.defaultModelId!,
		};
		if (!(await deps.modelConfigStore.hasModel(modelSelection))) {
			return sendBadRequest(reply, `Model not found: ${modelSelection.provider}/${modelSelection.model}`);
		}
		const validation = await deps.modelSelectionValidator(modelSelection);
		if (!validation.ok) {
			return sendBadRequest(reply, validation.message);
		}
		return undefined;
	}

	app.get("/v1/agents", async () => {
		return {
			agents: deps.agentServiceRegistry?.list().map(presentAgentSummary) ?? [
				{
					agentId: "main",
					name: "主 Agent",
					description: "默认综合 agent，保持现有会话、技能和运行方式。",
				},
			],
		};
	});

	app.get("/v1/agents/status", async (): Promise<AgentRunStatusListResponseBody> => {
		return {
			agents: deps.agentServiceRegistry?.getAllRunStatus() ?? [
				{
					agentId: "main",
					name: "主 Agent",
					status: "idle",
				},
			],
		};
	});

	app.post(
		"/v1/agents",
		async (
			request: FastifyRequest<{
				Body: { agentId?: string; name?: string; description?: string; defaultBrowserId?: string; defaultModelProvider?: string; defaultModelId?: string; initialSystemSkillNames?: string[] };
			}>,
			reply,
		): Promise<{ agent: { agentId: string; name: string; description: string; defaultBrowserId?: string; defaultModelProvider?: string; defaultModelId?: string } } | FastifyReply> => {
			if (!deps.projectRoot || !deps.agentServiceRegistry) {
				return sendNotImplemented(reply, "Agent profile catalog is not available.");
			}
			try {
				const body = request.body ?? {};
				const browserValidation = validateBrowserId(deps.browserRegistry, reply, body.defaultBrowserId);
				if (browserValidation) {
					return browserValidation;
				}
				let modelSelection: { defaultModelProvider?: string; defaultModelId?: string } = {};
				if (body.defaultModelProvider !== undefined || body.defaultModelId !== undefined) {
					modelSelection = normalizeOptionalModelSelection({
						defaultModelProvider: body.defaultModelProvider,
						defaultModelId: body.defaultModelId,
					});
				}
				const modelValidation = await validateAgentModelSelectionOrSend(reply, modelSelection);
				if (modelValidation) {
					return modelValidation;
				}
				const profile = await createStoredAgentProfile(deps.projectRoot, {
					agentId: body.agentId ?? "",
					name: body.name,
					description: body.description,
					defaultBrowserId: body.defaultBrowserId,
					...modelSelection,
					initialSystemSkillNames: body.initialSystemSkillNames,
				});
				deps.agentServiceRegistry.add(profile);
				deps.agentTemplateRegistry?.invalidate(profile.agentId);
				return {
					agent: presentAgentSummary(profile),
				};
			} catch (error) {
				return sendBadRequest(reply, error instanceof Error ? error.message : "Unable to create agent profile.");
			}
		},
	);

	app.patch(
		"/v1/agents/:agentId",
		async (
			request: FastifyRequest<{
				Params: { agentId?: string };
				Body: { name?: string; description?: string; defaultBrowserId?: string | null; defaultModelProvider?: string | null; defaultModelId?: string | null };
			}>,
			reply,
		): Promise<{ agent: { agentId: string; name: string; description: string; defaultBrowserId?: string; defaultModelProvider?: string; defaultModelId?: string } } | FastifyReply> => {
			const { agentId } = request.params ?? {};
			if (!agentId || !deps.projectRoot || !deps.agentServiceRegistry) {
				return sendUnknownAgent(reply, agentId);
			}
			const teamLockResponse = await sendTeamProfileLockIfNeeded(agentId, reply);
			if (teamLockResponse) {
				return teamLockResponse;
			}
			const service = resolveScopedAgentServiceOrSend(deps.agentServiceRegistry, reply, agentId);
			if (!service) {
				return reply;
			}
			try {
				const body = request.body ?? {};
				const browserValidation = validateBrowserId(deps.browserRegistry, reply, body.defaultBrowserId);
				if (browserValidation) {
					return browserValidation;
				}
				const currentProfile = deps.agentServiceRegistry.getProfile(agentId);
				const auditSource = readBrowserBindingRequestContext(request.headers);
				let browserBindingChanges: BrowserBindingAuditChange[] = [];
				if (Object.hasOwn(body, "defaultBrowserId")) {
					const from = normalizeBrowserBindingAuditValue(currentProfile?.defaultBrowserId);
					const to = normalizeBrowserBindingAuditValue(body.defaultBrowserId);
					browserBindingChanges = compactBrowserBindingChanges([
						createBrowserBindingChange("defaultBrowserId", from, to),
					]);
				}
				const bindingDecision = evaluateBrowserBindingWrite(browserBindingChanges, auditSource);
				if (!bindingDecision.allowed && bindingDecision.status === "rejected_unconfirmed") {
					await recordBrowserBindingAudit(deps.browserBindingAuditLog, {
						kind: "agent_browser_binding",
						targetId: agentId,
						targetLabel: currentProfile?.name ?? agentId,
						source: auditSource.source,
						confirmedByClient: false,
						status: bindingDecision.status,
						changes: browserBindingChanges,
					});
					return sendBadRequest(reply, bindingDecision.message);
				}
				if (!bindingDecision.allowed && bindingDecision.status === "rejected_non_ui_source") {
					await recordBrowserBindingAudit(deps.browserBindingAuditLog, {
						kind: "agent_browser_binding",
						targetId: agentId,
						targetLabel: currentProfile?.name ?? agentId,
						source: auditSource.source,
						confirmedByClient: auditSource.confirmedByClient,
						status: bindingDecision.status,
						changes: browserBindingChanges,
					});
					return sendBadRequest(reply, bindingDecision.message);
				}
				if (browserBindingChanges.length > 0) {
					const catalog = await service.getConversationCatalog();
					if (catalog.conversations.some((conversation) => conversation.running)) {
						await recordBrowserBindingAudit(deps.browserBindingAuditLog, {
							kind: "agent_browser_binding",
							targetId: agentId,
							targetLabel: currentProfile?.name ?? agentId,
							source: auditSource.source,
							confirmedByClient: auditSource.confirmedByClient,
							status: "rejected_running",
							changes: browserBindingChanges,
						});
						return sendRunningBrowserBindingChange(reply, agentId);
					}
				}
				let modelSelection: { defaultModelProvider?: string; defaultModelId?: string } | undefined;
				if (hasModelSelectionPatch(body)) {
					modelSelection = normalizeOptionalModelSelection({
						defaultModelProvider: body.defaultModelProvider,
						defaultModelId: body.defaultModelId,
					});
					const modelValidation = await validateAgentModelSelectionOrSend(reply, modelSelection);
					if (modelValidation) {
						return modelValidation;
					}
					const catalog = await service.getConversationCatalog();
					if (catalog.conversations.some((conversation) => conversation.running)) {
						return sendRunningModelBindingChange(reply, agentId);
					}
				}
				const profile = await updateStoredAgentProfile(deps.projectRoot, agentId, {
					name: body.name,
					description: body.description,
					...(Object.hasOwn(body, "defaultBrowserId") ? { defaultBrowserId: body.defaultBrowserId } : {}),
					...(modelSelection !== undefined ? { defaultModelProvider: modelSelection.defaultModelProvider ?? null, defaultModelId: modelSelection.defaultModelId ?? null } : {}),
				});
				deps.agentServiceRegistry.updateProfile(profile);
				deps.agentTemplateRegistry?.invalidate(profile.agentId);
				if (browserBindingChanges.length > 0) {
					await recordBrowserBindingAudit(deps.browserBindingAuditLog, {
						kind: "agent_browser_binding",
						targetId: profile.agentId,
						targetLabel: profile.name,
						source: auditSource.source,
						confirmedByClient: auditSource.confirmedByClient,
						status: "succeeded",
						changes: browserBindingChanges,
					});
				}
				return {
					agent: presentAgentSummary(profile),
				};
			} catch (error) {
				return sendBadRequest(reply, error instanceof Error ? error.message : "Unable to update agent profile.");
			}
		},
	);

	app.post(
		"/v1/agents/:agentId/archive",
		async (
			request: FastifyRequest<{ Params: { agentId?: string } }>,
			reply,
		): Promise<{ archived: true; agentId: string; archivedPath: string } | FastifyReply> => {
			const { agentId } = request.params ?? {};
			if (!agentId || !deps.projectRoot || !deps.agentServiceRegistry) {
				return sendUnknownAgent(reply, agentId);
			}
			const teamLockResponse = await sendTeamProfileLockIfNeeded(agentId, reply);
			if (teamLockResponse) {
				return teamLockResponse;
			}
			const service = resolveScopedAgentServiceOrSend(deps.agentServiceRegistry, reply, agentId);
			if (!service) {
				return reply;
			}
			try {
				const catalog = await service.getConversationCatalog();
				if (catalog.conversations.some((conversation) => conversation.running)) {
					return sendConflict(reply, `Agent ${agentId} has a running conversation and cannot be archived.`);
				}
				const archived = await archiveStoredAgentProfile(deps.projectRoot, agentId);
				deps.agentServiceRegistry.remove(agentId);
				deps.agentTemplateRegistry?.invalidate(agentId);
				return {
					archived: true,
					agentId: archived.agentId,
					archivedPath: archived.archivedPath,
				};
			} catch (error) {
				return sendBadRequest(reply, error instanceof Error ? error.message : "Unable to archive agent profile.");
			}
		},
	);

	app.get(
		"/v1/agents/:agentId/debug/skills",
		async (
			request: FastifyRequest<{ Params: { agentId?: string } }>,
			reply,
		): Promise<DebugSkillsResponseBody | FastifyReply> => {
			const service = resolveScopedAgentServiceOrSend(deps.agentServiceRegistry, reply, request.params?.agentId);
			if (!service) {
				return reply;
			}
			return await service.getAvailableSkills();
		},
	);

	app.post(
		"/v1/agents/:agentId/skills",
		async (
			request: FastifyRequest<{
				Params: { agentId?: string };
				Body: { skillName?: string };
			}>,
			reply,
		): Promise<
			| {
					agentId: string;
					skillName: string;
					targetRoot: string;
					targetDir: string;
			  }
			| FastifyReply
		> => {
			const { agentId } = request.params ?? {};
			if (!agentId || !deps.projectRoot || !deps.agentServiceRegistry) {
				return sendUnknownAgent(reply, agentId);
			}
			const teamLockResponse = await sendTeamProfileLockIfNeeded(agentId, reply);
			if (teamLockResponse) {
				return teamLockResponse;
			}
			if (!resolveScopedAgentServiceOrSend(deps.agentServiceRegistry, reply, agentId)) {
				return reply;
			}
			try {
				const result = await installStoredAgentProfileSkill(deps.projectRoot, agentId, request.body?.skillName);
				deps.agentTemplateRegistry?.invalidate(agentId);
				return result;
			} catch (error) {
				return sendBadRequest(reply, error instanceof Error ? error.message : "Unable to install agent skill.");
			}
		},
	);

	app.delete(
		"/v1/agents/:agentId/skills/:skillName",
		async (
			request: FastifyRequest<{ Params: { agentId?: string; skillName?: string } }>,
			reply,
		): Promise<
			| {
					removed: true;
					agentId: string;
					skillName: string;
					targetRoot: string;
					targetDir: string;
			  }
			| FastifyReply
		> => {
			const { agentId, skillName } = request.params ?? {};
			if (!agentId || !deps.projectRoot || !deps.agentServiceRegistry) {
				return sendUnknownAgent(reply, agentId);
			}
			const teamLockResponse = await sendTeamProfileLockIfNeeded(agentId, reply);
			if (teamLockResponse) {
				return teamLockResponse;
			}
			if (!resolveScopedAgentServiceOrSend(deps.agentServiceRegistry, reply, agentId)) {
				return reply;
			}
			try {
				const removed = await removeStoredAgentProfileSkill(deps.projectRoot, agentId, skillName);
				deps.agentTemplateRegistry?.invalidate(agentId);
				return { removed: true, ...removed };
			} catch (error) {
				return sendBadRequest(reply, error instanceof Error ? error.message : "Unable to remove agent skill.");
			}
		},
	);

	app.post(
		"/v1/agents/:agentId/skills/:skillName/refresh",
		async (
			request: FastifyRequest<{ Params: { agentId?: string; skillName?: string } }>,
			reply,
		): Promise<
			| {
					agentId: string;
					skillName: string;
					targetRoot: string;
					targetDir: string;
			  }
			| FastifyReply
		> => {
			const { agentId, skillName } = request.params ?? {};
			if (!agentId || !deps.projectRoot || !deps.agentServiceRegistry) {
				return sendUnknownAgent(reply, agentId);
			}
			const teamLockResponse = await sendTeamProfileLockIfNeeded(agentId, reply);
			if (teamLockResponse) {
				return teamLockResponse;
			}
			if (!resolveScopedAgentServiceOrSend(deps.agentServiceRegistry, reply, agentId)) {
				return reply;
			}
			try {
				const refreshed = await refreshStoredAgentProfileSkillFromMain(deps.projectRoot, agentId, skillName);
				deps.agentTemplateRegistry?.invalidate(agentId);
				return refreshed;
			} catch (error) {
				return sendBadRequest(reply, error instanceof Error ? error.message : "Unable to refresh agent skill.");
			}
		},
	);

	app.get(
		"/v1/agents/:agentId/skills",
		async (
			request: FastifyRequest<{ Params: { agentId?: string } }>,
			reply,
		): Promise<AgentSkillListResponseBody | FastifyReply> => {
			const { agentId } = request.params ?? {};
			if (!agentId || !deps.projectRoot || !deps.agentServiceRegistry) {
				return sendUnknownAgent(reply, agentId);
			}
			if (!deps.agentServiceRegistry.getProfile(agentId)) {
				return sendUnknownAgent(reply, agentId);
			}
			try {
				return listStoredAgentProfileSkills(deps.projectRoot, agentId);
			} catch (error) {
				return sendBadRequest(reply, error instanceof Error ? error.message : "Unable to list agent skills.");
			}
		},
	);

	app.patch(
		"/v1/agents/:agentId/skills/:skillName",
		async (
			request: FastifyRequest<{
				Params: { agentId?: string; skillName?: string };
				Body: UpdateAgentSkillRequestBody;
			}>,
			reply,
		): Promise<UpdateAgentSkillResponseBody | FastifyReply> => {
			const { agentId, skillName } = request.params ?? {};
			if (!agentId || !deps.projectRoot || !deps.agentServiceRegistry) {
				return sendUnknownAgent(reply, agentId);
			}
			const teamLockResponse = await sendTeamProfileLockIfNeeded(agentId, reply);
			if (teamLockResponse) {
				return teamLockResponse;
			}
			const service = resolveScopedAgentServiceOrSend(deps.agentServiceRegistry, reply, agentId);
			if (!service) {
				return reply;
			}
			const catalog = await service.getConversationCatalog();
			if (catalog.conversations.some((conversation) => conversation.running)) {
				return sendConflict(reply, `Agent ${agentId} has a running conversation. Stop the current run before changing skill enablement.`);
			}
			try {
				const result = await updateStoredAgentProfileSkillEnabled(
					deps.projectRoot,
					agentId,
					skillName,
					request.body?.enabled,
				);
				deps.agentServiceRegistry.updateProfile(result.profile);
				deps.agentTemplateRegistry?.invalidate(agentId);
				return {
					agentId: result.agentId,
					skillName: result.skillName,
					enabled: result.enabled,
				};
			} catch (error) {
				return sendBadRequest(reply, error instanceof Error ? error.message : "Unable to update agent skill.");
			}
		},
	);

	app.get(
		"/v1/agents/:agentId/rules",
		async (
			request: FastifyRequest<{ Params: { agentId?: string } }>,
			reply,
		): Promise<
			| {
					agentId: string;
					fileName: string;
					path: string;
					exists: boolean;
					content: string;
			  }
			| FastifyReply
		> => {
			const agentId = request.params?.agentId;
			if (!agentId) {
				return sendUnknownAgent(reply, agentId);
			}
			if (!resolveScopedAgentServiceOrSend(deps.agentServiceRegistry, reply, agentId)) {
				return reply;
			}
			const rulesPath = resolveAgentRulesPath(agentId);
			if (!rulesPath) {
				return sendUnknownAgent(reply, agentId);
			}
			try {
				return {
					agentId,
					fileName: "AGENTS.md",
					path: rulesPath,
					exists: true,
					content: await readFile(rulesPath, "utf8"),
				};
			} catch (error) {
				if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
					return {
						agentId,
						fileName: "AGENTS.md",
						path: rulesPath,
						exists: false,
						content: "",
					};
				}
				return sendInternalError(reply, error);
			}
		},
	);

	app.get(
		"/playground/agents/:agentId/rules",
		async (
			request: FastifyRequest<{ Params: { agentId?: string } }>,
			reply,
		): Promise<string | FastifyReply> => {
			const agentId = request.params?.agentId;
			if (!agentId) {
				return sendUnknownAgent(reply, agentId);
			}
			if (!resolveScopedAgentServiceOrSend(deps.agentServiceRegistry, reply, agentId)) {
				return reply;
			}
			const rulesPath = resolveAgentRulesPath(agentId);
			if (!rulesPath) {
				return sendUnknownAgent(reply, agentId);
			}
			try {
				reply.type("text/markdown; charset=utf-8");
				reply.header("cache-control", "no-store, no-cache, must-revalidate");
				reply.header("pragma", "no-cache");
				reply.header("expires", "0");
				return await readFile(rulesPath, "utf8");
			} catch (error) {
				if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
					return sendNotFound(reply, `Agent rules file not found: ${agentId}`);
				}
				return sendInternalError(reply, error);
			}
		},
	);

	app.patch(
		"/v1/agents/:agentId/rules",
		async (
			request: FastifyRequest<{
				Params: { agentId?: string };
				Body: { content?: string };
			}>,
			reply,
		): Promise<
			| {
					agentId: string;
					fileName: string;
					path: string;
					exists: boolean;
					content: string;
			  }
			| FastifyReply
		> => {
			const agentId = request.params?.agentId;
			if (!agentId) {
				return sendUnknownAgent(reply, agentId);
			}
			const teamLockResponse = await sendTeamProfileLockIfNeeded(agentId, reply);
			if (teamLockResponse) {
				return teamLockResponse;
			}
			if (!resolveScopedAgentServiceOrSend(deps.agentServiceRegistry, reply, agentId)) {
				return reply;
			}
			const rulesPath = resolveAgentRulesPath(agentId);
			if (!rulesPath) {
				return sendUnknownAgent(reply, agentId);
			}
			const content = request.body?.content;
			if (typeof content !== "string") {
				return sendBadRequest(reply, "content must be a string");
			}
			if (content.length > 200_000) {
				return sendBadRequest(reply, "content is too large");
			}
			try {
				await mkdir(dirname(rulesPath), { recursive: true });
				await writeFile(rulesPath, content, "utf8");
				deps.agentTemplateRegistry?.invalidate(agentId);
				return {
					agentId,
					fileName: "AGENTS.md",
					path: rulesPath,
					exists: true,
					content,
				};
			} catch (error) {
				return sendInternalError(reply, error);
			}
		},
	);
}
