import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { ExecutionMap, type AtlasTaskNode } from "../graph/ExecutionMap";
import { NODE_WIDTH } from "../graph/execution-map-layout";
import { App } from "../app/App";
import {
  ALL_FIXTURES,
  MockTeamApi,
  mockDiscoveryRootTask,
  mockTeamTasks,
  makeSequentialPlan,
  makeSequentialRun,
  makeFailedRun,
  makeLargeChildRun,
  makeDiscoveryForEachPlan,
  makeDiscoveryForEachRun,
  makeSkippedRun,
  makeRealSnapshotPlan,
  makeRealSnapshotRun,
  makeRealSuccessForEachPlan,
  makeRealSuccessForEachRun,
} from "../fixtures/team-fixtures";
import type { TaskStatus, TeamAttemptMetadata } from "../api/team-types";

function makeLargeChildRunWithStatuses(statuses: TaskStatus[]) {
  const run = structuredClone(makeLargeChildRun());
  const childIds = run.taskDefinitions?.map((task) => task.id) ?? [];
  childIds.forEach((taskId, index) => {
    const status = statuses[index] ?? statuses[statuses.length - 1] ?? "succeeded";
    run.taskStates[taskId] = {
      ...run.taskStates[taskId],
      status,
      errorSummary: status === "failed" ? "Child failed\nStack trace" : null,
      resultRef: status === "succeeded" ? run.taskStates[taskId].resultRef : null,
      progress: { ...run.taskStates[taskId].progress, phase: status },
    };
  });
  return run;
}

function collapsedNode(): HTMLElement {
  const node = screen.getByText("+ 10 个子任务").closest(".emap-node");
  expect(node).toBeTruthy();
  return node as HTMLElement;
}

async function realSuccessOfficialAttempts(): Promise<TeamAttemptMetadata[]> {
  return new MockTeamApi().listAttempts(
    "run_real_success_foreach_001",
    "explore_direction__official-search-apis",
  );
}

async function renderSelectedOfficialArtifactMap(
  readAttemptFile?: (runId: string, taskId: string, attemptId: string, fileName: string) => Promise<string>,
) {
  const plan = makeRealSuccessForEachPlan();
  const run = makeRealSuccessForEachRun();
  const childId = "explore_direction__official-search-apis";
  const attempts = await realSuccessOfficialAttempts();
  const result = render(
    <ExecutionMap
      plan={plan}
      run={run}
      selectedTaskId={null}
      onSelectTask={() => {}}
      attemptsByTaskId={{ [childId]: attempts }}
      readAttemptFile={readAttemptFile}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /展开 13 个子任务/ }));
  result.rerender(
    <ExecutionMap
      plan={plan}
      run={run}
      selectedTaskId={childId}
      onSelectTask={() => {}}
      attemptsByTaskId={{ [childId]: attempts }}
      readAttemptFile={readAttemptFile}
    />,
  );

  return { ...result, run, childId, attempts };
}

async function renderSelectedRealSuccessTask(
  taskId: string,
  readAttemptFile?: (runId: string, taskId: string, attemptId: string, fileName: string) => Promise<string>,
) {
  const plan = makeRealSuccessForEachPlan();
  const run = makeRealSuccessForEachRun();
  const api = new MockTeamApi();
  const attempts = await api.listAttempts(run.runId, taskId);
  const fileReader = readAttemptFile ?? vi.fn(api.readAttemptFile.bind(api));
  const result = render(
    <ExecutionMap
      plan={plan}
      run={run}
      selectedTaskId={taskId}
      onSelectTask={() => {}}
      attemptsByTaskId={{ [taskId]: attempts }}
      readAttemptFile={fileReader}
    />,
  );

  return { ...result, run, taskId, attempts, readAttemptFile: fileReader };
}

