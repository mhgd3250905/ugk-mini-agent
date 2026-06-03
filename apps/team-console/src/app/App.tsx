import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { LiveTeamApi } from "../api/team-api";
import type { TeamCanvasSourceNode, TeamCanvasSourcePortType, TeamCanvasTask, TeamApiError, TeamRunState, TeamAttemptMetadata, TeamTaskRunAnnotation, TeamTaskRunHistoryItem, TeamTaskUpdateRequest, TeamRoleRuntimeContext, TeamAttemptRoleProcess, TeamAttemptRoleProcessRole, TeamAttemptRoleProcessStatus, TeamTaskInputPort, TeamTaskOutputPort } from "../api/team-types";
import { MockTeamApi } from "../fixtures/team-fixtures";
import { useTeamConsoleLiveData, type DataSource, type TeamConsoleUiResetReason, CLEAN_AGENT_WORKSPACE_ID, mergeTaskRun } from "./use-team-console-live-data";
import { useTaskBranchStack, type TaskBranchDetailMode, type TaskBranchGeneratedObserverState, type TaskBranchState } from "./use-task-branch-stack";
import { hasDirtyTaskEditConflict, useTaskEditState } from "./use-task-edit-state";
import { useTaskLeaderCopy } from "./use-task-leader-copy";
import { ExecutionMap, type AtlasAgentNode, type AtlasBranchLayoutState, type AtlasSelectedNodeEntry, type AtlasSourceNode, type AtlasTaskGroup, type AtlasTaskNode } from "../graph/ExecutionMap";
import { normalizeAtlasViewport, type AtlasViewport } from "../graph/AtlasCanvasShell";
import { RUN_STATUS_LABELS, isActiveRun } from "../shared/status";
import { renderTeamMarkdown } from "../shared/markdown";
import "./app.css";

const LIVE_AGENT_LAYOUT_STORAGE_KEY = "ugk-team-console:live-agent-layout:v1";
const LIVE_TASK_LAYOUT_STORAGE_KEY = "ugk-team-console:live-task-layout:v1";
const LIVE_SOURCE_LAYOUT_STORAGE_KEY = "ugk-team-console:live-source-layout:v1";
const CANVAS_UI_STATE_STORAGE_KEY = "ugk-team-console:canvas-ui-state:v1";
const CANVAS_UI_STATE_BY_CONTEXT_STORAGE_KEY = "ugk-team-console:canvas-ui-state-by-context:v1";
const DATA_SOURCE_STORAGE_KEY = "ugk-team-console:data-source";
const TEAM_CONSOLE_THEME_STORAGE_KEY = "ugk-team-console:theme:v1";
const TASK_RUN_PROCESS_LABELS: Record<TeamAttemptRoleProcessRole, string> = {
  worker: "Worker 过程",
  checker: "Checker 过程",
};
const PROCESS_CURRENT_ACTION_MAX_CHARS = 96;
const PROCESS_NARRATION_MAX_CHARS = 220;
const PROCESS_ASSISTANT_TEXT_MAX_LINES = 5;
const PROCESS_ASSISTANT_TEXT_MAX_LINE_CHARS = 200;
const DISCOVERY_QUEUE_INITIAL_CARD_LIMIT = 18;
const CANVAS_LOADING_MIN_VISIBLE_MS = 1000;

type AgentBranchMode = "chat" | "task-create";
type TeamConsoleTheme = "light" | "dark";
type DiscoveryGeneratedVisualState = "running" | "queued" | "done" | "failed" | "stale" | "idle";
type RootNodeFilter = "all" | "agent" | "task";

type AgentBranchState = {
  nodeId: string;
  agentId: string;
  mode: AgentBranchMode;
};

type StoredCanvasUiState = {
  schemaVersion: 1;
  dataSource: DataSource;
  selectedFixtureId?: string;
  viewport?: AtlasViewport;
  agentNodes?: StoredAgentNodePosition[];
  taskNodePositions?: StoredTaskPosition[];
  sourceNodePositions?: StoredSourcePosition[];
  taskGroups?: AtlasTaskGroup[];
  expandedAgentBranch?: AgentBranchState | null;
  expandedTaskBranches?: TaskBranchState[];
  branchLayout?: AtlasBranchLayoutState;
  minimizedAgentNodeIds?: string[];
  minimizedTaskNodeIds?: string[];
  minimizedSourceNodeIds?: string[];
  rootNodeFilter?: RootNodeFilter;
};

type StoredCanvasUiStateByContext = {
  schemaVersion: 1;
  states: Record<string, StoredCanvasUiState>;
};

type StoredAgentNodePosition = {
  agentId: string;
  position: { x: number; y: number };
};

type TaskConnectionDraft = {
  fromTaskId: string;
  fromOutputPortId: string;
  type: string;
};

type SourceConnectionDraft = {
  fromSourceNodeId: string;
  fromOutputPortId: string;
  type: string;
};

type StoredTaskPosition = {
  taskId: string;
  position: { x: number; y: number };
};

type StoredSourcePosition = {
  sourceNodeId: string;
  position: { x: number; y: number };
};

type TaskRunObserverFileKind = "worker" | "checker" | "result";

type TaskRunObserverFileDescriptor = {
  key: string;
  attemptId: string;
  kind: TaskRunObserverFileKind;
  title: string;
  fileName: string;
  path: string;
  runtimeContext?: TeamRoleRuntimeContext;
  summary?: string;
};

type TaskRunObserverFileState = {
  content?: string;
  error?: string;
};

type RunHistoryAnalysisTask = Pick<TeamCanvasTask, "taskId" | "title">;

type TaskRunObserverState = {
  loading: boolean;
  attempts: TeamAttemptMetadata[];
  files: Record<string, TaskRunObserverFileState>;
  error: string | null;
  lastUpdatedAt: string | null;
};

type TaskCloneDraft = {
  title: string;
  templateBindings: Record<string, string>;
};

type TaskParameterDraft = {
  templateBindings: Record<string, string>;
};

type RootArchiveConfirm =
  | { kind: "source"; sourceNodeId: string; nodeId: string; title: string }
  | { kind: "task"; task: TeamCanvasTask; nodeId: string }
  | { kind: "agent"; nodeId: string; agentId: string; name: string }
  | { kind: "batch"; items: Array<RootArchiveConfirm> };

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as TeamApiError).message);
  }
  if (error instanceof Error) return error.message;
  return "未知错误";
}

function fileNameFromRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  return ref.split("/").filter(Boolean).at(-1) ?? null;
}

