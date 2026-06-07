import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import { getAtlas, getAtlasNodes, getAtlasStage, firePointer } from "./app-dom-test-utils";

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

  describe("mock branches", () => {
    it("renders the add agent entry in mock mode", () => {
      render(<App />);
      expect(screen.getByRole("button", { name: "添加 Agent" })).toBeInTheDocument();
    });

    it("adds a unique mock agent card to the atlas node layer", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      const mainOption = await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ });

      fireEvent.click(mainOption);

      const atlasNodes = getAtlasNodes(container);
      const agentNode = atlasNodes.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
      expect(agentNode).toBeTruthy();
      expect(agentNode!).toHaveAttribute("aria-label", "主 Agent");
      expect(within(agentNode!).getByText("主 Agent")).toBeInTheDocument();
      expect(within(agentNode!).getByRole("button", { name: "复制 Agent ID main" })).toBeInTheDocument();
      expect(container.querySelector(".agent-canvas-board")).toBeNull();
      expect(screen.queryByRole("button", { name: /主 Agent[\s\S]*已加入/ })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      const joinedOption = screen.getByRole("button", { name: /主 Agent[\s\S]*已加入/ });
      expect(joinedOption).toBeDisabled();

      fireEvent.click(joinedOption);
      expect(atlasNodes.querySelectorAll('.emap-agent-node[data-agent-id="main"]')).toHaveLength(1);
    });

    it("renders mock agent run states on atlas cards", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(screen.getByRole("button", { name: /搜索 Agent[\s\S]*search/ }));

      const mainNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
      const searchNode = container.querySelector('.emap-agent-node[data-agent-id="search"]') as HTMLElement | null;
      expect(mainNode).toBeTruthy();
      expect(searchNode).toBeTruthy();

      await waitFor(() => {
        expect(mainNode!).toHaveAttribute("data-agent-run-state", "idle");
        expect(searchNode!).toHaveAttribute("data-agent-run-state", "busy");
      });
      expect(within(mainNode!).getByText("空闲")).toBeInTheDocument();
      expect(within(searchNode!).getByText("运行中")).toBeInTheDocument();
    });

    it("expands an agent card into an embedded playground branch and keeps the atlas visible", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(screen.getByRole("button", { name: /搜索 Agent[\s\S]*search/ }));

      const atlas = getAtlas(container);
      const stage = getAtlasStage(container);
      const initialTransform = stage.style.transform;
      expect(atlas).toHaveAttribute("data-agent-focus", "none");
      expect(atlas.querySelectorAll(".emap-agent-node")).toHaveLength(2);

      fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));

      expect(atlas).toHaveAttribute("data-agent-focus", "main");
      expect(atlas).toHaveAttribute("data-interaction-mode", "free");
      expect(stage.style.transform).toBe(initialTransform);
      expect(stage).not.toHaveAttribute("aria-hidden", "true");
      expect(container.querySelector(".agent-focus-workspace")).toBeNull();
      expect(screen.queryByText("执行运行")).toBeNull();
      expect(screen.getByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "搜索 Agent" })).toBeInTheDocument();
      const mainNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
      const searchNode = container.querySelector('.emap-agent-node[data-agent-id="search"]') as HTMLElement | null;
      const branchShell = container.querySelector(".emap-agent-branch-shell") as HTMLElement | null;
      expect(mainNode).toBeTruthy();
      expect(searchNode).toBeTruthy();
      expect(branchShell).toBeTruthy();
      expect(Number.parseFloat(branchShell!.style.left)).toBeCloseTo(
        Number.parseFloat(mainNode!.style.left) + Number.parseFloat(mainNode!.style.width) + 48,
        4,
      );
      expect(Number.parseFloat(branchShell!.style.left)).toBeLessThan(
        Number.parseFloat(searchNode!.style.left) + Number.parseFloat(searchNode!.style.width),
      );

      const branch = container.querySelector(".agent-playground-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      expect(within(branch!).getByText("主 Agent")).toBeInTheDocument();
      expect(within(branch!).getByText("main")).toBeInTheDocument();
      const iframe = branch!.querySelector("iframe") as HTMLIFrameElement | null;
      expect(iframe).toBeTruthy();
      expect(iframe).toHaveAttribute("title", "主 Agent 主项目对话");
      expect(iframe).toHaveAttribute("allow", "clipboard-write; clipboard-read");
      expect(iframe?.getAttribute("src")).toContain("/playground?view=chat&agentId=main");
      expect(iframe?.getAttribute("src")).toContain("embed=team-console");
      expect(iframe?.getAttribute("src")).toContain("embedMode=mini");
      expect(iframe?.getAttribute("src")).not.toContain("teamTaskMode=create");
      expect(iframe?.getAttribute("src")).not.toContain("127.0.0.1");
    });

    it("clicking the expanded agent card collapses the embedded branch", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      const agentNode = within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" });

      fireEvent.click(agentNode);
      expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
      fireEvent.click(agentNode);

      expect(getAtlas(container)).toHaveAttribute("data-agent-focus", "none");
      expect(container.querySelector(".agent-playground-branch")).toBeNull();
    });

    it("opens a Task card into an action menu branch", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      const branchShell = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
      expect(branch).toBeTruthy();
      expect(branchShell).toBeTruthy();
      expect(branchShell!.style.width).toBe("max-content");
      expect(branchShell!.style.height).toBe("auto");
      expect(branchShell!.style.width).not.toBe("820px");
      expect(branchShell!.style.height).not.toBe("620px");
      expect(within(branch!).getByText("Task 操作")).toBeInTheDocument();
      expect(within(branch!).getByText("调查 Medtrum 云资产")).toBeInTheDocument();
      expect(within(branch!).getByText("task_research_medtrum")).toBeInTheDocument();
      expect(within(branch!).getByRole("button", { name: "运行" })).toBeEnabled();
      expect(within(branch!).getByRole("button", { name: "编辑" })).toBeInTheDocument();
      expect(within(branch!).getByRole("button", { name: "对话 Leader" })).toBeInTheDocument();
      expect(within(branch!).getByRole("button", { name: "删除" })).toBeInTheDocument();
      expect(branch!.querySelector("iframe")).toBeNull();
    });

    it("collapses the Task action branch when the same Task is clicked again", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);
      expect(container.querySelector(".task-action-branch")).toBeTruthy();

      fireEvent.click(taskNode);

      expect(container.querySelector(".task-action-branch")).toBeNull();
    });

    it("keeps a Task action branch open when an Agent branch opens", async () => {
      const { container } = render(<App />);

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      expect(container.querySelector(".task-action-branch")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));

      expect(container.querySelector(".task-action-branch")).toBeTruthy();
      expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
    });

    it("keeps an Agent chat branch open when a Task run observer opens", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));
      expect(container.querySelector(".agent-playground-branch")).toBeTruthy();

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
        expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]')).toBeTruthy();
      });
    });

    it("keeps multiple Task action branches open when another Task is clicked", async () => {
      const firstTask = mockTeamTasks[0]!;
      const secondTask = {
        ...firstTask,
        taskId: "task_review_medtrum",
        title: "复核 Medtrum 证据",
        leaderAgentId: "search",
        workUnit: {
          ...firstTask.workUnit,
          title: "复核 Medtrum 证据",
        },
      };
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
              { agentId: "search", name: "搜索 Agent", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          return new Response(JSON.stringify({ tasks: [firstTask, secondTask] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      await waitFor(() => {
        const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
        expect(branch).toBeTruthy();
        expect(within(branch!).getByText("task_research_medtrum")).toBeInTheDocument();
      });

      fireEvent.click(getAtlasNodes(container).querySelector('[data-task-id="task_review_medtrum"]') as HTMLElement);

      const branches = Array.from(container.querySelectorAll(".task-action-branch")) as HTMLElement[];
      expect(branches).toHaveLength(2);
      expect(branches.some((branch) => branch.textContent?.includes("调查 Medtrum 云资产"))).toBe(true);
      expect(branches.some((branch) => branch.textContent?.includes("task_research_medtrum"))).toBe(true);
      expect(branches.some((branch) => branch.textContent?.includes("复核 Medtrum 证据"))).toBe(true);
      expect(branches.some((branch) => branch.textContent?.includes("task_review_medtrum"))).toBe(true);
      for (const branch of branches) {
        expect(branch.querySelector("iframe")).toBeNull();
      }

      fireEvent.click(getAtlasNodes(container).querySelector('[data-task-id="task_review_medtrum"]') as HTMLElement);

      const remainingBranches = Array.from(container.querySelectorAll(".task-action-branch")) as HTMLElement[];
      expect(remainingBranches).toHaveLength(1);
      expect(remainingBranches[0]).toHaveTextContent("调查 Medtrum 云资产");
      expect(remainingBranches[0]).not.toHaveTextContent("复核 Medtrum 证据");
    });

    it("keeps every open Task action branch draggable after another Task is focused", async () => {
      const firstTask = mockTeamTasks[0]!;
      const secondTask = {
        ...firstTask,
        taskId: "task_review_medtrum",
        title: "复核 Medtrum 证据",
        leaderAgentId: "search",
        workUnit: {
          ...firstTask.workUnit,
          title: "复核 Medtrum 证据",
        },
      };
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
              { agentId: "search", name: "搜索 Agent", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          return new Response(JSON.stringify({ tasks: [firstTask, secondTask] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.click(getAtlasNodes(container).querySelector('[data-task-id="task_review_medtrum"]') as HTMLElement);

      const menuShells = await waitFor(() => {
        const shells = Array.from(container.querySelectorAll(".emap-task-branch-shell")) as HTMLElement[];
        expect(shells).toHaveLength(2);
        return shells;
      });
      const firstMenuShell = menuShells.find((shell) => shell.textContent?.includes("调查 Medtrum 云资产"));
      const secondMenuShell = menuShells.find((shell) => shell.textContent?.includes("复核 Medtrum 证据"));
      expect(firstMenuShell).toBeTruthy();
      expect(secondMenuShell).toBeTruthy();

      const firstLeftBefore = Number.parseFloat(firstMenuShell!.style.left);
      const firstTopBefore = Number.parseFloat(firstMenuShell!.style.top);
      const firstHeader = firstMenuShell!.querySelector(".task-leader-branch-head") as HTMLElement | null;
      expect(firstHeader).toBeTruthy();
      firePointer(firstHeader!, "pointerdown", { pointerId: 301, clientX: 420, clientY: 220 });
      firePointer(firstHeader!, "pointermove", { pointerId: 301, clientX: 485, clientY: 255 });
      firePointer(firstHeader!, "pointerup", { pointerId: 301, clientX: 485, clientY: 255, buttons: 0 });

      expect(Number.parseFloat(firstMenuShell!.style.left)).toBeCloseTo(firstLeftBefore + 65, 4);
      expect(Number.parseFloat(firstMenuShell!.style.top)).toBeCloseTo(firstTopBefore + 35, 4);

      const secondLeftBefore = Number.parseFloat(secondMenuShell!.style.left);
      const secondTopBefore = Number.parseFloat(secondMenuShell!.style.top);
      const secondHeader = secondMenuShell!.querySelector(".task-leader-branch-head") as HTMLElement | null;
      expect(secondHeader).toBeTruthy();
      firePointer(secondHeader!, "pointerdown", { pointerId: 302, clientX: 520, clientY: 250 });
      firePointer(secondHeader!, "pointermove", { pointerId: 302, clientX: 580, clientY: 295 });
      firePointer(secondHeader!, "pointerup", { pointerId: 302, clientX: 580, clientY: 295, buttons: 0 });

      expect(Number.parseFloat(secondMenuShell!.style.left)).toBeCloseTo(secondLeftBefore + 60, 4);
      expect(Number.parseFloat(secondMenuShell!.style.top)).toBeCloseTo(secondTopBefore + 45, 4);
    });
  });
});
