import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { TeamAttemptMetadata, TeamRunState } from "../api/team-types";
import { firePointer, getAtlasNodes } from "./app-dom-test-utils";
import { cloneTaskFixture } from "./team-task-test-fixtures";
import { makeLegacyAttemptFixture, makeLiveTaskRunFixture } from "./team-run-test-fixtures";

describe("App run observer file detail", () => {
  beforeEach(() => {
    resetMockTeamApiState();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function byTaskRunsResponse(runsByTaskId: Record<string, TeamRunState[]>): Response {
    return new Response(JSON.stringify({ runsByTaskId }), { status: 200 });
  }

    it("renders legacy Live API attempt files while roleProcesses is missing", async () => {
      const task = cloneTaskFixture();
      const taskRun = makeLiveTaskRunFixture(task);
      const attemptId = "legacy-attempt-1";
      const workerOutputRef = `tasks/${task.taskId}/attempts/${attemptId}/worker-output-legacy.md`;
      const checkerVerdictRef = `tasks/${task.taskId}/attempts/${attemptId}/checker-verdict-legacy.json`;
      const resultRef = `tasks/${task.taskId}/attempts/${attemptId}/accepted-result-legacy.md`;
      const legacyAttempt: TeamAttemptMetadata = {
        ...makeLegacyAttemptFixture(task),
        worker: [{
          outputIndex: 1,
          outputRef: workerOutputRef,
          runtimeContext: {
            requestedProfileId: task.workUnit.workerAgentId,
            resolvedProfileId: task.workUnit.workerAgentId,
            fallbackUsed: false,
            browserId: null,
            browserScope: `team-task:${task.taskId}:worker`,
          },
        }],
        checker: [{
          verdict: "pass",
          reason: "legacy checker accepted",
          revisionIndex: 1,
          resultContentRef: null,
          recordRef: checkerVerdictRef,
          feedbackRef: null,
          runtimeContext: {
            requestedProfileId: task.workUnit.checkerAgentId,
            resolvedProfileId: task.workUnit.checkerAgentId,
            fallbackUsed: false,
            browserId: null,
            browserScope: `team-task:${task.taskId}:checker`,
          },
        }],
        resultRef,
        files: ["worker-output-legacy.md", "checker-verdict-legacy.json", "accepted-result-legacy.md"],
      };
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(globalThis.navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
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
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({ [task.taskId]: [taskRun] });
        if (url === `/v1/team/tasks/${task.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [taskRun] }), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}`) {
          return new Response(JSON.stringify(taskRun), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}/tasks/${task.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [legacyAttempt] }), { status: 200 });
        }
        if (url.endsWith("/files/worker-output-legacy.md")) {
          return new Response("# Legacy worker output\n\nLive API old attempt file.", { status: 200 });
        }
        if (url.endsWith("/files/checker-verdict-legacy.json")) {
          return new Response(JSON.stringify({ verdict: "pass", reason: "legacy checker accepted" }), { status: 200 });
        }
        if (url.endsWith("/files/accepted-result-legacy.md")) {
          return new Response("# Legacy accepted result", { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });
      const workerProcessNode = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
      const checkerProcessNode = container.querySelector('.emap-observer-process-node[data-process-role="checker"]') as HTMLElement | null;
      expect(workerProcessNode).toHaveTextContent("等待过程数据");
      expect(checkerProcessNode).toHaveTextContent("等待过程数据");

      const workerFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      expect(within(workerFileRow).getByText("worker-output-legacy.md")).toBeInTheDocument();
      expect(container.querySelector('.emap-observer-file-row[data-file-kind="checker"]')).toHaveTextContent("checker-verdict-legacy.json");
      expect(container.querySelector('.emap-observer-file-row[data-file-kind="result"]')).toHaveTextContent("accepted-result-legacy.md");

      fireEvent.click(workerFileRow);
      const detailNode = await waitFor(() => {
        const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
        expect(detail).toBeTruthy();
        return detail!;
      });
      expect(detailNode).toHaveTextContent("Legacy worker output");
      const expectedDownloadUrl = `/v1/team/task-runs/${encodeURIComponent(taskRun.runId)}/tasks/${encodeURIComponent(task.taskId)}/attempts/${encodeURIComponent(attemptId)}/files/worker-output-legacy.md`;
      expect(within(detailNode).getByRole("link", { name: "下载文件 worker-output-legacy.md" }))
        .toHaveAttribute("href", expectedDownloadUrl);
      expect(within(detailNode).getByRole("link", { name: "下载文件 worker-output-legacy.md" }))
        .toHaveAttribute("download", "worker-output-legacy.md");

      const referenceCopyButton = within(detailNode).getByRole("button", { name: `复制文件引用路径 ${workerOutputRef}` });
      expect(referenceCopyButton).toHaveClass("emap-node-id-copy");
      expect(referenceCopyButton).toHaveTextContent(workerOutputRef);
      fireEvent.click(referenceCopyButton);
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(workerOutputRef);
      });
      await waitFor(() => {
        expect(referenceCopyButton).toHaveClass("is-copied");
        expect(referenceCopyButton).toHaveTextContent(workerOutputRef);
        expect(referenceCopyButton).toHaveTextContent("已复制");
      });
    });

    it("pretty-prints structured JSON from markdown-named accepted result files", async () => {
      const task = cloneTaskFixture();
      const taskRun = makeLiveTaskRunFixture(task, "run_json_md_result");
      const attemptId = "attempt_json_md_result";
      const resultRef = `tasks/${task.taskId}/attempts/${attemptId}/accepted-result.md`;
      const attempt: TeamAttemptMetadata = {
        ...makeLegacyAttemptFixture(task),
        attemptId,
        resultRef,
        files: ["accepted-result.md"],
      };
      taskRun.taskStates[task.taskId] = {
        ...taskRun.taskStates[task.taskId]!,
        activeAttemptId: attemptId,
        resultRef,
      };
      const resultContent = JSON.stringify({
        platform: "Reddit",
        sentiment: "mixed",
        sources: [{ url: "https://www.reddit.com/r/LocalLLaMA/" }],
      });

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
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({ [task.taskId]: [taskRun] });
        if (url === `/v1/team/tasks/${task.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [taskRun] }), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}`) {
          return new Response(JSON.stringify(taskRun), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}/tasks/${task.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [attempt] }), { status: 200 });
        }
        if (url.endsWith("/files/accepted-result.md")) {
          return new Response(resultContent, { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: task.title });
      fireEvent.click(taskNode);

      const branch = await waitFor(() => {
        const node = container.querySelector(".task-action-branch") as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      const runSummary = await waitFor(() => {
        const node = branch.querySelector(".task-run-summary") as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      fireEvent.click(runSummary);

      const resultFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="result"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      fireEvent.click(resultFileRow);

      const detailNode = await waitFor(() => {
        const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
        expect(detail).toBeTruthy();
        return detail!;
      });
      const jsonPre = detailNode.querySelector('pre[data-file-format="json"]');
      expect(jsonPre).toBeTruthy();
      expect(jsonPre).toHaveTextContent('"platform": "Reddit"');
      expect(jsonPre).toHaveTextContent('"url": "https://www.reddit.com/r/LocalLLaMA/"');
      expect(detailNode.querySelector('[data-file-format="markdown"]')).toBeNull();
    });

    it("renders HTML-like content as text in file detail, not as injected HTML", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });

      const workerFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      fireEvent.click(workerFileRow);

      const detailNode = await waitFor(() => {
        const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
        expect(detail).toBeTruthy();
        return detail!;
      });

      expect(detailNode).toHaveTextContent("<script>alert(1)</script>");
      expect(detailNode.querySelector("script")).toBeNull();
      expect(detailNode.querySelector("details")).toBeNull();
    });

    it("shows run status in the menu summary and keeps compact file index nodes", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });

      expect(runSummary).toHaveTextContent("阶段");
      expect(runSummary).toHaveTextContent("succeeded");
      expect(runSummary).toHaveTextContent(/耗时(?:0ms|4秒)/);
      expect(runSummary).toHaveTextContent("Attempts");
      expect(runSummary).toHaveTextContent("已通过");
      expect(container.querySelector(".emap-observer-status-node")).toBeNull();

      // File rows should NOT show checker reason / verdict summary text
      const checkerFileRow = container.querySelector('.emap-observer-file-row[data-file-kind="checker"]') as HTMLElement | null;
      expect(checkerFileRow).toBeTruthy();
      expect(checkerFileRow!.textContent).not.toContain("Mock checker accepted the worker output.");
      expect(checkerFileRow!.querySelector(".emap-observer-file-summary")).toBeNull();
      expect(checkerFileRow!.querySelector(".emap-observer-file-runtime")).toBeNull();

      // File rows should show agent name resolved from agentsById
      const workerFileRow = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
      expect(workerFileRow).toBeTruthy();
      expect(workerFileRow!.textContent).toContain("搜索 Agent");

      const checkerResolvedAgent = checkerFileRow!.textContent ?? "";
      expect(checkerResolvedAgent).toContain("主 Agent");

      // Result file shows agent role fallback
      const resultFileRow = container.querySelector('.emap-observer-file-row[data-file-kind="result"]') as HTMLElement | null;
      expect(resultFileRow).toBeTruthy();
      expect(resultFileRow!.textContent).toContain("accepted-result.md");

      // File rows should still show file name and path
      expect(within(workerFileRow!).getByText("worker-output-001.md")).toBeInTheDocument();
      expect(workerFileRow!.querySelector(".emap-observer-file-row-path")).toBeTruthy();
    });

    it("renders file detail with resize handle for observer file rows", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });

      const checkerFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="checker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      fireEvent.click(checkerFileRow);

      const detailNode = await waitFor(() => {
        const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
        expect(detail).toBeTruthy();
        return detail!;
      });

      // JSON detail still shows pretty-printed content
      expect(within(detailNode).getByText(/"verdict": "pass"/)).toBeInTheDocument();

      // File detail shell must have a resize handle
      const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
      const detailShell = allShells().find((s) => s.querySelector(".emap-observer-file-detail-node")) as HTMLElement | undefined;
      expect(detailShell).toBeTruthy();
      const resizeHandle = detailShell!.querySelector(".emap-panel-resize-handle") as HTMLElement | null;
      expect(resizeHandle).toBeTruthy();

      // Drag resize handle to increase size
      const initialWidth = Number.parseFloat(detailShell!.style.width);
      const initialHeight = Number.parseFloat(detailShell!.style.height);

      firePointer(resizeHandle!, "pointerdown", { pointerId: 61, clientX: 800, clientY: 500 });
      firePointer(resizeHandle!, "pointermove", { pointerId: 61, clientX: 900, clientY: 560 });
      firePointer(resizeHandle!, "pointerup", { pointerId: 61, clientX: 900, clientY: 560, buttons: 0 });

      expect(Number.parseFloat(detailShell!.style.width)).toBeCloseTo(initialWidth + 100, 4);
      expect(Number.parseFloat(detailShell!.style.height)).toBeCloseTo(initialHeight + 60, 4);
    });
});
