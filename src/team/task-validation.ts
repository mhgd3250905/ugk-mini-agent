import type {
	TeamCanvasTask,
	TeamCanvasTaskKind,
	TeamCanvasTaskStatus,
	TeamDiscoveryRunPolicy,
	TeamDiscoverySpec,
	TeamGeneratedTaskSource,
	TeamSplitTaskSpec,
	TeamTaskOutputCheck,
	TeamTaskTemplateConfig,
	TeamTaskTemplateInstance,
	TeamTaskTemplateState,
	TeamWorkUnitDefinition,
} from "./types.js";
import { normalizeTemplateBinding, TEAM_TASK_TEMPLATE_INPUT_TYPES } from "./task-template.js";
import { validateTaskPorts } from "./task-port-contract.js";

const CREATE_STATUSES = new Set<TeamCanvasTaskStatus>(["drafting", "ready"]);
const PATCH_STATUSES = new Set<TeamCanvasTaskStatus>(["drafting", "ready"]);

export interface TaskValidationContext {
	availableAgentIds?: ReadonlySet<string>;
}

export interface CreateTeamCanvasTaskInput {
	canvasKind?: TeamCanvasTaskKind;
	title: string;
	leaderAgentId: string;
	workUnit: TeamWorkUnitDefinition;
	discoverySpec?: TeamDiscoverySpec;
	splitTaskSpec?: TeamSplitTaskSpec;
	discoveryRunPolicy?: TeamDiscoveryRunPolicy;
	generatedSource?: TeamGeneratedTaskSource;
	templateConfig?: TeamTaskTemplateConfig;
	templateState?: TeamTaskTemplateState;
	templateInstance?: TeamTaskTemplateInstance;
	status?: TeamCanvasTaskStatus;
	createdByAgentId?: string;
}

export interface UpdateTeamCanvasTaskInput {
	title?: string;
	leaderAgentId?: string;
	workUnit?: TeamWorkUnitDefinition;
	discoverySpec?: TeamDiscoverySpec;
	splitTaskSpec?: TeamSplitTaskSpec;
	discoveryRunPolicy?: TeamDiscoveryRunPolicy;
	templateConfig?: TeamTaskTemplateConfig;
	templateState?: TeamTaskTemplateState;
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

function assertOptionalNonEmptyString(value: unknown, message: string): void {
	if (value !== undefined) {
		assertNonEmptyString(value, message);
	}
}

function assertOptionalBoolean(value: unknown, message: string): void {
	if (value !== undefined && typeof value !== "boolean") {
		throw new Error(message);
	}
}

function assertStringArray(value: unknown, message: string): string[] {
	if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) {
		throw new Error(message);
	}
	return value;
}

