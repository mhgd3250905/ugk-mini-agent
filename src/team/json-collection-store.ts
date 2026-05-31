import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renameWithTransientRetry } from "../file-system.js";

export interface JsonCollectionStoreOptions {
	rootDir: string;
	fileName: string;
	schemaVersion: string;
	lockDirName: string;
	errorLabel: string;
}

export class JsonCollectionStore<T> {
	private readonly filePath: string;
	private readonly lockDir: string;

	constructor(private readonly opts: JsonCollectionStoreOptions) {
		this.filePath = join(opts.rootDir, opts.fileName);
		this.lockDir = join(opts.rootDir, opts.lockDirName);
	}

	async readAll(): Promise<T[]> {
		let content: string;
		try {
			content = await readFile(this.filePath, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw new Error(`${this.opts.errorLabel} read failed: ${(error as Error).message}`);
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(content);
		} catch {
			throw new Error(`${this.opts.errorLabel} contains invalid JSON`);
		}
		if (!Array.isArray(parsed)) {
			throw new Error(`${this.opts.errorLabel} does not contain an array`);
		}
		return parsed
			.filter((item: unknown) => (item as Record<string, unknown>)?.schemaVersion === this.opts.schemaVersion)
			.map(item => item as T);
	}

	async writeAll(items: T[]): Promise<void> {
		await mkdir(this.opts.rootDir, { recursive: true });
		const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
		try {
			await writeFile(tmp, JSON.stringify(items, null, 2), "utf8");
			await renameWithTransientRetry(tmp, this.filePath);
		} finally {
			await rm(tmp, { force: true }).catch(() => {});
		}
	}

	async withMutationLock<R>(fn: () => Promise<R>): Promise<R> {
		await mkdir(this.opts.rootDir, { recursive: true });
		let acquired = false;
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				await mkdir(this.lockDir);
				acquired = true;
				break;
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== "EEXIST" && code !== "EPERM") throw error;
				await new Promise(resolve => setTimeout(resolve, 10));
			}
		}
		if (!acquired) {
			throw new Error(`${this.opts.errorLabel} lock busy`);
		}
		try {
			return await fn();
		} finally {
			await rm(this.lockDir, { recursive: true, force: true });
		}
	}
}
