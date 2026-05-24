import type { TeamCanvasTask, TeamCanvasTaskStatus, TeamWorkUnitDefinition } from "./types.js";

const CREATE_STATUSES = new Set<TeamCanvasTaskStatus>(["drafting", "ready"]);
const PATCH_STATUSES = new Set<TeamCanvasTaskStatus>(["drafting", "ready"]);

export interface TaskValidationContext {
	availableAgentIds?: ReadonlySet<string>;
}

export interface CreateTeamCanvasTaskInput {
	title: string;
	leaderAgentId: string;
	workUnit: TeamWorkUnitDefinition;
	status?: TeamCanvasTaskStatus;
	createdByAgentId?: string;
}

export interface UpdateTeamCanvasTaskInput {
	title?: string;
	leaderAgentId?: string;
	workUnit?: TeamWorkUnitDefinition;
	status?: TeamCanvasTaskStatus;
}

function assertNonEmptyString(value: unknown, message: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(message);
	}
	return value;
}

function assertKnownAgent(agentId: string, context: TaskValidationContext): void {
	if (context.availableAgentIds && !context.availableAgentIds.has(agentId)) {
		throw new Error(`agent profile not found: ${agentId}`);
	}
}

function validateWorkUnit(workUnit: TeamWorkUnitDefinition | undefined, context: TaskValidationContext): TeamWorkUnitDefinition {
	if (!workUnit || typeof workUnit !== "object" || Array.isArray(workUnit)) {
		throw new Error("workUnit is required");
	}
	assertNonEmptyString(workUnit.title, "workUnit.title is required");
	assertNonEmptyString(workUnit.input?.text, "workUnit.input.text is required");
	assertNonEmptyString(workUnit.outputContract?.text, "workUnit.outputContract.text is required");
	const workerAgentId = assertNonEmptyString(workUnit.workerAgentId, "workUnit.workerAgentId is required");
	const checkerAgentId = assertNonEmptyString(workUnit.checkerAgentId, "workUnit.checkerAgentId is required");
	assertKnownAgent(workerAgentId, context);
	assertKnownAgent(checkerAgentId, context);
	if (!Array.isArray(workUnit.acceptance?.rules) || workUnit.acceptance.rules.length === 0) {
		throw new Error("workUnit.acceptance.rules must contain at least one non-empty rule");
	}
	if (workUnit.acceptance.rules.some(rule => typeof rule !== "string" || !rule.trim())) {
		throw new Error("workUnit.acceptance.rules must contain only non-empty rules");
	}
	return workUnit;
}

export function validateCreateTaskInput(input: CreateTeamCanvasTaskInput, context: TaskValidationContext = {}): void {
	assertNonEmptyString(input.title, "task title is required");
	const leaderAgentId = assertNonEmptyString(input.leaderAgentId, "leaderAgentId is required");
	assertKnownAgent(leaderAgentId, context);
	validateWorkUnit(input.workUnit, context);
	if (input.status !== undefined && !CREATE_STATUSES.has(input.status)) {
		throw new Error("task status must be drafting or ready");
	}
	if (input.createdByAgentId !== undefined) {
		const createdByAgentId = assertNonEmptyString(input.createdByAgentId, "createdByAgentId must be a non-empty string");
		assertKnownAgent(createdByAgentId, context);
	}
}

export function validateTaskUpdateInput(existing: TeamCanvasTask, patch: UpdateTeamCanvasTaskInput, context: TaskValidationContext = {}): void {
	if (existing.archived) {
		throw new Error("archived task cannot be edited");
	}
	if (existing.status === "locked" && patch.workUnit !== undefined) {
		throw new Error("locked task workUnit cannot be edited");
	}
	if (patch.title !== undefined) {
		assertNonEmptyString(patch.title, "task title is required");
	}
	if (patch.leaderAgentId !== undefined) {
		const leaderAgentId = assertNonEmptyString(patch.leaderAgentId, "leaderAgentId is required");
		assertKnownAgent(leaderAgentId, context);
	}
	if (patch.workUnit !== undefined) {
		validateWorkUnit(patch.workUnit, context);
	}
	if (patch.status !== undefined && !PATCH_STATUSES.has(patch.status)) {
		throw new Error("task status must be drafting or ready");
	}
}

export function buildTaskWarnings(task: Pick<TeamCanvasTask, "workUnit">): string[] {
	if (task.workUnit.workerAgentId === task.workUnit.checkerAgentId) {
		return ["workerAgentId and checkerAgentId are the same; self-checking weakens independent acceptance."];
	}
	return [];
}
