import { copyFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { TeamTask, TeamTaskArtifactBoundInput, TeamTaskBoundInput } from "./types.js";

export interface MaterializeBoundInputFilesOptions {
	teamDataDir: string;
	runId: string;
	workDir: string;
}

interface MaterializedInputFile {
	index: number;
	artifactId: string;
	type: string;
	workspaceFileRef: string;
	workspaceFilePath: string;
	originalContentLength?: number;
}

export async function materializeBoundInputFilesForWorkspace(
	task: TeamTask,
	options: MaterializeBoundInputFilesOptions,
): Promise<TeamTask> {
	const boundInputs = readBoundInputs(task);
	if (boundInputs.length === 0) return task;

	const materializedFiles: MaterializedInputFile[] = [];
	const nextBoundInputs: TeamTaskBoundInput[] = [];
	for (let index = 0; index < boundInputs.length; index++) {
		const input = boundInputs[index]!;
		if (!isTaskArtifactBoundInput(input)) {
			nextBoundInputs.push(input);
			continue;
		}
		const nextInput = await materializeTaskArtifact(input, index, options);
		nextBoundInputs.push(nextInput);
		materializedFiles.push({
			index,
			artifactId: nextInput.artifact.artifactId,
			type: nextInput.artifact.type,
			workspaceFileRef: nextInput.artifact.workspaceFileRef!,
			workspaceFilePath: nextInput.artifact.workspaceFilePath!,
			originalContentLength: nextInput.artifact.originalContentLength,
		});
	}

	if (materializedFiles.length === 0) return task;
	const payload = { ...(task.input.payload ?? {}), boundInputs: nextBoundInputs };
	return {
		...task,
		input: {
			...task.input,
			text: appendMaterializedInputFileSection(task.input.text, materializedFiles),
			payload,
		},
	};
}

function readBoundInputs(task: TeamTask): TeamTaskBoundInput[] {
	const boundInputs = task.input.payload?.boundInputs;
	return Array.isArray(boundInputs) ? boundInputs as TeamTaskBoundInput[] : [];
}

function isTaskArtifactBoundInput(input: TeamTaskBoundInput): input is TeamTaskArtifactBoundInput {
	return input.source !== "canvas-source";
}

async function materializeTaskArtifact(
	input: TeamTaskArtifactBoundInput,
	index: number,
	options: MaterializeBoundInputFilesOptions,
): Promise<TeamTaskArtifactBoundInput> {
	const artifact = input.artifact;
	const sourceRunId = artifact.sourceRunId || options.runId;
	const sourcePath = join(options.teamDataDir, "runs", sourceRunId, artifact.fileRef);
	const fileName = `${String(index + 1).padStart(2, "0")}-${sanitizeFileName(artifact.artifactId)}-${sanitizeFileName(basename(artifact.fileRef) || "artifact.txt")}`;
	const workspaceFileRef = `bound-inputs/${fileName}`;
	const workspaceFilePath = join(options.workDir, "bound-inputs", fileName);
	await mkdir(join(options.workDir, "bound-inputs"), { recursive: true });
	await copyFile(sourcePath, workspaceFilePath);
	return {
		...input,
		artifact: {
			...artifact,
			workspaceFileRef,
			workspaceFilePath,
		},
	};
}

function appendMaterializedInputFileSection(text: string, files: MaterializedInputFile[]): string {
	const lines = [
		"## 完整绑定输入文件（最高优先级）",
		"下列文件由 runtime 从上游 typed artifact 复制到当前 worker 工作目录。若前文 BEGIN_TYPED_ARTIFACT_PREVIEW 或 payload.content 与这些文件冲突，必须以这些文件为准。JSON 输入必须读取文件，不得从预览片段重建。",
		...files.flatMap(file => [
			`- 输入 ${file.index + 1}: ${file.type}`,
			`  artifactId: ${file.artifactId}`,
			`  workspaceFileRef: ${file.workspaceFileRef}`,
			`  workspaceFilePath: ${file.workspaceFilePath}`,
			...(file.originalContentLength !== undefined ? [`  originalContentLength: ${file.originalContentLength}`] : []),
		]),
	];
	return `${text.trimEnd()}\n\n${lines.join("\n")}`;
}

function sanitizeFileName(value: string): string {
	const safe = value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
	return safe || "artifact";
}