function assertOptionalStringArray(value: unknown, message: string): void {
	if (value !== undefined) {
		assertStringArray(value, message);
	}
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function validateOutputCheck(outputCheck: TeamTaskOutputCheck | undefined): void {
	if (outputCheck === undefined) return;
	if (!isPlainRecord(outputCheck)) {
		throw new Error("workUnit.outputCheck must be an object");
	}
	const type = outputCheck.type;
	if (type !== "json_items" && type !== "json_object" && type !== "worklist" && type !== "worklist_results" && type !== "html_fragment" && type !== "file_exists") {
		throw new Error("workUnit.outputCheck.type is invalid");
	}
	switch (type) {
		case "json_items":
			assertOptionalNonEmptyString(outputCheck.outputKey, "workUnit.outputCheck.outputKey must be a non-empty string");
			assertOptionalBoolean(outputCheck.allowDirectArray, "workUnit.outputCheck.allowDirectArray must be a boolean");
			assertOptionalStringArray(outputCheck.requiredFields, "workUnit.outputCheck.requiredFields must contain only non-empty strings");
			break;
		case "json_object":
			assertOptionalStringArray(outputCheck.requiredFields, "workUnit.outputCheck.requiredFields must contain only non-empty strings");
			break;
		case "worklist":
			assertOptionalBoolean(outputCheck.allowEmpty, "workUnit.outputCheck.allowEmpty must be a boolean");
			break;
		case "worklist_results":
			assertOptionalBoolean(outputCheck.requireFullCoverage, "workUnit.outputCheck.requireFullCoverage must be a boolean");
			break;
		case "html_fragment":
			assertOptionalStringArray(outputCheck.requiredSubstrings, "workUnit.outputCheck.requiredSubstrings must contain only non-empty strings");
			assertOptionalStringArray(outputCheck.requiredSelectors, "workUnit.outputCheck.requiredSelectors must contain only non-empty strings");
			assertOptionalStringArray(outputCheck.forbiddenTags, "workUnit.outputCheck.forbiddenTags must contain only non-empty strings");
			assertOptionalBoolean(outputCheck.requireFence, "workUnit.outputCheck.requireFence must be a boolean");
			break;
		case "file_exists":
			assertOptionalNonEmptyString(outputCheck.path, "workUnit.outputCheck.path must be a non-empty string");
			break;
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
	validateOutputCheck(workUnit.outputCheck);
	validateTaskPorts(workUnit);
	return workUnit;
}

function validateDiscoverySpec(discoverySpec: TeamDiscoverySpec | undefined, context: TaskValidationContext): void {
	if (!discoverySpec || typeof discoverySpec !== "object" || Array.isArray(discoverySpec)) {
		throw new Error("discoverySpec is required for discovery tasks");
	}
	if (discoverySpec.schemaVersion !== "team/discovery-spec-1") {
		throw new Error("discoverySpec.schemaVersion is invalid");
	}
	assertNonEmptyString(discoverySpec.discoveryGoal, "discoverySpec.discoveryGoal is required");
	assertNonEmptyString(discoverySpec.outputKey, "discoverySpec.outputKey is required");
	if (discoverySpec.itemIdField !== "id") {
		throw new Error("discoverySpec.itemIdField must be id");
	}
	const requiredItemFields = assertStringArray(
		discoverySpec.requiredItemFields,
		"discoverySpec.requiredItemFields must contain at least one non-empty field",
	);
	if (requiredItemFields.length === 0) {
		throw new Error("discoverySpec.requiredItemFields must contain at least one non-empty field");
	}
	if (!requiredItemFields.includes("id")) {
		throw new Error("discoverySpec.requiredItemFields must include id");
	}
	assertOptionalStringArray(
		discoverySpec.recommendedItemFields,
		"discoverySpec.recommendedItemFields must contain only non-empty strings",
	);
	assertNonEmptyString(discoverySpec.dispatchGoal, "discoverySpec.dispatchGoal is required");
	const dispatcherAgentId = assertNonEmptyString(discoverySpec.dispatcherAgentId, "discoverySpec.dispatcherAgentId is required");
	const generatedWorkerAgentId = assertNonEmptyString(
		discoverySpec.generatedWorkerAgentId,
		"discoverySpec.generatedWorkerAgentId is required",
	);
	const generatedCheckerAgentId = assertNonEmptyString(
		discoverySpec.generatedCheckerAgentId,
		"discoverySpec.generatedCheckerAgentId is required",
	);
	assertKnownAgent(dispatcherAgentId, context);
	assertKnownAgent(generatedWorkerAgentId, context);
	assertKnownAgent(generatedCheckerAgentId, context);
	if (discoverySpec.autoRun?.enabled !== true) {
		throw new Error("discoverySpec.autoRun.enabled must be true");
	}
	if (discoverySpec.autoRun.concurrency !== 3) {
		throw new Error("discoverySpec.autoRun.concurrency must be 3");
	}
}

function validateDiscoveryRunPolicy(discoveryRunPolicy: TeamDiscoveryRunPolicy | undefined): void {
	if (discoveryRunPolicy === undefined) return;
	if (!discoveryRunPolicy || typeof discoveryRunPolicy !== "object" || Array.isArray(discoveryRunPolicy)) {
		throw new Error("discoveryRunPolicy must be an object");
	}
	if (discoveryRunPolicy.mode === "rediscover") {
		if ("channelSetId" in discoveryRunPolicy && discoveryRunPolicy.channelSetId !== undefined) {
			throw new Error("discoveryRunPolicy.channelSetId is only valid for channel_set mode");
		}
		return;
	}
	if (discoveryRunPolicy.mode === "channel_set") {
		assertNonEmptyString(discoveryRunPolicy.channelSetId, "discoveryRunPolicy.channelSetId is required");
		return;
	}
	throw new Error("discoveryRunPolicy.mode is invalid");
}

function validateSplitTaskSpec(splitTaskSpec: TeamSplitTaskSpec | undefined, workUnit: TeamWorkUnitDefinition, context: TaskValidationContext): void {
	if (!splitTaskSpec || typeof splitTaskSpec !== "object" || Array.isArray(splitTaskSpec)) {
		throw new Error("splitTaskSpec is required for split-task tasks");
	}
	if (splitTaskSpec.schemaVersion !== "team/split-task-spec-1") {
		throw new Error("splitTaskSpec.schemaVersion is invalid");
	}
	const inputPortId = assertNonEmptyString(splitTaskSpec.inputPortId, "splitTaskSpec.inputPortId is required");
	const outputPortId = assertNonEmptyString(splitTaskSpec.outputPortId, "splitTaskSpec.outputPortId is required");
	const inputPort = workUnit.inputPorts?.find(port => port.id === inputPortId);
	if (!inputPort) throw new Error("splitTaskSpec.inputPortId must reference an input port");
	if (inputPort.type !== "worklist") throw new Error("splitTaskSpec input port type must be worklist");
	const outputPort = workUnit.outputPorts?.find(port => port.id === outputPortId);
	if (!outputPort) throw new Error("splitTaskSpec.outputPortId must reference an output port");
	if (outputPort.type !== "worklist-results") throw new Error("splitTaskSpec output port type must be worklist-results");
	assertNonEmptyString(splitTaskSpec.dispatchGoal, "splitTaskSpec.dispatchGoal is required");
	const generatedWorkerAgentId = assertNonEmptyString(
		splitTaskSpec.generatedWorkerAgentId,
		"splitTaskSpec.generatedWorkerAgentId is required",
	);
	const generatedCheckerAgentId = assertNonEmptyString(
		splitTaskSpec.generatedCheckerAgentId,
		"splitTaskSpec.generatedCheckerAgentId is required",
	);
	assertKnownAgent(generatedWorkerAgentId, context);
	assertKnownAgent(generatedCheckerAgentId, context);
	if (splitTaskSpec.autoRun?.enabled !== true) {
		throw new Error("splitTaskSpec.autoRun.enabled must be true");
	}
	if (!Number.isInteger(splitTaskSpec.autoRun.concurrency) || splitTaskSpec.autoRun.concurrency < 1 || splitTaskSpec.autoRun.concurrency > 10) {
		throw new Error("splitTaskSpec.autoRun.concurrency must be an integer between 1 and 10");
	}
	if (!splitTaskSpec.collectPolicy || typeof splitTaskSpec.collectPolicy !== "object" || Array.isArray(splitTaskSpec.collectPolicy)) {
		throw new Error("splitTaskSpec.collectPolicy is required");
	}
	if (typeof splitTaskSpec.collectPolicy.requireAllItemsSucceeded !== "boolean") {
		throw new Error("splitTaskSpec.collectPolicy.requireAllItemsSucceeded must be a boolean");
	}
	if (typeof splitTaskSpec.collectPolicy.requireFullCoverage !== "boolean") {
		throw new Error("splitTaskSpec.collectPolicy.requireFullCoverage must be a boolean");
	}
}

function validateGeneratedSource(generatedSource: TeamGeneratedTaskSource | undefined, context: TaskValidationContext): void {
	if (!generatedSource || typeof generatedSource !== "object" || Array.isArray(generatedSource)) {
		throw new Error("generatedSource is required for generated tasks");
	}
	if (generatedSource.schemaVersion !== "team/generated-task-source-1" && generatedSource.schemaVersion !== "team/generated-task-source-2") {
		throw new Error("generatedSource.schemaVersion is invalid");
	}
	if (generatedSource.schemaVersion === "team/generated-task-source-1") {
		assertNonEmptyString(generatedSource.sourceDiscoveryTaskId, "generatedSource.sourceDiscoveryTaskId is required");
		assertOptionalNonEmptyString(generatedSource.latestDiscoveryRunId, "generatedSource.latestDiscoveryRunId must be a non-empty string");
		assertOptionalNonEmptyString(generatedSource.latestDiscoveryAttemptId, "generatedSource.latestDiscoveryAttemptId must be a non-empty string");
		assertOptionalNonEmptyString(generatedSource.latestDiscoveredAt, "generatedSource.latestDiscoveredAt must be a non-empty string");
	} else {
		if (generatedSource.sourceKind !== "discovery" && generatedSource.sourceKind !== "split-task") {
			throw new Error("generatedSource.sourceKind is invalid");
		}
		assertNonEmptyString(generatedSource.sourceTaskId, "generatedSource.sourceTaskId is required");
		assertOptionalNonEmptyString(generatedSource.latestSourceRunId, "generatedSource.latestSourceRunId must be a non-empty string");
		assertOptionalNonEmptyString(generatedSource.latestSourceAttemptId, "generatedSource.latestSourceAttemptId must be a non-empty string");
		assertOptionalNonEmptyString(generatedSource.latestSourceAt, "generatedSource.latestSourceAt must be a non-empty string");
	}
	assertNonEmptyString(generatedSource.sourceItemId, "generatedSource.sourceItemId is required");
	if (generatedSource.itemStatus !== "active" && generatedSource.itemStatus !== "stale") {
		throw new Error("generatedSource.itemStatus is invalid");
	}
	if (!isPlainRecord(generatedSource.itemPayload)) {
		throw new Error("generatedSource.itemPayload must be a plain object");
	}
	if (generatedSource.workUnitMode !== "managed" && generatedSource.workUnitMode !== "customized") {
		throw new Error("generatedSource.workUnitMode is invalid");
	}
	if (generatedSource.latestManagedWorkUnit !== undefined) {
		validateWorkUnit(generatedSource.latestManagedWorkUnit, context);
	}
}

function assertStableTemplateParameterId(value: unknown, message: string): string {
	if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)) {
		throw new Error(message);
	}
	return value;
}

