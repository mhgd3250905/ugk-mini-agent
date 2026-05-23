import type {
  TeamPlan,
  RunDetail,
  TeamRunState,
  TeamTask,
  TeamTaskState,
  TaskDefinition,
} from "../api/team-types";

function ts(offsetMin = 0): string {
  return new Date(Date.now() + offsetMin * 60000).toISOString();
}

const planTask = (
  id: string,
  title: string,
  type: TeamTask["type"] = "normal",
  extra?: Partial<TeamTask>,
): TeamTask => ({
  id,
  type,
  title,
  input: { text: title },
  acceptance: { rules: ["output is valid"] },
  ...extra,
});

function taskState(
  status: TeamTaskState["status"] = "succeeded",
  extra?: Partial<TeamTaskState>,
): TeamTaskState {
  return {
    status,
    attemptCount: 1,
    activeAttemptId: null,
    resultRef: status === "succeeded" ? `tasks/x/attempts/y/accepted-result.md` : null,
    errorSummary: null,
    progress: { phase: status === "succeeded" ? "succeeded" : "pending", message: "", updatedAt: ts() },
    ...extra,
  };
}

export function makeSequentialPlan(): TeamPlan {
  return {
    planId: "plan_seq_001",
    title: "Sequential Research Plan",
    defaultTeamUnitId: "tu_001",
    goal: { text: "Research three vendors" },
    tasks: [
      planTask("task_1", "Research vendor A"),
      planTask("task_2", "Research vendor B"),
      planTask("task_3", "Research vendor C"),
    ],
    outputContract: { text: "Summary report" },
    archived: false,
    runCount: 1,
  };
}

