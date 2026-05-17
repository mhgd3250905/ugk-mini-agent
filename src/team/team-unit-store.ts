import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TeamUnit } from "./types.js";
import { generateTeamUnitId } from "./ids.js";

export class TeamUnitStore {
	constructor(private readonly rootDir: string) {}

	async create(input: Omit<TeamUnit, "schemaVersion" | "teamUnitId" | "archived" | "createdAt" | "updatedAt" | "decomposerProfileId"> & { decomposerProfileId?: string }): Promise<TeamUnit> {
		const now = new Date().toISOString();
		const teamUnit: TeamUnit = {
			schemaVersion: "team/team-unit-1",
			teamUnitId: generateTeamUnitId(),
			title: input.title,
			description: input.description,
			watcherProfileId: input.watcherProfileId,
			workerProfileId: input.workerProfileId,
			checkerProfileId: input.checkerProfileId,
			finalizerProfileId: input.finalizerProfileId,
			decomposerProfileId: input.decomposerProfileId ?? input.workerProfileId,
			archived: false,
			createdAt: now,
			updatedAt: now,
		};
		await this.write(teamUnit);
		return teamUnit;
	}

	async list(): Promise<TeamUnit[]> {
		const dir = join(this.rootDir, "team-units");
		try {
			const { readdir } = await import("node:fs/promises");
			const files = await readdir(dir);
			const units: TeamUnit[] = [];
			for (const f of files) {
				if (!f.endsWith(".json")) continue;
				const data = await this.readJson<TeamUnit>(join(dir, f));
				if (data) units.push(this.normalize(data));
			}
			return units.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		} catch {
			return [];
		}
	}

	async get(teamUnitId: string): Promise<TeamUnit | null> {
		const filePath = join(this.rootDir, "team-units", `${teamUnitId}.json`);
		const data = await this.readJson<TeamUnit>(filePath);
		return data ? this.normalize(data) : null;
	}

	async update(teamUnitId: string, patch: Partial<Pick<TeamUnit, "title" | "description" | "watcherProfileId" | "workerProfileId" | "checkerProfileId" | "finalizerProfileId" | "decomposerProfileId">>): Promise<TeamUnit> {
		const existing = await this.get(teamUnitId);
		if (!existing) throw new Error(`team unit not found: ${teamUnitId}`);
		if (existing.archived) throw new Error(`archived team unit cannot be edited: ${teamUnitId}`);
		const updated: TeamUnit = { ...existing, ...patch, updatedAt: new Date().toISOString() };
		await this.write(updated);
		return updated;
	}

	async archive(teamUnitId: string): Promise<TeamUnit> {
		const existing = await this.get(teamUnitId);
		if (!existing) throw new Error(`team unit not found: ${teamUnitId}`);
		if (existing.archived) throw new Error(`already archived: ${teamUnitId}`);
		const updated: TeamUnit = { ...existing, archived: true, updatedAt: new Date().toISOString() };
		await this.write(updated);
		return updated;
	}

	async delete(teamUnitId: string): Promise<void> {
		const existing = await this.get(teamUnitId);
		if (!existing) throw new Error(`team unit not found: ${teamUnitId}`);
		const filePath = join(this.rootDir, "team-units", `${teamUnitId}.json`);
		await unlink(filePath);
	}

	private async write(teamUnit: TeamUnit): Promise<void> {
		const filePath = join(this.rootDir, "team-units", `${teamUnit.teamUnitId}.json`);
		const dir = join(this.rootDir, "team-units");
		await mkdir(dir, { recursive: true });
		const tmp = filePath + ".tmp";
		await writeFile(tmp, JSON.stringify(teamUnit, null, 2), "utf8");
		await rename(tmp, filePath);
	}

	private normalize(unit: TeamUnit): TeamUnit {
		if (!unit.decomposerProfileId) {
			return { ...unit, decomposerProfileId: unit.workerProfileId };
		}
		return unit;
	}

	private async readJson<T>(filePath: string): Promise<T | null> {
		try {
			const data = await readFile(filePath, "utf8");
			return JSON.parse(data) as T;
		} catch {
			return null;
		}
	}
}