function validateTemplateConfig(templateConfig: TeamTaskTemplateConfig | undefined): void {
	if (templateConfig === undefined) return;
	if (!templateConfig || typeof templateConfig !== "object" || Array.isArray(templateConfig)) {
		throw new Error("templateConfig must be an object");
	}
	if (templateConfig.schemaVersion !== "team/task-template-1") {
		throw new Error("templateConfig.schemaVersion is invalid");
	}
	if (!Array.isArray(templateConfig.parameters) || templateConfig.parameters.length === 0) {
		throw new Error("templateConfig.parameters must contain at least one parameter");
	}
	const ids = new Set<string>();
	for (const [index, parameter] of templateConfig.parameters.entries()) {
		if (!parameter || typeof parameter !== "object" || Array.isArray(parameter)) {
			throw new Error(`templateConfig.parameters[${index}] must be an object`);
		}
		const id = assertStableTemplateParameterId(
			parameter.id,
			`templateConfig.parameters[${index}].id must be a stable identifier`,
		);
		if (ids.has(id)) {
			throw new Error(`templateConfig.parameters contains duplicate parameter id: ${id}`);
		}
		ids.add(id);
		assertNonEmptyString(parameter.label, `templateConfig.parameters[${index}].label is required`);
		assertOptionalNonEmptyString(
			parameter.description,
			`templateConfig.parameters[${index}].description must be a non-empty string`,
		);
		assertOptionalNonEmptyString(
			parameter.defaultValue,
			`templateConfig.parameters[${index}].defaultValue must be a non-empty string`,
		);
		if (parameter.required !== undefined && typeof parameter.required !== "boolean") {
			throw new Error(`templateConfig.parameters[${index}].required must be a boolean`);
		}
		const inputType = parameter.inputType ?? "text";
		if (!TEAM_TASK_TEMPLATE_INPUT_TYPES.includes(inputType as any)) {
			throw new Error(`templateConfig.parameters[${index}].inputType is invalid`);
		}
		assertOptionalNonEmptyString(
			parameter.placeholder,
			`templateConfig.parameters[${index}].placeholder must be a non-empty string`,
		);
		if (inputType === "select") {
			if (!Array.isArray(parameter.options) || parameter.options.length === 0) {
				throw new Error(`templateConfig.parameters[${index}].options must contain at least one option`);
			}
			const optionValues = new Set<string>();
			for (const [optionIndex, option] of parameter.options.entries()) {
				if (!option || typeof option !== "object" || Array.isArray(option)) {
					throw new Error(`templateConfig.parameters[${index}].options[${optionIndex}] must be an object`);
				}
				assertNonEmptyString(
					option.value,
					`templateConfig.parameters[${index}].options[${optionIndex}].value is required`,
				);
				assertNonEmptyString(
					option.label,
					`templateConfig.parameters[${index}].options[${optionIndex}].label is required`,
				);
				if (optionValues.has(option.value)) {
					throw new Error(`templateConfig.parameters[${index}].options contains duplicate value: ${option.value}`);
				}
				optionValues.add(option.value);
			}
		} else if (parameter.options !== undefined) {
			throw new Error(`templateConfig.parameters[${index}].options is only allowed for select parameters`);
		}
		if (parameter.defaultValue !== undefined) {
			normalizeTemplateBinding(parameter, parameter.defaultValue);
		}
	}
}

