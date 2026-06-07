import type {
  AgentCatalogResponse,
  AgentAssetSummary,
  AgentChatResponse,
  AgentChatStreamEvent,
  AgentChatStreamRequest,
  AgentChatStatus,
  AgentConversationCatalogResponse,
  AgentConversationEventsRequest,
  AgentConversationState,
  AgentConversationResponse,
  AgentInterruptResponse,
  AgentQueueMessageRequest,
  AgentQueueMessageResponse,
  AgentRunStatus,
  AgentRunStatusListResponse,
  AgentSummary,
  AgentSwitchConversationResponse,
  TeamCanvasTask,
  TeamCanvasTaskListResponse,
  TeamCanvasTaskRunByTaskListResponse,
  TeamCanvasTaskRunListResponse,
  TeamConsoleRootSummaryResponse,
  TeamCanvasSourceConnection,
  TeamCanvasSourceConnectionCreateRequest,
  TeamCanvasSourceConnectionListResponse,
  TeamCanvasSourceConnectionMutationResponse,
  TeamCanvasSourceNode,
  TeamCanvasSourceNodeCreateRequest,
  TeamCanvasSourceNodeListResponse,
  TeamCanvasSourceNodeMutationResponse,
  TeamCanvasSourceNodeUpdateRequest,
  TeamDiscoveryGeneratedTaskSummaryCatalogResponse,
  TeamDiscoveryGeneratedTaskSummary,
  TeamDiscoveryChannelSet,
  TeamDiscoveryChannelSetCreateRequest,
  TeamDiscoveryChannelSetListResponse,
  TeamDiscoveryChannelSetMutationResponse,
  TeamTaskConnection,
  TeamTaskConnectionCreateRequest,
  TeamTaskConnectionListResponse,
  TeamTaskConnectionMutationResponse,
  TeamTaskDependency,
  TeamTaskDependencyCreateRequest,
  TeamTaskDependencyListResponse,
  TeamTaskDependencyMutationResponse,
  ResolvedTeamTaskGroup,
  TeamTaskGroupCreateRequest,
  TeamTaskGroupListResponse,
  TeamTaskGroupMutationResponse,
  TeamTaskGroupPatchRequest,
  TeamTaskGroupRun,
  TeamTaskGroupRunListResponse,
  TeamTaskGroupRunMutationResponse,
  TeamTaskCloneRequest,
  TeamTaskMutationResponse,
  TeamTaskRunCreateRequest,
  TeamTaskUpdateRequest,
  TeamPlan,
  RunDetail,
  TeamApiError,
  TeamRunState,
  TeamAttemptMetadata,
  TeamTaskRunAnnotationMutationResponse,
  TeamTaskRunAnnotationPatchRequest,
  TeamTaskRunHistoryResponse,
  TeamTaskRunProcessSummaryResponse,
} from "./team-types";
import { readAgentChatSse } from "./agent-chat-sse";

export interface TeamRuntimeGateway {
  listPlans(): Promise<TeamPlan[]>;
  listRuns(): Promise<TeamRunState[]>;
  getRunDetail(runId: string): Promise<RunDetail>;
  listAttempts(runId: string, taskId: string): Promise<TeamAttemptMetadata[]>;
  readAttemptFile(runId: string, taskId: string, attemptId: string, fileName: string): Promise<string>;
}

