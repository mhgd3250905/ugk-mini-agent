import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import { getAtlasNodes, getAtlasStage } from "./app-dom-test-utils";

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

  describe("canvas state", () => {
    it("restores open live canvas branches and viewport after a browser reload", async () => {
      const liveTask = mockTeamTasks[0]!;
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
          return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
        }
        if (url === "/v1/team/task-connections") {
          return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${liveTask.taskId}/runs`) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const first = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      fireEvent.click(await screen.findByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(within(getAtlasNodes(first.container)).getByRole("button", { name: "主 Agent" }));
      fireEvent.click(await within(getAtlasNodes(first.container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.click(screen.getByRole("button", { name: "放大" }));

      expect(first.container.querySelector(".agent-playground-branch")).toBeTruthy();
      expect(first.container.querySelector(".task-action-branch")).toBeTruthy();
      const transformBefore = getAtlasStage(first.container).style.transform;
      first.unmount();

      const second = render(<App />);

      await waitFor(() => {
        expect(second.container.querySelector(".agent-playground-branch")).toBeTruthy();
        expect(second.container.querySelector(".task-action-branch")).toBeTruthy();
        expect(getAtlasStage(second.container).style.transform).toBe(transformBefore);
      });
    });

    it("normalizes legacy stored canvas zoom to the nearest readable level", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        }
        if (url === "/v1/team/task-connections") {
          return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      window.localStorage.setItem("ugk-team-console:canvas-ui-state:v1", JSON.stringify({
        schemaVersion: 1,
        dataSource: "live",
        liveRunMode: "workspace",
        viewport: { x: 10.25, y: 20.25, scale: 0.91 },
      }));

      const { container } = render(<App />);

      await waitFor(() => {
        expect(screen.getByText("90%")).toBeInTheDocument();
        expect(getAtlasStage(container).style.transform).toBe("translate(10px, 20px) scale(0.9)");
      });
    });
  });
});