function formatDurationMs(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "未知";
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}时${remainingMinutes}分` : `${hours}时`;
}

function elapsedText(startedAt: string | null | undefined, finishedAt: string | null | undefined): string {
  const start = Date.parse(startedAt ?? "");
  if (!Number.isFinite(start)) return "耗时 未知";
  const end = finishedAt ? Date.parse(finishedAt) : Date.now();
  const safeEnd = Number.isFinite(end) ? end : Date.now();
  return `耗时 ${formatDurationMs(safeEnd - start)}`;
}

function taskRunPhase(run: TeamRunState, taskId: string): string {
  return run.taskStates?.[taskId]?.progress.phase || run.status;
}

function taskRunMessage(run: TeamRunState, taskId: string): string {
  return run.taskStates?.[taskId]?.progress.message || "暂无阶段消息";
}

function taskRunAttempts(run: TeamRunState, taskId: string): number {
  return run.taskStates?.[taskId]?.attemptCount ?? 0;
}

function taskRunElapsed(run: TeamRunState): string {
  return elapsedText(run.startedAt ?? run.createdAt, run.finishedAt).replace(/^耗时\s*/, "");
}

function formatRunTimestamp(value: string | null | undefined, fallback = "未记录"): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function taskRunTriggerLabel(run: TeamRunState): string {
  const triggeredBy = run.source?.triggeredBy;
  if (!triggeredBy) return "手动";
  switch (triggeredBy.type) {
    case "task-connection": return "连接触发";
    case "task-dependency": return "依赖触发";
    case "discovery-generated-task": return "Discovery 生成";
    default: return "自动触发";
  }
}

function taskRunResultRef(run: TeamRunState, taskId: string): string {
  return run.taskStates?.[taskId]?.resultRef ?? "无";
}

function taskRunErrorSummary(run: TeamRunState, taskId: string): string {
  return run.taskStates?.[taskId]?.errorSummary ?? "无";
}

function defaultTaskRunAnnotation(runId: string, taskId: string): TeamTaskRunAnnotation {
  return {
    runId,
    taskId,
    best: false,
    archived: false,
    updatedAt: new Date().toISOString(),
  };
}

function sortRunHistoryItems(items: TeamTaskRunHistoryItem[]): TeamTaskRunHistoryItem[] {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.run.createdAt);
    const bTime = Date.parse(b.run.createdAt);
    if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
    if (!Number.isFinite(aTime)) return 1;
    if (!Number.isFinite(bTime)) return -1;
    return bTime - aTime;
  });
}

function mergeRunHistoryItems(
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

function buildRunHistoryAnalysisContext(
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

function formatRoleProcessStatus(status?: TeamAttemptRoleProcessStatus): string {
  switch (status) {
    case "running": return "执行中";
    case "succeeded": return "成功";
    case "failed": return "失败";
    case "cancelled": return "已取消";
    case "waiting":
    default: return "等待";
  }
}

function getLatestNarration(process: TeamAttemptRoleProcess["process"] | undefined): string {
  const narration = process?.narration ?? [];
  const latest = [...narration].reverse().find((item) => item.trim().length > 0);
  return latest ?? "暂无过程条目";
}

function truncateProcessSummaryText(value: string | null | undefined, maxChars: number): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

const SENTENCE_BREAK_RE = /(?<=[。？！；\n])/;

function formatAssistantText(raw: string): { lines: string[]; hiddenLineCount: number; truncatedLineCount: number } {
  const normalized = raw.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return { lines: [], hiddenLineCount: 0, truncatedLineCount: 0 };
  const hasRealBreak = normalized.includes("\n");
  const paragraphs = hasRealBreak
    ? normalized.split(/\n/)
    : normalized.length > 20
      ? normalized.split(SENTENCE_BREAK_RE).filter((s) => s.trim().length > 0)
      : [normalized];
  const maxChars = PROCESS_ASSISTANT_TEXT_MAX_LINE_CHARS;
  const lines: string[] = [];
  let truncatedLineCount = 0;
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length === 0) {
      if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
      continue;
    }
    if (trimmed.length > maxChars) {
      lines.push(`${trimmed.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`);
      truncatedLineCount++;
    } else {
      lines.push(trimmed);
    }
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  lines.reverse();
  while (lines.length > 0 && lines[0] === "") lines.shift();
  const maxLines = PROCESS_ASSISTANT_TEXT_MAX_LINES;
  if (lines.length <= maxLines) return { lines, hiddenLineCount: 0, truncatedLineCount };
  const visible = lines.slice(0, maxLines);
  return { lines: visible, hiddenLineCount: lines.length - maxLines, truncatedLineCount };
}

function selectLatestAttempt(attempts: TeamAttemptMetadata[]): TeamAttemptMetadata | null {
  if (attempts.length === 0) return null;
  return attempts.reduce((latest, attempt) => {
    const latestTime = Date.parse(latest.updatedAt || latest.createdAt);
    const attemptTime = Date.parse(attempt.updatedAt || attempt.createdAt);
    if (!Number.isFinite(attemptTime)) return latest;
    if (!Number.isFinite(latestTime)) return attempt;
    return attemptTime >= latestTime ? attempt : latest;
  }, attempts[0]);
}

function renderRoleProcessNode(
  role: TeamAttemptRoleProcessRole,
  roleProcess: TeamAttemptRoleProcess | undefined,
): ReactNode {
  const process = roleProcess?.process ?? null;
  const status = roleProcess?.status ?? "waiting";
  const assistantFormatted = roleProcess?.assistantText?.content
    ? formatAssistantText(roleProcess.assistantText.content)
    : null;
  const currentAction = truncateProcessSummaryText(process?.currentAction, PROCESS_CURRENT_ACTION_MAX_CHARS) || "等待过程数据";
  const latestNarration = truncateProcessSummaryText(getLatestNarration(process ?? undefined), PROCESS_NARRATION_MAX_CHARS);
  return (
    <section
      className={`emap-observer-node emap-observer-process-node ${role}`}
      data-process-role={role}
      aria-label={TASK_RUN_PROCESS_LABELS[role]}
    >
      <header className="emap-observer-node-head emap-observer-process-head">
        <span className="emap-observer-node-label">{TASK_RUN_PROCESS_LABELS[role]}</span>
        <span className={`emap-observer-process-status ${status}`}>{formatRoleProcessStatus(status)}</span>
      </header>
      <div className="emap-observer-process-top">
        {assistantFormatted && assistantFormatted.lines.length > 0 ? (
          <div className="emap-observer-process-assistant-text">
            <span className="emap-observer-process-assistant-label">Agent</span>
            {assistantFormatted.lines.map((line, i) => (
              line === ""
                ? <div key={i} className="emap-observer-process-assistant-spacer" />
                : <p key={i}>{line}</p>
            ))}
            {(assistantFormatted.hiddenLineCount > 0 || assistantFormatted.truncatedLineCount > 0) && (
              <span className="emap-observer-process-assistant-truncated">
                {[
                  assistantFormatted.hiddenLineCount > 0 ? `已隐藏 ${assistantFormatted.hiddenLineCount} 行` : null,
                  assistantFormatted.truncatedLineCount > 0 ? `已截断 ${assistantFormatted.truncatedLineCount} 长行` : null,
                ].filter(Boolean).join(" / ")}
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="emap-observer-process-line">
              <span>Current action</span>
              <strong>{currentAction}</strong>
            </div>
            <p className="emap-observer-process-narration">{latestNarration}</p>
          </>
        )}
      </div>
    </section>
  );
}

function fileFormatFromName(fileName: string): "json" | "markdown" | "text" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  return "text";
}

function renderJsonContent(content: string): ReactNode {
  let pretty: string;
  try {
    pretty = JSON.stringify(JSON.parse(content), null, 2);
  } catch (parseError) {
    return (
      <div className="emap-observer-file-detail-body">
        <div className="emap-observer-parse-error" role="status">
          JSON 解析失败: {parseError instanceof Error ? parseError.message : String(parseError)}
        </div>
        <pre className="task-run-detail-pre" data-file-format="json">{content}</pre>
      </div>
    );
  }
  return <pre className="task-run-detail-pre" data-file-format="json">{pretty}</pre>;
}

function renderMarkdownContent(content: string): ReactNode {
  const html = renderTeamMarkdown(content);
  return (
    <div
      className="team-md-content"
      data-file-format="markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function contentLooksLikeStructuredJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed !== null && (typeof parsed === "object" || Array.isArray(parsed));
  } catch {
    return false;
  }
}

function renderFileDetailContent(fileName: string, content: string): ReactNode {
  if (contentLooksLikeStructuredJson(content)) return renderJsonContent(content);
  const format = fileFormatFromName(fileName);
  if (format === "json") return renderJsonContent(content);
  if (format === "markdown") return renderMarkdownContent(content);
  return <pre className="task-run-detail-pre" data-file-format="text">{content}</pre>;
}

function buildTaskRunFileDescriptors(attempts: TeamAttemptMetadata[]): TaskRunObserverFileDescriptor[] {
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

function selectLatestRun(runs: TeamRunState[]): TeamRunState | null {
  if (!runs.length) return null;
  return runs.reduce((latest, run) => {
    const latestTime = Date.parse(latest.createdAt);
    const runTime = Date.parse(run.createdAt);
    if (!Number.isFinite(runTime)) return latest;
    if (!Number.isFinite(latestTime)) return run;
    return runTime >= latestTime ? run : latest;
  }, runs[0]);
}

function runTimeForOrdering(run: TeamRunState | null | undefined): number {
  if (!run) return Number.NEGATIVE_INFINITY;
  const finishedAt = Date.parse(run.finishedAt ?? "");
  if (Number.isFinite(finishedAt)) return finishedAt;
  const startedAt = Date.parse(run.startedAt ?? "");
  if (Number.isFinite(startedAt)) return startedAt;
  const createdAt = Date.parse(run.createdAt);
  return Number.isFinite(createdAt) ? createdAt : Number.NEGATIVE_INFINITY;
}

function selectActiveDiscoveryRootRun(
  discoveryTaskId: string,
  taskRunsByTaskId: Record<string, TeamRunState[]>,
): TeamRunState | null {
  return (taskRunsByTaskId[discoveryTaskId] ?? []).find((run) => isActiveRun(run.status)) ?? null;
}

function isGeneratedRunFromDiscoveryRun(run: TeamRunState, discoveryTaskId: string, discoveryRunId: string): boolean {
  return run.source?.triggeredBy?.type === "discovery-generated-task"
    && run.source.triggeredBy.discoveryTaskId === discoveryTaskId
    && run.source.triggeredBy.discoveryRunId === discoveryRunId;
}

function visibleDiscoveryGeneratedRuns(
  generatedTask: TeamCanvasTask,
  discoveryTaskId: string,
  activeDiscoveryRun: TeamRunState | null,
  taskRunsByTaskId: Record<string, TeamRunState[]>,
): TeamRunState[] {
  const runs = taskRunsByTaskId[generatedTask.taskId] ?? [];
  if (!activeDiscoveryRun) return runs;
  const generatedSourceRunId = generatedTask.generatedSource?.latestDiscoveryRunId;
  if (generatedSourceRunId !== activeDiscoveryRun.runId) return [];
  return runs.filter((run) => isGeneratedRunFromDiscoveryRun(run, discoveryTaskId, activeDiscoveryRun.runId));
}

function sortDiscoveryGeneratedTasksForSubcanvas(
  tasks: TeamCanvasTask[],
  taskRunsByTaskId: Record<string, TeamRunState[]>,
  discoveryTaskId: string,
  activeDiscoveryRun: TeamRunState | null,
): TeamCanvasTask[] {
  return [...tasks].sort((a, b) => {
    const aRuns = visibleDiscoveryGeneratedRuns(a, discoveryTaskId, activeDiscoveryRun, taskRunsByTaskId);
    const bRuns = visibleDiscoveryGeneratedRuns(b, discoveryTaskId, activeDiscoveryRun, taskRunsByTaskId);
    const aActiveRun = aRuns.find((run) => isActiveRun(run.status)) ?? null;
    const bActiveRun = bRuns.find((run) => isActiveRun(run.status)) ?? null;
    const aActive = Boolean(aActiveRun);
    const bActive = Boolean(bActiveRun);
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (aActive && bActive) {
      return runTimeForOrdering(bActiveRun) - runTimeForOrdering(aActiveRun);
    }
    const aLatest = selectLatestRun(aRuns);
    const bLatest = selectLatestRun(bRuns);
    const aHasTerminal = Boolean(aLatest && !isActiveRun(aLatest.status));
    const bHasTerminal = Boolean(bLatest && !isActiveRun(bLatest.status));
    if (aHasTerminal !== bHasTerminal) return aHasTerminal ? 1 : -1;
    if (aHasTerminal && bHasTerminal) {
      const diff = runTimeForOrdering(bLatest) - runTimeForOrdering(aLatest);
      if (diff !== 0) return diff;
    }
    const aDiscoveredAt = Date.parse(a.generatedSource?.latestDiscoveredAt ?? "");
    const bDiscoveredAt = Date.parse(b.generatedSource?.latestDiscoveredAt ?? "");
    if (Number.isFinite(aDiscoveredAt) || Number.isFinite(bDiscoveredAt)) {
      return (Number.isFinite(aDiscoveredAt) ? aDiscoveredAt : Number.NEGATIVE_INFINITY)
        - (Number.isFinite(bDiscoveredAt) ? bDiscoveredAt : Number.NEGATIVE_INFINITY);
    }
    return 0;
  });
}

function discoveryGeneratedVisualState(
  itemStatus: string,
  latestRun: TeamRunState | null,
  activeRun: TeamRunState | null,
  waitingForCurrentDiscoveryRun: boolean,
): DiscoveryGeneratedVisualState {
  if (activeRun) return "running";
  if (waitingForCurrentDiscoveryRun) return "queued";
  if (latestRun?.status === "failed" || latestRun?.status === "cancelled" || latestRun?.status === "completed_with_failures") {
    return "failed";
  }
  if (latestRun && !isActiveRun(latestRun.status)) return "done";
  if (itemStatus === "stale") return "stale";
  return "idle";
}

function playgroundBaseUrlPrefix(): string {
  const configured = import.meta.env.VITE_TEAM_CONSOLE_PLAYGROUND_BASE_URL;
  return typeof configured === "string" && configured.trim()
    ? configured.trim().replace(/\/+$/, "")
    : "";
}

function buildAgentPlaygroundUrl(agentId: string, mode: AgentBranchMode = "chat"): string {
  const params = new URLSearchParams({
    view: "chat",
    agentId,
    embed: "team-console",
  });
  if (mode === "task-create") {
    params.set("teamTaskMode", "create");
  }
  return `${playgroundBaseUrlPrefix()}/playground?${params.toString()}`;
}

function formatTaskLeaderContext(task: TeamCanvasTask): string {
  const wu = task.workUnit;
  const formatPorts = (ports: TeamTaskInputPort[] | TeamTaskOutputPort[] | undefined) => {
    if (!ports || ports.length === 0) return "- none";
    return ports.map((p) => `- ${p.id} [${p.type}] ${p.label ?? ""}`).join("\n");
  };
  const rulesText = wu.acceptance.rules.length > 0
    ? wu.acceptance.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
    : "- none";
  return [
    "Team Console 当前 Task 上下文",
    "",
    "请先理解这个 Task，不要运行 Task。我要修改它的定义/规则时，请基于 taskId 使用 /team-task 更新，并在写入前展示完整变更让我确认。",
    "",
    `taskId: ${task.taskId}`,
    `title: ${task.title}`,
    `status: ${task.status}`,
    `leaderAgentId: ${task.leaderAgentId}`,
    `workerAgentId: ${wu.workerAgentId}`,
    `checkerAgentId: ${wu.checkerAgentId}`,
    `teamTaskMode: edit`,
    `teamTaskId: ${task.taskId}`,
    "",
    "workUnit.input.text:",
    wu.input.text || "(empty)",
    "",
    "workUnit.inputPorts:",
    formatPorts(wu.inputPorts),
    "",
    "workUnit.outputPorts:",
    formatPorts(wu.outputPorts),
    "",
    "workUnit.outputContract.text:",
    wu.outputContract.text || "(empty)",
    "",
    "workUnit.acceptance.rules:",
    rulesText,
  ].join("\n");
}

function buildTaskLeaderPlaygroundUrl(task: TeamCanvasTask): string {
  const params = new URLSearchParams({
    view: "chat",
    agentId: task.leaderAgentId,
    embed: "team-console",
    teamTaskId: task.taskId,
    teamTaskMode: "edit",
  });
  return `${playgroundBaseUrlPrefix()}/playground?${params.toString()}`;
}

function taskMenuPanelId(nodeId: string): string {
  return `task-menu-${nodeId}`;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = typeof item === "string" ? item.trim() : "";
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function readStoredGeneratedObserver(value: unknown): TaskBranchGeneratedObserverState | undefined {
  const record = readRecord(value);
  if (!record) return undefined;
  const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
  const runId = typeof record.runId === "string" ? record.runId.trim() : "";
  if (!taskId || !runId) return undefined;
  const selectedFileKeys = readStringArray(record.selectedFileKeys);
  return {
    taskId,
    runId,
    ...(selectedFileKeys.length > 0 ? { selectedFileKeys } : {}),
  };
}

function readStoredViewport(value: unknown): AtlasViewport | undefined {
  const record = readRecord(value);
  if (!record) return undefined;
  const x = Number(record.x);
  const y = Number(record.y);
  const scale = Number(record.scale);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale) || scale <= 0) {
    return undefined;
  }
  return normalizeAtlasViewport({ x, y, scale });
}

function readStoredAgentBranch(value: unknown): AgentBranchState | null {
  const record = readRecord(value);
  if (!record) return null;
  const nodeId = typeof record.nodeId === "string" ? record.nodeId.trim() : "";
  const agentId = typeof record.agentId === "string" ? record.agentId.trim() : "";
  const mode = record.mode === "task-create" ? "task-create" : record.mode === "chat" ? "chat" : null;
  if (!nodeId || !agentId || !mode) return null;
  return { nodeId, agentId, mode };
}

function readStoredTaskBranches(value: unknown): TaskBranchState[] {
  if (!Array.isArray(value)) return [];
  const result: TaskBranchState[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = readRecord(item);
    if (!record) continue;
    const nodeId = typeof record.nodeId === "string" ? record.nodeId.trim() : "";
    const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
    if (!nodeId || !taskId || seen.has(nodeId)) continue;
    seen.add(nodeId);
    const rawDetailMode = record.detailMode;
    const detailMode: TaskBranchDetailMode | null =
      rawDetailMode === "leader-chat" || rawDetailMode === "edit" || rawDetailMode === "clone" || rawDetailMode === "parameters" || rawDetailMode === "run-history" || rawDetailMode === "run-observer" || rawDetailMode === "discovery-subcanvas"
        ? rawDetailMode
        : null;
    const observedRunId = typeof record.observedRunId === "string" && record.observedRunId.trim()
      ? record.observedRunId.trim()
      : undefined;
    const runHistoryTaskId = typeof record.runHistoryTaskId === "string" && record.runHistoryTaskId.trim()
      ? record.runHistoryTaskId.trim()
      : undefined;
    const selectedFileKeys = readStringArray(record.selectedFileKeys);
    const discoveryGeneratedObserver = readStoredGeneratedObserver(record.discoveryGeneratedObserver);
    const discoveryGeneratedEditTaskId = typeof record.discoveryGeneratedEditTaskId === "string" && record.discoveryGeneratedEditTaskId.trim()
      ? record.discoveryGeneratedEditTaskId.trim()
      : undefined;
    const discoveryQueueExpanded = record.discoveryQueueExpanded === true;
    result.push({
      nodeId,
      taskId,
      detailMode,
      ...(observedRunId ? { observedRunId } : {}),
      ...(runHistoryTaskId ? { runHistoryTaskId } : {}),
      ...(selectedFileKeys.length > 0 ? { selectedFileKeys } : {}),
      ...(discoveryGeneratedObserver ? { discoveryGeneratedObserver } : {}),
      ...(discoveryGeneratedEditTaskId ? { discoveryGeneratedEditTaskId } : {}),
      ...(discoveryQueueExpanded ? { discoveryQueueExpanded } : {}),
    });
  }
  return result;
}

function readStoredTaskGroups(value: unknown): AtlasTaskGroup[] {
  if (!Array.isArray(value)) return [];
  const result: AtlasTaskGroup[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = readRecord(item);
    if (!record) continue;
    const groupId = typeof record.groupId === "string" ? record.groupId.trim() : "";
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const taskNodeIds = readStringArray(record.taskNodeIds);
    if (!groupId || !title || taskNodeIds.length === 0 || seen.has(groupId)) continue;
    seen.add(groupId);
    result.push({
      groupId,
      title,
      taskNodeIds,
      collapsed: record.collapsed === true,
    });
  }
  return result;
}

function readStoredAgentNodePositions(value: unknown): StoredAgentNodePosition[] {
  if (!Array.isArray(value)) return [];
  const result: StoredAgentNodePosition[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = item as { agentId?: unknown; position?: { x?: unknown; y?: unknown } };
    const agentId = typeof record.agentId === "string" ? record.agentId.trim() : "";
    const x = Number(record.position?.x);
    const y = Number(record.position?.y);
    if (!agentId || seen.has(agentId) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    seen.add(agentId);
    result.push({ agentId, position: { x, y } });
  }
  return result;
}

function readStoredTaskNodePositions(value: unknown): StoredTaskPosition[] {
  if (!Array.isArray(value)) return [];
  const result: StoredTaskPosition[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = item as { taskId?: unknown; position?: { x?: unknown; y?: unknown } };
    const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
    const x = Number(record.position?.x);
    const y = Number(record.position?.y);
    if (!taskId || seen.has(taskId) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    seen.add(taskId);
    result.push({ taskId, position: { x, y } });
  }
  return result;
}

function readStoredSourceNodePositions(value: unknown): StoredSourcePosition[] {
  if (!Array.isArray(value)) return [];
  const result: StoredSourcePosition[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = item as { sourceNodeId?: unknown; position?: { x?: unknown; y?: unknown } };
    const sourceNodeId = typeof record.sourceNodeId === "string" ? record.sourceNodeId.trim() : "";
    const x = Number(record.position?.x);
    const y = Number(record.position?.y);
    if (!sourceNodeId || seen.has(sourceNodeId) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    seen.add(sourceNodeId);
    result.push({ sourceNodeId, position: { x, y } });
  }
  return result;
}

function readStoredPositionMap(value: unknown): Record<string, { x: number; y: number }> {
  const record = readRecord(value);
  if (!record) return {};
  const result: Record<string, { x: number; y: number }> = {};
  for (const [key, raw] of Object.entries(record)) {
    const item = readRecord(raw);
    const x = Number(item?.x);
    const y = Number(item?.y);
    if (!key || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    result[key] = { x, y };
  }
  return result;
}

function readStoredSizeMap(value: unknown): Record<string, { width: number; height: number }> {
  const record = readRecord(value);
  if (!record) return {};
  const result: Record<string, { width: number; height: number }> = {};
  for (const [key, raw] of Object.entries(record)) {
    const item = readRecord(raw);
    const width = Number(item?.width);
    const height = Number(item?.height);
    if (!key || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
    result[key] = { width, height };
  }
  return result;
}

function readStoredRectMap(value: unknown): NonNullable<AtlasBranchLayoutState["agentBranchRects"]> {
  const record = readRecord(value);
  if (!record) return {};
  const result: NonNullable<AtlasBranchLayoutState["agentBranchRects"]> = {};
  for (const [key, raw] of Object.entries(record)) {
    const item = readRecord(raw);
    const x = Number(item?.x);
    const y = Number(item?.y);
    const width = Number(item?.width);
    const height = Number(item?.height);
    if (!key || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
    result[key] = { x, y, width, height };
  }
  return result;
}

function readStoredBranchLayout(value: unknown): AtlasBranchLayoutState {
  const record = readRecord(value);
  if (!record) return {};
  return {
    agentBranchRects: readStoredRectMap(record.agentBranchRects),
    taskBranchPositions: readStoredPositionMap(record.taskBranchPositions),
    taskChildPanelPositions: readStoredPositionMap(record.taskChildPanelPositions),
    taskChildPanelSizes: readStoredSizeMap(record.taskChildPanelSizes),
  };
}

function canvasUiContextKeyFor(dataSource: DataSource, selectedFixtureId: string): string {
  return dataSource === "mock" ? `mock:${selectedFixtureId}` : "live";
}

function parseStoredCanvasUiState(value: unknown): StoredCanvasUiState | null {
  const parsed = readRecord(value);
  if (!parsed || parsed.schemaVersion !== 1) return null;
  const dataSource = parsed.dataSource === "live" ? "live" : parsed.dataSource === "mock" ? "mock" : null;
  if (!dataSource) return null;
  const selectedFixtureId = typeof parsed.selectedFixtureId === "string" ? parsed.selectedFixtureId : undefined;
  const viewport = readStoredViewport(parsed.viewport);
  return {
    schemaVersion: 1,
    dataSource,
    ...(selectedFixtureId ? { selectedFixtureId } : {}),
    ...(viewport ? { viewport } : {}),
    agentNodes: readStoredAgentNodePositions(parsed.agentNodes),
    taskNodePositions: readStoredTaskNodePositions(parsed.taskNodePositions),
    sourceNodePositions: readStoredSourceNodePositions(parsed.sourceNodePositions),
    taskGroups: readStoredTaskGroups(parsed.taskGroups),
    expandedAgentBranch: readStoredAgentBranch(parsed.expandedAgentBranch),
    expandedTaskBranches: readStoredTaskBranches(parsed.expandedTaskBranches),
    branchLayout: readStoredBranchLayout(parsed.branchLayout),
    minimizedAgentNodeIds: readStringArray(parsed.minimizedAgentNodeIds),
    minimizedTaskNodeIds: readStringArray(parsed.minimizedTaskNodeIds),
    minimizedSourceNodeIds: readStringArray(parsed.minimizedSourceNodeIds),
    rootNodeFilter: parsed.rootNodeFilter === "agent" || parsed.rootNodeFilter === "task" ? parsed.rootNodeFilter : undefined,
  };
}

function parseStoredCanvasUiStateByContext(value: unknown): StoredCanvasUiStateByContext {
  const parsed = readRecord(value);
  if (!parsed || parsed.schemaVersion !== 1) return { schemaVersion: 1, states: {} };
  const rawStates = readRecord(parsed.states);
  if (!rawStates) return { schemaVersion: 1, states: {} };
  const states: Record<string, StoredCanvasUiState> = {};
  for (const [key, value] of Object.entries(rawStates)) {
    const state = parseStoredCanvasUiState(value);
    if (state && canvasUiContextMatches(state, state.dataSource, state.selectedFixtureId ?? CLEAN_AGENT_WORKSPACE_ID)) {
      states[key] = state;
    }
  }
  return { schemaVersion: 1, states };
}

function readStoredCanvasUiStateByContext(): StoredCanvasUiStateByContext {
  try {
    const raw = globalThis.localStorage?.getItem(CANVAS_UI_STATE_BY_CONTEXT_STORAGE_KEY);
    if (!raw) return { schemaVersion: 1, states: {} };
    return parseStoredCanvasUiStateByContext(JSON.parse(raw));
  } catch {
    return { schemaVersion: 1, states: {} };
  }
}

function mergeCanvasUiStateByContext(
  localState: StoredCanvasUiStateByContext,
  sharedState: StoredCanvasUiStateByContext | null,
): StoredCanvasUiStateByContext {
  if (!sharedState) return localState;
  return {
    schemaVersion: 1,
    states: {
      ...localState.states,
      ...sharedState.states,
    },
  };
}

function readStoredCanvasUiState(
  dataSource: DataSource,
  selectedFixtureId: string,
  sharedState: StoredCanvasUiStateByContext | null = null,
): StoredCanvasUiState | null {
  const contextKey = canvasUiContextKeyFor(dataSource, selectedFixtureId);
  const byContext = mergeCanvasUiStateByContext(readStoredCanvasUiStateByContext(), sharedState);
  const scopedState = byContext.states[contextKey];
  if (scopedState && canvasUiContextMatches(scopedState, dataSource, selectedFixtureId)) {
    return scopedState;
  }

  try {
    const raw = globalThis.localStorage?.getItem(CANVAS_UI_STATE_STORAGE_KEY);
    if (!raw) return null;
    const legacyState = parseStoredCanvasUiState(JSON.parse(raw));
    if (!legacyState || !canvasUiContextMatches(legacyState, dataSource, selectedFixtureId)) return null;
    return legacyState;
  } catch {
    return null;
  }
}

function readStoredInitialDataSource(): DataSource {
  try {
    return globalThis.localStorage?.getItem(DATA_SOURCE_STORAGE_KEY) === "live" ? "live" : "mock";
  } catch {
    return "mock";
  }
}

function readInitialRootNodeFilter(): RootNodeFilter {
  const dataSource = readStoredInitialDataSource();
  const state = readStoredCanvasUiState(dataSource, CLEAN_AGENT_WORKSPACE_ID);
  return state?.rootNodeFilter ?? "all";
}

function useMinimumVisibleFlag(active: boolean, minVisibleMs: number): boolean {
  const [visible, setVisible] = useState(active && minVisibleMs > 0);
  const visibleSinceRef = useRef<number | null>(active && minVisibleMs > 0 ? Date.now() : null);

  useEffect(() => {
    if (active) {
      visibleSinceRef.current = minVisibleMs > 0 ? Date.now() : null;
      setVisible(minVisibleMs > 0);
      return undefined;
    }

    if (!visible) return undefined;

    const visibleSince = visibleSinceRef.current ?? Date.now();
    const remainingMs = Math.max(0, minVisibleMs - (Date.now() - visibleSince));
    const timer = globalThis.setTimeout(() => {
      visibleSinceRef.current = null;
      setVisible(false);
    }, remainingMs);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [active, minVisibleMs, visible]);

  return visible;
}

function writeStoredCanvasUiState(state: StoredCanvasUiState): StoredCanvasUiStateByContext | null {
  try {
    globalThis.localStorage?.setItem(CANVAS_UI_STATE_STORAGE_KEY, JSON.stringify(state));
    const contextKey = canvasUiContextKeyFor(state.dataSource, state.selectedFixtureId ?? CLEAN_AGENT_WORKSPACE_ID);
    const byContext = readStoredCanvasUiStateByContext();
    byContext.states[contextKey] = state;
    globalThis.localStorage?.setItem(CANVAS_UI_STATE_BY_CONTEXT_STORAGE_KEY, JSON.stringify(byContext));
    return byContext;
  } catch {
    return null;
  }
}

function canvasUiContextMatches(state: StoredCanvasUiState, dataSource: DataSource, selectedFixtureId: string): boolean {
  if (state.dataSource !== dataSource) return false;
  if (dataSource === "mock") {
    return (state.selectedFixtureId ?? CLEAN_AGENT_WORKSPACE_ID) === selectedFixtureId;
  }
  return true;
}

function readStoredLiveAgentNodes(): AtlasAgentNode[] {
  try {
    const raw = globalThis.localStorage?.getItem(LIVE_AGENT_LAYOUT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const rawNodes = Array.isArray((parsed as { nodes?: unknown }).nodes)
      ? (parsed as { nodes: unknown[] }).nodes
      : [];
    const seen = new Set<string>();
    const nodes: AtlasAgentNode[] = [];
    for (const item of rawNodes) {
      const record = item as { agentId?: unknown; x?: unknown; y?: unknown };
      const agentId = typeof record.agentId === "string" ? record.agentId.trim() : "";
      const x = Number(record.x);
      const y = Number(record.y);
      if (!agentId || seen.has(agentId) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      seen.add(agentId);
      nodes.push({
        nodeId: `agent-${agentId}`,
        kind: "agent",
        agentId,
        position: { x, y },
      });
    }
    return nodes;
  } catch {
    return [];
  }
}

function writeStoredLiveAgentNodes(nodes: AtlasAgentNode[]) {
  try {
    globalThis.localStorage?.setItem(LIVE_AGENT_LAYOUT_STORAGE_KEY, JSON.stringify({
      version: 1,
      nodes: nodes.map((node) => ({
        agentId: node.agentId,
        x: node.position.x,
        y: node.position.y,
      })),
    }));
  } catch {}
}

function readStoredLiveTaskPositions(): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  try {
    const raw = globalThis.localStorage?.getItem(LIVE_TASK_LAYOUT_STORAGE_KEY);
    if (!raw) return positions;
    const parsed = JSON.parse(raw) as { schemaVersion?: unknown; tasks?: unknown };
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.tasks)) return positions;
    for (const item of parsed.tasks) {
      const record = item as { taskId?: unknown; position?: { x?: unknown; y?: unknown } };
      const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
      const x = Number(record.position?.x);
      const y = Number(record.position?.y);
      if (!taskId || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      positions.set(taskId, { x, y });
    }
  } catch {}
  return positions;
}

function writeStoredLiveTaskNodes(nodes: AtlasTaskNode[]) {
  try {
    const tasks: StoredTaskPosition[] = nodes.map((node) => ({
      taskId: node.taskId,
      position: { x: node.position.x, y: node.position.y },
    }));
    globalThis.localStorage?.setItem(LIVE_TASK_LAYOUT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      tasks,
    }));
  } catch {}
}

function liveTaskRefreshPositions(currentNodes: AtlasTaskNode[]): Map<string, { x: number; y: number }> {
  const positions = readStoredLiveTaskPositions();
  for (const node of currentNodes) {
    positions.set(node.taskId, { x: node.position.x, y: node.position.y });
  }
  return positions;
}

function readStoredLiveSourcePositions(): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  try {
    const raw = globalThis.localStorage?.getItem(LIVE_SOURCE_LAYOUT_STORAGE_KEY);
    if (!raw) return positions;
    const parsed = JSON.parse(raw) as { schemaVersion?: unknown; sources?: unknown };
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.sources)) return positions;
    for (const item of parsed.sources) {
      const record = item as { sourceNodeId?: unknown; position?: { x?: unknown; y?: unknown } };
      const sourceNodeId = typeof record.sourceNodeId === "string" ? record.sourceNodeId.trim() : "";
      const x = Number(record.position?.x);
      const y = Number(record.position?.y);
      if (!sourceNodeId || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      positions.set(sourceNodeId, { x, y });
    }
  } catch {}
  return positions;
}

function writeStoredLiveSourceNodes(nodes: AtlasSourceNode[]) {
  try {
    const sources: StoredSourcePosition[] = nodes.map((node) => ({
      sourceNodeId: node.sourceNodeId,
      position: { x: node.position.x, y: node.position.y },
    }));
    globalThis.localStorage?.setItem(LIVE_SOURCE_LAYOUT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      sources,
    }));
  } catch {}
}

function liveSourceRefreshPositions(currentNodes: AtlasSourceNode[]): Map<string, { x: number; y: number }> {
  const positions = readStoredLiveSourcePositions();
  for (const node of currentNodes) {
    positions.set(node.sourceNodeId, { x: node.position.x, y: node.position.y });
  }
  return positions;
}

function makeTaskNode(
  task: TeamCanvasTask,
  index: number,
  storedPosition?: { x: number; y: number },
): AtlasTaskNode {
  return {
    nodeId: `task-node-${task.taskId}`,
    kind: "canvas-task",
    taskId: task.taskId,
    position: storedPosition ?? {
      x: 280 + (index % 3) * 320,
      y: 220 + Math.floor(index / 3) * 180,
    },
  };
}

function makeTaskNodes(tasks: TeamCanvasTask[], storedPositions = new Map<string, { x: number; y: number }>()): AtlasTaskNode[] {
  return tasks.map((task, index) => makeTaskNode(task, index, storedPositions.get(task.taskId)));
}

function makeSourceNode(
  sourceNode: TeamCanvasSourceNode,
  index: number,
  storedPosition?: { x: number; y: number },
): AtlasSourceNode {
  return {
    nodeId: `source-node-${sourceNode.sourceNodeId}`,
    kind: "canvas-source",
    sourceNodeId: sourceNode.sourceNodeId,
    position: storedPosition ?? {
      x: 280 + (index % 3) * 320,
      y: 34 + Math.floor(index / 3) * 180,
    },
  };
}

function makeSourceNodes(sources: TeamCanvasSourceNode[], storedPositions = new Map<string, { x: number; y: number }>()): AtlasSourceNode[] {
  return sources.map((source, index) => makeSourceNode(source, index, storedPositions.get(source.sourceNodeId)));
}

function inferSourceFileType(file: File): TeamCanvasSourcePortType {
  const name = file.name.toLowerCase();
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "md";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".html") || name.endsWith(".htm")) return "html";
  if (name.endsWith(".txt") || file.type.startsWith("text/")) return "string";
  return "file";
}

function makeAgentNode(agentId: string, index: number): AtlasAgentNode {
  return {
    nodeId: `agent-${agentId}`,
    kind: "agent",
    agentId,
    position: { x: 360 + index * 320, y: 0 },
  };
}

function readStoredTheme(): TeamConsoleTheme {
  try {
    const value = globalThis.localStorage?.getItem(TEAM_CONSOLE_THEME_STORAGE_KEY);
    return value === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function storeTheme(theme: TeamConsoleTheme): void {
  try {
    globalThis.localStorage?.setItem(TEAM_CONSOLE_THEME_STORAGE_KEY, theme);
  } catch {
    // Theme persistence is best-effort; the UI state still updates in memory.
  }
}

function sameAgentNodes(left: AtlasAgentNode[], right: AtlasAgentNode[]): boolean {
  return left.length === right.length
    && left.every((node, index) => {
      const other = right[index];
      return other
        && node.nodeId === other.nodeId
        && node.agentId === other.agentId
        && node.position.x === other.position.x
        && node.position.y === other.position.y;
    });
}

function sameTaskNodes(left: AtlasTaskNode[], right: AtlasTaskNode[]): boolean {
  return left.length === right.length
    && left.every((node, index) => {
      const other = right[index];
      return other
        && node.nodeId === other.nodeId
        && node.taskId === other.taskId
        && node.position.x === other.position.x
        && node.position.y === other.position.y;
    });
}

function sameSourceNodes(left: AtlasSourceNode[], right: AtlasSourceNode[]): boolean {
  return left.length === right.length
    && left.every((node, index) => {
      const other = right[index];
      return other
        && node.nodeId === other.nodeId
        && node.sourceNodeId === other.sourceNodeId
        && node.position.x === other.position.x
        && node.position.y === other.position.y;
    });
}

function mergeStoredAgentNodes(agentNodes: AtlasAgentNode[], storedNodes: StoredAgentNodePosition[] | undefined, agentsById: Map<string, unknown>): AtlasAgentNode[] {
  if (!storedNodes?.length) return agentNodes;
  const byAgentId = new Map(agentNodes.map((node) => [node.agentId, node]));
  const nextNodes = [...agentNodes];
  for (const stored of storedNodes) {
    if (!agentsById.has(stored.agentId)) continue;
    const existingIndex = nextNodes.findIndex((node) => node.agentId === stored.agentId);
    if (existingIndex >= 0) {
      nextNodes[existingIndex] = { ...nextNodes[existingIndex]!, position: stored.position };
      continue;
    }
    if (!byAgentId.has(stored.agentId)) {
      nextNodes.push({
        nodeId: `agent-${stored.agentId}`,
        kind: "agent",
        agentId: stored.agentId,
        position: stored.position,
      });
    }
  }
  return nextNodes;
}

function mergeStoredTaskNodePositions(taskNodes: AtlasTaskNode[], storedPositions: StoredTaskPosition[] | undefined): AtlasTaskNode[] {
  if (!storedPositions?.length) return taskNodes;
  const positions = new Map(storedPositions.map((item) => [item.taskId, item.position]));
  return taskNodes.map((node) => {
    const position = positions.get(node.taskId);
    return position ? { ...node, position } : node;
  });
}

function mergeStoredSourceNodePositions(sourceNodes: AtlasSourceNode[], storedPositions: StoredSourcePosition[] | undefined): AtlasSourceNode[] {
  if (!storedPositions?.length) return sourceNodes;
  const positions = new Map(storedPositions.map((item) => [item.sourceNodeId, item.position]));
  return sourceNodes.map((node) => {
    const position = positions.get(node.sourceNodeId);
    return position ? { ...node, position } : node;
  });
}

function templateBindingsForTask(task: TeamCanvasTask): Record<string, string> {
  return Object.fromEntries(
    (task.templateConfig?.parameters ?? []).map((parameter) => [
      parameter.id,
      task.templateState?.currentBindings?.[parameter.id] ?? parameter.defaultValue ?? "",
    ]),
  );
}

function hasMissingRequiredTemplateBindings(task: TeamCanvasTask, bindings = templateBindingsForTask(task)): boolean {
  return (task.templateConfig?.parameters ?? []).some((parameter) =>
    parameter.required !== false && !(bindings[parameter.id] ?? "").trim()
  );
}

function normalizedTemplateBindings(task: TeamCanvasTask, bindings: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    (task.templateConfig?.parameters ?? []).flatMap((parameter) => {
      const value = (bindings[parameter.id] ?? "").trim();
      return value ? [[parameter.id, value]] : [];
    }),
  );
}

export function App() {
  const initialDataSourceRef = useRef<DataSource>(readStoredInitialDataSource());
  const [theme, setTheme] = useState<TeamConsoleTheme>(() => readStoredTheme());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [agentNodes, setAgentNodes] = useState<AtlasAgentNode[]>([]);
  const [liveAgentNodesHydrated, setLiveAgentNodesHydrated] = useState(false);
  const [taskConnectionDraft, setTaskConnectionDraft] = useState<TaskConnectionDraft | null>(null);
  const [taskDependencyDraft, setTaskDependencyDraft] = useState<{ fromTaskId: string } | null>(null);
  const [sourceConnectionDraft, setSourceConnectionDraft] = useState<SourceConnectionDraft | null>(null);
  const [taskRunSavingByTaskId, setTaskRunSavingByTaskId] = useState<Record<string, boolean>>({});
  const [generatedResetSavingByTaskId, setGeneratedResetSavingByTaskId] = useState<Record<string, boolean>>({});
  const [generatedArchiveConfirmTaskId, setGeneratedArchiveConfirmTaskId] = useState<string | null>(null);
  const [generatedArchiveSavingByTaskId, setGeneratedArchiveSavingByTaskId] = useState<Record<string, boolean>>({});
  const [generatedActionMenuTaskId, setGeneratedActionMenuTaskId] = useState<string | null>(null);
  const [taskRunObserverByRunId, setTaskRunObserverByRunId] = useState<Record<string, TaskRunObserverState>>({});
  const [runHistoryTaskId, setRunHistoryTaskId] = useState<string | null>(null);
  const [runHistoryItems, setRunHistoryItems] = useState<TeamTaskRunHistoryItem[]>([]);
  const [runHistoryTotal, setRunHistoryTotal] = useState(0);
  const [runHistoryIncludeArchived, setRunHistoryIncludeArchived] = useState(false);
  const [runHistoryLoading, setRunHistoryLoading] = useState(false);
  const [runHistoryError, setRunHistoryError] = useState<string | null>(null);
  const [selectedRunHistoryRunId, setSelectedRunHistoryRunId] = useState<string | null>(null);
  const [runHistorySavingRunId, setRunHistorySavingRunId] = useState<string | null>(null);
  const [runHistoryAnalysisCopyState, setRunHistoryAnalysisCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [runHistoryAnalysisManualText, setRunHistoryAnalysisManualText] = useState<string | null>(null);
  const [taskNodes, setTaskNodes] = useState<AtlasTaskNode[]>([]);
  const [taskGroups, setTaskGroups] = useState<AtlasTaskGroup[]>([]);
  const [selectedAtlasEntries, setSelectedAtlasEntries] = useState<AtlasSelectedNodeEntry[]>([]);
  const [taskCloneDraftByTaskId, setTaskCloneDraftByTaskId] = useState<Record<string, TaskCloneDraft>>({});
  const [taskCloneSavingByTaskId, setTaskCloneSavingByTaskId] = useState<Record<string, boolean>>({});
  const [taskParameterDraftByTaskId, setTaskParameterDraftByTaskId] = useState<Record<string, TaskParameterDraft>>({});
  const [taskParameterSavingByTaskId, setTaskParameterSavingByTaskId] = useState<Record<string, boolean>>({});
  const [liveTaskNodesHydrated, setLiveTaskNodesHydrated] = useState(false);
  const [sourceAtlasNodes, setSourceAtlasNodes] = useState<AtlasSourceNode[]>([]);
  const [liveSourceNodesHydrated, setLiveSourceNodesHydrated] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [taskLeaderPickerOpen, setTaskLeaderPickerOpen] = useState(false);
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null);
  const runHistoryAnalysisManualCopyRef = useRef<HTMLTextAreaElement | null>(null);
  const [canvasViewport, setCanvasViewport] = useState<AtlasViewport>({ x: 0, y: 0, scale: 1 });
  const [expandedAgentBranch, setExpandedAgentBranch] = useState<AgentBranchState | null>(null);
  const [canvasBranchLayout, setCanvasBranchLayout] = useState<AtlasBranchLayoutState>({});
  const updateCanvasBranchLayout = useCallback((layout: AtlasBranchLayoutState) => {
    setCanvasBranchLayout((current) => (
      JSON.stringify(current) === JSON.stringify(layout) ? current : layout
    ));
  }, []);
  const [minimizedAgentNodeIds, setMinimizedAgentNodeIds] = useState<string[]>([]);
  const [minimizedTaskNodeIds, setMinimizedTaskNodeIds] = useState<string[]>([]);
  const [minimizedSourceNodeIds, setMinimizedSourceNodeIds] = useState<string[]>([]);

  useEffect(() => {
    if (runHistoryAnalysisCopyState !== "failed" || !runHistoryAnalysisManualText) return;
    runHistoryAnalysisManualCopyRef.current?.focus();
    runHistoryAnalysisManualCopyRef.current?.select();
  }, [runHistoryAnalysisCopyState, runHistoryAnalysisManualText]);
  const [canvasUiStateHydrated, setCanvasUiStateHydrated] = useState(false);
  const [canvasUiStateRestoreHasStoredState, setCanvasUiStateRestoreHasStoredState] = useState(
    () => readStoredCanvasUiState(readStoredInitialDataSource(), CLEAN_AGENT_WORKSPACE_ID) !== null,
  );
  const [sharedCanvasUiState, setSharedCanvasUiState] = useState<StoredCanvasUiStateByContext | null>(null);
  const [sharedCanvasUiStateLoaded, setSharedCanvasUiStateLoaded] = useState(false);
  const sharedCanvasUiStateSaveTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const {
    taskEditDraftByTaskId,
    taskEditSavingByTaskId,
    taskEditWarningByTaskId,
    openTaskEditDraft,
    updateTaskEditDraft,
    replaceTaskEditDraft,
    clearTaskEditState,
    clearTaskEditWarning,
    setTaskEditWarning,
    setTaskEditSaving,
  } = useTaskEditState();
  const [taskArchiveConfirmNodeId, setTaskArchiveConfirmNodeId] = useState<string | null>(null);
  const [taskArchiveSavingNodeId, setTaskArchiveSavingNodeId] = useState<string | null>(null);
  const [rootArchiveConfirm, setRootArchiveConfirm] = useState<RootArchiveConfirm | null>(null);
  const [rootArchiveSaving, setRootArchiveSaving] = useState(false);
  const [rootNodeFilter, setRootNodeFilter] = useState<RootNodeFilter>(() => readInitialRootNodeFilter());
  const {
    taskLeaderCopyByTaskId,
    copyTaskLeaderContext,
    clearTaskLeaderCopy,
    registerTaskLeaderManualCopyRef,
  } = useTaskLeaderCopy();

  const clearTaskCloneState = useCallback((taskId?: string) => {
    if (!taskId) {
      setTaskCloneDraftByTaskId({});
      setTaskCloneSavingByTaskId({});
      return;
    }
    setTaskCloneDraftByTaskId((current) => {
      if (!(taskId in current)) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    setTaskCloneSavingByTaskId((current) => {
      if (!(taskId in current)) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }, []);

  const clearTaskParameterState = useCallback((taskId?: string) => {
    if (!taskId) {
      setTaskParameterDraftByTaskId({});
      setTaskParameterSavingByTaskId({});
      return;
    }
    setTaskParameterDraftByTaskId((current) => {
      if (!(taskId in current)) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    setTaskParameterSavingByTaskId((current) => {
      if (!(taskId in current)) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }, []);

  const openTaskParameterDraft = useCallback((task: TeamCanvasTask) => {
    setTaskParameterDraftByTaskId((current) => ({
      ...current,
      [task.taskId]: {
        templateBindings: templateBindingsForTask(task),
      },
    }));
  }, []);

  const updateTaskParameterBinding = useCallback((taskId: string, parameterId: string, value: string) => {
    setTaskParameterDraftByTaskId((current) => {
      const draft = current[taskId];
      if (!draft) return current;
      return {
        ...current,
        [taskId]: {
          templateBindings: {
            ...draft.templateBindings,
            [parameterId]: value,
          },
        },
      };
    });
  }, []);

  const openTaskCloneDraft = useCallback((task: TeamCanvasTask) => {
    const templateBindings = Object.fromEntries(
      (task.templateConfig?.parameters ?? []).map((parameter) => [parameter.id, parameter.defaultValue ?? ""]),
    );
    setTaskCloneDraftByTaskId((current) => ({
      ...current,
      [task.taskId]: {
        title: `${task.title} 副本`,
        templateBindings,
      },
    }));
  }, []);

  const updateTaskCloneTitle = useCallback((taskId: string, title: string) => {
    setTaskCloneDraftByTaskId((current) => {
      const draft = current[taskId];
      if (!draft) return current;
      return {
        ...current,
        [taskId]: { ...draft, title },
      };
    });
  }, []);

  const updateTaskCloneBinding = useCallback((taskId: string, parameterId: string, value: string) => {
    setTaskCloneDraftByTaskId((current) => {
      const draft = current[taskId];
      if (!draft) return current;
      return {
        ...current,
        [taskId]: {
          ...draft,
          templateBindings: {
            ...draft.templateBindings,
            [parameterId]: value,
          },
        },
      };
    });
  }, []);

  const clearTaskPanelState = useCallback((taskId?: string) => {
    clearTaskEditState(taskId);
    clearTaskCloneState(taskId);
    clearTaskParameterState(taskId);
    setTaskArchiveConfirmNodeId(null);
    setTaskArchiveSavingNodeId(null);
  }, [clearTaskCloneState, clearTaskEditState, clearTaskParameterState]);

  useEffect(() => {
    storeTheme(theme);
  }, [theme]);

  const clearGeneratedArchiveUiForTasks = useCallback((taskIds: string[]) => {
    if (taskIds.length === 0) return;
    const taskIdSet = new Set(taskIds);
    setGeneratedArchiveConfirmTaskId((current) => (
      current && taskIdSet.has(current) ? null : current
    ));
    setGeneratedArchiveSavingByTaskId((current) => {
      let changed = false;
      const next = { ...current };
      for (const taskId of taskIdSet) {
        if (taskId in next) {
          delete next[taskId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  const closeTaskPickersBeforeTaskBranch = useCallback(() => {
    setAgentPickerOpen(false);
    setTaskLeaderPickerOpen(false);
  }, []);

  const {
    expandedTaskBranches,
    focusedTaskBranch,
    setExpandedTaskBranches,
    closeTaskBranch,
    openOrToggleTaskBranch,
    pruneTaskBranches,
  } = useTaskBranchStack({
    onClearTaskPanelState: clearTaskPanelState,
    onBeforeOpenTaskBranch: closeTaskPickersBeforeTaskBranch,
  });

  const resetContextUi = useCallback((reason: TeamConsoleUiResetReason) => {
    setSelectedTaskId(null);
    setTaskConnectionDraft(null);
    setTaskDependencyDraft(null);
    setSourceConnectionDraft(null);
    setTaskGroups([]);
    setSelectedAtlasEntries([]);
    setTaskRunSavingByTaskId({});
    setTaskCloneDraftByTaskId({});
    setTaskCloneSavingByTaskId({});
    setTaskParameterDraftByTaskId({});
    setTaskParameterSavingByTaskId({});
    setGeneratedResetSavingByTaskId({});
    setGeneratedArchiveConfirmTaskId(null);
    setGeneratedArchiveSavingByTaskId({});
    setTaskRunObserverByRunId({});
    setRunHistoryTaskId(null);
    setRunHistoryItems([]);
    setRunHistoryTotal(0);
    setRunHistoryIncludeArchived(false);
    setRunHistoryLoading(false);
    setRunHistoryError(null);
    setSelectedRunHistoryRunId(null);
    setRunHistorySavingRunId(null);
    setRunHistoryAnalysisCopyState("idle");
    setRunHistoryAnalysisManualText(null);

    if (reason === "mock-fixture" || reason === "mock-workspace" || reason === "live-workspace-loading") {
      setSourceAtlasNodes([]);
    }

    if (reason === "live-workspace-loading") {
      setAgentPickerOpen(false);
      setTaskLeaderPickerOpen(false);
      setTaskNodes([]);
      setLiveTaskNodesHydrated(false);
      setLiveSourceNodesHydrated(false);
    }

    if (reason === "mock-workspace") {
      setCanvasViewport({ x: 0, y: 0, scale: 1 });
      setCanvasBranchLayout({});
    }
  }, []);

  const openDiscoveryTaskIds = useMemo(() => {
    const ids: string[] = [];
    for (const branch of expandedTaskBranches) {
      if (branch.detailMode !== "discovery-subcanvas") continue;
      ids.push(branch.taskId);
    }
    return ids;
  }, [expandedTaskBranches]);

  const liveData = useTeamConsoleLiveData({
    onApplyLiveTasks: useCallback((nextTasks: TeamCanvasTask[]) => {
      setTaskNodes((current) => makeTaskNodes(nextTasks, liveTaskRefreshPositions(current)));
      setLiveTaskNodesHydrated(true);
    }, []),
    onApplyLiveSources: useCallback((nextSources: TeamCanvasSourceNode[]) => {
      setSourceAtlasNodes((current) => makeSourceNodes(nextSources, liveSourceRefreshPositions(current)));
      setLiveSourceNodesHydrated(true);
    }, []),
    onCloseBranches: useCallback(() => {
      setTaskLeaderPickerOpen(false);
      setExpandedAgentBranch(null);
      closeTaskBranch();
    }, [closeTaskBranch]),
    onResetContextUi: resetContextUi,
    selectedTaskId,
    openDiscoveryTaskIds,
  });
  const {
    dataSource, setDataSource,
    selectedFixtureId,
    loading, error, setError,
    liveTasksRefreshing,
    agents, agentRunStatusById,
    plan, run, attemptsByTaskId,
    tasks, taskConnections, taskDependencies,
    sourceNodes, sourceConnections,
    taskRunsByTaskId, generatedTasksByDiscoveryTaskId, discoverySummariesByTaskId, discoveryDispatchDiagnosticsByTaskId, setTaskRunsByTaskId, setGeneratedTasksByDiscoveryTaskId,
    refreshLiveTasks,
    scheduleLiveTaskDiscoveryRefresh,
    refreshLiveTasksAfterLeavingTaskCreateBranch,
    readAttemptFile,
    setTaskConnections, setTaskDependencies,
    setSourceNodes, setSourceConnections,
    setTasks,
    markGeneratedTaskReplaced,
    markGeneratedTaskArchived,
    ensureGeneratedTaskDetail,
  } = liveData;

  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.taskId, task])), [tasks]);
  const generatedTasksById = useMemo(() => new Map(
    Object.values(generatedTasksByDiscoveryTaskId).flat().map((task) => [task.taskId, task]),
  ), [generatedTasksByDiscoveryTaskId]);
  const taskRunsByTaskIdRef = useRef(taskRunsByTaskId);
  taskRunsByTaskIdRef.current = taskRunsByTaskId;
  const runObserverInitialRefreshKeysRef = useRef<Set<string>>(new Set());
  const runObserverOpenTargetKeysRef = useRef<Set<string>>(new Set());
  const generatedEditDetailHandledTaskIdsRef = useRef<Set<string>>(new Set());
  const sourceNodesById = useMemo(() => new Map(sourceNodes.map((node) => [node.sourceNodeId, node])), [sourceNodes]);
  const agentRunStatusesById = useMemo(() => new Map(Object.entries(agentRunStatusById)), [agentRunStatusById]);
  const addedAgentIds = useMemo(() => new Set(agentNodes.map((node) => node.agentId)), [agentNodes]);
  const canvasUiContextKey = dataSource === "mock" ? `mock:${selectedFixtureId}` : "live";
  const activeRunHistoryTaskId = useMemo(() => {
    const branch = [...expandedTaskBranches].reverse().find((item) => item.detailMode === "run-history");
    return branch?.runHistoryTaskId ?? (branch ? branch.taskId : runHistoryTaskId);
  }, [expandedTaskBranches, runHistoryTaskId]);
  const hydratedCanvasUiContextKeyRef = useRef<string | null>(null);
  const expandedAgentNode = expandedAgentBranch
    ? agentNodes.find((node) => node.nodeId === expandedAgentBranch.nodeId) ?? null
    : null;
  const expandedAgent = expandedAgentNode ? agentsById.get(expandedAgentNode.agentId) ?? null : null;
  const runObserverTargets = useMemo(() => expandedTaskBranches.flatMap((branch) => {
    const rootTargets = (() => {
      if ((branch.detailMode !== "run-observer" && branch.detailMode !== "run-history") || !branch.observedRunId) return [];
      const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
      const task = node ? tasksById.get(node.taskId) ?? null : null;
      if (!task) return [];
      const targetTaskId = branch.detailMode === "run-history"
        ? branch.runHistoryTaskId ?? activeRunHistoryTaskId ?? task.taskId
        : task.taskId;
      const taskRun = (taskRunsByTaskId[targetTaskId] ?? []).find((run) => run.runId === branch.observedRunId)
        ?? (branch.detailMode === "run-history"
          ? runHistoryItems.find((item) => item.annotation.taskId === targetTaskId && item.run.runId === branch.observedRunId)?.run ?? null
          : null);
      if (!taskRun) return [];
      return [{ taskId: targetTaskId, runId: taskRun.runId, status: taskRun.status }];
    })();
    if (branch.detailMode !== "discovery-subcanvas" || !branch.discoveryGeneratedObserver) return rootTargets;
    const generatedTask = generatedTasksById.get(branch.discoveryGeneratedObserver.taskId) ?? null;
    if (!generatedTask) return rootTargets;
    const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
    const discoveryTask = node ? tasksById.get(node.taskId) ?? null : null;
    if (!discoveryTask || discoveryTask.canvasKind !== "discovery" || discoveryTask.generatedSource) return rootTargets;
    const activeDiscoveryRun = selectActiveDiscoveryRootRun(discoveryTask.taskId, taskRunsByTaskId);
    const taskRun = visibleDiscoveryGeneratedRuns(generatedTask, discoveryTask.taskId, activeDiscoveryRun, taskRunsByTaskId)
      .find((run) => run.runId === branch.discoveryGeneratedObserver?.runId) ?? null;
    if (!taskRun) return rootTargets;
    return [
      ...rootTargets,
      { taskId: generatedTask.taskId, runId: taskRun.runId, status: taskRun.status },
    ];
  }), [activeRunHistoryTaskId, expandedTaskBranches, generatedTasksById, runHistoryItems, taskNodes, taskRunsByTaskId, tasksById]);
  const runObserverTargetSignature = useMemo(() => runObserverTargets
    .map((target) => `${target.taskId}\u0000${target.runId}\u0000${target.status}`)
    .join("\u0001"), [runObserverTargets]);
  runObserverOpenTargetKeysRef.current = new Set(
    runObserverTargets.map((target) => `${dataSource}\u0000${target.taskId}\u0000${target.runId}`),
  );
  const openDiscoverySubcanvasGeneratedTaskIds = useMemo(() => {
    const taskIds = new Set<string>();
    for (const branch of expandedTaskBranches) {
      if (branch.detailMode !== "discovery-subcanvas") continue;
      for (const generatedTask of generatedTasksByDiscoveryTaskId[branch.taskId] ?? []) {
        if (!generatedTask.archived) {
          taskIds.add(generatedTask.taskId);
        }
      }
    }
    return taskIds;
  }, [expandedTaskBranches, generatedTasksByDiscoveryTaskId]);

  const selectTask = useCallback((taskId: string) => {
    setSelectedTaskId((current) => current === taskId ? null : taskId);
  }, []);

  const openTaskRunHistory = useCallback((taskId: string, nodeId?: string, seedRuns: TeamRunState[] = []) => {
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
    const initialItems = mergeRunHistoryItems([], seedRuns, taskId, false);
    setRunHistoryTaskId(taskId);
    setRunHistoryIncludeArchived(false);
    setRunHistoryItems(initialItems);
    setRunHistoryTotal(initialItems.length);
    setSelectedRunHistoryRunId(null);
    setRunHistoryError(null);
    setRunHistoryLoading(false);
    setRunHistoryAnalysisCopyState("idle");
    setRunHistoryAnalysisManualText(null);
    void Promise.resolve().then(() => api.listTaskRunHistory(taskId, {
      limit: 50,
      offset: 0,
      includeArchived: false,
    })).then((response) => {
      const merged = mergeRunHistoryItems(
        response.runs,
        [...seedRuns, ...(taskRunsByTaskIdRef.current[taskId] ?? [])],
        taskId,
        false,
      );
      setRunHistoryItems(merged);
      setRunHistoryTotal(Math.max(response.total, merged.length));
      setRunHistoryLoading(false);
    }).catch((e) => {
      setRunHistoryItems([]);
      setRunHistoryTotal(0);
      setRunHistoryLoading(false);
      setRunHistoryError(errorMessage(e));
    });
    if (nodeId) {
      setExpandedTaskBranches((current) => current.map((item) => (
        item.nodeId === nodeId
          ? { ...item, detailMode: "run-history", runHistoryTaskId: taskId, observedRunId: undefined, selectedFileKeys: [] }
          : item
      )));
    }
  }, [dataSource, setExpandedTaskBranches]);

  const closeTaskRunHistory = useCallback(() => {
    setRunHistoryTaskId(null);
    setRunHistoryItems([]);
    setRunHistoryTotal(0);
    setSelectedRunHistoryRunId(null);
    setRunHistoryError(null);
    setRunHistorySavingRunId(null);
    setRunHistoryAnalysisCopyState("idle");
    setRunHistoryAnalysisManualText(null);
  }, []);

  const copyRunHistoryAnalysisContext = useCallback(async (
    task: RunHistoryAnalysisTask,
    run: TeamRunState,
    attempts: TeamAttemptMetadata[],
    fileDescriptors: TaskRunObserverFileDescriptor[],
  ) => {
    const text = buildRunHistoryAnalysisContext(task, run, attempts, fileDescriptors);
    setRunHistoryAnalysisCopyState("idle");
    setRunHistoryAnalysisManualText(null);
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (clipboard?.writeText) {
        try {
          await clipboard.writeText(text);
          setRunHistoryAnalysisCopyState("copied");
          return;
        } catch { /* fall through to textarea fallback */ }
      }

      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("data-copy-fallback", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      const prev = document.activeElement as HTMLElement | null;
      ta.focus();
      ta.select();
      try {
        const execCopy = document.execCommand?.bind(document);
        if (!execCopy?.("copy")) throw new Error("execCommand copy returned false");
        setRunHistoryAnalysisCopyState("copied");
      } finally {
        ta.remove();
        prev?.focus();
      }
    } catch {
      setRunHistoryAnalysisCopyState("failed");
      setRunHistoryAnalysisManualText(text);
    }
  }, []);

  useEffect(() => {
    if (!activeRunHistoryTaskId) return;
    let cancelled = false;
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
    setRunHistoryLoading(false);
    setRunHistoryError(null);
    setSelectedRunHistoryRunId(null);

    void Promise.resolve().then(() => api.listTaskRunHistory(activeRunHistoryTaskId, {
      limit: 50,
      offset: 0,
      includeArchived: runHistoryIncludeArchived,
    })).then((response) => {
      if (cancelled) return;
      const merged = mergeRunHistoryItems(
        response.runs,
        taskRunsByTaskIdRef.current[activeRunHistoryTaskId] ?? [],
        activeRunHistoryTaskId,
        runHistoryIncludeArchived,
      );
      setRunHistoryItems(merged);
      setRunHistoryTotal(Math.max(response.total, merged.length));
      setRunHistoryLoading(false);
    }).catch((e) => {
      if (cancelled) return;
      setRunHistoryItems([]);
      setRunHistoryTotal(0);
      setRunHistoryLoading(false);
      setRunHistoryError(errorMessage(e));
    });

    return () => {
      cancelled = true;
    };
  }, [activeRunHistoryTaskId, dataSource, runHistoryIncludeArchived, taskRunsByTaskId]);

  const loadMoreRunHistory = useCallback(async () => {
    if (!activeRunHistoryTaskId || runHistoryLoading || runHistoryItems.length >= runHistoryTotal) return;
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
    setRunHistoryLoading(true);
    setRunHistoryError(null);
    try {
      const response = await api.listTaskRunHistory(activeRunHistoryTaskId, {
        limit: 50,
        offset: runHistoryItems.length,
        includeArchived: runHistoryIncludeArchived,
      });
      setRunHistoryItems((current) => mergeRunHistoryItems(
        [...current, ...response.runs],
        [],
        activeRunHistoryTaskId,
        runHistoryIncludeArchived,
      ));
      setRunHistoryTotal(Math.max(response.total, runHistoryItems.length));
    } catch (e) {
      setRunHistoryError(errorMessage(e));
    } finally {
      setRunHistoryLoading(false);
    }
  }, [activeRunHistoryTaskId, dataSource, runHistoryIncludeArchived, runHistoryItems.length, runHistoryLoading, runHistoryTotal]);

  const selectRunHistoryItem = useCallback((item: TeamTaskRunHistoryItem) => {
    setSelectedRunHistoryRunId(item.run.runId);
  }, []);

  const patchRunHistoryAnnotation = useCallback(async (
    item: TeamTaskRunHistoryItem,
    patch: { best?: boolean; archived?: boolean },
  ) => {
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
    setRunHistorySavingRunId(item.run.runId);
    setRunHistoryError(null);
    try {
      const response = await api.updateTaskRunAnnotation(item.run.runId, patch);
      setRunHistoryItems((current) => {
        const next = current.map((historyItem) => {
          if (historyItem.annotation.taskId !== response.annotation.taskId) return historyItem;
          if (historyItem.run.runId === response.annotation.runId) {
            return { ...historyItem, annotation: response.annotation };
          }
          return response.annotation.best
            ? { ...historyItem, annotation: { ...historyItem.annotation, best: false } }
            : historyItem;
        });
        return runHistoryIncludeArchived || !response.annotation.archived
          ? next
          : next.filter((historyItem) => historyItem.run.runId !== response.annotation.runId);
      });
      if (!runHistoryIncludeArchived && response.annotation.archived) {
        setRunHistoryTotal((current) => Math.max(0, current - 1));
        setSelectedRunHistoryRunId((current) => current === response.annotation.runId ? null : current);
      }
    } catch (e) {
      setRunHistoryError(errorMessage(e));
    } finally {
      setRunHistorySavingRunId(null);
    }
  }, [dataSource, runHistoryIncludeArchived]);

  useEffect(() => {
    if (generatedArchiveConfirmTaskId && !openDiscoverySubcanvasGeneratedTaskIds.has(generatedArchiveConfirmTaskId)) {
      setGeneratedArchiveConfirmTaskId(null);
    }
    if (dataSource === "live" && generatedActionMenuTaskId && !generatedTasksById.has(generatedActionMenuTaskId)) {
      setGeneratedActionMenuTaskId(null);
    }
    setGeneratedArchiveSavingByTaskId((current) => {
      let changed = false;
      const next = { ...current };
      for (const taskId of Object.keys(next)) {
        if (!openDiscoverySubcanvasGeneratedTaskIds.has(taskId)) {
          delete next[taskId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [dataSource, generatedActionMenuTaskId, generatedArchiveConfirmTaskId, generatedTasksById, openDiscoverySubcanvasGeneratedTaskIds]);

  useEffect(() => {
    if (dataSource !== "live") {
      setSharedCanvasUiState(null);
      setSharedCanvasUiStateLoaded(false);
      return;
    }
    let cancelled = false;
    setSharedCanvasUiStateLoaded(false);
    void new LiveTeamApi().getConsoleLayout()
      .then((response) => {
        if (cancelled) return;
        setSharedCanvasUiState(response.state ? parseStoredCanvasUiStateByContext(response.state) : null);
      })
      .catch(() => {
        if (!cancelled) setSharedCanvasUiState(null);
      })
      .finally(() => {
        if (!cancelled) setSharedCanvasUiStateLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dataSource]);

  useEffect(() => {
    return () => {
      if (sharedCanvasUiStateSaveTimerRef.current) {
        globalThis.clearTimeout(sharedCanvasUiStateSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setCanvasUiStateHydrated(false);
    setCanvasUiStateRestoreHasStoredState(readStoredCanvasUiState(dataSource, selectedFixtureId) !== null);
  }, [canvasUiContextKey, dataSource, selectedFixtureId]);

  useEffect(() => {
    if (dataSource === "live" && !liveAgentNodesHydrated) return;
    setMinimizedAgentNodeIds((current) => {
      const nodeIds = new Set(agentNodes.filter((node) => agentsById.has(node.agentId)).map((node) => node.nodeId));
      const next = current.filter((nodeId) => nodeIds.has(nodeId));
      return next.length === current.length ? current : next;
    });
  }, [agentNodes, agentsById, dataSource, liveAgentNodesHydrated]);

  useEffect(() => {
    if (dataSource === "live" && !liveTaskNodesHydrated) return;
    setMinimizedTaskNodeIds((current) => {
      const nodeIds = new Set(taskNodes.map((node) => node.nodeId));
      const next = current.filter((nodeId) => nodeIds.has(nodeId));
      return next.length === current.length ? current : next;
    });
  }, [dataSource, liveTaskNodesHydrated, taskNodes]);

  useEffect(() => {
    const nodeIds = new Set(taskNodes.map((node) => node.nodeId));
    setTaskGroups((current) => {
      const next = current.flatMap((group) => {
        const taskNodeIds = group.taskNodeIds.filter((nodeId) => nodeIds.has(nodeId));
        return taskNodeIds.length > 0 ? [{ ...group, taskNodeIds }] : [];
      });
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [taskNodes]);

  useEffect(() => {
    if (dataSource === "live" && !liveSourceNodesHydrated) return;
    setMinimizedSourceNodeIds((current) => {
      const nodeIds = new Set(sourceAtlasNodes.map((node) => node.nodeId));
      const next = current.filter((nodeId) => nodeIds.has(nodeId));
      return next.length === current.length ? current : next;
    });
  }, [dataSource, liveSourceNodesHydrated, sourceAtlasNodes]);

  useEffect(() => {
    if (canvasUiStateHydrated) return;
    const ready = dataSource === "live"
      ? liveAgentNodesHydrated && liveTaskNodesHydrated && liveSourceNodesHydrated && sharedCanvasUiStateLoaded
      : taskNodes.length > 0;
    if (!ready) return;

    const stored = readStoredCanvasUiState(dataSource, selectedFixtureId, sharedCanvasUiState);
    if (!stored) {
      setCanvasUiStateRestoreHasStoredState(false);
      setCanvasBranchLayout({});
      setTaskGroups([]);
      hydratedCanvasUiContextKeyRef.current = canvasUiContextKey;
      setCanvasUiStateHydrated(true);
      return;
    }
    setCanvasUiStateRestoreHasStoredState(true);

    const nextAgentNodes = mergeStoredAgentNodes(agentNodes, stored.agentNodes, agentsById);
    const nextTaskNodes = mergeStoredTaskNodePositions(taskNodes, stored.taskNodePositions);
    const nextSourceNodes = mergeStoredSourceNodePositions(sourceAtlasNodes, stored.sourceNodePositions);
    if (!sameAgentNodes(agentNodes, nextAgentNodes)) {
      setAgentNodes(nextAgentNodes);
    }
    if (!sameTaskNodes(taskNodes, nextTaskNodes)) {
      setTaskNodes(nextTaskNodes);
    }
    if (!sameSourceNodes(sourceAtlasNodes, nextSourceNodes)) {
      setSourceAtlasNodes(nextSourceNodes);
    }

    const validAgentNodes = nextAgentNodes.filter((node) => agentsById.has(node.agentId));
    const agentNodeIds = new Set(validAgentNodes.map((node) => node.nodeId));
    const agentIds = new Set(validAgentNodes.map((node) => node.agentId));
    const taskNodeIds = new Set(nextTaskNodes.map((node) => node.nodeId));
    const taskIds = new Set(nextTaskNodes.map((node) => node.taskId));
    const sourceNodeIds = new Set(nextSourceNodes.map((node) => node.nodeId));
    const nextTaskGroups = (stored.taskGroups ?? []).flatMap((group) => {
      const taskGroupNodeIds = group.taskNodeIds.filter((nodeId) => taskNodeIds.has(nodeId));
      return taskGroupNodeIds.length > 0 ? [{ ...group, taskNodeIds: taskGroupNodeIds }] : [];
    });
    const nextAgentBranch = stored.expandedAgentBranch
      && agentNodeIds.has(stored.expandedAgentBranch.nodeId)
      && agentIds.has(stored.expandedAgentBranch.agentId)
      ? stored.expandedAgentBranch
      : null;
    const nextTaskBranches = (stored.expandedTaskBranches ?? []).filter((branch) => (
      taskNodeIds.has(branch.nodeId) && taskIds.has(branch.taskId)
    ));

    if (stored.viewport) {
      setCanvasViewport(stored.viewport);
    }
    setExpandedAgentBranch(nextAgentBranch);
    setExpandedTaskBranches(nextTaskBranches);
    setTaskGroups(nextTaskGroups);
    setCanvasBranchLayout(stored.branchLayout ?? {});
    setMinimizedAgentNodeIds((stored.minimizedAgentNodeIds ?? []).filter((nodeId) => agentNodeIds.has(nodeId)));
    setMinimizedTaskNodeIds((stored.minimizedTaskNodeIds ?? []).filter((nodeId) => taskNodeIds.has(nodeId)));
    setMinimizedSourceNodeIds((stored.minimizedSourceNodeIds ?? []).filter((nodeId) => sourceNodeIds.has(nodeId)));
    if (stored.rootNodeFilter) setRootNodeFilter(stored.rootNodeFilter);
    hydratedCanvasUiContextKeyRef.current = canvasUiContextKey;
    setCanvasUiStateHydrated(true);
  }, [
    agentNodes,
    agentsById,
    canvasUiContextKey,
    canvasUiStateHydrated,
    dataSource,
    liveAgentNodesHydrated,
    liveSourceNodesHydrated,
    liveTaskNodesHydrated,
    selectedFixtureId,
    sharedCanvasUiState,
    sharedCanvasUiStateLoaded,
    sourceAtlasNodes,
    taskNodes,
  ]);

  useEffect(() => {
    if (!canvasUiStateHydrated) return;
    if (hydratedCanvasUiContextKeyRef.current !== canvasUiContextKey) return;
    const nextState: StoredCanvasUiState = {
      schemaVersion: 1,
      dataSource,
      ...(dataSource === "mock" ? { selectedFixtureId } : {}),
      viewport: canvasViewport,
      agentNodes: agentNodes.map((node) => ({
        agentId: node.agentId,
        position: { x: node.position.x, y: node.position.y },
      })),
      taskNodePositions: taskNodes.map((node) => ({
        taskId: node.taskId,
        position: { x: node.position.x, y: node.position.y },
      })),
      sourceNodePositions: sourceAtlasNodes.map((node) => ({
        sourceNodeId: node.sourceNodeId,
        position: { x: node.position.x, y: node.position.y },
      })),
      taskGroups,
      expandedAgentBranch,
      expandedTaskBranches,
      branchLayout: canvasBranchLayout,
      minimizedAgentNodeIds,
      minimizedTaskNodeIds,
      minimizedSourceNodeIds,
      rootNodeFilter,
    };
    const nextByContext = writeStoredCanvasUiState(nextState);
    if (dataSource === "live" && nextByContext) {
      setSharedCanvasUiState(nextByContext);
      if (sharedCanvasUiStateSaveTimerRef.current) {
        globalThis.clearTimeout(sharedCanvasUiStateSaveTimerRef.current);
      }
      sharedCanvasUiStateSaveTimerRef.current = globalThis.setTimeout(() => {
        sharedCanvasUiStateSaveTimerRef.current = null;
        void new LiveTeamApi().saveConsoleLayout(nextByContext).catch(() => {});
      }, 250);
    }
  }, [
    canvasUiContextKey,
    canvasUiStateHydrated,
    canvasBranchLayout,
    canvasViewport,
    dataSource,
    agentNodes,
    expandedAgentBranch,
    expandedTaskBranches,
    minimizedAgentNodeIds,
    minimizedSourceNodeIds,
    minimizedTaskNodeIds,
    rootNodeFilter,
    selectedFixtureId,
    sourceAtlasNodes,
    taskGroups,
    taskNodes,
  ]);

  useEffect(() => {
    if (dataSource !== "live") {
      setLiveAgentNodesHydrated(false);
      setLiveTaskNodesHydrated(false);
      setLiveSourceNodesHydrated(false);
      return;
    }
    setAgentNodes(readStoredLiveAgentNodes());
    setLiveAgentNodesHydrated(true);
  }, [dataSource]);

  useEffect(() => {
    if (dataSource !== "live" || !liveAgentNodesHydrated) return;
    writeStoredLiveAgentNodes(agentNodes);
  }, [dataSource, liveAgentNodesHydrated, agentNodes]);

  useEffect(() => {
    if (dataSource !== "live" || !liveTaskNodesHydrated) return;
    writeStoredLiveTaskNodes(taskNodes);
  }, [dataSource, liveTaskNodesHydrated, taskNodes]);

  useEffect(() => {
    if (dataSource !== "live" || !liveSourceNodesHydrated) return;
    writeStoredLiveSourceNodes(sourceAtlasNodes);
  }, [dataSource, liveSourceNodesHydrated, sourceAtlasNodes]);

  useEffect(() => {
    pruneTaskBranches(tasksById);
  }, [pruneTaskBranches, tasksById]);

  const clearGeneratedEditDetailFailure = useCallback((nodeId: string, taskId: string) => {
    generatedEditDetailHandledTaskIdsRef.current.delete(taskId);
    clearTaskEditState(taskId);
    setExpandedTaskBranches((current) => current.map((item) => (
      item.nodeId === nodeId && item.discoveryGeneratedEditTaskId === taskId
        ? { ...item, discoveryGeneratedEditTaskId: undefined }
        : item
    )));
  }, [clearTaskEditState, setExpandedTaskBranches]);

  useEffect(() => {
    for (const branch of expandedTaskBranches) {
      if (branch.detailMode !== "discovery-subcanvas" || !branch.discoveryGeneratedEditTaskId) continue;
      const generatedTask = generatedTasksById.get(branch.discoveryGeneratedEditTaskId);
      if (generatedTask && !taskEditDraftByTaskId[generatedTask.taskId]) {
        if (generatedEditDetailHandledTaskIdsRef.current.has(generatedTask.taskId)) continue;
        if ((generatedTask as TeamCanvasTask).workUnit) {
          openTaskEditDraft(generatedTask as TeamCanvasTask);
        } else {
          void ensureGeneratedTaskDetail(generatedTask.taskId).then((fullTask) => {
            if (fullTask) {
              openTaskEditDraft(fullTask);
            } else {
              clearGeneratedEditDetailFailure(branch.nodeId, generatedTask.taskId);
            }
          });
        }
      }
    }
  }, [
    clearGeneratedEditDetailFailure,
    ensureGeneratedTaskDetail,
    expandedTaskBranches,
    generatedTasksById,
    openTaskEditDraft,
    taskEditDraftByTaskId,
  ]);

  useEffect(() => {
    setSourceConnections((current) => (
      current.filter((connection) => sourceNodesById.has(connection.fromSourceNodeId) && tasksById.has(connection.toTaskId))
    ));
  }, [sourceNodesById, tasksById]);

  const addAgentNode = useCallback((agentId: string) => {
    setAgentNodes((current) => {
      if (current.some((node) => node.agentId === agentId)) return current;
      return [...current, makeAgentNode(agentId, current.length)];
    });
    setAgentPickerOpen(false);
    setTaskLeaderPickerOpen(false);
  }, []);

  const moveAgentNode = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setAgentNodes((current) => current.map((node) => (
      node.nodeId === nodeId ? { ...node, position } : node
    )));
  }, []);

  const moveTaskNode = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setTaskNodes((current) => current.map((node) => (
      node.nodeId === nodeId ? { ...node, position } : node
    )));
  }, []);

  const moveSourceNode = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setSourceAtlasNodes((current) => current.map((node) => (
      node.nodeId === nodeId ? { ...node, position } : node
    )));
  }, []);

  const minimizeAgentNode = useCallback((node: AtlasAgentNode) => {
    setMinimizedAgentNodeIds((current) => (
      current.includes(node.nodeId) ? current : [...current, node.nodeId]
    ));
  }, []);

  const restoreAgentNode = useCallback((node: AtlasAgentNode) => {
    setMinimizedAgentNodeIds((current) => current.filter((nodeId) => nodeId !== node.nodeId));
  }, []);

  const minimizeTaskNode = useCallback((node: AtlasTaskNode) => {
    setMinimizedTaskNodeIds((current) => (
      current.includes(node.nodeId) ? current : [...current, node.nodeId]
    ));
  }, []);

  const restoreTaskNode = useCallback((node: AtlasTaskNode) => {
    setMinimizedTaskNodeIds((current) => current.filter((nodeId) => nodeId !== node.nodeId));
  }, []);

  const minimizeSourceNode = useCallback((node: AtlasSourceNode) => {
    setMinimizedSourceNodeIds((current) => (
      current.includes(node.nodeId) ? current : [...current, node.nodeId]
    ));
  }, []);

  const restoreSourceNode = useCallback((node: AtlasSourceNode) => {
    setMinimizedSourceNodeIds((current) => current.filter((nodeId) => nodeId !== node.nodeId));
  }, []);

  const toggleAgentBranch = useCallback((node: AtlasAgentNode) => {
    setAgentPickerOpen(false);
    setTaskLeaderPickerOpen(false);
    refreshLiveTasksAfterLeavingTaskCreateBranch(expandedAgentBranch);
    setExpandedAgentBranch(
      expandedAgentBranch?.nodeId === node.nodeId && expandedAgentBranch.mode === "chat"
        ? null
        : { nodeId: node.nodeId, agentId: node.agentId, mode: "chat" },
    );
  }, [expandedAgentBranch, refreshLiveTasksAfterLeavingTaskCreateBranch]);

  const toggleTaskBranch = useCallback((node: AtlasTaskNode) => {
    openOrToggleTaskBranch(node);
  }, [openOrToggleTaskBranch]);

  const openTaskCreateBranch = useCallback((leaderAgentId: string) => {
    const nodeId = `agent-${leaderAgentId}`;
    setAgentNodes((current) => (
      current.some((node) => node.agentId === leaderAgentId)
        ? current
        : [...current, makeAgentNode(leaderAgentId, current.length)]
    ));
    setAgentPickerOpen(false);
    setTaskLeaderPickerOpen(false);
    setExpandedAgentBranch({ nodeId, agentId: leaderAgentId, mode: "task-create" });
  }, []);

  const replaceGeneratedTaskInCatalog = useCallback((nextTask: TeamCanvasTask) => {
    const sourceDiscoveryTaskId = nextTask.generatedSource?.sourceDiscoveryTaskId;
    if (!sourceDiscoveryTaskId) return;
    markGeneratedTaskReplaced(nextTask.taskId);
    setGeneratedTasksByDiscoveryTaskId((current) => {
      const currentTasks = current[sourceDiscoveryTaskId] ?? [];
      if (!currentTasks.some((task) => task.taskId === nextTask.taskId)) return current;
      return {
        ...current,
        [sourceDiscoveryTaskId]: currentTasks.map((task) =>
          task.taskId === nextTask.taskId ? nextTask : task
        ),
      };
    });
  }, [setGeneratedTasksByDiscoveryTaskId, markGeneratedTaskReplaced]);

  const clearGeneratedTaskPanelState = useCallback((taskId: string) => {
    clearGeneratedArchiveUiForTasks([taskId]);
    clearTaskEditState(taskId);
    clearTaskEditWarning(taskId);
    setExpandedTaskBranches((current) => current.map((item) => {
      const nextEditTaskId = item.discoveryGeneratedEditTaskId === taskId ? undefined : item.discoveryGeneratedEditTaskId;
      const nextGeneratedObserver = item.discoveryGeneratedObserver?.taskId === taskId
        ? undefined
        : item.discoveryGeneratedObserver;
      if (nextEditTaskId === item.discoveryGeneratedEditTaskId && nextGeneratedObserver === item.discoveryGeneratedObserver) {
        return item;
      }
      return {
        ...item,
        discoveryGeneratedEditTaskId: nextEditTaskId,
        discoveryGeneratedObserver: nextGeneratedObserver,
      };
    }));
  }, [clearGeneratedArchiveUiForTasks, clearTaskEditState, clearTaskEditWarning, setExpandedTaskBranches]);

  const saveTaskEdit = useCallback(async (taskId: string) => {
    const task = tasksById.get(taskId) ?? generatedTasksById.get(taskId);
    const draft = taskEditDraftByTaskId[taskId];
    if (!task || !draft || draft.taskId !== taskId) return;

    const patch: TeamTaskUpdateRequest = {};
    let nextWorkUnit: TeamCanvasTask["workUnit"] | undefined;
    const ensureWorkUnitPatch = () => {
      nextWorkUnit ??= { ...task.workUnit };
      return nextWorkUnit;
    };
    const dirty = draft.dirtyFields;
    const title = draft.title.trim();

    if (hasDirtyTaskEditConflict(task, draft)) {
      setTaskEditWarning(taskId, "Task 已经在后台更新，请重新打开编辑节点后再保存。");
      return;
    }

    if (dirty.title && title !== task.title) {
      patch.title = title;
      if (task.generatedSource) {
        ensureWorkUnitPatch().title = title;
      }
    }
    if (dirty.leaderAgentId && draft.leaderAgentId !== task.leaderAgentId) {
      patch.leaderAgentId = draft.leaderAgentId;
    }
    const workerChanged = Boolean(dirty.workerAgentId) && draft.workerAgentId !== task.workUnit.workerAgentId;
    const checkerChanged = Boolean(dirty.checkerAgentId) && draft.checkerAgentId !== task.workUnit.checkerAgentId;
    if (workerChanged || checkerChanged) {
      const workUnit = ensureWorkUnitPatch();
      if (workerChanged) workUnit.workerAgentId = draft.workerAgentId;
      if (checkerChanged) workUnit.checkerAgentId = draft.checkerAgentId;
    }
    if (nextWorkUnit) {
      patch.workUnit = nextWorkUnit;
    }
    if (Object.keys(patch).length === 0) {
      clearTaskEditWarning(taskId);
      return;
    }

    setTaskEditSaving(taskId, true);
    clearTaskEditWarning(taskId);
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const response = await api.updateTask(taskId, patch);
      if (response.task.generatedSource) {
        replaceGeneratedTaskInCatalog(response.task);
      } else if (dataSource === "live") {
        await refreshLiveTasks();
      } else {
        const nextTasks = await api.listTasks();
        setTasks(nextTasks);
        setTaskNodes((current) => makeTaskNodes(nextTasks, liveTaskRefreshPositions(current)));
      }
      replaceTaskEditDraft(response.task);
      setTaskEditWarning(taskId, response.warnings?.join(" ") ?? null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskEditSaving(taskId, false);
    }
  }, [clearTaskEditWarning, dataSource, generatedTasksById, refreshLiveTasks, replaceGeneratedTaskInCatalog, replaceTaskEditDraft, setTaskEditSaving, setTaskEditWarning, taskEditDraftByTaskId, tasksById]);

  const cloneTask = useCallback(async (task: TeamCanvasTask, nodeId: string): Promise<void> => {
    const draft = taskCloneDraftByTaskId[task.taskId];
    if (!draft || task.generatedSource) return;
    const title = draft.title.trim();
    const templateBindings = task.templateConfig
      ? Object.fromEntries(
          (task.templateConfig.parameters ?? []).map((parameter) => [
            parameter.id,
            (draft.templateBindings[parameter.id] ?? "").trim(),
          ]),
        )
      : undefined;

    setTaskCloneSavingByTaskId((current) => ({ ...current, [task.taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      await api.cloneTask(task.taskId, {
        ...(title ? { title } : {}),
        ...(templateBindings ? { templateBindings } : {}),
      });
      if (dataSource === "live") {
        await refreshLiveTasks();
      } else {
        const nextTasks = await api.listTasks();
        setTasks(nextTasks);
        setTaskNodes((current) => makeTaskNodes(nextTasks, liveTaskRefreshPositions(current)));
      }
      clearTaskCloneState(task.taskId);
      setExpandedTaskBranches((current) =>
        current.map((item) =>
          item.nodeId === nodeId ? { ...item, detailMode: null } : item
        )
      );
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskCloneSavingByTaskId((current) => {
        if (!(task.taskId in current)) return current;
        const next = { ...current };
        delete next[task.taskId];
        return next;
      });
    }
  }, [clearTaskCloneState, dataSource, refreshLiveTasks, setTasks, taskCloneDraftByTaskId]);

  const applyTaskParameterStateLocally = useCallback((taskId: string, templateBindings: Record<string, string>) => {
    const updatedAt = new Date().toISOString();
    setTasks((current) => current.map((task) => (
      task.taskId === taskId
        ? {
            ...task,
            templateState: {
              schemaVersion: "team/task-template-state-1",
              currentBindings: templateBindings,
              updatedAt,
            },
            updatedAt,
          }
        : task
    )));
  }, [setTasks]);

  const saveTaskParameters = useCallback(async (task: TeamCanvasTask): Promise<Record<string, string> | null> => {
    const draft = taskParameterDraftByTaskId[task.taskId];
    if (!draft || !task.templateConfig) return null;
    const templateBindings = normalizedTemplateBindings(task, draft.templateBindings);
    if (hasMissingRequiredTemplateBindings(task, templateBindings)) {
      setError("请先填写必填模板参数。");
      return null;
    }

    setTaskParameterSavingByTaskId((current) => ({ ...current, [task.taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const response = await api.updateTask(task.taskId, {
        templateState: {
          schemaVersion: "team/task-template-state-1",
          currentBindings: templateBindings,
          updatedAt: new Date().toISOString(),
        },
      });
      if (response.task.generatedSource) {
        replaceGeneratedTaskInCatalog(response.task);
      } else if (dataSource === "live") {
        applyTaskParameterStateLocally(task.taskId, templateBindings);
      } else {
        const nextTasks = await api.listTasks();
        setTasks(nextTasks);
        setTaskNodes((current) => makeTaskNodes(nextTasks, liveTaskRefreshPositions(current)));
      }
      openTaskParameterDraft(response.task);
      setError(null);
      return templateBindings;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setTaskParameterSavingByTaskId((current) => ({ ...current, [task.taskId]: false }));
    }
  }, [applyTaskParameterStateLocally, dataSource, openTaskParameterDraft, replaceGeneratedTaskInCatalog, setTasks, taskParameterDraftByTaskId]);

  const archiveTask = useCallback(async (task: TeamCanvasTask, nodeId?: string): Promise<boolean> => {
    const savingKey = nodeId ?? task.taskId;
    setTaskArchiveSavingNodeId(savingKey);
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      await api.archiveTask(task.taskId);
      if (dataSource === "live") {
        await refreshLiveTasks();
      } else {
        const nextTasks = await api.listTasks();
        setTasks(nextTasks);
        setTaskNodes((current) => makeTaskNodes(nextTasks, liveTaskRefreshPositions(current)));
      }
      closeTaskBranch(nodeId);
      setError(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setTaskArchiveSavingNodeId((current) => current === savingKey ? null : current);
    }
  }, [closeTaskBranch, dataSource, refreshLiveTasks]);

  const archiveGeneratedTask = useCallback(async (task: TeamCanvasTask): Promise<void> => {
    const taskId = task.taskId;
    const sourceDiscoveryTaskId = task.generatedSource?.sourceDiscoveryTaskId;
    if (!sourceDiscoveryTaskId) {
      setError("generated Task archive requires a Discovery source");
      return;
    }
    setGeneratedArchiveSavingByTaskId((current) => ({ ...current, [taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const response = await api.archiveTask(taskId);
      if (response.task.archived || response.task.status === "archived") {
        setGeneratedTasksByDiscoveryTaskId((current) => ({
          ...current,
          [sourceDiscoveryTaskId]: (current[sourceDiscoveryTaskId] ?? []).filter((generatedTask) => generatedTask.taskId !== taskId),
        }));
        clearGeneratedTaskPanelState(taskId);
        markGeneratedTaskArchived(taskId);
      }
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGeneratedArchiveSavingByTaskId((current) => {
        if (!(taskId in current)) return current;
        const next = { ...current };
        delete next[taskId];
        return next;
      });
    }
  }, [clearGeneratedTaskPanelState, dataSource, markGeneratedTaskArchived, setGeneratedTasksByDiscoveryTaskId]);

  const confirmRootArchive = useCallback(async () => {
    if (!rootArchiveConfirm || rootArchiveSaving) return;
    setRootArchiveSaving(true);
    const pending = rootArchiveConfirm;
    try {
      const items = pending.kind === "batch" ? pending.items : [pending];
      for (const item of items) {
        if (item.kind === "source") {
          const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
          await api.archiveSourceNode(item.sourceNodeId);
          if (dataSource === "live") {
            await refreshLiveTasks();
          } else {
            const [nextSources, nextConnections] = await Promise.all([
              api.listSourceNodes(),
              api.listSourceConnections(),
            ]);
            setSourceNodes(nextSources);
            setSourceAtlasNodes((current) => current.filter((node) =>
              nextSources.some((source) => source.sourceNodeId === node.sourceNodeId),
            ));
            setSourceConnections(nextConnections);
          }
          setMinimizedSourceNodeIds((current) => current.filter((id) => id !== item.nodeId));
        } else if (item.kind === "task") {
          const ok = await archiveTask(item.task, item.nodeId);
          if (!ok) return;
        } else if (item.kind === "agent") {
          setAgentNodes((current) => current.filter((node) => node.nodeId !== item.nodeId));
          setMinimizedAgentNodeIds((current) => current.filter((id) => id !== item.nodeId));
          setExpandedAgentBranch((current) => current?.nodeId === item.nodeId ? null : current);
        }
      }
      setRootArchiveConfirm(null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRootArchiveSaving(false);
    }
  }, [archiveTask, dataSource, refreshLiveTasks, rootArchiveConfirm, rootArchiveSaving]);

  const cancelRootArchive = useCallback(() => {
    if (!rootArchiveSaving) {
      setRootArchiveConfirm(null);
    }
  }, [rootArchiveSaving]);

  useEffect(() => {
    if (!rootArchiveConfirm || rootArchiveSaving) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setRootArchiveConfirm(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [rootArchiveConfirm, rootArchiveSaving]);

  const runTask = useCallback(async (task: TeamCanvasTask, nodeId?: string, overrideBindings?: Record<string, string>) => {
    const taskId = task.taskId;
    if (task.templateConfig && !overrideBindings && hasMissingRequiredTemplateBindings(task)) {
      openTaskParameterDraft(task);
      if (nodeId) {
        setExpandedTaskBranches((current) => current.map((item) =>
          item.nodeId === nodeId ? { ...item, detailMode: "parameters" } : item
        ));
      }
      setError(null);
      return;
    }
    setTaskRunSavingByTaskId((current) => ({ ...current, [taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const taskRun = await api.createTaskRun(taskId, overrideBindings ? { templateBindings: overrideBindings } : undefined);
      if (task.templateConfig && overrideBindings) {
        applyTaskParameterStateLocally(taskId, overrideBindings);
      }
      setTaskRunsByTaskId((current) => mergeTaskRun(current, taskId, taskRun));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskRunSavingByTaskId((current) => ({ ...current, [taskId]: false }));
    }
  }, [applyTaskParameterStateLocally, dataSource, openTaskParameterDraft]);

  const resetGeneratedTaskWorkUnit = useCallback(async (task: TeamCanvasTask) => {
    const taskId = task.taskId;
    if (!task.generatedSource) {
      setError("generated WorkUnit reset requires a generated task");
      return;
    }
    setGeneratedResetSavingByTaskId((current) => ({ ...current, [taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const response = await api.resetGeneratedTaskWorkUnit(taskId);
      replaceGeneratedTaskInCatalog(response.task);
      if (taskEditDraftByTaskId[taskId]) {
        replaceTaskEditDraft(response.task);
      }
      setTaskEditWarning(taskId, response.warnings?.join(" ") ?? null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGeneratedResetSavingByTaskId((current) => ({ ...current, [taskId]: false }));
    }
  }, [dataSource, replaceGeneratedTaskInCatalog, replaceTaskEditDraft, setTaskEditWarning, taskEditDraftByTaskId]);

  const beginTaskPortConnection = useCallback((taskId: string, port: TeamTaskOutputPort) => {
    setTaskConnectionDraft({
      fromTaskId: taskId,
      fromOutputPortId: port.id,
      type: port.type,
    });
    setSourceConnectionDraft(null);
    setError(null);
  }, []);

  const beginSourcePortConnection = useCallback((sourceNodeId: string, sourcePort: TeamCanvasSourceNode["outputPort"]) => {
    setSourceConnectionDraft({
      fromSourceNodeId: sourceNodeId,
      fromOutputPortId: sourcePort.id,
      type: sourcePort.type,
    });
    setTaskConnectionDraft(null);
    setError(null);
  }, []);

  const completeTaskPortConnection = useCallback(async (taskId: string, port: TeamTaskInputPort) => {
    if (!taskConnectionDraft && !sourceConnectionDraft) {
      setError("请先选择一个输出端口");
      return;
    }
    if (taskConnectionDraft?.fromTaskId === taskId) {
      setError("不能把 Task 输出连接回自己");
      return;
    }
    const draftType = taskConnectionDraft?.type ?? sourceConnectionDraft!.type;
    if (draftType !== port.type) {
      setError(`端口类型不匹配: ${draftType} -> ${port.type}`);
      return;
    }
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      if (taskConnectionDraft) {
        const connection = await api.createTaskConnection({
          fromTaskId: taskConnectionDraft.fromTaskId,
          fromOutputPortId: taskConnectionDraft.fromOutputPortId,
          toTaskId: taskId,
          toInputPortId: port.id,
        });
        setTaskConnections((current) => [
          ...current.filter((candidate) => candidate.connectionId !== connection.connectionId),
          connection,
        ]);
      } else if (sourceConnectionDraft && api instanceof LiveTeamApi) {
        const connection = await api.createSourceConnection({
          fromSourceNodeId: sourceConnectionDraft.fromSourceNodeId,
          fromOutputPortId: sourceConnectionDraft.fromOutputPortId,
          toTaskId: taskId,
          toInputPortId: port.id,
        });
        setSourceConnections((current) => [
          ...current.filter((candidate) => candidate.connectionId !== connection.connectionId),
          connection,
        ]);
      }
      setTaskConnectionDraft(null);
      setSourceConnectionDraft(null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [dataSource, sourceConnectionDraft, taskConnectionDraft]);

  const beginTaskDependency = useCallback((taskId: string) => {
    if (taskDependencyDraft?.fromTaskId === taskId) {
      setTaskDependencyDraft(null);
    } else {
      setTaskDependencyDraft({ fromTaskId: taskId });
      setTaskConnectionDraft(null);
      setSourceConnectionDraft(null);
    }
  }, [taskDependencyDraft]);

  const completeTaskDependency = useCallback(async (toTaskId: string) => {
    if (!taskDependencyDraft) return;
    if (taskDependencyDraft.fromTaskId === toTaskId) {
      setTaskDependencyDraft(null);
      return;
    }
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const dep = await api.createTaskDependency({
        fromTaskId: taskDependencyDraft.fromTaskId,
        toTaskId,
      });
      setTaskDependencies((current) => {
        if (current.some((d) => d.dependencyId === dep.dependencyId)) return current;
        return [...current, dep];
      });
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error ? String(error.message) : "创建依赖失败";
      setError(message);
    } finally {
      setTaskDependencyDraft(null);
    }
  }, [dataSource, taskDependencyDraft]);

  const [pendingDeleteTaskConnectionId, setPendingDeleteTaskConnectionId] = useState<string | null>(null);
  const [pendingDeleteSourceConnectionId, setPendingDeleteSourceConnectionId] = useState<string | null>(null);
  const [pendingDeleteDependencyId, setPendingDeleteDependencyId] = useState<string | null>(null);

  const deleteTaskConnection = useCallback(async (connectionId: string) => {
    setPendingDeleteTaskConnectionId(connectionId);
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      await api.deleteTaskConnection(connectionId);
      setTaskConnections((current) => current.filter((c) => c.connectionId !== connectionId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPendingDeleteTaskConnectionId(null);
    }
  }, [dataSource]);

  const deleteSourceConnectionAction = useCallback(async (connectionId: string) => {
    setPendingDeleteSourceConnectionId(connectionId);
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      await api.deleteSourceConnection(connectionId);
      setSourceConnections((current) => current.filter((c) => c.connectionId !== connectionId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPendingDeleteSourceConnectionId(null);
    }
  }, [dataSource]);

  const deleteTaskDependencyAction = useCallback(async (dependencyId: string) => {
    setPendingDeleteDependencyId(dependencyId);
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      await api.deleteTaskDependency(dependencyId);
      setTaskDependencies((current) => current.filter((d) => d.dependencyId !== dependencyId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPendingDeleteDependencyId(null);
    }
  }, [dataSource]);

  const createTextSourceNode = useCallback(async () => {
    if (dataSource !== "live") return;
    try {
      const api = new LiveTeamApi();
      const sourceNode = await api.createSourceNode({
        title: "文本输出",
        nodeType: "text",
        outputPort: { id: "value", label: "文本", type: "string" },
        content: { text: "" },
      });
      setSourceNodes((current) => {
        const next = [...current.filter((candidate) => candidate.sourceNodeId !== sourceNode.sourceNodeId), sourceNode];
        setSourceAtlasNodes((nodes) => makeSourceNodes(next, liveSourceRefreshPositions(nodes)));
        return next;
      });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [dataSource]);

  const createFileSourceNode = useCallback(async (file: File) => {
    if (dataSource !== "live") return;
    const type = inferSourceFileType(file);
    try {
      const api = new LiveTeamApi();
      const sourceNode = await api.createSourceNode({
        title: file.name,
        nodeType: "file",
        outputPort: { id: "value", label: "文件", type },
        content: {
          fileName: file.name,
          mimeType: file.type || undefined,
          size: file.size,
        },
      });
      setSourceNodes((current) => {
        const next = [...current.filter((candidate) => candidate.sourceNodeId !== sourceNode.sourceNodeId), sourceNode];
        setSourceAtlasNodes((nodes) => makeSourceNodes(next, liveSourceRefreshPositions(nodes)));
        return next;
      });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [dataSource]);

  const updateTextSourceNode = useCallback(async (sourceNodeId: string, text: string) => {
    const currentNode = sourceNodesById.get(sourceNodeId);
    if (!currentNode || currentNode.nodeType !== "text" || currentNode.content?.text === text) return;
    try {
      const api = new LiveTeamApi();
      const sourceNode = await api.updateSourceNode(sourceNodeId, {
        content: {
          ...currentNode.content,
          text,
        },
      });
      setSourceNodes((current) => current.map((candidate) => (
        candidate.sourceNodeId === sourceNode.sourceNodeId ? sourceNode : candidate
      )));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [sourceNodesById]);

  const cancelTaskRun = useCallback(async (task: TeamCanvasTask, taskRun: TeamRunState) => {
    const taskId = task.taskId;
    setTaskRunSavingByTaskId((current) => ({ ...current, [taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const cancelledRun = await api.cancelTaskRun(taskRun.runId);
      setTaskRunsByTaskId((current) => mergeTaskRun(current, taskId, cancelledRun));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskRunSavingByTaskId((current) => ({ ...current, [taskId]: false }));
    }
  }, [dataSource]);

  useEffect(() => {
    if (runObserverTargets.length === 0) return;

    let cancelled = false;
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();

    async function refreshTaskRunObserver(target: typeof runObserverTargets[number]) {
      const runId = target.runId;
      const observedTaskId = target.taskId;
      setTaskRunObserverByRunId((current) => ({
        ...current,
        [runId]: {
          loading: true,
          attempts: current[runId]?.attempts ?? [],
          files: current[runId]?.files ?? {},
          error: null,
          lastUpdatedAt: current[runId]?.lastUpdatedAt ?? null,
        },
      }));

      try {
        const { run: freshRun, attempts } = await api.getTaskRunProcessSummary(runId, observedTaskId);
        if (cancelled) return;

        setTaskRunsByTaskId((current) => mergeTaskRun(current, observedTaskId, freshRun));
        if (dataSource === "live" && isActiveRun(target.status) && !isActiveRun(freshRun.status)) {
          void refreshLiveTasks({ silent: true }).catch((e) => {
            if (!cancelled) setError(errorMessage(e));
          });
          scheduleLiveTaskDiscoveryRefresh();
        }
        setTaskRunObserverByRunId((current) => ({
          ...current,
          [runId]: {
            loading: false,
            attempts,
            files: current[runId]?.files ?? {},
            error: null,
            lastUpdatedAt: new Date().toISOString(),
          },
        }));

        const descriptors = buildTaskRunFileDescriptors(attempts);
        const fileEntries = await Promise.all(descriptors.map(async (descriptor) => {
          try {
            const content = await api.readTaskRunAttemptFile(
              runId,
              observedTaskId,
              descriptor.attemptId,
              descriptor.fileName,
            );
            return [descriptor.key, { content }] as const;
          } catch (e) {
            return [descriptor.key, { error: errorMessage(e) }] as const;
          }
        }));
        if (
          fileEntries.length === 0 ||
          !runObserverOpenTargetKeysRef.current.has(`${dataSource}\u0000${observedTaskId}\u0000${runId}`)
        ) return;
        setTaskRunObserverByRunId((current) => ({
          ...current,
          [runId]: {
            loading: false,
            attempts: current[runId]?.attempts ?? attempts,
            files: {
              ...(current[runId]?.files ?? {}),
              ...Object.fromEntries(fileEntries),
            },
            error: null,
            lastUpdatedAt: current[runId]?.lastUpdatedAt ?? new Date().toISOString(),
          },
        }));
      } catch (e) {
        if (cancelled) return;
        const isActiveObserverPoll = isActiveRun(target.status);
        setTaskRunObserverByRunId((current) => ({
          ...current,
          [runId]: {
            loading: false,
            attempts: current[runId]?.attempts ?? [],
            files: current[runId]?.files ?? {},
            error: isActiveObserverPoll ? null : errorMessage(e),
            lastUpdatedAt: current[runId]?.lastUpdatedAt ?? null,
          },
        }));
      }
    }

    const targetRefreshKey = (target: typeof runObserverTargets[number]) => (
      `${dataSource}\u0000${target.taskId}\u0000${target.runId}\u0000${target.status}`
    );

    const initialRefreshTargets = runObserverTargets.filter((target) => {
      const key = targetRefreshKey(target);
      if (runObserverInitialRefreshKeysRef.current.has(key)) return false;
      runObserverInitialRefreshKeysRef.current.add(key);
      return true;
    });

    async function refreshTaskRunObservers(targets = runObserverTargets) {
      await Promise.all(targets.map((target) => refreshTaskRunObserver(target)));
    }

    const shouldPoll = runObserverTargets.some((target) => isActiveRun(target.status));
    if (initialRefreshTargets.length > 0) {
      void refreshTaskRunObservers(initialRefreshTargets);
    }
    if (!shouldPoll) {
      return () => {
        cancelled = true;
      };
    }

    const timer = globalThis.setInterval(() => {
      void refreshTaskRunObservers();
    }, 2000);

    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [dataSource, refreshLiveTasks, runObserverTargetSignature, scheduleLiveTaskDiscoveryRefresh, setError]);

  const canCreateTask = dataSource === "live" && agents.length > 0;
  const canRefreshTasks = dataSource === "live" && !liveTasksRefreshing;
  const selectedTaskNodeEntries = selectedAtlasEntries.filter((entry): entry is Extract<AtlasSelectedNodeEntry, { kind: "task" }> => entry.kind === "task");
  const canCreateTaskGroup = selectedTaskNodeEntries.length >= 2;
  const createTaskGroupFromSelection = useCallback(() => {
    const taskNodeIds = Array.from(new Set(selectedTaskNodeEntries.map((entry) => entry.nodeId)));
    if (taskNodeIds.length < 2) return;
    setTaskGroups((current) => {
      const nextIndex = current.length + 1;
      return [
        ...current,
        {
          groupId: `task-group-${Date.now().toString(36)}-${nextIndex}`,
          title: `Group ${nextIndex}`,
          taskNodeIds,
          collapsed: false,
        },
      ];
    });
  }, [selectedTaskNodeEntries]);

  const toggleTaskGroup = useCallback((groupId: string) => {
    setTaskGroups((current) => current.map((group) => (
      group.groupId === groupId ? { ...group, collapsed: !group.collapsed } : group
    )));
  }, []);

  const agentToolbar = (
    <div className="agent-atlas-actions">
      <div className="root-filter-segment" data-active-filter={rootNodeFilter} role="tablist" aria-label="根节点显示">
        <button type="button" role="tab" aria-pressed={rootNodeFilter === "all"} className={`root-filter-btn${rootNodeFilter === "all" ? " is-active" : ""}`} onClick={() => setRootNodeFilter("all")}>ALL</button>
        <button type="button" role="tab" aria-pressed={rootNodeFilter === "agent"} className={`root-filter-btn${rootNodeFilter === "agent" ? " is-active" : ""}`} onClick={() => setRootNodeFilter("agent")}>Agent</button>
        <button type="button" role="tab" aria-pressed={rootNodeFilter === "task"} className={`root-filter-btn${rootNodeFilter === "task" ? " is-active" : ""}`} onClick={() => setRootNodeFilter("task")}>Task</button>
      </div>
      <div className="agent-toolbar-group agent-toolbar-agent-group">
        <button
          type="button"
          className="agent-add-btn"
          onClick={() => {
            setTaskLeaderPickerOpen(false);
            setAgentPickerOpen((open) => !open);
          }}
          aria-expanded={agentPickerOpen}
        >
          添加 Agent
        </button>
        {agentPickerOpen && (
          <div className="agent-picker" aria-label="Agent catalog">
            {agents.map((agent) => {
              const joined = addedAgentIds.has(agent.agentId);
              return (
                <button
                  key={agent.agentId}
                  type="button"
                  className="agent-picker-option"
                  disabled={joined}
                  onClick={() => addAgentNode(agent.agentId)}
                >
                  <span className="agent-picker-name">{agent.name}</span>
                  <code>{agent.agentId}</code>
                  {joined && <span className="agent-picker-status">已加入</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="agent-atlas-stats" aria-label="画布统计">
        <span className="agent-atlas-count" aria-label="Agent 数量">
          <strong>{agentNodes.length}</strong>
          <span> Agent</span>
        </span>
        <span className="agent-atlas-count task-atlas-count" aria-label="当前 Task 数量">
          <strong>{tasks.length}</strong>
          <span> 个 Task</span>
        </span>
        <span className="agent-atlas-count source-atlas-count" aria-label="输出节点数量">
          <strong>{sourceNodes.length}</strong>
          <span> Source</span>
        </span>
      </div>
      <div className="agent-toolbar-group task-toolbar-group" aria-label="Task 操作">
        <button
          type="button"
          className="agent-add-btn task-create-btn"
          disabled={!canCreateTask}
          onClick={() => {
            setAgentPickerOpen(false);
            setTaskLeaderPickerOpen((open) => !open);
          }}
          aria-expanded={taskLeaderPickerOpen}
        >
          创建 Task
        </button>
        <button
          type="button"
          className="agent-add-btn task-refresh-btn"
          disabled={!canRefreshTasks}
          onClick={() => {
            void refreshLiveTasks().catch((e) => setError(errorMessage(e)));
          }}
        >
          {liveTasksRefreshing ? "刷新中..." : "刷新 Task"}
        </button>
        <button
          type="button"
          className="agent-add-btn task-group-create-btn"
          disabled={!canCreateTaskGroup}
          onClick={createTaskGroupFromSelection}
        >
          创建 Group{selectedTaskNodeEntries.length > 0 ? ` (${selectedTaskNodeEntries.length})` : ""}
        </button>
        {taskLeaderPickerOpen && (
          <div className="agent-picker task-leader-picker" aria-label="Task leader catalog">
            {agents.map((agent) => (
              <button
                key={agent.agentId}
                type="button"
                className="agent-picker-option"
                onClick={() => openTaskCreateBranch(agent.agentId)}
              >
                <span className="agent-picker-name">{agent.name}</span>
                <code>{agent.agentId}</code>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="agent-toolbar-group source-toolbar-group" aria-label="输出节点">
        <button
          type="button"
          className="agent-add-btn source-create-btn"
          disabled={dataSource !== "live"}
          onClick={() => void createTextSourceNode()}
        >
          文本输出
        </button>
        <button
          type="button"
          className="agent-add-btn source-create-btn"
          disabled={dataSource !== "live"}
          onClick={() => sourceFileInputRef.current?.click()}
        >
          文件输出
        </button>
        <input
          ref={sourceFileInputRef}
          type="file"
          className="sr-only"
          aria-label="选择输出文件"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void createFileSourceNode(file);
            }
            event.currentTarget.value = "";
          }}
        />
      </div>
    </div>
  );

  const mapToolbarControls = (
    <div className="map-toolbar-controls" aria-label="全局视图设置">
      <button
        type="button"
        className="theme-toggle-btn"
        aria-label="切换主题"
        aria-pressed={theme === "dark"}
        onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
      >
        <span className="theme-toggle-track" aria-hidden="true">
          <span className="theme-toggle-icon theme-toggle-sun">☀</span>
          <span className="theme-toggle-icon theme-toggle-moon">☾</span>
          <span className="theme-toggle-thumb" />
        </span>
      </button>
      <select
        id="team-console-data-source"
        name="teamConsoleDataSource"
        value={dataSource}
        onChange={(event) => {
          const nextSource = event.target.value as DataSource;
          setDataSource(nextSource);
        }}
        className="datasource-select"
        aria-label="数据来源"
      >
        <option value="mock">示例数据</option>
        <option value="live">实时 API</option>
      </select>
    </div>
  );

  const expandedAgentBranchMode = expandedAgentBranch?.mode ?? "chat";
  const expandedAgentBranchLabel = expandedAgentBranchMode === "task-create" ? "创建 Task" : "主项目对话";
  const expandedAgentIframeTitle = expandedAgentBranchMode === "task-create"
    ? `${expandedAgent?.name ?? ""} Task 创建`
    : `${expandedAgent?.name ?? ""} 主项目对话`;

  const expandedAgentBranchPanel = expandedAgentNode && expandedAgent ? (
    <section className="agent-playground-branch emap-dialog-branch" aria-label={`${expandedAgent.name} ${expandedAgentBranchLabel}`}>
      <header className="agent-playground-branch-head">
        <div className="agent-playground-branch-title">
          <span>{expandedAgentBranchLabel}</span>
          <strong>{expandedAgent.name}</strong>
          <code>{expandedAgent.agentId}</code>
        </div>
        <button
          type="button"
          className="agent-playground-branch-collapse"
          onClick={() => {
            refreshLiveTasksAfterLeavingTaskCreateBranch(expandedAgentBranch);
            setExpandedAgentBranch(null);
          }}
          aria-label={`收起 ${expandedAgent.name} ${expandedAgentBranchLabel}分支`}
        >
          收起
        </button>
      </header>
      {expandedAgentBranchMode === "task-create" && (
        <div className="task-leader-branch-hint">
          在对话中使用 <code>/team-task</code> 创建 Task。Team Console 只负责打开 leader 对话。
        </div>
      )}
      <iframe
        className="agent-playground-iframe"
        title={expandedAgentIframeTitle}
        src={buildAgentPlaygroundUrl(expandedAgent.agentId, expandedAgentBranchMode)}
        referrerPolicy="no-referrer"
      />
    </section>
  ) : null;

  const taskBranchPanelItems = expandedTaskBranches.flatMap((branch) => {
    const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
    const task = node ? tasksById.get(node.taskId) ?? null : null;
    if (!node || !task) return [];
    const runs = taskRunsByTaskId[task.taskId] ?? [];
    const latestRun = selectLatestRun(runs);
    const activeRun = runs.find((taskRun) => isActiveRun(taskRun.status)) ?? null;
    const runSaving = Boolean(taskRunSavingByTaskId[task.taskId]);
    const detailMode = branch.detailMode ?? null;
    const runButtonLabel = runSaving ? "\u542f\u52a8\u4e2d..." : activeRun ? "\u8fd0\u884c\u4e2d" : latestRun ? "\u91cd\u65b0\u8fd0\u884c" : "\u8fd0\u884c";
    const runSummaryLabel = latestRun && isActiveRun(latestRun.status) ? "\u8fd0\u884c\u4e2d" : "\u6700\u8fd1\u8fd0\u884c";
    const latestRunIsObserved = Boolean(
      latestRun
        && detailMode === "run-observer"
        && branch.observedRunId === latestRun.runId,
    );
    const taskDeleteConfirming = taskArchiveConfirmNodeId === branch.nodeId;
    const taskDeleteSaving = taskArchiveSavingNodeId === branch.nodeId;
    const anyTaskArchiveSaving = Boolean(taskArchiveSavingNodeId);
    return [{
      id: taskMenuPanelId(branch.nodeId),
      nodeId: branch.nodeId,
      panel: (
        <section className="task-leader-branch task-action-branch emap-menu-branch" aria-label={`${task.title} Task \u64cd\u4f5c`}>
          <header className="task-leader-branch-head">
            <div className="task-leader-branch-title">
              <span>{"Task \u64cd\u4f5c"}</span>
              <strong>{task.title}</strong>
              <code>{task.taskId}</code>
            </div>
            <button
              type="button"
              className="task-leader-branch-collapse"
              onClick={() => closeTaskBranch(branch.nodeId)}
              aria-label={`\u6536\u8d77 ${task.title} Task \u64cd\u4f5c`}
            >
              {"\u6536\u8d77"}
            </button>
          </header>
          <div className="task-action-menu" aria-label={`${task.title} \u64cd\u4f5c\u83dc\u5355`}>
            <button
              type="button"
              className="task-action-menu-button"
              disabled={runSaving || Boolean(activeRun) || task.status !== "ready"}
              title={task.status === "ready" ? "\u542f\u52a8\u8fd9\u4e2a Task \u7684 WorkUnit run" : "\u53ea\u6709 ready Task \u53ef\u4ee5\u8fd0\u884c"}
              onClick={() => {
                void runTask(task, branch.nodeId);
              }}
            >
              {runButtonLabel}
            </button>
            {activeRun && (
              <button
                type="button"
                className="task-action-menu-button"
                disabled={runSaving}
                onClick={() => {
                  void cancelTaskRun(task, activeRun);
                }}
              >
                {"\u505c\u6b62"}
              </button>
            )}
            {latestRun && (
              <button
                type="button"
                className="task-run-summary"
                aria-label={`${task.title} ${runSummaryLabel} ${RUN_STATUS_LABELS[latestRun.status]} phase ${taskRunPhase(latestRun, task.taskId)}`}
                onClick={() => (
                  latestRunIsObserved
                    ? setExpandedTaskBranches((current) => current.map((item) => (
                      item.nodeId === branch.nodeId
                        ? { ...item, detailMode: null, observedRunId: undefined, selectedFileKeys: [] }
                        : item
                    )))
                    : setExpandedTaskBranches((current) =>
                      current.map((item) =>
                        item.nodeId === branch.nodeId
                          ? { ...item, detailMode: "run-observer", observedRunId: latestRun.runId, selectedFileKeys: [] }
                          : item
                      )
                    )
                )}
              >
                <span className="task-run-summary-kicker">{runSummaryLabel}</span>
                <span className="task-run-summary-head">
                  <strong>{RUN_STATUS_LABELS[latestRun.status]}</strong>
                  <em>{latestRunIsObserved ? "\u6536\u8d77\u8f93\u51fa" : "\u67e5\u770b\u8f93\u51fa"}</em>
                </span>
                <span className="task-run-summary-metrics">
                  <span><b>{"\u9636\u6bb5"}</b><strong>{taskRunPhase(latestRun, task.taskId)}</strong></span>
                  <span><b>{"\u8017\u65f6"}</b><strong>{taskRunElapsed(latestRun)}</strong></span>
                  <span><b>Attempts</b><strong>{taskRunAttempts(latestRun, task.taskId)}</strong></span>
                </span>
                <span className="task-run-summary-message">{taskRunMessage(latestRun, task.taskId)}</span>
                <code>{latestRun.runId}</code>
              </button>
            )}
            <button
              type="button"
              className="task-action-menu-button"
              onClick={() => {
                if (detailMode === "run-history") {
                  setExpandedTaskBranches((current) => current.map((item) => (
                    item.nodeId === branch.nodeId
                      ? { ...item, detailMode: null, runHistoryTaskId: undefined, observedRunId: undefined, selectedFileKeys: [] }
                      : item
                  )));
                  closeTaskRunHistory();
                } else {
                  openTaskRunHistory(task.taskId, branch.nodeId);
                }
              }}
            >
              运行记录
            </button>
            <button
              type="button"
              className="task-action-menu-button"
              onClick={() => {
                if (detailMode === "clone") {
                  clearTaskCloneState(task.taskId);
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                    )
                  );
                } else {
                  openTaskCloneDraft(task);
                  setTaskArchiveConfirmNodeId(null);
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId
                        ? { ...item, detailMode: "clone" }
                        : item
                    )
                  );
                }
              }}
            >
              复制
            </button>
            {task.templateConfig && (
              <button
                type="button"
                className="task-action-menu-button"
                onClick={() => {
                  if (detailMode === "parameters") {
                    clearTaskParameterState(task.taskId);
                    setExpandedTaskBranches((current) =>
                      current.map((item) =>
                        item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                      )
                    );
                  } else {
                    openTaskParameterDraft(task);
                    setTaskArchiveConfirmNodeId(null);
                    setExpandedTaskBranches((current) =>
                      current.map((item) =>
                        item.nodeId === branch.nodeId
                          ? { ...item, detailMode: "parameters" }
                          : item
                      )
                    );
                  }
                }}
              >
                参数
              </button>
            )}
            <button
              type="button"
              className="task-action-menu-button"
              onClick={() => {
                if (detailMode === "edit") {
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                    )
                  );
                } else {
                  openTaskEditDraft(task);
                  setTaskArchiveConfirmNodeId(null);
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId
                        ? { ...item, detailMode: "edit" }
                        : item
                    )
                  );
                }
              }}
            >
              {"\u7f16\u8f91"}
            </button>
            <button
              type="button"
              className="task-action-menu-button"
              onClick={() => {
                if (detailMode === "leader-chat") {
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                    )
                  );
                } else {
                  setTaskArchiveConfirmNodeId(null);
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId
                        ? { ...item, detailMode: "leader-chat" }
                        : item
                    )
                  );
                  clearTaskLeaderCopy(task.taskId);
                }
              }}
            >
              {"\u5bf9\u8bdd Leader"}
            </button>
            {task.canvasKind === "discovery" && !task.generatedSource && (
              <button
                type="button"
                className="task-action-menu-button"
                onClick={() => {
                  if (branch.discoveryGeneratedEditTaskId) {
                    clearTaskEditState(branch.discoveryGeneratedEditTaskId);
                  }
                  const nextDetailMode = detailMode === "discovery-subcanvas" ? null : "discovery-subcanvas";
                  if (detailMode === "discovery-subcanvas") {
                    clearGeneratedArchiveUiForTasks(
                      (generatedTasksByDiscoveryTaskId[task.taskId] ?? []).map((generatedTask) => generatedTask.taskId),
                    );
                  }
                  setTaskArchiveConfirmNodeId(null);
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId
                        ? {
                            ...item,
                            detailMode: nextDetailMode,
                            observedRunId: undefined,
                            selectedFileKeys: [],
                            discoveryGeneratedObserver: undefined,
                            discoveryGeneratedEditTaskId: undefined,
                            discoveryQueueExpanded: false,
                          }
                        : item
                    )
                  );
                }}
              >
                Discovery 子画布
              </button>
            )}
            {taskDeleteConfirming ? (
              <div className="task-delete-confirm" role="group" aria-label={`${task.title} \u5220\u9664\u786e\u8ba4`}>
                <p>{"\u5220\u9664\u4f1a\u8c03\u7528 archive \u8f6f\u5f52\u6863\uff0c\u4e0d\u4f1a\u542f\u52a8 Task run\uff0c\u4e5f\u4e0d\u4f1a\u628a Task \u5b9a\u4e49\u5199\u5165 localStorage\u3002"}</p>
                <div className="task-delete-actions">
                  <button
                    type="button"
                    className="task-action-menu-button"
                    disabled={anyTaskArchiveSaving}
                    onClick={() => setTaskArchiveConfirmNodeId(null)}
                  >
                    {"\u53d6\u6d88"}
                  </button>
                  <button
                    type="button"
                    className="task-action-menu-button danger"
                    disabled={anyTaskArchiveSaving}
                    onClick={() => {
                      void archiveTask(task, branch.nodeId);
                    }}
                  >
                    {taskDeleteSaving ? "\u5220\u9664\u4e2d..." : "\u786e\u8ba4\u5220\u9664"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="task-action-menu-button danger"
                disabled={anyTaskArchiveSaving}
                onClick={() => {
                  setTaskArchiveConfirmNodeId(branch.nodeId);
                }}
              >
                {"\u5220\u9664"}
              </button>
            )}
          </div>
        </section>
      ),
    }];
  });
  const taskChildBranchPanels = useMemo(() => {
    const panels: Array<{
      id: string;
      panel: ReactNode;
      width?: number;
      height?: number;
      sourceId?: string;
      autoHeight?: boolean;
      resizable?: boolean;
      maximizable?: boolean;
      interactive?: boolean;
      minWidth?: number;
      minHeight?: number;
    }> = [];

    for (const branch of expandedTaskBranches) {
      const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
      const task = node ? tasksById.get(node.taskId) ?? null : null;
      if (!node || !task) continue;
      const menuPanelId = taskMenuPanelId(branch.nodeId);
      const runHistoryPanelId = `run-history-${branch.nodeId}`;

      if (branch.detailMode === "run-history") {
        const historyTaskId = branch.runHistoryTaskId ?? activeRunHistoryTaskId ?? task.taskId;
        const historyTask = historyTaskId
          ? tasksById.get(historyTaskId) ?? generatedTasksById.get(historyTaskId) ?? task
          : task;
        panels.push({
          id: runHistoryPanelId,
          width: 520,
          autoHeight: true,
          sourceId: menuPanelId,
          panel: (
            <section className="emap-run-history-panel" aria-label={`${historyTask.title} 运行记录`}>
              <header className="emap-run-history-head">
                <div className="emap-run-history-title">
                  <span>运行记录</span>
                  <strong>{historyTask.title}</strong>
                  <code>{historyTask.taskId}</code>
                </div>
                <button
                  type="button"
                  className="emap-run-history-close"
                  onClick={() => {
                    setExpandedTaskBranches((current) => current.map((item) => (
                      item.nodeId === branch.nodeId
                        ? { ...item, detailMode: null, runHistoryTaskId: undefined, observedRunId: undefined, selectedFileKeys: [] }
                        : item
                    )));
                    closeTaskRunHistory();
                  }}
                  aria-label={`收起 ${historyTask.title} 运行记录`}
                >
                  收起
                </button>
              </header>
              <div className="emap-run-history-toolbar">
                <label className="emap-run-history-archive-toggle">
                  <input
                    type="checkbox"
                    checked={runHistoryIncludeArchived}
                    onChange={(event) => setRunHistoryIncludeArchived(event.currentTarget.checked)}
                  />
                  显示已归档
                </label>
                <span className="emap-run-history-count">{runHistoryItems.length} / {runHistoryTotal}</span>
              </div>
              {runHistoryError && (
                <div className="emap-run-history-error" role="status">{runHistoryError}</div>
              )}
              <div className="emap-run-history-list" aria-label={`${historyTask.title} run history list`}>
                {runHistoryItems.map((item) => {
                  const run = item.run;
                  const taskState = run.taskStates?.[item.annotation.taskId] ?? null;
                  const selected = branch.observedRunId === run.runId || selectedRunHistoryRunId === run.runId;
                  const saving = runHistorySavingRunId === run.runId;
                  const errorSummary = taskRunErrorSummary(run, item.annotation.taskId);
                  return (
                    <article
                      key={run.runId}
                      className={`emap-run-history-item ${selected ? "selected" : ""} ${item.annotation.best ? "best" : ""} ${item.annotation.archived ? "archived" : ""}`}
                      data-run-id={run.runId}
                    >
                      <button
                        type="button"
                        className="emap-run-history-row"
                        aria-label={`${run.runId} ${RUN_STATUS_LABELS[run.status]} 运行详情`}
                        onClick={() => {
                          selectRunHistoryItem(item);
                          setRunHistoryAnalysisCopyState("idle");
                          setRunHistoryAnalysisManualText(null);
                          setExpandedTaskBranches((current) => current.map((candidate) => (
                            candidate.nodeId === branch.nodeId
                              ? { ...candidate, detailMode: "run-history", runHistoryTaskId: historyTask.taskId, observedRunId: run.runId, selectedFileKeys: [] }
                              : candidate
                          )));
                        }}
                      >
                        <span className="emap-run-history-trigger">{taskRunTriggerLabel(run)}</span>
                        <span className="emap-run-history-status">
                          <strong>{RUN_STATUS_LABELS[run.status]}</strong>
                          <small>{taskState?.status ?? "unknown"}</small>
                        </span>
                        <span className="emap-run-history-duration">
                          <strong>{taskRunElapsed(run)}</strong>
                          <small>{taskRunResultRef(run, item.annotation.taskId)}</small>
                        </span>
                        <code>{run.runId}</code>
                        {item.annotation.best && <span className="emap-run-history-badge best">最佳</span>}
                        {item.annotation.archived && <span className="emap-run-history-badge archived">已归档</span>}
                        {item.annotation.note && <small className="emap-run-history-note">{item.annotation.note}</small>}
                        {errorSummary !== "无" && <span className="emap-run-history-row-error">{errorSummary}</span>}
                      </button>
                      <div className="emap-run-history-actions">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => { void patchRunHistoryAnnotation(item, { best: !item.annotation.best }); }}
                        >
                          {item.annotation.best ? "取消最佳" : "标为最佳"}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => { void patchRunHistoryAnnotation(item, { archived: !item.annotation.archived }); }}
                        >
                          {item.annotation.archived ? "恢复记录" : "归档记录"}
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!runHistoryLoading && runHistoryItems.length === 0 && (
                  <div className="emap-run-history-empty">暂无可见运行记录。</div>
                )}
                {runHistoryLoading && (
                  <div className="emap-run-history-empty" role="status">正在加载运行记录...</div>
                )}
                {runHistoryItems.length < runHistoryTotal && (
                  <button
                    type="button"
                    className="emap-run-history-load-more"
                    disabled={runHistoryLoading}
                    onClick={() => { void loadMoreRunHistory(); }}
                  >
                    加载更多
                  </button>
                )}
              </div>
            </section>
          ),
        });
      }

      if (branch.detailMode === "discovery-subcanvas" && task.canvasKind === "discovery" && !task.generatedSource) {
        const activeDiscoveryRun = selectActiveDiscoveryRootRun(task.taskId, taskRunsByTaskId);
        const generatedTasks = sortDiscoveryGeneratedTasksForSubcanvas(
          (generatedTasksByDiscoveryTaskId[task.taskId] ?? []).filter((generatedTask) => !generatedTask.archived),
          taskRunsByTaskId,
          task.taskId,
          activeDiscoveryRun,
        );
        const dispatchDiagnostics = discoveryDispatchDiagnosticsByTaskId[task.taskId] ?? [];
        const discoveryConcurrency = Math.max(1, task.discoverySpec?.autoRun?.concurrency ?? 3);
        const discoverySubcanvasStyle = {
          "--discovery-running-columns": String(discoveryConcurrency),
          "--discovery-queue-columns": String(discoveryConcurrency * 2),
        } as CSSProperties;
        const generatedTaskCards = generatedTasks.map((generatedTask, generatedTaskIndex) => {
          const generatedSource = generatedTask.generatedSource;
          const itemStatus = generatedSource?.itemStatus ?? "active";
          const workUnitMode = generatedSource?.workUnitMode ?? "managed";
          const generatedRuns = visibleDiscoveryGeneratedRuns(generatedTask, task.taskId, activeDiscoveryRun, taskRunsByTaskId);
          const latestGeneratedRun = selectLatestRun(generatedRuns);
          const activeGeneratedRun = generatedRuns.find((taskRun) => isActiveRun(taskRun.status)) ?? null;
          const runSaving = Boolean(taskRunSavingByTaskId[generatedTask.taskId]);
          const resetSaving = Boolean(generatedResetSavingByTaskId[generatedTask.taskId]);
          const archiveSaving = Boolean(generatedArchiveSavingByTaskId[generatedTask.taskId]);
          const latestRunStatus = latestGeneratedRun?.status ?? "none";
          const generatedIsEditing = branch.discoveryGeneratedEditTaskId === generatedTask.taskId;
          const archiveConfirmOpen = generatedArchiveConfirmTaskId === generatedTask.taskId;
          const summaryResetAvailable = (generatedSource as { canResetToManaged?: boolean } | undefined)?.canResetToManaged === true;
          const canResetToManaged = workUnitMode === "customized"
            && (Boolean(generatedSource?.latestManagedWorkUnit) || summaryResetAvailable);
          const waitingForCurrentDiscoveryRun = Boolean(activeDiscoveryRun) && generatedSource?.latestDiscoveryRunId !== activeDiscoveryRun?.runId;
          const visualState = discoveryGeneratedVisualState(itemStatus, latestGeneratedRun, activeGeneratedRun, waitingForCurrentDiscoveryRun);
          const generatedOrdinal = String(generatedTaskIndex + 1).padStart(2, "0");
          const generatedRunIsObserved = Boolean(
            latestGeneratedRun
              && branch.discoveryGeneratedObserver?.taskId === generatedTask.taskId
              && branch.discoveryGeneratedObserver?.runId === latestGeneratedRun.runId,
          );
          const generatedRunButtonLabel = runSaving
            ? "启动中..."
            : activeGeneratedRun
              ? "运行中"
              : latestGeneratedRun
                ? "重新运行"
                : "运行";
          return {
            activeGeneratedRun,
            archiveConfirmOpen,
            archiveSaving,
            canResetToManaged,
            generatedIsEditing,
            generatedOrdinal,
            generatedRunButtonLabel,
            generatedRunIsObserved,
            generatedTask,
            itemStatus,
            latestGeneratedRun,
            latestRunStatus,
            resetSaving,
            runSaving,
            visualState,
            waitingForCurrentDiscoveryRun,
            workUnitMode,
          };
        });
        const runningGeneratedTaskCards = generatedTaskCards.filter((card) => card.visualState === "running");
        const queuedGeneratedTaskCards = generatedTaskCards.filter((card) => card.visualState !== "running");
        const forceVisibleQueuedTaskIds = new Set([
          branch.discoveryGeneratedObserver?.taskId,
          branch.discoveryGeneratedEditTaskId,
          generatedArchiveConfirmTaskId,
        ].filter((taskId): taskId is string => typeof taskId === "string" && taskId.length > 0));
        const queuedPreviewCards = branch.discoveryQueueExpanded
          ? queuedGeneratedTaskCards
          : queuedGeneratedTaskCards.filter((card, index) => (
              index < DISCOVERY_QUEUE_INITIAL_CARD_LIMIT || forceVisibleQueuedTaskIds.has(card.generatedTask.taskId)
            ));
        const hiddenQueuedTaskCount = queuedGeneratedTaskCards.length - queuedPreviewCards.length;
        const doneGeneratedTaskCount = queuedGeneratedTaskCards.filter((card) => card.visualState === "done").length;
        const waitingGeneratedTaskCount = queuedGeneratedTaskCards.length - doneGeneratedTaskCount;
        const renderGeneratedCard = (card: (typeof generatedTaskCards)[number]) => {
          const {
            activeGeneratedRun,
            archiveConfirmOpen,
            archiveSaving,
            canResetToManaged,
            generatedIsEditing,
            generatedOrdinal,
            generatedRunButtonLabel,
            generatedRunIsObserved,
            generatedTask,
            itemStatus,
            latestGeneratedRun,
            latestRunStatus,
            resetSaving,
            runSaving,
            visualState,
            waitingForCurrentDiscoveryRun,
            workUnitMode,
          } = card;
          const generatedActionMenuOpen = generatedActionMenuTaskId === generatedTask.taskId;
          const generatedActionMenuId = `generated-action-menu-${branch.nodeId}-${generatedTask.taskId}`;
          return (
            <article
              key={generatedTask.taskId}
              className={`discovery-generated-card state-${visualState} is-${itemStatus} ${generatedRunIsObserved ? "is-observed" : ""} ${generatedIsEditing ? "is-editing" : ""} ${generatedActionMenuOpen ? "is-action-menu-open" : ""}`}
              data-generated-task-id={generatedTask.taskId}
              data-generated-item-status={itemStatus}
              data-generated-workunit-mode={workUnitMode}
              data-generated-run-status={latestRunStatus}
              data-generated-visual-state={visualState}
              data-generated-ordinal={generatedOrdinal}
              data-generated-run-scope={waitingForCurrentDiscoveryRun ? "pending-current-discovery" : "current"}
              data-generated-editing={generatedIsEditing ? "true" : "false"}
              data-generated-reset-saving={resetSaving ? "true" : "false"}
              data-generated-archive-saving={archiveSaving ? "true" : "false"}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setGeneratedActionMenuTaskId((current) => current === generatedTask.taskId ? null : current);
                }
              }}
            >
              <span className="discovery-generated-card-watermark" aria-hidden="true">{generatedOrdinal}</span>
              <div className="discovery-generated-card-head">
                <strong>{generatedTask.title}</strong>
              </div>
              <button
                type="button"
                className="discovery-generated-menu-trigger"
                data-generated-action="menu"
                aria-label={`${generatedTask.title} 操作菜单`}
                aria-expanded={generatedActionMenuOpen}
                aria-controls={generatedActionMenuId}
                onClick={() => {
                  setGeneratedActionMenuTaskId((current) =>
                    current === generatedTask.taskId ? null : generatedTask.taskId
                  );
                }}
              >
                <span aria-hidden="true">⋮</span>
              </button>
              <div
                id={generatedActionMenuId}
                className="discovery-generated-card-actions"
                role="menu"
                aria-label={`${generatedTask.title} 操作`}
              >
                <button
                  type="button"
                  className={`discovery-generated-action ${generatedIsEditing ? "selected" : ""}`}
                  data-generated-action="edit"
                  role="menuitem"
                  aria-label={`${generatedTask.title} ${generatedIsEditing ? "收起 generated Task 浅编辑" : "打开 generated Task 浅编辑"}`}
                  onClick={() => {
                    setGeneratedActionMenuTaskId(null);
                    if (generatedIsEditing) {
                      clearTaskEditState(generatedTask.taskId);
                    } else {
                      generatedEditDetailHandledTaskIdsRef.current.add(generatedTask.taskId);
                      if ((generatedTask as TeamCanvasTask).workUnit) {
                        openTaskEditDraft(generatedTask as TeamCanvasTask);
                      } else {
                        void ensureGeneratedTaskDetail(generatedTask.taskId).then((fullTask) => {
                          if (fullTask) {
                            openTaskEditDraft(fullTask);
                          } else {
                            clearGeneratedEditDetailFailure(branch.nodeId, generatedTask.taskId);
                          }
                        });
                      }
                    }
                    setExpandedTaskBranches((current) => current.map((item) =>
                      item.nodeId === branch.nodeId
                        ? {
                            ...item,
                            detailMode: "discovery-subcanvas",
                            discoveryGeneratedEditTaskId: generatedIsEditing ? undefined : generatedTask.taskId,
                          }
                        : item
                    ));
                  }}
                >
                  {generatedIsEditing ? "收起编辑" : "编辑"}
                </button>
                {canResetToManaged && (
                  <button
                    type="button"
                    className="discovery-generated-action reset"
                    data-generated-action="reset-workunit"
                    role="menuitem"
                    disabled={resetSaving}
                    title="恢复为 Discovery 派发器最新 managed WorkUnit"
                    onClick={() => {
                      setGeneratedActionMenuTaskId(null);
                      void resetGeneratedTaskWorkUnit(generatedTask);
                    }}
                  >
                    {resetSaving ? "恢复中..." : "恢复 managed"}
                  </button>
                )}
                <button
                  type="button"
                  className="discovery-generated-action danger"
                  data-generated-action="archive"
                  role="menuitem"
                  disabled={archiveSaving}
                  title="通过现有 Canvas Task 归档接口软归档这个 generated Task"
                  onClick={() => {
                    setGeneratedActionMenuTaskId(null);
                    setGeneratedArchiveConfirmTaskId(generatedTask.taskId);
                  }}
                >
                  {archiveSaving ? "归档中..." : "归档"}
                </button>
                <button
                  type="button"
                  className="discovery-generated-action"
                  data-generated-action="run-history"
                  role="menuitem"
                  onClick={() => {
                    setGeneratedActionMenuTaskId(null);
                    openTaskRunHistory(generatedTask.taskId, branch.nodeId, latestGeneratedRun ? [latestGeneratedRun] : []);
                  }}
                >
                  运行记录
                </button>
                <button
                  type="button"
                  className="discovery-generated-action"
                  data-generated-action="run"
                  role="menuitem"
                  disabled={runSaving || Boolean(activeGeneratedRun) || generatedTask.status !== "ready"}
                  title={generatedTask.status === "ready" ? "启动这个 generated Task 的 WorkUnit run" : "只有 ready generated Task 可以运行"}
                  onClick={() => {
                    setGeneratedActionMenuTaskId(null);
                    void runTask(generatedTask);
                  }}
                >
                  {generatedRunButtonLabel}
                </button>
                {activeGeneratedRun && (
                  <button
                    type="button"
                    className="discovery-generated-action"
                    data-generated-action="cancel"
                    role="menuitem"
                    disabled={runSaving}
                    onClick={() => {
                      setGeneratedActionMenuTaskId(null);
                      void cancelTaskRun(generatedTask, activeGeneratedRun);
                    }}
                  >
                    停止
                  </button>
                )}
                {latestGeneratedRun && (
                  <button
                    type="button"
                    className={`discovery-generated-action summary ${generatedRunIsObserved ? "selected" : ""}`}
                    data-generated-action="observe-run"
                    role="menuitem"
                    aria-label={`${generatedTask.title} ${generatedRunIsObserved ? "收起 generated run observer" : "打开 generated run observer"}`}
                    onClick={() => {
                      setGeneratedActionMenuTaskId(null);
                      setExpandedTaskBranches((current) => current.map((item) => {
                        if (item.nodeId !== branch.nodeId) return item;
                        const isSameObserver = item.discoveryGeneratedObserver?.taskId === generatedTask.taskId
                          && item.discoveryGeneratedObserver?.runId === latestGeneratedRun.runId;
                        return {
                          ...item,
                          detailMode: "discovery-subcanvas",
                          observedRunId: undefined,
                          selectedFileKeys: [],
                          discoveryGeneratedObserver: isSameObserver
                            ? undefined
                            : {
                                taskId: generatedTask.taskId,
                                runId: latestGeneratedRun.runId,
                                selectedFileKeys: [],
                              },
                        };
                      }));
                    }}
                  >
                    {generatedRunIsObserved ? "收起输出" : "查看输出"}
                  </button>
                )}
              </div>
              {archiveConfirmOpen && (
                <div
                  className="discovery-generated-archive-confirm"
                  data-generated-archive-confirm-for={generatedTask.taskId}
                >
                  <span>确认软归档这个 generated Task？</span>
                  <div className="discovery-generated-archive-confirm-actions">
                    <button
                      type="button"
                      className="discovery-generated-action danger"
                      data-generated-action="archive-confirm"
                      disabled={archiveSaving}
                      onClick={() => {
                        void archiveGeneratedTask(generatedTask);
                      }}
                    >
                      确认归档
                    </button>
                    <button
                      type="button"
                      className="discovery-generated-action"
                      data-generated-action="archive-cancel"
                      disabled={archiveSaving}
                      onClick={() => setGeneratedArchiveConfirmTaskId(null)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        };
        panels.push({
          id: `discovery-subcanvas-${branch.nodeId}`,
          width: 620,
          autoHeight: true,
          sourceId: menuPanelId,
          panel: (
            <section
              className="task-leader-branch emap-panel-branch discovery-subcanvas-panel"
              data-discovery-subcanvas-for={task.taskId}
              aria-label={`${task.title} Discovery 子画布`}
              style={discoverySubcanvasStyle}
            >
              <header className="task-leader-branch-head">
                <div className="task-leader-branch-title">
                  <span>Discovery 子画布</span>
                  <strong>{task.title}</strong>
                  <code>{task.taskId}</code>
                </div>
                <button
                  type="button"
                  className="task-leader-branch-collapse"
                  onClick={() => {
                    if (branch.discoveryGeneratedEditTaskId) {
                      clearTaskEditState(branch.discoveryGeneratedEditTaskId);
                    }
                    clearGeneratedArchiveUiForTasks(generatedTasks.map((generatedTask) => generatedTask.taskId));
                    setExpandedTaskBranches((current) =>
                      current.map((item) =>
                        item.nodeId === branch.nodeId
                          ? {
                              ...item,
                              detailMode: null,
                            discoveryGeneratedObserver: undefined,
                            discoveryGeneratedEditTaskId: undefined,
                            discoveryQueueExpanded: false,
                          }
                        : item
                      )
                    );
                  }}
                  aria-label={`收起 ${task.title} Discovery 子画布`}
                >
                  收起
                </button>
              </header>
              {dispatchDiagnostics.length > 0 && (
                <section
                  className="discovery-dispatch-diagnostics"
                  data-discovery-dispatch-diagnostics-for={task.taskId}
                  data-dispatch-blocked-count={dispatchDiagnostics.length}
                  aria-label={`${task.title} dispatch diagnostics`}
                >
                  <div className="discovery-dispatch-diagnostics-head">
                    <span>派发阻塞</span>
                    <strong>{dispatchDiagnostics.length} blocked</strong>
                  </div>
                  <div className="discovery-dispatch-diagnostic-list">
                    {dispatchDiagnostics.map((diagnostic) => (
                      <article
                        key={`${diagnostic.attemptId}:${diagnostic.itemId}:${diagnostic.createdAt}`}
                        className="discovery-dispatch-diagnostic-item"
                        data-dispatch-item-id={diagnostic.itemId}
                      >
                        <code>{diagnostic.itemId}</code>
                        <span>{diagnostic.error ?? "Dispatcher blocked without error message."}</span>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              <div className="discovery-subcanvas-list" aria-label={`${task.title} generated Task catalog`}>
                {generatedTasks.length === 0 ? (
                  <div className="discovery-subcanvas-empty">暂无 generated Tasks。</div>
                ) : (
                  <>
                    <section
                      className="discovery-subcanvas-lane discovery-subcanvas-lane-running"
                      aria-label={`${task.title} 正在运行 generated Tasks`}
                    >
                      <div className="discovery-subcanvas-lane-head">
                        <span>正在运行</span>
                        <strong>{runningGeneratedTaskCards.length}/{discoveryConcurrency}</strong>
                      </div>
                      {runningGeneratedTaskCards.length === 0 ? (
                        <div className="discovery-subcanvas-empty compact">当前并发池没有运行中的 generated Task。</div>
                      ) : (
                        <div className="discovery-subcanvas-running-grid">
                          {runningGeneratedTaskCards.map(renderGeneratedCard)}
                        </div>
                      )}
                    </section>
                    <section
                      className="discovery-subcanvas-lane discovery-subcanvas-lane-queue"
                      aria-label={`${task.title} generated Task 执行队列`}
                    >
                      <div className="discovery-subcanvas-lane-head">
                        <span>执行队列</span>
                        <strong>{waitingGeneratedTaskCount} queued · {doneGeneratedTaskCount} done</strong>
                      </div>
                      {queuedGeneratedTaskCards.length === 0 ? (
                        <div className="discovery-subcanvas-empty compact">暂无排队或已完成 generated Task。</div>
                      ) : (
                        <>
                          <div
                            className="discovery-subcanvas-queue-grid"
                            data-generated-queue-visible-count={queuedPreviewCards.length}
                            data-generated-queue-total-count={queuedGeneratedTaskCards.length}
                          >
                            {queuedPreviewCards.map(renderGeneratedCard)}
                          </div>
                          {hiddenQueuedTaskCount > 0 && (
                            <button
                              type="button"
                              className="discovery-subcanvas-show-all"
                              data-generated-action="show-all-queued"
                              onClick={() => {
                                setExpandedTaskBranches((current) => current.map((item) =>
                                  item.nodeId === branch.nodeId
                                    ? { ...item, discoveryQueueExpanded: true }
                                    : item
                                ));
                              }}
                            >
                              显示全部 {queuedGeneratedTaskCards.length} 个 generated Task
                            </button>
                          )}
                        </>
                      )}
                    </section>
                  </>
                )}
              </div>
            </section>
          ),
        });
        const generatedEditTask = branch.discoveryGeneratedEditTaskId
          ? generatedTasks.find((generatedTask) => generatedTask.taskId === branch.discoveryGeneratedEditTaskId) ?? null
          : null;
        if (generatedEditTask) {
          const draft = taskEditDraftByTaskId[generatedEditTask.taskId];
          const warning = taskEditWarningByTaskId[generatedEditTask.taskId] ?? null;
          const saving = Boolean(taskEditSavingByTaskId[generatedEditTask.taskId]);
          if (draft) {
            panels.push({
              id: `generated-task-edit-${branch.nodeId}-${generatedEditTask.taskId}`,
              width: 500,
              height: 430,
              autoHeight: true,
              sourceId: `discovery-subcanvas-${branch.nodeId}`,
              resizable: true,
              interactive: true,
              panel: (
                <section
                  className="task-leader-branch emap-panel-branch task-edit-branch generated-task-edit-branch"
                  data-generated-edit-task-id={generatedEditTask.taskId}
                  aria-label={`${generatedEditTask.title} Generated Task 浅编辑`}
                >
                  <header className="task-leader-branch-head">
                    <div className="task-leader-branch-title">
                      <span>Generated Task 浅编辑</span>
                      <strong>{generatedEditTask.title}</strong>
                      <code>{generatedEditTask.taskId}</code>
                    </div>
                    <button
                      type="button"
                      className="task-leader-branch-collapse"
                      onClick={() => {
                        clearTaskEditState(generatedEditTask.taskId);
                        setExpandedTaskBranches((current) =>
                          current.map((item) =>
                            item.nodeId === branch.nodeId
                              ? { ...item, discoveryGeneratedEditTaskId: undefined }
                              : item
                          )
                        );
                      }}
                      aria-label={`收起 ${generatedEditTask.title} Generated Task 浅编辑`}
                    >
                      收起
                    </button>
                  </header>
                  <form
                    className="task-edit-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveTaskEdit(generatedEditTask.taskId);
                    }}
                  >
                    <div className="task-edit-note">
                      只允许修改名称和执行 Agent；sourceDiscoveryTaskId / sourceItemId / item payload 由 Discovery 维护。
                    </div>
                    {warning && <div className="task-edit-warning" role="status">{warning}</div>}
                    <div className="task-edit-grid">
                      <label className="task-edit-field">
                        <span>Task 名称</span>
                        <input
                          value={draft.title}
                          onChange={(event) => updateTaskEditDraft(generatedEditTask.taskId, "title", event.target.value)}
                        />
                      </label>
                      <label className="task-edit-field">
                        <span>Leader Agent</span>
                        <select
                          value={draft.leaderAgentId}
                          onChange={(event) => updateTaskEditDraft(generatedEditTask.taskId, "leaderAgentId", event.target.value)}
                        >
                          {agents.map((agent) => (
                            <option key={agent.agentId} value={agent.agentId}>
                              {agent.name} ({agent.agentId})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="task-edit-field">
                        <span>Worker Agent</span>
                        <select
                          value={draft.workerAgentId}
                          onChange={(event) => updateTaskEditDraft(generatedEditTask.taskId, "workerAgentId", event.target.value)}
                        >
                          {agents.map((agent) => (
                            <option key={agent.agentId} value={agent.agentId}>
                              {agent.name} ({agent.agentId})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="task-edit-field">
                        <span>Checker Agent</span>
                        <select
                          value={draft.checkerAgentId}
                          onChange={(event) => updateTaskEditDraft(generatedEditTask.taskId, "checkerAgentId", event.target.value)}
                        >
                          {agents.map((agent) => (
                            <option key={agent.agentId} value={agent.agentId}>
                              {agent.name} ({agent.agentId})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="task-edit-actions">
                      <button
                        type="button"
                        className="task-action-menu-button"
                        onClick={() => {
                          clearTaskEditState(generatedEditTask.taskId);
                          setExpandedTaskBranches((current) =>
                            current.map((item) =>
                              item.nodeId === branch.nodeId
                                ? { ...item, discoveryGeneratedEditTaskId: undefined }
                                : item
                            )
                          );
                        }}
                      >
                        返回子画布
                      </button>
                      <button type="submit" className="task-action-menu-button primary" disabled={saving}>
                        {saving ? "保存中..." : "保存"}
                      </button>
                    </div>
                  </form>
                </section>
              ),
            });
          }
        }
        continue;
      }

      if (branch.detailMode === "clone") {
        const draft = taskCloneDraftByTaskId[task.taskId];
        const saving = Boolean(taskCloneSavingByTaskId[task.taskId]);
        if (draft) {
          const templateParameters = task.templateConfig?.parameters ?? [];
          panels.push({
            id: `task-clone-${branch.nodeId}`,
            width: 520,
            height: task.templateConfig ? 560 : 400,
            sourceId: menuPanelId,
            resizable: true,
            interactive: true,
            panel: (
              <section className="task-leader-branch emap-panel-branch task-edit-branch" aria-label={`${task.title} Task 复制`}>
                <header className="task-leader-branch-head">
                  <div className="task-leader-branch-title">
                    <span>Task 复制</span>
                    <strong>{task.title}</strong>
                    <code>{task.taskId}</code>
                  </div>
                  <button
                    type="button"
                    className="task-leader-branch-collapse"
                    onClick={() => {
                      clearTaskCloneState(task.taskId);
                      setExpandedTaskBranches((current) =>
                        current.map((item) =>
                          item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                        )
                      );
                    }}
                    aria-label={`收起 ${task.title} Task 复制`}
                  >
                    收起
                  </button>
                </header>
                <form
                  className="task-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void cloneTask(task, branch.nodeId);
                  }}
                >
                  <div className="task-edit-note">
                    复制只复制 Task 定义，不复制运行记录、进行中的 run 或 generated 子任务。
                  </div>
                  <div className="task-edit-grid">
                    <label className="task-edit-field">
                      <span>新 Task 名称</span>
                      <input
                        value={draft.title}
                        onChange={(event) => updateTaskCloneTitle(task.taskId, event.target.value)}
                      />
                    </label>
                    {templateParameters.map((parameter) => (
                      <label key={parameter.id} className="task-edit-field">
                        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
                        <input
                          value={draft.templateBindings[parameter.id] ?? ""}
                          placeholder={parameter.description ?? parameter.id}
                          onChange={(event) => updateTaskCloneBinding(task.taskId, parameter.id, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="task-edit-actions">
                    <button
                      type="button"
                      className="task-action-menu-button"
                      onClick={() => {
                        clearTaskCloneState(task.taskId);
                        setExpandedTaskBranches((current) =>
                          current.map((item) =>
                            item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                          )
                        );
                      }}
                    >
                      返回菜单
                    </button>
                    <button type="submit" className="task-action-menu-button primary" disabled={saving}>
                      {saving ? "创建中..." : "创建复制"}
                    </button>
                  </div>
                </form>
              </section>
            ),
          });
        }
        continue;
      }

      if (branch.detailMode === "parameters") {
        const draft = taskParameterDraftByTaskId[task.taskId];
        const saving = Boolean(taskParameterSavingByTaskId[task.taskId]);
        const runSaving = Boolean(taskRunSavingByTaskId[task.taskId]);
        const templateParameters = task.templateConfig?.parameters ?? [];
        if (draft && task.templateConfig) {
          panels.push({
            id: `task-parameters-${branch.nodeId}`,
            width: 520,
            height: 460,
            sourceId: menuPanelId,
            resizable: true,
            interactive: true,
            panel: (
              <section className="task-leader-branch emap-panel-branch task-edit-branch" aria-label={`${task.title} Task 参数`}>
                <header className="task-leader-branch-head">
                  <div className="task-leader-branch-title">
                    <span>Task 参数</span>
                    <strong>{task.title}</strong>
                    <code>{task.taskId}</code>
                  </div>
                  <button
                    type="button"
                    className="task-leader-branch-collapse"
                    onClick={() => {
                      clearTaskParameterState(task.taskId);
                      setExpandedTaskBranches((current) =>
                        current.map((item) =>
                          item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                        )
                      );
                    }}
                    aria-label={`收起 ${task.title} Task 参数`}
                  >
                    收起
                  </button>
                </header>
                <form
                  className="task-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveTaskParameters(task);
                  }}
                >
                  <div className="task-edit-note">
                    参数会保存为该模板 Task 的当前值；每次运行仍会在 run source 中记录当次快照。
                  </div>
                  <div className="task-edit-grid">
                    {templateParameters.map((parameter) => (
                      <label key={parameter.id} className="task-edit-field">
                        <span>{parameter.label}{parameter.required !== false ? " *" : ""}</span>
                        <input
                          value={draft.templateBindings[parameter.id] ?? ""}
                          placeholder={parameter.description ?? parameter.id}
                          onChange={(event) => updateTaskParameterBinding(task.taskId, parameter.id, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="task-edit-actions">
                    <button
                      type="button"
                      className="task-action-menu-button"
                      onClick={() => {
                        clearTaskParameterState(task.taskId);
                        setExpandedTaskBranches((current) =>
                          current.map((item) =>
                            item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                          )
                        );
                      }}
                    >
                      返回菜单
                    </button>
                    <button type="submit" className="task-action-menu-button" disabled={saving || runSaving}>
                      {saving ? "保存中..." : "保存参数"}
                    </button>
                    <button
                      type="button"
                      className="task-action-menu-button primary"
                      disabled={saving || runSaving || task.status !== "ready"}
                      onClick={async () => {
                        const bindings = await saveTaskParameters(task);
                        if (bindings) {
                          await runTask(task, branch.nodeId, bindings);
                        }
                      }}
                    >
                      {runSaving ? "启动中..." : "保存并运行"}
                    </button>
                  </div>
                </form>
              </section>
            ),
          });
        }
        continue;
      }

      if (branch.detailMode === "edit") {
        const draft = taskEditDraftByTaskId[task.taskId];
        const warning = taskEditWarningByTaskId[task.taskId] ?? null;
        const saving = Boolean(taskEditSavingByTaskId[task.taskId]);
        if (draft) {
          panels.push({
            id: `task-edit-${branch.nodeId}`,
            width: 520,
            height: 480,
            sourceId: menuPanelId,
            resizable: true,
            interactive: true,
            panel: (
              <section className="task-leader-branch emap-panel-branch task-edit-branch" aria-label={`${task.title} Task 编辑`}>
                <header className="task-leader-branch-head">
                  <div className="task-leader-branch-title">
                    <span>Task 编辑</span>
                    <strong>{task.title}</strong>
                    <code>{task.taskId}</code>
                  </div>
                  <button
                    type="button"
                    className="task-leader-branch-collapse"
                    onClick={() => setExpandedTaskBranches((current) =>
                      current.map((item) =>
                        item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                      )
                    )}
                    aria-label={`收起 ${task.title} Task 编辑`}
                  >
                    收起
                  </button>
                </header>
                <form
                  className="task-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveTaskEdit(task.taskId);
                  }}
                >
                  <div className="task-edit-note">
                    复杂需求和验收规则继续通过 Leader 对话里的 <code>/team-task</code> 更新；这里仅做 Task 名称和执行 Agent 的浅编辑。
                  </div>
                  {warning && <div className="task-edit-warning" role="status">{warning}</div>}
                  <div className="task-edit-grid">
                    <label className="task-edit-field">
                      <span>Task 名称</span>
                      <input
                        value={draft.title}
                        onChange={(event) => updateTaskEditDraft(task.taskId, "title", event.target.value)}
                      />
                    </label>
                    <label className="task-edit-field">
                      <span>Leader Agent</span>
                      <select
                        value={draft.leaderAgentId}
                        onChange={(event) => updateTaskEditDraft(task.taskId, "leaderAgentId", event.target.value)}
                      >
                        {agents.map((agent) => (
                          <option key={agent.agentId} value={agent.agentId}>
                            {agent.name} ({agent.agentId})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="task-edit-field">
                      <span>Worker Agent</span>
                      <select
                        value={draft.workerAgentId}
                        onChange={(event) => updateTaskEditDraft(task.taskId, "workerAgentId", event.target.value)}
                      >
                        {agents.map((agent) => (
                          <option key={agent.agentId} value={agent.agentId}>
                            {agent.name} ({agent.agentId})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="task-edit-field">
                      <span>Checker Agent</span>
                      <select
                        value={draft.checkerAgentId}
                        onChange={(event) => updateTaskEditDraft(task.taskId, "checkerAgentId", event.target.value)}
                      >
                        {agents.map((agent) => (
                          <option key={agent.agentId} value={agent.agentId}>
                            {agent.name} ({agent.agentId})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="task-edit-actions">
                    <button
                      type="button"
                      className="task-action-menu-button"
                      onClick={() => {
                        clearTaskEditWarning(task.taskId);
                        setExpandedTaskBranches((current) =>
                          current.map((item) =>
                            item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                          )
                        );
                      }}
                    >
                      返回菜单
                    </button>
                    <button type="submit" className="task-action-menu-button primary" disabled={saving}>
                      {saving ? "保存中..." : "保存"}
                    </button>
                  </div>
                </form>
              </section>
            ),
          });
        }
        continue;
      }

      if (branch.detailMode === "leader-chat") {
        const copyEntry = taskLeaderCopyByTaskId[task.taskId] ?? null;
        const copyState = copyEntry?.state ?? "idle";
        const manualCopyText = copyEntry?.manualCopyText ?? null;
        panels.push({
          id: `task-leader-chat-${branch.nodeId}`,
          width: 820,
          height: 620,
          sourceId: menuPanelId,
          resizable: true,
          maximizable: true,
          interactive: true,
          panel: (
            <section className="agent-playground-branch emap-dialog-branch task-leader-chat-branch" aria-label={`${task.title} leader 对话`}>
              <header className="agent-playground-branch-head">
                <div className="agent-playground-branch-title">
                  <span>Leader 对话</span>
                  <strong>{task.title}</strong>
                  <code>{task.taskId}</code>
                </div>
                <div className="agent-playground-branch-actions">
                  <button
                    type="button"
                    className="task-action-menu-button"
                    onClick={() => { void copyTaskLeaderContext(task.taskId, formatTaskLeaderContext(task)); }}
                    aria-label="复制 Task 上下文"
                  >
                    复制 Task 上下文
                  </button>
                  {copyState !== "idle" && (
                    <span role="status" className="task-leader-copy-status">
                      {copyState === "copied" ? "已复制" : "复制失败"}
                    </span>
                  )}
                  <button
                    type="button"
                    className="agent-playground-branch-collapse"
                    onClick={() => setExpandedTaskBranches((current) =>
                      current.map((item) =>
                        item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                      )
                    )}
                    aria-label={`收起 ${task.title} leader 对话`}
                  >
                    收起
                  </button>
                </div>
              </header>
              <div className="task-leader-branch-hint">
                在对话中使用 <code>/team-task</code> 创建或更新这个 Task。Task 数据必须通过后端 API 写入。
              </div>
              {copyState === "failed" && manualCopyText && (
                <div className="task-leader-copy-fallback" role="group" aria-label="Task 上下文手动复制">
                  <p>自动复制失败。下面文本已选中，按 Ctrl+C 后再粘贴到 Leader 对话。</p>
                  <textarea
                    ref={(node) => registerTaskLeaderManualCopyRef(task.taskId, node)}
                    aria-label="手动复制 Task 上下文"
                    readOnly
                    value={manualCopyText}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </div>
              )}
              <iframe
                className="agent-playground-iframe"
                title={`${task.title} leader 对话`}
                src={buildTaskLeaderPlaygroundUrl(task)}
                referrerPolicy="no-referrer"
              />
            </section>
          ),
        });
        continue;
      }
    }

    const pushTaskRunObserverPanels = ({
      observedTaskRun,
      selectedFileKeys,
      sourceId,
      runObserverPanelId,
      fileDetailPanelIdPrefix,
      toggleFile,
      generatedTaskId,
      historyTask,
    }: {
      observedTaskRun: TeamRunState;
      selectedFileKeys: string[];
      sourceId: string;
      runObserverPanelId: string;
      fileDetailPanelIdPrefix: string;
      toggleFile: (key: string) => void;
      generatedTaskId?: string;
      historyTask?: RunHistoryAnalysisTask;
    }) => {
      const observerState = taskRunObserverByRunId[observedTaskRun.runId] ?? null;
      const attempts = observerState?.attempts ?? [];
      const fileDescriptors = attempts.length > 0 ? buildTaskRunFileDescriptors(attempts) : [];
      const latestAttempt = selectLatestAttempt(attempts);
      const selectedFileKeySet = new Set(selectedFileKeys);
      const selectedFileDescriptors = selectedFileKeys
        .map((key) => fileDescriptors.find((descriptor) => descriptor.key === key) ?? null)
        .filter((descriptor): descriptor is TaskRunObserverFileDescriptor => Boolean(descriptor));
      const observedTaskRunIsActive = isActiveRun(observedTaskRun.status);

      const renderFileRow = (descriptor: TaskRunObserverFileDescriptor) => {
        const isSelected = selectedFileKeySet.has(descriptor.key);
        const agentName = descriptor.runtimeContext
          ? (agentsById.get(descriptor.runtimeContext.resolvedProfileId)?.name ?? descriptor.runtimeContext.resolvedProfileId)
          : descriptor.kind === "result"
            ? (descriptor.fileName.includes("accepted") ? "Accepted result" : "Result")
            : descriptor.kind;
        return (
          <button
            type="button"
            key={descriptor.key}
            className={`emap-observer-file-row ${descriptor.kind} ${isSelected ? "selected" : ""}`}
            data-file-kind={descriptor.kind}
            onClick={() => toggleFile(descriptor.key)}
          >
            <span className="emap-observer-file-row-agent">{agentName}</span>
            <code className="emap-observer-file-row-name">{descriptor.fileName}</code>
            <span className="emap-observer-file-row-path">{descriptor.path}</span>
          </button>
        );
      };

      const renderFileSection = (label: string, descriptors: TaskRunObserverFileDescriptor[]) => {
        if (descriptors.length === 0) return null;
        return (
          <div className="emap-run-observer-file-section">
            <span className="emap-run-observer-file-kicker">{label}</span>
            <div className="emap-run-observer-file-list">
              {descriptors.map(renderFileRow)}
            </div>
          </div>
        );
      };

      const workerFiles = fileDescriptors.filter((d) => d.kind === "worker");
      const checkerFiles = fileDescriptors.filter((d) => d.kind === "checker");
      const resultFiles = fileDescriptors.filter((d) => d.kind === "result");
      const hasFiles = fileDescriptors.length > 0;
      const emptyFilesMessage = attempts.length === 0
        ? "该运行没有 attempt 记录。可能是子任务未启动、已跳过，或旧运行未保存 attempt。"
        : latestAttempt?.status === "failed"
          ? "该 attempt 未产生可展示文件。请查看 Worker / Checker 过程或错误摘要。"
          : "该 attempt 未产生可展示文件。";

      panels.push({
        id: runObserverPanelId,
        width: 420,
        autoHeight: true,
        sourceId,
        panel: (
          <div
            className={`emap-run-observer-panel ${observedTaskRunIsActive ? "active" : "terminal"}`}
            data-generated-observer-task-id={generatedTaskId}
            data-generated-observer-run-id={generatedTaskId ? observedTaskRun.runId : undefined}
          >
            <header className="emap-run-observer-head">
              <span>{"\u8fd0\u884c\u89c2\u5bdf"}</span>
              <strong>{RUN_STATUS_LABELS[observedTaskRun.status]}</strong>
            </header>
            {historyTask && (
              <section className="emap-run-observer-history-summary" aria-label="历史运行摘要">
                <div className="emap-run-observer-history-times">
                  <span>
                    <small>开始时间</small>
                    <time dateTime={observedTaskRun.startedAt ?? observedTaskRun.createdAt}>
                      {formatRunTimestamp(observedTaskRun.startedAt ?? observedTaskRun.createdAt)}
                    </time>
                  </span>
                  <span>
                    <small>结束时间</small>
                    <time dateTime={observedTaskRun.finishedAt ?? undefined}>
                      {formatRunTimestamp(observedTaskRun.finishedAt, isActiveRun(observedTaskRun.status) ? "未结束" : "未记录")}
                    </time>
                  </span>
                </div>
                <button
                  type="button"
                  className="emap-run-observer-copy-analysis"
                  onClick={() => {
                    void copyRunHistoryAnalysisContext(historyTask, observedTaskRun, attempts, fileDescriptors);
                  }}
                >
                  复制给 Agent 分析
                </button>
                {runHistoryAnalysisCopyState !== "idle" && (
                  <span role="status" className="emap-run-observer-copy-status">
                    {runHistoryAnalysisCopyState === "copied" ? "已复制" : "复制失败"}
                  </span>
                )}
                {runHistoryAnalysisCopyState === "failed" && runHistoryAnalysisManualText && (
                  <textarea
                    ref={runHistoryAnalysisManualCopyRef}
                    className="emap-run-observer-copy-fallback"
                    aria-label="手动复制历史运行分析上下文"
                    readOnly
                    value={runHistoryAnalysisManualText}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                )}
              </section>
            )}
            <div className="emap-run-observer-stage worker" data-observer-section="worker-process">
              {renderRoleProcessNode("worker", latestAttempt?.roleProcesses?.worker)}
            </div>
            <div className="emap-run-observer-stage-files worker" data-observer-section="worker-files">
              {renderFileSection("Worker \u8f93\u51fa", workerFiles)}
            </div>
            <div className="emap-run-observer-stage checker" data-observer-section="checker-process">
              {renderRoleProcessNode("checker", latestAttempt?.roleProcesses?.checker)}
            </div>
            <div className="emap-run-observer-stage-files checker" data-observer-section="checker-files">
              {renderFileSection("Checker \u8f93\u51fa", checkerFiles)}
            </div>
            <div className="emap-run-observer-stage-files result" data-observer-section="result-files">
              {renderFileSection("\u9a8c\u6536\u7ed3\u679c", resultFiles)}
            </div>
            {!hasFiles && !observerState?.loading && !observedTaskRunIsActive && (
              <div className="emap-observer-empty">{emptyFilesMessage}</div>
            )}
          </div>
        ),
      });

      for (const descriptor of selectedFileDescriptors) {
        const fileState = observerState?.files[descriptor.key];
        panels.push({
          id: `${fileDetailPanelIdPrefix}-${descriptor.key}`.replace(/[^A-Za-z0-9_-]/g, "-"),
          width: 460,
          height: 420,
          sourceId: runObserverPanelId,
          resizable: true,
          minWidth: 360,
          minHeight: 280,
          panel: (
            <section className="emap-observer-node emap-observer-file-detail-node" aria-label={descriptor.title}>
              <header className="emap-observer-node-head">
                <span className="emap-observer-node-label">{descriptor.title}</span>
                <code className="emap-observer-file-name">{descriptor.fileName}</code>
                <button
                  type="button"
                  className="emap-observer-node-close"
                  onClick={() => toggleFile(descriptor.key)}
                  aria-label="\u6536\u8d77\u6587\u4ef6\u8be6\u60c5"
                >
                  {"\u6536\u8d77"}
                </button>
              </header>
              <div className="emap-observer-file-detail-body">
                {fileState?.error ? (
                  <div className="emap-observer-file-error">{fileState.error}</div>
                ) : fileState?.content ? (
                  renderFileDetailContent(descriptor.fileName, fileState.content)
                ) : (
                  <div className="emap-observer-file-loading">{"\u6b63\u5728\u8bfb\u53d6\u6587\u4ef6..."}</div>
                )}
              </div>
            </section>
          ),
        });
      }
    };

    for (const branch of expandedTaskBranches) {
      if ((branch.detailMode !== "run-observer" && branch.detailMode !== "run-history") || !branch.observedRunId) continue;
      const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
      const task = node ? tasksById.get(node.taskId) ?? null : null;
      if (!node || !task) continue;
      const targetTaskId = branch.detailMode === "run-history"
        ? branch.runHistoryTaskId ?? activeRunHistoryTaskId ?? task.taskId
        : task.taskId;
      const observedTaskRun = (taskRunsByTaskId[targetTaskId] ?? []).find((taskRun) => taskRun.runId === branch.observedRunId)
        ?? (branch.detailMode === "run-history"
          ? runHistoryItems.find((item) => item.annotation.taskId === targetTaskId && item.run.runId === branch.observedRunId)?.run ?? null
          : null);
      if (!observedTaskRun) continue;
      const historyTask = branch.detailMode === "run-history"
        ? tasksById.get(targetTaskId) ?? generatedTasksById.get(targetTaskId) ?? task
        : undefined;

      const toggleFile = (key: string) => {
        setExpandedTaskBranches((current) => current.map((item) => {
          if (item.nodeId !== branch.nodeId) return item;
          const currentKeys = item.selectedFileKeys ?? [];
          return {
            ...item,
            selectedFileKeys: currentKeys.includes(key)
              ? currentKeys.filter((fileKey) => fileKey !== key)
              : [...currentKeys, key],
          };
        }));
      };

      pushTaskRunObserverPanels({
        observedTaskRun,
        selectedFileKeys: branch.selectedFileKeys ?? [],
        sourceId: branch.detailMode === "run-history" ? `run-history-${branch.nodeId}` : taskMenuPanelId(branch.nodeId),
        runObserverPanelId: `run-observer-${branch.nodeId}`,
        fileDetailPanelIdPrefix: `file-detail-${branch.nodeId}`,
        toggleFile,
        historyTask,
      });
    }

    for (const branch of expandedTaskBranches) {
      if (branch.detailMode !== "discovery-subcanvas" || !branch.discoveryGeneratedObserver) continue;
      const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
      const discoveryTask = node ? tasksById.get(node.taskId) ?? null : null;
      if (!node || !discoveryTask || discoveryTask.canvasKind !== "discovery" || discoveryTask.generatedSource) continue;

      const generatedObserver = branch.discoveryGeneratedObserver;
      const generatedTask = generatedTasksById.get(generatedObserver.taskId) ?? null;
      if (!generatedTask || generatedTask.generatedSource?.sourceDiscoveryTaskId !== discoveryTask.taskId) continue;
      const activeDiscoveryRun = selectActiveDiscoveryRootRun(discoveryTask.taskId, taskRunsByTaskId);
      const observedTaskRun = visibleDiscoveryGeneratedRuns(generatedTask, discoveryTask.taskId, activeDiscoveryRun, taskRunsByTaskId)
        .find((taskRun) => taskRun.runId === generatedObserver.runId) ?? null;
      if (!observedTaskRun) continue;

      const toggleFile = (key: string) => {
        setExpandedTaskBranches((current) => current.map((item) => {
          if (item.nodeId !== branch.nodeId) return item;
          const currentObserver = item.discoveryGeneratedObserver;
          if (!currentObserver || currentObserver.taskId !== generatedTask.taskId || currentObserver.runId !== observedTaskRun.runId) {
            return item;
          }
          const currentKeys = currentObserver.selectedFileKeys ?? [];
          return {
            ...item,
            discoveryGeneratedObserver: {
              ...currentObserver,
              selectedFileKeys: currentKeys.includes(key)
                ? currentKeys.filter((fileKey) => fileKey !== key)
                : [...currentKeys, key],
            },
          };
        }));
      };

      pushTaskRunObserverPanels({
        observedTaskRun,
        selectedFileKeys: generatedObserver.selectedFileKeys ?? [],
        sourceId: `discovery-subcanvas-${branch.nodeId}`,
        runObserverPanelId: `generated-run-observer-${branch.nodeId}-${generatedTask.taskId}`,
        fileDetailPanelIdPrefix: `generated-file-detail-${branch.nodeId}-${generatedTask.taskId}`,
        toggleFile,
        generatedTaskId: generatedTask.taskId,
      });
    }

    return panels;
  }, [activeRunHistoryTaskId, agents, agentsById, archiveGeneratedTask, archiveTask, cancelTaskRun, clearGeneratedArchiveUiForTasks, clearGeneratedEditDetailFailure, clearTaskCloneState, clearTaskEditState, clearTaskEditWarning, clearTaskParameterState, cloneTask, closeTaskRunHistory, copyRunHistoryAnalysisContext, copyTaskLeaderContext, dataSource, discoveryDispatchDiagnosticsByTaskId, ensureGeneratedTaskDetail, expandedTaskBranches, generatedActionMenuTaskId, generatedArchiveConfirmTaskId, generatedArchiveSavingByTaskId, generatedResetSavingByTaskId, generatedTasksByDiscoveryTaskId, generatedTasksById, loadMoreRunHistory, openTaskEditDraft, openTaskParameterDraft, openTaskRunHistory, patchRunHistoryAnnotation, refreshLiveTasks, registerTaskLeaderManualCopyRef, resetGeneratedTaskWorkUnit, runHistoryAnalysisCopyState, runHistoryAnalysisManualText, runHistoryError, runHistoryIncludeArchived, runHistoryItems, runHistoryLoading, runHistorySavingRunId, runHistoryTotal, runTask, saveTaskEdit, saveTaskParameters, scheduleLiveTaskDiscoveryRefresh, selectRunHistoryItem, selectedRunHistoryRunId, setError, taskArchiveConfirmNodeId, taskArchiveSavingNodeId, taskCloneDraftByTaskId, taskCloneSavingByTaskId, taskEditDraftByTaskId, taskEditSavingByTaskId, taskEditWarningByTaskId, taskLeaderCopyByTaskId, taskNodes, taskParameterDraftByTaskId, taskParameterSavingByTaskId, taskRunObserverByRunId, taskRunSavingByTaskId, taskRunsByTaskId, tasksById, updateTaskCloneBinding, updateTaskCloneTitle, updateTaskEditDraft, updateTaskParameterBinding]);
  const canvasStateRestorePending = !loading && !canvasUiStateHydrated;
  const canvasLoadingMinimumMs = loading || canvasUiStateRestoreHasStoredState
    ? CANVAS_LOADING_MIN_VISIBLE_MS
    : dataSource === "live" && initialDataSourceRef.current === "live" && !sharedCanvasUiStateLoaded
      ? 1
      : 0;
  const canvasLoadingVisible = useMinimumVisibleFlag(
    loading || canvasStateRestorePending,
    canvasLoadingMinimumMs,
  );
  const canvasLoadingText = loading ? "正在加载实时运行..." : "正在恢复画布状态...";

  return (
    <div className="app-shell" data-theme={theme}>
      {error && (
        <div className="error-banner">{error}</div>
      )}

      {rootArchiveConfirm && (
        <div className="root-archive-modal-overlay">
          <div className="root-archive-modal" role="dialog" aria-modal="true" aria-labelledby="root-archive-modal-title">
            <h3 className="root-archive-modal-title" id="root-archive-modal-title">
              {rootArchiveConfirm.kind === "batch" ? "批量移除/归档" : rootArchiveConfirm.kind === "source" ? "归档 Source" : rootArchiveConfirm.kind === "task" ? "归档 Task" : "移出 Agent"}
            </h3>
            <p className="root-archive-modal-body">
              {rootArchiveConfirm.kind === "batch"
                ? `确认移除/归档 ${rootArchiveConfirm.items.length} 个节点？Agent 只从画布移出，Task/Source 将软归档。`
                : rootArchiveConfirm.kind === "source"
                  ? `确认归档 Source "${rootArchiveConfirm.title}"？归档后无法恢复。`
                  : rootArchiveConfirm.kind === "task"
                    ? `确认归档 Task "${rootArchiveConfirm.task.title}"？归档后无法恢复。`
                    : `确认将 Agent "${rootArchiveConfirm.name}" 移出画布？不会删除真实 Agent。`}
            </p>
            <div className="root-archive-modal-actions">
              <button
                type="button"
                className="root-archive-modal-cancel"
                onClick={cancelRootArchive}
                disabled={rootArchiveSaving}
              >
                取消
              </button>
              <button
                type="button"
                className="root-archive-modal-confirm"
                onClick={confirmRootArchive}
                disabled={rootArchiveSaving}
                aria-label={rootArchiveConfirm.kind === "agent" ? "确认移出画布" : "确认归档"}
              >
                {rootArchiveSaving
                  ? "处理中..."
                  : rootArchiveConfirm.kind === "agent"
                    ? "确认移出画布"
                    : "确认归档"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="app-main">
        {canvasLoadingVisible ? (
          <div className="empty-state canvas-loading-state" role="status" aria-live="polite">
            <div className="canvas-loading-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p>{canvasLoadingText}</p>
            <div className="canvas-loading-bar" aria-hidden="true" />
          </div>
        ) : (
          <div className="workspace">
            <div className="workspace-map">
              <ExecutionMap
                theme={theme}
                plan={plan}
                run={run}
                selectedTaskId={selectedTaskId}
                onSelectTask={selectTask}
                attemptsByTaskId={attemptsByTaskId}
                readAttemptFile={readAttemptFile}
                agentNodes={agentNodes}
                agentsById={agentsById}
                agentRunStatusById={agentRunStatusesById}
                focusedAgentNodeId={expandedAgentNode?.nodeId ?? null}
                onSelectAgent={toggleAgentBranch}
                onMoveAgent={moveAgentNode}
                minimizedAgentNodeIds={minimizedAgentNodeIds}
                onMinimizeAgent={minimizeAgentNode}
                onRestoreAgent={restoreAgentNode}
                agentBranchPanel={expandedAgentBranchPanel}
                taskNodes={taskNodes}
                tasksById={tasksById}
                taskConnections={taskConnections}
                taskConnectionDraft={taskConnectionDraft}
                taskDependencies={taskDependencies}
                taskDependencyDraft={taskDependencyDraft}
                onTaskDependencySourceSelect={beginTaskDependency}
                onTaskDependencyTargetSelect={completeTaskDependency}
                onDeleteTaskConnection={deleteTaskConnection}
                onDeleteSourceConnection={deleteSourceConnectionAction}
                onDeleteTaskDependency={deleteTaskDependencyAction}
                pendingDeleteConnectionId={pendingDeleteTaskConnectionId}
                pendingDeleteSourceConnectionId={pendingDeleteSourceConnectionId}
                pendingDeleteDependencyId={pendingDeleteDependencyId}
                sourceNodes={sourceAtlasNodes}
                sourceNodesById={sourceNodesById}
                sourceConnections={sourceConnections}
                sourceConnectionDraft={sourceConnectionDraft}
                taskRunsByTaskId={taskRunsByTaskId}
                discoverySummariesByTaskId={discoverySummariesByTaskId}
                focusedTaskNodeId={focusedTaskBranch?.nodeId ?? null}
                onSelectCanvasTask={toggleTaskBranch}
                onMoveCanvasTask={moveTaskNode}
                minimizedTaskNodeIds={minimizedTaskNodeIds}
                onMinimizeCanvasTask={minimizeTaskNode}
                onRestoreCanvasTask={restoreTaskNode}
                taskGroups={taskGroups}
                onToggleTaskGroup={toggleTaskGroup}
                onAtlasSelectionChange={setSelectedAtlasEntries}
                onMoveSourceNode={moveSourceNode}
                minimizedSourceNodeIds={minimizedSourceNodeIds}
                onMinimizeSourceNode={minimizeSourceNode}
                onRestoreSourceNode={restoreSourceNode}
                onSourceOutputPortSelect={beginSourcePortConnection}
                onSourceTextChange={updateTextSourceNode}
                onTaskOutputPortSelect={beginTaskPortConnection}
                onTaskInputPortSelect={completeTaskPortConnection}
                taskBranchPanels={taskBranchPanelItems}
                taskChildBranchPanels={taskChildBranchPanels}
                viewport={canvasViewport}
                onViewportChange={setCanvasViewport}
                branchLayout={canvasBranchLayout}
                onBranchLayoutChange={updateCanvasBranchLayout}
                toolbarStart={agentToolbar}
                toolbarEnd={mapToolbarControls}
                rootNodeFilter={rootNodeFilter}
                onRootTrashDrop={(entries) => {
                  const items: Array<RootArchiveConfirm> = [];
                  for (const entry of entries) {
                    if (entry.kind === "agent") {
                      const agentNode = agentNodes.find((n) => n.nodeId === entry.nodeId);
                      const agent = agentNode ? agentsById?.get(agentNode.agentId) : undefined;
                      if (agent) items.push({ kind: "agent", nodeId: entry.nodeId, agentId: agent.agentId, name: agent.name });
                    } else if (entry.kind === "task") {
                      const taskNode = taskNodes.find((n) => n.nodeId === entry.nodeId);
                      const task = taskNode ? tasksById?.get(taskNode.taskId) : undefined;
                      if (task) items.push({ kind: "task", task, nodeId: entry.nodeId });
                    } else {
                      const srcNode = sourceAtlasNodes.find((n) => n.nodeId === entry.nodeId);
                      const source = srcNode ? sourceNodesById?.get(srcNode.sourceNodeId) : undefined;
                      if (source) items.push({ kind: "source", sourceNodeId: source.sourceNodeId, nodeId: entry.nodeId, title: source.title });
                    }
                  }
                  if (items.length === 1) {
                    setRootArchiveConfirm(items[0]!);
                  } else if (items.length > 1) {
                    setRootArchiveConfirm({ kind: "batch", items });
                  }
                }}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