describe("ExecutionMap UI", () => {
  it("renders task nodes for sequential run", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    expect(screen.getByText("Research vendor A")).toBeInTheDocument();
    expect(screen.getByText("Research vendor B")).toBeInTheDocument();
    expect(screen.getByText("Research vendor C")).toBeInTheDocument();
  });

  it("renders execution atlas node layers without changing task content", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    const node = screen.getByText("Research vendor A").closest(".emap-node") as HTMLElement;

    expect(node.querySelector(".emap-node-header")).toBeTruthy();
    expect(node.querySelector(".emap-node-body")).toBeTruthy();
    expect(within(node).getByText("任务")).toBeInTheDocument();
    expect(within(node).getByText("成功")).toBeInTheDocument();
    expect(within(node).getByText("已有结果")).toBeInTheDocument();
  });

  it("renders collapsed summary for large child groups", () => {
    const plan = makeDiscoveryForEachPlan();
    const run = makeLargeChildRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    expect(screen.getByText("+ 10 个子任务")).toBeInTheDocument();
  });

  it("marks collapsed summary succeeded when all hidden children succeeded", () => {
    const plan = makeDiscoveryForEachPlan();
    const run = makeLargeChildRunWithStatuses(Array(10).fill("succeeded"));
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    expect(collapsedNode()).toHaveClass("status-succeeded");
  });

  it("marks collapsed summary failed when any hidden child failed", () => {
    const plan = makeDiscoveryForEachPlan();
    const run = makeLargeChildRunWithStatuses(["succeeded", "failed", ...Array(8).fill("succeeded")]);
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    expect(collapsedNode()).toHaveClass("status-failed");
  });

  it("marks collapsed summary pending when hidden children are pending but none running", () => {
    const plan = makeDiscoveryForEachPlan();
    const run = makeLargeChildRunWithStatuses(["succeeded", "pending", ...Array(8).fill("succeeded")]);
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    expect(collapsedNode()).toHaveClass("status-pending");
    expect(collapsedNode()).not.toHaveClass("status-running");
  });

  it("marks collapsed summary running when hidden children include running", () => {
    const plan = makeDiscoveryForEachPlan();
    const run = makeLargeChildRunWithStatuses(["succeeded", "running", ...Array(8).fill("succeeded")]);
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    expect(collapsedNode()).toHaveClass("status-running");
  });

  it("does not mark skipped-only collapsed summaries as succeeded", () => {
    const plan = makeDiscoveryForEachPlan();
    const run = makeLargeChildRunWithStatuses(Array(10).fill("skipped"));
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    expect(collapsedNode()).toHaveClass("status-dimmed");
    expect(collapsedNode()).not.toHaveClass("status-succeeded");
  });

  it("does not mark cancelled-only collapsed summaries as succeeded", () => {
    const plan = makeDiscoveryForEachPlan();
    const run = makeLargeChildRunWithStatuses(Array(10).fill("cancelled"));
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    expect(collapsedNode()).toHaveClass("status-dimmed");
    expect(collapsedNode()).not.toHaveClass("status-succeeded");
  });

  it("shows error first line on failed nodes", () => {
    const plan = makeSequentialPlan();
    const run = makeFailedRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    expect(screen.getByText(/Worker timeout/)).toBeInTheDocument();
  });

  it("keeps failed task node readable with kind title and error text", () => {
    const plan = makeSequentialPlan();
    const run = makeFailedRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    const failedNode = screen.getByText("Research vendor B").closest(".emap-node") as HTMLElement;
    expect(within(failedNode).getByText("任务")).toBeInTheDocument();
    expect(within(failedNode).getByText("Research vendor B")).toBeInTheDocument();
    expect(within(failedNode).getByText(/Worker timeout/)).toBeInTheDocument();
  });

  it("calls onSelectTask when clicking a node", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    let clickedId: string | null = null;
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={(id) => { clickedId = id; }} />);
    fireEvent.click(screen.getByText("Research vendor B"));
    expect(clickedId).toBe("task_2");
  });

  it("renders root and task nodes as semantic buttons", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    expect(screen.getByRole("button", { name: /执行运行/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Research vendor B/ })).toBeInTheDocument();
  });

  it("renders canvas Task cards with leader worker and checker agents", () => {
    const task = mockTeamTasks[0]!;
    const taskNode: AtlasTaskNode = {
      nodeId: `task-node-${task.taskId}`,
      kind: "canvas-task",
      taskId: task.taskId,
      position: { x: 280, y: 180 },
    };

    render(
      <ExecutionMap
        selectedTaskId={null}
        onSelectTask={() => {}}
        taskNodes={[taskNode]}
        tasksById={new Map([[task.taskId, task]])}
        agentsById={new Map([
          ["main", { agentId: "main", name: "主 Agent", description: "默认" }],
          ["search", { agentId: "search", name: "搜索 Agent", description: "搜索" }],
        ])}
      />,
    );

    const node = screen.getByRole("button", { name: /调查 Medtrum 云资产/ });
    expect(node).toBeInTheDocument();
    expect(within(node).getByText("Task")).toBeInTheDocument();
    const agentRows = Array.from(node.querySelectorAll(".emap-task-agent-row")).map((row) => ({
      label: row.querySelector("b")?.textContent,
      name: row.querySelector("em")?.textContent,
      role: row.getAttribute("data-role"),
    }));
    expect(agentRows).toEqual([
      { label: "Leader", name: "主 Agent", role: "leader" },
      { label: "Worker", name: "搜索 Agent", role: "worker" },
      { label: "Checker", name: "主 Agent", role: "checker" },
    ]);
    expect(node.querySelector(".emap-task-agent-row.role-leader")).toBeTruthy();
    expect(node.querySelector(".emap-task-agent-row.role-worker")).toBeTruthy();
    expect(node.querySelector(".emap-task-agent-row.role-checker")).toBeTruthy();
  });

  it("renders Discovery root card identity and supplied summary counts", () => {
    const taskNode: AtlasTaskNode = {
      nodeId: `task-node-${mockDiscoveryRootTask.taskId}`,
      kind: "canvas-task",
      taskId: mockDiscoveryRootTask.taskId,
      position: { x: 280, y: 180 },
    };

    render(
      <ExecutionMap
        selectedTaskId={null}
        onSelectTask={() => {}}
        taskNodes={[taskNode]}
        tasksById={new Map([[mockDiscoveryRootTask.taskId, mockDiscoveryRootTask]])}
        agentsById={new Map([
          ["main", { agentId: "main", name: "主 Agent", description: "默认" }],
          ["search", { agentId: "search", name: "搜索 Agent", description: "搜索" }],
          ["reviewer", { agentId: "reviewer", name: "Review Agent", description: "验收" }],
        ])}
        discoverySummariesByTaskId={{
          [mockDiscoveryRootTask.taskId]: {
            generatedTaskCount: 2,
            activeGeneratedTaskCount: 1,
            staleGeneratedTaskCount: 1,
            runningGeneratedRunCount: 1,
            failedDispatchCount: 2,
          },
        }}
      />,
    );

    const node = screen.getByRole("button", { name: /发现云服务候选/ });
    expect(node).toHaveClass("emap-discovery-task-node");
    expect(node).toHaveAttribute("data-canvas-kind", "discovery");
    expect(within(node).getByText("Discovery")).toBeInTheDocument();
    expect(within(node).getByText("2 items")).toBeInTheDocument();
    expect(within(node).getByText("1 active")).toBeInTheDocument();
    expect(within(node).getByText("1 stale")).toBeInTheDocument();
    expect(within(node).getByText("1 running")).toBeInTheDocument();
    expect(within(node).getByText("2 blocked")).toBeInTheDocument();
    expect(node).toHaveAttribute("data-discovery-failed-dispatch-count", "2");
  });

  it("keeps normal Task cards labelled as Task without Discovery summary", () => {
    const task = mockTeamTasks[0]!;
    const taskNode: AtlasTaskNode = {
      nodeId: `task-node-${task.taskId}`,
      kind: "canvas-task",
      taskId: task.taskId,
      position: { x: 280, y: 180 },
    };

    render(
      <ExecutionMap
        selectedTaskId={null}
        onSelectTask={() => {}}
        taskNodes={[taskNode]}
        tasksById={new Map([[task.taskId, task]])}
        agentsById={new Map([
          ["main", { agentId: "main", name: "主 Agent", description: "默认" }],
          ["search", { agentId: "search", name: "搜索 Agent", description: "搜索" }],
        ])}
        discoverySummariesByTaskId={{
          [task.taskId]: {
            generatedTaskCount: 9,
            activeGeneratedTaskCount: 8,
            staleGeneratedTaskCount: 1,
            runningGeneratedRunCount: 7,
            failedDispatchCount: 2,
          },
        }}
      />,
    );

    const node = screen.getByRole("button", { name: /调查 Medtrum 云资产/ });
    expect(node).not.toHaveClass("emap-discovery-task-node");
    expect(node).not.toHaveAttribute("data-canvas-kind", "discovery");
    expect(within(node).getByText("Task")).toBeInTheDocument();
    expect(within(node).queryByText("Discovery")).toBeNull();
    expect(within(node).queryByText("9 items")).toBeNull();
    expect(within(node).queryByText("7 running")).toBeNull();
    expect(within(node).queryByText("2 blocked")).toBeNull();
    expect(node).not.toHaveAttribute("data-discovery-failed-dispatch-count");
  });

  it("allocates extra card height for Discovery root summary inside the node", () => {
    const normalTask = {
      ...mockTeamTasks[0]!,
      taskId: "task_normal_without_ports",
      title: "普通无端口 Task",
      workUnit: {
        ...mockTeamTasks[0]!.workUnit,
        title: "普通无端口 Task",
        inputPorts: undefined,
        outputPorts: undefined,
      },
    };
    const taskNodes: AtlasTaskNode[] = [
      {
        nodeId: `task-node-${normalTask.taskId}`,
        kind: "canvas-task",
        taskId: normalTask.taskId,
        position: { x: 280, y: 180 },
      },
      {
        nodeId: `task-node-${mockDiscoveryRootTask.taskId}`,
        kind: "canvas-task",
        taskId: mockDiscoveryRootTask.taskId,
        position: { x: 600, y: 180 },
      },
    ];

    render(
      <ExecutionMap
        selectedTaskId={null}
        onSelectTask={() => {}}
        taskNodes={taskNodes}
        tasksById={new Map([
          [normalTask.taskId, normalTask],
          [mockDiscoveryRootTask.taskId, mockDiscoveryRootTask],
        ])}
        agentsById={new Map([
          ["main", { agentId: "main", name: "主 Agent", description: "默认" }],
          ["search", { agentId: "search", name: "搜索 Agent", description: "搜索" }],
          ["reviewer", { agentId: "reviewer", name: "Review Agent", description: "验收" }],
        ])}
        discoverySummariesByTaskId={{}}
      />,
    );

    const normalNode = screen.getByRole("button", { name: /普通无端口 Task/ });
    const discoveryNode = screen.getByRole("button", { name: /发现云服务候选/ });
    const normalHeight = Number.parseFloat(normalNode.style.height);
    const discoveryHeight = Number.parseFloat(discoveryNode.style.height);

    expect(discoveryHeight).toBeGreaterThan(normalHeight);
    expect(discoveryHeight - normalHeight).toBeGreaterThanOrEqual(28);
    expect(discoveryNode.querySelector(".emap-discovery-summary-row")).toBeTruthy();
  });

  it("calls onSelectCanvasTask when clicking a canvas Task card", () => {
    const task = mockTeamTasks[0]!;
    const taskNode: AtlasTaskNode = {
      nodeId: `task-node-${task.taskId}`,
      kind: "canvas-task",
      taskId: task.taskId,
      position: { x: 280, y: 180 },
    };
    const selectedNodes: AtlasTaskNode[] = [];

    render(
      <ExecutionMap
        selectedTaskId={null}
        onSelectTask={() => {}}
        taskNodes={[taskNode]}
        tasksById={new Map([[task.taskId, task]])}
        agentsById={new Map([
          ["main", { agentId: "main", name: "主 Agent", description: "默认" }],
          ["search", { agentId: "search", name: "搜索 Agent", description: "搜索" }],
        ])}
        onSelectCanvasTask={(node) => { selectedNodes.push(node); }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /调查 Medtrum 云资产/ }));

    expect(selectedNodes[0]?.taskId).toBe("task_research_medtrum");
  });

  it("does not render inline detail inside selected task node", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_1" onSelectTask={() => {}} />);
    expect(container.querySelector(".emap-inline-detail")).toBeNull();
    expect(container.querySelector("[data-testid='emap-inline-detail']")).toBeNull();
  });

  it("selected node stays at base height without expansion", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_1" onSelectTask={() => {}} />);
    const selectedNode = container.querySelector(".emap-node.selected");
    expect(selectedNode).toBeTruthy();
    const height = Number.parseFloat(String((selectedNode as HTMLElement).style.height));
    expect(height).toBeLessThanOrEqual(72);
  });

  it("applies selected class to selected node", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_2" onSelectTask={() => {}} />);
    const selectedNodes = container.querySelectorAll(".emap-node.selected");
    expect(selectedNodes.length).toBeGreaterThan(0);
  });

  it("selected node has status bar visible", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_2" onSelectTask={() => {}} />);
    const selectedNode = container.querySelector(".emap-node.selected");
    expect(selectedNode).toBeTruthy();
    const bar = selectedNode!.querySelector(".emap-node-status-bar");
    expect(bar).toBeTruthy();
  });

  it("chain-selected nodes appear for selected task path", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_2" onSelectTask={() => {}} />);
    const chainNodes = container.querySelectorAll(".emap-node.chain-selected");
    expect(chainNodes.length).toBeGreaterThan(0);
  });

  it("collapsed node renders with collapsed class", () => {
    const plan = makeDiscoveryForEachPlan();
    const run = makeLargeChildRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    const collapsedNodes = container.querySelectorAll(".emap-collapsed");
    expect(collapsedNodes.length).toBe(1);
    const statusBars = collapsedNodes[0].querySelectorAll(".emap-node-status-bar");
    expect(statusBars.length).toBe(1);
  });

  it("collapsed summary renders as an expandable button", () => {
    const plan = makeDiscoveryForEachPlan();
    const run = makeLargeChildRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    expect(screen.getByRole("button", { name: /展开 10 个子任务/ })).toBeInTheDocument();
    expect(collapsedNode().tagName).toBe("BUTTON");
  });

  it("task node remains clickable with status classes applied", () => {
    const plan = makeSequentialPlan();
    const run = makeFailedRun();
    let clickedId: string | null = null;
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={(id) => { clickedId = id; }} />);
    fireEvent.click(screen.getByText("Research vendor B"));
    expect(clickedId).toBe("task_2");
  });

  it("renders SVG links matching model output", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    const paths = container.querySelectorAll(".emap-link");
    expect(paths.length).toBeGreaterThan(0);
  });

  it("distinguishes spine and branch links for map hierarchy", () => {
    const plan = makeDiscoveryForEachPlan();
    const run = makeDiscoveryForEachRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="process_each__item_a" onSelectTask={() => {}} />);

    expect(container.querySelectorAll(".emap-link-main").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".emap-link-branch").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".emap-link-highlighted").length).toBeGreaterThan(0);
  });

  it("applies status-failed class to failed task node", () => {
    const plan = makeSequentialPlan();
    const run = makeFailedRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    const failedNode = screen.getByText("Research vendor B").closest(".emap-node");
    expect(failedNode).toHaveClass("status-failed");
  });

  it("applies status-dimmed class to skipped task node", () => {
    const plan = makeSequentialPlan();
    const run = makeSkippedRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    const skippedNode = screen.getByText("Research vendor B").closest(".emap-node");
    expect(skippedNode).toHaveClass("status-dimmed");
  });

  it("selected failed node keeps both selected and status-failed classes", () => {
    const plan = makeSequentialPlan();
    const run = makeFailedRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_2" onSelectTask={() => {}} />);
    const selectedNode = container.querySelector(".emap-node.selected");
    expect(selectedNode).toBeTruthy();
    expect(selectedNode).toHaveClass("status-failed");
  });

  it("applies status-pending class to pending task node", () => {
    const plan = makeSequentialPlan();
    const run = makeFailedRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    const pendingNode = screen.getByText("Research vendor C").closest(".emap-node");
    expect(pendingNode).toHaveClass("status-pending");
    expect(pendingNode).not.toHaveClass("status-running");
  });

  it("mobile CSS prevents evidence elements from widening viewport", () => {
    const css = readFileSync("src/graph/execution-map.css", "utf8");
    const mobileBlock = css.match(/@media \(max-width: 720px\) \{[\s\S]*\n\}/)?.[0] ?? "";
    expect(mobileBlock).toContain("overflow-x: hidden");
    expect(mobileBlock).toContain("max-width: 100%");
    expect(mobileBlock).toContain(".emap-evidence-node");
  });

  it("execution node buttons keep atlas focus-visible styling", () => {
    const css = readFileSync("src/graph/execution-map.css", "utf8");

    expect(css).toContain(".emap-node:focus-visible");
    expect(css).toContain("outline:");
  });
});

