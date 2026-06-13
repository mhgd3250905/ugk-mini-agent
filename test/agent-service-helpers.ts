import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
	AgentSessionFactory,
	AgentSessionLike,
	MessageUpdateEventLike,
	PromptOptionsLike,
	RawAgentSessionEventLike,
	RecentSessionMessagesInput,
	RecentSessionMessagesResult,
} from "../src/agent/agent-session-factory.js";
import type { AssetRecord, ChatAttachment } from "../src/agent/asset-store.js";
import { ConversationStore } from "../src/agent/conversation-store.js";
import { buildPromptWithAssetContext } from "../src/agent/file-artifacts.js";
import { getCurrentAgentScope } from "../src/agent/agent-scope-context.js";

export function restoreEnvValue(key: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

export class FakeSession implements AgentSessionLike {
	public prompts: Array<{ message: string; options?: PromptOptionsLike }> = [];
	public abortCalls = 0;
	public messages: Array<{
		role: string;
		content?: Array<{ type: string; text?: string }>;
		stopReason?: string;
		errorMessage?: string;
	}> = [];

	constructor(
		public sessionFile: string | undefined,
		private readonly events: RawAgentSessionEventLike[],
		private readonly finalAssistantText?: string,
		private readonly finalAssistantError?: string,
	) {}

	subscribe(listener: (event: RawAgentSessionEventLike) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		this.prompts.push({ message, options });
		for (const event of this.events) {
			this.listener?.(event);
		}

		this.messages.push({
			role: "assistant",
			content: this.finalAssistantText
				? [
						{
							type: "text",
							text: this.finalAssistantText,
						},
					]
				: [],
			stopReason: this.finalAssistantError ? "error" : "stop",
			errorMessage: this.finalAssistantError,
		});
	}

	async abort(): Promise<void> {
		this.abortCalls += 1;
	}

	emit(event: RawAgentSessionEventLike): void {
		this.listener?.(event);
	}

	private listener?: (event: RawAgentSessionEventLike) => void;
}

export class DeferredSession extends FakeSession {
	private resolvePrompt?: () => void;
	public promptStarted?: Promise<void>;
	private resolvePromptStarted?: () => void;
	public steerCalls: string[] = [];
	public followUpCalls: string[] = [];

	constructor(sessionFile: string | undefined) {
		super(sessionFile, []);
		this.promptStarted = new Promise((resolve) => {
			this.resolvePromptStarted = resolve;
		});
	}

	override async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		this.prompts.push({ message, options });
		if (options?.streamingBehavior) {
			return;
		}
		this.resolvePromptStarted?.();
		await new Promise<void>((resolve) => {
			this.resolvePrompt = resolve;
		});
		this.messages.push({
			role: "assistant",
			content: [{ type: "text", text: "done after control" }],
			stopReason: this.abortCalls > 0 ? "aborted" : "stop",
		});
	}

	finish(): void {
		this.resolvePrompt?.();
	}

	override async abort(): Promise<void> {
		this.abortCalls += 1;
		this.finish();
	}

	async steer(message: string): Promise<void> {
		this.steerCalls.push(message);
	}

	async followUp(message: string): Promise<void> {
		this.followUpCalls.push(message);
	}
}

export class TerminalOverlapSession extends FakeSession {
	private resolvePrompt?: () => void;
	public promptStarted?: Promise<void>;
	private resolvePromptStarted?: () => void;

	constructor(
		sessionFile: string | undefined,
		private readonly persistedUserText: string,
		private readonly persistedAssistantText: string,
	) {
		super(sessionFile, []);
		this.promptStarted = new Promise((resolve) => {
			this.resolvePromptStarted = resolve;
		});
	}

	override async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		this.prompts.push({ message, options });
		if (options?.streamingBehavior) {
			return;
		}
		this.resolvePromptStarted?.();
		await new Promise<void>((resolve) => {
			this.resolvePrompt = resolve;
		});
		this.messages.push(
			{
				role: "user",
				content: buildPromptWithAssetContext(this.persistedUserText),
			} as never,
			{
				role: "assistant",
				content: [{ type: "text", text: this.persistedAssistantText }],
				stopReason: "stop",
			},
		);
	}

	finish(): void {
		this.resolvePrompt?.();
	}
}

export class TerminalNoPersistSession extends FakeSession {
	private resolvePrompt?: () => void;
	public promptStarted?: Promise<void>;
	private resolvePromptStarted?: () => void;

	constructor(sessionFile: string | undefined) {
		super(sessionFile, []);
		this.promptStarted = new Promise((resolve) => {
			this.resolvePromptStarted = resolve;
		});
	}

