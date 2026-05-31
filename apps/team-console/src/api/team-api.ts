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
  TeamCanvasTaskRunListResponse,
  TeamCanvasSourceConnection,
  TeamCanvasSourceConnectionCreateRequest,
  TeamCanvasSourceConnectionListResponse,
  TeamCanvasSourceConnectionMutationResponse,
  TeamCanvasSourceNode,
  TeamCanvasSourceNodeCreateRequest,
  TeamCanvasSourceNodeListResponse,
  TeamCanvasSourceNodeMutationResponse,
  TeamCanvasSourceNodeUpdateRequest,
  TeamTaskConnection,
  TeamTaskConnectionCreateRequest,
  TeamTaskConnectionListResponse,
  TeamTaskConnectionMutationResponse,
  TeamTaskDependency,
  TeamTaskDependencyCreateRequest,
  TeamTaskDependencyListResponse,
  TeamTaskDependencyMutationResponse,
  TeamTaskMutationResponse,
  TeamTaskUpdateRequest,
  TeamPlan,
  RunDetail,
  TeamApiError,
  TeamRunState,
  TeamAttemptMetadata,
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
  listTasks(): Promise<TeamCanvasTask[]>;
  listGeneratedTasks(
    discoveryTaskId: string,
    options?: { includeArchived?: boolean },
  ): Promise<TeamCanvasTask[]>;
  updateTask(taskId: string, patch: TeamTaskUpdateRequest): Promise<TeamTaskMutationResponse>;
  resetGeneratedTaskWorkUnit(taskId: string): Promise<TeamTaskMutationResponse>;
  archiveTask(taskId: string): Promise<TeamTaskMutationResponse>;
  listTaskConnections(): Promise<TeamTaskConnection[]>;
  createTaskConnection(input: TeamTaskConnectionCreateRequest): Promise<TeamTaskConnection>;
  deleteTaskConnection(connectionId: string): Promise<void>;
  listTaskDependencies(): Promise<TeamTaskDependency[]>;
  createTaskDependency(input: TeamTaskDependencyCreateRequest): Promise<TeamTaskDependency>;
  deleteTaskDependency(dependencyId: string): Promise<void>;
  listSourceNodes(): Promise<TeamCanvasSourceNode[]>;
  createSourceNode(input: TeamCanvasSourceNodeCreateRequest): Promise<TeamCanvasSourceNode>;
  updateSourceNode(sourceNodeId: string, patch: TeamCanvasSourceNodeUpdateRequest): Promise<TeamCanvasSourceNode>;
  archiveSourceNode(sourceNodeId: string): Promise<TeamCanvasSourceNode>;
  listSourceConnections(): Promise<TeamCanvasSourceConnection[]>;
  createSourceConnection(input: TeamCanvasSourceConnectionCreateRequest): Promise<TeamCanvasSourceConnection>;
  deleteSourceConnection(connectionId: string): Promise<void>;
  listTaskRuns(taskId: string): Promise<TeamRunState[]>;
  createTaskRun(taskId: string): Promise<TeamRunState>;
  getTaskRun(runId: string): Promise<TeamRunState>;
  cancelTaskRun(runId: string): Promise<TeamRunState>;
  listTaskRunAttempts(runId: string, taskId: string): Promise<TeamAttemptMetadata[]>;
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

export class LiveTeamApi implements TeamApiProvider {
  constructor(private baseUrl: string = "/v1/team") {}