describe("App integration", () => {
  it("does not render the obsolete fixture switcher", () => {
    render(<App />);
    expect(screen.queryByText("示例：")).toBeNull();
    expect(screen.queryByRole("button", { name: "失败 run" })).toBeNull();
  });
});

describe("Evidence branch cards", () => {
  it("renders worker checker watcher and result artifact cards from attempt metadata", async () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    const childId = "explore_direction__official-search-apis";
    const api = new MockTeamApi();
    const attempts = await realSuccessOfficialAttempts();
    const { container, rerender } = render(
      <ExecutionMap
        plan={plan}
        run={run}
        selectedTaskId={null}
        onSelectTask={() => {}}
        attemptsByTaskId={{ [childId]: attempts }}
        readAttemptFile={api.readAttemptFile.bind(api)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /展开 13 个子任务/ }));

    rerender(
      <ExecutionMap
        plan={plan}
        run={run}
        selectedTaskId={childId}
        onSelectTask={() => {}}
        attemptsByTaskId={{ [childId]: attempts }}
        readAttemptFile={api.readAttemptFile.bind(api)}
      />,
    );

    expect(screen.getByText("Worker 输出 1")).toBeInTheDocument();
    expect(screen.getByText("Worker 输出 2")).toBeInTheDocument();
    expect(screen.getByText("Checker 验收 1")).toBeInTheDocument();
    expect(screen.getByText("Checker 验收 2")).toBeInTheDocument();
    expect(screen.getByText("Watcher 复盘")).toBeInTheDocument();
    expect(screen.getByText("最终结果")).toBeInTheDocument();
    expect(container.querySelectorAll(".emap-artifact-node")).toHaveLength(6);
  });

  it("does not render fake worker cards when attempt metadata has no output ref", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const attempt: TeamAttemptMetadata = {
      attemptId: "attempt_empty",
      taskId: "task_1",
      status: "succeeded",
      phase: "succeeded",
      createdAt: "",
      updatedAt: "",
      finishedAt: "",
      worker: [{ outputIndex: 1, outputRef: null }],
      checker: [],
      watcher: null,
      resultRef: null,
      errorSummary: null,
      files: [],
    };

    render(
      <ExecutionMap
        plan={plan}
        run={run}
        selectedTaskId="task_1"
        onSelectTask={() => {}}
        attemptsByTaskId={{ task_1: [attempt] }}
      />,
    );

    expect(screen.queryByText("Worker 输出 1")).toBeNull();
    expect(screen.queryByText("accepted-result.md")).toBeNull();
  });

  it("renders no artifact branch for parent with visible children even if attempts exist", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const parentAttempt: TeamAttemptMetadata = {
      attemptId: "attempt_parent",
      taskId: "search_platform",
      status: "succeeded",
      phase: "succeeded",
      createdAt: "",
      updatedAt: "",
      finishedAt: "",
      worker: [{ outputIndex: 1, outputRef: "tasks/search_platform/attempts/attempt_parent/worker-output-001.md" }],
      checker: [],
      watcher: null,
      resultRef: "tasks/search_platform/attempts/attempt_parent/accepted-result.md",
      errorSummary: null,
      files: ["worker-output-001.md", "accepted-result.md"],
    };
    const { container } = render(
      <ExecutionMap
        plan={plan}
        run={run}
        selectedTaskId="search_platform"
        onSelectTask={() => {}}
        attemptsByTaskId={{ search_platform: [parentAttempt] }}
      />,
    );

    expect(container.querySelectorAll(".emap-artifact-node")).toHaveLength(0);
    expect(screen.queryByText("Worker 输出 1")).toBeNull();
  });

  it("renders failed result and error summary without accepted result label", () => {
    const plan = makeSequentialPlan();
    const run = makeFailedRun();
    const failedAttempt: TeamAttemptMetadata = {
      attemptId: "attempt_failed",
      taskId: "task_2",
      status: "failed",
      phase: "failed",
      createdAt: "",
      updatedAt: "",
      finishedAt: "",
      worker: [{ outputIndex: 1, outputRef: "tasks/task_2/attempts/attempt_failed/worker-output-001.md" }],
      checker: [{
        verdict: "fail",
        reason: "worker timeout",
        revisionIndex: 1,
        recordRef: "tasks/task_2/attempts/attempt_failed/checker-verdict-001.json",
        feedbackRef: null,
      }],
      watcher: {
        decision: "confirm_failed",
        reason: "确认失败",
        recordRef: "tasks/task_2/attempts/attempt_failed/watcher-review.json",
      },
      resultRef: "tasks/task_2/attempts/attempt_failed/failed-result.md",
      errorSummary: "worker timeout",
      files: ["worker-output-001.md", "checker-verdict-001.json", "watcher-review.json", "failed-result.md"],
    };

    render(
      <ExecutionMap
        plan={plan}
        run={run}
        selectedTaskId="task_2"
        onSelectTask={() => {}}
        attemptsByTaskId={{ task_2: [failedAttempt] }}
      />,
    );

    expect(screen.getByText("失败结果")).toBeInTheDocument();
    expect(screen.getByText("错误摘要")).toBeInTheDocument();
    expect(screen.queryByText("最终结果")).toBeNull();
  });

  it("renders result evidence card for task with resultRef", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_1" onSelectTask={() => {}} />);

    const resultCards = container.querySelectorAll(".execution-map-nodes > .emap-evidence-result");
    expect(resultCards.length).toBe(1);
    expect(resultCards[0].textContent).toContain("accepted-result.md");
    expect(resultCards[0].querySelector(".emap-evidence-path")?.textContent).toContain("tasks/x/attempts/y/accepted-result.md");
  });

  it("does not render result evidence card for failed task without resultRef", () => {
    const plan = makeSequentialPlan();
    const run = makeFailedRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_2" onSelectTask={() => {}} />);

    const resultCards = container.querySelectorAll(".emap-evidence-result");
    expect(resultCards.length).toBe(0);
  });

  it("renders error evidence card for failed task with errorSummary", () => {
    const plan = makeSequentialPlan();
    const run = makeFailedRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_2" onSelectTask={() => {}} />);

    const errorCard = container.querySelector(".emap-evidence-error");
    expect(errorCard).toBeTruthy();
    expect(errorCard?.textContent).toContain("Worker timeout");
  });

  it("uses Chinese labels for fallback error and progress evidence", () => {
    const plan = makeSequentialPlan();
    const run = makeFailedRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_2" onSelectTask={() => {}} />);

    expect(screen.getByText("错误")).toBeInTheDocument();
    expect(screen.getByText("进度")).toBeInTheDocument();
  });

  it("renders attempt evidence card for task with activeAttemptId", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform__zhihu" onSelectTask={() => {}} />);

    const attemptCard = container.querySelector(".emap-evidence-attempt");
    expect(attemptCard).toBeTruthy();
    expect(attemptCard?.textContent).toContain("尝试");
    expect(attemptCard?.textContent).toContain("attempt_d62e0d2ff9d5");
  });

  it("renders result + error + attempt evidence for 知乎", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform__zhihu" onSelectTask={() => {}} />);

    expect(container.querySelector(".emap-evidence-result")).toBeTruthy();
    expect(container.querySelector(".emap-evidence-error")).toBeTruthy();
    expect(container.querySelector(".emap-evidence-attempt")).toBeTruthy();
    expect(container.querySelector(".emap-evidence-result")?.textContent).toContain("failed-result.md");
    expect(container.querySelector(".emap-evidence-error")?.textContent).toContain("验收标准");
  });

  it("renders error + attempt but no result for 微博", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform__weibo" onSelectTask={() => {}} />);

    expect(container.querySelector(".emap-evidence-result")).toBeNull();
    expect(container.querySelector(".emap-evidence-error")).toBeTruthy();
    expect(container.querySelector(".emap-evidence-attempt")).toBeTruthy();
  });

  it("does not render child result evidence when selecting for_each parent", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform" onSelectTask={() => {}} />);

    const resultCards = container.querySelectorAll(".emap-evidence-result");
    expect(resultCards.length).toBe(0);

    expect(screen.getAllByText("搜索 知乎").length).toBe(1);
    expect(screen.getAllByText("搜索 微博").length).toBe(1);
  });

  it("renders no evidence cards for for_each parent with visible children", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform" onSelectTask={() => {}} />);

    const evidenceNodes = container.querySelectorAll(".emap-evidence-node");
    expect(evidenceNodes.length).toBe(0);
    expect(container.querySelector(".emap-evidence-error")).toBeNull();
    expect(container.querySelector(".emap-evidence-progress")).toBeNull();

    expect(screen.getAllByText("搜索 知乎").length).toBe(1);
    expect(screen.getAllByText("搜索 微博").length).toBe(1);
  });

  it("renders 最终汇报 tag for assemble_report task", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="assemble_report" onSelectTask={() => {}} />);

    const resultCard = container.querySelector(".emap-evidence-result");
    expect(resultCard).toBeTruthy();
    expect(screen.getByText("最终汇报")).toBeInTheDocument();
    expect(screen.getByText("accepted-result.md")).toBeInTheDocument();
  });

  it("renders 失败 tag for task with failed-result.md", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform__zhihu" onSelectTask={() => {}} />);

    const resultCard = container.querySelector(".emap-evidence-result");
    expect(resultCard).toBeTruthy();
    expect(within(resultCard as HTMLElement).getByText("失败")).toBeInTheDocument();
  });

  it("renders dashed SVG connectors from task to evidence cards", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_1" onSelectTask={() => {}} />);
    const evidenceLinks = container.querySelectorAll(".emap-link-evidence");
    expect(evidenceLinks.length).toBeGreaterThan(0);
  });

  it("renders evidence connectors as shared fanout segments instead of overlapping L paths", async () => {
    const { container } = await renderSelectedOfficialArtifactMap();

    const evidenceNodes = container.querySelectorAll(".emap-evidence-node");
    const evidenceLinks = Array.from(container.querySelectorAll<SVGPathElement>(".emap-link-evidence"));

    expect(evidenceNodes.length).toBeGreaterThan(1);
    expect(evidenceLinks.length).toBe(evidenceNodes.length + 2);
    for (const link of evidenceLinks) {
      expect((link.getAttribute("d")?.match(/L/g) ?? []).length).toBe(1);
    }
  });

  it("CSS keeps evidence and preview connectors at the same accent intensity", () => {
    const css = readFileSync("src/graph/execution-map.css", "utf8");

    const evidenceRule = css.match(/\.emap-link-evidence\s*\{[^}]*\}/)?.[0];
    const previewRule = css.match(/\.emap-link-artifact-preview\s*\{[^}]*\}/)?.[0];

    expect(evidenceRule).toContain("stroke: rgba(121, 216, 208, 0.62)");
    expect(evidenceRule).toContain("stroke-width: 2.2");
    expect(evidenceRule).toContain("opacity: 0.9");
    expect(evidenceRule).toContain("drop-shadow");
    expect(previewRule).toContain("stroke: rgba(121, 216, 208, 0.62)");
    expect(previewRule).toContain("stroke-width: 2.2");
    expect(previewRule).toContain("opacity: 0.9");
    expect(previewRule).toContain("drop-shadow");
  });

  it("evidence nodes are siblings of task nodes, not descendants", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_1" onSelectTask={() => {}} />);

    const nodesContainer = container.querySelector(".execution-map-nodes");
    const selectedNode = container.querySelector(".emap-node.selected");
    const evidenceNodes = container.querySelectorAll(".emap-evidence-node");

    expect(evidenceNodes.length).toBeGreaterThan(0);
    expect(selectedNode?.querySelector(".emap-evidence-node")).toBeNull();
    for (const ev of evidenceNodes) {
      expect(ev.parentElement).toBe(nodesContainer);
    }
  });

  it("does not render ghost evidence cards for children without resultRef", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform" onSelectTask={() => {}} />);

    const ghostCards = container.querySelectorAll(".emap-evidence-ghost");
    expect(ghostCards.length).toBe(0);
  });

  it("does not render evidence links when parent with visible children is selected", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform" onSelectTask={() => {}} />);

    const evidenceLinks = container.querySelectorAll(".emap-link-evidence");
    expect(evidenceLinks.length).toBe(0);
  });
});

