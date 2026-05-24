import type {
  AgentCatalogResponse,
  AgentAssetSummary,
  AgentChatResponse,
  AgentChatStatus,
  AgentConversationResponse,
  AgentInterruptResponse,
  AgentSummary,
  TeamPlan,
  RunDetail,
  TeamApiError,
  TeamRunState,
  TeamAttemptMetadata,
} from "./team-types";

export interface TeamApiProvider {
  listPlans(): Promise<TeamPlan[]>;
  listRuns(): Promise<TeamRunState[]>;
  getRunDetail(runId: string): Promise<RunDetail>;
  listAttempts(runId: string, taskId: string): Promise<TeamAttemptMetadata[]>;
  readAttemptFile(runId: string, taskId: string, attemptId: string, fileName: string): Promise<string>;
  listAgents(): Promise<AgentSummary[]>;
  createAgentConversation(agentId: string): Promise<AgentConversationResponse>;
  getAgentChatStatus(agentId: string, conversationId: string): Promise<AgentChatStatus>;
  interruptAgentChat(agentId: string, conversationId: string): Promise<AgentInterruptResponse>;
  sendAgentMessage(agentId: string, message: string, conversationId?: string, assetRefs?: string[]): Promise<AgentChatResponse>;
  listAssets(limit?: number): Promise<AgentAssetSummary[]>;
  uploadFilesAsAssets(files: File[], conversationId?: string): Promise<AgentAssetSummary[]>;
}

function toApiError(error: unknown): TeamApiError {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return { message: "无法连接服务器", status: 0 };
  }
  if (error instanceof Response) {
    return { message: `请求失败 (${error.status})`, status: error.status };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: "未知错误" };
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