	override async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		this.prompts.push({ message, options });
		if (options?.streamingBehavior) {
			return;
		}
		this.resolvePromptStarted?.();
		await new Promise<void>((resolve) => {
			this.resolvePrompt = resolve;
		});
	}

	finish(): void {
		this.resolvePrompt?.();
	}
}

export class EnvAwareSession extends FakeSession {
	public observedAgentScope?: string;

	override async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		this.observedAgentScope = getCurrentAgentScope()?.scope;
		await super.prompt(message, options);
	}
}

export class StrictQueueSession extends DeferredSession {
	override async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		if (options?.streamingBehavior) {
			throw new Error(`queueMessage must use explicit queue APIs, got prompt(${options.streamingBehavior}) for ${message}`);
		}
		await super.prompt(message, options);
	}
}

export class InterruptHistorySession implements AgentSessionLike {
	public prompts: Array<{ message: string; options?: PromptOptionsLike }> = [];
	public abortCalls = 0;
	public messages: Array<{
		role: string;
		content?: Array<{ type: string; text?: string }> | string;
		stopReason?: string;
		errorMessage?: string;
	}> = [];
	public steerCalls: string[] = [];
	public promptStarted: Promise<void>;

	private resolvePrompt?: () => void;
	private resolvePromptStarted?: () => void;
	private listener?: (event: RawAgentSessionEventLike) => void;

	constructor(public sessionFile: string | undefined) {
		this.promptStarted = new Promise((resolve) => {
			this.resolvePromptStarted = resolve;
		});
	}

	subscribe(listener: (event: RawAgentSessionEventLike) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		this.prompts.push({ message, options });
		if (options?.streamingBehavior) {
			return;
		}

		this.messages.push({
			role: "user",
			content: buildPromptWithAssetContext(message),
		});
		this.resolvePromptStarted?.();
		await new Promise<void>((resolve) => {
			this.resolvePrompt = resolve;
		});
	}

	async abort(): Promise<void> {
		this.abortCalls += 1;
		this.finish();
	}

	async steer(message: string): Promise<void> {
		this.steerCalls.push(message);
		this.messages.push({
			role: "user",
			content: buildPromptWithAssetContext(message),
		});
	}

	emit(event: RawAgentSessionEventLike): void {
		this.listener?.(event);
	}

	finish(): void {
		this.resolvePrompt?.();
	}

	appendAssistant(text: string): void {
		this.messages.push({
			role: "assistant",
			content: [{ type: "text", text }],
			stopReason: "stop",
		});
	}
}

export class FakeAgentSessionFactory implements AgentSessionFactory {
	public calls: Array<{ agentRunScope?: string; conversationId: string; sessionFile?: string }> = [];
	public readCalls: string[] = [];
	public readRecentCalls: Array<{ sessionFile: string; input: RecentSessionMessagesInput }> = [];
	public availableSkills: Array<{ name: string; path?: string }> = [];
	public skillFingerprint?: string;
	public readonly persistedMessages = new Map<
		string,
		NonNullable<AgentSessionLike["messages"]>
	>();
	public readonly recentMessages = new Map<string, RecentSessionMessagesResult>();

	constructor(private readonly buildSession: (callIndex: number) => AgentSessionLike) {}

	async createSession(input: { agentRunScope?: string; conversationId: string; sessionFile?: string }): Promise<AgentSessionLike> {
		this.calls.push(input);
		return this.buildSession(this.calls.length - 1);
	}

	async readSessionMessages(sessionFile: string): Promise<NonNullable<AgentSessionLike["messages"]> | undefined> {
		this.readCalls.push(sessionFile);
		return this.persistedMessages.get(sessionFile);
	}

	async readRecentSessionMessages(
		sessionFile: string,
		input: RecentSessionMessagesInput,
	): Promise<RecentSessionMessagesResult | undefined> {
		this.readRecentCalls.push({ sessionFile, input });
		return this.recentMessages.get(sessionFile);
	}

	async getAvailableSkills(): Promise<{
		skills: Array<{ name: string; path?: string }>;
		source: "fresh" | "cache";
		cachedAt: string;
	}> {
		return {
			skills: this.availableSkills,
			source: "fresh",
			cachedAt: "2026-04-24T00:00:00.000Z",
		};
	}

	async getSkillFingerprint(): Promise<string | undefined> {
		return this.skillFingerprint;
	}

	getDefaultModelContext() {
		return {
			provider: "zhipu-glm",
			model: "glm-5.1",
			contextWindow: 128000,
			maxResponseTokens: 16384,
			reserveTokens: 16384,
		};
	}
}

export class FakeAssetStore {
	public savedAttachments: Array<{
		conversationId: string;
		attachments: readonly ChatAttachment[];
	}> = [];
	public saved: Array<{
		conversationId: string;
		files: Array<{ fileName: string; mimeType: string; content: string }>;
	}> = [];
	private readonly assets = new Map<string, AssetRecord>();
	private readonly assetTexts = new Map<string, string>();

