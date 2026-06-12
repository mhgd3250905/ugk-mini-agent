import type { CreateTeamCanvasTaskInput, TaskValidationContext } from "./task-validation.js";
import { validateCreateTaskInput } from "./task-validation.js";
import type { TeamTaskOutputCheck, TeamWorkUnitDefinition } from "./types.js";

type TaskFactoryStatus = "drafting" | "ready";

interface TaskFactoryBaseSpec {
	title: string;
	leaderAgentId: string;
	workerAgentId: string;
	checkerAgentId: string;
	status?: TaskFactoryStatus;
}

export interface NormalTaskFactorySpec extends TaskFactoryBaseSpec {
	kind: "normal";
	inputText: string;
	outputContractText: string;
	acceptanceRules: string[];
	inputPorts?: Array<{ id: string; label?: string; type: string }>;
	outputPorts?: Array<{ id: string; label?: string; type: string }>;
	outputCheck?: TeamTaskOutputCheck;
}

export interface WorklistProducerFactorySpec extends TaskFactoryBaseSpec {
	kind: "worklist-producer";
	sourceDescription: string;
	itemBoundary: string;
	batchSize?: number;
	inputPortId?: string;
	outputPortId?: string;
	acceptanceRules?: string[];
}

export interface SplitTaskFactorySpec extends TaskFactoryBaseSpec {
	kind: "split-task";
	worklistDescription: string;
	dispatchGoal: string;
	resultDescription?: string;
	generatedWorkerAgentId?: string;
	generatedCheckerAgentId?: string;
	concurrency?: number;
	inputPortId?: string;
	outputPortId?: string;
	requireAllItemsSucceeded?: boolean;
	requireFullCoverage?: boolean;
	acceptanceRules?: string[];
}

export type TeamTaskFactorySpec =
	| NormalTaskFactorySpec
	| WorklistProducerFactorySpec
	| SplitTaskFactorySpec;

const WORKLIST_OUTPUT_PATH = "output/worklist.json";
const WORKLIST_OUTPUT_REFERENCE = `{"outputPath":"${WORKLIST_OUTPUT_PATH}"}`;

export interface TeamTaskFactoryResult {
	payload: CreateTeamCanvasTaskInput;
	warnings: string[];
}

function assertNonEmpty(value: unknown, label: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`${label} is required`);
	}
	return value.trim();
}

function assertRules(value: unknown, label: string): string[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(`${label} must contain at least one rule`);
	}
	return value.map((rule, index) => assertNonEmpty(rule, `${label}[${index}]`));
}

function normalizeStatus(status: TaskFactoryStatus | undefined): TaskFactoryStatus {
	return status ?? "ready";
}

function buildWorkUnit(input: {
	title: string;
	inputText: string;
	outputContractText: string;
	acceptanceRules: string[];
	workerAgentId: string;
	checkerAgentId: string;
	inputPorts?: TeamWorkUnitDefinition["inputPorts"];
	outputPorts?: TeamWorkUnitDefinition["outputPorts"];
	outputCheck?: TeamTaskOutputCheck;
}): TeamWorkUnitDefinition {
	return {
		title: input.title,
		input: { text: input.inputText },
		...(input.inputPorts ? { inputPorts: input.inputPorts } : {}),
		...(input.outputPorts ? { outputPorts: input.outputPorts } : {}),
		...(input.outputCheck ? { outputCheck: input.outputCheck } : {}),
		outputContract: { text: input.outputContractText },
		acceptance: { rules: input.acceptanceRules },
		workerAgentId: input.workerAgentId,
		checkerAgentId: input.checkerAgentId,
	};
}

function defaultWorklistProducerRules(batchSize: number): string[] {
	return [
		"Output must be valid JSON with schemaVersion team/worklist-1.",
		"Every item must include stable id, title, and input fields.",
		`Each item input must contain no more than ${batchSize} source records.`,
		"Source order must be preserved unless the user explicitly requested sorting.",
		"No source record may be silently dropped.",
	];
}

