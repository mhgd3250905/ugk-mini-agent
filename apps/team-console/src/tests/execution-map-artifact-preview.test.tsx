import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExecutionMap, type AtlasTaskNode } from "../graph/ExecutionMap";
import { NODE_WIDTH } from "../graph/execution-map-layout";
import {
  MockTeamApi,
  mockTeamTasks,
  makeSequentialPlan,
  makeSequentialRun,
  makeFailedRun,
  makeRealSuccessForEachPlan,
  makeRealSuccessForEachRun,
} from "../fixtures/team-fixtures";
import type { TeamAttemptMetadata } from "../api/team-types";

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
