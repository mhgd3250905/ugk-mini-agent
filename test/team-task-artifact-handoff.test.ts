import test from "node:test";
import assert from "node:assert/strict";
import {
	TEAM_TASK_ARTIFACT_CONTENT_LIMIT,
	TEAM_TASK_ARTIFACT_PREVIEW_LIMIT,
	buildTeamTaskTypedArtifact,
	formatBoundInputsForPrompt,
} from "../src/team/task-artifact-handoff.js";
import type { TeamTaskBoundInput } from "../src/team/types.js";

function makeArtifact(overrides: Partial<NonNullable<Parameters<typeof buildTeamTaskTypedArtifact>[0]>> = {}) {
	return buildTeamTaskTypedArtifact({
		type: "md",
		sourceTaskId: "task_src",
		sourceRunId: "run_src",
		sourceAttemptId: "attempt_src",
		sourceOutputPortId: "draft_md",
		fileRef: "result/accepted.md",
		content: "accepted result",
		...overrides,
	});
}

function makeBoundInput(overrides: Partial<TeamTaskBoundInput> = {}): TeamTaskBoundInput {
	return {
		connectionId: "conn_1",
		inputPortId: "source_md",
		artifact: makeArtifact(),
		...overrides,
	};
}

test("buildTeamTaskTypedArtifact caps content at the content limit", () => {
	const longContent = "x".repeat(TEAM_TASK_ARTIFACT_CONTENT_LIMIT + 5000);
	const artifact = makeArtifact({ content: longContent });
	assert.equal(artifact.content?.length, TEAM_TASK_ARTIFACT_CONTENT_LIMIT);
	assert.equal(artifact.preview.length, TEAM_TASK_ARTIFACT_PREVIEW_LIMIT);
});

test("buildTeamTaskTypedArtifact caps preview at the preview limit", () => {
	const mediumContent = "y".repeat(TEAM_TASK_ARTIFACT_PREVIEW_LIMIT + 200);
	const artifact = makeArtifact({ content: mediumContent });
	assert.equal(artifact.content?.length, mediumContent.length);
	assert.equal(artifact.preview.length, TEAM_TASK_ARTIFACT_PREVIEW_LIMIT);
});

test("buildTeamTaskTypedArtifact preserves short content", () => {
	const shortContent = "short accepted result";
	const artifact = makeArtifact({ content: shortContent });
	assert.equal(artifact.content, shortContent);
	assert.equal(artifact.preview, shortContent);
});

test("buildTeamTaskTypedArtifact omits content for empty accepted result", () => {
	const artifact = makeArtifact({ content: "" });
	assert.equal(artifact.preview, "");
	assert.equal("content" in artifact, false);
});

test("buildTeamTaskTypedArtifact preserves source metadata", () => {
	const artifact = makeArtifact({
		type: "html",
		sourceTaskId: "task_abc",
		sourceRunId: "run_def",
		sourceAttemptId: "attempt_ghi",
		sourceOutputPortId: "page_html",
		fileRef: "result/page.html",
	});
	assert.equal(artifact.schemaVersion, "team/task-artifact-1");
	assert.equal(artifact.type, "html");
	assert.equal(artifact.sourceTaskId, "task_abc");
	assert.equal(artifact.sourceRunId, "run_def");
	assert.equal(artifact.sourceAttemptId, "attempt_ghi");
	assert.equal(artifact.sourceOutputPortId, "page_html");
	assert.equal(artifact.fileRef, "result/page.html");
	assert.ok(artifact.artifactId.startsWith("artifact_"));
	assert.ok(artifact.createdAt);
});

test("formatBoundInputsForPrompt returns empty string for no inputs", () => {
	assert.equal(formatBoundInputsForPrompt([]), "");
});

test("formatBoundInputsForPrompt formats one bound input with current metadata", () => {
	const input = makeBoundInput();
	const result = formatBoundInputsForPrompt([input]);
	assert.match(result, /输入 1: md/);
	assert.match(result, /inputPortId: source_md/);
	assert.match(result, /sourceTaskId: task_src/);
	assert.match(result, /sourceRunId: run_src/);
	assert.match(result, /fileRef: result\/accepted\.md/);
	assert.match(result, /accepted result/);
});

test("formatBoundInputsForPrompt uses content before preview", () => {
	const input = makeBoundInput({
		artifact: {
			...makeArtifact({ content: "full content text" }),
			preview: "preview only text",
		},
	});
	const result = formatBoundInputsForPrompt([input]);
	assert.match(result, /full content text/);
	assert.doesNotMatch(result, /preview only text/);
});

test("formatBoundInputsForPrompt falls back to preview when content is absent", () => {
	const artifact = makeArtifact({ content: "" });
	const input = makeBoundInput({
		artifact: {
			...artifact,
			preview: "preview fallback text",
		},
	});
	const result = formatBoundInputsForPrompt([input]);
	assert.match(result, /preview fallback text/);
});

test("formatBoundInputsForPrompt keeps multiple inputs ordered", () => {
	const input1 = makeBoundInput({
		connectionId: "conn_1",
		inputPortId: "port_a",
		artifact: makeArtifact({ content: "content alpha" }),
	});
	const input2 = makeBoundInput({
		connectionId: "conn_2",
		inputPortId: "port_b",
		artifact: makeArtifact({ content: "content beta" }),
	});
	const result = formatBoundInputsForPrompt([input1, input2]);
	const alphaIdx = result.indexOf("content alpha");
	const betaIdx = result.indexOf("content beta");
	assert.ok(alphaIdx < betaIdx, "first input content should appear before second");
	assert.match(result, /输入 1/);
	assert.match(result, /输入 2/);
});
