import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "../app/App";
import { resetMockTeamApiState } from "../fixtures/team-fixtures";
import { getAtlas, getAtlasNodes, firePointer } from "./app-dom-test-utils";

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

  describe("atlas drag", () => {
    it("drags an agent card by world coordinates without opening the embedded branch", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(screen.getByRole("button", { name: "放大" }));

      const atlas = getAtlas(container);
      const agentNode = within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }) as HTMLElement;
      const initialLeft = Number.parseFloat(agentNode.style.left);
      const initialTop = Number.parseFloat(agentNode.style.top);

      firePointer(agentNode, "pointerdown", { pointerId: 7, clientX: 100, clientY: 100 });
      firePointer(agentNode, "pointermove", { pointerId: 7, clientX: 155, clientY: 133 });
      firePointer(agentNode, "pointerup", { pointerId: 7, clientX: 155, clientY: 133, buttons: 0 });
      fireEvent.click(agentNode);

      expect(Number.parseFloat(agentNode.style.left)).toBeCloseTo(initialLeft + 50, 4);
      expect(Number.parseFloat(agentNode.style.top)).toBeCloseTo(initialTop + 30, 4);
      expect(atlas).toHaveAttribute("data-agent-focus", "none");
      expect(container.querySelector(".agent-playground-branch")).toBeNull();
    });

    it("starts card dragging from the visible ID copy controls", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const atlasNodes = getAtlasNodes(container);
      const agentNode = within(atlasNodes).getByRole("button", { name: "主 Agent" }) as HTMLElement;
      const taskNode = await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      const agentIdCopy = within(agentNode).getByRole("button", { name: /复制 Agent ID main/ });
      const taskIdCopy = within(taskNode).getByRole("button", { name: /复制 Task ID task_research_medtrum/ });
      const initialAgentLeft = Number.parseFloat(agentNode.style.left);
      const initialAgentTop = Number.parseFloat(agentNode.style.top);
      const initialTaskLeft = Number.parseFloat(taskNode.style.left);
      const initialTaskTop = Number.parseFloat(taskNode.style.top);

      firePointer(agentIdCopy, "pointerdown", { pointerId: 41, clientX: 120, clientY: 100 });
      firePointer(agentIdCopy, "pointermove", { pointerId: 41, clientX: 160, clientY: 126 });
      firePointer(agentIdCopy, "pointerup", { pointerId: 41, clientX: 160, clientY: 126, buttons: 0 });

      firePointer(taskIdCopy, "pointerdown", { pointerId: 42, clientX: 260, clientY: 260 });
      firePointer(taskIdCopy, "pointermove", { pointerId: 42, clientX: 306, clientY: 290 });
      firePointer(taskIdCopy, "pointerup", { pointerId: 42, clientX: 306, clientY: 290, buttons: 0 });

      expect(Number.parseFloat(agentNode.style.left)).toBeCloseTo(initialAgentLeft + 40, 4);
      expect(Number.parseFloat(agentNode.style.top)).toBeCloseTo(initialAgentTop + 26, 4);
      expect(Number.parseFloat(taskNode.style.left)).toBeCloseTo(initialTaskLeft + 46, 4);
      expect(Number.parseFloat(taskNode.style.top)).toBeCloseTo(initialTaskTop + 30, 4);
      expect(container.querySelector(".agent-playground-branch")).toBeNull();
      expect(container.querySelector(".task-action-branch")).toBeNull();
    });

    it("box-selects atlas nodes and drags the selected set together", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const atlas = getAtlas(container);
      const atlasNodes = getAtlasNodes(container);
      const agentNode = within(atlasNodes).getByRole("button", { name: "主 Agent" }) as HTMLElement;
      const taskNode = await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      const initialAgentLeft = Number.parseFloat(agentNode.style.left);
      const initialAgentTop = Number.parseFloat(agentNode.style.top);
      const initialTaskLeft = Number.parseFloat(taskNode.style.left);
      const initialTaskTop = Number.parseFloat(taskNode.style.top);

      firePointer(atlas, "pointerdown", { pointerId: 31, clientX: 220, clientY: 0, shiftKey: true });
      firePointer(atlas, "pointermove", { pointerId: 31, clientX: 720, clientY: 420, shiftKey: true });
      firePointer(atlas, "pointerup", { pointerId: 31, clientX: 720, clientY: 420, buttons: 0, shiftKey: true });

      expect(agentNode).toHaveClass("is-atlas-selected");
      expect(taskNode).toHaveClass("is-atlas-selected");

      firePointer(agentNode, "pointerdown", { pointerId: 32, clientX: 380, clientY: 40 });
      firePointer(agentNode, "pointermove", { pointerId: 32, clientX: 440, clientY: 80 });
      firePointer(agentNode, "pointerup", { pointerId: 32, clientX: 440, clientY: 80, buttons: 0 });

      expect(Number.parseFloat(agentNode.style.left)).toBeCloseTo(initialAgentLeft + 60, 4);
      expect(Number.parseFloat(agentNode.style.top)).toBeCloseTo(initialAgentTop + 40, 4);
      expect(Number.parseFloat(taskNode.style.left)).toBeCloseTo(initialTaskLeft + 60, 4);
      expect(Number.parseFloat(taskNode.style.top)).toBeCloseTo(initialTaskTop + 40, 4);
      expect(container.querySelector(".agent-playground-branch")).toBeNull();
    });

    it("allows a later click to expand an agent branch after a drag gesture", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const agentNode = within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }) as HTMLElement;

      firePointer(agentNode, "pointerdown", { pointerId: 9, clientX: 100, clientY: 100 });
      firePointer(agentNode, "pointermove", { pointerId: 9, clientX: 150, clientY: 130 });
      firePointer(agentNode, "pointerup", { pointerId: 9, clientX: 150, clientY: 130, buttons: 0 });
      await new Promise((resolve) => setTimeout(resolve, 0));

      fireEvent.click(agentNode);

      expect(getAtlas(container)).toHaveAttribute("data-agent-focus", "main");
      expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
      expect(within(container.querySelector(".agent-playground-branch") as HTMLElement).getByText("主 Agent")).toBeInTheDocument();
    });
  });
});
