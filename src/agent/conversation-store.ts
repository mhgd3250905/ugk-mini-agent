import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { renameWithTransientRetry, type RenameFile } from "../file-system.js";

export interface ConversationEntry {
	sessionFile?: string;
	updatedAt: string;
	createdAt?: string;
	skillFingerprint?: string;
	title?: string;
	preview?: string;
	messageCount?: number;
	pinned?: boolean;
	backgroundColor?: string;
}

export interface ConversationListEntry extends ConversationEntry {
	conversationId: string;
}

interface ConversationStoreState {
	currentConversationId?: string;
	conversations: Record<string, ConversationEntry>;
}

type LegacyConversationIndex = Record<string, ConversationEntry>;

interface CachedConversationStoreState {
	mtimeKey: number;
	state: ConversationStoreState;
}

interface ConversationStoreOptions {
	renameFile?: RenameFile;
	renameMaxAttempts?: number;
	renameRetryDelayMs?: number;
}

const FALLBACK_ENTRY_UPDATED_AT = new Date(0).toISOString();

export class ConversationStore {
	private cache?: CachedConversationStoreState;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(
		private readonly indexPath: string,
		private readonly options: ConversationStoreOptions = {},
	) {}

	async get(conversationId: string): Promise<ConversationEntry | undefined> {
		const state = await this.readState();
		return this.cloneEntry(state.conversations[conversationId]);
	}

	async set(
		conversationId: string,
		sessionFile?: string,
		options?: {
			skillFingerprint?: string;
			title?: string;
			preview?: string;
			messageCount?: number;
		},
	): Promise<ConversationEntry> {
		return this.mutateState((state) => {
			const now = new Date().toISOString();
			const existing = state.conversations[conversationId];
			const entry: ConversationEntry = {
				sessionFile: sessionFile ?? existing?.sessionFile,
				updatedAt: now,
				createdAt: existing?.createdAt ?? now,
				skillFingerprint: options?.skillFingerprint ?? existing?.skillFingerprint,
				title: options?.title ?? existing?.title,
				preview: options?.preview ?? existing?.preview,
				messageCount: options?.messageCount ?? existing?.messageCount ?? 0,
				pinned: existing?.pinned,
				backgroundColor: existing?.backgroundColor,
			};

			state.conversations[conversationId] = entry;
			return this.cloneEntry(entry) ?? entry;
		});
	}

	async delete(conversationId: string): Promise<void> {
		await this.mutateState((state) => {
			if (!(conversationId in state.conversations)) {
				return;
			}

			delete state.conversations[conversationId];
			if (state.currentConversationId === conversationId) {
				const fallback = this.sortEntries(state).at(0);
				state.currentConversationId = fallback?.conversationId;
			}
		});
	}

	async updateMetadata(
		conversationId: string,
		patch: {
			title?: string;
			pinned?: boolean;
			backgroundColor?: string;
		},
	): Promise<ConversationEntry | undefined> {
		return this.mutateState((state) => {
			const existing = state.conversations[conversationId];
			if (!existing) {
				return undefined;
			}

			if (patch.title !== undefined) {
				existing.title = patch.title;
			}
			if (patch.pinned !== undefined) {
				existing.pinned = patch.pinned;
			}
			if (patch.backgroundColor !== undefined) {
				if (patch.backgroundColor) {
					existing.backgroundColor = patch.backgroundColor;
				} else {
					delete existing.backgroundColor;
				}
			}

			return this.cloneEntry(existing);
		});
	}

	async list(): Promise<ConversationListEntry[]> {
		const state = await this.readState();
		return this.sortEntries(state);
	}

	async getCurrentConversationId(): Promise<string | undefined> {
		const state = await this.readState();
		return state.currentConversationId;
	}

	async setCurrentConversationId(conversationId: string): Promise<void> {
		await this.mutateState((state) => {
			const now = new Date().toISOString();
			if (!state.conversations[conversationId]) {
				state.conversations[conversationId] = {
					updatedAt: now,
					createdAt: now,
					messageCount: 0,
				};
			}
			state.currentConversationId = conversationId;
		});
	}

	private async readState(): Promise<ConversationStoreState> {
		await this.writeQueue;
		return this.readStateFromDisk();
	}

	private async readStateFromDisk(): Promise<ConversationStoreState> {
		try {
			const fileStat = await stat(this.indexPath);
			const mtimeKey = this.getMtimeKey(fileStat.mtimeMs);
			if (this.cache && this.cache.mtimeKey === mtimeKey) {
				return this.cloneState(this.cache.state);
			}

			const content = await readFile(this.indexPath, "utf8");
			if (!content.trim()) {
				return this.cacheState({ conversations: {} }, mtimeKey);
			}

			const parsed = JSON.parse(content) as
				| ConversationStoreState
				| LegacyConversationIndex
				| null;
			if (!parsed || typeof parsed !== "object") {
				return this.cacheState({ conversations: {} }, mtimeKey);
			}

			if ("conversations" in parsed && parsed.conversations && typeof parsed.conversations === "object") {
				const conversations = this.cloneConversations(parsed.conversations as Record<string, unknown>);
				return this.cacheState({
					currentConversationId: this.normalizeCurrentConversationId(
						conversations,
						typeof parsed.currentConversationId === "string" ? parsed.currentConversationId : undefined,
					),
					conversations,
				}, mtimeKey);
			}

			return this.cacheState({
				conversations: this.cloneConversations(parsed as Record<string, unknown>),
			}, mtimeKey);
		} catch (error) {
			if (this.isRecoverableReadError(error)) {
				return { conversations: {} };
			}
			throw error;
		}
	}

