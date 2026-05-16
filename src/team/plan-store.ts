import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TeamPlan } from "./types.js";
import { generatePlanId } from "./ids.js";

const VALID_TASK_TYPES = new Set(["normal", "discovery", "for_each"]);

function validateTasks(tasks: unknown[]): void {
	if (!tasks.length) throw new Error("at least one task is required");
	for (const task of tasks as Array<{
		id?: string; type?: string; title?: string; input?: { text?: string }; acceptance?: { rules?: string[] };
		discovery?: { outputKey?: string };
		forEach?: { itemsFrom?: string; mode?: string; taskTemplate?: unknown };
	}>) {
		if (!task.id?.trim()) throw new Error("task id is required");
		if (!task.title?.trim()) throw new Error("task title is required");
		if (!task.input?.text?.trim()) throw new Error("task input text is required");
		if (!task.acceptance?.rules?.length) throw new Error("task acceptance rules are required");
		const taskType = task.type ?? "normal";
		if (!VALID_TASK_TYPES.has(taskType)) throw new Error(`unknown task type: ${taskType}`);
		if (taskType === "discovery") {
			if (!task.discovery?.outputKey?.trim()) throw new Error("discovery task requires discovery.outputKey");
		}
		if (taskType === "for_each") {
			if (!task.forEach?.itemsFrom?.trim()) throw new Error("for_each task requires forEach.itemsFrom");
			if (task.forEach.mode !== "sequential") throw new Error("for_each task requires forEach.mode 'sequential'");
			const tmpl = task.forEach.taskTemplate as { title?: string; input?: { text?: string }; acceptance?: { rules?: string[] } } | undefined;
			if (!tmpl?.title?.trim()) throw new Error("for_each task requires forEach.taskTemplate.title");
			if (!tmpl?.input?.text?.trim()) throw new Error("for_each task requires forEach.taskTemplate.input.text");
			if (!tmpl?.acceptance?.rules?.length) throw new Error("for_each task requires forEach.taskTemplate.acceptance.rules");
		}
	}
	const ids = (tasks as Array<{ id: string }>).map(t => t.id);
	if (new Set(ids).size !== ids.length) throw new Error("duplicate task id");
}

function validateCreateInput(input: { title?: string; goal?: { text: string }; tasks?: unknown[]; outputContract?: { text: string }; defaultTeamUnitId?: string }): void {
	if (!input.title?.trim()) throw new Error("plan title is required");
	if (!input.defaultTeamUnitId?.trim()) throw new Error("defaultTeamUnitId is required");
	if (!input.goal?.text?.trim()) throw new Error("goal text is required");
	if (!input.tasks) throw new Error("at least one task is required");
	if (!input.outputContract?.text?.trim()) throw new Error("outputContract text is required");
	validateTasks(input.tasks);
}

export class PlanStore {
	constructor(private readonly rootDir: string) {}

	async create(input: Omit<TeamPlan, "schemaVersion" | "planId" | "archived" | "createdAt" | "updatedAt" | "runCount">): Promise<TeamPlan> {
		validateCreateInput(input);
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
			validateTasks(patch.tasks);
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
		if (existing.runCount > 0) throw new Error("used plan cannot be deleted");
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
