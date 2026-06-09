import type {
  TeamCanvasTask,
  TeamRunState,
  TeamAttemptMetadata,
  TeamTaskRunAnnotation,
  TeamTaskRunHistoryItem,
  TeamRoleRuntimeContext,
} from "../api/team-types";

export type TaskRunObserverFileKind = "worker" | "checker" | "result";

export interface TaskRunObserverFileDescriptor {
  key: string;
  attemptId: string;
  kind: TaskRunObserverFileKind;
  title: string;
  fileName: string;
  path: string;
  runtimeContext?: TeamRoleRuntimeContext;
  summary?: string;
}

export type RunHistoryAnalysisTask = Pick<TeamCanvasTask, "taskId" | "title">;

function fileNameFromRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  return ref.split("/").filter(Boolean).at(-1) ?? null;
}

function taskRunPhase(run: TeamRunState, taskId: string): string {
  return run.taskStates?.[taskId]?.progress.phase || run.status;
}

function taskRunMessage(run: TeamRunState, taskId: string): string {
  return run.taskStates?.[taskId]?.progress.message || "暂无阶段消息";
}

function taskRunResultRef(run: TeamRunState, taskId: string): string {
  return run.taskStates?.[taskId]?.resultRef ?? "无";
}

function taskRunErrorSummary(run: TeamRunState, taskId: string): string {
  return run.taskStates?.[taskId]?.errorSummary ?? "无";
}

export function selectLatestAttempt(attempts: TeamAttemptMetadata[]): TeamAttemptMetadata | null {
  if (attempts.length === 0) return null;
  return attempts.reduce((latest, attempt) => {
    const latestTime = Date.parse(latest.updatedAt || latest.createdAt);
    const attemptTime = Date.parse(attempt.updatedAt || attempt.createdAt);
    if (!Number.isFinite(attemptTime)) return latest;
    if (!Number.isFinite(latestTime)) return attempt;
    return attemptTime >= latestTime ? attempt : latest;
  }, attempts[0]);
}

export function defaultTaskRunAnnotation(runId: string, taskId: string): TeamTaskRunAnnotation {
  return {
    runId,
    taskId,
    best: false,
    archived: false,
    updatedAt: new Date().toISOString(),
  };
}

export function sortRunHistoryItems(items: TeamTaskRunHistoryItem[]): TeamTaskRunHistoryItem[] {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.run.createdAt);
    const bTime = Date.parse(b.run.createdAt);
    if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
    if (!Number.isFinite(aTime)) return 1;
    if (!Number.isFinite(bTime)) return -1;
    return bTime - aTime;
  });
}

export function mergeRunHistoryItems(
  apiItems: TeamTaskRunHistoryItem[],
  localRuns: TeamRunState[],
  taskId: string,
  includeArchived: boolean,
): TeamTaskRunHistoryItem[] {
  const byRunId = new Map<string, TeamTaskRunHistoryItem>();
  for (const item of apiItems) {
    const run = item?.run;
    if (!run || typeof run.runId !== "string" || !run.runId) continue;
    const annotation = item.annotation
      ? {
          ...defaultTaskRunAnnotation(run.runId, taskId),
          ...item.annotation,
          runId: run.runId,
          taskId: item.annotation.taskId || taskId,
        }
      : defaultTaskRunAnnotation(run.runId, taskId);
    byRunId.set(run.runId, { run, annotation });
  }
  for (const run of localRuns) {
    if (!run || typeof run.runId !== "string" || !run.runId) continue;
    if (byRunId.has(run.runId)) continue;
    byRunId.set(run.runId, {
      run,
      annotation: defaultTaskRunAnnotation(run.runId, taskId),
    });
  }
  const merged = sortRunHistoryItems([...byRunId.values()]);
  return includeArchived ? merged : merged.filter((item) => !item.annotation.archived);
}

export function buildRunHistoryAnalysisContext(
  task: RunHistoryAnalysisTask,
  run: TeamRunState,
  attempts: TeamAttemptMetadata[],
  fileDescriptors: TaskRunObserverFileDescriptor[],
): string {
  const latestAttempt = selectLatestAttempt(attempts);
  const fileLines = fileDescriptors.slice(0, 12).map((descriptor) =>
    `- ${descriptor.kind}: ${descriptor.fileName} (${descriptor.path})`
  );
  return [
    "# Historical Task Run Analysis Context",
    "",
    `Task: ${task.title}`,
    `Task ID: ${task.taskId}`,
    `Run ID: ${run.runId}`,
    `Run status: ${run.status}`,
    `Task status: ${run.taskStates?.[task.taskId]?.status ?? "unknown"}`,
    `Phase: ${taskRunPhase(run, task.taskId)}`,
    `Message: ${taskRunMessage(run, task.taskId)}`,
    `Created at: ${run.createdAt}`,
    `Started at: ${run.startedAt ?? "none"}`,
    `Finished at: ${run.finishedAt ?? "none"}`,
    `Result ref: ${taskRunResultRef(run, task.taskId)}`,
    `Error summary: ${taskRunErrorSummary(run, task.taskId)}`,
    `Attempts: ${attempts.length}`,
    latestAttempt ? `Latest attempt: ${latestAttempt.attemptId} (${latestAttempt.status}, ${latestAttempt.phase})` : "Latest attempt: none",
    "",
    "Files:",
    fileLines.length > 0 ? fileLines.join("\n") : "- none",
    "",
    "Please analyze this historical run, focusing on the failure cause, output quality, and recommended next action.",
  ].join("\n");
}

export function buildTaskRunFileDescriptors(attempts: TeamAttemptMetadata[]): TaskRunObserverFileDescriptor[] {
  const descriptors: TaskRunObserverFileDescriptor[] = [];
  for (const attempt of attempts) {
    const listedFiles = new Set(attempt.files);
    for (const worker of attempt.worker) {
      const fileName = fileNameFromRef(worker.outputRef);
      if (!fileName || !worker.outputRef || !listedFiles.has(fileName)) continue;
      descriptors.push({
        key: `${attempt.attemptId}:worker:${fileName}`,
        attemptId: attempt.attemptId,
        kind: "worker",
        title: `Worker 输出 #${worker.outputIndex}`,
        fileName,
        path: worker.outputRef,
        runtimeContext: worker.runtimeContext,
      });
    }
    for (const checker of attempt.checker) {
      const fileName = fileNameFromRef(checker.recordRef);
      if (!fileName || !checker.recordRef || !listedFiles.has(fileName)) continue;
      descriptors.push({
        key: `${attempt.attemptId}:checker:${fileName}`,
        attemptId: attempt.attemptId,
        kind: "checker",
        title: `Checker verdict #${checker.revisionIndex}`,
        fileName,
        path: checker.recordRef,
        runtimeContext: checker.runtimeContext,
        summary: `${checker.verdict}: ${checker.reason}`,
      });
    }
    const resultFileName = fileNameFromRef(attempt.resultRef);
    if (resultFileName && attempt.resultRef && listedFiles.has(resultFileName)) {
      descriptors.push({
        key: `${attempt.attemptId}:result:${resultFileName}`,
        attemptId: attempt.attemptId,
        kind: "result",
        title: resultFileName.includes("accepted") ? "Accepted result" : "Result",
        fileName: resultFileName,
        path: attempt.resultRef,
      });
    }
  }
  return descriptors;
}
