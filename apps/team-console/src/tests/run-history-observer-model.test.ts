import { describe, it, expect } from "vitest";
import {
  defaultTaskRunAnnotation,
  sortRunHistoryItems,
  mergeRunHistoryItems,
  buildRunHistoryAnalysisContext,
  buildTaskRunFileDescriptors,
} from "../app/run-history-observer-model";
import type {
  TeamRunState,
  TeamAttemptMetadata,
  TeamTaskRunHistoryItem,
  TeamTaskRunAnnotation,
} from "../api/team-types";

const makeRunState = (overrides: Partial<TeamRunState> & { runId: string }): TeamRunState => ({
  planId: "plan_1",
  status: "completed",
  createdAt: "2026-06-09T10:00:00Z",
  startedAt: "2026-06-09T10:00:01Z",
  finishedAt: "2026-06-09T10:05:00Z",
  currentTaskId: null,
  teamUnitId: "unit_1",
  taskStates: {},
  summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
  ...overrides,
});

const makeAnnotation = (overrides: Partial<TeamTaskRunAnnotation> & { runId: string; taskId: string }): TeamTaskRunAnnotation => ({
  best: false,
  archived: false,
  updatedAt: "2026-06-09T10:05:00Z",
  ...overrides,
});

const makeHistoryItem = (run: TeamRunState, annotation: TeamTaskRunAnnotation): TeamTaskRunHistoryItem => ({
  run,
  annotation,
});

const makeAttempt = (overrides: Partial<TeamAttemptMetadata> & { attemptId: string; taskId: string }): TeamAttemptMetadata => ({
  status: "succeeded",
  phase: "succeeded",
  createdAt: "2026-06-09T10:00:01Z",
  updatedAt: "2026-06-09T10:05:00Z",
  finishedAt: "2026-06-09T10:05:00Z",
  worker: [],
  checker: [],
  watcher: null,
  resultRef: null,
  errorSummary: null,
  files: [],
  ...overrides,
});

describe("mergeRunHistoryItems", () => {
  it("sorts newest first, merges local runs, and filters archived annotations", () => {
    const archivedRun = makeRunState({ runId: "run_archived", createdAt: "2026-06-08T08:00:00Z" });
    const newerRun = makeRunState({ runId: "run_newer", createdAt: "2026-06-09T10:00:00Z" });
    const localOnlyRun = makeRunState({ runId: "run_local", createdAt: "2026-06-09T09:00:00Z" });

    const apiItems = [
      makeHistoryItem(archivedRun, makeAnnotation({ runId: "run_archived", taskId: "task_1", archived: true })),
      makeHistoryItem(newerRun, makeAnnotation({ runId: "run_newer", taskId: "task_1" })),
    ];
    const localRuns = [localOnlyRun];

    const excluded = mergeRunHistoryItems(apiItems, localRuns, "task_1", false);
    expect(excluded.every((i) => !i.annotation.archived)).toBe(true);
    expect(excluded.map((i) => i.run.runId)).toEqual(["run_newer", "run_local"]);

    const included = mergeRunHistoryItems(apiItems, localRuns, "task_1", true);
    expect(included.map((i) => i.run.runId)).toEqual(["run_newer", "run_local", "run_archived"]);
  });

  it("does not override API annotation with default for duplicate local run id", () => {
    const sharedRun = makeRunState({ runId: "run_shared", createdAt: "2026-06-09T10:00:00Z" });
    const apiAnnotation = makeAnnotation({ runId: "run_shared", taskId: "task_1", best: true });
    const apiItems = [makeHistoryItem(sharedRun, apiAnnotation)];

    const result = mergeRunHistoryItems(apiItems, [sharedRun], "task_1", true);
    expect(result).toHaveLength(1);
    expect(result[0].annotation.best).toBe(true);
  });

  it("normalizes malformed or partial annotations", () => {
    const run = makeRunState({ runId: "run_abc", createdAt: "2026-06-09T10:00:00Z" });
    const partialAnnotation = makeAnnotation({ runId: "run_abc", taskId: "", best: true });

    const result = mergeRunHistoryItems(
      [makeHistoryItem(run, partialAnnotation)],
      [],
      "task_1",
      true,
    );
    expect(result).toHaveLength(1);
    expect(result[0].annotation.taskId).toBe("task_1");
    expect(result[0].annotation.runId).toBe("run_abc");
  });

  it("skips invalid run entries with missing runId", () => {
    const validRun = makeRunState({ runId: "run_valid", createdAt: "2026-06-09T10:00:00Z" });
    const invalidRun = makeRunState({ runId: "", createdAt: "2026-06-09T10:00:00Z" });

    const result = mergeRunHistoryItems(
      [makeHistoryItem(validRun, makeAnnotation({ runId: "run_valid", taskId: "task_1" }))],
      [invalidRun],
      "task_1",
      true,
    );
    expect(result).toHaveLength(1);
    expect(result[0].run.runId).toBe("run_valid");
  });
});

