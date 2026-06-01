import { rename } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

export type RenameFile = (source: string, target: string) => Promise<void>;

export interface RenameWithTransientRetryOptions {
	renameFile?: RenameFile;
	renameMaxAttempts?: number;
	renameRetryDelayMs?: number;
}

const DEFAULT_RENAME_MAX_ATTEMPTS = 5;
const DEFAULT_RENAME_RETRY_DELAY_MS = 10;
const TRANSIENT_RENAME_ERROR_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);

export async function renameWithTransientRetry(
	source: string,
	target: string,
	options: RenameWithTransientRetryOptions = {},
): Promise<void> {
	const renameFile = options.renameFile ?? rename;
	const maxAttempts = Math.max(1, Math.floor(options.renameMaxAttempts ?? DEFAULT_RENAME_MAX_ATTEMPTS));
	const retryDelayMs = Math.max(0, options.renameRetryDelayMs ?? DEFAULT_RENAME_RETRY_DELAY_MS);
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			await renameFile(source, target);
			return;
		} catch (error) {
			if (attempt >= maxAttempts || !isTransientRenameError(error)) {
				throw error;
			}
			await delay(retryDelayMs * attempt);
		}
	}
}

function isTransientRenameError(error: unknown): boolean {
	return TRANSIENT_RENAME_ERROR_CODES.has((error as NodeJS.ErrnoException).code ?? "");
}
