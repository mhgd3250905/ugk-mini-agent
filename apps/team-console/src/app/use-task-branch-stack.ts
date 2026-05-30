import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";

export type TaskBranchDetailMode = "leader-chat" | "edit" | "run-observer";

export type TaskBranchState = {
  nodeId: string;
  taskId: string;
  detailMode: TaskBranchDetailMode | null;
  observedRunId?: string;
  selectedFileKeys?: string[];
};

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
  focusedTaskBranch: TaskBranchState | null;
  setExpandedTaskBranches: Dispatch<SetStateAction<TaskBranchState[]>>;
  closeTaskBranch: (nodeId?: string) => void;
  openOrToggleTaskBranch: (node: TaskBranchRoot) => void;
  pruneTaskBranches: (tasksById: TaskBranchLookup) => void;
}

export function useTaskBranchStack(options: UseTaskBranchStackOptions): UseTaskBranchStackReturn {
  const { onClearTaskPanelState, onBeforeOpenTaskBranch } = options;
  const [expandedTaskBranches, setExpandedTaskBranches] = useState<TaskBranchState[]>([]);
  const focusedTaskBranch = useMemo(
    () => expandedTaskBranches[expandedTaskBranches.length - 1] ?? null,
    [expandedTaskBranches],
  );

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
    focusedTaskBranch,
    setExpandedTaskBranches,
    closeTaskBranch,
    openOrToggleTaskBranch,
    pruneTaskBranches,
  };
}
