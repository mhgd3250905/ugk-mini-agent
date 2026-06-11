import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import type { TeamCanvasTask, TeamDiscoveryChannelSet } from "../api/team-types";
import {
  MOCK_AGENTS,
  mockDiscoveryGeneratedTasks,
  mockDiscoveryRootTask,
  mockTeamTasks,
  resetMockTeamApiState,
} from "../fixtures/team-fixtures";
import { getAtlasNodes } from "./app-dom-test-utils";
import {
  byTaskRunsResponse,
  canvasTaskRun,
  generatedSummary,
  getGeneratedCard,
  openMockDiscoverySubcanvas,
  revealStaleGeneratedTasks,
  rootSummaryResponse,
} from "./app-live-data-helpers";

describe("App Discovery subcanvas live data", () => {
  beforeEach(() => {
    resetMockTeamApiState();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens the mock Discovery generated catalog from the root Task menu without root child cards", async () => {
    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });

    fireEvent.click(discoveryNode);
    const toggle = await screen.findByRole("button", { name: "Discovery 子画布" });
    fireEvent.click(toggle);

    const panel = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
    expect(panel).toBeTruthy();
    expect(panel!.querySelectorAll("[data-generated-task-id]")).toHaveLength(1);

    const vultrCard = panel!.querySelector('[data-generated-task-id="task_generated_vultr"]') as HTMLElement | null;
    const hetznerCard = panel!.querySelector('[data-generated-task-id="task_generated_hetzner"]') as HTMLElement | null;
    expect(vultrCard).toHaveAttribute("data-generated-item-status", "active");
    expect(vultrCard).toHaveAttribute("data-generated-workunit-mode", "managed");
    expect(vultrCard).toHaveAttribute("data-generated-run-status", "none");
    expect(hetznerCard).toBeNull();
    expect(panel).toHaveTextContent("1 stale hidden");
    const selectAllActive = within(panel!).getByRole("button", { name: `全选 ${mockDiscoveryRootTask.title} 有效 generated Task` });
    fireEvent.click(selectAllActive);
    expect(selectAllActive).toHaveAttribute("aria-pressed", "true");
    expect(panel).toHaveTextContent("selected 1/1");
    expect(vultrCard).toHaveAttribute("data-generated-channel-selected", "true");
    fireEvent.click(within(panel!).getByRole("button", { name: "显示 1 个旧项" }));
    const revealedHetznerCard = panel!.querySelector('[data-generated-task-id="task_generated_hetzner"]') as HTMLElement | null;
    expect(revealedHetznerCard).toHaveAttribute("data-generated-item-status", "stale");
    expect(revealedHetznerCard).toHaveAttribute("data-generated-workunit-mode", "customized");
    expect(revealedHetznerCard).toHaveAttribute("data-generated-run-status", "none");
    expect(revealedHetznerCard).toHaveAttribute("data-generated-channel-selected", "false");
    const clearAllActive = within(panel!).getByRole("button", { name: `取消全选 ${mockDiscoveryRootTask.title} 有效 generated Task` });
    fireEvent.click(clearAllActive);
    expect(vultrCard).toHaveAttribute("data-generated-channel-selected", "false");
    expect(within(vultrCard!).getByText("核查 Vultr 公开证据")).toBeInTheDocument();
    expect(within(revealedHetznerCard!).getByText("核查 Hetzner 公开证据")).toBeInTheDocument();
    const vultrMenuButton = within(vultrCard!).getByRole("button", { name: "核查 Vultr 公开证据 操作菜单" });
    expect(vultrMenuButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(vultrMenuButton);
    const openVultrCard = await waitFor(() => {
      const card = getGeneratedCard(panel!, "task_generated_vultr");
      expect(within(card).getByRole("button", { name: "核查 Vultr 公开证据 操作菜单" })).toHaveAttribute("aria-expanded", "true");
      return card;
    });
    const vultrActionMenu = openVultrCard.querySelector(".discovery-generated-card-actions");
    expect(vultrActionMenu).toHaveAttribute("role", "menu");
    expect(within(vultrActionMenu as HTMLElement).queryByRole("menuitem", { name: "运行记录" })).toBeNull();
    fireEvent.keyDown(openVultrCard, { key: "Escape" });
    await waitFor(() => {
      const card = getGeneratedCard(panel!, "task_generated_vultr");
      expect(within(card).getByRole("button", { name: "核查 Vultr 公开证据 操作菜单" })).toHaveAttribute("aria-expanded", "false");
    });
    expect(panel!.querySelector('[data-generated-task-id="task_generated_archived_ovh"]')).toBeNull();
    expect(within(atlas).queryByRole("button", { name: "核查 Vultr 公开证据" })).toBeNull();
    expect(within(atlas).queryByRole("button", { name: "核查 Hetzner 公开证据" })).toBeNull();

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Discovery 子画布" })).toBeInTheDocument();
  });

  it("opens and closes generated Task run history from the Discovery subcanvas card", async () => {
    const { container } = render(<App />);
    const { panel } = await openMockDiscoverySubcanvas(container);
    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");

    fireEvent.click(vultrCard);
    const historyPanel = await screen.findByRole("region", { name: "核查 Vultr 公开证据 运行记录" });
    expect(screen.queryByRole("complementary", { name: "核查 Vultr 公开证据 运行记录" })).toBeNull();
    expect(within(historyPanel).getByText("task_generated_vultr")).toBeInTheDocument();
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
    expect(getGeneratedCard(panel, "task_generated_vultr")).toBeTruthy();
    const subcanvasShell = panel.closest(".emap-task-child-branch-shell") as HTMLElement | null;
    const historyShell = historyPanel.closest(".emap-task-child-branch-shell") as HTMLElement | null;
    expect(subcanvasShell).toBeTruthy();
    expect(historyShell).toBeTruthy();
    expect(historyShell).toHaveAttribute("data-panel-source-id", subcanvasShell!.dataset.panelId);
    expect(historyShell!.dataset.panelId).toMatch(/^generated-run-history-/);
    expect(vultrCard).toHaveAttribute("data-generated-run-history-open", "true");
    expect(vultrCard).toHaveClass("is-history-open");

    fireEvent.click(within(vultrCard).getByRole("button", { name: "核查 Vultr 公开证据 操作菜单" }));
    expect(within(vultrCard).getByRole("button", { name: "核查 Vultr 公开证据 操作菜单" })).toHaveAttribute("aria-expanded", "true");
    expect(within(vultrCard).queryByRole("menuitem", { name: "运行记录" })).toBeNull();
    fireEvent.pointerDown(document.body);
    await waitFor(() => {
      expect(within(vultrCard).getByRole("button", { name: "核查 Vultr 公开证据 操作菜单" })).toHaveAttribute("aria-expanded", "false");
    });
    fireEvent.click(vultrCard);
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "核查 Vultr 公开证据 运行记录" })).toBeNull();
    });
    expect(vultrCard).toHaveAttribute("data-generated-run-history-open", "false");
    expect(vultrCard).not.toHaveClass("is-history-open");
    fireEvent.click(vultrCard);
    const reopenedHistoryPanel = await screen.findByRole("region", { name: "核查 Vultr 公开证据 运行记录" });
    await waitFor(() => {
      expect(within(reopenedHistoryPanel).getByText("暂无可见运行记录。")).toBeInTheDocument();
    });
  });

  it("saves selected live Discovery generated Tasks as a channel set and runs the root from it", async () => {
    const selectedGeneratedTask = mockDiscoveryGeneratedTasks[0]!;
    const channelSet: TeamDiscoveryChannelSet = {
      schemaVersion: "team/discovery-channel-set-1",
      channelSetId: "dcs_cloud_shortlist",
      sourceDiscoveryTaskId: mockDiscoveryRootTask.taskId,
      title: "云厂商常用渠道",
      items: [{
        generatedTaskId: selectedGeneratedTask.taskId,
        sourceItemId: selectedGeneratedTask.generatedSource!.sourceItemId,
        title: selectedGeneratedTask.title,
        itemPayload: { ...selectedGeneratedTask.generatedSource!.itemPayload },
        workUnitSnapshot: selectedGeneratedTask.workUnit,
        workUnitMode: selectedGeneratedTask.generatedSource!.workUnitMode,
        latestDiscoveryRunId: selectedGeneratedTask.generatedSource!.latestDiscoveryRunId,
        latestDiscoveryAttemptId: selectedGeneratedTask.generatedSource!.latestDiscoveryAttemptId,
        latestDiscoveredAt: selectedGeneratedTask.generatedSource!.latestDiscoveredAt,
      }],
      archived: false,
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
    };
    const rootRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_from_channel_set");
    rootRun.source = {
      type: "canvas-task",
      taskId: mockDiscoveryRootTask.taskId,
      discoveryChannelSetId: channelSet.channelSetId,
    };
    let savedChannelSets: TeamDiscoveryChannelSet[] = [];
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/console/root-summary") return rootSummaryResponse({ tasks: [mockDiscoveryRootTask] });
      if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: [generatedSummary(selectedGeneratedTask)] }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/discovery-channel-sets` && init?.method !== "POST") {
        return new Response(JSON.stringify({ channelSets: savedChannelSets }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/discovery-channel-sets` && init?.method === "POST") {
        expect(String(init.body)).toContain(selectedGeneratedTask.taskId);
        savedChannelSets = [channelSet];
        return new Response(JSON.stringify({ channelSet }), { status: 201 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/runs` && init?.method === "POST") {
        expect(String(init.body)).toContain(`"discoveryChannelSetId":"${channelSet.channelSetId}"`);
        return new Response(JSON.stringify(rootRun), { status: 201 });
      }
      return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    fireEvent.click(await within(atlas).findByRole("button", { name: mockDiscoveryRootTask.title }));
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    const currentPanel = () => container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
    await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
    });

    fireEvent.click(within(currentPanel()!).getByRole("checkbox", { name: `选择 ${selectedGeneratedTask.title} 作为 Discovery 渠道` }));
    fireEvent.change(within(currentPanel()!).getByLabelText(`${mockDiscoveryRootTask.title} 渠道集名称`), {
      target: { value: channelSet.title },
    });
    fireEvent.click(within(currentPanel()!).getByRole("button", { name: "保存渠道集" }));
    const useSavedSet = await within(currentPanel()!).findByRole("button", { name: `使用渠道集 ${channelSet.title}` });
    fireEvent.click(useSavedSet);

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
        String(url) === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/runs`
        && init?.method === "POST"
        && String(init.body).includes(channelSet.channelSetId)
      )).toBe(true);
    });
  });

  it("selects a saved Discovery channel set and mirrors its items into generated card checkboxes", async () => {
    const generatedTasks = mockDiscoveryGeneratedTasks
      .filter((task) => !task.archived)
      .map((task) => ({
        ...task,
        generatedSource: task.generatedSource
          ? { ...task.generatedSource, itemStatus: "active" as const }
          : task.generatedSource,
      }));
    const firstGeneratedTask = generatedTasks[0]!;
    const secondGeneratedTask = generatedTasks[1]!;
    const makeChannelSet = (
      channelSetId: string,
      title: string,
      itemTask: TeamCanvasTask,
    ): TeamDiscoveryChannelSet => ({
      schemaVersion: "team/discovery-channel-set-1",
      channelSetId,
      sourceDiscoveryTaskId: mockDiscoveryRootTask.taskId,
      title,
      items: [{
        generatedTaskId: itemTask.taskId,
        sourceItemId: itemTask.generatedSource!.sourceItemId,
        title: itemTask.title,
        itemPayload: { ...itemTask.generatedSource!.itemPayload },
        workUnitSnapshot: itemTask.workUnit,
        workUnitMode: itemTask.generatedSource!.workUnitMode,
        latestDiscoveryRunId: itemTask.generatedSource!.latestDiscoveryRunId,
        latestDiscoveryAttemptId: itemTask.generatedSource!.latestDiscoveryAttemptId,
        latestDiscoveredAt: itemTask.generatedSource!.latestDiscoveredAt,
      }],
      archived: false,
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
    });
    const firstSet = makeChannelSet("dcs_first", "第一组渠道", firstGeneratedTask);
    const secondSet = makeChannelSet("dcs_second", "第二组渠道", secondGeneratedTask);
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/console/root-summary") return rootSummaryResponse({ tasks: [mockDiscoveryRootTask] });
      if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks.map(generatedSummary) }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/discovery-channel-sets`) {
        return new Response(JSON.stringify({ channelSets: [firstSet, secondSet] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    fireEvent.click(await within(atlas).findByRole("button", { name: mockDiscoveryRootTask.title }));
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    const panel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    const firstRow = await within(panel).findByRole("button", { name: "选中渠道集 第一组渠道" });
    const secondRow = await within(panel).findByRole("button", { name: "选中渠道集 第二组渠道" });

    fireEvent.click(firstRow);

    expect(firstRow.closest("[data-discovery-channel-set-id]")).toHaveAttribute("data-discovery-channel-set-selected", "true");
    expect(secondRow.closest("[data-discovery-channel-set-id]")).toHaveAttribute("data-discovery-channel-set-selected", "false");
    expect(within(panel).getByLabelText(`${mockDiscoveryRootTask.title} 渠道集名称`)).toHaveValue(firstSet.title);
    expect(within(getGeneratedCard(panel, firstGeneratedTask.taskId)).getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    expect(within(getGeneratedCard(panel, secondGeneratedTask.taskId)).getByRole("checkbox")).toHaveAttribute("aria-checked", "false");

    fireEvent.click(secondRow);

    expect(firstRow.closest("[data-discovery-channel-set-id]")).toHaveAttribute("data-discovery-channel-set-selected", "false");
    expect(secondRow.closest("[data-discovery-channel-set-id]")).toHaveAttribute("data-discovery-channel-set-selected", "true");
    expect(within(panel).getByLabelText(`${mockDiscoveryRootTask.title} 渠道集名称`)).toHaveValue(secondSet.title);
    expect(within(getGeneratedCard(panel, firstGeneratedTask.taskId)).getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
    expect(within(getGeneratedCard(panel, secondGeneratedTask.taskId)).getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("updates the selected live Discovery channel set instead of creating a duplicate", async () => {
    const generatedTasks = mockDiscoveryGeneratedTasks
      .filter((task) => !task.archived)
      .map((task) => ({
        ...task,
        generatedSource: task.generatedSource
          ? { ...task.generatedSource, itemStatus: "active" as const }
          : task.generatedSource,
      }));
    const firstGeneratedTask = generatedTasks[0]!;
    const secondGeneratedTask = generatedTasks[1]!;
    const makeChannelSetItem = (itemTask: TeamCanvasTask): TeamDiscoveryChannelSet["items"][number] => ({
      generatedTaskId: itemTask.taskId,
      sourceItemId: itemTask.generatedSource!.sourceItemId,
      title: itemTask.title,
      itemPayload: { ...itemTask.generatedSource!.itemPayload },
      workUnitSnapshot: itemTask.workUnit,
      workUnitMode: itemTask.generatedSource!.workUnitMode,
      latestDiscoveryRunId: itemTask.generatedSource!.latestDiscoveryRunId,
      latestDiscoveryAttemptId: itemTask.generatedSource!.latestDiscoveryAttemptId,
      latestDiscoveredAt: itemTask.generatedSource!.latestDiscoveredAt,
    });
    const channelSet: TeamDiscoveryChannelSet = {
      schemaVersion: "team/discovery-channel-set-1",
      channelSetId: "dcs_editable",
      sourceDiscoveryTaskId: mockDiscoveryRootTask.taskId,
      title: "第一组渠道",
      items: [makeChannelSetItem(firstGeneratedTask)],
      archived: false,
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
    };
    let savedChannelSets = [channelSet];
    let patchCalled = false;
    let postCalled = false;
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/console/root-summary") return rootSummaryResponse({ tasks: [mockDiscoveryRootTask] });
      if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks.map(generatedSummary) }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/discovery-channel-sets` && init?.method !== "POST") {
        return new Response(JSON.stringify({ channelSets: savedChannelSets }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/discovery-channel-sets` && init?.method === "POST") {
        postCalled = true;
        return new Response(JSON.stringify({ error: "unexpected duplicate create" }), { status: 500 });
      }
      if (
        url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/discovery-channel-sets/${channelSet.channelSetId}`
        && init?.method === "PATCH"
      ) {
        patchCalled = true;
        const body = JSON.parse(String(init.body)) as { title?: string; generatedTaskIds?: string[] };
        expect(body.title).toBe("更新后的渠道");
        expect(body.generatedTaskIds).toEqual([firstGeneratedTask.taskId, secondGeneratedTask.taskId]);
        const updatedChannelSet: TeamDiscoveryChannelSet = {
          ...channelSet,
          title: body.title!,
          items: [makeChannelSetItem(firstGeneratedTask), makeChannelSetItem(secondGeneratedTask)],
          updatedAt: "2026-06-07T01:00:00.000Z",
        };
        savedChannelSets = [updatedChannelSet];
        return new Response(JSON.stringify({ channelSet: updatedChannelSet }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    fireEvent.click(await within(atlas).findByRole("button", { name: mockDiscoveryRootTask.title }));
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    const panel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });

    fireEvent.click(await within(panel).findByRole("button", { name: "选中渠道集 第一组渠道" }));
    fireEvent.click(within(getGeneratedCard(panel, secondGeneratedTask.taskId)).getByRole("checkbox"));
    fireEvent.change(within(panel).getByLabelText(`${mockDiscoveryRootTask.title} 渠道集名称`), {
      target: { value: "更新后的渠道" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "更新渠道集" }));

    await waitFor(() => {
      expect(patchCalled).toBe(true);
    });
    expect(postCalled).toBe(false);
    expect(await within(panel).findByRole("button", { name: "选中渠道集 更新后的渠道" })).toBeInTheDocument();
    expect(within(getGeneratedCard(panel, firstGeneratedTask.taskId)).getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    expect(within(getGeneratedCard(panel, secondGeneratedTask.taskId)).getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("saves the selected live Discovery channel set edits as a new set", async () => {
    const generatedTasks = mockDiscoveryGeneratedTasks
      .filter((task) => !task.archived)
      .map((task) => ({
        ...task,
        generatedSource: task.generatedSource
          ? { ...task.generatedSource, itemStatus: "active" as const }
          : task.generatedSource,
      }));
    const firstGeneratedTask = generatedTasks[0]!;
    const secondGeneratedTask = generatedTasks[1]!;
    const makeChannelSetItem = (itemTask: TeamCanvasTask): TeamDiscoveryChannelSet["items"][number] => ({
      generatedTaskId: itemTask.taskId,
      sourceItemId: itemTask.generatedSource!.sourceItemId,
      title: itemTask.title,
      itemPayload: { ...itemTask.generatedSource!.itemPayload },
      workUnitSnapshot: itemTask.workUnit,
      workUnitMode: itemTask.generatedSource!.workUnitMode,
      latestDiscoveryRunId: itemTask.generatedSource!.latestDiscoveryRunId,
      latestDiscoveryAttemptId: itemTask.generatedSource!.latestDiscoveryAttemptId,
      latestDiscoveredAt: itemTask.generatedSource!.latestDiscoveredAt,
    });
    const channelSet: TeamDiscoveryChannelSet = {
      schemaVersion: "team/discovery-channel-set-1",
      channelSetId: "dcs_original",
      sourceDiscoveryTaskId: mockDiscoveryRootTask.taskId,
      title: "第一组渠道",
      items: [makeChannelSetItem(firstGeneratedTask)],
      archived: false,
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
    };
    let savedChannelSets = [channelSet];
    let postCalled = false;
    let patchCalled = false;
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/console/root-summary") return rootSummaryResponse({ tasks: [mockDiscoveryRootTask] });
      if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks.map(generatedSummary) }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/discovery-channel-sets` && init?.method !== "POST") {
        return new Response(JSON.stringify({ channelSets: savedChannelSets }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/discovery-channel-sets` && init?.method === "POST") {
        postCalled = true;
        const body = JSON.parse(String(init.body)) as { title?: string; generatedTaskIds?: string[] };
        expect(body.title).toBe("另存的新渠道");
        expect(body.generatedTaskIds).toEqual([firstGeneratedTask.taskId, secondGeneratedTask.taskId]);
        const copiedChannelSet: TeamDiscoveryChannelSet = {
          ...channelSet,
          channelSetId: "dcs_copied",
          title: body.title!,
          items: [makeChannelSetItem(firstGeneratedTask), makeChannelSetItem(secondGeneratedTask)],
          createdAt: "2026-06-07T01:00:00.000Z",
          updatedAt: "2026-06-07T01:00:00.000Z",
        };
        savedChannelSets = [copiedChannelSet, channelSet];
        return new Response(JSON.stringify({ channelSet: copiedChannelSet }), { status: 201 });
      }
      if (
        url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/discovery-channel-sets/${channelSet.channelSetId}`
        && init?.method === "PATCH"
      ) {
        patchCalled = true;
        return new Response(JSON.stringify({ error: "unexpected update" }), { status: 500 });
      }
      return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    fireEvent.click(await within(atlas).findByRole("button", { name: mockDiscoveryRootTask.title }));
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    const panel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });

    fireEvent.click(await within(panel).findByRole("button", { name: "选中渠道集 第一组渠道" }));
    fireEvent.click(within(getGeneratedCard(panel, secondGeneratedTask.taskId)).getByRole("checkbox"));
    fireEvent.change(within(panel).getByLabelText(`${mockDiscoveryRootTask.title} 渠道集名称`), {
      target: { value: "另存的新渠道" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "另存为新集合" }));

    await waitFor(() => {
      expect(postCalled).toBe(true);
    });
    expect(patchCalled).toBe(false);
    expect(await within(panel).findByRole("button", { name: "选中渠道集 另存的新渠道" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "保存渠道集" })).toBeDisabled();
  });

  it("sets and clears the live Discovery default channel-set run policy", async () => {
    const generatedTasks = mockDiscoveryGeneratedTasks
      .filter((task) => !task.archived)
      .map((task) => ({
        ...task,
        generatedSource: task.generatedSource
          ? { ...task.generatedSource, itemStatus: "active" as const }
          : task.generatedSource,
      }));
    const firstGeneratedTask = generatedTasks[0]!;
    const makeChannelSetItem = (itemTask: TeamCanvasTask): TeamDiscoveryChannelSet["items"][number] => ({
      generatedTaskId: itemTask.taskId,
      sourceItemId: itemTask.generatedSource!.sourceItemId,
      title: itemTask.title,
      itemPayload: { ...itemTask.generatedSource!.itemPayload },
      workUnitSnapshot: itemTask.workUnit,
      workUnitMode: itemTask.generatedSource!.workUnitMode,
      latestDiscoveryRunId: itemTask.generatedSource!.latestDiscoveryRunId,
      latestDiscoveryAttemptId: itemTask.generatedSource!.latestDiscoveryAttemptId,
      latestDiscoveredAt: itemTask.generatedSource!.latestDiscoveredAt,
    });
    const channelSet: TeamDiscoveryChannelSet = {
      schemaVersion: "team/discovery-channel-set-1",
      channelSetId: "dcs_default",
      sourceDiscoveryTaskId: mockDiscoveryRootTask.taskId,
      title: "第一组渠道",
      items: [makeChannelSetItem(firstGeneratedTask)],
      archived: false,
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
    };
    let rootTask: TeamCanvasTask = { ...mockDiscoveryRootTask };
    const patchedBodies: unknown[] = [];
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/console/root-summary") return rootSummaryResponse({ tasks: [rootTask] });
      if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks.map(generatedSummary) }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/discovery-channel-sets`) {
        return new Response(JSON.stringify({ channelSets: [channelSet] }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}` && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        patchedBodies.push(body);
        rootTask = {
          ...rootTask,
          discoveryRunPolicy: body.discoveryRunPolicy,
          updatedAt: "2026-06-07T02:00:00.000Z",
        };
        return new Response(JSON.stringify({ task: rootTask, warnings: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    fireEvent.click(await within(atlas).findByRole("button", { name: mockDiscoveryRootTask.title }));
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    const panel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });

    expect(within(panel).getByText("正常重新发现")).toBeInTheDocument();
    fireEvent.click(await within(panel).findByRole("button", { name: "设为默认运行 第一组渠道" }));

    await waitFor(() => {
      expect(patchedBodies[0]).toEqual({
        discoveryRunPolicy: {
          mode: "channel_set",
          channelSetId: channelSet.channelSetId,
        },
      });
    });
    expect(await within(panel).findByRole("button", { name: "默认运行渠道集 第一组渠道" })).toBeDisabled();
    expect(within(panel).getByRole("button", { name: "恢复正常运行" })).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "恢复正常运行" }));

    await waitFor(() => {
      expect(patchedBodies[1]).toEqual({
        discoveryRunPolicy: { mode: "rediscover" },
      });
    });
    expect(await within(panel).findByText("正常重新发现")).toBeInTheDocument();
  });

  it("opens Discovery root run history as a sibling panel when the subcanvas is open", async () => {
    const { container } = render(<App />);
    const { panel } = await openMockDiscoverySubcanvas(container);
    const subcanvasShell = panel.closest(".emap-task-child-branch-shell") as HTMLElement | null;
    expect(subcanvasShell).toBeTruthy();
    const subcanvasPanelId = subcanvasShell!.dataset.panelId;

    const menu = await screen.findByLabelText(`${mockDiscoveryRootTask.title} 操作菜单`);
    fireEvent.click(within(menu).getByRole("button", { name: "运行记录" }));

    const historyPanel = await screen.findByRole("region", { name: `${mockDiscoveryRootTask.title} 运行记录` });
    await waitFor(() => {
      expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeNull();
    });
    expect(within(historyPanel).getByText(mockDiscoveryRootTask.taskId)).toBeInTheDocument();
    const historyShell = historyPanel.closest(".emap-task-child-branch-shell") as HTMLElement | null;
    expect(historyShell).toBeTruthy();
    expect(historyShell!.dataset.panelId).toMatch(/^run-history-/);
    expect(historyShell).not.toHaveAttribute("data-panel-source-id", subcanvasPanelId);
    expect(historyShell!.dataset.panelSourceId).not.toContain("discovery-subcanvas");
  });

  it("keeps the last clicked Task visually selected even when that click closes its branch", async () => {
    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container));
    const taskATitle = mockTeamTasks[0]!.title;
    const taskBTitle = mockDiscoveryRootTask.title;
    const taskA = await within(atlas).findByRole("button", { name: taskATitle });
    const taskB = await within(atlas).findByRole("button", { name: taskBTitle });

    fireEvent.click(taskA);
    expect(taskA).toHaveClass("selected");
    expect(taskB).not.toHaveClass("selected");

    fireEvent.click(taskB);
    expect(taskB).toHaveClass("selected");
    expect(taskA).not.toHaveClass("selected");

    fireEvent.click(taskA);
    expect(taskA).toHaveClass("selected");
    expect(taskB).not.toHaveClass("selected");
    await waitFor(() => {
      expect(screen.queryByLabelText(`${taskATitle} Task 操作`)).toBeNull();
    });
    expect(screen.getByLabelText(`${taskBTitle} Task 操作`)).toBeInTheDocument();
  });

  it("light-edits a mock generated Task inside the Discovery subcanvas without creating a root card", async () => {
    const { container } = render(<App />);
    const { atlas, panel } = await openMockDiscoverySubcanvas(container);
    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");
    const editButton = vultrCard.querySelector('[data-generated-action="edit"]') as HTMLButtonElement | null;
    expect(editButton).toBeTruthy();

    fireEvent.click(editButton!);

    const editPanel = await waitFor(() => {
      const node = container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.change(within(editPanel).getByLabelText("Task 名称"), {
      target: { value: "用户改写 Vultr generated" },
    });
    fireEvent.click(within(editPanel).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      const refreshedCard = getGeneratedCard(panel, "task_generated_vultr");
      expect(within(refreshedCard).getByText("用户改写 Vultr generated")).toBeInTheDocument();
      expect(refreshedCard).toHaveAttribute("data-generated-workunit-mode", "customized");
    });
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
    expect(within(atlas).queryByRole("button", { name: "用户改写 Vultr generated" })).toBeNull();
  });

  it("resets a mock customized generated Task to its managed snapshot inside the Discovery subcanvas", async () => {
    const { container } = render(<App />);
    const { atlas, panel } = await openMockDiscoverySubcanvas(container);
    revealStaleGeneratedTasks(panel);
    const hetznerCard = getGeneratedCard(panel, "task_generated_hetzner");
    expect(hetznerCard).toHaveAttribute("data-generated-item-status", "stale");
    expect(hetznerCard).toHaveAttribute("data-generated-workunit-mode", "customized");
    expect(hetznerCard).toHaveAttribute("data-generated-visual-state", "stale");
    expect(hetznerCard.querySelector(".discovery-generated-card-watermark")).toHaveTextContent("02");
    const resetButton = hetznerCard.querySelector('[data-generated-action="reset-workunit"]') as HTMLButtonElement | null;
    expect(resetButton).toBeTruthy();

    fireEvent.click(resetButton!);

    await waitFor(() => {
      const refreshedCard = getGeneratedCard(panel, "task_generated_hetzner");
      expect(within(refreshedCard).getByText("派发器核查 Hetzner 公开证据")).toBeInTheDocument();
      expect(refreshedCard).toHaveAttribute("data-generated-workunit-mode", "managed");
      expect(refreshedCard).toHaveAttribute("data-generated-item-status", "stale");
      expect(refreshedCard).toHaveAttribute("data-generated-visual-state", "stale");
      expect(refreshedCard.querySelector('[data-generated-action="reset-workunit"]')).toBeNull();
    });
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
    expect(within(atlas).queryByRole("button", { name: "派发器核查 Hetzner 公开证据" })).toBeNull();
  });

  it("soft-archives a mock generated Task from the Discovery subcanvas without creating root cards", async () => {
    const { container } = render(<App />);
    const { atlas, panel } = await openMockDiscoverySubcanvas(container);
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });
    await waitFor(() => expect(within(discoveryNode).getByText("2 items")).toBeInTheDocument());
    expect(within(discoveryNode).getByText("1 active")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 stale")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 blocked")).toBeInTheDocument();
    expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(1);
    expect(panel).toHaveTextContent("1 stale hidden");

    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");
    fireEvent.click(vultrCard.querySelector('[data-generated-action="archive"]')!);
    const confirm = await waitFor(() => {
      const node = panel.querySelector('[data-generated-archive-confirm-for="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });

    fireEvent.click(within(confirm).getByRole("button", { name: "确认归档" }));

    await waitFor(() => {
      expect(panel.querySelector('[data-generated-task-id="task_generated_vultr"]')).toBeNull();
      expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(0);
    });
    expect(panel.querySelector('[data-generated-task-id="task_generated_hetzner"]')).toBeNull();
    revealStaleGeneratedTasks(panel);
    expect(getGeneratedCard(panel, "task_generated_hetzner")).toBeTruthy();
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
    expect(within(discoveryNode).getByText("1 items")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("0 active")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 stale")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 blocked")).toBeInTheDocument();
    expect(within(atlas).queryByRole("button", { name: "核查 Vultr 公开证据" })).toBeNull();
    expect(within(atlas).queryByRole("button", { name: "核查 Hetzner 公开证据" })).toBeNull();
  });

  it("clears generated archive confirmation when the Discovery subcanvas is closed", async () => {
    const { container } = render(<App />);
    const { panel } = await openMockDiscoverySubcanvas(container);
    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");

    fireEvent.click(vultrCard.querySelector('[data-generated-action="archive"]')!);
    await waitFor(() => {
      expect(panel.querySelector('[data-generated-archive-confirm-for="task_generated_vultr"]')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: `收起 ${mockDiscoveryRootTask.title} Discovery 子画布` }));

    await waitFor(() => {
      expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeNull();
    });

    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    const reopenedPanel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });

    expect(getGeneratedCard(reopenedPanel, "task_generated_vultr")).toBeTruthy();
    expect(reopenedPanel.querySelector('[data-generated-archive-confirm-for="task_generated_vultr"]')).toBeNull();
  });

  it("clears generated edit observer and file detail state after archiving that generated child", async () => {
    const { container } = render(<App />);
    const { panel } = await openMockDiscoverySubcanvas(container);
    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");

    fireEvent.click(vultrCard.querySelector('[data-generated-action="edit"]')!);
    await waitFor(() => {
      expect(container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]')).toBeTruthy();
    });

    fireEvent.click(vultrCard.querySelector('[data-generated-action="run"]')!);
    const observeButton = await waitFor(() => {
      expect(vultrCard).toHaveAttribute("data-generated-run-status", "completed");
      const button = vultrCard.querySelector('[data-generated-action="observe-run"]') as HTMLButtonElement | null;
      expect(button).toBeTruthy();
      return button!;
    });
    fireEvent.click(observeButton);
    const observerPanel = await waitFor(() => {
      const node = container.querySelector('[data-generated-observer-task-id="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    const workerFileRow = observerPanel.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
    expect(workerFileRow).toBeTruthy();
    fireEvent.click(workerFileRow!);
    await waitFor(() => {
      expect(container.querySelector(".emap-observer-file-detail-node")).toBeTruthy();
    });

    fireEvent.click(vultrCard.querySelector('[data-generated-action="archive"]')!);
    const confirm = await waitFor(() => {
      const node = panel.querySelector('[data-generated-archive-confirm-for="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "确认归档" }));

    await waitFor(() => {
      expect(panel.querySelector('[data-generated-task-id="task_generated_vultr"]')).toBeNull();
      expect(container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]')).toBeNull();
      expect(container.querySelector('[data-generated-observer-task-id="task_generated_vultr"]')).toBeNull();
      expect(container.querySelector(".emap-observer-file-detail-node")).toBeNull();
    });
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
  });

  it("runs a mock generated Task and opens its observer and file detail from the Discovery subcanvas", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });

    fireEvent.click(discoveryNode);
    const rootMenu = await screen.findByLabelText(`${mockDiscoveryRootTask.title} 操作菜单`);
    const rootRecentRunButton = within(rootMenu).getByRole("button", { name: /最近运行/ });
    fireEvent.click(rootRecentRunButton);
    const rootRecentObserverShell = await waitFor(() => {
      const panelNode = container.querySelector('.emap-run-observer-panel[data-observer-run-id]:not([data-generated-observer-task-id])') as HTMLElement | null;
      expect(panelNode).toBeTruthy();
      const shell = panelNode!.closest(".emap-task-child-branch-shell") as HTMLElement | null;
      expect(shell).toBeTruthy();
      return shell!;
    });
    expect(rootRecentObserverShell.dataset.panelId).toMatch(/^run-observer-/);
    expect(rootRecentObserverShell.dataset.panelId).not.toMatch(/^run-observer-generated-run-history-/);
    const rootRecentObserverPanelId = rootRecentObserverShell.dataset.panelId;
    fireEvent.click(rootRecentRunButton);
    await waitFor(() => {
      expect(container.querySelector(`[data-panel-id="${rootRecentObserverPanelId}"]`)).toBeNull();
    });
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));

    const panel = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
    expect(panel).toBeTruthy();
    const vultrCard = panel!.querySelector('[data-generated-task-id="task_generated_vultr"]') as HTMLElement | null;
    expect(vultrCard).toBeTruthy();

    const runButton = vultrCard!.querySelector('[data-generated-action="run"]') as HTMLButtonElement | null;
    expect(runButton).toBeTruthy();
    expect(runButton).toBeEnabled();
    fireEvent.click(runButton!);

    await waitFor(() => {
      expect(vultrCard).toHaveAttribute("data-generated-run-status", "completed");
    });
    expect(within(atlas).queryByRole("button", { name: "核查 Vultr 公开证据" })).toBeNull();
    expect(within(atlas).queryByRole("button", { name: "核查 Hetzner 公开证据" })).toBeNull();

    const observeButton = await waitFor(() => {
      const button = vultrCard!.querySelector('[data-generated-action="observe-run"]') as HTMLButtonElement | null;
      expect(button).toBeTruthy();
      return button!;
    });
    fireEvent.click(observeButton);

    const observerPanel = await waitFor(() => {
      const panelNode = container.querySelector('[data-generated-observer-task-id="task_generated_vultr"]') as HTMLElement | null;
      expect(panelNode).toBeTruthy();
      return panelNode!;
    });
    expect(observerPanel).toHaveAttribute("data-generated-observer-run-id");
    const generatedRunId = observerPanel.getAttribute("data-generated-observer-run-id")!;
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();

    expect(observerPanel.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
    expect(observerPanel.querySelector('.emap-observer-process-node[data-process-role="checker"]')).toBeTruthy();
    expect(within(observerPanel).getByText("worker-output-001.md")).toBeInTheDocument();
    expect(within(observerPanel).getByText("checker-verdict-001.json")).toBeInTheDocument();
    expect(within(observerPanel).getByText("accepted-result.md")).toBeInTheDocument();

    const workerFileRow = observerPanel.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
    expect(workerFileRow).toBeTruthy();
    fireEvent.click(workerFileRow!);
    const fileDetail = await waitFor(() => {
      const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
      expect(detail).toBeTruthy();
      return detail!;
    });
    expect(fileDetail).toHaveTextContent("Mock worker output for 核查 Vultr 公开证据");

    fireEvent.click(observeButton);
    await waitFor(() => {
      expect(container.querySelector('[data-generated-observer-task-id="task_generated_vultr"]')).toBeNull();
    });
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();

    fireEvent.click(vultrCard!);
    const historyPanel = await screen.findByRole("region", { name: "核查 Vultr 公开证据 运行记录" });
    const historyRow = await waitFor(() => {
      const row = historyPanel.querySelector(`[data-run-id="${generatedRunId}"]`) as HTMLElement | null;
      expect(row).toBeTruthy();
      return row!;
    });
    expect(historyRow).toHaveTextContent("状态");
    expect(historyRow).toHaveTextContent("开始时间");
    expect(historyRow).toHaveTextContent("执行时间");
    expect(historyRow).not.toHaveTextContent(generatedRunId);
    expect(within(historyRow).getAllByRole("button")).toHaveLength(4);
    expect(within(historyRow).queryByRole("button", { name: new RegExp(generatedRunId) })).toBeNull();

    fireEvent.click(within(historyRow).getByRole("button", { name: "标为最佳" }));
    await waitFor(() => {
      expect(historyRow).toHaveAttribute("data-run-best", "true");
    });
    expect(container.querySelector(`[data-observer-run-id="${generatedRunId}"]`)).toBeNull();

    fireEvent.click(historyRow);
    const historyObserver = await waitFor(() => {
      const panelNode = container.querySelector(`[data-observer-run-id="${generatedRunId}"]`) as HTMLElement | null;
      expect(panelNode).toBeTruthy();
      return panelNode!;
    });
    expect(historyObserver).toHaveAttribute("data-observer-run-id", generatedRunId);
    const historyObserverShell = historyObserver.closest(".emap-task-child-branch-shell") as HTMLElement | null;
    expect(historyObserverShell).toBeTruthy();
    expect(historyObserverShell!.dataset.panelId).toMatch(/^run-observer-generated-run-history-/);
    expect(historyObserverShell!.dataset.panelId).not.toBe(rootRecentObserverPanelId);
    expect(historyObserverShell).toHaveAttribute("data-panel-source-id", expect.stringMatching(/^generated-run-history-/));
  });

  it("does not show the Discovery subcanvas toggle for normal root Tasks", async () => {
    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    const normalTask = mockTeamTasks[0]!;
    const normalTaskNode = await within(atlas).findByRole("button", { name: normalTask.title });

    fireEvent.click(normalTaskNode);

    const menu = await screen.findByLabelText(`${normalTask.title} 操作菜单`);
    expect(within(menu).queryByRole("button", { name: "Discovery 子画布" })).toBeNull();
  });

  it("does not request Discovery channel sets when opening a split-task generated subcanvas", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const splitTask: TeamCanvasTask = {
      taskId: "task_split_news",
      canvasKind: "split-task",
      title: "新闻分片处理",
      leaderAgentId: "main",
      status: "ready",
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z",
      archived: false,
      splitTaskSpec: {
        schemaVersion: "team/split-task-spec-1",
        inputPortId: "input-worklist",
        outputPortId: "output-results",
        dispatchGoal: "按 worklist 分发子任务。",
        generatedWorkerAgentId: "search",
        generatedCheckerAgentId: "reviewer",
        autoRun: { enabled: true, concurrency: 2 },
        collectPolicy: { requireAllItemsSucceeded: true, requireFullCoverage: true },
      },
      workUnit: {
        title: "新闻分片处理",
        input: { text: "处理上游 worklist。" },
        inputPorts: [{ id: "input-worklist", label: "分片清单", type: "worklist" }],
        outputPorts: [{ id: "output-results", label: "处理结果", type: "worklist-results" }],
        outputContract: { text: "输出 worklist-results。" },
        acceptance: { rules: ["输出必须覆盖全部 worklist item。"] },
        workerAgentId: "search",
        checkerAgentId: "reviewer",
      },
    };
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") {
        return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      }
      if (url === "/v1/agents/status") {
        return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      }
      if (url === "/v1/team/console/root-summary") {
        return rootSummaryResponse({ tasks: [splitTask], taskRunsByTaskId: { [splitTask.taskId]: [] } });
      }
      if (url === "/v1/team/task-groups") {
        return new Response(JSON.stringify({ taskGroups: [] }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${splitTask.taskId}/generated-tasks?view=summary`) {
        return new Response(JSON.stringify({ tasks: [], deletedTaskIds: [], serverVersion: null }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({ [splitTask.taskId]: [] });
      }
      if (url.includes("/discovery-channel-sets")) {
        return new Response(JSON.stringify({ error: "split tasks do not have Discovery channel sets" }), { status: 400 });
      }
      return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    fireEvent.click(await within(atlas).findByRole("button", { name: splitTask.title }));
    fireEvent.click(await screen.findByRole("button", { name: "生成子画布" }));

    await waitFor(() => {
      expect(container.querySelector(`[data-discovery-subcanvas-for="${splitTask.taskId}"]`)).toBeTruthy();
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input) === `/v1/team/tasks/${splitTask.taskId}/generated-tasks?view=summary`)).toBe(true);
    });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/discovery-channel-sets"))).toBe(false);
  });

});
