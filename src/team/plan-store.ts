import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TeamPlan } from "./types.js";
import { generatePlanId } from "./ids.js";
import { validateCreatePlanInput, validatePlanTasks } from "./plan-validation.js";

export class PlanStore {
	constructor(private readonly rootDir: string) {}

	async create(input: Omit<TeamPlan, "schemaVersion" | "planId" | "archived" | "createdAt" | "updatedAt" | "runCount">): Promise<TeamPlan> {
		validateCreatePlanInput(input);
		const now = new Date().toISOString();
		const plan: TeamPlan = {
			schemaVersion: "team/plan-1",
			planId: generatePlanId(),
			title: input.title,
			defaultTeamUnitId: input.defaultTeamUnitId,
			goal: input.goal,
			tasks: input.tasks,
			outputContract: input.outputContract,
			archived: false,
			createdAt: now,
			updatedAt: now,
			runCount: 0,
		};
		await this.write(plan);
		return plan;
	}

	async list(): Promise<TeamPlan[]> {
		const plansDir = join(this.rootDir, "plans");
		try {
			const { readdir } = await import("node:fs/promises");
			const dirs = await readdir(plansDir);
			const plans: TeamPlan[] = [];
			for (const d of dirs) {
				const data = await this.readJson<TeamPlan>(join(plansDir, d, "plan.json"));
				if (data) plans.push(data);
			}
			return plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		} catch {
			return [];
		}
	}

	async get(planId: string): Promise<TeamPlan | null> {
		return this.readJson<TeamPlan>(join(this.rootDir, "plans", planId, "plan.json"));
	}

	async updateEditablePlan(planId: string, patch: Partial<Omit<TeamPlan, "schemaVersion" | "planId" | "createdAt" | "updatedAt" | "runCount">>): Promise<TeamPlan> {
		const existing = await this.get(planId);
		if (!existing) throw new Error(`plan not found: ${planId}`);
		if (existing.runCount > 0) {
			if (patch.goal || patch.tasks || patch.outputContract) {
				throw new Error("used plan content is immutable");
			}
		}
		if (existing.runCount === 0 && patch.tasks) {
			validatePlanTasks(patch.tasks);
		}
		if (existing.archived) throw new Error("archived plan cannot be edited");
		const updated: TeamPlan = { ...existing, ...patch, updatedAt: new Date().toISOString() };
		await this.write(updated);
		return updated;
	}

	async updateDefaultTeam(planId: string, defaultTeamUnitId: string): Promise<TeamPlan> {
		const existing = await this.get(planId);
		if (!existing) throw new Error(`plan not found: ${planId}`);
		const updated: TeamPlan = { ...existing, defaultTeamUnitId, updatedAt: new Date().toISOString() };
		await this.write(updated);
		return updated;
	}

	async incrementRunCount(planId: string): Promise<TeamPlan> {
		const existing = await this.get(planId);
		if (!existing) throw new Error(`plan not found: ${planId}`);
		const updated: TeamPlan = { ...existing, runCount: existing.runCount + 1, updatedAt: new Date().toISOString() };
		await this.write(updated);
		return updated;
	}

	async archive(planId: string): Promise<TeamPlan> {
		const existing = await this.get(planId);
		if (!existing) throw new Error(`plan not found: ${planId}`);
		if (existing.archived) throw new Error("already archived");
		const updated: TeamPlan = { ...existing, archived: true, updatedAt: new Date().toISOString() };
		await this.write(updated);
		return updated;
	}

	async deleteUnused(planId: string): Promise<void> {
		const existing = await this.get(planId);
		if (!existing) throw new Error(`plan not found: ${planId}`);
		const planDir = join(this.rootDir, "plans", planId);
		await unlink(join(planDir, "plan.json"));
		try { await import("node:fs/promises").then(fs => fs.rmdir(planDir)); } catch { /* ok if non-empty */ }
	}

	private async write(plan: TeamPlan): Promise<void> {
		const planDir = join(this.rootDir, "plans", plan.planId);
		await mkdir(planDir, { recursive: true });
		const filePath = join(planDir, "plan.json");
		const tmp = filePath + ".tmp";
		await writeFile(tmp, JSON.stringify(plan, null, 2), "utf8");
		await rename(tmp, filePath);
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