function validateTemplateInstance(templateInstance: TeamTaskTemplateInstance | undefined): void {
	if (templateInstance === undefined) return;
	if (!templateInstance || typeof templateInstance !== "object" || Array.isArray(templateInstance)) {
		throw new Error("templateInstance must be an object");
	}
	if (templateInstance.schemaVersion !== "team/task-template-instance-1") {
		throw new Error("templateInstance.schemaVersion is invalid");
	}
	assertNonEmptyString(templateInstance.sourceTaskId, "templateInstance.sourceTaskId is required");
	if (!isPlainRecord(templateInstance.bindings)) {
		throw new Error("templateInstance.bindings must be a plain object");
	}
	for (const [key, value] of Object.entries(templateInstance.bindings)) {
		assertStableTemplateParameterId(key, `templateInstance.bindings parameter id is invalid: ${key}`);
		if (typeof value !== "string" || !value.trim()) {
			throw new Error(`templateInstance.bindings.${key} must be a non-empty string`);
		}
	}
}

function validateTemplateBindingsRecord(value: unknown, label: string): void {
	if (!isPlainRecord(value)) {
		throw new Error(`${label} must be a plain object`);
	}
	for (const [key, rawValue] of Object.entries(value)) {
		assertStableTemplateParameterId(key, `${label} parameter id is invalid: ${key}`);
		if (typeof rawValue !== "string" || !rawValue.trim()) {
			throw new Error(`${label}.${key} must be a non-empty string`);
		}
	}
}

