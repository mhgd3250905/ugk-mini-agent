import assert from "node:assert/strict";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getCurrentAgentScope } from "../src/agent/agent-scope-context.js";
import type { AgentSessionLike, RawAgentSessionEventLike } from "../src/agent/agent-session-factory.js";
import type { AssetRecord, AssetStoreLike, ChatAttachment, StoredAssetRecord } from "../src/agent/asset-store.js";
import { BackgroundAgentProfileResolver } from "../src/agent/background-agent-profile.js";
import { BackgroundAgentRunner, type BackgroundAgentSessionFactory } from "../src/agent/background-agent-runner.js";
import { BackgroundWorkspaceManager } from "../src/agent/background-workspace.js";
import { ConnDatabase } from "../src/agent/conn-db.js";
import { ConnRunStore } from "../src/agent/conn-run-store.js";
import { ConnSqliteStore } from "../src/agent/conn-sqlite-store.js";
import type { AgentFileArtifact, AgentFileDraft } from "../src/agent/file-artifacts.js";

export class FakeAssetStore implements AssetStoreLike {
	async registerAttachments(_conversationId: string, _attachments: readonly ChatAttachment[]): Promise<AssetRecord[]> {
		return [];
	}
	async saveFiles(_conversationId: string, _files: readonly AgentFileDraft[]): Promise<AgentFileArtifact[]> {
		return [];
	}
	async listAssets(): Promise<AssetRecord[]> {
		return [];
	}
	async getAsset(): Promise<AssetRecord | undefined> {
		return undefined;
	}
	async resolveAssets(): Promise<AssetRecord[]> {
		return [];
	}
	async readText(): Promise<string | undefined> {
		return undefined;
	}
	async getFile(): Promise<StoredAssetRecord | undefined> {
		return undefined;
	}
}

export class FakeSession implements AgentSessionLike {
	sessionFile = "background-session.json";
	messages: Array<{ role: string; content?: unknown; stopReason?: string; errorMessage?: string }> = [];
	private listener?: (event: RawAgentSessionEventLike) => void;

	constructor(private readonly options: { resultText?: string; error?: Error }) {}

	subscribe(listener: (event: RawAgentSessionEventLike) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	async prompt(message: string): Promise<void> {
		this.messages.push({ role: "user", content: message });
		this.listener?.({
			type: "message_update",
			assistantMessageEvent: {
				type: "text_delta",
				delta: "working...",
			},
		});
		if (this.options.error) {
			throw this.options.error;
		}
		this.messages.push({ role: "assistant", content: this.options.resultText ?? "done" });
	}
}

export class ScopeObservingSession extends FakeSession {
	observedScope: string | undefined;

	constructor() {
		super({ resultText: "scoped result" });
	}

	override async prompt(message: string): Promise<void> {
		this.observedScope = getCurrentAgentScope()?.scope;
		await super.prompt(message);
	}
}

export class AbortableSession implements AgentSessionLike {
	sessionFile = "background-session.json";
	messages: Array<{ role: string; content?: unknown; stopReason?: string; errorMessage?: string }> = [];
	abortCalls = 0;
	private listener?: (event: RawAgentSessionEventLike) => void;
	private rejectPrompt?: (error: Error) => void;

	subscribe(listener: (event: RawAgentSessionEventLike) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	async prompt(message: string): Promise<void> {
		this.messages.push({ role: "user", content: message });
		this.listener?.({
			type: "message_update",
			assistantMessageEvent: {
				type: "text_delta",
				delta: "working...",
			},
		});
		await new Promise<void>((_resolve, reject) => {
			this.rejectPrompt = reject;
		});
	}

	async abort(): Promise<void> {
		this.abortCalls += 1;
		this.rejectPrompt?.(new Error("session aborted"));
	}
}

export class FakeSessionFactory implements BackgroundAgentSessionFactory {
	createdInputs: unknown[] = [];

	constructor(private readonly session: AgentSessionLike) {}

	async createSession(input: unknown): Promise<AgentSessionLike> {
		this.createdInputs.push(input);
		return this.session;
	}
}

export class StructuredAssistantSession extends FakeSession {
	constructor() {
		super({});
	}