describe("Evidence auto-height", () => {
  it("evidence nodes use minHeight instead of fixed height", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_1" onSelectTask={() => {}} />);

    const evidenceNodes = container.querySelectorAll(".emap-evidence-node");
    expect(evidenceNodes.length).toBeGreaterThan(0);
    for (const node of evidenceNodes) {
      const style = (node as HTMLElement).style;
      expect(style.minHeight).toBeTruthy();
      expect(style.height).toBe("");
    }
  });

  it("CSS does not clip evidence content with overflow hidden or line-clamp", () => {
    const css = readFileSync("src/graph/execution-map.css", "utf8");

    const evidenceNodeRule = css.match(/\.emap-evidence-node\s*\{[^}]*\}/)?.[0];
    expect(evidenceNodeRule).toBeTruthy();
    expect(evidenceNodeRule!).not.toContain("overflow: hidden");

    const contentRule = css.match(/\.emap-evidence-content\s*\{[^}]*\}/)?.[0];
    expect(contentRule).toBeTruthy();
    expect(contentRule!).not.toContain("-webkit-line-clamp");
    expect(contentRule!).not.toContain("overflow: hidden");

    const titleRule = css.match(/\.emap-evidence-title\s*\{[^}]*\}/)?.[0];
    expect(titleRule).toBeTruthy();
    expect(titleRule!).not.toContain("text-overflow: ellipsis");
  });

  it("long error summary is not truncated in evidence DOM", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform__zhihu" onSelectTask={() => {}} />);

    const errorCard = container.querySelector(".emap-evidence-error");
    expect(errorCard).toBeTruthy();
    const errorContent = errorCard!.querySelector(".emap-evidence-content")!;
    const text = errorContent.textContent!;
    expect(text.endsWith("…")).toBe(false);
    expect(text).toContain("验收标准1明确要求");
    expect(text).toContain("无法通过修改达到要求");

    const resultCard = container.querySelector(".emap-evidence-result");
    expect(resultCard).toBeTruthy();
    const pathEl = resultCard!.querySelector(".emap-evidence-path");
    expect(pathEl).toBeTruthy();
    expect(pathEl!.textContent).toContain("search_platform__zhihu");
    expect(pathEl!.textContent).toContain("failed-result.md");
  });

  it("evidence nodes immediately follow selected node in DOM for mobile ordering", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform__zhihu" onSelectTask={() => {}} />);

    const nodesContainer = container.querySelector(".execution-map-nodes")!;
    const children = Array.from(nodesContainer.children);

    const selectedIdx = children.findIndex(
      (c) => c.classList.contains("emap-node") && c.classList.contains("selected"),
    );
    expect(selectedIdx).toBeGreaterThanOrEqual(0);

    const nextSibling = children[selectedIdx + 1];
    expect(nextSibling).toBeTruthy();
    expect(nextSibling.classList.contains("emap-evidence-node")).toBe(true);
  });

  it("evidence nodes have data-evidence-id for measurement lookup", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_1" onSelectTask={() => {}} />);

    const evidenceNodes = container.querySelectorAll(".emap-evidence-node");
    for (const node of evidenceNodes) {
      const id = (node as HTMLElement).dataset.evidenceId;
      expect(id).toBeTruthy();
      expect(id).toMatch(/^evidence__/);
    }
  });

  it("measurement loop uses offsetHeight instead of scaled getBoundingClientRect height", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const layoutHeight = 88;
    const scaledVisualHeight = 176;

    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("emap-evidence-node")) {
        return { height: scaledVisualHeight, width: 240, x: 600, y: 128, top: 128, left: 600, bottom: 128 + scaledVisualHeight, right: 840 } as DOMRect;
      }
      return { height: 56, width: 280, x: 0, y: 0, top: 0, left: 0, bottom: 56, right: 280 } as DOMRect;
    });
    const offsetDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return this.classList.contains("emap-evidence-node") ? layoutHeight : 56;
      },
    });

    const { container } = render(
      <ExecutionMap plan={plan} run={run} selectedTaskId="task_1" onSelectTask={() => {}} />,
    );

    const evidenceNodes = container.querySelectorAll(".emap-evidence-node");
    for (const node of evidenceNodes) {
      const minHeight = Number.parseInt((node as HTMLElement).style.minHeight);
      expect(minHeight).toBe(layoutHeight);
    }

    spy.mockRestore();
    if (offsetDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetDescriptor);
    } else {
      delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
    }
  });
});

