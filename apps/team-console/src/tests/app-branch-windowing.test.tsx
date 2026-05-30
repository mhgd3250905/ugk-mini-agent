import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
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

  describe("branch windowing", () => {
    it("switches the embedded playground branch to the clicked agent id", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(screen.getByRole("button", { name: /搜索 Agent[\s\S]*search/ }));

      fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));
      expect(container.querySelector("iframe")?.getAttribute("src")).toContain("agentId=main");

      const searchNode = within(getAtlasNodes(container)).getByRole("button", { name: "搜索 Agent" });
      firePointer(searchNode, "pointerdown", { pointerId: 12, clientX: 220, clientY: 80 });
      firePointer(searchNode, "pointerup", { pointerId: 12, clientX: 220, clientY: 80, buttons: 0 });
      fireEvent.click(searchNode);

      const branch = container.querySelector(".agent-playground-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      expect(within(branch!).getByText("搜索 Agent")).toBeInTheDocument();
      expect(branch!.querySelector("iframe")?.getAttribute("src")).toContain("/playground?view=chat&agentId=search");
      expect(branch!.querySelector("iframe")?.getAttribute("src")).toContain("embed=team-console");
    });

    it("drags the embedded playground branch by its title bar", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));

      const branchShell = container.querySelector(".emap-agent-branch-shell") as HTMLElement | null;
      const titleBar = container.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      const atlasStage = container.querySelector(".execution-map-scroll") as HTMLElement | null;
      expect(branchShell).toBeTruthy();
      expect(titleBar).toBeTruthy();
      expect(atlasStage).toBeTruthy();
      const initialLeft = Number.parseFloat(branchShell!.style.left);
      const initialTop = Number.parseFloat(branchShell!.style.top);
      const initialStageTransform = atlasStage!.style.transform;

      firePointer(titleBar!, "pointerdown", { pointerId: 21, clientX: 300, clientY: 120 });
      firePointer(titleBar!, "pointermove", { pointerId: 21, clientX: 380, clientY: 155 });
      firePointer(titleBar!, "pointerup", { pointerId: 21, clientX: 380, clientY: 155, buttons: 0 });

      expect(Number.parseFloat(branchShell!.style.left)).toBeCloseTo(initialLeft + 80, 4);
      expect(Number.parseFloat(branchShell!.style.top)).toBeCloseTo(initialTop + 35, 4);
      expect(atlasStage!.style.transform).toBe(initialStageTransform);
    });

    it("allows dragging the embedded playground branch above the atlas origin", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));

      const branchShell = container.querySelector(".emap-agent-branch-shell") as HTMLElement | null;
      const titleBar = container.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      expect(branchShell).toBeTruthy();
      expect(titleBar).toBeTruthy();
      const initialTop = Number.parseFloat(branchShell!.style.top);

      firePointer(titleBar!, "pointerdown", { pointerId: 25, clientX: 300, clientY: 120 });
      firePointer(titleBar!, "pointermove", { pointerId: 25, clientX: 300, clientY: -80 });
      firePointer(titleBar!, "pointerup", { pointerId: 25, clientX: 300, clientY: -80, buttons: 0 });

      expect(Number.parseFloat(branchShell!.style.top)).toBeCloseTo(initialTop - 200, 4);
    });

    it("keeps the embedded playground branch link on shared right-to-left node anchors after dragging below the agent", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));

      const titleBar = container.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      expect(titleBar).toBeTruthy();

      firePointer(titleBar!, "pointerdown", { pointerId: 24, clientX: 500, clientY: 120 });
      firePointer(titleBar!, "pointermove", { pointerId: 24, clientX: 172, clientY: 420 });
      firePointer(titleBar!, "pointerup", { pointerId: 24, clientX: 172, clientY: 420, buttons: 0 });

      const branchLink = container.querySelector(".emap-link-agent-branch") as SVGPathElement | null;
      expect(branchLink).toBeTruthy();
      expect(branchLink!.getAttribute("d")).toContain("M640,66");
      expect(branchLink!.getAttribute("d")).not.toContain("M500,132");
      expect(branchLink!.getAttribute("d")).not.toContain("M500,112");
    });

    it("resizes the embedded playground branch from the bottom-right handle", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));

      const branchShell = container.querySelector(".emap-agent-branch-shell") as HTMLElement | null;
      const resizeHandle = container.querySelector(".emap-agent-branch-resize-handle") as HTMLElement | null;
      expect(branchShell).toBeTruthy();
      expect(resizeHandle).toBeTruthy();
      const initialWidth = Number.parseFloat(branchShell!.style.width);
      const initialHeight = Number.parseFloat(branchShell!.style.height);

      firePointer(resizeHandle!, "pointerdown", { pointerId: 22, clientX: 900, clientY: 620 });
      firePointer(resizeHandle!, "pointermove", { pointerId: 22, clientX: 1020, clientY: 690 });
      firePointer(resizeHandle!, "pointerup", { pointerId: 22, clientX: 1020, clientY: 690, buttons: 0 });

      expect(Number.parseFloat(branchShell!.style.width)).toBeCloseTo(initialWidth + 120, 4);
      expect(Number.parseFloat(branchShell!.style.height)).toBeCloseTo(initialHeight + 70, 4);
    });

    it("maximizes an embedded playground branch outside the scaled canvas", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));

      fireEvent.click(screen.getByRole("button", { name: "最大化对话分支" }));

      const overlay = document.querySelector(".emap-maximized-branch-shell") as HTMLElement | null;
      expect(overlay).toBeTruthy();
      expect(overlay!.parentElement).toBe(document.body);
      expect(container.querySelector(".execution-map-scroll .emap-agent-branch-shell")).toBeNull();
      expect(overlay!.querySelector(".agent-playground-iframe")).toBeTruthy();

      // Restore via double-click on overlay header (no dedicated restore button)
      const overlayHeader = overlay!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      expect(overlayHeader).toBeTruthy();
      fireEvent.doubleClick(overlayHeader!);

      expect(document.querySelector(".emap-maximized-branch-shell")).toBeNull();
      expect(container.querySelector(".execution-map-scroll .emap-agent-branch-shell")).toBeTruthy();
    });

    it("double-clicks a playground branch header to maximize and restore it", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));

      const header = container.querySelector(".execution-map-scroll .agent-playground-branch-head") as HTMLElement | null;
      expect(header).toBeTruthy();
      fireEvent.doubleClick(header!);

      const overlay = document.querySelector(".emap-maximized-branch-shell") as HTMLElement | null;
      expect(overlay).toBeTruthy();
      expect(container.querySelector(".execution-map-scroll .emap-agent-branch-shell")).toBeNull();

      const overlayHeader = overlay!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      expect(overlayHeader).toBeTruthy();
      fireEvent.doubleClick(overlayHeader!);

      expect(document.querySelector(".emap-maximized-branch-shell")).toBeNull();
      expect(container.querySelector(".execution-map-scroll .emap-agent-branch-shell")).toBeTruthy();
    });

    it("restore button does not exist in maximized overlay — double-click header to restore", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));

      fireEvent.click(screen.getByRole("button", { name: "最大化对话分支" }));

      const overlay = document.querySelector(".emap-maximized-branch-shell") as HTMLElement | null;
      expect(overlay).toBeTruthy();

      // No restore button exists
      expect(screen.queryByRole("button", { name: "还原对话分支" })).toBeNull();
      expect(overlay!.querySelector(".emap-branch-restore-button")).toBeNull();

      // Restore by double-clicking overlay header
      const overlayHeader = overlay!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      fireEvent.doubleClick(overlayHeader!);
      expect(document.querySelector(".emap-maximized-branch-shell")).toBeNull();
    });

    it("maximized overlay uses fullscreen viewport CSS", async () => {
      // Verify CSS rules from the stylesheet file
      const css = readFileSync("src/graph/execution-map.css", "utf-8");
      const shellRule = css.match(/\.emap-maximized-branch-shell\s*\{[^}]*\}/)?.[0];
      expect(shellRule).toBeTruthy();
      expect(shellRule).toContain("position: fixed");
      expect(shellRule).toContain("inset: 0");

      // Restore button rule should not exist
      expect(css).not.toMatch(/\.emap-branch-restore-button\s*\{/);
    });

    it("double-clicks Task creation branch header to maximize and restore", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/v1/team/tasks"));

      fireEvent.click(screen.getByRole("button", { name: "创建 Task" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      // Wait for branch
      await waitFor(() => {
        expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
      });

      // Verify iframe has teamTaskMode=create
      const iframe = container.querySelector(".agent-playground-branch iframe") as HTMLIFrameElement | null;
      expect(iframe?.getAttribute("src")).toContain("teamTaskMode=create");
      expect(iframe?.getAttribute("src")).not.toContain("teamTaskId=");

      // Double-click header to maximize
      const header = container.querySelector(".execution-map-scroll .agent-playground-branch-head") as HTMLElement | null;
      expect(header).toBeTruthy();
      fireEvent.doubleClick(header!);

      const overlay = document.querySelector(".emap-maximized-branch-shell") as HTMLElement | null;
      expect(overlay).toBeTruthy();
      expect(container.querySelector(".execution-map-scroll .emap-agent-branch-shell")).toBeNull();

      // iframe src preserved after maximize
      const overlayIframe = overlay!.querySelector("iframe") as HTMLIFrameElement | null;
      expect(overlayIframe?.getAttribute("src")).toContain("teamTaskMode=create");
      expect(overlayIframe?.getAttribute("src")).not.toContain("teamTaskId=");

      // No restore button
      expect(overlay!.querySelector(".emap-branch-restore-button")).toBeNull();

      // Double-click overlay header to restore
      const overlayHeader = overlay!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      fireEvent.doubleClick(overlayHeader!);

      expect(document.querySelector(".emap-maximized-branch-shell")).toBeNull();
      expect(container.querySelector(".execution-map-scroll .emap-agent-branch-shell")).toBeTruthy();
    });

    it("double-clicks a text node inside Task creation branch header to maximize and restore", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/v1/team/tasks"));

      fireEvent.click(screen.getByRole("button", { name: "创建 Task" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      await waitFor(() => {
        expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
      });

      const header = container.querySelector(".execution-map-scroll .agent-playground-branch-head") as HTMLElement;
      expect(header).toBeTruthy();

      const titleEl = header.querySelector(".agent-playground-branch-title strong") as HTMLElement | null;
      const titleTextNode = titleEl?.firstChild;
      expect(titleTextNode?.nodeType).toBe(Node.TEXT_NODE);

      fireEvent.doubleClick(titleTextNode as Text);

      const overlay = document.querySelector(".emap-maximized-branch-shell") as HTMLElement | null;
      expect(overlay).toBeTruthy();

      const overlayHeader = overlay!.querySelector(".agent-playground-branch-head") as HTMLElement;
      expect(overlayHeader).toBeTruthy();

      const overlayTitleEl = overlayHeader.querySelector(".agent-playground-branch-title strong") as HTMLElement | null;
      const overlayTitleTextNode = overlayTitleEl?.firstChild;
      expect(overlayTitleTextNode?.nodeType).toBe(Node.TEXT_NODE);

      fireEvent.doubleClick(overlayTitleTextNode as Text);

      expect(document.querySelector(".emap-maximized-branch-shell")).toBeNull();
      expect(container.querySelector(".execution-map-scroll .emap-agent-branch-shell")).toBeTruthy();
    });

    it("double-clicks leader chat header to maximize and restore", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "对话 Leader" }));

      await waitFor(() => {
        expect(container.querySelector(".emap-task-child-branch-shell iframe")).toBeTruthy();
      });

      const shell = container.querySelector(".emap-task-child-branch-shell") as HTMLElement | null;
      expect(shell).toBeTruthy();
      const header = shell!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      expect(header).toBeTruthy();

      // Double-click header to maximize
      fireEvent.doubleClick(header!);

      const overlay = document.querySelector(".emap-maximized-branch-shell") as HTMLElement | null;
      expect(overlay).toBeTruthy();

      // Verify iframe has teamTaskMode=edit
      const overlayIframe = overlay!.querySelector("iframe") as HTMLIFrameElement | null;
      expect(overlayIframe?.getAttribute("src")).toContain("teamTaskMode=edit");
      expect(overlayIframe?.getAttribute("src")).toContain("teamTaskId=");

      // No restore button
      expect(overlay!.querySelector(".emap-branch-restore-button")).toBeNull();

      // Double-click overlay header to restore
      const overlayHeader = overlay!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
      fireEvent.doubleClick(overlayHeader!);

      expect(document.querySelector(".emap-maximized-branch-shell")).toBeNull();
    });
  });
});
