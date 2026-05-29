import { vi } from "vitest";
import { cloneTaskFixture } from "./team-task-test-fixtures";

export function mockLiveTaskEditorApi(options?: {
  patchStatus?: number;
  patchError?: string;
  archiveStatus?: number;
  archiveError?: string;
  warnings?: string[];
}) {
  let currentTask = cloneTaskFixture();
  let taskArchived = false;
  let taskRequests = 0;
  let archiveRequests = 0;
  const patchBodies: unknown[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/v1/agents") {
      return new Response(JSON.stringify({
        agents: [
          { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
          { agentId: "search", name: "搜索 Agent", description: "搜索" },
          { agentId: "reviewer", name: "Review Agent", description: "复核" },
        ],
      }), { status: 200 });
    }
    if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
    if (url === "/v1/team/tasks" && method === "GET") {
      taskRequests += 1;
      return new Response(JSON.stringify({ tasks: taskArchived ? [] : [currentTask] }), { status: 200 });
    }
    if (url === "/v1/team/tasks/task_research_medtrum" && method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        title?: string;
        leaderAgentId?: string;
        workUnit?: typeof currentTask.workUnit;
      };
      patchBodies.push(body);
      if (options?.patchStatus && options.patchStatus >= 400) {
        return new Response(JSON.stringify({ error: options.patchError ?? "update failed" }), { status: options.patchStatus });
      }
      currentTask = {
        ...currentTask,
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.leaderAgentId !== undefined ? { leaderAgentId: body.leaderAgentId } : {}),
        ...(body.workUnit !== undefined ? { workUnit: body.workUnit } : {}),
        updatedAt: "2026-05-25T00:00:00.000Z",
      };
      return new Response(JSON.stringify({ task: currentTask, warnings: options?.warnings }), { status: 200 });
    }
    if (url === "/v1/team/tasks/task_research_medtrum/archive" && method === "POST") {
      archiveRequests += 1;
      if (options?.archiveStatus && options.archiveStatus >= 400) {
        return new Response(JSON.stringify({ error: options.archiveError ?? "archive failed" }), { status: options.archiveStatus });
      }
      taskArchived = true;
      return new Response(JSON.stringify({
        task: { ...currentTask, archived: true, status: "archived" },
      }), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
  return {
    patchBodies,
    replaceCurrentTask(nextTask: typeof currentTask) {
      currentTask = cloneTaskFixture(nextTask);
    },
    mutateCurrentTask(mutator: (task: typeof currentTask) => typeof currentTask) {
      currentTask = cloneTaskFixture(mutator(currentTask));
    },
    get currentTask() {
      return currentTask;
    },
    get taskRequests() {
      return taskRequests;
    },
    get archiveRequests() {
      return archiveRequests;
    },
  };
}
