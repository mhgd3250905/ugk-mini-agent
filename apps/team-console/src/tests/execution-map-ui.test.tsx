import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ExecutionMap, type AtlasTaskNode } from "../graph/ExecutionMap";
import { App } from "../app/App";
import {
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
    expect(discoveryHeight - normalHeight).toBeGreaterThanOrEqual(48);
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
