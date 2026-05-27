import type { TaskStatus, RunStatus } from "../api/team-types";

export const ACTIVE_RUN_STATUSES: RunStatus[] = ["queued", "running", "paused"];

export function isActiveRun(status: RunStatus): boolean {
  return ACTIVE_RUN_STATUSES.includes(status);
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "待执行",
  running: "执行中",
  succeeded: "成功",
  failed: "失败",
  cancelled: "已取消",
  skipped: "已跳过",
  interrupted: "已中断",
};

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: "排队中",
  running: "执行中",
  paused: "已暂停",
  completed: "已完成",
  completed_with_failures: "已完成(部分失败)",
  failed: "失败",
  cancelled: "已取消",
};

export function statusColor(status: TaskStatus | RunStatus): string {
  switch (status) {
    case "running":
    case "queued":
      return "var(--accent)";
    case "succeeded":
    case "completed":
      return "var(--success)";
    case "failed":
      return "var(--danger)";
    case "paused":
    case "interrupted":
      return "var(--warning)";
    case "cancelled":
    case "skipped":
      return "var(--secondary)";
    case "completed_with_failures":
      return "var(--warning)";
    default:
      return "var(--secondary)";
  }
}