describe("Artifact preview nodes", () => {
  it("previews the snapshot 2 Phase 1 result from attempt metadata", async () => {
    const { run, attempts, readAttemptFile } = await renderSelectedRealSuccessTask("discover_directions");

    expect(attempts).toHaveLength(1);
    fireEvent.click(screen.getByText("最终结果"));

    expect(readAttemptFile).toHaveBeenCalledWith(
      run.runId,
      "discover_directions",
      "attempt_c5dc0861fc00",
      "accepted-result.md",
    );
    expect(await screen.findByTestId("artifact-preview")).toHaveTextContent("发现所有搜索方案方向");
    expect(screen.queryByText(/文件不在当前 attempt metadata 中|文件引用不属于当前任务/)).toBeNull();
  });

  it("previews the snapshot 2 Phase 3 result from attempt metadata", async () => {
    const { run, attempts, readAttemptFile } = await renderSelectedRealSuccessTask("assemble_report");

    expect(attempts).toHaveLength(1);
    fireEvent.click(screen.getByText("最终结果"));

    expect(readAttemptFile).toHaveBeenCalledWith(
      run.runId,
      "assemble_report",
      "attempt_fb7a225ccd0d",
      "accepted-result.md",
    );
    expect(await screen.findByTestId("artifact-preview")).toHaveTextContent("最终对比报告");
    expect(screen.queryByText(/文件不在当前 attempt metadata 中|文件引用不属于当前任务/)).toBeNull();
  });

  it("renders fallback Attempt Progress Error evidence as non-clickable static evidence", () => {
    const plan = makeSequentialPlan();
    const run = makeFailedRun();
    run.taskStates.task_2 = {
      ...run.taskStates.task_2,
      activeAttemptId: "attempt_fallback",
      progress: { phase: "failed", message: "timed out", updatedAt: "" },
    };
    const readAttemptFile = vi.fn(async () => "should not load");
    const { container } = render(
      <ExecutionMap
        plan={plan}
        run={run}
        selectedTaskId="task_2"
        onSelectTask={() => {}}
        readAttemptFile={readAttemptFile}
      />,
    );

    for (const selector of [".emap-evidence-attempt", ".emap-evidence-progress", ".emap-evidence-error"]) {
      const evidenceNode = container.querySelector(selector) as HTMLElement | null;
      expect(evidenceNode).toBeTruthy();
      expect(evidenceNode?.tagName).toBe("DIV");
      fireEvent.click(evidenceNode!);
    }

    expect(readAttemptFile).not.toHaveBeenCalled();
    expect(screen.queryByTestId("artifact-preview")).toBeNull();
    expect(screen.queryByText(/文件不在当前 attempt metadata 中|文件引用不属于当前任务/)).toBeNull();
  });

  it("clicking Worker output fetches the file and renders a second-level preview node", async () => {
    const api = new MockTeamApi();
    const readAttemptFile = vi.fn(api.readAttemptFile.bind(api));
    const { container, run, childId } = await renderSelectedOfficialArtifactMap(readAttemptFile);

    fireEvent.click(screen.getByText("Worker 输出 1"));

    expect(readAttemptFile).toHaveBeenCalledWith(
      run.runId,
      childId,
      "attempt_68ce15110a99",
      "worker-output-001.md",
    );
    expect(await screen.findByTestId("artifact-preview")).toHaveTextContent("搜索引擎官方免费 API");
    expect(container.querySelector(".emap-artifact-preview")).toBeTruthy();
  });

  it("preview measurement uses offsetHeight instead of scaled getBoundingClientRect height", async () => {
    const layoutHeight = 144;
    const scaledVisualHeight = 288;
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("emap-artifact-preview")) {
        return { height: scaledVisualHeight, width: 360, x: 880, y: 128, top: 128, left: 880, bottom: 128 + scaledVisualHeight, right: 1240 } as DOMRect;
      }
      if (this.classList.contains("emap-evidence-node")) {
        return { height: 56, width: 240, x: 600, y: 128, top: 128, left: 600, bottom: 184, right: 840 } as DOMRect;
      }
      return { height: 56, width: 280, x: 0, y: 0, top: 0, left: 0, bottom: 56, right: 280 } as DOMRect;
    });
    const offsetDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return this.classList.contains("emap-artifact-preview") ? layoutHeight : 56;
      },
    });
    const api = new MockTeamApi();
    await renderSelectedOfficialArtifactMap(api.readAttemptFile.bind(api));

    fireEvent.click(screen.getByText("Worker 输出 1"));

    const preview = await screen.findByTestId("artifact-preview");
    await waitFor(() => {
      expect(Number.parseInt(preview.style.minHeight)).toBe(layoutHeight);
    });

    rectSpy.mockRestore();
    if (offsetDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetDescriptor);
    } else {
      delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
    }
  });

  it("clicking the same artifact again closes the preview node", async () => {
    const api = new MockTeamApi();
    await renderSelectedOfficialArtifactMap(api.readAttemptFile.bind(api));

    fireEvent.click(screen.getByText("Worker 输出 1"));
    expect(await screen.findByTestId("artifact-preview")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Worker 输出 1"));

    await waitFor(() => {
      expect(screen.queryByTestId("artifact-preview")).toBeNull();
    });
  });

  it("clicking a different artifact switches the preview node", async () => {
    const api = new MockTeamApi();
    await renderSelectedOfficialArtifactMap(api.readAttemptFile.bind(api));

    fireEvent.click(screen.getByText("Worker 输出 1"));
    expect(await screen.findByTestId("artifact-preview")).toHaveTextContent("搜索引擎官方免费 API");

    fireEvent.click(screen.getByText("Checker 验收 1"));

    await waitFor(() => {
      expect(screen.getByTestId("artifact-preview")).toHaveTextContent('"verdict": "revise"');
    });
    expect(screen.getByTestId("artifact-preview")).not.toHaveTextContent("搜索引擎官方免费 API");
  });

  it("markdown/text preview escapes script-like content as text", async () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const attempt: TeamAttemptMetadata = {
      attemptId: "attempt_md",
      taskId: "task_1",
      status: "succeeded",
      phase: "succeeded",
      createdAt: "",
      updatedAt: "",
      finishedAt: "",
      worker: [{ outputIndex: 1, outputRef: "tasks/task_1/attempts/attempt_md/worker-output-001.md" }],
      checker: [],
      watcher: null,
      resultRef: null,
      errorSummary: null,
      files: ["worker-output-001.md"],
    };
    const readAttemptFile = vi.fn(async () => "<script>alert('x')</script>\nplain text");
    const { container } = render(
      <ExecutionMap
        plan={plan}
        run={run}
        selectedTaskId="task_1"
        onSelectTask={() => {}}
        attemptsByTaskId={{ task_1: [attempt] }}
        readAttemptFile={readAttemptFile}
      />,
    );

    fireEvent.click(screen.getByText("Worker 输出 1"));

    const preview = await screen.findByTestId("artifact-preview");
    expect(preview).toHaveTextContent("<script>alert('x')</script>");
    expect(container.querySelector(".emap-artifact-preview script")).toBeNull();
  });

  it("JSON preview pretty prints parsed content", async () => {
    const api = new MockTeamApi();
    await renderSelectedOfficialArtifactMap(api.readAttemptFile.bind(api));

    fireEvent.click(screen.getByText("Checker 验收 1"));

    expect(await screen.findByTestId("artifact-preview")).toHaveTextContent('"verdict": "revise"');
    const previewText = screen.getByTestId("artifact-preview").querySelector(".emap-artifact-preview-text")?.textContent;
    expect(previewText).toContain('\n  "reason":');
  });

  it("HTML preview uses a sandboxed iframe and does not inject into main DOM", async () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const attempt: TeamAttemptMetadata = {
      attemptId: "attempt_html",
      taskId: "task_1",
      status: "succeeded",
      phase: "succeeded",
      createdAt: "",
      updatedAt: "",
      finishedAt: "",
      worker: [{ outputIndex: 1, outputRef: "tasks/task_1/attempts/attempt_html/report.html" }],
      checker: [],
      watcher: null,
      resultRef: null,
      errorSummary: null,
      files: ["report.html"],
    };
    const html = "<h1>Injected heading</h1><script>window.bad = true</script>";
    const readAttemptFile = vi.fn(async () => html);
    const { container } = render(
      <ExecutionMap
        plan={plan}
        run={run}
        selectedTaskId="task_1"
        onSelectTask={() => {}}
        attemptsByTaskId={{ task_1: [attempt] }}
        readAttemptFile={readAttemptFile}
      />,
    );

    fireEvent.click(screen.getByText("Worker 输出 1"));

    await screen.findByTestId("artifact-preview");
    const iframe = container.querySelector("iframe.emap-artifact-iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute("sandbox")).toBe("");
    expect(iframe?.getAttribute("srcdoc")).toContain("Injected heading");
    expect(container.querySelector(".emap-artifact-preview h1")).toBeNull();
  });

  it("renders loading and fetch error as preview nodes", async () => {
    let reject!: (error: Error) => void;
    const pending = new Promise<string>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const readAttemptFile = vi.fn(() => pending);
    await renderSelectedOfficialArtifactMap(readAttemptFile);

    fireEvent.click(screen.getByText("Worker 输出 1"));

    expect(screen.getByTestId("artifact-preview")).toHaveTextContent("正在加载预览");

    reject(new Error("boom"));

    await waitFor(() => {
      expect(screen.getByTestId("artifact-preview")).toHaveTextContent("加载失败: boom");
    });
  });

  it("positions and links Task child branch from the measured menu shell edge", async () => {
    const offsetWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    const offsetHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    try {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
        configurable: true,
        get() {
          if (this.classList.contains("emap-task-branch-shell")) return 360;
          if (this.classList.contains("emap-task-child-branch-shell")) return 820;
          return 0;
        },
      });
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          if (this.classList.contains("emap-task-branch-shell")) return 144;
          if (this.classList.contains("emap-task-child-branch-shell")) return 620;
          return 0;
        },
      });

      const task = mockTeamTasks[0]!;
      const taskNode: AtlasTaskNode = {
        nodeId: `task-node-${task.taskId}`,
        kind: "canvas-task",
        taskId: task.taskId,
        position: { x: 280, y: 220 },
      };

      const { container } = render(
        <ExecutionMap
          selectedTaskId={null}
          onSelectTask={() => {}}
          taskNodes={[taskNode]}
          tasksById={new Map([[task.taskId, task]])}
          focusedTaskNodeId={taskNode.nodeId}
          taskBranchPanels={[
            { id: "task-branch", nodeId: taskNode.nodeId, panel: <section className="task-action-branch">操作菜单</section> },
          ]}
          taskChildBranchPanels={[
            { id: "task-child", sourceId: "task-branch", panel: <section className="task-edit-branch">编辑节点</section> },
          ]}
        />,
      );

      const menuShell = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
      const childShell = container.querySelector(".emap-task-child-branch-shell") as HTMLElement | null;
      expect(menuShell).toBeTruthy();
      expect(childShell).toBeTruthy();

      const menuLeft = taskNode.position.x + NODE_WIDTH + 48;
      const menuTop = taskNode.position.y - 16;
      const measuredMenuRight = menuLeft + 360;
      const childLeft = measuredMenuRight + 32;
      const connectorY = menuTop + 144 / 2;

      await waitFor(() => {
        expect(Number.parseFloat(childShell!.style.left)).toBe(childLeft);
        expect(Number.parseFloat(childShell!.style.top)).toBe(menuTop);
      });

      const childLink = container.querySelector(".emap-link-task-child-branch") as SVGPathElement | null;
      expect(childLink).toBeTruthy();
      const childTopY = menuTop;
      const pathD = childLink!.getAttribute("d") ?? "";
      // Path starts from menu right-middle
      expect(pathD).toContain(`M${measuredMenuRight},${connectorY}`);
      // Path ends at child top-left
      expect(pathD).toContain(`${childLeft},${childTopY}`);
      // Path should not start from the menu's left edge
      expect(pathD).not.toContain(`M${menuLeft + 280},`);
    } finally {
      if (offsetWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "offsetWidth", offsetWidthDescriptor);
      } else {
        delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
      }
      if (offsetHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeightDescriptor);
      } else {
        delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
      }
    }
  });

  it("pauses Task child panel auto-height measurement while a panel is dragged", async () => {
    const offsetWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    const offsetHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    let panelHeightReads = 0;
    const firePanelPointer = (
      target: Element,
      type: "pointerdown" | "pointermove" | "pointerup",
      init: { pointerId: number; clientX: number; clientY: number; buttons?: number; button?: number },
    ) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        pointerId: { value: init.pointerId },
        clientX: { value: init.clientX },
        clientY: { value: init.clientY },
        buttons: { value: init.buttons ?? 1 },
        button: { value: init.button ?? 0 },
      });
      fireEvent(target, event);
    };

    try {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
        configurable: true,
        get() {
          if (this.classList.contains("emap-task-branch-shell")) return 280;
          if (this.classList.contains("emap-task-child-branch-shell")) return 300;
          return 0;
        },
      });
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get() {
          if (this.classList.contains("emap-task-branch-shell")) return 144;
          if (this.getAttribute("data-panel-id") === "process-worker") {
            panelHeightReads += 1;
            return this.textContent?.includes("expanded process update") ? 420 : 180;
          }
          return 0;
        },
      });

      const task = mockTeamTasks[0]!;
      const taskNode: AtlasTaskNode = {
        nodeId: `task-node-${task.taskId}`,
        kind: "canvas-task",
        taskId: task.taskId,
        position: { x: 280, y: 220 },
      };
      const renderMap = (content: string) => (
        <ExecutionMap
          selectedTaskId={null}
          onSelectTask={() => {}}
          taskNodes={[taskNode]}
          tasksById={new Map([[task.taskId, task]])}
          focusedTaskNodeId={taskNode.nodeId}
          taskBranchPanels={[
            { id: "task-branch", nodeId: taskNode.nodeId, panel: <section className="task-action-branch">操作菜单</section> },
          ]}
          taskChildBranchPanels={[
            {
              id: "process-worker",
              sourceId: "task-branch",
              width: 300,
              autoHeight: true,
              panel: <section className="emap-observer-node">{content}</section>,
            },
          ]}
        />
      );

      const { container, rerender } = render(renderMap("initial process update"));
      const panelShell = container.querySelector('[data-panel-id="process-worker"]') as HTMLElement | null;
      expect(panelShell).toBeTruthy();

      await waitFor(() => {
        expect(panelHeightReads).toBeGreaterThan(0);
      });

      firePanelPointer(panelShell!, "pointerdown", { pointerId: 64, clientX: 640, clientY: 300 });
      firePanelPointer(panelShell!, "pointermove", { pointerId: 64, clientX: 700, clientY: 340 });
      panelHeightReads = 0;

      rerender(renderMap("expanded process update"));

      expect(panelHeightReads).toBe(0);

      firePanelPointer(panelShell!, "pointerup", { pointerId: 64, clientX: 700, clientY: 340, buttons: 0 });
    } finally {
      if (offsetWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "offsetWidth", offsetWidthDescriptor);
      } else {
        delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
      }
      if (offsetHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeightDescriptor);
      } else {
        delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
      }
    }
  });
});

