import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { LiveTeamApi } from "../api/team-api";
import type { TeamCanvasSourceNode, TeamCanvasSourcePortType, TeamCanvasTask, TeamApiError, TeamRunState, TeamAttemptMetadata, TeamTaskUpdateRequest, TeamRoleRuntimeContext, TeamAttemptRoleProcess, TeamAttemptRoleProcessRole, TeamAttemptRoleProcessStatus, TeamTaskInputPort, TeamTaskOutputPort } from "../api/team-types";
import { ALL_FIXTURES, MockTeamApi } from "../fixtures/team-fixtures";
import { useTeamConsoleLiveData, type DataSource, type LiveRunMode, type TeamConsoleUiResetReason, CLEAN_AGENT_WORKSPACE_ID, mergeTaskRun } from "./use-team-console-live-data";
import { useTaskBranchStack, type TaskBranchDetailMode, type TaskBranchState } from "./use-task-branch-stack";
import { hasDirtyTaskEditConflict, useTaskEditState } from "./use-task-edit-state";
import { useTaskLeaderCopy } from "./use-task-leader-copy";
import { ExecutionMap, type AtlasAgentNode, type AtlasSourceNode, type AtlasTaskNode } from "../graph/ExecutionMap";
import { normalizeAtlasViewport, type AtlasViewport } from "../graph/AtlasCanvasShell";
import { RUN_STATUS_LABELS, isActiveRun } from "../shared/status";
import { renderTeamMarkdown } from "../shared/markdown";
import "./app.css";

const LIVE_AGENT_LAYOUT_STORAGE_KEY = "ugk-team-console:live-agent-layout:v1";
const LIVE_TASK_LAYOUT_STORAGE_KEY = "ugk-team-console:live-task-layout:v1";
const LIVE_SOURCE_LAYOUT_STORAGE_KEY = "ugk-team-console:live-source-layout:v1";
const CANVAS_UI_STATE_STORAGE_KEY = "ugk-team-console:canvas-ui-state:v1";
const TASK_RUN_PROCESS_LABELS: Record<TeamAttemptRoleProcessRole, string> = {
  worker: "Worker 过程",
  checker: "Checker 过程",
};
const PROCESS_CURRENT_ACTION_MAX_CHARS = 96;
const PROCESS_NARRATION_MAX_CHARS = 220;
const PROCESS_ASSISTANT_TEXT_MAX_LINES = 5;
const PROCESS_ASSISTANT_TEXT_MAX_LINE_CHARS = 200;

type AgentBranchMode = "chat" | "task-create";

type AgentBranchState = {
  nodeId: string;
  agentId: string;
  mode: AgentBranchMode;
};

