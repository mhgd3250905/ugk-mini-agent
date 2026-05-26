import { generateTaskArtifactId } from "./ids.js";
import type { TeamTaskBoundInput, TeamTaskTypedArtifact } from "./types.js";

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
		createdAt: new Date().toISOString(),
	};
}

export function formatBoundInputsForPrompt(boundInputs: TeamTaskBoundInput[]): string {
	if (boundInputs.length === 0) return "";
	const blocks = boundInputs.map((input, index) => {
		const artifact = input.artifact;
		const content = artifact.content ?? artifact.preview;
		return [
			`### 输入 ${index + 1}: ${artifact.type}`,
			`- inputPortId: ${input.inputPortId}`,
			`- sourceTaskId: ${artifact.sourceTaskId}`,
			`- sourceRunId: ${artifact.sourceRunId}`,
			`- fileRef: ${artifact.fileRef}`,
			"",
			content,
		].join("\n");
	});
	return `## 已绑定上游 typed artifact 输入\n${blocks.join("\n\n")}`;
}