  async listPlans(): Promise<TeamPlan[]> {
    try {
      const res = await fetch(`${this.baseUrl}/plans`);
      if (!res.ok) throw res;
      return (await res.json()) as TeamPlan[];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listRuns(): Promise<TeamRunState[]> {
    try {
      const res = await fetch(`${this.baseUrl}/runs`);
      if (!res.ok) throw res;
      return (await res.json()) as TeamRunState[];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listTasks(): Promise<TeamCanvasTask[]> {
    try {
      const res = await fetch(`${this.baseUrl}/tasks`);
      if (!res.ok) throw res;
      const body = (await res.json()) as TeamCanvasTaskListResponse | TeamCanvasTask[];
      if (Array.isArray(body)) return body;
      return Array.isArray(body.tasks) ? body.tasks : [];
    } catch (e) {
      throw toApiError(e);
    }
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
      const res = await fetch(
        `${this.baseUrl}/tasks/${encodeURIComponent(discoveryTaskId)}/generated-tasks${query ? `?${query}` : ""}`,
      );
      if (res.status === 404) return [];
      if (!res.ok) throw res;
      const body = (await res.json()) as TeamCanvasTaskListResponse | TeamCanvasTask[];
      if (Array.isArray(body)) return body;
      return Array.isArray(body.tasks) ? body.tasks : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listTaskConnections(): Promise<TeamTaskConnection[]> {
    try {
      const res = await fetch(`${this.baseUrl}/task-connections`);
      if (res.status === 404) return [];
      if (!res.ok) throw res;
      const body = (await res.json()) as TeamTaskConnectionListResponse | TeamTaskConnection[];
      if (Array.isArray(body)) return body;
      return Array.isArray(body.connections) ? body.connections : [];
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
      const res = await fetch(`${this.baseUrl}/task-dependencies`);
      if (res.status === 404) return [];
      if (!res.ok) throw res;
      const body = (await res.json()) as TeamTaskDependencyListResponse | TeamTaskDependency[];
      if (Array.isArray(body)) return body;
      return Array.isArray(body.dependencies) ? body.dependencies : [];
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

  async listSourceNodes(): Promise<TeamCanvasSourceNode[]> {
    try {
      const res = await fetch(`${this.baseUrl}/source-nodes`);
      if (!res.ok) throw res;
      const body = (await res.json()) as TeamCanvasSourceNodeListResponse | TeamCanvasSourceNode[];
      if (Array.isArray(body)) return body;
      return Array.isArray(body.sourceNodes) ? body.sourceNodes : [];
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
      const res = await fetch(`${this.baseUrl}/source-connections`);
      if (!res.ok) throw res;
      const body = (await res.json()) as TeamCanvasSourceConnectionListResponse | TeamCanvasSourceConnection[];
      if (Array.isArray(body)) return body;
      return Array.isArray(body.connections) ? body.connections : [];
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
      const res = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(taskId)}/runs`);
      if (!res.ok) throw res;
      const body = (await res.json()) as TeamCanvasTaskRunListResponse | TeamRunState[];
      if (Array.isArray(body)) return body;
      return Array.isArray(body.runs) ? body.runs : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async createTaskRun(taskId: string): Promise<TeamRunState> {
    try {
      const res = await fetch(`${this.baseUrl}/tasks/${encodeURIComponent(taskId)}/runs`, {
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

  async getTaskRun(runId: string): Promise<TeamRunState> {
    try {
      const res = await fetch(`${this.baseUrl}/task-runs/${encodeURIComponent(runId)}`);
      if (!res.ok) throw res;
      return (await res.json()) as TeamRunState;
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

  async listTaskRunAttempts(runId: string, taskId: string): Promise<TeamAttemptMetadata[]> {
    try {
      const res = await fetch(`${this.baseUrl}/task-runs/${encodeURIComponent(runId)}/tasks/${encodeURIComponent(taskId)}/attempts`);
      if (!res.ok) throw res;
      const body = (await res.json()) as { attempts?: TeamAttemptMetadata[] };
      return Array.isArray(body.attempts) ? body.attempts : [];
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
      const res = await fetch(`${this.baseUrl}/runs/${encodeURIComponent(runId)}`);
      if (!res.ok) throw res;
      return (await res.json()) as RunDetail;
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listAttempts(runId: string, taskId: string): Promise<TeamAttemptMetadata[]> {
    try {
      const res = await fetch(`${this.baseUrl}/runs/${encodeURIComponent(runId)}/tasks/${encodeURIComponent(taskId)}/attempts`);
      if (!res.ok) throw res;
      const body = (await res.json()) as { attempts?: TeamAttemptMetadata[] };
      return Array.isArray(body.attempts) ? body.attempts : [];
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
      const res = await fetch("/v1/agents");
      if (!res.ok) throw res;
      const body = (await res.json()) as AgentCatalogResponse;
      return Array.isArray(body.agents) ? body.agents : [];
    } catch (e) {
      throw toApiError(e);
    }
  }

  async listAgentRunStatuses(): Promise<AgentRunStatus[]> {
    try {
      const res = await fetch("/v1/agents/status", {
        method: "GET",
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw res;
      const body = (await res.json()) as AgentRunStatusListResponse;
      return Array.isArray(body.agents) ? body.agents : [];
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
