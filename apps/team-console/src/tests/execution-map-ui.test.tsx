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
} from "../fixtures/team-fixtures";

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

  it("renders SVG links matching model output", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    const paths = container.querySelectorAll(".emap-link");
    expect(paths.length).toBeGreaterThan(0);
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
