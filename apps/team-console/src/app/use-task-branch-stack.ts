import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";

export type TaskBranchDetailMode = "leader-chat" | "edit" | "run-observer";

export type TaskBranchState = {
  nodeId: string;
  taskId: string;
  detailMode: TaskBranchDetailMode | null;
  observedRunId?: string;
  selectedFileKeys?: string[];
};

type TaskBranchUpdater =
  | TaskBranchState
  | null
  | ((current: TaskBranchState | null) => TaskBranchState | null);

type TaskBranchRoot = {
  nodeId: string;
  taskId: string;
};

type TaskBranchLookup = {
  has: (taskId: string) => boolean;
};

interface UseTaskBranchStackOptions {
  onClearTaskPanelState: (taskId?: string) => void;
  onBeforeOpenTaskBranch?: () => void;
}

interface UseTaskBranchStackReturn {
  expandedTaskBranches: TaskBranchState[];
  expandedTaskBranch: TaskBranchState | null;
  setExpandedTaskBranches: Dispatch<SetStateAction<TaskBranchState[]>>;
  setExpandedTaskBranch: (updater: TaskBranchUpdater) => void;
  closeTaskBranch: (nodeId?: string) => void;
  openOrToggleTaskBranch: (node: TaskBranchRoot) => void;
  pruneTaskBranches: (tasksById: TaskBranchLookup) => void;
}

export function useTaskBranchStack(options: UseTaskBranchStackOptions): UseTaskBranchStackReturn {
  const { onClearTaskPanelState, onBeforeOpenTaskBranch } = options;
  const [expandedTaskBranches, setExpandedTaskBranches] = useState<TaskBranchState[]>([]);
  const expandedTaskBranch = useMemo(
    () => expandedTaskBranches[expandedTaskBranches.length - 1] ?? null,
    [expandedTaskBranches],
  );

  const setExpandedTaskBranch = useCallback((updater: TaskBranchUpdater) => {
    setExpandedTaskBranches((current) => {
      const active = current[current.length - 1] ?? null;
      const next = typeof updater === "function" ? updater(active) : updater;
      if (!next) {
        return active ? current.filter((branch) => branch.nodeId !== active.nodeId) : current;
      }
      const exists = current.some((branch) => branch.nodeId === next.nodeId);
      if (exists) {
        return current.map((branch) => branch.nodeId === next.nodeId ? next : branch);
      }
      return [...current, next];
    });
  }, []);

  const closeTaskBranch = useCallback((nodeId?: string) => {
    setExpandedTaskBranches((current) => {
      if (nodeId) {
        const closing = current.find((branch) => branch.nodeId === nodeId);
        if (closing) onClearTaskPanelState(closing.taskId);
        return current.filter((branch) => branch.nodeId !== nodeId);
      }
      onClearTaskPanelState();
      return [];
    });
  }, [onClearTaskPanelState]);

  const openOrToggleTaskBranch = useCallback((node: TaskBranchRoot) => {
    onBeforeOpenTaskBranch?.();
    setExpandedTaskBranches((current) => {
      const existing = current.find((branch) => branch.nodeId === node.nodeId);
      if (existing) {
        return current.filter((branch) => branch.nodeId !== node.nodeId);
      }
      return [...current, { nodeId: node.nodeId, taskId: node.taskId, detailMode: null }];
    });
  }, [onBeforeOpenTaskBranch]);

  const pruneTaskBranches = useCallback((tasksById: TaskBranchLookup) => {
    setExpandedTaskBranches((current) => current.filter((branch) => tasksById.has(branch.taskId)));
  }, []);

  return {
    expandedTaskBranches,
    expandedTaskBranch,
    setExpandedTaskBranches,
    setExpandedTaskBranch,
    closeTaskBranch,
    openOrToggleTaskBranch,
    pruneTaskBranches,
  };
}
