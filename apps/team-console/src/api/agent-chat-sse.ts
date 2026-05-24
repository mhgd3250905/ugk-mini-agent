import type { AgentChatStreamEvent } from "./team-types";

export async function readAgentChatSse(
  response: Response,
  onEvent: (event: AgentChatStreamEvent) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw { message: "流式读取器不可用" };
  }

  const decoder = new TextDecoder();
  let buffer = "";

  function emitChunk(chunk: string) {
    const data = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data.trim()) return;
    try {
      onEvent(JSON.parse(data) as AgentChatStreamEvent);
    } catch {
      // Ignore malformed SSE frames; a later terminal event can still settle the stream.
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r/g, "");

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex !== -1) {
      const chunk = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      emitChunk(chunk);
      boundaryIndex = buffer.indexOf("\n\n");
    }

    if (done) {
      if (buffer.trim()) {
        emitChunk(buffer);
      }
      break;
    }
  }
}
