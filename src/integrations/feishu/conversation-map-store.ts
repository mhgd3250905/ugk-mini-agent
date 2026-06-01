import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { renameWithTransientRetry, type RenameFile } from "../../file-system.js";

type ConversationMap = Record<string, string>;

interface FeishuConversationMapStoreOptions {
	indexPath: string;
	renameFile?: RenameFile;
	renameMaxAttempts?: number;
	renameRetryDelayMs?: number;
}

export class FeishuConversationMapStore {
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(private readonly options: FeishuConversationMapStoreOptions) {}

	async get(key: string): Promise<string | undefined> {
		const index = await this.readIndex();
		return index[key];
	}

	async getOrCreate(key: string, builder: () => string): Promise<string> {
		return await this.mutateIndex((index) => {
			if (index[key]) {
				return index[key];
			}

			const conversationId = builder();
			index[key] = conversationId;
			return conversationId;
		});
	}

	private async readIndex(): Promise<ConversationMap> {
		await this.writeQueue;
		return await this.readIndexFromDisk();
	}

	private async readIndexFromDisk(): Promise<ConversationMap> {
		try {
			const content = await readFile(this.options.indexPath, "utf8");
			if (!content.trim()) {
				return {};
			}
			const parsed = JSON.parse(content) as ConversationMap;
			return typeof parsed === "object" && parsed !== null ? parsed : {};
		} catch (error) {
			if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
				return {};
			}
			if (error instanceof SyntaxError) {
				return {};
			}
			throw error;
		}
	}

	private async writeIndex(index: ConversationMap): Promise<void> {
		const dir = dirname(this.options.indexPath);
		const tempPath = join(dir, `.${basename(this.options.indexPath)}.${process.pid}.${process.hrtime.bigint()}.tmp`);
		await mkdir(dir, { recursive: true });
		try {
			await writeFile(tempPath, JSON.stringify(index, null, 2), "utf8");
			await renameWithTransientRetry(tempPath, this.options.indexPath, this.options);
		} catch (error) {
			await unlink(tempPath).catch(() => undefined);
			throw error;
		}
	}

	private async mutateIndex<T>(mutator: (index: ConversationMap) => T | Promise<T>): Promise<T> {
		let result: T;
		const operation = this.writeQueue
			.catch(() => undefined)
			.then(async () => {
				const index = await this.readIndexFromDisk();
				result = await mutator(index);
				await this.writeIndex(index);
			});

		this.writeQueue = operation.then(
			() => undefined,
			() => undefined,
		);
		await operation;
		return result!;
	}
}