type StoredCanvasUiState = {
  schemaVersion: 1;
  dataSource: DataSource;
  selectedFixtureId?: string;
  liveRunMode?: LiveRunMode;
  viewport?: AtlasViewport;
  expandedAgentBranch?: AgentBranchState | null;
  expandedTaskBranches?: TaskBranchState[];
  minimizedAgentNodeIds?: string[];
  minimizedTaskNodeIds?: string[];
  minimizedSourceNodeIds?: string[];
  rootNodeFilter?: "all" | "agent" | "task";
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

type TaskRunObserverState = {
  loading: boolean;
  attempts: TeamAttemptMetadata[];
  files: Record<string, TaskRunObserverFileState>;
  error: string | null;
  lastUpdatedAt: string | null;
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
  return run.taskStates[taskId]?.progress.phase || run.status;
}

function taskRunMessage(run: TeamRunState, taskId: string): string {
  return run.taskStates[taskId]?.progress.message || "暂无阶段消息";
}

function taskRunAttempts(run: TeamRunState, taskId: string): number {
  return run.taskStates[taskId]?.attemptCount ?? 0;
}

function taskRunElapsed(run: TeamRunState): string {
  return elapsedText(run.startedAt ?? run.createdAt, run.finishedAt).replace(/^耗时\s*/, "");
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

function renderFileDetailContent(fileName: string, content: string): ReactNode {
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
      rawDetailMode === "leader-chat" || rawDetailMode === "edit" || rawDetailMode === "run-observer"
        ? rawDetailMode
        : null;
    const observedRunId = typeof record.observedRunId === "string" && record.observedRunId.trim()
      ? record.observedRunId.trim()
      : undefined;
    const selectedFileKeys = readStringArray(record.selectedFileKeys);
    result.push({
      nodeId,
      taskId,
      detailMode,
      ...(observedRunId ? { observedRunId } : {}),
      ...(selectedFileKeys.length > 0 ? { selectedFileKeys } : {}),
    });
  }
  return result;
}

function readStoredCanvasUiState(): StoredCanvasUiState | null {
  try {
    const raw = globalThis.localStorage?.getItem(CANVAS_UI_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = readRecord(JSON.parse(raw));
    if (!parsed || parsed.schemaVersion !== 1) return null;
    const dataSource = parsed.dataSource === "live" ? "live" : parsed.dataSource === "mock" ? "mock" : null;
    if (!dataSource) return null;
    const selectedFixtureId = typeof parsed.selectedFixtureId === "string" ? parsed.selectedFixtureId : undefined;
    const liveRunMode = parsed.liveRunMode === "latest" ? "latest" : parsed.liveRunMode === "workspace" ? "workspace" : undefined;
    const viewport = readStoredViewport(parsed.viewport);
    return {
      schemaVersion: 1,
      dataSource,
      ...(selectedFixtureId ? { selectedFixtureId } : {}),
      ...(liveRunMode ? { liveRunMode } : {}),
      ...(viewport ? { viewport } : {}),
      expandedAgentBranch: readStoredAgentBranch(parsed.expandedAgentBranch),
      expandedTaskBranches: readStoredTaskBranches(parsed.expandedTaskBranches),
      minimizedAgentNodeIds: readStringArray(parsed.minimizedAgentNodeIds),
      minimizedTaskNodeIds: readStringArray(parsed.minimizedTaskNodeIds),
      minimizedSourceNodeIds: readStringArray(parsed.minimizedSourceNodeIds),
      rootNodeFilter: parsed.rootNodeFilter === "agent" || parsed.rootNodeFilter === "task" ? parsed.rootNodeFilter : undefined,
    };
  } catch {
    return null;
  }
}

function writeStoredCanvasUiState(state: StoredCanvasUiState) {
  try {
    globalThis.localStorage?.setItem(CANVAS_UI_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function canvasUiContextMatches(state: StoredCanvasUiState, dataSource: DataSource, selectedFixtureId: string, liveRunMode: LiveRunMode): boolean {
  if (state.dataSource !== dataSource) return false;
  if (dataSource === "mock") {
    return (state.selectedFixtureId ?? CLEAN_AGENT_WORKSPACE_ID) === selectedFixtureId;
  }
  return (state.liveRunMode ?? "workspace") === liveRunMode;
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

export function App() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [agentNodes, setAgentNodes] = useState<AtlasAgentNode[]>([]);
  const [liveAgentNodesHydrated, setLiveAgentNodesHydrated] = useState(false);
  const [taskConnectionDraft, setTaskConnectionDraft] = useState<TaskConnectionDraft | null>(null);
  const [taskDependencyDraft, setTaskDependencyDraft] = useState<{ fromTaskId: string } | null>(null);
  const [sourceConnectionDraft, setSourceConnectionDraft] = useState<SourceConnectionDraft | null>(null);
  const [taskRunSavingByTaskId, setTaskRunSavingByTaskId] = useState<Record<string, boolean>>({});
  const [taskRunObserverByRunId, setTaskRunObserverByRunId] = useState<Record<string, TaskRunObserverState>>({});
  const [taskNodes, setTaskNodes] = useState<AtlasTaskNode[]>([]);
  const [liveTaskNodesHydrated, setLiveTaskNodesHydrated] = useState(false);
  const [sourceAtlasNodes, setSourceAtlasNodes] = useState<AtlasSourceNode[]>([]);
  const [liveSourceNodesHydrated, setLiveSourceNodesHydrated] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [taskLeaderPickerOpen, setTaskLeaderPickerOpen] = useState(false);
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null);
  const [canvasViewport, setCanvasViewport] = useState<AtlasViewport>({ x: 0, y: 0, scale: 1 });
  const [expandedAgentBranch, setExpandedAgentBranch] = useState<AgentBranchState | null>(null);
  const [minimizedAgentNodeIds, setMinimizedAgentNodeIds] = useState<string[]>([]);
  const [minimizedTaskNodeIds, setMinimizedTaskNodeIds] = useState<string[]>([]);
  const [minimizedSourceNodeIds, setMinimizedSourceNodeIds] = useState<string[]>([]);
  const [canvasUiStateHydrated, setCanvasUiStateHydrated] = useState(false);
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
  const [rootNodeFilter, setRootNodeFilter] = useState<"all" | "agent" | "task">("all");
  const {
    taskLeaderCopyByTaskId,
    copyTaskLeaderContext,
    clearTaskLeaderCopy,
    registerTaskLeaderManualCopyRef,
  } = useTaskLeaderCopy();

  const clearTaskPanelState = useCallback((taskId?: string) => {
    clearTaskEditState(taskId);
    setTaskArchiveConfirmNodeId(null);
    setTaskArchiveSavingNodeId(null);
  }, [clearTaskEditState]);

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
    setTaskRunSavingByTaskId({});
    setTaskRunObserverByRunId({});

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

    if (reason === "mock-workspace" || reason === "live-run-mode") {
      setCanvasViewport({ x: 0, y: 0, scale: 1 });
    }
  }, []);

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
  });
  const {
    dataSource, setDataSource,
    selectedFixtureId, setSelectedFixtureId,
    liveRunMode, setLiveRunMode,
    loading, error, setError,
    liveTasksRefreshing,
    agents, agentRunStatusById,
    plan, run, attemptsByTaskId,
    tasks, taskConnections, taskDependencies,
    sourceNodes, sourceConnections,
    taskRunsByTaskId, setTaskRunsByTaskId,
    refreshLiveTasks,
    refreshLiveTasksAfterLeavingTaskCreateBranch,
    readAttemptFile,
    setTaskConnections, setTaskDependencies,
    setSourceNodes, setSourceConnections,
    setTasks,
  } = liveData;

  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.taskId, task])), [tasks]);
  const sourceNodesById = useMemo(() => new Map(sourceNodes.map((node) => [node.sourceNodeId, node])), [sourceNodes]);
  const agentRunStatusesById = useMemo(() => new Map(Object.entries(agentRunStatusById)), [agentRunStatusById]);
  const addedAgentIds = useMemo(() => new Set(agentNodes.map((node) => node.agentId)), [agentNodes]);
  const canvasUiContextKey = dataSource === "mock" ? `mock:${selectedFixtureId}` : `live:${liveRunMode}`;
  const hydratedCanvasUiContextKeyRef = useRef<string | null>(null);
  const expandedAgentNode = expandedAgentBranch
    ? agentNodes.find((node) => node.nodeId === expandedAgentBranch.nodeId) ?? null
    : null;
  const expandedAgent = expandedAgentNode ? agentsById.get(expandedAgentNode.agentId) ?? null : null;
  const runObserverTargets = useMemo(() => expandedTaskBranches.flatMap((branch) => {
    if (branch.detailMode !== "run-observer" || !branch.observedRunId) return [];
    const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
    const task = node ? tasksById.get(node.taskId) ?? null : null;
    if (!task) return [];
    const taskRun = (taskRunsByTaskId[task.taskId] ?? []).find((run) => run.runId === branch.observedRunId) ?? null;
    if (!taskRun) return [];
    return [{ taskId: task.taskId, runId: taskRun.runId, status: taskRun.status }];
  }), [expandedTaskBranches, taskNodes, taskRunsByTaskId, tasksById]);
  const runObserverTargetSignature = useMemo(() => runObserverTargets
    .map((target) => `${target.taskId}\u0000${target.runId}\u0000${target.status}`)
    .join("\u0001"), [runObserverTargets]);

  const selectTask = useCallback((taskId: string) => {
    setSelectedTaskId((current) => current === taskId ? null : taskId);
  }, []);

  useEffect(() => {
    setCanvasUiStateHydrated(false);
  }, [canvasUiContextKey]);

  useEffect(() => {
    setMinimizedAgentNodeIds((current) => {
      const nodeIds = new Set(agentNodes.filter((node) => agentsById.has(node.agentId)).map((node) => node.nodeId));
      const next = current.filter((nodeId) => nodeIds.has(nodeId));
      return next.length === current.length ? current : next;
    });
  }, [agentNodes, agentsById]);

  useEffect(() => {
    setMinimizedTaskNodeIds((current) => {
      const nodeIds = new Set(taskNodes.map((node) => node.nodeId));
      const next = current.filter((nodeId) => nodeIds.has(nodeId));
      return next.length === current.length ? current : next;
    });
  }, [taskNodes]);

  useEffect(() => {
    if (canvasUiStateHydrated) return;
    const ready = dataSource === "live"
      ? liveAgentNodesHydrated && liveTaskNodesHydrated && liveSourceNodesHydrated
      : taskNodes.length > 0;
    if (!ready) return;

    const stored = readStoredCanvasUiState();
    if (!stored || !canvasUiContextMatches(stored, dataSource, selectedFixtureId, liveRunMode)) {
      hydratedCanvasUiContextKeyRef.current = canvasUiContextKey;
      setCanvasUiStateHydrated(true);
      return;
    }

    const validAgentNodes = agentNodes.filter((node) => agentsById.has(node.agentId));
    const agentNodeIds = new Set(validAgentNodes.map((node) => node.nodeId));
    const agentIds = new Set(validAgentNodes.map((node) => node.agentId));
    const taskNodeIds = new Set(taskNodes.map((node) => node.nodeId));
    const taskIds = new Set(taskNodes.map((node) => node.taskId));
    const sourceNodeIds = new Set(sourceAtlasNodes.map((node) => node.nodeId));
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
    liveRunMode,
    liveSourceNodesHydrated,
    liveTaskNodesHydrated,
    selectedFixtureId,
    sourceAtlasNodes,
    taskNodes,
  ]);

  useEffect(() => {
    if (!canvasUiStateHydrated) return;
    if (hydratedCanvasUiContextKeyRef.current !== canvasUiContextKey) return;
    writeStoredCanvasUiState({
      schemaVersion: 1,
      dataSource,
      ...(dataSource === "mock" ? { selectedFixtureId } : { liveRunMode }),
      viewport: canvasViewport,
      expandedAgentBranch,
      expandedTaskBranches,
      minimizedAgentNodeIds,
      minimizedTaskNodeIds,
      minimizedSourceNodeIds,
      rootNodeFilter,
    });
  }, [
    canvasUiContextKey,
    canvasUiStateHydrated,
    canvasViewport,
    dataSource,
    expandedAgentBranch,
    expandedTaskBranches,
    liveRunMode,
    minimizedAgentNodeIds,
    minimizedSourceNodeIds,
    minimizedTaskNodeIds,
    rootNodeFilter,
    selectedFixtureId,
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

  const saveTaskEdit = useCallback(async (taskId: string) => {
    const task = tasksById.get(taskId);
    const draft = taskEditDraftByTaskId[taskId];
    if (!task || !draft || draft.taskId !== taskId) return;

    const patch: TeamTaskUpdateRequest = {};
    const dirty = draft.dirtyFields;
    const title = draft.title.trim();

    if (hasDirtyTaskEditConflict(task, draft)) {
      setTaskEditWarning(taskId, "Task 已经在后台更新，请重新打开编辑节点后再保存。");
      return;
    }

    if (dirty.title && title !== task.title) {
      patch.title = title;
    }
    if (dirty.leaderAgentId && draft.leaderAgentId !== task.leaderAgentId) {
      patch.leaderAgentId = draft.leaderAgentId;
    }
    const workerChanged = Boolean(dirty.workerAgentId) && draft.workerAgentId !== task.workUnit.workerAgentId;
    const checkerChanged = Boolean(dirty.checkerAgentId) && draft.checkerAgentId !== task.workUnit.checkerAgentId;
    if (workerChanged || checkerChanged) {
      patch.workUnit = {
        ...task.workUnit,
        ...(workerChanged ? { workerAgentId: draft.workerAgentId } : {}),
        ...(checkerChanged ? { checkerAgentId: draft.checkerAgentId } : {}),
      };
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
      if (dataSource === "live") {
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
  }, [clearTaskEditWarning, dataSource, refreshLiveTasks, replaceTaskEditDraft, setTaskEditSaving, setTaskEditWarning, taskEditDraftByTaskId, tasksById]);

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

  const runTask = useCallback(async (task: TeamCanvasTask) => {
    const taskId = task.taskId;
    setTaskRunSavingByTaskId((current) => ({ ...current, [taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const taskRun = await api.createTaskRun(taskId);
      setTaskRunsByTaskId((current) => mergeTaskRun(current, taskId, taskRun));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskRunSavingByTaskId((current) => ({ ...current, [taskId]: false }));
    }
  }, [dataSource]);

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
        const [freshRun, attempts] = await Promise.all([
          api.getTaskRun(runId),
          api.listTaskRunAttempts(runId, observedTaskId),
        ]);
        if (cancelled) return;

        setTaskRunsByTaskId((current) => mergeTaskRun(current, observedTaskId, freshRun));
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
        if (cancelled || fileEntries.length === 0) return;
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

    async function refreshTaskRunObservers() {
      await Promise.all(runObserverTargets.map((target) => refreshTaskRunObserver(target)));
    }

    const shouldPoll = runObserverTargets.some((target) => isActiveRun(target.status));
    void refreshTaskRunObservers();
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
  }, [dataSource, runObserverTargetSignature]);

  const canCreateTask = dataSource === "live" && agents.length > 0;
  const canRefreshTasks = dataSource === "live" && !liveTasksRefreshing;

  const agentToolbar = (
    <div className="agent-atlas-actions">
      <div className="root-filter-segment" role="tablist" aria-label="根节点显示">
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
                void runTask(task);
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

    for (const branch of expandedTaskBranches) {
      if (branch.detailMode !== "run-observer" || !branch.observedRunId) continue;
      const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
      const task = node ? tasksById.get(node.taskId) ?? null : null;
      if (!node || !task) continue;
      const observedTaskRun = (taskRunsByTaskId[task.taskId] ?? []).find((taskRun) => taskRun.runId === branch.observedRunId) ?? null;
      if (!observedTaskRun) continue;

      const observerState = taskRunObserverByRunId[observedTaskRun.runId] ?? null;
      const attempts = observerState?.attempts ?? [];
      const fileDescriptors = attempts.length > 0 ? buildTaskRunFileDescriptors(attempts) : [];
      const latestAttempt = selectLatestAttempt(attempts);
      const selectedFileKeys = branch.selectedFileKeys ?? [];
      const selectedFileKeySet = new Set(selectedFileKeys);
      const selectedFileDescriptors = selectedFileKeys
        .map((key) => fileDescriptors.find((descriptor) => descriptor.key === key) ?? null)
        .filter((descriptor): descriptor is TaskRunObserverFileDescriptor => Boolean(descriptor));
      const observedTaskRunIsActive = isActiveRun(observedTaskRun.status);
      const runObserverPanelId = `run-observer-${branch.nodeId}`;

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

      panels.push({
        id: runObserverPanelId,
        width: 420,
        autoHeight: true,
        sourceId: taskMenuPanelId(branch.nodeId),
        panel: (
          <div className={`emap-run-observer-panel ${observedTaskRunIsActive ? "active" : "terminal"}`}>
            <header className="emap-run-observer-head">
              <span>{"\u8fd0\u884c\u89c2\u5bdf"}</span>
              <strong>{RUN_STATUS_LABELS[observedTaskRun.status]}</strong>
            </header>
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
              <div className="emap-observer-empty">{"\u6682\u65e0 attempt \u6587\u4ef6\u3002\u8fd0\u884c\u521a\u542f\u52a8\u65f6\u8fd9\u91cc\u4f1a\u968f\u8f6e\u8be2\u8865\u9f50\u3002"}</div>
            )}
          </div>
        ),
      });

      for (const descriptor of selectedFileDescriptors) {
        const fileState = observerState?.files[descriptor.key];
        panels.push({
          id: `file-detail-${branch.nodeId}-${descriptor.key}`.replace(/[^A-Za-z0-9_-]/g, "-"),
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
    }

    return panels;
  }, [agents, agentsById, archiveTask, cancelTaskRun, clearTaskEditWarning, copyTaskLeaderContext, expandedTaskBranches, openTaskEditDraft, registerTaskLeaderManualCopyRef, runTask, saveTaskEdit, taskArchiveConfirmNodeId, taskArchiveSavingNodeId, taskEditDraftByTaskId, taskEditSavingByTaskId, taskEditWarningByTaskId, taskLeaderCopyByTaskId, taskNodes, taskRunObserverByRunId, taskRunSavingByTaskId, taskRunsByTaskId, tasksById, updateTaskEditDraft]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-title">团队控制台</h1>
          <span className="app-subtitle">执行地图预览</span>
        </div>
        <div className="app-header-right">
          <select
            id="team-console-data-source"
            name="teamConsoleDataSource"
            value={dataSource}
            onChange={(event) => {
              const nextSource = event.target.value as DataSource;
              setDataSource(nextSource);
              if (nextSource === "live") {
                setLiveRunMode("workspace");
              }
            }}
            className="datasource-select"
          >
            <option value="mock">示例数据</option>
            <option value="live">实时 API</option>
          </select>
        </div>
      </header>

      {dataSource === "mock" && (
        <div className="fixture-bar">
          <span className="fixture-label">示例：</span>
          <button
            className={`fixture-btn ${selectedFixtureId === CLEAN_AGENT_WORKSPACE_ID ? "active" : ""}`}
            onClick={() => setSelectedFixtureId(CLEAN_AGENT_WORKSPACE_ID)}
          >
            Agent workspace
          </button>
          {ALL_FIXTURES.map((fixture) => (
            <button
              key={fixture.id}
              className={`fixture-btn ${selectedFixtureId === fixture.id ? "active" : ""}`}
              onClick={() => setSelectedFixtureId(fixture.id)}
            >
              {fixture.label}
            </button>
          ))}
        </div>
      )}

      {dataSource === "live" && (
        <div className="fixture-bar live-run-bar">
          <span className="fixture-label">运行图：</span>
          <button
            className={`fixture-btn ${liveRunMode === "workspace" ? "active" : ""}`}
            onClick={() => {
              setLiveRunMode("workspace");
              void refreshLiveTasks().catch((e) => setError(errorMessage(e)));
            }}
          >
            Agent workspace
          </button>
          <button
            className={`fixture-btn ${liveRunMode === "latest" ? "active" : ""}`}
            onClick={() => setLiveRunMode("latest")}
          >
            最新 Run
          </button>
        </div>
      )}

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
        {loading ? (
          <div className="empty-state">
            <p>正在加载实时运行...</p>
          </div>
        ) : (
          <div className="workspace">
            <div className="workspace-map">
              <ExecutionMap
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
                focusedTaskNodeId={focusedTaskBranch?.nodeId ?? null}
                onSelectCanvasTask={toggleTaskBranch}
                onMoveCanvasTask={moveTaskNode}
                minimizedTaskNodeIds={minimizedTaskNodeIds}
                onMinimizeCanvasTask={minimizeTaskNode}
                onRestoreCanvasTask={restoreTaskNode}
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
                toolbarStart={agentToolbar}
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