describe("buildTaskRunFileDescriptors", () => {
  it("returns only listed worker, checker, and result files", () => {
    const attempt = makeAttempt({
      attemptId: "attempt_1",
      taskId: "task_1",
      files: ["worker-output.json", "checker-verdict.json", "accepted-result.md"],
      worker: [
        { outputRef: "agent-workspaces/attempt_1/worker/output/worker-output.json", outputIndex: 1 },
        { outputRef: "agent-workspaces/attempt_1/worker/output/unlisted-worker-output.json", outputIndex: 2 },
      ],
      checker: [
        { verdict: "pass", reason: "ok", revisionIndex: 1, recordRef: "agent-workspaces/attempt_1/checker/checker-verdict.json", feedbackRef: null },
      ],
      resultRef: "agent-workspaces/attempt_1/result/accepted-result.md",
    });

    const descriptors = buildTaskRunFileDescriptors([attempt]);

    expect(descriptors).toHaveLength(3);

    const worker = descriptors.find((d) => d.kind === "worker")!;
    expect(worker.fileName).toBe("worker-output.json");
    expect(worker.title).toBe("Worker 输出 #1");
    expect(worker.path).toBe("agent-workspaces/attempt_1/worker/output/worker-output.json");

    const checker = descriptors.find((d) => d.kind === "checker")!;
    expect(checker.fileName).toBe("checker-verdict.json");
    expect(checker.summary).toBe("pass: ok");

    const result = descriptors.find((d) => d.kind === "result")!;
    expect(result.fileName).toBe("accepted-result.md");
    expect(result.title).toBe("Accepted result");

    const hasUnlisted = descriptors.some((d) => d.fileName === "unlisted-worker-output.json");
    expect(hasUnlisted).toBe(false);
  });
});

describe("buildRunHistoryAnalysisContext", () => {
  it("includes task, run, latest attempt, capped file list, and fallback fields", () => {
    const task = { taskId: "task_1", title: "Test Task" };
    const run = makeRunState({
      runId: "run_analysis",
      status: "completed",
      createdAt: "2026-06-09T10:00:00Z",
      startedAt: "2026-06-09T10:00:01Z",
      finishedAt: "2026-06-09T10:05:00Z",
      taskStates: {
        task_1: {
          status: "succeeded",
          attemptCount: 1,
          activeAttemptId: "attempt_1",
          resultRef: "result/output.md",
          errorSummary: null,
          progress: { phase: "finished", message: "done", updatedAt: "2026-06-09T10:05:00Z" },
        },
      },
    });

    const attempts: TeamAttemptMetadata[] = [
      makeAttempt({ attemptId: "attempt_1", taskId: "task_1", status: "succeeded", phase: "succeeded" }),
    ];

    const descriptors = Array.from({ length: 15 }, (_, i) => ({
      key: `key_${i}`,
      attemptId: "attempt_1",
      kind: "worker" as const,
      title: `File ${i}`,
      fileName: `file_${i}.json`,
      path: `path/file_${i}.json`,
    }));

    const text = buildRunHistoryAnalysisContext(task, run, attempts, descriptors);

    expect(text).toContain("Test Task");
    expect(text).toContain("task_1");
    expect(text).toContain("run_analysis");
    expect(text).toContain("completed");
    expect(text).toContain("2026-06-09T10:00:00Z");
    expect(text).toContain("result/output.md");
    expect(text).toContain("attempt_1");
    expect(text).toContain("Historical Task Run Analysis Context");

    const fileLineCount = text.split("\n").filter((l) => l.startsWith("- worker:")).length;
    expect(fileLineCount).toBe(12);
  });

  it("handles no attempts and no files", () => {
    const task = { taskId: "task_empty", title: "Empty" };
    const run = makeRunState({ runId: "run_empty" });

    const text = buildRunHistoryAnalysisContext(task, run, [], []);
    expect(text).toContain("Attempts: 0");
    expect(text).toContain("Latest attempt: none");
    expect(text).toContain("- none");
  });
});

describe("defaultTaskRunAnnotation", () => {
  it("creates annotation with correct runId and taskId", () => {
    const ann = defaultTaskRunAnnotation("run_1", "task_1");
    expect(ann.runId).toBe("run_1");
    expect(ann.taskId).toBe("task_1");
    expect(ann.best).toBe(false);
    expect(ann.archived).toBe(false);
  });
});

describe("sortRunHistoryItems", () => {
  it("sorts newest createdAt first", () => {
    const items = [
      makeHistoryItem(makeRunState({ runId: "a", createdAt: "2026-06-08T00:00:00Z" }), makeAnnotation({ runId: "a", taskId: "t1" })),
      makeHistoryItem(makeRunState({ runId: "b", createdAt: "2026-06-09T00:00:00Z" }), makeAnnotation({ runId: "b", taskId: "t1" })),
    ];
    const sorted = sortRunHistoryItems(items);
    expect(sorted.map((i) => i.run.runId)).toEqual(["b", "a"]);
  });
});
