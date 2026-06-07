import test from "node:test";
import assert from "node:assert/strict";
import {
	TEAM_TASK_ARTIFACT_CONTENT_LIMIT,
	TEAM_TASK_ARTIFACT_PREVIEW_LIMIT,
	buildTeamCanvasSourceArtifact,
	buildTeamTaskTypedArtifact,
	formatBoundInputsForPrompt,
} from "../src/team/task-artifact-handoff.js";
import type { TeamCanvasSourceBoundInput, TeamTaskArtifactBoundInput, TeamTaskBoundInput } from "../src/team/types.js";

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

function makeBoundInput(overrides: Partial<TeamTaskArtifactBoundInput> = {}): TeamTaskArtifactBoundInput {
	return {
		connectionId: "conn_1",
		inputPortId: "source_md",
		artifact: makeArtifact(),
		...overrides,
	};
}

function makeSourceBoundInput(overrides: Partial<TeamCanvasSourceBoundInput> = {}): TeamCanvasSourceBoundInput {
	return {
		source: "canvas-source",
		connectionId: "source_conn_1",
		inputPortId: "source_text",
		artifact: buildTeamCanvasSourceArtifact({
			type: "string",
			sourceNodeId: "source_node_1",
			sourceOutputPortId: "value",
			title: "需求说明",
			content: "这是一段画布来源文本。",
		}),
		...overrides,
	};
}

