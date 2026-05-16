import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PlanStore } from "../src/team/plan-store.js";

const validInput = {
	title: "Medtrum 域名调查",
	defaultTeamUnitId: "team_web",
	goal: { text: "调查 Medtrum 相关域名" },
	tasks: [{ id: "t1", title: "核查 medtrum.com", input: { text: "核查" }, acceptance: { rules: ["必须说明来源"] } }],
	outputContract: { text: "中文汇总" },
};

test("PlanStore create validates required fields", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		await assert.rejects(() => store.create({ ...validInput, title: "" }), { message: "plan title is required" });
		await assert.rejects(() => store.create({ ...validInput, defaultTeamUnitId: "" }), { message: "defaultTeamUnitId is required" });
		await assert.rejects(() => store.create({ ...validInput, goal: { text: "" } }), { message: "goal text is required" });
		await assert.rejects(() => store.create({ ...validInput, tasks: [] }), { message: "at least one task is required" });
		await assert.rejects(() => store.create({ ...validInput, outputContract: { text: "" } }), { message: "outputContract text is required" });
	} finally {
		await rm(root, { recursive: true });
	}
});

test("PlanStore create rejects task without acceptance rules", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		await assert.rejects(
			() => store.create({ ...validInput, tasks: [{ id: "t1", title: "t", input: { text: "t" }, acceptance: { rules: [] } }] }),
			{ message: "task acceptance rules are required" },
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("runCount=0 allows editing title, goal, tasks, outputContract", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create(validInput);
		const updated = await store.updateEditablePlan(plan.planId, { title: "新标题", goal: { text: "新目标" } });
		assert.equal(updated.title, "新标题");
		assert.equal(updated.goal.text, "新目标");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("runCount>0 forbids editing tasks, goal, outputContract", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create(validInput);
		await store.incrementRunCount(plan.planId);
		await assert.rejects(
			() => store.updateEditablePlan(plan.planId, { tasks: [] }),
			{ message: "used plan content is immutable" },
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("runCount>0 allows changing defaultTeamUnitId", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create(validInput);
		await store.incrementRunCount(plan.planId);
		const updated = await store.updateDefaultTeam(plan.planId, "team_other");
		assert.equal(updated.defaultTeamUnitId, "team_other");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("runCount=0 can hard delete", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create(validInput);
		await store.deleteUnused(plan.planId);
		const got = await store.get(plan.planId);
		assert.equal(got, null);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("runCount>0 cannot hard delete", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create(validInput);
		await store.incrementRunCount(plan.planId);
		await assert.rejects(() => store.deleteUnused(plan.planId), { message: "used plan cannot be deleted" });
	} finally {
		await rm(root, { recursive: true });
	}
});

test("runCount>0 can archive", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create(validInput);
		await store.incrementRunCount(plan.planId);
		const archived = await store.archive(plan.planId);
		assert.equal(archived.archived, true);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("list returns plans sorted by updatedAt desc", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		await store.create({ ...validInput, title: "first" });
		await store.create({ ...validInput, title: "second" });
		const list = await store.list();
		assert.equal(list.length, 2);
		assert.equal(list[0]!.title, "second");
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P15: Dynamic task validation ──

test("discovery task requires discovery.outputKey", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		await assert.rejects(
			() => store.create({
				...validInput,
				tasks: [{
					id: "t1", type: "discovery", title: "Discover",
					input: { text: "Find items" },
					acceptance: { rules: ["must produce JSON"] },
					discovery: { outputKey: "" },
				}],
			}),
			{ message: "discovery task requires discovery.outputKey" },
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("discovery task with outputKey is accepted", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create({
			...validInput,
			tasks: [{
				id: "t1", type: "discovery", title: "Discover",
				input: { text: "Find items" },
				acceptance: { rules: ["must produce JSON"] },
				discovery: { outputKey: "items" },
			}],
		});
		assert.equal(plan.tasks[0]!.type, "discovery");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("for_each task requires forEach.itemsFrom", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		await assert.rejects(
			() => store.create({
				...validInput,
				tasks: [{
					id: "t1", type: "for_each", title: "Process each",
					input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "",
						mode: "sequential",
						taskTemplate: {
							title: "Process {{item.title}}",
							input: { text: "Process item" },
							acceptance: { rules: ["ok"] },
						},
					},
				}],
			}),
			{ message: "for_each task requires forEach.itemsFrom" },
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("for_each task requires mode sequential", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		await assert.rejects(
			() => store.create({
				...validInput,
				tasks: [{
					id: "t1", type: "for_each", title: "Process each",
					input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "t0.items",
						mode: "parallel",
						taskTemplate: {
							title: "Process",
							input: { text: "Process" },
							acceptance: { rules: ["ok"] },
						},
					},
				}] as any,
			}),
			{ message: "for_each task requires forEach.mode 'sequential'" },
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("for_each task requires complete taskTemplate", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		await assert.rejects(
			() => store.create({
				...validInput,
				tasks: [{
					id: "t1", type: "for_each", title: "Process each",
					input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "t0.items",
						mode: "sequential",
						taskTemplate: {
							title: "",
							input: { text: "Process" },
							acceptance: { rules: ["ok"] },
						},
					},
				}],
			}),
			{ message: "for_each task requires forEach.taskTemplate.title" },
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("for_each task requires taskTemplate.acceptance.rules", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		await assert.rejects(
			() => store.create({
				...validInput,
				tasks: [{
					id: "t1", type: "for_each", title: "Process each",
					input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "t0.items",
						mode: "sequential",
						taskTemplate: {
							title: "Process",
							input: { text: "Process" },
							acceptance: { rules: [] },
						},
					},
				}],
			}),
			{ message: "for_each task requires forEach.taskTemplate.acceptance.rules" },
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("valid for_each task with sequential mode is accepted", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create({
			...validInput,
			tasks: [{
				id: "t1", type: "for_each", title: "Process each",
				input: { text: "placeholder" },
				acceptance: { rules: ["ok"] },
				forEach: {
					itemsFrom: "t0.items",
					mode: "sequential",
					taskTemplate: {
						title: "Process {{item.title}}",
						input: { text: "Process item {{item.id}}" },
						acceptance: { rules: ["output is valid"] },
					},
				},
			}],
		});
		assert.equal(plan.tasks[0]!.type, "for_each");
		assert.equal(plan.tasks[0]!.forEach?.mode, "sequential");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("duplicate static task ids are still rejected", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		await assert.rejects(
			() => store.create({
				...validInput,
				tasks: [
					{ id: "t1", title: "First", input: { text: "a" }, acceptance: { rules: ["ok"] } },
					{ id: "t1", title: "Duplicate", input: { text: "b" }, acceptance: { rules: ["ok"] } },
				],
			}),
			{ message: "duplicate task id" },
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P15 Review Fix: unknown task type validation ──

test("PlanStore.create rejects unknown task.type", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		await assert.rejects(
			() => store.create({
				...validInput,
				tasks: [{
					id: "t1", type: "custom_type" as any, title: "Custom",
					input: { text: "do" }, acceptance: { rules: ["ok"] },
				}],
			}),
			{ message: /unknown task type/ },
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("PlanStore.updateEditablePlan validates tasks when runCount=0", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create(validInput);
		await assert.rejects(
			() => store.updateEditablePlan(plan.planId, {
				tasks: [{
					id: "t1", type: "unknown_type" as any, title: "Bad",
					input: { text: "x" }, acceptance: { rules: ["ok"] },
				}],
			}),
			{ message: /unknown task type/ },
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("PlanStore.updateEditablePlan accepts valid dynamic tasks when runCount=0", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create(validInput);
		const updated = await store.updateEditablePlan(plan.planId, {
			tasks: [
				{
					id: "discover", type: "discovery", title: "Discover",
					input: { text: "Find" }, acceptance: { rules: ["ok"] },
					discovery: { outputKey: "items" },
				},
			],
		});
		assert.equal(updated.tasks[0]!.type, "discovery");
	} finally {
		await rm(root, { recursive: true });
	}
});