describe("Canvas pan and zoom", () => {
  function firePointer(
    target: Element,
    type: "pointerdown" | "pointermove" | "pointerup",
    init: { pointerId: number; clientX: number; clientY: number; buttons?: number; button?: number },
  ) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      pointerId: { value: init.pointerId },
      clientX: { value: init.clientX },
      clientY: { value: init.clientY },
      buttons: { value: init.buttons ?? 1 },
      button: { value: init.button ?? 0 },
    });
    fireEvent(target, event);
  }

  function renderCanvasMap() {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const result = render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    const container = result.container.querySelector(".execution-map-container") as HTMLElement;
    const stage = result.container.querySelector(".execution-map-scroll") as HTMLElement;
    expect(container).toBeTruthy();
    expect(stage).toBeTruthy();
    return { ...result, container, stage };
  }

  it("mouse wheel changes zoom percentage and stage transform", () => {
    const { container, stage } = renderCanvasMap();

    fireEvent.wheel(container, { deltaY: -120, clientX: 120, clientY: 120 });

    expect(screen.queryByLabelText(/当前缩放/)).toBeNull();
    expect(stage.style.transform).toContain("scale(1.1)");
  });

  it("registers wheel zoom as a non-passive native listener", () => {
    const addSpy = vi.spyOn(HTMLElement.prototype, "addEventListener");

    renderCanvasMap();

    expect(addSpy).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: false });
    addSpy.mockRestore();
  });

  it("wheel zoom clamps at min and max without rendering zoom controls", () => {
    const { container, stage } = renderCanvasMap();

    expect(screen.queryByRole("button", { name: "放大" })).toBeNull();
    expect(screen.queryByRole("button", { name: "缩小" })).toBeNull();
    expect(screen.queryByRole("button", { name: "重置视图" })).toBeNull();

    for (let i = 0; i < 20; i += 1) fireEvent.wheel(container, { deltaY: -120, clientX: 120, clientY: 120 });
    expect(stage.style.transform).toContain("scale(1.8)");

    for (let i = 0; i < 40; i += 1) fireEvent.wheel(container, { deltaY: 120, clientX: 120, clientY: 120 });
    expect(stage.style.transform).toContain("scale(0.45)");
  });

  it("does not render the obsolete reset view control", () => {
    const { container, stage } = renderCanvasMap();

    fireEvent.wheel(container, { deltaY: -120, clientX: 120, clientY: 120 });
    firePointer(container, "pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
    firePointer(container, "pointermove", { pointerId: 1, clientX: 40, clientY: 50 });
    expect(stage.style.transform).not.toBe("translate(0px, 0px) scale(1)");
    expect(screen.queryByRole("button", { name: "重置视图" })).toBeNull();
  });

  it("dragging empty canvas changes pan", () => {
    const { container, stage } = renderCanvasMap();

    firePointer(container, "pointerdown", { pointerId: 1, clientX: 12, clientY: 20 });
    firePointer(container, "pointermove", { pointerId: 1, clientX: 42, clientY: 56 });
    firePointer(container, "pointerup", { pointerId: 1, clientX: 42, clientY: 56, buttons: 0 });

    expect(stage.style.transform).toContain("translate(30px, 36px)");
  });

  it("keeps pan movement local until the pointer gesture is committed", () => {
    const onViewportChange = vi.fn();
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(
      <ExecutionMap
        plan={plan}
        run={run}
        selectedTaskId={null}
        onSelectTask={() => {}}
        viewport={{ x: 0, y: 0, scale: 1 }}
        onViewportChange={onViewportChange}
      />,
    );
    const viewport = container.querySelector(".execution-map-container") as HTMLElement;
    const stage = container.querySelector(".execution-map-scroll") as HTMLElement;

    firePointer(viewport, "pointerdown", { pointerId: 11, clientX: 12, clientY: 20 });
    firePointer(viewport, "pointermove", { pointerId: 11, clientX: 42, clientY: 56 });

    expect(stage.style.transform).toContain("translate(30px, 36px)");
    expect(onViewportChange).not.toHaveBeenCalled();

    firePointer(viewport, "pointerup", { pointerId: 11, clientX: 42, clientY: 56, buttons: 0 });

    expect(onViewportChange).toHaveBeenCalledTimes(1);
    expect(onViewportChange).toHaveBeenLastCalledWith({ x: 30, y: 36, scale: 1 });
  });

  it("snaps canvas pan offsets to device pixels", () => {
    const devicePixelRatioDescriptor = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });

    try {
      const { container, stage } = renderCanvasMap();

      firePointer(container, "pointerdown", { pointerId: 2, clientX: 10, clientY: 10 });
      firePointer(container, "pointermove", { pointerId: 2, clientX: 40.25, clientY: 46.25 });
      firePointer(container, "pointerup", { pointerId: 2, clientX: 40.25, clientY: 46.25, buttons: 0 });

      expect(stage.style.transform).toContain("translate(30.5px, 36.5px)");
    } finally {
      if (devicePixelRatioDescriptor) {
        Object.defineProperty(window, "devicePixelRatio", devicePixelRatioDescriptor);
      } else {
        delete (window as { devicePixelRatio?: number }).devicePixelRatio;
      }
    }
  });

  it("uses rendering hints that reduce scaled text blur", () => {
    const css = readFileSync("src/graph/execution-map.css", "utf8");
    expect(css).toContain("text-rendering: optimizeLegibility");
    expect(css).toContain("-webkit-font-smoothing: antialiased");
    expect(css).toContain("backface-visibility: hidden");
  });

  it("pointer down on a node does not start pan and still supports click", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const onSelectTask = vi.fn();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={onSelectTask} />);
    const viewport = container.querySelector(".execution-map-container") as HTMLElement;
    const stage = container.querySelector(".execution-map-scroll") as HTMLElement;
    const nodeButton = screen.getByRole("button", { name: /Research vendor B/ });

    firePointer(nodeButton, "pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
    firePointer(viewport, "pointermove", { pointerId: 1, clientX: 60, clientY: 60 });
    firePointer(viewport, "pointerup", { pointerId: 1, clientX: 60, clientY: 60, buttons: 0 });
    fireEvent.click(nodeButton);

    expect(stage.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(onSelectTask).toHaveBeenCalledWith("task_2");
  });

  it("caches dock and trash hit-test geometry while dragging atlas root nodes", async () => {
    const task = mockTeamTasks[0]!;
    const taskNode: AtlasTaskNode = {
      nodeId: "task-node",
      kind: "canvas-task",
      taskId: task.taskId,
      position: { x: 280, y: 220 },
    };
    const onMoveCanvasTask = vi.fn();
    const rectReads: string[] = [];
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getMockRect(this: HTMLElement) {
      const className = String(this.getAttribute("class") ?? "");
      if (
        className.includes("emap-root-dock")
        || className.includes("emap-root-trash")
        || className.includes("execution-map-nodes")
      ) {
        rectReads.push(className);
      }
      if (className.includes("emap-root-dock")) {
        return { left: 900, top: 24, right: 1180, bottom: 120, width: 280, height: 96, x: 900, y: 24, toJSON: () => ({}) } as DOMRect;
      }
      if (className.includes("emap-root-trash")) {
        return { left: 900, top: 500, right: 1180, bottom: 620, width: 280, height: 120, x: 900, y: 500, toJSON: () => ({}) } as DOMRect;
      }
      if (className.includes("execution-map-nodes")) {
        return { left: 0, top: 0, right: 1400, bottom: 900, width: 1400, height: 900, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      }
      return originalGetBoundingClientRect.call(this);
    });

    const { container } = render(
      <ExecutionMap
        plan={makeSequentialPlan()}
        run={makeSequentialRun()}
        selectedTaskId={null}
        onSelectTask={() => {}}
        taskNodes={[taskNode]}
        tasksById={new Map([[task.taskId, task]])}
        onMoveCanvasTask={onMoveCanvasTask}
      />,
    );
    const renderedTaskNode = await within(container).findByRole("button", { name: task.title });

    firePointer(renderedTaskNode, "pointerdown", { pointerId: 72, clientX: 320, clientY: 260 });
    firePointer(renderedTaskNode, "pointermove", { pointerId: 72, clientX: 360, clientY: 290 });
    const readsAfterCache = rectReads.length;
    firePointer(renderedTaskNode, "pointermove", { pointerId: 72, clientX: 390, clientY: 310 });
    firePointer(renderedTaskNode, "pointerup", { pointerId: 72, clientX: 390, clientY: 310, buttons: 0 });

    expect(readsAfterCache).toBeGreaterThan(0);
    expect(rectReads).toHaveLength(readsAfterCache);
    expect(onMoveCanvasTask).toHaveBeenCalled();
  });

  it("selecting an expanded child after zoom does not enter a measurement feedback loop", async () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    const childId = "explore_direction__official-search-apis";
    const api = new MockTeamApi();
    const attempts = await realSuccessOfficialAttempts();
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const stage = document.querySelector(".execution-map-scroll") as HTMLElement | null;
      const scale = stage?.style.transform.includes("scale(1.1)") ? 1.1 : 1;
      if (this.classList.contains("emap-evidence-node")) {
        const layoutHeight = Number.parseInt(this.style.minHeight) || 56;
        const visualHeight = layoutHeight * scale;
        return { height: visualHeight, width: 240, x: 600, y: 128, top: 128, left: 600, bottom: 128 + visualHeight, right: 840 } as DOMRect;
      }
      return { height: 56, width: 280, x: 0, y: 0, top: 0, left: 0, bottom: 56, right: 280 } as DOMRect;
    });
    const offsetDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return this.classList.contains("emap-evidence-node") ? 56 : 56;
      },
    });

    function Harness() {
      const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
      return (
        <ExecutionMap
          plan={plan}
          run={run}
          selectedTaskId={selectedTaskId}
          onSelectTask={(taskId) => setSelectedTaskId((current) => current === taskId ? null : taskId)}
          attemptsByTaskId={{ [childId]: attempts }}
          readAttemptFile={api.readAttemptFile.bind(api)}
        />
      );
    }

    const { container } = render(<Harness />);
    const viewport = container.querySelector(".execution-map-container") as HTMLElement;

    fireEvent.click(screen.getByRole("button", { name: /展开 13 个子任务/ }));
    fireEvent.wheel(viewport, { deltaY: -120, clientX: 120, clientY: 120 });
    fireEvent.click(screen.getByRole("button", { name: /探寻方向：搜索引擎官方免费 API/ }));

    expect(await screen.findByText("Worker 输出 1")).toBeInTheDocument();
    expect(screen.queryByLabelText(/当前缩放/)).toBeNull();
    expect((container.querySelector(".execution-map-scroll") as HTMLElement).style.transform).toContain("scale(1.1)");

    rectSpy.mockRestore();
    if (offsetDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetDescriptor);
    } else {
      delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
    }
  });
});

