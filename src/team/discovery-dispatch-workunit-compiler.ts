import type { DiscoveryDispatchInput, DiscoveryDispatchSemanticPatch, DiscoveryDispatchWorkUnitDraft } from "./role-runner.js";

function trimOptional(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function uniqueNonEmpty(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		out.push(trimmed);
	}
	return out;
}

function buildInputText(input: DiscoveryDispatchInput, patch: DiscoveryDispatchSemanticPatch): string {
	const itemJson = JSON.stringify(input.itemPayload, null, 2);
	return [
		`Discovery task: ${input.discoveryTaskTitle}`,
		`Discovery task id: ${input.discoveryTaskId}`,
		"",
		"Discovery goal:",
		input.discoveryGoal,
		"",
		"Dispatch goal:",
		input.dispatchGoal,
		"",
		`Exact item id: ${input.itemId}`,
		"",
		"Full item payload JSON:",
		"```json",
		itemJson,
		"```",
		"",
		"Worker instruction:",
		patch.workerInstruction.trim(),
		"",
		"Boundary:",
		`Only process this exact Discovery item (${input.itemId}). Do not expand the task to other items from the Discovery result, adjacent rows, global source lists, or historical run artifacts.`,
	].join("\n");
}

function buildOutputContractText(input: DiscoveryDispatchInput, patch: DiscoveryDispatchSemanticPatch): string {
	const hint = trimOptional(patch.outputContractHint);
	const lines = [
		`Return a worker result for Discovery outputKey "${input.outputKey}" item "${input.itemId}".`,
		"Output must be specific to the exact item payload included in the task input.",
		"Include enough cited evidence, source URLs, or file references for checker validation.",
		"Clearly state source limitations, uncertainty, and any unverifiable claims.",
		"Preserve traceability by naming the item id and the evidence used for the conclusion.",
	];
	if (hint) {
		lines.push(`Item-specific output focus: ${hint}`);
	}
	return lines.join("\n");
}

function buildAcceptanceRules(input: DiscoveryDispatchInput, patch: DiscoveryDispatchSemanticPatch): string[] {
	const fixedRules = [
		`Result addresses only Discovery item "${input.itemId}" and does not switch to another item.`,
		"Result cites concrete evidence or explains why evidence could not be obtained.",
		"Result states source limitations and uncertainty instead of inventing facts.",
		"Result satisfies the output contract and is specific enough for downstream review.",
	];
	return uniqueNonEmpty([
		...fixedRules,
		...(patch.itemAcceptanceHints ?? []),
	]);
}

export function compileDiscoveryDispatchWorkUnit(
	input: DiscoveryDispatchInput,
	patch: DiscoveryDispatchSemanticPatch,
): DiscoveryDispatchWorkUnitDraft {
	const title = patch.title.trim();
	const workerInstruction = patch.workerInstruction.trim();
	if (patch.itemId !== input.itemId) {
		throw new Error(`discovery dispatch semantic patch item mismatch: expected ${input.itemId}, got ${patch.itemId}`);
	}
	if (!title) {
		throw new Error("discovery dispatch semantic patch title is required");
	}
	if (!workerInstruction) {
		throw new Error("discovery dispatch semantic patch workerInstruction is required");
	}
	const normalizedPatch: DiscoveryDispatchSemanticPatch = {
		itemId: patch.itemId,
		title,
		workerInstruction,
		...(patch.itemAcceptanceHints ? { itemAcceptanceHints: patch.itemAcceptanceHints.map(value => value.trim()).filter(Boolean) } : {}),
		...(trimOptional(patch.outputContractHint) ? { outputContractHint: trimOptional(patch.outputContractHint) } : {}),
	};
	return {
		title,
		input: { text: buildInputText(input, normalizedPatch) },
		outputContract: { text: buildOutputContractText(input, normalizedPatch) },
		acceptance: { rules: buildAcceptanceRules(input, normalizedPatch) },
	};
}
