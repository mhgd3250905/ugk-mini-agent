import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExecutionMap } from "../graph/ExecutionMap";
import { ExecutionTaskDetail } from "../graph/ExecutionTaskDetail";
import { App } from "../app/App";
import {
  makeSequentialPlan,
  makeSequentialRun,
  makeFailedRun,
  makeLargeChildRun,
  makeDiscoveryForEachPlan,
  makeSkippedRun,
} from "../fixtures/team-fixtures";
import type { TaskStatus } from "../api/team-types";

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

describe("ExecutionMap UI", () => {
  it("renders task nodes for sequential run", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    expect(screen.getByText("Research vendor A")).toBeInTheDocument();
    expect(screen.getByText("Research vendor B")).toBeInTheDocument();
    expect(screen.getByText("Research vendor C")).toBeInTheDocument();
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

  it("calls onSelectTask when clicking a node", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    let clickedId: string | null = null;
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={(id) => { clickedId = id; }} />);
    fireEvent.click(screen.getByText("Research vendor B"));
    expect(clickedId).toBe("task_2");
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
});

describe("ExecutionTaskDetail", () => {
  it("shows task details when a task is selected", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    render(<ExecutionTaskDetail run={run} plan={plan} selectedTaskId="task_1" onClose={() => {}} />);
    expect(screen.getByText("task_1")).toBeInTheDocument();
    expect(screen.getByText("Research vendor A")).toBeInTheDocument();
  });

  it("shows status badge", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    render(<ExecutionTaskDetail run={run} plan={plan} selectedTaskId="task_1" onClose={() => {}} />);
    expect(screen.getByText("成功")).toBeInTheDocument();
  });

  it("shows error for failed task", () => {
    const plan = makeSequentialPlan();
    const run = makeFailedRun();
    render(<ExecutionTaskDetail run={run} plan={plan} selectedTaskId="task_2" onClose={() => {}} />);
    expect(screen.getByText(/Worker timeout/)).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    let closed = false;
    render(<ExecutionTaskDetail run={run} plan={plan} selectedTaskId="task_1" onClose={() => { closed = true; }} />);
    fireEvent.click(screen.getByText("×"));
    expect(closed).toBe(true);
  });
});

describe("App integration", () => {
  it("switches fixtures", () => {
    render(<App />);
    const failedBtn = screen.getByText("失败 run");
    fireEvent.click(failedBtn);
    expect(screen.getByText(/Worker timeout/)).toBeInTheDocument();
  });
});
