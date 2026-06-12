import test from "node:test";
import assert from "node:assert/strict";
import {
	validateTeamWorklist,
	validateTeamWorklistResults,
	parseTeamWorklistContent,
} from "../src/team/worklist-contract.js";

function worklist(overrides: Record<string, unknown> = {}) {
	return {
		schemaVersion: "team/worklist-1",
		worklistId: "worklist_news",
		title: "News chunks",
		items: [
			{ id: "chunk-001", title: "Chunk 1", input: { rows: [1] }, acceptanceHints: ["Return JSON"] },
			{ id: "chunk-002", title: "Chunk 2", input: { rows: [2] } },
		],
		...overrides,
	};
}

test("validateTeamWorklist accepts a valid worklist", () => {
	const result = validateTeamWorklist(worklist());
	assert.equal(result.schemaVersion, "team/worklist-1");
	assert.equal(result.items.length, 2);
	assert.equal(result.items[0]?.id, "chunk-001");
});

test("validateTeamWorklist rejects duplicate item ids", () => {
	assert.throws(
		() => validateTeamWorklist(worklist({ items: [
			{ id: "chunk-001", title: "Chunk 1", input: {} },
			{ id: "chunk-001", title: "Chunk 1 again", input: {} },
		] })),
		/duplicate worklist item id: chunk-001/,
	);
});

test("validateTeamWorklist rejects items without input", () => {
	assert.throws(
		() => validateTeamWorklist(worklist({ items: [{ id: "chunk-001", title: "Chunk 1" }] })),
		/items\[0\]\.input is required/,
	);
});

test("parseTeamWorklistContent accepts fenced JSON", () => {
	const parsed = parseTeamWorklistContent(`\`\`\`json\n${JSON.stringify(worklist())}\n\`\`\``);
	assert.equal(parsed.worklistId, "worklist_news");
});

test("validateTeamWorklistResults accepts fully covered results", () => {
	const result = validateTeamWorklistResults({
		schemaVersion: "team/worklist-results-1",
		sourceWorklist: worklist(),
		summary: { totalItems: 2, succeeded: 1, failed: 1, cancelled: 0, missing: 0 },
		results: [
			{ itemId: "chunk-001", status: "succeeded", content: "ok" },
			{ itemId: "chunk-002", status: "failed", errorSummary: "bad source" },
		],
		createdAt: "2026-06-11T00:00:00.000Z",
	});
	assert.equal(result.summary.totalItems, 2);
});

test("validateTeamWorklistResults rejects unknown result item ids", () => {
	assert.throws(
		() => validateTeamWorklistResults({
			schemaVersion: "team/worklist-results-1",
			sourceWorklist: worklist(),
			summary: { totalItems: 2, succeeded: 1, failed: 0, cancelled: 0, missing: 0 },
			results: [{ itemId: "chunk-999", status: "succeeded", content: "ok" }],
			createdAt: "2026-06-11T00:00:00.000Z",
		}),
		/result itemId does not exist in sourceWorklist: chunk-999/,
	);
});

test("validateTeamWorklistResults rejects missing full coverage", () => {
	assert.throws(
		() => validateTeamWorklistResults({
			schemaVersion: "team/worklist-results-1",
			sourceWorklist: worklist(),
			summary: { totalItems: 2, succeeded: 1, failed: 0, cancelled: 0, missing: 0 },
			results: [{ itemId: "chunk-001", status: "succeeded", content: "ok" }],
			createdAt: "2026-06-11T00:00:00.000Z",
		}),
		/missing result for worklist item: chunk-002/,
	);
});

test("validateTeamWorklistResults rejects summary mismatches", () => {
	assert.throws(
		() => validateTeamWorklistResults({
			schemaVersion: "team/worklist-results-1",
			sourceWorklist: worklist(),
			summary: { totalItems: 2, succeeded: 2, failed: 0, cancelled: 0, missing: 0 },
			results: [
				{ itemId: "chunk-001", status: "succeeded", content: "ok" },
				{ itemId: "chunk-002", status: "failed", errorSummary: "bad source" },
			],
			createdAt: "2026-06-11T00:00:00.000Z",
		}),
		/summary\.succeeded does not match actual results/,
	);
});