export function makeSequentialRun(): RunDetail {
  const plan = makeSequentialPlan();
  return {
    runId: "run_seq_001",
    planId: plan.planId,
    teamUnitId: "tu_001",
    status: "completed",
    createdAt: ts(-60),
    startedAt: ts(-59),
    finishedAt: ts(-10),
    currentTaskId: null,
    taskStates: {
      task_1: taskState("succeeded"),
      task_2: taskState("succeeded"),
      task_3: taskState("succeeded"),
    },
    summary: { totalTasks: 3, succeededTasks: 3, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
  };
}

export function makeDiscoveryForEachPlan(): TeamPlan {
  return {
    planId: "plan_dyn_001",
    title: "Discovery + ForEach Plan",
    defaultTeamUnitId: "tu_001",
    goal: { text: "Discover and process items" },
    tasks: [
      planTask("discover", "Discover items", "discovery", {
        discovery: { outputKey: "items" },
      }),
      planTask("process_each", "Process each item", "for_each", {
        forEach: {
          itemsFrom: "discover.items",
          mode: "sequential",
          taskTemplate: {
            title: "Process {{item.title}}",
            input: { text: "Process item {{item.id}}" },
            acceptance: { rules: ["output valid"] },
          },
        },
      }),
    ],
    outputContract: { text: "Aggregated report" },
    archived: false,
    runCount: 1,
  };
}

export function makeDiscoveryForEachRun(): RunDetail {
  const plan = makeDiscoveryForEachPlan();
  const childTasks: TaskDefinition[] = [
    {
      id: "process_each__item_a",
      title: "Process Alpha",
      type: "normal",
      input: { text: "Process item_a" },
      acceptance: { rules: ["ok"] },
      parentTaskId: "process_each",
      sourceItemId: "item_a",
      generated: true,
      generatedSource: "for_each",
    },
    {
      id: "process_each__item_b",
      title: "Process Beta",
      type: "normal",
      input: { text: "Process item_b" },
      acceptance: { rules: ["ok"] },
      parentTaskId: "process_each",
      sourceItemId: "item_b",
      generated: true,
      generatedSource: "for_each",
    },
    {
      id: "process_each__item_c",
      title: "Process Gamma",
      type: "normal",
      input: { text: "Process item_c" },
      acceptance: { rules: ["ok"] },
      parentTaskId: "process_each",
      sourceItemId: "item_c",
      generated: true,
      generatedSource: "for_each",
    },
  ];

  const childStates: Record<string, TeamTaskState> = {};
  for (const ct of childTasks) {
    childStates[ct.id] = taskState("succeeded");
  }

  return {
    runId: "run_dyn_001",
    planId: plan.planId,
    teamUnitId: "tu_001",
    status: "completed",
    createdAt: ts(-60),
    startedAt: ts(-59),
    finishedAt: ts(-5),
    currentTaskId: null,
    taskStates: {
      discover: taskState("succeeded"),
      process_each: taskState("succeeded"),
      ...childStates,
    },
    summary: { totalTasks: 5, succeededTasks: 5, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    taskDefinitions: childTasks,
  };
}

export function makeDecompositionPlan(): TeamPlan {
  return {
    planId: "plan_decomp_001",
    title: "Decomposition Plan",
    defaultTeamUnitId: "tu_001",
    goal: { text: "Split large task" },
    tasks: [
      planTask("big_task", "Big task to decompose", "normal", {
        decomposer: { mode: "leaf", maxChildren: 4 },
      }),
    ],
    outputContract: { text: "Decomposed results" },
    archived: false,
    runCount: 1,
  };
}

export function makeDecompositionRun(): RunDetail {
  const childTasks: TaskDefinition[] = [
    {
      id: "big_task__sub_1",
      title: "Sub-task 1: Collect data",
      type: "normal",
      input: { text: "Collect data" },
      acceptance: { rules: ["ok"] },
      parentTaskId: "big_task",
      generated: true,
      generatedSource: "decomposition",
    },
    {
      id: "big_task__sub_2",
      title: "Sub-task 2: Analyze data",
      type: "normal",
      input: { text: "Analyze data" },
      acceptance: { rules: ["ok"] },
      parentTaskId: "big_task",
      generated: true,
      generatedSource: "decomposition",
    },
  ];

  return {
    runId: "run_decomp_001",
    planId: "plan_decomp_001",
    teamUnitId: "tu_001",
    status: "completed",
    createdAt: ts(-30),
    startedAt: ts(-29),
    finishedAt: ts(-5),
    currentTaskId: null,
    taskStates: {
      big_task: taskState("succeeded"),
      "big_task__sub_1": taskState("succeeded"),
      "big_task__sub_2": taskState("succeeded"),
    },
    summary: { totalTasks: 3, succeededTasks: 3, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    taskDefinitions: childTasks,
  };
}

export function makeFailedRun(): RunDetail {
  const plan = makeSequentialPlan();
  return {
    runId: "run_fail_001",
    planId: plan.planId,
    teamUnitId: "tu_001",
    status: "failed",
    createdAt: ts(-45),
    startedAt: ts(-44),
    finishedAt: ts(-30),
    currentTaskId: "task_2",
    taskStates: {
      task_1: taskState("succeeded"),
      task_2: taskState("failed", {
        errorSummary: "Worker timeout: exceeded 900000ms limit",
        resultRef: null,
      }),
      task_3: taskState("pending", {
        attemptCount: 0,
        progress: { phase: "pending", message: "", updatedAt: ts() },
      }),
    },
    summary: { totalTasks: 3, succeededTasks: 1, failedTasks: 1, cancelledTasks: 0, skippedTasks: 0 },
  };
}

export function makeOrphanRun(): RunDetail {
  const orphanChild: TaskDefinition = {
    id: "orphan_child_001",
    title: "Orphan child task",
    type: "normal",
    input: { text: "Mystery task" },
    acceptance: { rules: ["ok"] },
    generated: true,
    generatedSource: "for_each",
  };

  return {
    runId: "run_orphan_001",
    planId: "plan_seq_001",
    teamUnitId: "tu_001",
    status: "completed",
    createdAt: ts(-20),
    startedAt: ts(-19),
    finishedAt: ts(-5),
    currentTaskId: null,
    taskStates: {
      task_1: taskState("succeeded"),
      orphan_child_001: taskState("succeeded"),
    },
    summary: { totalTasks: 2, succeededTasks: 2, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    taskDefinitions: [orphanChild],
  };
}

export function makeLargeChildRun(): RunDetail {
  const parentTaskId = "process_each";
  const childTasks: TaskDefinition[] = [];
  const childStates: Record<string, TeamTaskState> = {};

  for (let i = 1; i <= 10; i++) {
    const id = `process_each__item_${i}`;
    childTasks.push({
      id,
      title: `Process Item ${i}`,
      type: "normal",
      input: { text: `Process item_${i}` },
      acceptance: { rules: ["ok"] },
      parentTaskId,
      sourceItemId: `item_${i}`,
      generated: true,
      generatedSource: "for_each",
    });
    childStates[id] = taskState("succeeded");
  }

  return {
    runId: "run_large_001",
    planId: "plan_dyn_001",
    teamUnitId: "tu_001",
    status: "completed",
    createdAt: ts(-120),
    startedAt: ts(-119),
    finishedAt: ts(-10),
    currentTaskId: null,
    taskStates: {
      discover: taskState("succeeded"),
      process_each: taskState("succeeded"),
      ...childStates,
    },
    summary: { totalTasks: 12, succeededTasks: 12, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    taskDefinitions: childTasks,
  };
}

export function makeSkippedRun(): RunDetail {
  const plan = makeSequentialPlan();
  return {
    runId: "run_skip_001",
    planId: plan.planId,
    teamUnitId: "tu_001",
    status: "completed",
    createdAt: ts(-15),
    startedAt: ts(-14),
    finishedAt: ts(-5),
    currentTaskId: null,
    taskStates: {
      task_1: taskState("succeeded"),
      task_2: taskState("skipped", {
        manualDisposition: "skip",
        resultRef: null,
      }),
      task_3: taskState("succeeded"),
    },
    summary: { totalTasks: 3, succeededTasks: 2, failedTasks: 0, cancelledTasks: 0, skippedTasks: 1 },
  };
}

export interface FixtureEntry {
  id: string;
  label: string;
  plan: TeamPlan;
  run: RunDetail;
}

export const ALL_FIXTURES: FixtureEntry[] = [
  { id: "sequential", label: "顺序 run", plan: makeSequentialPlan(), run: makeSequentialRun() },
  { id: "discovery", label: "Discovery + ForEach", plan: makeDiscoveryForEachPlan(), run: makeDiscoveryForEachRun() },
  { id: "decomposition", label: "Decomposition split", plan: makeDecompositionPlan(), run: makeDecompositionRun() },
  { id: "failed", label: "失败 run", plan: makeSequentialPlan(), run: makeFailedRun() },
  { id: "orphan", label: "含未归属子任务", plan: makeSequentialPlan(), run: makeOrphanRun() },
  { id: "large", label: "大量子任务 (10)", plan: makeDiscoveryForEachPlan(), run: makeLargeChildRun() },
  { id: "skipped", label: "含跳过任务", plan: makeSequentialPlan(), run: makeSkippedRun() },
];

export class MockTeamApi {
  async listPlans(): Promise<TeamPlan[]> {
    return ALL_FIXTURES.map((f) => f.plan);
  }

  async listRuns(): Promise<TeamRunState[]> {
    return ALL_FIXTURES.map((f) => f.run);
  }

  async getRunDetail(runId: string): Promise<RunDetail> {
    const entry = ALL_FIXTURES.find((f) => f.run.runId === runId);
    if (!entry) throw { message: `Run not found: ${runId}` };
    return entry.run;
  }
}
