import type { ReactNode } from "react";
import type {
  TeamAttemptMetadata,
  TeamAttemptRoleProcess,
  TeamAttemptRoleProcessRole,
  TeamAttemptRoleProcessStatus,
  TeamRunState,
} from "../api/team-types";
import { renderTeamMarkdown } from "../shared/markdown";

const TASK_RUN_PROCESS_LABELS: Record<TeamAttemptRoleProcessRole, string> = {
  worker: "Worker 过程",
  checker: "Checker 过程",
};
const PROCESS_CURRENT_ACTION_MAX_CHARS = 96;
const PROCESS_NARRATION_MAX_CHARS = 220;
const PROCESS_ASSISTANT_TEXT_MAX_LINES = 5;
const PROCESS_ASSISTANT_TEXT_MAX_LINE_CHARS = 200;

export type TaskRunObserverFileState = {
  content?: string;
  error?: string;
};

export type ManualUpstreamInputMetadata = {
  connectionId: string;
  inputPortId: string;
  artifactId: string;
  type: string;
  sourceTaskId: string;
  sourceRunId: string;
  sourceAttemptId: string;
  sourceOutputPortId: string;
  fileRef: string;
};

export type TaskRunObserverState = {
  loading: boolean;
  attempts: TeamAttemptMetadata[];
  files: Record<string, TaskRunObserverFileState>;
  manualUpstreamInputMetadataByKey: Record<string, ManualUpstreamInputMetadata>;
  manualUpstreamInputMetadataAttempted: boolean;
  error: string | null;
  lastUpdatedAt: string | null;
};

export function formatDurationMs(durationMs: number): string {
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

export function elapsedText(startedAt: string | null | undefined, finishedAt: string | null | undefined): string {
  const start = Date.parse(startedAt ?? "");
  if (!Number.isFinite(start)) return "耗时 未知";
  const end = finishedAt ? Date.parse(finishedAt) : Date.now();
  const safeEnd = Number.isFinite(end) ? end : Date.now();
  return `耗时 ${formatDurationMs(safeEnd - start)}`;
}

export function taskRunPhase(run: TeamRunState, taskId: string): string {
  return run.taskStates?.[taskId]?.progress.phase || run.status;
}

export function taskRunMessage(run: TeamRunState, taskId: string): string {
  return run.taskStates?.[taskId]?.progress.message || "暂无阶段消息";
}

export function taskRunAttempts(run: TeamRunState, taskId: string): number {
  return run.taskStates?.[taskId]?.attemptCount ?? 0;
}

export function taskRunElapsed(run: TeamRunState): string {
  return elapsedText(run.startedAt ?? run.createdAt, run.finishedAt).replace(/^耗时\s*/, "");
}

export function formatRunTimestamp(value: string | null | undefined, fallback = "未记录"): string {
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

export function manualUpstreamBoundInputKey(input: ManualUpstreamInputMetadata): string {
  return [
    input.connectionId,
    input.sourceRunId,
    input.sourceAttemptId,
    input.sourceOutputPortId,
    input.inputPortId,
    input.artifactId,
  ].join("\u0000");
}

export function deriveManualUpstreamInputMetadata(run: TeamRunState): Record<string, ManualUpstreamInputMetadata> {
  const entries: Array<[string, ManualUpstreamInputMetadata]> = [];
  for (const input of run.source?.boundInputs ?? []) {
    if (input.source === "canvas-source") continue;
    const artifact = input.artifact;
    const metadata: ManualUpstreamInputMetadata = {
      connectionId: input.connectionId,
      inputPortId: input.inputPortId,
      artifactId: artifact.artifactId,
      type: artifact.type,
      sourceTaskId: artifact.sourceTaskId,
      sourceRunId: artifact.sourceRunId,
      sourceAttemptId: artifact.sourceAttemptId,
      sourceOutputPortId: artifact.sourceOutputPortId,
      fileRef: artifact.fileRef,
    };
    entries.push([manualUpstreamBoundInputKey(metadata), metadata]);
  }
  return Object.fromEntries(entries);
}

export function formatRoleProcessStatus(status?: TeamAttemptRoleProcessStatus): string {
  switch (status) {
    case "running": return "执行中";
    case "succeeded": return "成功";
    case "failed": return "失败";
    case "cancelled": return "已取消";
    case "waiting":
    default: return "等待";
  }
}

export function getLatestNarration(process: TeamAttemptRoleProcess["process"] | undefined): string {
  const narration = process?.narration ?? [];
  const latest = [...narration].reverse().find((item) => item.trim().length > 0);
  return latest ?? "暂无过程条目";
}

export function truncateProcessSummaryText(value: string | null | undefined, maxChars: number): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

export const SENTENCE_BREAK_RE = /(?<=[。？！；\n])/;

export function formatAssistantText(raw: string): { lines: string[]; hiddenLineCount: number; truncatedLineCount: number } {
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

export function renderRoleProcessNode(
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

export function fileFormatFromName(fileName: string): "json" | "markdown" | "text" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  return "text";
}

export function renderJsonContent(content: string): ReactNode {
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

export function renderMarkdownContent(content: string): ReactNode {
  const html = renderTeamMarkdown(content);
  return (
    <div
      className="team-md-content"
      data-file-format="markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function contentLooksLikeStructuredJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed !== null && (typeof parsed === "object" || Array.isArray(parsed));
  } catch {
    return false;
  }
}

export function renderFileDetailContent(fileName: string, content: string): ReactNode {
  if (contentLooksLikeStructuredJson(content)) return renderJsonContent(content);
  const format = fileFormatFromName(fileName);
  if (format === "json") return renderJsonContent(content);
  if (format === "markdown") return renderMarkdownContent(content);
  return <pre className="task-run-detail-pre" data-file-format="text">{content}</pre>;
}

export type TaskRunObserverPanelKind = "task" | "run-history" | "generated-run-history";

export function taskRunObserverPanelId(nodeId: string, kind: TaskRunObserverPanelKind): string {
  return kind === "task" ? `run-observer-${nodeId}` : `run-observer-${kind}-${nodeId}`;
}

export function taskRunObserverFileDetailPanelIdPrefix(nodeId: string, kind: TaskRunObserverPanelKind): string {
  return kind === "task" ? `file-detail-${nodeId}` : `file-detail-${kind}-${nodeId}`;
}