export interface CanvasTaskGateway {
  getConsoleLayout(): Promise<TeamConsoleLayoutResponse>;
  saveConsoleLayout(state: unknown | null): Promise<TeamConsoleLayoutResponse>;
  getRootSummary(options?: { taskSince?: string; runSince?: string }): Promise<TeamConsoleRootSummaryResponse>;
  listTaskCatalog(options?: { since?: string }): Promise<TeamCanvasTaskListResponse>;
  listTasks(): Promise<TeamCanvasTask[]>;
  listGeneratedTasks(
    discoveryTaskId: string,
    options?: { includeArchived?: boolean },
  ): Promise<TeamCanvasTask[]>;
  listGeneratedTaskSummaries(
    discoveryTaskId: string,
    options?: { includeArchived?: boolean; since?: string },
  ): Promise<TeamDiscoveryGeneratedTaskSummary[]>;
  listGeneratedTaskSummaryCatalog(
    discoveryTaskId: string,
    options?: { includeArchived?: boolean; since?: string },
  ): Promise<TeamDiscoveryGeneratedTaskSummaryCatalogResponse>;
  listDiscoveryChannelSets(discoveryTaskId: string, options?: { includeArchived?: boolean }): Promise<TeamDiscoveryChannelSet[]>;
  createDiscoveryChannelSet(discoveryTaskId: string, input: TeamDiscoveryChannelSetCreateRequest): Promise<TeamDiscoveryChannelSet>;
  archiveDiscoveryChannelSet(discoveryTaskId: string, channelSetId: string): Promise<TeamDiscoveryChannelSet>;
  getTask(taskId: string): Promise<TeamCanvasTask | null>;
  updateTask(taskId: string, patch: TeamTaskUpdateRequest): Promise<TeamTaskMutationResponse>;
  cloneTask(taskId: string, input: TeamTaskCloneRequest): Promise<TeamTaskMutationResponse>;
  resetGeneratedTaskWorkUnit(taskId: string): Promise<TeamTaskMutationResponse>;
  archiveTask(taskId: string): Promise<TeamTaskMutationResponse>;
  listTaskConnections(): Promise<TeamTaskConnection[]>;
  createTaskConnection(input: TeamTaskConnectionCreateRequest): Promise<TeamTaskConnection>;
  deleteTaskConnection(connectionId: string): Promise<void>;
  listTaskDependencies(): Promise<TeamTaskDependency[]>;
  createTaskDependency(input: TeamTaskDependencyCreateRequest): Promise<TeamTaskDependency>;
  deleteTaskDependency(dependencyId: string): Promise<void>;
  listTaskGroups(): Promise<ResolvedTeamTaskGroup[]>;
  createTaskGroup(input: TeamTaskGroupCreateRequest): Promise<ResolvedTeamTaskGroup>;
  patchTaskGroup(groupId: string, patch: TeamTaskGroupPatchRequest): Promise<ResolvedTeamTaskGroup>;
  archiveTaskGroup(groupId: string): Promise<ResolvedTeamTaskGroup>;
  startTaskGroupRun(groupId: string): Promise<TeamTaskGroupRun>;
  listTaskGroupRuns(groupId: string): Promise<TeamTaskGroupRun[]>;
  getTaskGroupRun(groupRunId: string): Promise<TeamTaskGroupRun>;
  cancelTaskGroupRun(groupRunId: string): Promise<TeamTaskGroupRun>;
  listSourceNodes(): Promise<TeamCanvasSourceNode[]>;
  createSourceNode(input: TeamCanvasSourceNodeCreateRequest): Promise<TeamCanvasSourceNode>;
  updateSourceNode(sourceNodeId: string, patch: TeamCanvasSourceNodeUpdateRequest): Promise<TeamCanvasSourceNode>;
  archiveSourceNode(sourceNodeId: string): Promise<TeamCanvasSourceNode>;
  listSourceConnections(): Promise<TeamCanvasSourceConnection[]>;
  createSourceConnection(input: TeamCanvasSourceConnectionCreateRequest): Promise<TeamCanvasSourceConnection>;
  deleteSourceConnection(connectionId: string): Promise<void>;
  listTaskRuns(taskId: string): Promise<TeamRunState[]>;
  listTaskRunHistory(
    taskId: string,
    options?: { limit?: number; offset?: number; includeArchived?: boolean },
  ): Promise<TeamTaskRunHistoryResponse>;
  listTaskRunsByTaskIds(taskIds: string[], options?: { limit?: number; view?: "summary"; since?: string }): Promise<TeamCanvasTaskRunByTaskListResponse>;
  createTaskRun(taskId: string, input?: TeamTaskRunCreateRequest): Promise<TeamRunState>;
  getTaskRun(runId: string, options?: { view?: "summary"; taskId?: string }): Promise<TeamRunState>;
  getTaskRunProcessSummary(runId: string, taskId: string): Promise<TeamTaskRunProcessSummaryResponse>;
  cancelTaskRun(runId: string): Promise<TeamRunState>;
  updateTaskRunAnnotation(runId: string, patch: TeamTaskRunAnnotationPatchRequest): Promise<TeamTaskRunAnnotationMutationResponse>;
  listTaskRunAttempts(runId: string, taskId: string, options?: { view?: "dispatch-diagnostics" }): Promise<TeamAttemptMetadata[]>;
  readTaskRunAttemptFile(runId: string, taskId: string, attemptId: string, fileName: string): Promise<string>;
}

export interface AgentWorkspaceGateway {
  listAgents(): Promise<AgentSummary[]>;
  listAgentRunStatuses(): Promise<AgentRunStatus[]>;
  listAgentConversations(agentId: string): Promise<AgentConversationCatalogResponse>;
  createAgentConversation(agentId: string): Promise<AgentConversationResponse>;
  switchAgentConversation(agentId: string, conversationId: string): Promise<AgentSwitchConversationResponse>;
  getAgentConversationState(agentId: string, conversationId: string, viewLimit?: number): Promise<AgentConversationState>;
  getAgentChatStatus(agentId: string, conversationId: string): Promise<AgentChatStatus>;
  interruptAgentChat(agentId: string, conversationId: string): Promise<AgentInterruptResponse>;
  sendAgentMessage(agentId: string, message: string, conversationId?: string, assetRefs?: string[]): Promise<AgentChatResponse>;
  queueAgentMessage(agentId: string, request: AgentQueueMessageRequest): Promise<AgentQueueMessageResponse>;
  streamAgentMessage(
    agentId: string,
    request: AgentChatStreamRequest,
    onEvent: (event: AgentChatStreamEvent) => void,
  ): Promise<void>;
  streamAgentConversationEvents(
    agentId: string,
    request: AgentConversationEventsRequest,
    onEvent: (event: AgentChatStreamEvent) => void,
  ): Promise<void>;
}

export interface AssetGateway {
  listAssets(limit?: number): Promise<AgentAssetSummary[]>;
  uploadFilesAsAssets(files: File[], conversationId?: string): Promise<AgentAssetSummary[]>;
}

export type TeamConsoleLayoutResponse = {
  state: unknown | null;
  updatedAt?: string | null;
};

export type TeamApiProvider = TeamRuntimeGateway & CanvasTaskGateway & AgentWorkspaceGateway & AssetGateway;

function toApiError(error: unknown): TeamApiError {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return { message: "无法连接服务器", status: 0 };
  }
  if (error instanceof Response) {
    return { message: `请求失败 (${error.status})`, status: error.status };
  }
  if (error && typeof error === "object" && "message" in error) {
    return {
      message: String((error as TeamApiError).message),
      ...(typeof (error as TeamApiError).status === "number" ? { status: (error as TeamApiError).status } : {}),
    };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: "未知错误" };
}

async function responseToApiError(response: Response, fallbackMessage: string): Promise<TeamApiError> {
  const payload = await response.json().catch(() => null) as {
    error?: { message?: string } | string;
    message?: string;
  } | null;
  return {
    message: (typeof payload?.error === "string" ? payload.error : payload?.error?.message) || payload?.message || fallbackMessage,
    status: response.status,
  };
}