function validateTemplateState(templateState: TeamTaskTemplateState | undefined): void {
	if (templateState === undefined) return;
	if (!templateState || typeof templateState !== "object" || Array.isArray(templateState)) {
		throw new Error("templateState must be an object");
	}
	if (templateState.schemaVersion !== "team/task-template-state-1") {
		throw new Error("templateState.schemaVersion is invalid");
	}
	validateTemplateBindingsRecord(templateState.currentBindings, "templateState.currentBindings");
	assertNonEmptyString(templateState.updatedAt, "templateState.updatedAt is required");
}

export function validateCreateTaskInput(input: CreateTeamCanvasTaskInput, context: TaskValidationContext = {}): void {
	const rawCanvasKind = (input as { canvasKind?: unknown }).canvasKind;
	if (rawCanvasKind !== undefined && rawCanvasKind !== "task" && rawCanvasKind !== "discovery" && rawCanvasKind !== "split-task") {
		throw new Error("canvasKind is invalid");
	}
	const workUnit = validateWorkUnit(input.workUnit, context);
	if (input.canvasKind === "discovery") {
		if (input.generatedSource !== undefined) {
			throw new Error("discovery root task cannot carry generatedSource");
		}
		if (input.splitTaskSpec !== undefined) {
			throw new Error("discovery root task cannot carry splitTaskSpec");
		}
		validateDiscoverySpec(input.discoverySpec, context);
		validateDiscoveryRunPolicy(input.discoveryRunPolicy);
	} else if (input.canvasKind === "split-task") {
		if (input.generatedSource !== undefined) {
			throw new Error("split-task root task cannot carry generatedSource");
		}
		if (input.discoverySpec !== undefined) {
			throw new Error("split-task root task cannot carry discoverySpec");
		}
		if (input.discoveryRunPolicy !== undefined) {
			throw new Error("split-task root task cannot carry discoveryRunPolicy");
		}
		validateSplitTaskSpec(input.splitTaskSpec, workUnit, context);
	} else if (input.generatedSource !== undefined) {
		if (input.discoverySpec !== undefined) {
			throw new Error("generated task cannot carry discoverySpec");
		}
		if (input.splitTaskSpec !== undefined) {
			throw new Error("generated task cannot carry splitTaskSpec");
		}
		if (input.discoveryRunPolicy !== undefined) {
			throw new Error("generated task cannot carry discoveryRunPolicy");
		}
		validateGeneratedSource(input.generatedSource, context);
	} else if (input.discoverySpec !== undefined) {
		throw new Error("normal root task cannot carry discoverySpec");
	} else if (input.discoveryRunPolicy !== undefined) {
		throw new Error("normal root task cannot carry discoveryRunPolicy");
	} else if (input.splitTaskSpec !== undefined) {
		throw new Error("normal root task cannot carry splitTaskSpec");
	}
	assertNonEmptyString(input.title, "task title is required");
	const leaderAgentId = assertNonEmptyString(input.leaderAgentId, "leaderAgentId is required");
	assertKnownAgent(leaderAgentId, context);
	if (input.status !== undefined && !CREATE_STATUSES.has(input.status)) {
		throw new Error("task status must be drafting or ready");
	}
	if (input.createdByAgentId !== undefined) {
		const createdByAgentId = assertNonEmptyString(input.createdByAgentId, "createdByAgentId must be a non-empty string");
		assertKnownAgent(createdByAgentId, context);
	}
	validateTemplateConfig(input.templateConfig);
	validateTemplateState(input.templateState);
	validateTemplateInstance(input.templateInstance);
	if (input.templateConfig !== undefined && input.templateInstance !== undefined) {
		throw new Error("template task cannot also be a template instance");
	}
	if (input.templateState !== undefined && input.templateConfig === undefined) {
		throw new Error("templateState requires templateConfig");
	}
}

