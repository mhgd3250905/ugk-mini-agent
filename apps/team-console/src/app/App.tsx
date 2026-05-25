import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { LiveTeamApi } from "../api/team-api";
import type { AgentRunStatus, AgentSummary, TeamCanvasTask, TeamPlan, RunDetail, TeamApiError, TeamRunState, TeamAttemptMetadata, TeamTaskUpdateRequest, TeamRoleRuntimeContext, TeamAttemptRoleProcess, TeamAttemptRoleProcessRole, TeamAttemptRoleProcessStatus, AgentChatProcessEntry } from "../api/team-types";
import { ALL_FIXTURES, MOCK_AGENTS, MOCK_AGENT_RUN_STATUSES, mockTeamTasks, MockTeamApi } from "../fixtures/team-fixtures";
import { ExecutionMap, type AtlasAgentNode, type AtlasTaskNode } from "../graph/ExecutionMap";
import { ROOT_ID } from "../graph/execution-map-layout";
import type { AtlasViewport } from "../graph/AtlasCanvasShell";
import { RUN_STATUS_LABELS, isActiveRun } from "../shared/status";
import { renderTeamMarkdown } from "../shared/markdown";
import "./app.css";

export type DataSource = "mock" | "live";
type LiveRunMode = "workspace" | "latest";

const CLEAN_AGENT_WORKSPACE_ID = "agent-workspace";
const DEFAULT_PLAYGROUND_BASE_URL = "http://127.0.0.1:3000";
const DATA_SOURCE_STORAGE_KEY = "ugk-team-console:data-source";
const LIVE_AGENT_LAYOUT_STORAGE_KEY = "ugk-team-console:live-agent-layout:v1";
const LIVE_TASK_LAYOUT_STORAGE_KEY = "ugk-team-console:live-task-layout:v1";
const TASK_RUN_PROCESS_ROLES: TeamAttemptRoleProcessRole[] = ["worker", "checker"];
const TASK_RUN_PROCESS_LABELS: Record<TeamAttemptRoleProcessRole, string> = {
  worker: "Worker 过程",
  checker: "Checker 过程",
};

type AgentBranchMode = "chat" | "task-create";

type AgentBranchState = {
  nodeId: string;
  agentId: string;
  mode: AgentBranchMode;
};

type TaskBranchDetailMode = "leader-chat" | "edit" | "run-observer";

type TaskBranchState = {
  nodeId: string;
  taskId: string;
  detailMode: TaskBranchDetailMode | null;
  observedRunId?: string;
  selectedFileKey?: string | null;
};

type TaskEditDirtyField = "title" | "leaderAgentId" | "workerAgentId" | "checkerAgentId";

type TaskEditBaseSnapshot = {
  title: string;
  leaderAgentId: string;
  workerAgentId: string;
  checkerAgentId: string;
  updatedAt: string;
};

type TaskEditDraft = {
  taskId: string;
  title: string;
  leaderAgentId: string;
  workerAgentId: string;
  checkerAgentId: string;
  base: TaskEditBaseSnapshot;
  dirtyFields: Partial<Record<TaskEditDirtyField, true>>;
};