function worklistRuntimeOutputRules(): string[] {
	return [
		`Worker must write the completed worklist file to ${WORKLIST_OUTPUT_PATH}.`,
		`Worker final output message must be exactly a machine-readable JSON reference like ${WORKLIST_OUTPUT_REFERENCE}; do not end with a prose summary.`,
	];
}

function defaultSplitTaskRules(): string[] {
	return [
		"Output must be valid JSON with schemaVersion team/worklist-results-1.",
		"Every source worklist item must have exactly one corresponding result entry.",
		"Each child result must address only its assigned worklist item.",
		"Missing, failed, or duplicated item results must be reported explicitly.",
	];
}

function buildNormalPayload(spec: NormalTaskFactorySpec): CreateTeamCanvasTaskInput {
	return {
		title: assertNonEmpty(spec.title, "title"),
		leaderAgentId: assertNonEmpty(spec.leaderAgentId, "leaderAgentId"),
		status: normalizeStatus(spec.status),
		workUnit: buildWorkUnit({
			title: assertNonEmpty(spec.title, "title"),
			inputText: assertNonEmpty(spec.inputText, "inputText"),
			outputContractText: assertNonEmpty(spec.outputContractText, "outputContractText"),
			acceptanceRules: assertRules(spec.acceptanceRules, "acceptanceRules"),
			workerAgentId: assertNonEmpty(spec.workerAgentId, "workerAgentId"),
			checkerAgentId: assertNonEmpty(spec.checkerAgentId, "checkerAgentId"),
			inputPorts: spec.inputPorts,
			outputPorts: spec.outputPorts,
			outputCheck: spec.outputCheck,
		}),
	};
}

function buildWorklistProducerPayload(spec: WorklistProducerFactorySpec): CreateTeamCanvasTaskInput {
	const batchSize = spec.batchSize ?? 20;
	if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 200) {
		throw new Error("batchSize must be an integer between 1 and 200");
	}
	const inputPortId = spec.inputPortId ?? "raw_json";
	const outputPortId = spec.outputPortId ?? "worklist";
	const sourceDescription = assertNonEmpty(spec.sourceDescription, "sourceDescription");
	const itemBoundary = assertNonEmpty(spec.itemBoundary, "itemBoundary");
	const acceptanceRules = spec.acceptanceRules?.length ? assertRules(spec.acceptanceRules, "acceptanceRules") : defaultWorklistProducerRules(batchSize);
	return {
		title: assertNonEmpty(spec.title, "title"),
		leaderAgentId: assertNonEmpty(spec.leaderAgentId, "leaderAgentId"),
		status: normalizeStatus(spec.status),
		workUnit: buildWorkUnit({
			title: assertNonEmpty(spec.title, "title"),
			inputText: [
				`Source data: ${sourceDescription}`,
				`Item boundary: ${itemBoundary}`,
				`Split the source records into worklist items with at most ${batchSize} records per item.`,
				"Preserve source order. Do not translate, rewrite, or summarize source records unless the user explicitly requested it.",
				"Each worklist item input must contain the original records needed for that item.",
				`Write the completed worklist JSON to ${WORKLIST_OUTPUT_PATH}.`,
				`The final worker output message must be ${WORKLIST_OUTPUT_REFERENCE} and nothing else.`,
			].join("\n"),
			inputPorts: [{ id: inputPortId, label: "Source JSON", type: "json" }],
			outputPorts: [{ id: outputPortId, label: "Worklist", type: "worklist" }],
			outputCheck: { type: "worklist" },
			outputContractText: `Output a team/worklist-1 JSON object with schemaVersion, worklistId, title, and items[]. Each item must include id, title, input, and optional acceptanceHints. Write the JSON file to ${WORKLIST_OUTPUT_PATH}. The final worker output message must be the machine-readable JSON reference ${WORKLIST_OUTPUT_REFERENCE}, not a prose summary.`,
			acceptanceRules: [...acceptanceRules, ...worklistRuntimeOutputRules()],
			workerAgentId: assertNonEmpty(spec.workerAgentId, "workerAgentId"),
			checkerAgentId: assertNonEmpty(spec.checkerAgentId, "checkerAgentId"),
		}),
	};
}