export const TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE = 100;

type JsonGetResponse<T> = {
  body: T | null;
  ok: boolean;
  status: number;
};

const inFlightJsonGets = new Map<string, Promise<JsonGetResponse<unknown>>>();

async function fetchJsonGet<T>(url: string, init?: RequestInit): Promise<JsonGetResponse<T>> {
  const method = init?.method ?? "GET";
  if (method !== "GET") {
    const res = init === undefined ? await fetch(url) : await fetch(url, init);
    const body = await res.json().catch(() => null) as T | null;
    return { body, ok: res.ok, status: res.status };
  }
  const key = `${url}\n${JSON.stringify(init?.headers ?? null)}`;
  const existing = inFlightJsonGets.get(key) as Promise<JsonGetResponse<T>> | undefined;
  if (existing) return existing;
  const request = (async (): Promise<JsonGetResponse<T>> => {
    const res = init === undefined ? await fetch(url) : await fetch(url, init);
    const body = await res.json().catch(() => null) as T | null;
    return { body, ok: res.ok, status: res.status };
  })();
  inFlightJsonGets.set(key, request as Promise<JsonGetResponse<unknown>>);
  try {
    return await request;
  } finally {
    if (inFlightJsonGets.get(key) === request) {
      inFlightJsonGets.delete(key);
    }
  }
}

function throwJsonGetError(response: JsonGetResponse<unknown>): never {
  throw { message: `请求失败 (${response.status})`, status: response.status };
}

export class LiveTeamApi implements TeamApiProvider {
  constructor(private baseUrl: string = "/v1/team") {}