export function validateTaskUpdateInput(existing: TeamCanvasTask, patch: UpdateTeamCanvasTaskInput, context: TaskValidationContext = {}): void {
	const rawPatch = patch as UpdateTeamCanvasTaskInput & { canvasKind?: unknown; generatedSource?: unknown };
	if (rawPatch.canvasKind !== undefined) {
		throw new Error("canvasKind cannot be updated");
	}
	if (rawPatch.generatedSource !== undefined) {
		throw new Error("generatedSource cannot be updated");
	}
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
	if (patch.discoverySpec !== undefined) {
		if (existing.generatedSource) {
			throw new Error("generated task cannot carry discoverySpec");
		}
		if (existing.canvasKind !== "discovery") {
			throw new Error("normal root task cannot carry discoverySpec");
		}
		validateDiscoverySpec(patch.discoverySpec, context);
	}
	if (patch.discoveryRunPolicy !== undefined) {
		if (existing.generatedSource) {
			throw new Error("generated task cannot carry discoveryRunPolicy");
		}
		if (existing.canvasKind !== "discovery") {
			throw new Error("normal root task cannot carry discoveryRunPolicy");
		}
		validateDiscoveryRunPolicy(patch.discoveryRunPolicy);
	}
	if (patch.splitTaskSpec !== undefined) {
		if (existing.generatedSource) {
			throw new Error("generated task cannot carry splitTaskSpec");
		}
		if (existing.canvasKind !== "split-task") {
			throw new Error("normal root task cannot carry splitTaskSpec");
		}
		const nextWorkUnit = patch.workUnit !== undefined ? patch.workUnit : existing.workUnit;
		validateSplitTaskSpec(patch.splitTaskSpec, nextWorkUnit, context);
	}
	if (patch.status !== undefined && !PATCH_STATUSES.has(patch.status)) {
		throw new Error("task status must be drafting or ready");
	}
	validateTemplateConfig(patch.templateConfig);
	validateTemplateState(patch.templateState);
	const nextTemplateConfig = patch.templateConfig !== undefined ? patch.templateConfig : existing.templateConfig;
	if (patch.templateState !== undefined && nextTemplateConfig === undefined) {
		throw new Error("templateState requires templateConfig");
	}
}

export function buildTaskWarnings(task: Pick<TeamCanvasTask, "workUnit">): string[] {
	if (task.workUnit.workerAgentId === task.workUnit.checkerAgentId) {
		return ["workerAgentId and checkerAgentId are the same; self-checking weakens independent acceptance."];
	}
	return [];
}
