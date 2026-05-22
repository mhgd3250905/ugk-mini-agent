import type { RunDetail, TeamPlan, TeamTaskState } from "../api/team-types";
import { TASK_STATUS_LABELS } from "../shared/status";

interface ExecutionTaskDetailProps {
  run: RunDetail;
  plan: TeamPlan;
  selectedTaskId: string | null;
  onClose: () => void;
}

export function ExecutionTaskDetail({ run, plan, selectedTaskId, onClose }: ExecutionTaskDetailProps) {
  if (!selectedTaskId || selectedTaskId === "__root__") {
    return (
      <div className="task-detail-panel">
        <div className="task-detail-empty">
          {selectedTaskId === "__root__"
            ? <p>Run: {run.runId}</p>
            : <p>点击任务节点查看详情</p>
          }
          {selectedTaskId && (
            <button className="task-detail-close" onClick={onClose}>关闭</button>
          )}
        </div>
      </div>
    );
  }

  const taskDef = run.taskDefinitions?.find((t) => t.id === selectedTaskId);
  const planTask = plan.tasks.find((t) => t.id === selectedTaskId);
  const task = taskDef ?? planTask;
  const state: TeamTaskState | undefined = run.taskStates[selectedTaskId];

  if (!task || !state) {
    return (
      <div className="task-detail-panel">
        <div className="task-detail-empty">
          <p>任务信息不可用</p>
          <button className="task-detail-close" onClick={onClose}>关闭</button>
        </div>
      </div>
    );
  }

  const copyId = () => {
    navigator.clipboard.writeText(selectedTaskId).catch(() => {});
  };

  return (
    <div className="task-detail-panel">
      <div className="task-detail-header">
        <span>任务详情</span>
        <button className="task-detail-close" onClick={onClose}>&times;</button>
      </div>

      <div className="task-detail-body">
        <div className="detail-row">
          <span className="detail-label">ID</span>
          <span className="detail-value detail-id" onClick={copyId} title="点击复制">
            {selectedTaskId}
          </span>
        </div>

        <div className="detail-row">
          <span className="detail-label">标题</span>
          <span className="detail-value">{task.title}</span>
        </div>

        <div className="detail-row">
          <span className="detail-label">状态</span>
          <span className="detail-value">
            <span className={`status-badge ${state.status}`}>{TASK_STATUS_LABELS[state.status]}</span>
          </span>
        </div>

        {task.type && (
          <div className="detail-row">
            <span className="detail-label">类型</span>
            <span className="detail-value">{task.type}</span>
          </div>
        )}

        {taskDef?.generatedSource && (
          <div className="detail-row">
            <span className="detail-label">来源</span>
            <span className="detail-value">{taskDef.generatedSource}</span>
          </div>
        )}

        {task.parentTaskId && (
          <div className="detail-row">
            <span className="detail-label">父任务</span>
            <span className="detail-value">{task.parentTaskId}</span>
          </div>
        )}

        {task.sourceItemId && (
          <div className="detail-row">
            <span className="detail-label">源项</span>
            <span className="detail-value">{task.sourceItemId}</span>
          </div>
        )}

        <div className="detail-row">
          <span className="detail-label">尝试次数</span>
          <span className="detail-value">{state.attemptCount}</span>
        </div>

        {state.activeAttemptId && (
          <div className="detail-row">
            <span className="detail-label">活跃 Attempt</span>
            <span className="detail-value">{state.activeAttemptId}</span>
          </div>
        )}

        {state.resultRef && (
          <div className="detail-row">
            <span className="detail-label">结果</span>
            <span className="detail-value detail-ref">{state.resultRef}</span>
          </div>
        )}

        {state.errorSummary && (
          <div className="detail-row detail-error">
            <span className="detail-label">错误</span>
            <span className="detail-value">{state.errorSummary}</span>
          </div>
        )}

        {state.progress.phase && (
          <div className="detail-row">
            <span className="detail-label">进度</span>
            <span className="detail-value">{state.progress.phase}</span>
          </div>
        )}

        {state.progress.message && (
          <div className="detail-row">
            <span className="detail-label">消息</span>
            <span className="detail-value">{state.progress.message}</span>
          </div>
        )}

        {state.manualDisposition && state.manualDisposition !== "default" && (
          <div className="detail-row">
            <span className="detail-label">处置</span>
            <span className="detail-value">{state.manualDisposition}</span>
          </div>
        )}

        <div className="detail-section-title">文件</div>
        <div className="detail-files-placeholder">
          <span className="detail-muted">文件查看将在后续集成阶段实现</span>
        </div>
      </div>
    </div>
  );
}
