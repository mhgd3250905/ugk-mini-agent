import { describe, it, expect } from "vitest";
import type { TeamCanvasTask } from "../api/team-types";
import {
  hasTaskDetail,
  mergeGeneratedTaskSummaryIntoFullTask,
  mergeGeneratedTaskCatalogIncremental,
  mergeGeneratedTaskCatalogForRefresh,
} from "../app/team-console-generated-detail-policy";

function makeTask(overrides: Partial<TeamCanvasTask> & { taskId: string }): TeamCanvasTask {
  return {
    taskId: overrides.taskId,
    canvasKind: overrides.canvasKind ?? "task",
    title: overrides.title ?? "Test task",
    leaderAgentId: overrides.leaderAgentId ?? "main",
    workUnit: overrides.workUnit ?? {
      title: "Default work unit",
      input: { text: "Default input" },
      outputContract: { text: "Default output" },
      acceptance: { rules: [] },
      workerAgentId: "main",
      checkerAgentId: "main",
    },
    status: overrides.status ?? "ready",
    createdAt: overrides.createdAt ?? "2026-05-31T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-31T00:00:00.000Z",
    archived: overrides.archived ?? false,
    generatedSource: overrides.generatedSource,
  };
}

const fullDetailTask = makeTask({
  taskId: "gen_1",
  title: "Generated full detail",
  updatedAt: "2026-05-31T00:01:00.000Z",
  workUnit: {
    title: "Generated full detail",
    input: { text: "Do work" },
    outputContract: { text: "Output" },
    acceptance: { rules: ["ok"] },
    workerAgentId: "search",
    checkerAgentId: "reviewer",
  },
  generatedSource: {
    schemaVersion: "team/generated-task-source-1",
    sourceDiscoveryTaskId: "disc_1",
    sourceItemId: "item_1",
    itemStatus: "active",
    itemPayload: { id: "item_1" },
    latestDiscoveryRunId: "run_1",
    latestDiscoveryAttemptId: "attempt_1",
    latestDiscoveredAt: "2026-05-31T00:01:00.000Z",
    workUnitMode: "managed",
  },
});

const summaryOnlyTask = {
  taskId: "gen_1",
  canvasKind: "task" as const,
  title: "Generated full detail",
  leaderAgentId: "main",
  status: "ready" as const,
  createdAt: "2026-05-31T00:00:00.000Z",
  updatedAt: "2026-05-31T00:01:00.000Z",
  archived: false,
  generatedSource: {
    schemaVersion: "team/generated-task-source-1",
    sourceDiscoveryTaskId: "disc_1",
    sourceItemId: "item_1",
    itemStatus: "active" as const,
    itemPayload: { id: "item_1" },
    latestDiscoveryRunId: "run_1",
    latestDiscoveryAttemptId: "attempt_1",
    latestDiscoveredAt: "2026-05-31T00:01:00.000Z",
    workUnitMode: "managed" as const,
  },
} as unknown as TeamCanvasTask;

describe("hasTaskDetail", () => {
  it("returns true when workUnit is present", () => {
    expect(hasTaskDetail(fullDetailTask)).toBe(true);
  });

  it("returns false when workUnit is absent", () => {
    expect(hasTaskDetail(summaryOnlyTask)).toBe(false);
  });
});

describe("mergeGeneratedTaskSummaryIntoFullTask", () => {
  it("preserves workUnit while updating summary fields", () => {
    const refreshedSummary = {
      ...summaryOnlyTask,
      title: "Updated title",
      updatedAt: "2026-05-31T00:02:00.000Z",
    };
    const merged = mergeGeneratedTaskSummaryIntoFullTask(fullDetailTask, refreshedSummary);
    expect(merged.title).toBe("Updated title");
    expect(merged.updatedAt).toBe("2026-05-31T00:02:00.000Z");
    expect(merged.workUnit).toBe(fullDetailTask.workUnit);
    expect(merged.generatedSource?.sourceDiscoveryTaskId).toBe("disc_1");
  });

  it("merges generatedSource metadata", () => {
    const refreshedSummary = {
      ...summaryOnlyTask,
      generatedSource: {
        ...summaryOnlyTask.generatedSource!,
        latestDiscoveryRunId: "run_2",
        latestDiscoveryAttemptId: "attempt_2",
      },
    };
    const merged = mergeGeneratedTaskSummaryIntoFullTask(fullDetailTask, refreshedSummary);
    expect(merged.generatedSource?.latestDiscoveryRunId).toBe("run_2");
    expect(merged.workUnit).toBe(fullDetailTask.workUnit);
  });
});

