import type {
  AgentCatalogResponse,
  AgentChatResponse,
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
  sendAgentMessage(agentId: string, message: string): Promise<AgentChatResponse>;
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

  async sendAgentMessage(agentId: string, message: string): Promise<AgentChatResponse> {
    try {
      const res = await fetch(`/v1/agents/${encodeURIComponent(agentId)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw res;
      return (await res.json()) as AgentChatResponse;
    } catch (e) {
      throw toApiError(e);
    }
  }
}
