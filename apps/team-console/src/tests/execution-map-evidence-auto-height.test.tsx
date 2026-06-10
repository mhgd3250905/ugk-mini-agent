import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { ExecutionMap } from "../graph/ExecutionMap";
import {
  makeSequentialPlan,
  makeSequentialRun,
  makeRealSnapshotPlan,
  makeRealSnapshotRun,
} from "../fixtures/team-fixtures";
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
