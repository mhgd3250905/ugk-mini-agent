import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getAppConfig } from "../config.js";
import { AssetStore } from "./asset-store.js";
import type { AgentSessionMessageLike } from "./agent-session-factory.js";
import {
	compactLargeSessionMessages,
	rewriteSessionFileMessages,
} from "./session-message-compactor.js";

export interface SessionCompactionCliArgs {
	conversationId: string;
	sessionFile: string;
	projectRoot: string;
}

export interface SessionCompactionCliResult {
	sessionFile: string;
	backupFile: string;
	reportFile: string;
	originalSizeBytes: number;
	compactedSizeBytes: number;
	artifactCount: number;
}

export async function compactAgentSessionFile(input: SessionCompactionCliArgs): Promise<SessionCompactionCliResult> {
	const projectRoot = resolve(input.projectRoot);
	const sessionFile = resolve(projectRoot, input.sessionFile);
	const backupFile = `${sessionFile}.bak`;
	const reportFile = join(dirname(sessionFile), `${basename(sessionFile)}.compaction-report.md`);
	const before = await stat(sessionFile);
	const messages = parseSessionMessages(await readFile(sessionFile, "utf8"));
	const config = getAppConfig(projectRoot);
	const assetStore = new AssetStore({
		blobsDir: config.agentAssetBlobsDir,
		indexPath: config.assetIndexPath,
	});

	const result = await compactLargeSessionMessages({
		conversationId: input.conversationId,
		messages,
		saveFiles: async (conversationId, files) => await assetStore.saveFiles(conversationId, files),
	});

	await copyBackupIfMissing(sessionFile, backupFile);
	if (result.changed) {
		await rewriteSessionFileMessages({ sessionFile, messages: result.messages });
	}
	const after = await stat(sessionFile);
	await writeFile(reportFile, buildReport({
		conversationId: input.conversationId,
		sessionFile,
		backupFile,
		originalSizeBytes: before.size,
		compactedSizeBytes: after.size,
		artifactCount: result.artifactCount,
		originalOutputBytes: result.originalBytes,
		compactedOutputBytes: result.compactedBytes,
	}), "utf8");

	return {
		sessionFile,
		backupFile,
		reportFile,
		originalSizeBytes: before.size,
		compactedSizeBytes: after.size,
		artifactCount: result.artifactCount,
	};
}

export async function runSessionCompactionCli(argv: readonly string[]): Promise<void> {
	const args = parseArgs(argv);
	const result = await compactAgentSessionFile(args);
	console.log(
		`Compacted session ${result.sessionFile}: artifacts=${result.artifactCount} before=${result.originalSizeBytes} after=${result.compactedSizeBytes} backup=${result.backupFile} report=${result.reportFile}`,
	);
}

function parseArgs(argv: readonly string[]): SessionCompactionCliArgs {
	const values = new Map<string, string>();
	for (let index = 0; index < argv.length; index += 1) {
		const key = argv[index];
		if (!key?.startsWith("--")) {
			continue;
		}
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for ${key}`);
		}
		values.set(key, value);
		index += 1;
	}
	const conversationId = values.get("--conversation-id")?.trim();
	const sessionFile = values.get("--session-file")?.trim();
	const projectRoot = values.get("--project-root")?.trim() || ".";
	if (!conversationId) {
		throw new Error("Missing --conversation-id");
	}
	if (!sessionFile) {
		throw new Error("Missing --session-file");
	}
	return { conversationId, sessionFile, projectRoot };
}

function parseSessionMessages(content: string): AgentSessionMessageLike[] {
	const messages: AgentSessionMessageLike[] = [];
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		try {
			const event = JSON.parse(trimmed) as {
				type?: string;
				timestamp?: string;
				message?: AgentSessionMessageLike;
			};
			if (event.type === "message" && event.message && typeof event.message.role === "string") {
				messages.push({
					...event.message,
					timestamp: event.message.timestamp ?? event.timestamp,
				});
			}
		} catch {
			continue;
		}
	}
	return messages;
}

async function copyBackupIfMissing(sessionFile: string, backupFile: string): Promise<void> {
	try {
		await stat(backupFile);
		return;
	} catch (error) {
		if (!(error instanceof Error) || !("code" in error) || (error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}
	await copyFile(sessionFile, backupFile);
}

function buildReport(input: {
	conversationId: string;
	sessionFile: string;
	backupFile: string;
	originalSizeBytes: number;
	compactedSizeBytes: number;
	artifactCount: number;
	originalOutputBytes: number;
	compactedOutputBytes: number;
}): string {
	return [
		"# Compacted session",
		"",
		`- Conversation: ${input.conversationId}`,
		`- Session file: ${input.sessionFile}`,
		`- Backup file: ${input.backupFile}`,
		`- Original session bytes: ${input.originalSizeBytes}`,
		`- Compacted session bytes: ${input.compactedSizeBytes}`,
		`- Artifacts written: ${input.artifactCount}`,
		`- Original output bytes moved: ${input.originalOutputBytes}`,
		`- Compacted output bytes kept in session: ${input.compactedOutputBytes}`,
		"",
	].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	runSessionCompactionCli(process.argv.slice(2)).catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