describe("Real snapshot fixture", () => {
  it("appears in ALL_FIXTURES", () => {
    const entry = ALL_FIXTURES.find((f) => f.id === "real-snapshot");
    expect(entry).toBeTruthy();
    expect(entry!.label).toBe("真实 run snapshot");
  });

  it("renders all task nodes from real snapshot", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    expect(screen.getByText("发现目标平台")).toBeInTheDocument();
    expect(screen.getByText("按平台搜索")).toBeInTheDocument();
    expect(screen.getByText("汇总报告")).toBeInTheDocument();
  });

  it("renders for_each child nodes from real snapshot", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    expect(screen.getByText("搜索 知乎")).toBeInTheDocument();
    expect(screen.getByText("搜索 小红书")).toBeInTheDocument();
    expect(screen.getByText("搜索 微博")).toBeInTheDocument();
    expect(screen.getByText("搜索 贴吧")).toBeInTheDocument();
  });

  it("renders long error summary first line without structural issues", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    const zhihuNode = screen.getByText("搜索 知乎").closest(".emap-node") as HTMLElement;
    expect(zhihuNode).toHaveClass("status-failed");
    expect(within(zhihuNode).getByText(/验收标准1/)).toBeInTheDocument();
  });

  it("renders API error with sanitized content", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    const weiboNode = screen.getByText("搜索 微博").closest(".emap-node") as HTMLElement;
    expect(weiboNode).toHaveClass("status-failed");
    expect(within(weiboNode).getByText(/unexpected error/)).toBeInTheDocument();
  });

  it("real snapshot resultRef and attemptId structures are present in taskStates", () => {
    const run = makeRealSnapshotRun();

    const tieba = run.taskStates["search_platform__tieba"];
    expect(tieba.resultRef).toMatch(/^tasks\/.+\/attempts\/attempt_.+\/.+-result\.md$/);
    expect(tieba.activeAttemptId).toMatch(/^attempt_[a-f0-9]+$/);

    const weibo = run.taskStates["search_platform__weibo"];
    expect(weibo.resultRef).toBeNull();
    expect(weibo.activeAttemptId).toMatch(/^attempt_[a-f0-9]+$/);
  });

  it("real snapshot plan and run have matching planId", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    expect(run.planId).toBe(plan.planId);
  });

  it("clicking a real snapshot child node selects it", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    let clickedId: string | null = null;
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={(id) => { clickedId = id; }} />);

    fireEvent.click(screen.getByText("搜索 知乎"));
    expect(clickedId).toBe("search_platform__zhihu");
  });
});