test("buildTeamTaskTypedArtifact caps content at the content limit", () => {
	const longContent = "x".repeat(TEAM_TASK_ARTIFACT_CONTENT_LIMIT + 5000);
	const artifact = makeArtifact({ content: longContent });
	assert.equal(artifact.content?.length, TEAM_TASK_ARTIFACT_CONTENT_LIMIT);
	assert.equal(artifact.preview.length, TEAM_TASK_ARTIFACT_PREVIEW_LIMIT);
	assert.equal(artifact.contentTruncated, true);
	assert.equal(artifact.originalContentLength, longContent.length);
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

test("formatBoundInputsForPrompt formats one bound input with full trace metadata", () => {
	const input = makeBoundInput();
	const result = formatBoundInputsForPrompt([input]);
	assert.match(result, /输入 1: md/);
	assert.match(result, /connectionId: conn_1/);
	assert.match(result, /inputPortId: source_md/);
	assert.match(result, /artifactId: artifact_/);
	assert.match(result, /sourceTaskId: task_src/);
	assert.match(result, /sourceRunId: run_src/);
	assert.match(result, /sourceAttemptId: attempt_src/);
	assert.match(result, /sourceOutputPortId: draft_md/);
	assert.match(result, /fileRef: result\/accepted\.md/);
	assert.match(result, /BEGIN_TYPED_ARTIFACT_PREVIEW artifact_/);
	assert.match(result, /END_TYPED_ARTIFACT_PREVIEW artifact_/);
	assert.match(result, /accepted result/);
});

test("formatBoundInputsForPrompt treats typed artifact content as preview with file handoff guidance", () => {
	const artifact = {
		schemaVersion: "team/task-artifact-1" as const,
		artifactId: "artifact_fixed",
		type: "md",
		sourceTaskId: "task_src",
		sourceRunId: "run_src",
		sourceAttemptId: "attempt_src",
		sourceOutputPortId: "draft_md",
		fileRef: "result/accepted.md",
		preview: "accepted result",
		content: "accepted result",
		createdAt: "2026-05-26T00:00:00.000Z",
	};
	const legacyInput: TeamTaskBoundInput = {
		connectionId: "conn_1",
		inputPortId: "source_md",
		artifact,
	};

	assert.equal(formatBoundInputsForPrompt([legacyInput]), [
		"## 已绑定上游 typed artifact 输入",
		"**重要**：typed artifact 的完整内容由 runtime 物化为当前 worker 工作目录下的文件。下方 BEGIN/END 只提供预览和追溯信息；执行任务时必须优先读取 workspaceFileRef / workspaceFilePath 指向的完整文件，不要从旧资产、文件库、workspace 残留或历史 run 中推断上游数据。",
		"### 输入 1: md",
		"- connectionId: conn_1",
		"- inputPortId: source_md",
		"- artifactId: artifact_fixed",
		"- sourceTaskId: task_src",
		"- sourceRunId: run_src",
		"- sourceAttemptId: attempt_src",
		"- sourceOutputPortId: draft_md",
		"- fileRef: result/accepted.md",
		"",
		"BEGIN_TYPED_ARTIFACT_PREVIEW artifact_fixed",
		"accepted result",
		"END_TYPED_ARTIFACT_PREVIEW artifact_fixed",
	].join("\n"));
});

test("formatBoundInputsForPrompt wraps markdown-like content in stable delimiters", () => {
	const markdownContent = [
		"### Nested Heading",
		"- list item 1",
		"- list item 2",
		"",
		"```typescript",
		"const x = 1;",
		"```",
	].join("\n");
	const input = makeBoundInput({
		artifact: makeArtifact({ content: markdownContent }),
	});
	const result = formatBoundInputsForPrompt([input]);
	assert.match(result, /### Nested Heading/);
	assert.match(result, /```typescript/);
	assert.match(result, /const x = 1;/);
	const beginIdx = result.indexOf("BEGIN_TYPED_ARTIFACT_PREVIEW");
	const endIdx = result.indexOf("END_TYPED_ARTIFACT_PREVIEW");
	assert.ok(beginIdx > 0, "BEGIN marker should exist");
	assert.ok(endIdx > beginIdx, "END marker should appear after BEGIN");
	const beginCount = (result.match(/BEGIN_TYPED_ARTIFACT_PREVIEW/g) ?? []).length;
	const endCount = (result.match(/END_TYPED_ARTIFACT_PREVIEW/g) ?? []).length;
	assert.equal(beginCount, 1, "exactly one BEGIN marker for one input");
	assert.equal(endCount, 1, "exactly one END marker for one input");
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

test("formatBoundInputsForPrompt marks truncated typed artifact content as preview only", () => {
	const artifact = makeArtifact({
		content: "x".repeat(TEAM_TASK_ARTIFACT_CONTENT_LIMIT + 100),
	});
	const result = formatBoundInputsForPrompt([makeBoundInput({ artifact })]);

	assert.match(result, /contentTruncated: true/);
	assert.match(result, /originalContentLength: 30100/);
	assert.match(result, /BEGIN_TYPED_ARTIFACT_PREVIEW artifact_/);
	assert.match(result, /END_TYPED_ARTIFACT_PREVIEW artifact_/);
	assert.doesNotMatch(result, /BEGIN_TYPED_ARTIFACT_CONTENT/);
	assert.doesNotMatch(result, /唯一上游数据来源/);
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

test("formatBoundInputsForPrompt formats source text artifact without fake task metadata", () => {
	const input = makeSourceBoundInput();
	const result = formatBoundInputsForPrompt([input]);

	assert.match(result, /画布 source node 输入/);
	assert.match(result, /输入 1: string/);
	assert.match(result, /connectionId: source_conn_1/);
	assert.match(result, /inputPortId: source_text/);
	assert.match(result, /sourceNodeId: source_node_1/);
	assert.match(result, /sourceOutputPortId: value/);
	assert.match(result, /type: string/);
	assert.match(result, /title: 需求说明/);
	assert.match(result, /BEGIN_CANVAS_SOURCE_CONTENT source_artifact_/);
	assert.match(result, /这是一段画布来源文本。/);
	assert.match(result, /END_CANVAS_SOURCE_CONTENT source_artifact_/);
	assert.doesNotMatch(result, /sourceTaskId/);
	assert.doesNotMatch(result, /sourceRunId/);
	assert.doesNotMatch(result, /sourceAttemptId/);
});

test("formatBoundInputsForPrompt formats source file artifact metadata and deterministic content limit", () => {
	const longContent = "x".repeat(TEAM_TASK_ARTIFACT_CONTENT_LIMIT + 10);
	const input = makeSourceBoundInput({
		inputPortId: "source_md",
		artifact: buildTeamCanvasSourceArtifact({
			type: "md",
			sourceNodeId: "source_file_1",
			sourceOutputPortId: "value",
			title: "Markdown 文件",
			content: longContent,
			fileName: "brief.md",
			mimeType: "text/markdown",
			size: 512,
			storageRef: "asset://brief.md",
		}),
	});

	assert.equal(input.artifact.content?.length, TEAM_TASK_ARTIFACT_CONTENT_LIMIT);
	assert.equal(input.artifact.preview.length, TEAM_TASK_ARTIFACT_PREVIEW_LIMIT);
	const result = formatBoundInputsForPrompt([input]);
	assert.match(result, /sourceNodeId: source_file_1/);
	assert.match(result, /fileName: brief\.md/);
	assert.match(result, /mimeType: text\/markdown/);
	assert.match(result, /size: 512/);
	assert.match(result, /storageRef: asset:\/\/brief\.md/);
	assert.match(result, new RegExp(`x{${TEAM_TASK_ARTIFACT_CONTENT_LIMIT}}`));
	assert.doesNotMatch(result, new RegExp(`x{${TEAM_TASK_ARTIFACT_CONTENT_LIMIT + 1}}`));
});