describe("mergeGeneratedTaskCatalogIncremental", () => {
  it("keeps full detail when an incremental summary arrives", () => {
    const current = [fullDetailTask];
    const incoming = [summaryOnlyTask];
    const result = mergeGeneratedTaskCatalogIncremental(current, incoming);
    expect(result[0]!.workUnit).toBe(fullDetailTask.workUnit);
    expect(result[0]!.title).toBe(fullDetailTask.title);
  });

  it("preserves object reference for identical tasks", () => {
    const current = [fullDetailTask];
    const identical = [{ ...fullDetailTask }];
    const result = mergeGeneratedTaskCatalogIncremental(current, identical);
    expect(result[0]).toBe(fullDetailTask);
  });

  it("removes deleted tasks", () => {
    const current = [fullDetailTask];
    const incoming: TeamCanvasTask[] = [];
    const result = mergeGeneratedTaskCatalogIncremental(current, incoming, ["gen_1"]);
    expect(result).toHaveLength(0);
  });
});

describe("mergeGeneratedTaskCatalogForRefresh", () => {
  it("summary-only incoming preserves existing workUnit and updates summary fields", () => {
    const refreshed = {
      ...summaryOnlyTask,
      title: "Refreshed title",
      updatedAt: "2026-05-31T00:03:00.000Z",
    };
    const result = mergeGeneratedTaskCatalogForRefresh([fullDetailTask], [refreshed]);
    expect(result).toHaveLength(1);
    expect(result[0]!.workUnit).toBe(fullDetailTask.workUnit);
    expect(result[0]!.title).toBe("Refreshed title");
    expect(result[0]!.updatedAt).toBe("2026-05-31T00:03:00.000Z");
  });

  it("identical generated summary preserves object reference", () => {
    const result = mergeGeneratedTaskCatalogForRefresh([fullDetailTask], [summaryOnlyTask]);
    expect(result[0]).toBe(fullDetailTask);
  });

  it("filters incoming tasks with locallyArchivedTaskIds", () => {
    const result = mergeGeneratedTaskCatalogForRefresh(
      [],
      [summaryOnlyTask],
      { locallyArchivedTaskIds: new Set(["gen_1"]) },
    );
    expect(result).toHaveLength(0);
  });

  it("keeps existing when recentlyReplacedTaskIds and existing updatedAt >= incoming", () => {
    const refreshed = { ...summaryOnlyTask, updatedAt: "2026-05-31T00:00:30.000Z" };
    const result = mergeGeneratedTaskCatalogForRefresh(
      [fullDetailTask],
      [refreshed],
      { recentlyReplacedTaskIds: new Set(["gen_1"]) },
    );
    expect(result[0]).toBe(fullDetailTask);
  });

  it("uses incoming when recentlyReplaced but incoming is newer", () => {
    const refreshed = { ...summaryOnlyTask, updatedAt: "2026-05-31T00:05:00.000Z", title: "Newer incoming" };
    const result = mergeGeneratedTaskCatalogForRefresh(
      [fullDetailTask],
      [refreshed],
      { recentlyReplacedTaskIds: new Set(["gen_1"]) },
    );
    expect(result[0]!.title).toBe("Newer incoming");
    expect(result[0]!.workUnit).toBe(fullDetailTask.workUnit);
  });

  it("removes tasks with deletedTaskIds", () => {
    const otherTask = makeTask({ taskId: "gen_2" });
    const refreshed = { ...summaryOnlyTask, title: "Updated" };
    const result = mergeGeneratedTaskCatalogForRefresh(
      [fullDetailTask, otherTask],
      [refreshed, otherTask],
      { deletedTaskIds: ["gen_1"] },
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.taskId).toBe("gen_2");
  });

  it("preserves incoming order", () => {
    const taskA = makeTask({ taskId: "gen_a", updatedAt: "2026-05-31T00:01:00.000Z" });
    const taskB = makeTask({ taskId: "gen_b", updatedAt: "2026-05-31T00:02:00.000Z" });
    const result = mergeGeneratedTaskCatalogForRefresh([], [taskA, taskB]);
    expect(result.map((t) => t.taskId)).toEqual(["gen_a", "gen_b"]);
  });

  it("returns current reference when result is identical", () => {
    const current = [fullDetailTask];
    const result = mergeGeneratedTaskCatalogForRefresh(current, [summaryOnlyTask]);
    expect(result).toBe(current);
  });
});