	override async prompt(message: string): Promise<void> {
		this.messages.push({ role: "user", content: message });
		this.messages.push({
			role: "assistant",
			content: [
				{
					type: "thinking",
					thinking: "internal reasoning",
					thinkingSignature: "reasoning_content",
				},
				{
					type: "toolCall",
					id: "tool-1",
					name: "bash",
					arguments: {
						command: "echo hi",
					},
				},
				{
					type: "text",
					text: "visible answer",
				},
			],
		});
	}
}

export class TrailingOutputSummarySession extends FakeSession {
	constructor() {
		super({});
	}

	override async prompt(message: string): Promise<void> {
		this.messages.push({ role: "user", content: message });
		this.messages.push({
			role: "assistant",
			content: [
				{
					type: "text",
					text: "任务名字是：**2min**",
				},
				{
					type: "toolCall",
					id: "tool-write",
					name: "write",
					arguments: {
						path: "output/result.txt",
					},
				},
			],
		});
		this.messages.push({
			role: "toolResult",
			content: [
				{
					type: "text",
					text: "Successfully wrote 10 bytes to output/result.txt",
				},
			],
		});
		this.messages.push({
			role: "assistant",
			content: [
				{
					type: "text",
					text: "任务完成。输出文件已写入 `output/result.txt`。",
				},
			],
		});
	}
}

export class ProviderErrorSession extends FakeSession {
	constructor() {
		super({});
	}

	override async prompt(message: string): Promise<void> {
		this.messages.push({ role: "user", content: message });
		this.messages.push({
			role: "assistant",
			content: "provider failed",
			stopReason: "error",
			errorMessage: "401 invalid access token",
		});
	}
}

export class OutputWritingSession extends FakeSession {
	constructor() {
		super({ resultText: "任务完成。输出文件已写入 `output/result.txt`。" });
	}

	override async prompt(message: string): Promise<void> {
		const outputDir = extractPromptPath(message, "- Write final deliverables to:");
		await writeFile(join(outputDir, "result.txt"), "任务名字: 2min", "utf8");
		await super.prompt(message);
	}
}

export class DelayedSession extends FakeSession {
	constructor() {
		super({ resultText: "delayed result" });
	}

	override async prompt(message: string): Promise<void> {
		await delay(20);
		await super.prompt(message);
	}
}

export function extractPromptPath(message: string, prefix: string): string {
	const line = message.split(/\r?\n/).find((entry) => entry.startsWith(prefix));
	assert.ok(line, `expected prompt to include ${prefix}`);
	return line.slice(prefix.length).trim();
}

export async function createRunner(options?: {
	session?: AgentSessionLike;
	runStore?: ConnRunStore;
	publicBaseUrl?: string;
	publicDir?: string;
	profileResolver?: ConstructorParameters<typeof BackgroundAgentRunner>[0]["profileResolver"];
}) {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-background-runner-"));
	const database = new ConnDatabase({ dbPath: join(root, "conn.sqlite") });
	await database.initialize();
	const connStore = new ConnSqliteStore({ database });
	const realRunStore = new ConnRunStore({ database });
	const runStore = options?.runStore ?? realRunStore;
	const assetStore = new FakeAssetStore();
	const session = options?.session ?? new FakeSession({ resultText: "final answer" });
	const sessionFactory = new FakeSessionFactory(session as FakeSession);
	const runner = new BackgroundAgentRunner({
		runStore,
		profileResolver: options?.profileResolver ?? new BackgroundAgentProfileResolver({ projectRoot: root }),
		workspaceManager: new BackgroundWorkspaceManager({
			backgroundDataDir: join(root, "background"),
			assetStore,
		}),
		sessionFactory,
		publicBaseUrl: options?.publicBaseUrl,
		publicDir: options?.publicDir,
	});
	return { root, database, connStore, runStore, realRunStore, sessionFactory, runner, session };
}

export function databasePathSafeRoot(): string {
	return join(tmpdir(), "ugk-pi-background-runner-placeholder");
}
