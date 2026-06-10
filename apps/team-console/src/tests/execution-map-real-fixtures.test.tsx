import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ExecutionMap } from "../graph/ExecutionMap";
import {
  ALL_FIXTURES,
  makeRealSnapshotPlan,
  makeRealSnapshotRun,
  makeRealSuccessForEachPlan,
  makeRealSuccessForEachRun,
} from "../fixtures/team-fixtures";

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
