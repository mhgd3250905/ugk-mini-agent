import { generateSourceArtifactId, generateTaskArtifactId } from "./ids.js";
import type { TeamCanvasSourceArtifact, TeamCanvasSourceBoundInput, TeamTaskArtifactBoundInput, TeamTaskBoundInput, TeamTaskTypedArtifact } from "./types.js";

export const TEAM_TASK_ARTIFACT_CONTENT_LIMIT = 30_000;
export const TEAM_TASK_ARTIFACT_PREVIEW_LIMIT = 1_200;

export function buildTeamTaskTypedArtifact(input: {
	type: string;
	sourceTaskId: string;
	sourceRunId: string;
	sourceAttemptId: string;
	sourceOutputPortId: string;
	fileRef: string;
	content: string;
}): TeamTaskTypedArtifact {
	const content = input.content.slice(0, TEAM_TASK_ARTIFACT_CONTENT_LIMIT);
	const contentTruncated = input.content.length > TEAM_TASK_ARTIFACT_CONTENT_LIMIT;
	return {
		schemaVersion: "team/task-artifact-1",
		artifactId: generateTaskArtifactId(),
		type: input.type,
		sourceTaskId: input.sourceTaskId,
		sourceRunId: input.sourceRunId,
		sourceAttemptId: input.sourceAttemptId,
		sourceOutputPortId: input.sourceOutputPortId,
		fileRef: input.fileRef,
		preview: content.slice(0, TEAM_TASK_ARTIFACT_PREVIEW_LIMIT),
		...(content ? { content } : {}),
		...(contentTruncated ? { contentTruncated: true, originalContentLength: input.content.length } : {}),
		createdAt: new Date().toISOString(),
	};
}

export function buildTeamCanvasSourceArtifact(input: {
	type: string;
	sourceNodeId: string;
	sourceOutputPortId: string;
	title?: string;
	content?: string;
	fileName?: string;
	mimeType?: string;
	size?: number;
	storageRef?: string;
}): TeamCanvasSourceArtifact {
	const content = (input.content ?? "").slice(0, TEAM_TASK_ARTIFACT_CONTENT_LIMIT);
	return {
		schemaVersion: "team/source-artifact-1",
		artifactId: generateSourceArtifactId(),
		type: input.type,
		sourceNodeId: input.sourceNodeId,
		sourceOutputPortId: input.sourceOutputPortId,
		...(input.title ? { title: input.title } : {}),
		...(input.fileName ? { fileName: input.fileName } : {}),
		...(input.mimeType ? { mimeType: input.mimeType } : {}),
		...(input.size !== undefined ? { size: input.size } : {}),
		...(input.storageRef ? { storageRef: input.storageRef } : {}),
		preview: content.slice(0, TEAM_TASK_ARTIFACT_PREVIEW_LIMIT),
		...(content ? { content } : {}),
		createdAt: new Date().toISOString(),
	};
}

export function formatBoundInputsForPrompt(boundInputs: TeamTaskBoundInput[]): string {
	if (boundInputs.length === 0) return "";
	const blocks = boundInputs.map((input, index) => isCanvasSourceBoundInput(input)
		? formatSourceBoundInput(input, index)
		: formatTaskArtifactBoundInput(input, index));
	const hasSource = boundInputs.some(isCanvasSourceBoundInput);
	const hasTaskArtifact = boundInputs.some(input => !isCanvasSourceBoundInput(input));
	const heading = hasSource && hasTaskArtifact
		? "## 已绑定输入"
		: hasSource
			? "## 已绑定画布 source node 输入"
			: "## 已绑定上游 typed artifact 输入";
	const directive = hasTaskArtifact
		? "\n**重要**：typed artifact 的完整内容由 runtime 物化为当前 worker 工作目录下的文件。下方 BEGIN/END 只提供预览和追溯信息；执行任务时必须优先读取 workspaceFileRef / workspaceFilePath 指向的完整文件，不要从旧资产、文件库、workspace 残留或历史 run 中推断上游数据。"
		: "";
	return `${heading}${directive}\n${blocks.join("\n\n")}`;
}

function isCanvasSourceBoundInput(input: TeamTaskBoundInput): input is TeamCanvasSourceBoundInput {
	return input.source === "canvas-source";
}

function formatTaskArtifactBoundInput(input: TeamTaskArtifactBoundInput, index: number): string {
	const artifact = input.artifact;
	const content = artifact.content ?? artifact.preview;
	const delimiterId = artifact.artifactId;
	const lines = [
		`### 输入 ${index + 1}: ${artifact.type}`,
		`- connectionId: ${input.connectionId}`,
		`- inputPortId: ${input.inputPortId}`,
		`- artifactId: ${artifact.artifactId}`,
		`- sourceTaskId: ${artifact.sourceTaskId}`,
		`- sourceRunId: ${artifact.sourceRunId}`,
		`- sourceAttemptId: ${artifact.sourceAttemptId}`,
		`- sourceOutputPortId: ${artifact.sourceOutputPortId}`,
		`- fileRef: ${artifact.fileRef}`,
	];
	if (artifact.contentTruncated) lines.push("- contentTruncated: true");
	if (artifact.originalContentLength !== undefined) lines.push(`- originalContentLength: ${artifact.originalContentLength}`);
	if (artifact.workspaceFileRef) lines.push(`- workspaceFileRef: ${artifact.workspaceFileRef}`);
	if (artifact.workspaceFilePath) lines.push(`- workspaceFilePath: ${artifact.workspaceFilePath}`);
	lines.push(
		"",
		`BEGIN_TYPED_ARTIFACT_PREVIEW ${delimiterId}`,
		content,
		`END_TYPED_ARTIFACT_PREVIEW ${delimiterId}`,
	);
	return lines.join("\n");
}

function formatSourceBoundInput(input: TeamCanvasSourceBoundInput, index: number): string {
	const artifact = input.artifact;
	const content = artifact.content ?? artifact.preview;
	const lines = [
		`### 输入 ${index + 1}: ${artifact.type}`,
		"- source: canvas-source",
		`- connectionId: ${input.connectionId}`,
		`- inputPortId: ${input.inputPortId}`,
		`- artifactId: ${artifact.artifactId}`,
		`- sourceNodeId: ${artifact.sourceNodeId}`,
		`- sourceOutputPortId: ${artifact.sourceOutputPortId}`,
		`- type: ${artifact.type}`,
	];
	if (artifact.title) lines.push(`- title: ${artifact.title}`);
	if (artifact.fileName) lines.push(`- fileName: ${artifact.fileName}`);
	if (artifact.mimeType) lines.push(`- mimeType: ${artifact.mimeType}`);
	if (artifact.size !== undefined) lines.push(`- size: ${artifact.size}`);
	if (artifact.storageRef) lines.push(`- storageRef: ${artifact.storageRef}`);
	lines.push(
		"",
		`BEGIN_CANVAS_SOURCE_CONTENT ${artifact.artifactId}`,
		content,
		`END_CANVAS_SOURCE_CONTENT ${artifact.artifactId}`,
	);
	return lines.join("\n");
}
