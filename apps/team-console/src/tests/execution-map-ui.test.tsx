import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ExecutionMap } from "../graph/ExecutionMap";
import { App } from "../app/App";
import {
  ALL_FIXTURES,
  makeSequentialPlan,
  makeSequentialRun,
  makeFailedRun,
  makeLargeChildRun,
  makeDiscoveryForEachPlan,
  makeDiscoveryForEachRun,
  makeSkippedRun,
  makeRealSnapshotPlan,
  makeRealSnapshotRun,
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

function firstTaskTitleNode(title: string): HTMLElement {
  const titleNode = screen.getAllByText(title)[0];
  expect(titleNode).toBeTruthy();
  return titleNode as HTMLElement;
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
    expect(within(node).getByText("result linked")).toBeInTheDocument();
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

    expect(screen.getByRole("button", { name: /Execution Run/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Research vendor B/ })).toBeInTheDocument();
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

  it("collapsed summary is not rendered as an expandable button", () => {
    const plan = makeDiscoveryForEachPlan();
    const run = makeLargeChildRun();
    render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);

    expect(screen.queryByRole("button", { name: /\+ 10 个子任务/ })).toBeNull();
    expect(collapsedNode().tagName).toBe("DIV");
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
  it("switches fixtures", () => {
    render(<App />);
    const failedBtn = screen.getByText("失败 run");
    fireEvent.click(failedBtn);
    expect(screen.getByText(/Worker timeout/)).toBeInTheDocument();
  });

  it("renders evidence nodes when selecting a task", () => {
    const { container } = render(<App />);
    fireEvent.click(firstTaskTitleNode("Research vendor A"));

    const evidenceNodes = container.querySelectorAll(".execution-map-nodes > .emap-evidence-node");
    expect(evidenceNodes.length).toBeGreaterThan(0);
    expect(container.querySelector(".emap-inline-detail")).toBeNull();
    expect(container.querySelector(".workspace-detail")).toBeNull();
  });

  it("clicking the selected task again hides evidence nodes", () => {
    const { container } = render(<App />);

    fireEvent.click(firstTaskTitleNode("Research vendor A"));
    const afterSelect = container.querySelectorAll(".execution-map-nodes > .emap-evidence-node");
    expect(afterSelect.length).toBeGreaterThan(0);

    fireEvent.click(firstTaskTitleNode("Research vendor A"));
    const afterDeselect = container.querySelectorAll(".execution-map-nodes > .emap-evidence-node");
    expect(afterDeselect.length).toBe(0);
  });

  it("fixture bar keeps horizontal scrolling without native bright scrollbar chrome", () => {
    const css = readFileSync("src/app/app.css", "utf8");

    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("scrollbar-width: none");
    expect(css).toContain(".fixture-bar::-webkit-scrollbar");
  });
});

describe("Evidence branch cards", () => {
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

  it("renders attempt evidence card for task with activeAttemptId", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform__zhihu" onSelectTask={() => {}} />);

    const attemptCard = container.querySelector(".emap-evidence-attempt");
    expect(attemptCard).toBeTruthy();
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

  it("renders child result evidence cards for for_each parent", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform" onSelectTask={() => {}} />);

    const resultCards = container.querySelectorAll(".execution-map-nodes > .emap-evidence-result");
    expect(resultCards.length).toBe(4);

    expect(screen.getAllByText("搜索 知乎").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("搜索 微博").length).toBeGreaterThanOrEqual(2);
  });

  it("renders parent error card for for_each parent with error", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform" onSelectTask={() => {}} />);

    const errorCard = container.querySelector(".emap-evidence-error");
    expect(errorCard).toBeTruthy();
    expect(errorCard?.textContent).toContain("one or more child tasks failed");
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

  it("renders Failed tag for task with failed-result.md", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform__zhihu" onSelectTask={() => {}} />);

    const resultCard = container.querySelector(".emap-evidence-result");
    expect(resultCard).toBeTruthy();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders dashed SVG connectors from task to evidence cards", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="task_1" onSelectTask={() => {}} />);
    const evidenceLinks = container.querySelectorAll(".emap-link-evidence");
    expect(evidenceLinks.length).toBeGreaterThan(0);
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

  it("renders ghost evidence for child without resultRef", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform" onSelectTask={() => {}} />);

    const ghostCards = container.querySelectorAll(".emap-evidence-ghost");
    expect(ghostCards.length).toBeGreaterThan(0);
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

  it("long error summary and result path are fully present in evidence DOM", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId="search_platform__zhihu" onSelectTask={() => {}} />);

    const errorCard = container.querySelector(".emap-evidence-error");
    expect(errorCard).toBeTruthy();
    const errorContent = errorCard!.querySelector(".emap-evidence-content")!;
    const text = errorContent.textContent!;
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(151);

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

  it("measurement loop uses DOM height when getBoundingClientRect returns non-zero", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const mockHeight = 88;

    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("emap-evidence-node")) {
        return { height: mockHeight, width: 240, x: 600, y: 128, top: 128, left: 600, bottom: 128 + mockHeight, right: 840 } as DOMRect;
      }
      return { height: 56, width: 280, x: 0, y: 0, top: 0, left: 0, bottom: 56, right: 280 } as DOMRect;
    });

    const { container } = render(
      <ExecutionMap plan={plan} run={run} selectedTaskId="task_1" onSelectTask={() => {}} />,
    );

    const evidenceNodes = container.querySelectorAll(".emap-evidence-node");
    for (const node of evidenceNodes) {
      const minHeight = Number.parseInt((node as HTMLElement).style.minHeight);
      expect(minHeight).toBe(mockHeight);
    }

    spy.mockRestore();
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