	async registerAttachments(conversationId: string, attachments: readonly ChatAttachment[]): Promise<AssetRecord[]> {
		this.savedAttachments.push({ conversationId, attachments });
		return attachments.map((attachment, index) => {
			const asset = {
				assetId: `asset-upload-${index + 1}`,
				reference: `@asset[asset-upload-${index + 1}]`,
				fileName: attachment.fileName,
				mimeType: attachment.mimeType ?? "application/octet-stream",
				sizeBytes: attachment.sizeBytes ?? 0,
				kind: typeof attachment.text === "string" ? ("text" as const) : ("metadata" as const),
				hasContent: typeof attachment.text === "string",
				source: "user_upload" as const,
				conversationId,
				createdAt: "2026-04-18T00:00:00.000Z",
				...(typeof attachment.text === "string" ? { textPreview: attachment.text } : {}),
				...(typeof attachment.text === "string" ? { downloadUrl: `/v1/files/asset-upload-${index + 1}` } : {}),
			} satisfies AssetRecord;
			this.assets.set(asset.assetId, asset);
			if (typeof attachment.text === "string") {
				this.assetTexts.set(asset.assetId, attachment.text);
			}
			return asset;
		});
	}

	async saveFiles(
		conversationId: string,
		files: Array<{ fileName: string; mimeType: string; content: string }>,
	): Promise<Array<{ id: string; assetId: string; reference: string; fileName: string; mimeType: string; sizeBytes: number; downloadUrl: string }>> {
		this.saved.push({ conversationId, files });
		return files.map((file, index) => ({
			id: `file-${index + 1}`,
			assetId: `file-${index + 1}`,
			reference: `@asset[file-${index + 1}]`,
			fileName: file.fileName,
			mimeType: file.mimeType,
			sizeBytes: Buffer.byteLength(file.content, "utf8"),
			downloadUrl: `/v1/files/file-${index + 1}`,
		}));
	}

	async listAssets(): Promise<AssetRecord[]> {
		return [...this.assets.values()];
	}

	async getAsset(assetId: string): Promise<AssetRecord | undefined> {
		return this.assets.get(assetId);
	}

	async resolveAssets(assetIds: readonly string[]): Promise<AssetRecord[]> {
		return assetIds.map((assetId) => this.assets.get(assetId)).filter((asset): asset is AssetRecord => Boolean(asset));
	}

	async readText(assetId: string): Promise<string | undefined> {
		return this.assetTexts.get(assetId);
	}

	async getFile(assetId: string): Promise<
		| {
				assetId: string;
				reference: string;
				fileName: string;
				mimeType: string;
				sizeBytes: number;
				kind: "text";
				hasContent: true;
				source: "agent_output";
				conversationId: string;
				createdAt: string;
				downloadUrl: string;
				content: Buffer;
		  }
		| undefined
	> {
		if (assetId !== "file-1") {
			return undefined;
		}
		return {
			assetId: "file-1",
			reference: "@asset[file-1]",
			fileName: "hello.txt",
			mimeType: "text/plain",
			sizeBytes: 16,
			kind: "text",
			hasContent: true,
			source: "agent_output",
			conversationId: "manual:file-output",
			createdAt: "2026-04-18T00:00:00.000Z",
			downloadUrl: "/v1/files/file-1",
			content: Buffer.from("hello from agent", "utf8"),
		};
	}

	seedAsset(asset: AssetRecord, text?: string): void {
		this.assets.set(asset.assetId, asset);
		if (typeof text === "string") {
			this.assetTexts.set(asset.assetId, text);
		}
	}
}

export async function createStore(): Promise<ConversationStore> {
	const dir = await mkdtemp(join(tmpdir(), "ugk-pi-agent-service-"));
	return new ConversationStore(join(dir, "conversation-index.json"));
}

export function textDelta(delta: string): MessageUpdateEventLike {
	return {
		type: "message_update",
		assistantMessageEvent: {
			type: "text_delta",
			delta,
		},
	};
}

export function sendFileToolFinished(file: {
	assetId: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	downloadUrl: string;
}): RawAgentSessionEventLike {
	return {
		type: "tool_execution_end",
		toolCallId: "tool-send-file",
		toolName: "send_file",
		isError: false,
		result: {
			content: [{ type: "text", text: `File ready: ${file.fileName}` }],
			details: {
				action: "send",
				file: {
					id: file.assetId,
					assetId: file.assetId,
					reference: `@asset[${file.assetId}]`,
					fileName: file.fileName,
					mimeType: file.mimeType,
					sizeBytes: file.sizeBytes,
					downloadUrl: file.downloadUrl,
				},
			},
		},
	};
}