type StoredTaskPosition = {
  taskId: string;
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

type ProcessToolGroupStatus = "running" | "finished" | "failed" | "event";

type ProcessToolGroup = {
  id: string;
  toolName: string;
  entries: AgentChatProcessEntry[];
  status: ProcessToolGroupStatus;
  isEvent: boolean;
  latestCreatedAt: string;
};

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

function compareEntryTime(a: string, b: string): number {
  const aTime = Date.parse(a);
  const bTime = Date.parse(b);
  if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
  if (!Number.isFinite(aTime)) return -1;
  if (!Number.isFinite(bTime)) return 1;
  return aTime - bTime;
}

function resolveToolGroupStatus(entries: AgentChatProcessEntry[], isEvent: boolean): ProcessToolGroupStatus {
  if (isEvent) return "event";
  if (entries.some((entry) => entry.isError || entry.kind === "error")) return "failed";
  if (entries.some((entry) => entry.kind === "ok")) return "finished";
  return "running";
}

function buildToolGroups(entries: AgentChatProcessEntry[]): ProcessToolGroup[] {
  const groups: ProcessToolGroup[] = [];
  const groupsById = new Map<string, ProcessToolGroup>();
  for (const entry of entries) {
    const isEvent = !entry.toolCallId;
    const id = entry.toolCallId ?? `event:${entry.id}`;
    let group = groupsById.get(id);
    if (!group) {
      group = {
        id,
        toolName: isEvent ? "普通事件" : entry.toolName || "tool",
        entries: [],
        status: "running",
        isEvent,
        latestCreatedAt: entry.createdAt,
      };
      groupsById.set(id, group);
      groups.push(group);
    }
    group.entries.push(entry);
    if (compareEntryTime(entry.createdAt, group.latestCreatedAt) >= 0) {
      group.latestCreatedAt = entry.createdAt;
      if (!group.isEvent && entry.toolName) group.toolName = entry.toolName;
    }
    group.status = resolveToolGroupStatus(group.entries, group.isEvent);
  }
  return groups;
}

function formatToolGroupStatus(status: ProcessToolGroupStatus): string {
  switch (status) {
    case "running": return "执行中";
    case "finished": return "完成";
    case "failed": return "失败";
    case "event": return "事件";
  }
}

function isTerminalRoleProcess(status: TeamAttemptRoleProcessStatus | undefined): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function isToolGroupDefaultExpanded(
  group: ProcessToolGroup,
  roleProcess: TeamAttemptRoleProcess | undefined,
  groups: ProcessToolGroup[],
): boolean {
  if (group.isEvent) return true;
  if (roleProcess?.status === "running" && group.status === "running") return true;
  if (!isTerminalRoleProcess(roleProcess?.status)) return false;
  if (group.status !== "finished" && group.status !== "failed") return false;
  const terminalToolGroups = groups.filter((candidate) => (
    !candidate.isEvent && (candidate.status === "finished" || candidate.status === "failed")
  ));
  const latest = terminalToolGroups.reduce<ProcessToolGroup | null>((current, candidate) => {
    if (!current) return candidate;
    return compareEntryTime(candidate.latestCreatedAt, current.latestCreatedAt) >= 0 ? candidate : current;
  }, null);
  return latest?.id === group.id;
}

function processToolGroupStateKey(runId: string, role: TeamAttemptRoleProcessRole, groupId: string): string {
  return `${runId}:${role}:${groupId}`;
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
  runId: string,
  expandedToolGroups: Record<string, boolean>,
  onToggleToolGroup: (key: string, expanded: boolean) => void,
): ReactNode {
  const process = roleProcess?.process ?? null;
  const currentAction = process?.currentAction?.trim() || "等待过程数据";
  const latestNarration = getLatestNarration(process ?? undefined);
  const status = roleProcess?.status ?? "waiting";
  const groups = buildToolGroups(process?.entries ?? []);
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
        <div className="emap-observer-process-line">
          <span>Current action</span>
          <strong>{currentAction}</strong>
        </div>
        <p className="emap-observer-process-narration">{latestNarration}</p>
      </div>
      {groups.length > 0 ? (
        <div className="emap-process-tool-groups">
          {groups.map((group) => {
            const stateKey = processToolGroupStateKey(runId, role, group.id);
            const expanded = expandedToolGroups[stateKey] ?? isToolGroupDefaultExpanded(group, roleProcess, groups);
            return (
              <section
                key={group.id}
                className={`emap-process-tool-group ${group.status} ${expanded ? "expanded" : "collapsed"}`}
                data-tool-group-id={group.id}
              >
                <button
                  type="button"
                  className="emap-process-tool-group-header"
                  aria-expanded={expanded}
                  onClick={() => onToggleToolGroup(stateKey, expanded)}
                >
                  <span className="emap-process-tool-name">{group.toolName}</span>
                  <span className={`emap-process-tool-status ${group.status}`}>{formatToolGroupStatus(group.status)}</span>
                  <span className="emap-process-tool-count">{group.entries.length}</span>
                </button>
                {expanded && (
                  <div className="emap-process-tool-entry-list">
                    {group.entries.map((entry) => (
                      <article key={entry.id} className={`emap-process-tool-entry ${entry.kind}`}>
                        <div className="emap-process-tool-entry-title">{entry.title}</div>
                        {entry.detail && <pre className="emap-process-tool-entry-detail">{entry.detail}</pre>}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="emap-observer-process-empty">暂无过程条目</div>
      )}
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

function sortRunsByCreatedAt(runs: TeamRunState[]): TeamRunState[] {
  return [...runs].sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
    if (!Number.isFinite(aTime)) return 1;
    if (!Number.isFinite(bTime)) return -1;
    return bTime - aTime;
  });
}

function mergeTaskRun(
  current: Record<string, TeamRunState[]>,
  taskId: string,
  runState: TeamRunState,
): Record<string, TeamRunState[]> {
  const runs = current[taskId] ?? [];
  const nextRuns = runs.some((run) => run.runId === runState.runId)
    ? runs.map((run) => run.runId === runState.runId ? runState : run)
    : [runState, ...runs];
  return {
    ...current,
    [taskId]: sortRunsByCreatedAt(nextRuns),
  };
}

function playgroundBaseUrl(): string {
  const configured =
    import.meta.env.VITE_TEAM_CONSOLE_PLAYGROUND_BASE_URL ||
    import.meta.env.VITE_TEAM_CONSOLE_API_TARGET;
  const raw = typeof configured === "string" && configured.trim()
    ? configured.trim()
    : DEFAULT_PLAYGROUND_BASE_URL;
  return raw.replace(/\/+$/, "");
}

function buildAgentPlaygroundUrl(agentId: string, mode: AgentBranchMode = "chat"): string {
  const url = new URL("/playground", playgroundBaseUrl());
  url.searchParams.set("view", "chat");
  url.searchParams.set("agentId", agentId);
  url.searchParams.set("embed", "team-console");
  if (mode === "task-create") {
    url.searchParams.set("teamTaskMode", "create");
  }
  return url.toString();
}

function buildTaskLeaderPlaygroundUrl(task: TeamCanvasTask): string {
  const url = new URL("/playground", playgroundBaseUrl());
  url.searchParams.set("view", "chat");
  url.searchParams.set("agentId", task.leaderAgentId);
  url.searchParams.set("embed", "team-console");
  url.searchParams.set("teamTaskId", task.taskId);
  url.searchParams.set("teamTaskMode", "edit");
  return url.toString();
}

function agentRunStatusRecord(statuses: AgentRunStatus[]): Record<string, AgentRunStatus> {
  return Object.fromEntries(statuses.map((status) => [status.agentId, status]));
}

function readStoredDataSource(): DataSource {
  try {
    return globalThis.localStorage?.getItem(DATA_SOURCE_STORAGE_KEY) === "live" ? "live" : "mock";
  } catch {
    return "mock";
  }
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

function makeTaskEditDraft(task: TeamCanvasTask): TaskEditDraft {
  const base = {
    title: task.title,
    leaderAgentId: task.leaderAgentId,
    workerAgentId: task.workUnit.workerAgentId,
    checkerAgentId: task.workUnit.checkerAgentId,
    updatedAt: task.updatedAt,
  };
  return {
    taskId: task.taskId,
    title: base.title,
    leaderAgentId: base.leaderAgentId,
    workerAgentId: base.workerAgentId,
    checkerAgentId: base.checkerAgentId,
    base,
    dirtyFields: {},
  };
}

function hasDirtyTaskEditConflict(task: TeamCanvasTask, draft: TaskEditDraft): boolean {
  const dirty = draft.dirtyFields;
  return Boolean(
    (dirty.title && task.title !== draft.base.title && draft.title.trim() !== task.title) ||
    (dirty.leaderAgentId && task.leaderAgentId !== draft.base.leaderAgentId && draft.leaderAgentId !== task.leaderAgentId) ||
    (dirty.workerAgentId && task.workUnit.workerAgentId !== draft.base.workerAgentId && draft.workerAgentId !== task.workUnit.workerAgentId) ||
    (dirty.checkerAgentId && task.workUnit.checkerAgentId !== draft.base.checkerAgentId && draft.checkerAgentId !== task.workUnit.checkerAgentId)
  );
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
  const [dataSource, setDataSource] = useState<DataSource>(() => readStoredDataSource());
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>(CLEAN_AGENT_WORKSPACE_ID);
  const [liveRunMode, setLiveRunMode] = useState<LiveRunMode>("workspace");
  const [plan, setPlan] = useState<TeamPlan | null>(null);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [attemptsByTaskId, setAttemptsByTaskId] = useState<Record<string, TeamAttemptMetadata[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [agents, setAgents] = useState<AgentSummary[]>(MOCK_AGENTS);
  const [agentRunStatusById, setAgentRunStatusById] = useState<Record<string, AgentRunStatus>>(
    () => agentRunStatusRecord(MOCK_AGENT_RUN_STATUSES),
  );
  const [agentNodes, setAgentNodes] = useState<AtlasAgentNode[]>([]);
  const [liveAgentNodesHydrated, setLiveAgentNodesHydrated] = useState(false);
  const [tasks, setTasks] = useState<TeamCanvasTask[]>([]);
  const [taskRunsByTaskId, setTaskRunsByTaskId] = useState<Record<string, TeamRunState[]>>({});
  const [taskRunSavingByTaskId, setTaskRunSavingByTaskId] = useState<Record<string, boolean>>({});
  const [taskRunObserverByRunId, setTaskRunObserverByRunId] = useState<Record<string, TaskRunObserverState>>({});
  const [expandedProcessToolGroups, setExpandedProcessToolGroups] = useState<Record<string, boolean>>({});
  const [taskNodes, setTaskNodes] = useState<AtlasTaskNode[]>([]);
  const [liveTaskNodesHydrated, setLiveTaskNodesHydrated] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [taskLeaderPickerOpen, setTaskLeaderPickerOpen] = useState(false);
  const [liveTasksRefreshing, setLiveTasksRefreshing] = useState(false);
  const liveTasksRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const [canvasViewport, setCanvasViewport] = useState<AtlasViewport>({ x: 0, y: 0, scale: 1 });
  const [expandedAgentBranch, setExpandedAgentBranch] = useState<AgentBranchState | null>(null);
  const [expandedTaskBranch, setExpandedTaskBranch] = useState<TaskBranchState | null>(null);
  const [taskEditDraft, setTaskEditDraft] = useState<TaskEditDraft | null>(null);
  const [taskEditSaving, setTaskEditSaving] = useState(false);
  const [taskEditWarning, setTaskEditWarning] = useState<string | null>(null);
  const [taskArchiveConfirming, setTaskArchiveConfirming] = useState(false);
  const [taskArchiveSaving, setTaskArchiveSaving] = useState(false);

  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.taskId, task])), [tasks]);
  const agentRunStatusesById = useMemo(() => new Map(Object.entries(agentRunStatusById)), [agentRunStatusById]);
  const addedAgentIds = useMemo(() => new Set(agentNodes.map((node) => node.agentId)), [agentNodes]);
  const expandedAgentNode = expandedAgentBranch
    ? agentNodes.find((node) => node.nodeId === expandedAgentBranch.nodeId) ?? null
    : null;
  const expandedAgent = expandedAgentNode ? agentsById.get(expandedAgentNode.agentId) ?? null : null;
  const expandedTaskNode = expandedTaskBranch
    ? taskNodes.find((node) => node.nodeId === expandedTaskBranch.nodeId) ?? null
    : null;
  const expandedTask = expandedTaskNode ? tasksById.get(expandedTaskNode.taskId) ?? null : null;
  const expandedTaskRuns = expandedTask ? taskRunsByTaskId[expandedTask.taskId] ?? [] : [];
  const latestExpandedTaskRun = selectLatestRun(expandedTaskRuns);
  const activeExpandedTaskRun = expandedTaskRuns.find((taskRun) => isActiveRun(taskRun.status)) ?? null;
  const expandedTaskRunSaving = expandedTask ? Boolean(taskRunSavingByTaskId[expandedTask.taskId]) : false;
  const observedTaskRunId = expandedTaskBranch?.detailMode === "run-observer" ? expandedTaskBranch.observedRunId ?? null : null;
  const observedTaskRun = observedTaskRunId
    ? expandedTaskRuns.find((taskRun) => taskRun.runId === observedTaskRunId) ?? null
    : null;
  const observedTaskRunState = observedTaskRunId ? taskRunObserverByRunId[observedTaskRunId] ?? null : null;
  const observedTaskRunAttempts = observedTaskRunState?.attempts ?? [];

  const activeCanvasTaskRunIds = useMemo(() => (
    Object.values(taskRunsByTaskId)
      .flat()
      .filter((taskRun) => isActiveRun(taskRun.status) && taskRun.source?.taskId)
      .map((taskRun) => ({ runId: taskRun.runId, taskId: taskRun.source!.taskId }))
  ), [taskRunsByTaskId]);

  const selectTask = useCallback((taskId: string) => {
    setSelectedTaskId((current) => current === taskId ? null : taskId);
  }, []);

  const clearTaskPanelState = useCallback(() => {
    setTaskEditDraft(null);
    setTaskEditWarning(null);
    setTaskEditSaving(false);
    setTaskArchiveConfirming(false);
    setTaskArchiveSaving(false);
  }, []);

  const closeTaskBranch = useCallback(() => {
    setExpandedTaskBranch(null);
    clearTaskPanelState();
  }, [clearTaskPanelState]);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(DATA_SOURCE_STORAGE_KEY, dataSource);
    } catch {}
  }, [dataSource]);

  useEffect(() => {
    if (dataSource !== "live") {
      setLiveAgentNodesHydrated(false);
      setLiveTaskNodesHydrated(false);
      return;
    }
    setAgentNodes(readStoredLiveAgentNodes());
    setTaskLeaderPickerOpen(false);
    setExpandedAgentBranch(null);
    closeTaskBranch();
    setLiveAgentNodesHydrated(true);
  }, [closeTaskBranch, dataSource]);

  useEffect(() => {
    if (dataSource !== "live" || !liveAgentNodesHydrated) return;
    writeStoredLiveAgentNodes(agentNodes);
  }, [dataSource, liveAgentNodesHydrated, agentNodes]);

  useEffect(() => {
    if (dataSource !== "live" || !liveTaskNodesHydrated) return;
    writeStoredLiveTaskNodes(taskNodes);
  }, [dataSource, liveTaskNodesHydrated, taskNodes]);

  useEffect(() => {
    if (expandedTaskBranch && !tasksById.has(expandedTaskBranch.taskId)) {
      closeTaskBranch();
    }
  }, [closeTaskBranch, expandedTaskBranch, tasksById]);

  const applyLiveTasks = useCallback((nextTasks: TeamCanvasTask[]) => {
    setTasks(nextTasks);
    setTaskNodes((current) => makeTaskNodes(nextTasks, liveTaskRefreshPositions(current)));
    setLiveTaskNodesHydrated(true);
  }, []);

  const loadTaskRunsForTasks = useCallback(async (
    api: Pick<LiveTeamApi, "listTaskRuns">,
    nextTasks: TeamCanvasTask[],
  ) => {
    const entries = await Promise.all(nextTasks.map(async (task) => {
      const runs = await api.listTaskRuns(task.taskId).catch(() => []);
      return [task.taskId, sortRunsByCreatedAt(runs)] as const;
    }));
    setTaskRunsByTaskId(Object.fromEntries(entries));
  }, []);

  const refreshLiveTasks = useCallback(async () => {
    if (liveTasksRefreshInFlightRef.current) {
      return liveTasksRefreshInFlightRef.current;
    }

    const refresh = (async () => {
      setLiveTasksRefreshing(true);
      try {
        const api = new LiveTeamApi();
        const nextTasks = await api.listTasks();
        applyLiveTasks(nextTasks);
        await loadTaskRunsForTasks(api, nextTasks);
        setError(null);
      } finally {
        liveTasksRefreshInFlightRef.current = null;
        setLiveTasksRefreshing(false);
      }
    })();
    liveTasksRefreshInFlightRef.current = refresh;
    return refresh;
  }, [applyLiveTasks, loadTaskRunsForTasks]);

  const refreshLiveTasksAfterLeavingTaskCreateBranch = useCallback((branch: AgentBranchState | null) => {
    if (dataSource !== "live" || branch?.mode !== "task-create") return;
    void refreshLiveTasks().catch((e) => setError(errorMessage(e)));
  }, [dataSource, refreshLiveTasks]);

  const loadFixture = useCallback((fixtureId: string) => {
    setTaskLeaderPickerOpen(false);
    setExpandedAgentBranch(null);
    closeTaskBranch();
    if (fixtureId === CLEAN_AGENT_WORKSPACE_ID) {
      setPlan(null);
      setRun(null);
      setSelectedTaskId(null);
      setAttemptsByTaskId({});
      setTaskRunsByTaskId({});
      setTaskRunSavingByTaskId({});
      setTaskRunObserverByRunId({});
      setError(null);
      setLoading(false);
      setCanvasViewport({ x: 0, y: 0, scale: 1 });
      return;
    }

    const entry = ALL_FIXTURES.find((fixture) => fixture.id === fixtureId);
    if (!entry) return;
    setPlan(entry.plan);
    setRun(entry.run);
    setSelectedTaskId(null);
    setAttemptsByTaskId({});
    setTaskRunsByTaskId({});
    setTaskRunSavingByTaskId({});
    setTaskRunObserverByRunId({});
    setError(null);
    setLoading(false);
  }, [closeTaskBranch]);

  useEffect(() => {
    if (dataSource === "mock") {
      loadFixture(selectedFixtureId);
    }
  }, [dataSource, selectedFixtureId, loadFixture]);

  useEffect(() => {
    setExpandedAgentBranch(null);
    closeTaskBranch();
    let cancelled = false;
    let refreshTimer: ReturnType<typeof globalThis.setInterval> | undefined;
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();

    async function loadAgentRunStatuses() {
      try {
        const statuses = await api.listAgentRunStatuses();
        if (!cancelled) {
          setAgentRunStatusById(agentRunStatusRecord(statuses));
        }
      } catch {
        // Keep the last known status on transient polling failures.
      }
    }

    if (dataSource === "mock") {
      setAgents(MOCK_AGENTS);
      setAgentRunStatusById(agentRunStatusRecord(MOCK_AGENT_RUN_STATUSES));
      setTasks(mockTeamTasks);
      setTaskNodes(makeTaskNodes(mockTeamTasks));
      setTaskRunsByTaskId({});
      setTaskRunObserverByRunId({});
      return () => {
        cancelled = true;
      };
    }

    setAgents([]);
    setAgentPickerOpen(false);
    setTaskLeaderPickerOpen(false);
    setAgentRunStatusById({});
    setTasks([]);
    setTaskRunsByTaskId({});
    setTaskRunSavingByTaskId({});
    setTaskRunObserverByRunId({});
    setTaskNodes([]);
    setLiveTaskNodesHydrated(false);

    async function loadLiveWorkspace() {
      try {
        const [nextAgents, nextStatuses, nextTasks] = await Promise.all([
          api.listAgents(),
          api.listAgentRunStatuses(),
          api.listTasks(),
        ]);
        if (!cancelled) {
          setAgents(nextAgents);
          setAgentRunStatusById(agentRunStatusRecord(nextStatuses));
          applyLiveTasks(nextTasks);
          void loadTaskRunsForTasks(api, nextTasks);
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
        }
      }
    }

    void loadLiveWorkspace();
    refreshTimer = globalThis.setInterval(() => {
      void loadAgentRunStatuses();
    }, 3000);

    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) {
        globalThis.clearInterval(refreshTimer);
      }
    };
  }, [applyLiveTasks, closeTaskBranch, dataSource, loadTaskRunsForTasks]);

  useEffect(() => {
    if (dataSource !== "live") return;

    setExpandedAgentBranch(null);
    closeTaskBranch();
    if (liveRunMode === "workspace") {
      setPlan(null);
      setRun(null);
      setSelectedTaskId(null);
      setAttemptsByTaskId({});
      setError(null);
      setLoading(false);
      setCanvasViewport({ x: 0, y: 0, scale: 1 });
      return;
    }

    let cancelled = false;
    const api = new LiveTeamApi();

    setPlan(null);
    setRun(null);
    setSelectedTaskId(null);
    setAttemptsByTaskId({});
    setError(null);
    setLoading(true);

    async function loadLiveData() {
      try {
        const [plans, runs] = await Promise.all([
          api.listPlans(),
          api.listRuns(),
        ]);
        const selectedRun = selectLatestRun(runs);
        if (!selectedRun) {
          if (!cancelled) {
            setPlan(null);
            setRun(null);
          }
          return;
        }

        const runDetail = await api.getRunDetail(selectedRun.runId);
        const runPlan = plans.find((candidate) => candidate.planId === runDetail.planId);
        if (!runPlan) {
          throw { message: `Plan not found for run: ${runDetail.runId}` };
        }

        if (!cancelled) {
          setPlan(runPlan);
          setRun(runDetail);
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadLiveData();

    return () => {
      cancelled = true;
    };
  }, [closeTaskBranch, dataSource, liveRunMode]);

  useEffect(() => {
    if (!run || !selectedTaskId || selectedTaskId === ROOT_ID) return;
    if (attemptsByTaskId[selectedTaskId]) return;

    let cancelled = false;
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();

    async function loadAttempts() {
      try {
        const attempts = await api.listAttempts(run!.runId, selectedTaskId!);
        if (!cancelled && attempts.length > 0) {
          setAttemptsByTaskId((current) => ({
            ...current,
            [selectedTaskId!]: attempts,
          }));
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
        }
      }
    }

    void loadAttempts();

    return () => {
      cancelled = true;
    };
  }, [dataSource, run, selectedTaskId, attemptsByTaskId]);

  const readAttemptFile = useCallback(
    (runId: string, taskId: string, attemptId: string, fileName: string) => {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      return api.readAttemptFile(runId, taskId, attemptId, fileName);
    },
    [dataSource],
  );

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

  const toggleAgentBranch = useCallback((node: AtlasAgentNode) => {
    setAgentPickerOpen(false);
    setTaskLeaderPickerOpen(false);
    closeTaskBranch();
    refreshLiveTasksAfterLeavingTaskCreateBranch(expandedAgentBranch);
    setExpandedAgentBranch(
      expandedAgentBranch?.nodeId === node.nodeId && expandedAgentBranch.mode === "chat"
        ? null
        : { nodeId: node.nodeId, agentId: node.agentId, mode: "chat" },
    );
  }, [closeTaskBranch, expandedAgentBranch, refreshLiveTasksAfterLeavingTaskCreateBranch]);

  const toggleTaskBranch = useCallback((node: AtlasTaskNode) => {
    setAgentPickerOpen(false);
    setTaskLeaderPickerOpen(false);
    refreshLiveTasksAfterLeavingTaskCreateBranch(expandedAgentBranch);
    setExpandedAgentBranch(null);
    clearTaskPanelState();
    setExpandedTaskBranch((current) => (
      current?.nodeId === node.nodeId ? null : { nodeId: node.nodeId, taskId: node.taskId, detailMode: null }
    ));
  }, [clearTaskPanelState, expandedAgentBranch, refreshLiveTasksAfterLeavingTaskCreateBranch]);

  const openTaskCreateBranch = useCallback((leaderAgentId: string) => {
    const nodeId = `agent-${leaderAgentId}`;
    setAgentNodes((current) => (
      current.some((node) => node.agentId === leaderAgentId)
        ? current
        : [...current, makeAgentNode(leaderAgentId, current.length)]
    ));
    setAgentPickerOpen(false);
    setTaskLeaderPickerOpen(false);
    closeTaskBranch();
    setExpandedAgentBranch({ nodeId, agentId: leaderAgentId, mode: "task-create" });
  }, [closeTaskBranch]);

  const openTaskEditBranch = useCallback((task: TeamCanvasTask) => {
    setTaskEditDraft(makeTaskEditDraft(task));
    setTaskEditWarning(null);
    setTaskArchiveConfirming(false);
    setExpandedTaskBranch((current) => current ? { ...current, detailMode: "edit" } : current);
  }, []);

  const openTaskRunObserverBranch = useCallback((runId: string) => {
    clearTaskPanelState();
    setExpandedTaskBranch((current) => current ? {
      ...current,
      detailMode: "run-observer",
      observedRunId: runId,
      selectedFileKey: null,
    } : current);
  }, [clearTaskPanelState]);

  const saveTaskEdit = useCallback(async () => {
    if (!expandedTask || !taskEditDraft || taskEditDraft.taskId !== expandedTask.taskId) return;

    const patch: TeamTaskUpdateRequest = {};
    const dirty = taskEditDraft.dirtyFields;
    const title = taskEditDraft.title.trim();

    if (hasDirtyTaskEditConflict(expandedTask, taskEditDraft)) {
      setTaskEditWarning("Task 已经在后台更新，请重新打开编辑节点后再保存。");
      return;
    }

    if (dirty.title && title !== expandedTask.title) {
      patch.title = title;
    }
    if (dirty.leaderAgentId && taskEditDraft.leaderAgentId !== expandedTask.leaderAgentId) {
      patch.leaderAgentId = taskEditDraft.leaderAgentId;
    }
    const workerChanged = Boolean(dirty.workerAgentId) && taskEditDraft.workerAgentId !== expandedTask.workUnit.workerAgentId;
    const checkerChanged = Boolean(dirty.checkerAgentId) && taskEditDraft.checkerAgentId !== expandedTask.workUnit.checkerAgentId;
    if (workerChanged || checkerChanged) {
      patch.workUnit = {
        ...expandedTask.workUnit,
        ...(workerChanged ? { workerAgentId: taskEditDraft.workerAgentId } : {}),
        ...(checkerChanged ? { checkerAgentId: taskEditDraft.checkerAgentId } : {}),
      };
    }
    if (Object.keys(patch).length === 0) {
      setTaskEditWarning(null);
      return;
    }

    setTaskEditSaving(true);
    setTaskEditWarning(null);
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const response = await api.updateTask(expandedTask.taskId, patch);
      if (dataSource === "live") {
        await refreshLiveTasks();
      } else {
        const nextTasks = await api.listTasks();
        setTasks(nextTasks);
        setTaskNodes((current) => makeTaskNodes(nextTasks, liveTaskRefreshPositions(current)));
      }
      setTaskEditDraft(makeTaskEditDraft(response.task));
      setTaskEditWarning(response.warnings?.join(" ") ?? null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskEditSaving(false);
    }
  }, [dataSource, expandedTask, refreshLiveTasks, taskEditDraft]);

  const archiveExpandedTask = useCallback(async () => {
    if (!expandedTask) return;

    setTaskArchiveSaving(true);
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      await api.archiveTask(expandedTask.taskId);
      if (dataSource === "live") {
        await refreshLiveTasks();
      } else {
        const nextTasks = await api.listTasks();
        setTasks(nextTasks);
        setTaskNodes((current) => makeTaskNodes(nextTasks, liveTaskRefreshPositions(current)));
      }
      closeTaskBranch();
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskArchiveSaving(false);
    }
  }, [closeTaskBranch, dataSource, expandedTask, refreshLiveTasks]);

  const runExpandedTask = useCallback(async () => {
    if (!expandedTask) return;
    const taskId = expandedTask.taskId;
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
  }, [dataSource, expandedTask]);

  const cancelExpandedTaskRun = useCallback(async () => {
    if (!expandedTask || !activeExpandedTaskRun) return;
    const taskId = expandedTask.taskId;
    setTaskRunSavingByTaskId((current) => ({ ...current, [taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const taskRun = await api.cancelTaskRun(activeExpandedTaskRun.runId);
      setTaskRunsByTaskId((current) => mergeTaskRun(current, taskId, taskRun));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskRunSavingByTaskId((current) => ({ ...current, [taskId]: false }));
    }
  }, [activeExpandedTaskRun, dataSource, expandedTask]);

  const toggleProcessToolGroup = useCallback((key: string, expanded: boolean) => {
    setExpandedProcessToolGroups((current) => ({
      ...current,
      [key]: !expanded,
    }));
  }, []);

  useEffect(() => {
    if (activeCanvasTaskRunIds.length === 0) return;
    let cancelled = false;
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();

    async function refreshActiveTaskRuns() {
      for (const active of activeCanvasTaskRunIds) {
        try {
          const fresh = await api.getTaskRun(active.runId);
          if (!cancelled) {
            setTaskRunsByTaskId((current) => mergeTaskRun(current, active.taskId, fresh));
          }
        } catch {
          // Keep the last visible task run state on transient polling failures.
        }
      }
    }

    const timer = globalThis.setInterval(() => {
      void refreshActiveTaskRuns();
    }, 2000);
    void refreshActiveTaskRuns();

    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [activeCanvasTaskRunIds, dataSource]);

  useEffect(() => {
    const taskId = expandedTask?.taskId;
    if (!taskId || !observedTaskRunId || expandedTaskBranch?.detailMode !== "run-observer") return;

    let cancelled = false;
    const runId = observedTaskRunId;
    const observedTaskId = taskId;
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();

    async function refreshTaskRunObserver() {
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
        setTaskRunObserverByRunId((current) => ({
          ...current,
          [runId]: {
            loading: false,
            attempts: current[runId]?.attempts ?? [],
            files: current[runId]?.files ?? {},
            error: errorMessage(e),
            lastUpdatedAt: current[runId]?.lastUpdatedAt ?? null,
          },
        }));
      }
    }

    const shouldPoll = !observedTaskRun || isActiveRun(observedTaskRun.status);
    void refreshTaskRunObserver();
    if (!shouldPoll) {
      return () => {
        cancelled = true;
      };
    }

    const timer = globalThis.setInterval(() => {
      void refreshTaskRunObserver();
    }, 2000);

    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [dataSource, expandedTask?.taskId, expandedTaskBranch?.detailMode, observedTaskRun?.status, observedTaskRunId]);

  const canCreateTask = dataSource === "live" && agents.length > 0;
  const canRefreshTasks = dataSource === "live" && !liveTasksRefreshing;

  const agentToolbar = (
    <div className="agent-atlas-actions">
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

  const expandedTaskDetailMode = expandedTaskBranch?.detailMode ?? null;
  const activeTaskEditDraft = expandedTask && taskEditDraft?.taskId === expandedTask.taskId
    ? taskEditDraft
    : null;
  const expandedTaskRunButtonLabel = expandedTaskRunSaving
    ? "启动中..."
    : activeExpandedTaskRun
      ? "运行中"
      : latestExpandedTaskRun
        ? "重新运行"
        : "运行";
  const latestExpandedTaskRunSummaryLabel = latestExpandedTaskRun && isActiveRun(latestExpandedTaskRun.status)
    ? "运行中"
    : "最近运行";
  const expandedTaskBranchPanel = expandedTaskNode && expandedTask ? (
    <section className="task-leader-branch task-action-branch emap-menu-branch" aria-label={`${expandedTask.title} Task 操作`}>
      <header className="task-leader-branch-head">
        <div className="task-leader-branch-title">
          <span>Task 操作</span>
          <strong>{expandedTask.title}</strong>
          <code>{expandedTask.taskId}</code>
        </div>
        <button
          type="button"
          className="task-leader-branch-collapse"
          onClick={closeTaskBranch}
          aria-label={`收起 ${expandedTask.title} Task 操作`}
        >
          收起
        </button>
      </header>
      <div className="task-action-menu" aria-label={`${expandedTask.title} 操作菜单`}>
        <button
          type="button"
          className="task-action-menu-button"
          disabled={expandedTaskRunSaving || Boolean(activeExpandedTaskRun) || expandedTask.status !== "ready"}
          title={expandedTask.status === "ready" ? "启动这个 Task 的 WorkUnit run" : "只有 ready Task 可以运行"}
          onClick={() => {
            void runExpandedTask();
          }}
        >
          {expandedTaskRunButtonLabel}
        </button>
        {activeExpandedTaskRun && (
          <button
            type="button"
            className="task-action-menu-button"
            disabled={expandedTaskRunSaving}
            onClick={() => {
              void cancelExpandedTaskRun();
            }}
          >
            停止
          </button>
        )}
        {latestExpandedTaskRun && (
          <button
            type="button"
            className="task-run-summary"
            aria-label={`${expandedTask.title} ${latestExpandedTaskRunSummaryLabel} ${RUN_STATUS_LABELS[latestExpandedTaskRun.status]}`}
            onClick={() => openTaskRunObserverBranch(latestExpandedTaskRun.runId)}
          >
            <span>{latestExpandedTaskRunSummaryLabel}</span>
            <strong>{RUN_STATUS_LABELS[latestExpandedTaskRun.status]}</strong>
            <code>{latestExpandedTaskRun.runId}</code>
            <em>查看输出</em>
          </button>
        )}
        <button
          type="button"
          className="task-action-menu-button"
          onClick={() => openTaskEditBranch(expandedTask)}
        >
          编辑
        </button>
        <button
          type="button"
          className="task-action-menu-button"
          onClick={() => {
            setTaskArchiveConfirming(false);
            setExpandedTaskBranch((current) => current ? { ...current, detailMode: "leader-chat" } : current);
          }}
        >
          对话 Leader
        </button>
        {taskArchiveConfirming ? (
          <div className="task-delete-confirm" role="group" aria-label={`${expandedTask.title} 删除确认`}>
            <p>删除会调用 archive 软归档，不会启动 Task run，也不会把 Task 定义写入 localStorage。</p>
            <div className="task-delete-actions">
              <button
                type="button"
                className="task-action-menu-button"
                disabled={taskArchiveSaving}
                onClick={() => setTaskArchiveConfirming(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="task-action-menu-button danger"
                disabled={taskArchiveSaving}
                onClick={() => {
                  void archiveExpandedTask();
                }}
              >
                {taskArchiveSaving ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="task-action-menu-button danger"
            onClick={() => setTaskArchiveConfirming(true)}
          >
            删除
          </button>
        )}
      </div>
    </section>
  ) : null;
  const observerFileDescriptors = observedTaskRunAttempts.length > 0 ? buildTaskRunFileDescriptors(observedTaskRunAttempts) : [];
  const latestObservedAttempt = selectLatestAttempt(observedTaskRunAttempts);
  const selectedObserverFileKey = expandedTaskBranch?.selectedFileKey ?? null;
  const selectedObserverFileDescriptor = selectedObserverFileKey ? observerFileDescriptors.find((d) => d.key === selectedObserverFileKey) ?? null : null;
  const selectedObserverFileState = selectedObserverFileKey ? observedTaskRunState?.files[selectedObserverFileKey] : undefined;
  const toggleObserverFile = useCallback((key: string) => {
    setExpandedTaskBranch((current) => current ? {
      ...current,
      selectedFileKey: current.selectedFileKey === key ? null : key,
    } : current);
  }, []);
  const expandedTaskChildBranchPanel = expandedTaskNode && expandedTask ? (
    expandedTaskDetailMode === "leader-chat" ? (
      <section className="agent-playground-branch emap-dialog-branch task-leader-chat-branch" aria-label={`${expandedTask.title} leader 对话`}>
        <header className="agent-playground-branch-head">
          <div className="agent-playground-branch-title">
            <span>Leader 对话</span>
            <strong>{expandedTask.title}</strong>
            <code>{expandedTask.taskId}</code>
          </div>
          <button
            type="button"
            className="agent-playground-branch-collapse"
            onClick={() => setExpandedTaskBranch((current) => current ? { ...current, detailMode: null } : current)}
            aria-label={`收起 ${expandedTask.title} leader 对话`}
          >
            收起
          </button>
        </header>
        <div className="task-leader-branch-hint">
          在对话中使用 <code>/team-task</code> 创建或更新这个 Task。Task 数据必须通过后端 API 写入。
        </div>
        <iframe
          className="agent-playground-iframe"
          title={`${expandedTask.title} leader 对话`}
          src={buildTaskLeaderPlaygroundUrl(expandedTask)}
          referrerPolicy="no-referrer"
        />
      </section>
    ) : expandedTaskDetailMode === "edit" && activeTaskEditDraft ? (
      <section className="task-leader-branch emap-panel-branch task-edit-branch" aria-label={`${expandedTask.title} Task 编辑`}>
        <header className="task-leader-branch-head">
          <div className="task-leader-branch-title">
            <span>Task 编辑</span>
            <strong>{expandedTask.title}</strong>
            <code>{expandedTask.taskId}</code>
          </div>
          <button
            type="button"
            className="task-leader-branch-collapse"
            onClick={() => setExpandedTaskBranch((current) => current ? { ...current, detailMode: null } : current)}
            aria-label={`收起 ${expandedTask.title} Task 编辑`}
          >
            收起
          </button>
        </header>
        <form
          className="task-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveTaskEdit();
          }}
        >
          <div className="task-edit-note">
            复杂需求和验收规则继续通过 Leader 对话里的 <code>/team-task</code> 更新；这里仅做 Task 名称和执行 Agent 的浅编辑。
          </div>
          {taskEditWarning && <div className="task-edit-warning" role="status">{taskEditWarning}</div>}
          <div className="task-edit-grid">
            <label className="task-edit-field">
              <span>Task 名称</span>
              <input
                value={activeTaskEditDraft.title}
                onChange={(event) => setTaskEditDraft((current) => (
                  current ? {
                    ...current,
                    title: event.target.value,
                    dirtyFields: { ...current.dirtyFields, title: true },
                  } : current
                ))}
              />
            </label>
            <label className="task-edit-field">
              <span>Leader Agent</span>
              <select
                value={activeTaskEditDraft.leaderAgentId}
                onChange={(event) => setTaskEditDraft((current) => (
                  current ? {
                    ...current,
                    leaderAgentId: event.target.value,
                    dirtyFields: { ...current.dirtyFields, leaderAgentId: true },
                  } : current
                ))}
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
                value={activeTaskEditDraft.workerAgentId}
                onChange={(event) => setTaskEditDraft((current) => (
                  current ? {
                    ...current,
                    workerAgentId: event.target.value,
                    dirtyFields: { ...current.dirtyFields, workerAgentId: true },
                  } : current
                ))}
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
                value={activeTaskEditDraft.checkerAgentId}
                onChange={(event) => setTaskEditDraft((current) => (
                  current ? {
                    ...current,
                    checkerAgentId: event.target.value,
                    dirtyFields: { ...current.dirtyFields, checkerAgentId: true },
                  } : current
                ))}
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
                setTaskEditWarning(null);
                setExpandedTaskBranch((current) => current ? { ...current, detailMode: null } : current);
              }}
            >
              返回菜单
            </button>
            <button type="submit" className="task-action-menu-button primary" disabled={taskEditSaving}>
              {taskEditSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </section>
    ) : null
  ) : null;

  const taskChildBranchPanels = useMemo(() => {
    if (expandedTaskDetailMode !== "run-observer" || !observedTaskRun || !expandedTask) return [];
    const panels: Array<{ id: string; panel: ReactNode; width?: number; height?: number; sourceId?: string; autoHeight?: boolean; resizable?: boolean; minWidth?: number; minHeight?: number }> = [];
    panels.push({
      id: "run-status",
      width: 300,
      autoHeight: true,
      sourceId: undefined,
      panel: (
        <section className="emap-observer-node emap-observer-status-node" aria-label="Run 状态">
          <header className="emap-observer-node-head">
            <span className="emap-observer-node-label">Run 状态</span>
            <button
              type="button"
              className="emap-observer-node-close"
              onClick={() => setExpandedTaskBranch((current) => current ? { ...current, detailMode: null, observedRunId: undefined, selectedFileKey: null } : current)}
              aria-label="收起 Run 观察"
            >
              收起
            </button>
          </header>
          <div className="emap-observer-status-body">
            <strong className="emap-observer-status-value">{RUN_STATUS_LABELS[observedTaskRun.status]}</strong>
            <div className="emap-observer-metrics">
              <div><span>阶段</span><strong>{observedTaskRun.taskStates[expandedTask.taskId]?.progress.phase || observedTaskRun.status}</strong></div>
              <div><span>耗时</span><strong>{elapsedText(observedTaskRun.startedAt ?? observedTaskRun.createdAt, observedTaskRun.finishedAt).replace(/^耗时\s*/, "")}</strong></div>
              <div><span>Attempts</span><strong>{observedTaskRunAttempts.length}</strong></div>
            </div>
            <p className="emap-observer-status-message">{observedTaskRun.taskStates[expandedTask.taskId]?.progress.message || "暂无阶段消息"}</p>
            {observedTaskRunState?.error && <div className="emap-observer-error" role="status">{observedTaskRunState.error}</div>}
            {observedTaskRunState?.loading && <div className="emap-observer-loading" role="status">正在刷新...</div>}
            {observedTaskRunState?.lastUpdatedAt && <div className="emap-observer-updated">最后刷新 {new Date(observedTaskRunState.lastUpdatedAt).toLocaleTimeString()}</div>}
          </div>
        </section>
      ),
    });
    for (const role of TASK_RUN_PROCESS_ROLES) {
      panels.push({
        id: `process-${role}`,
        width: 300,
        autoHeight: true,
        sourceId: undefined,
        panel: renderRoleProcessNode(
          role,
          latestObservedAttempt?.roleProcesses?.[role],
          observedTaskRun.runId,
          expandedProcessToolGroups,
          toggleProcessToolGroup,
        ),
      });
    }
    for (const descriptor of observerFileDescriptors) {
      const isSelected = selectedObserverFileKey === descriptor.key;
      const agentName = descriptor.runtimeContext
        ? (agentsById.get(descriptor.runtimeContext.resolvedProfileId)?.name ?? descriptor.runtimeContext.resolvedProfileId)
        : descriptor.kind === "result"
          ? (descriptor.fileName.includes("accepted") ? "已接受结果" : "结果")
          : descriptor.kind;
      panels.push({
        id: `file-${descriptor.key}`,
        width: 300,
        height: 80,
        sourceId: undefined,
        panel: (
          <button
            type="button"
            className={`emap-observer-node emap-observer-file-node emap-observer-file-compact ${descriptor.kind} ${isSelected ? "selected" : ""}`}
            data-file-kind={descriptor.kind}
            onClick={() => toggleObserverFile(descriptor.key)}
          >
            <header className="emap-observer-node-head">
              <span className="emap-observer-file-agent">{agentName}</span>
              <span className="emap-observer-node-label">{descriptor.title}</span>
            </header>
            <div className="emap-observer-file-body">
              <code className="emap-observer-file-name">{descriptor.fileName}</code>
              <span className="emap-observer-file-path">{descriptor.path}</span>
            </div>
          </button>
        ),
      });
      if (isSelected && selectedObserverFileDescriptor) {
        panels.push({
          id: `file-detail-${descriptor.key}`,
          width: 460,
          height: 420,
          sourceId: `file-${descriptor.key}`,
          resizable: true,
          minWidth: 360,
          minHeight: 280,
          panel: (
            <section className="emap-observer-node emap-observer-file-detail-node" aria-label={selectedObserverFileDescriptor.title}>
              <header className="emap-observer-node-head">
                <span className="emap-observer-node-label">{selectedObserverFileDescriptor.title}</span>
                <code className="emap-observer-file-name">{selectedObserverFileDescriptor.fileName}</code>
                <button
                  type="button"
                  className="emap-observer-node-close"
                  onClick={() => toggleObserverFile(descriptor.key)}
                  aria-label="收起文件详情"
                >
                  收起
                </button>
              </header>
              <div className="emap-observer-file-detail-body">
                {selectedObserverFileState?.error ? (
                  <div className="emap-observer-file-error">{selectedObserverFileState.error}</div>
                ) : selectedObserverFileState?.content ? (
                  renderFileDetailContent(selectedObserverFileDescriptor.fileName, selectedObserverFileState.content)
                ) : (
                  <div className="emap-observer-file-loading">正在读取文件...</div>
                )}
              </div>
            </section>
          ),
        });
      }
    }
    if (observerFileDescriptors.length === 0 && !observedTaskRunState?.loading) {
      panels.push({
        id: "empty-hint",
        width: 300,
        height: 60,
        sourceId: undefined,
        panel: <div className="emap-observer-node emap-observer-empty">暂无 attempt 文件。运行刚启动时这里会随轮询补齐。</div>,
      });
    }
    return panels;
  }, [
    expandedTaskDetailMode, observedTaskRun, expandedTask, observerFileDescriptors,
    selectedObserverFileKey, selectedObserverFileDescriptor, selectedObserverFileState,
    observedTaskRunState, observedTaskRunAttempts, latestObservedAttempt, toggleObserverFile, agentsById,
    expandedProcessToolGroups, toggleProcessToolGroup,
  ]);

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
                agentBranchPanel={expandedAgentBranchPanel}
                taskNodes={taskNodes}
                tasksById={tasksById}
                taskRunsByTaskId={taskRunsByTaskId}
                focusedTaskNodeId={expandedTaskNode?.nodeId ?? null}
                onSelectCanvasTask={toggleTaskBranch}
                onMoveCanvasTask={moveTaskNode}
                taskBranchPanel={expandedTaskBranchPanel}
                taskChildBranchPanel={expandedTaskChildBranchPanel}
                taskChildBranchInteractive={expandedTaskDetailMode === "leader-chat" || expandedTaskDetailMode === "edit"}
                taskChildBranchPanels={taskChildBranchPanels}
                viewport={canvasViewport}
                onViewportChange={setCanvasViewport}
                toolbarStart={agentToolbar}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