describe("Real success foreach fixture", () => {
  it("appears in ALL_FIXTURES", () => {
    const entry = ALL_FIXTURES.find((f) => f.id === "real-success-foreach");
    expect(entry).toBeTruthy();
    expect(entry!.label).toBe("真实 run snapshot 2");
  });

  it("plan and run have matching planId", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    expect(run.planId).toBe(plan.planId);
  });

  it("renders 3 main task nodes", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    expect(screen.getByText("Phase 1 — 发现所有搜索方案方向")).toBeInTheDocument();
    expect(screen.getByText("Phase 2 — 逐方向探寻方案")).toBeInTheDocument();
    expect(screen.getByText("Phase 3 — 组装最终对比报告")).toBeInTheDocument();
  });

  it("renders collapsed summary for 13 children", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    expect(screen.getByText("+ 13 个子任务")).toBeInTheDocument();
  });

  it("marks collapsed summary as succeeded when all 13 children succeeded", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    const collapsedNode = screen.getByText("+ 13 个子任务").closest(".emap-collapsed");
    expect(collapsedNode).toBeTruthy();
    expect(collapsedNode).toHaveClass("status-succeeded");
  });

  it("run shows completed status with all succeeded", () => {
    const run = makeRealSuccessForEachRun();
    expect(run.status).toBe("completed");
    expect(run.summary.succeededTasks).toBe(16);
    expect(run.summary.failedTasks).toBe(0);
    expect(run.summary.cancelledTasks).toBe(0);
  });

  it("renders result evidence for discover_directions", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="discover_directions" onSelectTask={() => {}} />);

    const resultCard = container.querySelector(".emap-evidence-result");
    expect(resultCard).toBeTruthy();
    expect(resultCard?.textContent).toContain("accepted-result.md");
  });

  it("renders result evidence for assemble_report with attempt count 3", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="assemble_report" onSelectTask={() => {}} />);

    const resultCard = container.querySelector(".emap-evidence-result");
    expect(resultCard).toBeTruthy();
    expect(resultCard?.textContent).toContain("accepted-result.md");
  });

  it("does not render child result evidence when selecting for_each parent with collapsed children", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="explore_direction" onSelectTask={() => {}} />);

    // No result cards — parent resultRef is null, children are collapsed
    const resultCards = container.querySelectorAll(".emap-evidence-result");
    expect(resultCards.length).toBe(0);

    // No error cards — parent has no error
    const errorCards = container.querySelectorAll(".emap-evidence-error");
    expect(errorCards.length).toBe(0);

    // Parent shows own progress evidence (succeeded phase)
    const progressCard = container.querySelector(".emap-evidence-progress");
    expect(progressCard).toBeTruthy();
    expect(progressCard?.textContent).toContain("succeeded");
  });

  it("clicking collapsed summary expands child nodes", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    expect(screen.getByText("+ 13 个子任务")).toBeInTheDocument();
    const collapsedBtn = screen.getByRole("button", { name: /展开 13 个子任务/ });
    fireEvent.click(collapsedBtn);

    // After expand, collapsed summary is gone, child nodes appear
    expect(screen.queryByText("+ 13 个子任务")).toBeNull();
    expect(screen.getByText("探寻方向：搜索引擎官方免费 API")).toBeInTheDocument();
    expect(screen.getByText("探寻方向：代理/VPN/Tor 搜索网关")).toBeInTheDocument();
  });

  it("does not use pending/running/failed colors on succeeded nodes", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    const succeededNodes = container.querySelectorAll(".emap-node.status-succeeded");
    expect(succeededNodes.length).toBeGreaterThanOrEqual(3);

    const failedNodes = container.querySelectorAll(".emap-node.status-failed");
    expect(failedNodes.length).toBe(0);
    const pendingNodes = container.querySelectorAll(".emap-node.status-pending");
    expect(pendingNodes.length).toBe(0);
    const runningNodes = container.querySelectorAll(".emap-node.status-running");
    expect(runningNodes.length).toBe(0);
  });

  it("all non-null activeAttemptId match hex pattern", () => {
    const run = makeRealSuccessForEachRun();
    const attemptRe = /^attempt_[a-f0-9]+$/;
    for (const [, state] of Object.entries(run.taskStates)) {
      if (state.activeAttemptId) {
        expect(state.activeAttemptId).toMatch(attemptRe);
      }
    }
  });

  it("all non-null resultRef contain valid attempt path", () => {
    const run = makeRealSuccessForEachRun();
    const refRe = /\/attempts\/attempt_[a-f0-9]+\//;
    for (const [, state] of Object.entries(run.taskStates)) {
      if (state.resultRef) {
        expect(state.resultRef).toMatch(refRe);
      }
    }
  });

  it("all 13 for_each taskDefinitions have sourceItem matching sourceItemId", () => {
    const run = makeRealSuccessForEachRun();
    const forEachChildren = (run.taskDefinitions ?? []).filter(
      (td) => td.parentTaskId === "explore_direction" && td.generatedSource === "for_each",
    );
    expect(forEachChildren.length).toBe(13);

    for (const td of forEachChildren) {
      expect(td.sourceItemId).toBeTruthy();
      expect(td.sourceItem).toBeTruthy();
      expect(td.sourceItem!.id).toBe(td.sourceItemId);
      expect(td.sourceItem!.data.name).toBeTruthy();
      expect(td.sourceItem!.data.description).toBeTruthy();
      expect(td.sourceItem!.data.searchKeywords).toBeTruthy();
      expect(td.sourceItem!.data.estimatedCount).toBeTruthy();
    }
  });

  it("expand then collapse toggles back to summary", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    expect(screen.getByText("+ 13 个子任务")).toBeInTheDocument();

    // Expand
    fireEvent.click(screen.getByRole("button", { name: /展开 13 个子任务/ }));
    expect(screen.queryByText("+ 13 个子任务")).toBeNull();
    expect(screen.getByText("探寻方向：搜索引擎官方免费 API")).toBeInTheDocument();

    const collapseBtn = screen.getByRole("button", { name: /收起 13 个子任务/ });
    fireEvent.click(collapseBtn);

    expect(screen.getByText("+ 13 个子任务")).toBeInTheDocument();
  });

  it("expanded child shows own Result evidence", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    const childId = "explore_direction__official-search-apis";
    const { container, rerender } = render(
      <ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />,
    );

    // Expand
    fireEvent.click(screen.getByRole("button", { name: /展开 13 个子任务/ }));

    // Now re-render with child selected (simulating parent App state)
    rerender(<ExecutionMap plan={plan} run={run} selectedTaskId={childId} onSelectTask={() => {}} />);

    const resultCard = container.querySelector(".emap-evidence-result");
    expect(resultCard).toBeTruthy();
    expect(resultCard?.textContent).toContain("accepted-result.md");

    const attemptCard = container.querySelector(".emap-evidence-attempt");
    expect(attemptCard).toBeTruthy();

    const progressCard = container.querySelector(".emap-evidence-progress");
    expect(progressCard).toBeTruthy();
  });

  it("expanded parent explore_direction shows no evidence", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    const { container, rerender } = render(
      <ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />,
    );

    // Expand first
    fireEvent.click(screen.getByRole("button", { name: /展开 13 个子任务/ }));

    // Now select parent (children are visible => no evidence)
    rerender(<ExecutionMap plan={plan} run={run} selectedTaskId="explore_direction" onSelectTask={() => {}} />);

    const evidenceNodes = container.querySelectorAll(".emap-evidence-node");
    expect(evidenceNodes.length).toBe(0);
  });

  it("collapsed summary button is keyboard accessible with focus-visible", () => {
    const css = readFileSync("src/graph/execution-map.css", "utf8");
    expect(css).toContain(".emap-collapsed");
    expect(css).toContain(".emap-node:focus-visible");
  });
});
