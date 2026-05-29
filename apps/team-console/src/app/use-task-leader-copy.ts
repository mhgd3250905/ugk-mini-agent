import { useCallback, useEffect, useRef, useState } from "react";

export type TaskLeaderCopyEntry = {
  state: "copied" | "failed";
  manualCopyText?: string;
};

function clearTaskRecordEntry<T>(current: Partial<Record<string, T>>, taskId: string): Partial<Record<string, T>> {
  if (!(taskId in current)) return current;
  const next = { ...current };
  delete next[taskId];
  return next;
}

export function useTaskLeaderCopy() {
  const [taskLeaderCopyByTaskId, setTaskLeaderCopyByTaskId] = useState<Partial<Record<string, TaskLeaderCopyEntry>>>({});
  const taskLeaderManualCopyRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    for (const [taskId, entry] of Object.entries(taskLeaderCopyByTaskId)) {
      if (!entry) continue;
      if (entry.state !== "failed" || !entry.manualCopyText) continue;
      const textarea = taskLeaderManualCopyRefs.current[taskId];
      textarea?.focus();
      textarea?.select();
      break;
    }
  }, [taskLeaderCopyByTaskId]);

  const clearTaskLeaderCopy = useCallback((taskId: string) => {
    setTaskLeaderCopyByTaskId((current) => clearTaskRecordEntry(current, taskId));
  }, []);

  const registerTaskLeaderManualCopyRef = useCallback((taskId: string, node: HTMLTextAreaElement | null) => {
    taskLeaderManualCopyRefs.current[taskId] = node;
  }, []);

  const copyTaskLeaderContext = useCallback(async (taskId: string, text: string) => {
    clearTaskLeaderCopy(taskId);
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (clipboard?.writeText) {
        try {
          await clipboard.writeText(text);
          setTaskLeaderCopyByTaskId((current) => ({
            ...current,
            [taskId]: { state: "copied" },
          }));
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
        setTaskLeaderCopyByTaskId((current) => ({
          ...current,
          [taskId]: { state: "copied" },
        }));
      } finally {
        ta.remove();
        prev?.focus();
      }
    } catch {
      setTaskLeaderCopyByTaskId((current) => ({
        ...current,
        [taskId]: { state: "failed", manualCopyText: text },
      }));
    }
  }, [clearTaskLeaderCopy]);

  return {
    taskLeaderCopyByTaskId,
    copyTaskLeaderContext,
    clearTaskLeaderCopy,
    registerTaskLeaderManualCopyRef,
  };
}