	private async writeState(state: ConversationStoreState): Promise<void> {
		const dir = dirname(this.indexPath);
		const tempPath = join(dir, `.${basename(this.indexPath)}.${process.pid}.${process.hrtime.bigint()}.tmp`);
		await mkdir(dir, { recursive: true });
		try {
			await writeFile(tempPath, this.stringifyState(state), "utf8");
			await renameWithTransientRetry(tempPath, this.indexPath, this.options);
			const fileStat = await stat(this.indexPath);
			this.cacheState(state, this.getMtimeKey(fileStat.mtimeMs));
		} catch (error) {
			await unlink(tempPath).catch(() => undefined);
			throw error;
		}
	}

	private sortEntries(state: ConversationStoreState): ConversationListEntry[] {
		return Object.entries(state.conversations)
			.map(([conversationId, entry]) => {
				const cloned = this.cloneEntry(entry) ?? { updatedAt: FALLBACK_ENTRY_UPDATED_AT, messageCount: 0 };
				return {
					conversationId,
					...cloned,
				};
			})
			.sort((left, right) => {
				if (left.pinned !== right.pinned) {
					return left.pinned ? -1 : 1;
				}
				return right.updatedAt.localeCompare(left.updatedAt);
			});
	}

	private async mutateState<T>(mutator: (state: ConversationStoreState) => T | Promise<T>): Promise<T> {
		let result: T;
		const operation = this.writeQueue
			.catch(() => undefined)
			.then(async () => {
				const state = await this.readStateFromDisk();
				result = await mutator(state);
				await this.writeState(state);
			});

		this.writeQueue = operation.then(
			() => undefined,
			() => undefined,
		);
		await operation;
		return result!;
	}

	private cacheState(state: ConversationStoreState, mtimeKey: number): ConversationStoreState {
		const cloned = this.cloneState(state);
		this.cache = {
			mtimeKey,
			state: cloned,
		};
		return this.cloneState(cloned);
	}

	private getMtimeKey(mtimeMs: number): number {
		return Math.round(mtimeMs);
	}

	private stringifyState(state: ConversationStoreState): string {
		return JSON.stringify(
			{
				currentConversationId: state.currentConversationId,
				conversations: state.conversations,
			},
			null,
			2,
		);
	}

	private cloneState(state: ConversationStoreState): ConversationStoreState {
		const conversations = this.cloneConversations(state.conversations);
		return {
			currentConversationId: this.normalizeCurrentConversationId(conversations, state.currentConversationId),
			conversations,
		};
	}

	private cloneConversations(conversations: Record<string, unknown>): Record<string, ConversationEntry> {
		return Object.fromEntries(
			Object.entries(conversations).map(([conversationId, entry]) => [
				conversationId,
				this.cloneEntry(entry) ?? { updatedAt: FALLBACK_ENTRY_UPDATED_AT, messageCount: 0 },
			]),
		);
	}

	private cloneEntry(entry: unknown): ConversationEntry | undefined {
		if (entry === undefined) {
			return undefined;
		}
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			return {
				updatedAt: FALLBACK_ENTRY_UPDATED_AT,
				messageCount: 0,
			};
		}

		const rawEntry = entry as Partial<ConversationEntry>;

		const hasValidUpdatedAt = typeof rawEntry.updatedAt === "string" && rawEntry.updatedAt;
		const cloned: ConversationEntry = {
			updatedAt: hasValidUpdatedAt ? rawEntry.updatedAt as string : FALLBACK_ENTRY_UPDATED_AT,
		};
		if (typeof rawEntry.sessionFile === "string") {
			cloned.sessionFile = rawEntry.sessionFile;
		}
		if (typeof rawEntry.createdAt === "string") {
			cloned.createdAt = rawEntry.createdAt;
		}
		if (typeof rawEntry.skillFingerprint === "string") {
			cloned.skillFingerprint = rawEntry.skillFingerprint;
		}
		if (typeof rawEntry.title === "string") {
			cloned.title = rawEntry.title;
		}
		if (typeof rawEntry.preview === "string") {
			cloned.preview = rawEntry.preview;
		}
		if (rawEntry.pinned === true) {
			cloned.pinned = true;
		}
		if (typeof rawEntry.backgroundColor === "string") {
			cloned.backgroundColor = rawEntry.backgroundColor;
		}
		if (typeof rawEntry.messageCount === "number" && Number.isFinite(rawEntry.messageCount)) {
			cloned.messageCount = rawEntry.messageCount;
		} else if (!hasValidUpdatedAt) {
			cloned.messageCount = 0;
		}
		return cloned;
	}

	private normalizeCurrentConversationId(
		conversations: Record<string, ConversationEntry>,
		currentConversationId: string | undefined,
	): string | undefined {
		if (currentConversationId && Object.hasOwn(conversations, currentConversationId)) {
			return currentConversationId;
		}

		return this.sortEntries({ conversations }).at(0)?.conversationId;
	}

	private isRecoverableReadError(error: unknown): boolean {
		if (!(error instanceof Error)) {
			return false;
		}

		return "code" in error
			? (error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError
			: error instanceof SyntaxError;
	}
}
