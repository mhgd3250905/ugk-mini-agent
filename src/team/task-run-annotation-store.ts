import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { renameWithTransientRetry } from "../file-system.js";
import type { TeamTaskRunAnnotation } from "./types.js";

interface TeamTaskRunAnnotationDocument {
	schemaVersion: "team/task-run-annotations-1";
	annotations: Record<string, TeamTaskRunAnnotation>;
}

export interface PatchTeamTaskRunAnnotationInput {
	best?: boolean;
	archived?: boolean;
	note?: string | null;
}

const now = () => new Date().toISOString();

function defaultAnnotation(runId: string, taskId: string): TeamTaskRunAnnotation {
	return {
		runId,
		taskId,
		best: false,
		archived: false,
		updatedAt: now(),
	};
}

function normalizeAnnotation(raw: unknown, runId: string, fallbackTaskId?: string): TeamTaskRunAnnotation | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const value = raw as Record<string, unknown>;
	const taskId = typeof value.taskId === "string" && value.taskId.trim()
		? value.taskId
		: fallbackTaskId;
	if (!taskId) return null;
	const annotation: TeamTaskRunAnnotation = {
		runId,
		taskId,
		best: value.best === true,
		archived: value.archived === true,
		updatedAt: typeof value.updatedAt === "string" && value.updatedAt.trim() ? value.updatedAt : now(),
	};
	if (typeof value.note === "string" && value.note.trim()) {
		annotation.note = value.note.slice(0, 2_000);
	}
	return annotation;
}

export class TaskRunAnnotationStore {
	constructor(private readonly rootDir: string) {}

	async get(runId: string, taskId: string): Promise<TeamTaskRunAnnotation> {
		const annotations = await this.readAnnotations();
		return annotations[runId] ?? defaultAnnotation(runId, taskId);
	}

	async patch(runId: string, taskId: string, patch: PatchTeamTaskRunAnnotationInput): Promise<TeamTaskRunAnnotation> {
		return this.withLock(async () => {
			const annotations = await this.readAnnotations();
			const current = annotations[runId] ?? defaultAnnotation(runId, taskId);
			const updated: TeamTaskRunAnnotation = {
				...current,
				runId,
				taskId,
				updatedAt: now(),
			};
			if (patch.best !== undefined) updated.best = patch.best === true;
			if (patch.archived !== undefined) updated.archived = patch.archived === true;
			if (Object.hasOwn(patch, "note")) {
				const note = typeof patch.note === "string" ? patch.note.trim().slice(0, 2_000) : "";
				if (note) updated.note = note;
				else delete updated.note;
			}
			if (updated.best) {
				for (const [otherRunId, annotation] of Object.entries(annotations)) {
					if (otherRunId !== runId && annotation.taskId === taskId && annotation.best) {
						annotations[otherRunId] = {
							...annotation,
							best: false,
							updatedAt: updated.updatedAt,
						};
					}
				}
			}
			annotations[runId] = updated;
			await this.writeAnnotations(annotations);
			return updated;
		});
	}

	async listForTask(runIds: string[], taskId: string): Promise<Record<string, TeamTaskRunAnnotation>> {
		const annotations = await this.readAnnotations();
		return Object.fromEntries(runIds.map((runId) => [runId, annotations[runId] ?? defaultAnnotation(runId, taskId)]));
	}

	private async readAnnotations(): Promise<Record<string, TeamTaskRunAnnotation>> {
		try {
			const raw = await readFile(this.filePath(), "utf8");
			const parsed = JSON.parse(raw) as Partial<TeamTaskRunAnnotationDocument>;
			if (parsed.schemaVersion !== "team/task-run-annotations-1" || !parsed.annotations || typeof parsed.annotations !== "object") {
				return {};
			}
			const annotations: Record<string, TeamTaskRunAnnotation> = {};
			for (const [runId, value] of Object.entries(parsed.annotations)) {
				const annotation = normalizeAnnotation(value, runId);
				if (annotation) annotations[runId] = annotation;
			}
			return annotations;
		} catch {
			return {};
		}
	}

	private async writeAnnotations(annotations: Record<string, TeamTaskRunAnnotation>): Promise<void> {
		await mkdir(this.rootDir, { recursive: true });
		const filePath = this.filePath();
		const tmp = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
		try {
			const document: TeamTaskRunAnnotationDocument = {
				schemaVersion: "team/task-run-annotations-1",
				annotations,
			};
			await writeFile(tmp, JSON.stringify(document, null, 2), "utf8");
			await renameWithTransientRetry(tmp, filePath);
		} finally {
			await rm(tmp, { force: true }).catch(() => {});
		}
	}

	private async withLock<T>(fn: () => Promise<T>): Promise<T> {
		await mkdir(this.rootDir, { recursive: true });
		const lockDir = join(this.rootDir, ".run-annotations.lock");
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				await mkdir(lockDir);
				try {
					return await fn();
				} finally {
					await rm(lockDir, { recursive: true, force: true });
				}
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== "EEXIST" && code !== "EPERM") throw error;
				await new Promise(resolve => setTimeout(resolve, 10));
			}
		}
		throw new Error("run annotation lock busy");
	}

	private filePath(): string {
		return join(this.rootDir, "run-annotations.json");
	}
}