  async listPlans(): Promise<TeamPlan[]> {
    try {
      const res = await fetchJsonGet<TeamPlan[]>(`${this.baseUrl}/plans`);
      if (!res.ok) throwJsonGetError(res);
      return Array.isArray(res.body) ? res.body : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listRuns(): Promise<TeamRunState[]> {
    try {
      const res = await fetchJsonGet<TeamRunState[]>(`${this.baseUrl}/runs`);
      if (!res.ok) throwJsonGetError(res);
      return Array.isArray(res.body) ? res.body : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async getConsoleLayout(): Promise<TeamConsoleLayoutResponse> {
    try {
      const res = await fetchJsonGet<TeamConsoleLayoutResponse>(`${this.baseUrl}/console-layout`);
      if (res.status === 404) return { state: null, updatedAt: null };
      if (!res.ok) throwJsonGetError(res);
      return {
        state: res.body?.state ?? null,
        updatedAt: res.body?.updatedAt ?? null,
      };
    } catch (e) {
      throw toApiError(e);
    }
  }

  async saveConsoleLayout(state: unknown | null): Promise<TeamConsoleLayoutResponse> {
    try {
      const res = await fetchJsonGet<TeamConsoleLayoutResponse>(`${this.baseUrl}/console-layout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      if (!res.ok) throwJsonGetError(res);
      return {
        state: res.body?.state ?? null,
        updatedAt: res.body?.updatedAt ?? null,
      };
    } catch (e) {
      throw toApiError(e);
    }
  }

  async getRootSummary(options?: { taskSince?: string; runSince?: string }): Promise<TeamConsoleRootSummaryResponse> {
    try {
      const params = new URLSearchParams();
      if (options?.taskSince) params.set("taskSince", options.taskSince);
      if (options?.runSince) params.set("runSince", options.runSince);
      const query = params.toString();
      const res = await fetchJsonGet<TeamConsoleRootSummaryResponse>(
        `${this.baseUrl}/console/root-summary${query ? `?${query}` : ""}`,
      );
      if (!res.ok) throwJsonGetError(res);
      const body = res.body;
      if (!body || Array.isArray(body) || typeof body !== "object" || !("taskRunsByTaskId" in body)) {
        throw { message: "malformed root summary response", status: res.status };
      }
      return {
        tasks: Array.isArray(body?.tasks) ? body.tasks : [],
        deletedTaskIds: Array.isArray(body?.deletedTaskIds) ? body.deletedTaskIds : [],
        taskRunsByTaskId: body?.taskRunsByTaskId ?? {},
        deletedRunIdsByTaskId: body?.deletedRunIdsByTaskId ?? {},
        sourceNodes: Array.isArray(body?.sourceNodes) ? body.sourceNodes : [],
        sourceConnections: Array.isArray(body?.sourceConnections) ? body.sourceConnections : [],
        taskConnections: Array.isArray(body?.taskConnections) ? body.taskConnections : [],
        taskDependencies: Array.isArray(body?.taskDependencies) ? body.taskDependencies : [],
        serverVersion: {
          taskCatalog: typeof body?.serverVersion?.taskCatalog === "string" ? body.serverVersion.taskCatalog : null,
          taskRunSummary: typeof body?.serverVersion?.taskRunSummary === "string" ? body.serverVersion.taskRunSummary : null,
        },
      };
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listTaskCatalog(options?: { since?: string }): Promise<TeamCanvasTaskListResponse> {
    try {
      const params = new URLSearchParams();
      if (options?.since) params.set("since", options.since);
      const query = params.toString();
      const res = await fetchJsonGet<TeamCanvasTaskListResponse | TeamCanvasTask[]>(
        `${this.baseUrl}/tasks${query ? `?${query}` : ""}`,
      );
      if (!res.ok) throwJsonGetError(res);
      const body = res.body;
      if (Array.isArray(body)) return { tasks: body, deletedTaskIds: [], serverVersion: null };
      return {
        tasks: Array.isArray(body?.tasks) ? body.tasks : [],
        deletedTaskIds: Array.isArray(body?.deletedTaskIds) ? body.deletedTaskIds : [],
        serverVersion: typeof body?.serverVersion === "string" ? body.serverVersion : null,
      };
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listTasks(): Promise<TeamCanvasTask[]> {
    return (await this.listTaskCatalog()).tasks;
  }

  async listGeneratedTasks(
    discoveryTaskId: string,
    options?: { includeArchived?: boolean },
  ): Promise<TeamCanvasTask[]> {
    try {
      const params = new URLSearchParams();
      if (options?.includeArchived) {
        params.set("includeArchived", "1");
      }
      const query = params.toString();
      const res = await fetchJsonGet<TeamCanvasTaskListResponse | TeamCanvasTask[]>(
        `${this.baseUrl}/tasks/${encodeURIComponent(discoveryTaskId)}/generated-tasks${query ? `?${query}` : ""}`,
      );
      if (res.status === 404) return [];
      if (!res.ok) throwJsonGetError(res);
      const body = res.body;
      if (Array.isArray(body)) return body;
      return Array.isArray(body?.tasks) ? body.tasks : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listGeneratedTaskSummaries(
    discoveryTaskId: string,
    options?: { includeArchived?: boolean; since?: string },
  ): Promise<TeamDiscoveryGeneratedTaskSummary[]> {
    return (await this.listGeneratedTaskSummaryCatalog(discoveryTaskId, options)).tasks;
  }

  async listGeneratedTaskSummaryCatalog(
    discoveryTaskId: string,
    options?: { includeArchived?: boolean; since?: string },
  ): Promise<TeamDiscoveryGeneratedTaskSummaryCatalogResponse> {
    try {
      const params = new URLSearchParams({ view: "summary" });
      if (options?.includeArchived) {
        params.set("includeArchived", "1");
      }
      if (options?.since) params.set("since", options.since);
      const res = await fetchJsonGet<{ tasks: TeamDiscoveryGeneratedTaskSummary[] } | TeamDiscoveryGeneratedTaskSummary[]>(
        `${this.baseUrl}/tasks/${encodeURIComponent(discoveryTaskId)}/generated-tasks?${params.toString()}`,
      );
      if (res.status === 404) return { tasks: [], deletedTaskIds: [], serverVersion: null };
      if (!res.ok) throwJsonGetError(res);
      const body = res.body;
      if (Array.isArray(body)) return { tasks: body, deletedTaskIds: [], serverVersion: null };
      return {
        tasks: Array.isArray(body?.tasks) ? body.tasks : [],
        deletedTaskIds: Array.isArray((body as TeamDiscoveryGeneratedTaskSummaryCatalogResponse | null)?.deletedTaskIds)
          ? (body as TeamDiscoveryGeneratedTaskSummaryCatalogResponse).deletedTaskIds
          : [],
        serverVersion: typeof (body as TeamDiscoveryGeneratedTaskSummaryCatalogResponse | null)?.serverVersion === "string"
          ? (body as TeamDiscoveryGeneratedTaskSummaryCatalogResponse).serverVersion
          : null,
      };
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listDiscoveryChannelSets(discoveryTaskId: string, options?: { includeArchived?: boolean }): Promise<TeamDiscoveryChannelSet[]> {
    try {
      const params = new URLSearchParams();
      if (options?.includeArchived) params.set("includeArchived", "1");
      const query = params.toString();
      const res = await fetchJsonGet<TeamDiscoveryChannelSetListResponse>(
        `${this.baseUrl}/tasks/${encodeURIComponent(discoveryTaskId)}/discovery-channel-sets${query ? `?${query}` : ""}`,
      );
      if (res.status === 404) return [];
      if (!res.ok) throwJsonGetError(res);
      return Array.isArray(res.body?.channelSets) ? res.body.channelSets : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async createDiscoveryChannelSet(discoveryTaskId: string, input: TeamDiscoveryChannelSetCreateRequest): Promise<TeamDiscoveryChannelSet> {
    try {
      const res = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(discoveryTaskId)}/discovery-channel-sets`, {
        method: "POST",
        headers: { accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      const body = await res.json() as TeamDiscoveryChannelSetMutationResponse;
      return body.channelSet;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async archiveDiscoveryChannelSet(discoveryTaskId: string, channelSetId: string): Promise<TeamDiscoveryChannelSet> {
    try {
      const res = await fetch(
        `${this.baseUrl}/tasks/${encodeURIComponent(discoveryTaskId)}/discovery-channel-sets/${encodeURIComponent(channelSetId)}/archive`,
        {
          method: "POST",
          headers: { accept: "application/json" },
        },
      );
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      const body = await res.json() as TeamDiscoveryChannelSetMutationResponse;
      return body.channelSet;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async getTask(taskId: string): Promise<TeamCanvasTask | null> {
    try {
      const res = await fetchJsonGet<TeamTaskMutationResponse>(`${this.baseUrl}/tasks/${encodeURIComponent(taskId)}`);
      if (res.status === 404) return null;
      if (!res.ok) throwJsonGetError(res);
      return res.body?.task ?? null;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listTaskConnections(): Promise<TeamTaskConnection[]> {
    try {
      const res = await fetchJsonGet<TeamTaskConnectionListResponse | TeamTaskConnection[]>(`${this.baseUrl}/task-connections`);
      if (res.status === 404) return [];
      if (!res.ok) throwJsonGetError(res);
      const body = res.body;
      if (Array.isArray(body)) return body;
      return Array.isArray(body?.connections) ? body.connections : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async createTaskConnection(input: TeamTaskConnectionCreateRequest): Promise<TeamTaskConnection> {
    try {
      const res = await fetch(`${this.baseUrl}/task-connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      const body = (await res.json()) as TeamTaskConnectionMutationResponse;
      return body.connection;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async deleteTaskConnection(connectionId: string): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/task-connections/${encodeURIComponent(connectionId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listTaskDependencies(): Promise<TeamTaskDependency[]> {
    try {
      const res = await fetchJsonGet<TeamTaskDependencyListResponse | TeamTaskDependency[]>(`${this.baseUrl}/task-dependencies`);
      if (res.status === 404) return [];
      if (!res.ok) throwJsonGetError(res);
      const body = res.body;
      if (Array.isArray(body)) return body;
      return Array.isArray(body?.dependencies) ? body.dependencies : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async createTaskDependency(input: TeamTaskDependencyCreateRequest): Promise<TeamTaskDependency> {
    try {
      const res = await fetch(`${this.baseUrl}/task-dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      const body = (await res.json()) as TeamTaskDependencyMutationResponse;
      return body.dependency;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async deleteTaskDependency(dependencyId: string): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/task-dependencies/${encodeURIComponent(dependencyId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listTaskGroups(): Promise<ResolvedTeamTaskGroup[]> {
    try {
      const res = await fetchJsonGet<TeamTaskGroupListResponse>(`${this.baseUrl}/task-groups`);
      if (res.status === 404) return [];
      if (!res.ok) throwJsonGetError(res);
      return Array.isArray(res.body?.taskGroups)
        ? res.body.taskGroups
        : Array.isArray(res.body?.groups)
          ? res.body.groups
          : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async createTaskGroup(input: TeamTaskGroupCreateRequest): Promise<ResolvedTeamTaskGroup> {
    try {
      const res = await fetch(`${this.baseUrl}/task-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      const body = (await res.json()) as TeamTaskGroupMutationResponse;
      const taskGroup = body.taskGroup ?? body.group;
      if (!taskGroup) throw { message: "malformed task group response", status: res.status };
      return taskGroup;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async patchTaskGroup(groupId: string, patch: TeamTaskGroupPatchRequest): Promise<ResolvedTeamTaskGroup> {
    try {
      const res = await fetch(`${this.baseUrl}/task-groups/${encodeURIComponent(groupId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      const body = (await res.json()) as TeamTaskGroupMutationResponse;
      const taskGroup = body.taskGroup ?? body.group;
      if (!taskGroup) throw { message: "malformed task group response", status: res.status };
      return taskGroup;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async archiveTaskGroup(groupId: string): Promise<ResolvedTeamTaskGroup> {
    try {
      const res = await fetch(`${this.baseUrl}/task-groups/${encodeURIComponent(groupId)}/archive`, {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      const body = (await res.json()) as TeamTaskGroupMutationResponse;
      const taskGroup = body.taskGroup ?? body.group;
      if (!taskGroup) throw { message: "malformed task group response", status: res.status };
      return taskGroup;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async startTaskGroupRun(groupId: string): Promise<TeamTaskGroupRun> {
    try {
      const res = await fetch(`${this.baseUrl}/task-groups/${encodeURIComponent(groupId)}/runs`, {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      const body = (await res.json()) as TeamTaskGroupRunMutationResponse;
      if (!body.groupRun) throw { message: "malformed task group run response", status: res.status };
      return body.groupRun;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listTaskGroupRuns(groupId: string): Promise<TeamTaskGroupRun[]> {
    try {
      const res = await fetchJsonGet<TeamTaskGroupRunListResponse>(`${this.baseUrl}/task-groups/${encodeURIComponent(groupId)}/runs`);
      if (!res.ok) throwJsonGetError(res);
      return Array.isArray(res.body?.groupRuns) ? res.body.groupRuns : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async getTaskGroupRun(groupRunId: string): Promise<TeamTaskGroupRun> {
    try {
      const res = await fetchJsonGet<TeamTaskGroupRunMutationResponse>(`${this.baseUrl}/task-group-runs/${encodeURIComponent(groupRunId)}`);
      if (!res.ok) throwJsonGetError(res);
      if (!res.body?.groupRun) throw { message: `请求失败 (${res.status})`, status: res.status };
      return res.body.groupRun;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async cancelTaskGroupRun(groupRunId: string): Promise<TeamTaskGroupRun> {
    try {
      const res = await fetch(`${this.baseUrl}/task-group-runs/${encodeURIComponent(groupRunId)}/cancel`, {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      const body = (await res.json()) as TeamTaskGroupRunMutationResponse;
      if (!body.groupRun) throw { message: "malformed task group run response", status: res.status };
      return body.groupRun;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listSourceNodes(): Promise<TeamCanvasSourceNode[]> {
    try {
      const res = await fetchJsonGet<TeamCanvasSourceNodeListResponse | TeamCanvasSourceNode[]>(`${this.baseUrl}/source-nodes`);
      if (!res.ok) throwJsonGetError(res);
      const body = res.body;
      if (Array.isArray(body)) return body;
      return Array.isArray(body?.sourceNodes) ? body.sourceNodes : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async createSourceNode(input: TeamCanvasSourceNodeCreateRequest): Promise<TeamCanvasSourceNode> {
    try {
      const res = await fetch(`${this.baseUrl}/source-nodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      const body = (await res.json()) as TeamCanvasSourceNodeMutationResponse;
      return body.sourceNode;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async updateSourceNode(sourceNodeId: string, patch: TeamCanvasSourceNodeUpdateRequest): Promise<TeamCanvasSourceNode> {
    try {
      const res = await fetch(`${this.baseUrl}/source-nodes/${encodeURIComponent(sourceNodeId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      const body = (await res.json()) as TeamCanvasSourceNodeMutationResponse;
      return body.sourceNode;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async archiveSourceNode(sourceNodeId: string): Promise<TeamCanvasSourceNode> {
    try {
      const res = await fetch(`${this.baseUrl}/source-nodes/${encodeURIComponent(sourceNodeId)}/archive`, {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      const body = (await res.json()) as TeamCanvasSourceNodeMutationResponse;
      return body.sourceNode;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listSourceConnections(): Promise<TeamCanvasSourceConnection[]> {
    try {
      const res = await fetchJsonGet<TeamCanvasSourceConnectionListResponse | TeamCanvasSourceConnection[]>(`${this.baseUrl}/source-connections`);
      if (!res.ok) throwJsonGetError(res);
      const body = res.body;
      if (Array.isArray(body)) return body;
      return Array.isArray(body?.connections) ? body.connections : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async createSourceConnection(input: TeamCanvasSourceConnectionCreateRequest): Promise<TeamCanvasSourceConnection> {
    try {
      const res = await fetch(`${this.baseUrl}/source-connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      const body = (await res.json()) as TeamCanvasSourceConnectionMutationResponse;
      return body.connection;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async deleteSourceConnection(connectionId: string): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/source-connections/${encodeURIComponent(connectionId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listTaskRuns(taskId: string): Promise<TeamRunState[]> {
    try {
      const res = await fetchJsonGet<TeamCanvasTaskRunListResponse | TeamRunState[]>(`${this.baseUrl}/tasks/${encodeURIComponent(taskId)}/runs`);
      if (!res.ok) throwJsonGetError(res);
      const body = res.body;
      if (Array.isArray(body)) return body;
      return Array.isArray(body?.runs) ? body.runs : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listTaskRunHistory(
    taskId: string,
    options?: { limit?: number; offset?: number; includeArchived?: boolean },
  ): Promise<TeamTaskRunHistoryResponse> {
    try {
      const params = new URLSearchParams();
      if (options?.limit != null) params.set("limit", String(options.limit));
      if (options?.offset != null) params.set("offset", String(options.offset));
      if (options?.includeArchived) params.set("includeArchived", "1");
      const query = params.toString();
      const res = await fetchJsonGet<TeamTaskRunHistoryResponse>(
        `${this.baseUrl}/tasks/${encodeURIComponent(taskId)}/run-history${query ? `?${query}` : ""}`,
      );
      if (!res.ok) throwJsonGetError(res);
      return res.body ?? { taskId, total: 0, limit: options?.limit ?? 50, offset: options?.offset ?? 0, hasMore: false, runs: [] };
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listTaskRunsByTaskIds(taskIds: string[], options?: { limit?: number; view?: "summary"; since?: string }): Promise<TeamCanvasTaskRunByTaskListResponse> {
    const unique = [...new Set(taskIds)];
    if (unique.length === 0) return { runsByTaskId: {}, deletedRunIdsByTaskId: {}, serverVersion: null };
    try {
      const chunks: string[][] = [];
      for (let i = 0; i < unique.length; i += TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE) {
        chunks.push(unique.slice(i, i + TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE));
      }
      const responses = await Promise.all(chunks.map(async (chunk) => {
        const params = new URLSearchParams({ taskIds: chunk.join(",") });
        if (options?.limit != null) params.set("limit", String(options.limit));
        if (options?.view) params.set("view", options.view);
        if (options?.since) params.set("since", options.since);
        const res = await fetchJsonGet<TeamCanvasTaskRunByTaskListResponse>(`${this.baseUrl}/task-runs/by-task?${params}`);
        if (!res.ok) throwJsonGetError(res);
        return res.body ?? { runsByTaskId: {} };
      }));
      const merged: Record<string, TeamRunState[]> = {};
      const deletedRunIdsByTaskId: Record<string, string[]> = {};
      let serverVersion: string | null = null;
      for (const response of responses) {
        for (const [id, runs] of Object.entries(response.runsByTaskId)) {
          merged[id] = runs;
        }
        for (const [id, runIds] of Object.entries(response.deletedRunIdsByTaskId ?? {})) {
          deletedRunIdsByTaskId[id] = runIds;
        }
        if (typeof response.serverVersion === "string" && (serverVersion === null || response.serverVersion > serverVersion)) {
          serverVersion = response.serverVersion;
        }
      }
      return { runsByTaskId: merged, deletedRunIdsByTaskId, serverVersion };
    } catch (e) {
      throw toApiError(e);
    }
  }

  async createTaskRun(taskId: string, input?: TeamTaskRunCreateRequest): Promise<TeamRunState> {
    try {
      const res = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(taskId)}/runs`, {
        method: "POST",
        headers: input ? { accept: "application/json", "Content-Type": "application/json" } : { accept: "application/json" },
        ...(input ? { body: JSON.stringify(input) } : {}),
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      return (await res.json()) as TeamRunState;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async getTaskRun(runId: string, options?: { view?: "summary"; taskId?: string }): Promise<TeamRunState> {
    try {
      const params = new URLSearchParams();
      if (options?.view) params.set("view", options.view);
      if (options?.taskId) params.set("taskId", options.taskId);
      const query = params.size > 0 ? `?${params}` : "";
      const res = await fetchJsonGet<TeamRunState>(`${this.baseUrl}/task-runs/${encodeURIComponent(runId)}${query}`);
      if (!res.ok) throwJsonGetError(res);
      if (!res.body) throw { message: `请求失败 (${res.status})`, status: res.status };
      if (typeof res.body.runId !== "string" && options?.view) {
        const fallback = await fetchJsonGet<TeamRunState>(`${this.baseUrl}/task-runs/${encodeURIComponent(runId)}`);
        if (!fallback.ok) throwJsonGetError(fallback);
        if (!fallback.body) throw { message: `请求失败 (${fallback.status})`, status: fallback.status };
        return fallback.body;
      }
      return res.body;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async getTaskRunProcessSummary(runId: string, taskId: string): Promise<TeamTaskRunProcessSummaryResponse> {
    try {
      const params = new URLSearchParams({ view: "process-summary", taskId });
      const res = await fetchJsonGet<TeamTaskRunProcessSummaryResponse>(`${this.baseUrl}/task-runs/${encodeURIComponent(runId)}?${params}`);
      if (!res.ok) throwJsonGetError(res);
      if (!res.body) throw { message: `请求失败 (${res.status})`, status: res.status };
      if (res.body.run && Array.isArray(res.body.attempts)) return res.body;
      const legacyRun = typeof (res.body as unknown as TeamRunState).runId === "string"
        ? res.body as unknown as TeamRunState
        : await this.getTaskRun(runId);
      return {
        run: legacyRun,
        attempts: await this.listTaskRunAttempts(runId, taskId),
      };
    } catch (e) {
      throw toApiError(e);
    }
  }

  async cancelTaskRun(runId: string): Promise<TeamRunState> {
    try {
      const res = await fetch(`${this.baseUrl}/task-runs/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      return (await res.json()) as TeamRunState;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async updateTaskRunAnnotation(runId: string, patch: TeamTaskRunAnnotationPatchRequest): Promise<TeamTaskRunAnnotationMutationResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/task-runs/${encodeURIComponent(runId)}/annotation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      return (await res.json()) as TeamTaskRunAnnotationMutationResponse;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listTaskRunAttempts(runId: string, taskId: string, options?: { view?: "dispatch-diagnostics" }): Promise<TeamAttemptMetadata[]> {
    try {
      const params = new URLSearchParams();
      if (options?.view) params.set("view", options.view);
      const query = params.size > 0 ? `?${params}` : "";
      const res = await fetchJsonGet<{ attempts?: TeamAttemptMetadata[] }>(`${this.baseUrl}/task-runs/${encodeURIComponent(runId)}/tasks/${encodeURIComponent(taskId)}/attempts${query}`);
      if (!res.ok) throwJsonGetError(res);
      return Array.isArray(res.body?.attempts) ? res.body.attempts : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async readTaskRunAttemptFile(runId: string, taskId: string, attemptId: string, fileName: string): Promise<string> {
    try {
      const res = await fetch(
        `${this.baseUrl}/task-runs/${encodeURIComponent(runId)}/tasks/${encodeURIComponent(taskId)}/attempts/${encodeURIComponent(attemptId)}/files/${encodeURIComponent(fileName)}`,
      );
      if (!res.ok) throw res;
      return await res.text();
    } catch (e) {
      throw toApiError(e);
    }
  }

  async updateTask(taskId: string, patch: TeamTaskUpdateRequest): Promise<TeamTaskMutationResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      return (await res.json()) as TeamTaskMutationResponse;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async cloneTask(taskId: string, input: TeamTaskCloneRequest): Promise<TeamTaskMutationResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(taskId)}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      return (await res.json()) as TeamTaskMutationResponse;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async archiveTask(taskId: string): Promise<TeamTaskMutationResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(taskId)}/archive`, {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      return (await res.json()) as TeamTaskMutationResponse;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async resetGeneratedTaskWorkUnit(taskId: string): Promise<TeamTaskMutationResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(taskId)}/generated-workunit/reset`, {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      return (await res.json()) as TeamTaskMutationResponse;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async getRunDetail(runId: string): Promise<RunDetail> {
    try {
      const res = await fetchJsonGet<RunDetail>(`${this.baseUrl}/runs/${encodeURIComponent(runId)}`);
      if (!res.ok) throwJsonGetError(res);
      if (!res.body) throw { message: `请求失败 (${res.status})`, status: res.status };
      return res.body;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listAttempts(runId: string, taskId: string): Promise<TeamAttemptMetadata[]> {
    try {
      const res = await fetchJsonGet<{ attempts?: TeamAttemptMetadata[] }>(`${this.baseUrl}/runs/${encodeURIComponent(runId)}/tasks/${encodeURIComponent(taskId)}/attempts`);
      if (!res.ok) throwJsonGetError(res);
      return Array.isArray(res.body?.attempts) ? res.body.attempts : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async readAttemptFile(runId: string, taskId: string, attemptId: string, fileName: string): Promise<string> {
    try {
      const res = await fetch(
        `${this.baseUrl}/runs/${encodeURIComponent(runId)}/tasks/${encodeURIComponent(taskId)}/attempts/${encodeURIComponent(attemptId)}/files/${encodeURIComponent(fileName)}`,
      );
      if (!res.ok) throw res;
      return await res.text();
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listAgents(): Promise<AgentSummary[]> {
    try {
      const res = await fetchJsonGet<AgentCatalogResponse>("/v1/agents");
      if (!res.ok) throwJsonGetError(res);
      return Array.isArray(res.body?.agents) ? res.body.agents : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listAgentRunStatuses(): Promise<AgentRunStatus[]> {
    try {
      const res = await fetchJsonGet<AgentRunStatusListResponse>("/v1/agents/status", {
        method: "GET",
        headers: { accept: "application/json" },
      });
      if (!res.ok) throwJsonGetError(res);
      return Array.isArray(res.body?.agents) ? res.body.agents : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async createAgentConversation(agentId: string): Promise<AgentConversationResponse> {
    try {
      const res = await fetch(`/v1/agents/${encodeURIComponent(agentId)}/chat/conversations`, {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw res;
      return (await res.json()) as AgentConversationResponse;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listAgentConversations(agentId: string): Promise<AgentConversationCatalogResponse> {
    try {
      const res = await fetch(`/v1/agents/${encodeURIComponent(agentId)}/chat/conversations`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw res;
      return (await res.json()) as AgentConversationCatalogResponse;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async switchAgentConversation(agentId: string, conversationId: string): Promise<AgentSwitchConversationResponse> {
    try {
      const res = await fetch(`/v1/agents/${encodeURIComponent(agentId)}/chat/current`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) throw res;
      return (await res.json()) as AgentSwitchConversationResponse;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async getAgentConversationState(agentId: string, conversationId: string, viewLimit = 80): Promise<AgentConversationState> {
    try {
      const params = new URLSearchParams({
        conversationId,
        viewLimit: String(viewLimit),
      });
      const res = await fetch(`/v1/agents/${encodeURIComponent(agentId)}/chat/state?${params.toString()}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw res;
      return (await res.json()) as AgentConversationState;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async getAgentChatStatus(agentId: string, conversationId: string): Promise<AgentChatStatus> {
    try {
      const res = await fetch(
        `/v1/agents/${encodeURIComponent(agentId)}/chat/status?conversationId=${encodeURIComponent(conversationId)}`,
        {
          method: "GET",
          headers: { accept: "application/json" },
        },
      );
      if (!res.ok) throw res;
      return (await res.json()) as AgentChatStatus;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async interruptAgentChat(agentId: string, conversationId: string): Promise<AgentInterruptResponse> {
    try {
      const res = await fetch(`/v1/agents/${encodeURIComponent(agentId)}/chat/interrupt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) throw res;
      return (await res.json()) as AgentInterruptResponse;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async sendAgentMessage(agentId: string, message: string, conversationId?: string, assetRefs?: string[]): Promise<AgentChatResponse> {
    try {
      const body = {
        message,
        ...(conversationId ? { conversationId } : {}),
        ...(assetRefs && assetRefs.length > 0 ? { assetRefs } : {}),
      };
      const res = await fetch(`/v1/agents/${encodeURIComponent(agentId)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw res;
      return (await res.json()) as AgentChatResponse;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async queueAgentMessage(agentId: string, request: AgentQueueMessageRequest): Promise<AgentQueueMessageResponse> {
    try {
      const body = {
        conversationId: request.conversationId,
        message: request.message,
        mode: request.mode,
        ...(request.userId ? { userId: request.userId } : {}),
        ...(request.browserId ? { browserId: request.browserId } : {}),
        ...(request.assetRefs && request.assetRefs.length > 0 ? { assetRefs: request.assetRefs } : {}),
      };
      const res = await fetch(`/v1/agents/${encodeURIComponent(agentId)}/chat/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw res;
      return (await res.json()) as AgentQueueMessageResponse;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async streamAgentMessage(
    agentId: string,
    request: AgentChatStreamRequest,
    onEvent: (event: AgentChatStreamEvent) => void,
  ): Promise<void> {
    try {
      const body = {
        message: request.message,
        ...(request.conversationId ? { conversationId: request.conversationId } : {}),
        ...(request.userId ? { userId: request.userId } : {}),
        ...(request.browserId ? { browserId: request.browserId } : {}),
        ...(request.assetRefs && request.assetRefs.length > 0 ? { assetRefs: request.assetRefs } : {}),
      };
      const res = await fetch(`/v1/agents/${encodeURIComponent(agentId)}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }

      let terminalError: string | null = null;
      await readAgentChatSse(res, (event) => {
        onEvent(event);
        if (event.type === "error") {
          terminalError = event.message;
        }
      });
      if (terminalError) {
        throw { message: terminalError };
      }
    } catch (e) {
      throw toApiError(e);
    }
  }

  async streamAgentConversationEvents(
    agentId: string,
    request: AgentConversationEventsRequest,
    onEvent: (event: AgentChatStreamEvent) => void,
  ): Promise<void> {
    try {
      const params = new URLSearchParams({
        conversationId: request.conversationId,
      });
      if (Number.isFinite(request.afterEventCursor) && request.afterEventCursor! > 0) {
        params.set("afterEventCursor", String(Math.trunc(request.afterEventCursor!)));
      }
      const init: RequestInit = {
        method: "GET",
        headers: { accept: "text/event-stream" },
      };
      if (request.signal) {
        init.signal = request.signal;
      }
      const res = await fetch(`/v1/agents/${encodeURIComponent(agentId)}/chat/events?${params.toString()}`, init);
      if (!res.ok) {
        throw await responseToApiError(res, `请求失败 (${res.status})`);
      }
      await readAgentChatSse(res, onEvent);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }
      throw toApiError(e);
    }
  }

  async listAssets(limit = 40): Promise<AgentAssetSummary[]> {
    try {
      const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.round(limit) : 40;
      const res = await fetch(`/v1/assets?limit=${encodeURIComponent(String(safeLimit))}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw res;
      const body = (await res.json()) as { assets?: AgentAssetSummary[] };
      return Array.isArray(body.assets) ? body.assets : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async uploadFilesAsAssets(files: File[], conversationId?: string): Promise<AgentAssetSummary[]> {
    try {
      const formData = new FormData();
      if (conversationId) {
        formData.append("conversationId", conversationId);
      }
      for (const file of files) {
        formData.append("files", file, file.name);
      }
      const res = await fetch("/v1/assets/upload", {
        method: "POST",
        headers: { accept: "application/json" },
        body: formData,
      });
      if (!res.ok) throw res;
      const body = (await res.json()) as { assets?: AgentAssetSummary[] };
      return Array.isArray(body.assets) ? body.assets : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

}