function buildSplitTaskPayload(spec: SplitTaskFactorySpec): CreateTeamCanvasTaskInput {
	const inputPortId = spec.inputPortId ?? "worklist";
	const outputPortId = spec.outputPortId ?? "results";
	const concurrency = spec.concurrency ?? 3;
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) {
		throw new Error("concurrency must be an integer between 1 and 10");
	}
	const generatedWorkerAgentId = spec.generatedWorkerAgentId ?? spec.workerAgentId;
	const generatedCheckerAgentId = spec.generatedCheckerAgentId ?? spec.checkerAgentId;
	return {
		canvasKind: "split-task",
		title: assertNonEmpty(spec.title, "title"),
		leaderAgentId: assertNonEmpty(spec.leaderAgentId, "leaderAgentId"),
		status: normalizeStatus(spec.status),
		workUnit: buildWorkUnit({
			title: assertNonEmpty(spec.title, "title"),
			inputText: assertNonEmpty(spec.worklistDescription, "worklistDescription"),
			inputPorts: [{ id: inputPortId, label: "Worklist", type: "worklist" }],
			outputPorts: [{ id: outputPortId, label: "Worklist results", type: "worklist-results" }],
			outputCheck: { type: "worklist_results", requireFullCoverage: spec.requireFullCoverage ?? true },
			outputContractText: spec.resultDescription?.trim()
				? spec.resultDescription.trim()
				: "Output a team/worklist-results-1 JSON object covering every input worklist item.",
			acceptanceRules: spec.acceptanceRules?.length ? assertRules(spec.acceptanceRules, "acceptanceRules") : defaultSplitTaskRules(),
			workerAgentId: assertNonEmpty(spec.workerAgentId, "workerAgentId"),
			checkerAgentId: assertNonEmpty(spec.checkerAgentId, "checkerAgentId"),
		}),
		splitTaskSpec: {
			schemaVersion: "team/split-task-spec-1",
			inputPortId,
			outputPortId,
			dispatchGoal: assertNonEmpty(spec.dispatchGoal, "dispatchGoal"),
			generatedWorkerAgentId: assertNonEmpty(generatedWorkerAgentId, "generatedWorkerAgentId"),
			generatedCheckerAgentId: assertNonEmpty(generatedCheckerAgentId, "generatedCheckerAgentId"),
			autoRun: { enabled: true, concurrency },
			collectPolicy: {
				requireAllItemsSucceeded: spec.requireAllItemsSucceeded ?? true,
				requireFullCoverage: spec.requireFullCoverage ?? true,
			},
		},
	};
}

export function buildTeamTaskFactoryPayload(spec: TeamTaskFactorySpec, context: TaskValidationContext = {}): TeamTaskFactoryResult {
	if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
		throw new Error("factory spec must be an object");
	}
	let payload: CreateTeamCanvasTaskInput;
	switch (spec.kind) {
		case "normal":
			payload = buildNormalPayload(spec);
			break;
		case "worklist-producer":
			payload = buildWorklistProducerPayload(spec);
			break;
		case "split-task":
			payload = buildSplitTaskPayload(spec);
			break;
		default:
			throw new Error("kind must be normal, worklist-producer, or split-task");
	}
	validateCreateTaskInput(payload, context);
	const warnings = payload.workUnit.workerAgentId === payload.workUnit.checkerAgentId
		? ["workerAgentId and checkerAgentId are the same; self-checking weakens independent acceptance."]
		: [];
	return { payload, warnings };
}
