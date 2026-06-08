import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { resetMockTeamApiState } from "../fixtures/team-fixtures";
import { getAtlasNodes, firePointer } from "./app-dom-test-utils";

describe("App", () => {
  beforeEach(() => {
    resetMockTeamApiState();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("task leader chat", () => {
    it("opens the Task leader chat iframe from the action menu", async () => {
      const { container } = render(<App />);

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

      expect(container.querySelector(".task-action-branch")).toBeTruthy();
      const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      expect(container.querySelector(".emap-task-child-branch-shell")).toBeTruthy();
      expect(container.querySelector(".emap-link-task-child-branch")).toBeTruthy();
      expect(branch).toHaveClass("agent-playground-branch");
      expect(branch!.querySelector(".agent-playground-branch-head")).toBeTruthy();
      expect(branch!.querySelector(".agent-playground-branch-collapse")).toBeTruthy();
      expect(container.querySelector(".emap-task-child-branch-shell .emap-panel-resize-handle")).toBeTruthy();
      expect(within(branch!).getByText("Leader 对话")).toBeInTheDocument();
      expect(within(branch!).getByText("调查 Medtrum 云资产")).toBeInTheDocument();

      const iframe = branch!.querySelector("iframe") as HTMLIFrameElement | null;
      expect(iframe).toHaveClass("agent-playground-iframe");
      expect(iframe).toHaveAttribute("title", "调查 Medtrum 云资产 leader 对话");
      expect(iframe).toHaveAttribute("allow", "clipboard-write; clipboard-read");
      expect(iframe?.getAttribute("src")).toContain("/playground?view=chat&agentId=main");
      expect(iframe?.getAttribute("src")).toContain("embed=team-console");
      expect(iframe?.getAttribute("src")).toContain("embedMode=mini");
      expect(iframe?.getAttribute("src")).toContain("teamTaskId=task_research_medtrum");
      expect(iframe?.getAttribute("src")).toContain("teamTaskMode=edit");
    });

    it("no longer renders large context preview in the Leader chat branch", async () => {
      const { container } = render(<App />);

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

      const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();

      // No large context preview block or <pre> element
      expect(branch!.querySelector(".task-leader-context-copy")).toBeNull();
      expect(branch!.querySelector(".task-leader-context-copy-text")).toBeNull();
      expect(branch!.querySelector("pre")).toBeNull();

      // Compact copy button is inside the header
      const header = branch!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      expect(header).toBeTruthy();
      expect(within(header!).getByRole("button", { name: /复制 Task 上下文/ })).toBeInTheDocument();

      // iframe still present with correct src params
      const iframe = branch!.querySelector("iframe") as HTMLIFrameElement | null;
      expect(iframe).toBeTruthy();
      expect(iframe?.getAttribute("src")).toContain("/playground?view=chat");
      expect(iframe?.getAttribute("src")).toContain("agentId=main");
      expect(iframe?.getAttribute("src")).toContain("embed=team-console");
      expect(iframe?.getAttribute("src")).toContain("teamTaskId=task_research_medtrum");
      expect(iframe?.getAttribute("src")).toContain("teamTaskMode=edit");
    });

    it("uses the full playground layout only when the Task leader chat is maximized", async () => {
      const { container } = render(<App />);

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

      const inlineIframe = container.querySelector(".execution-map-scroll .task-leader-chat-branch iframe") as HTMLIFrameElement | null;
      expect(inlineIframe?.getAttribute("src")).toContain("embedMode=mini");

      fireEvent.click(screen.getByRole("button", { name: "最大化对话分支" }));

      const overlay = document.querySelector(".emap-maximized-branch-shell") as HTMLElement | null;
      expect(overlay).toBeTruthy();
      expect(container.querySelector(".execution-map-scroll .task-leader-chat-branch")).toBeNull();
      const overlayIframe = overlay!.querySelector(".task-leader-chat-branch iframe") as HTMLIFrameElement | null;
      expect(overlayIframe).toBeTruthy();
      expect(overlayIframe?.getAttribute("src")).toContain("embedMode=full");
      expect(overlayIframe?.getAttribute("src")).toContain("teamTaskId=task_research_medtrum");
      expect(overlayIframe?.getAttribute("src")).toContain("teamTaskMode=edit");
    });

    it("copies current Task context from the Leader chat branch header", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        writable: true,
        configurable: true,
      });

      const { container } = render(<App />);

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

      const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
      const header = branch!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      const copyButton = within(header!).getByRole("button", { name: /复制 Task 上下文/ });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledTimes(1);
      });
      const copiedText = writeText.mock.calls[0][0] as string;
      expect(copiedText).toContain("taskId: task_research_medtrum");
      expect(copiedText).toContain("/team-task");
      expect(copiedText).toContain("workUnit.acceptance.rules");

      await waitFor(() => {
        expect(screen.getByRole("status").textContent).toContain("已复制");
      });
    });

    it("keeps branch functional when clipboard copy fails", async () => {
      const writeText = vi.fn().mockRejectedValue(new Error("not allowed"));
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        writable: true,
        configurable: true,
      });

      const { container } = render(<App />);

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

      const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
      const header = branch!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      const copyButton = within(header!).getByRole("button", { name: /复制 Task 上下文/ });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByRole("status").textContent).toContain("复制失败");
      });

      // Iframe remains present
      expect(branch!.querySelector("iframe")).toBeTruthy();
    });

    it("falls back to execCommand when clipboard API rejects", async () => {
      const writeText = vi.fn().mockRejectedValue(new Error("not allowed"));
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        writable: true,
        configurable: true,
      });
      const execCopy = vi.fn().mockReturnValue(true);
      Object.defineProperty(document, "execCommand", {
        value: execCopy,
        writable: true,
        configurable: true,
      });

      const { container } = render(<App />);

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

      const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
      const header = branch!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      fireEvent.click(within(header!).getByRole("button", { name: /复制 Task 上下文/ }));

      await waitFor(() => {
        expect(screen.getByRole("status").textContent).toContain("已复制");
      });

      // Temp textarea was cleaned up
      expect(document.querySelector("textarea[data-copy-fallback]")).toBeNull();
    });

    it("falls back to execCommand when clipboard API is unavailable", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const execCopy = vi.fn().mockReturnValue(true);
      Object.defineProperty(document, "execCommand", {
        value: execCopy,
        writable: true,
        configurable: true,
      });

      const { container } = render(<App />);

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

      const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
      const header = branch!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      fireEvent.click(within(header!).getByRole("button", { name: /复制 Task 上下文/ }));

      await waitFor(() => {
        expect(screen.getByRole("status").textContent).toContain("已复制");
      });

      expect(document.querySelector("textarea[data-copy-fallback]")).toBeNull();
    });

    it("shows a selectable manual copy fallback when both clipboard API and execCommand fail", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const execCopy = vi.fn().mockReturnValue(false);
      Object.defineProperty(document, "execCommand", {
        value: execCopy,
        writable: true,
        configurable: true,
      });

      const { container } = render(<App />);

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

      const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
      const header = branch!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      fireEvent.click(within(header!).getByRole("button", { name: /复制 Task 上下文/ }));

      await waitFor(() => {
        expect(screen.getByRole("status").textContent).toContain("复制失败");
      });

      // Iframe and branch remain present
      expect(branch!.querySelector("iframe")).toBeTruthy();
      expect(document.querySelector("textarea[data-copy-fallback]")).toBeNull();
      const manualCopy = screen.getByLabelText("手动复制 Task 上下文") as HTMLTextAreaElement;
      expect(manualCopy.value).toContain("taskId: task_research_medtrum");
      expect(manualCopy.value).toContain("/team-task");
    });

    it("closes the Task leader chat branch from its header action", async () => {
      const { container } = render(<App />);

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));
      expect(container.querySelector(".task-leader-chat-branch iframe")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: /收起 调查 Medtrum 云资产 leader 对话/ }));

      expect(container.querySelector(".task-leader-chat-branch")).toBeNull();
      expect(container.querySelector(".task-action-branch")).toBeTruthy();
    });

    it("drags and resizes the Task leader chat child branch like an Agent branch", async () => {
      const { container } = render(<App />);

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

      const branchShell = container.querySelector(".emap-task-child-branch-shell") as HTMLElement | null;
      const titleBar = container.querySelector(".task-leader-chat-branch .agent-playground-branch-head") as HTMLElement | null;
      const resizeHandle = container.querySelector(".emap-task-child-branch-shell .emap-panel-resize-handle") as HTMLElement | null;
      expect(branchShell).toBeTruthy();
      expect(titleBar).toBeTruthy();
      expect(resizeHandle).toBeTruthy();
      const initialLeft = Number.parseFloat(branchShell!.style.left);
      const initialTop = Number.parseFloat(branchShell!.style.top);
      const initialWidth = Number.parseFloat(branchShell!.style.width);
      const initialHeight = Number.parseFloat(branchShell!.style.height);

      firePointer(titleBar!, "pointerdown", { pointerId: 51, clientX: 600, clientY: 220 });
      firePointer(titleBar!, "pointermove", { pointerId: 51, clientX: 650, clientY: 255 });
      firePointer(titleBar!, "pointerup", { pointerId: 51, clientX: 650, clientY: 255, buttons: 0 });

      expect(Number.parseFloat(branchShell!.style.left)).toBeCloseTo(initialLeft + 50, 4);
      expect(Number.parseFloat(branchShell!.style.top)).toBeCloseTo(initialTop + 35, 4);

      firePointer(resizeHandle!, "pointerdown", { pointerId: 52, clientX: 1000, clientY: 700 });
      firePointer(resizeHandle!, "pointermove", { pointerId: 52, clientX: 1080, clientY: 760 });
      firePointer(resizeHandle!, "pointerup", { pointerId: 52, clientX: 1080, clientY: 760, buttons: 0 });

      expect(Number.parseFloat(branchShell!.style.width)).toBeCloseTo(initialWidth + 80, 4);
      expect(Number.parseFloat(branchShell!.style.height)).toBeCloseTo(initialHeight + 60, 4);
    });
  });
});
