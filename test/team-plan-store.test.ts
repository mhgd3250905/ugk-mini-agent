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

test("runCount>0 can hard delete (cee24fe)", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create(validInput);
		await store.incrementRunCount(plan.planId);
		await store.deleteUnused(plan.planId);
		const got = await store.get(plan.planId);
		assert.equal(got, null);
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

test("PlanStore.updateEditablePlan rejects empty tasks when runCount=0", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create(validInput);
		await assert.rejects(
			() => store.updateEditablePlan(plan.planId, { tasks: [] }),
			{ message: "at least one task is required" },
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

// ── P21-B: task decomposer policy validation ──

test("PlanStore.create accepts leaf and propagate task decomposer policies", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create({
			...validInput,
			tasks: [
				{ id: "leaf", title: "Leaf split", input: { text: "split leaf" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "leaf", maxChildren: 3 } },
				{ id: "propagate", title: "Propagate split", input: { text: "split propagate" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "propagate", maxChildren: 8 } },
			],
		});
		assert.equal(plan.tasks[0]!.decomposer?.mode, "leaf");
		assert.equal(plan.tasks[1]!.decomposer?.mode, "propagate");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("PlanStore.create accepts missing task decomposer policy", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create(validInput);
		assert.equal(plan.tasks[0]!.decomposer, undefined);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("PlanStore.create rejects invalid task decomposer mode and maxChildren", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		await assert.rejects(
			() => store.create({
				...validInput,
				tasks: [{ id: "t1", title: "Bad", input: { text: "x" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "deep" as any } }],
			}),
			{ message: "task decomposer.mode must be none, leaf, or propagate" },
		);
		for (const maxChildren of [0, -1, 1.5, 21]) {
			await assert.rejects(
				() => store.create({
					...validInput,
					tasks: [{ id: "t1", title: "Bad", input: { text: "x" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "leaf", maxChildren } }],
				}),
				{ message: "task decomposer.maxChildren must be an integer between 1 and 20" },
			);
		}
	} finally {
		await rm(root, { recursive: true });
	}
});

test("PlanStore.updateEditablePlan validates task decomposer when runCount=0", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create(validInput);
		await assert.rejects(
			() => store.updateEditablePlan(plan.planId, {
				tasks: [{ id: "t1", title: "Bad", input: { text: "x" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "deep" as any } }],
			}),
			{ message: "task decomposer.mode must be none, leaf, or propagate" },
		);
		const updated = await store.updateEditablePlan(plan.planId, {
			tasks: [{ id: "t1", title: "Good", input: { text: "x" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "leaf", maxChildren: 2 } }],
		});
		assert.equal(updated.tasks[0]!.decomposer?.mode, "leaf");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("PlanStore validates forEach.taskTemplate.decomposer", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		await assert.rejects(
			() => store.create({
				...validInput,
				tasks: [{
					id: "process_each", type: "for_each", title: "Process each",
					input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "discover.items",
						mode: "sequential",
						taskTemplate: {
							title: "Process {{item.title}}",
							input: { text: "Process item {{item.id}}" },
							acceptance: { rules: ["output is valid"] },
							decomposer: { mode: "bad" as any },
						},
					},
				}],
			}),
			{ message: "forEach.taskTemplate.decomposer.mode must be none, leaf, or propagate" },
		);
		const plan = await store.create({
			...validInput,
			tasks: [{
				id: "process_each", type: "for_each", title: "Process each",
				input: { text: "placeholder" },
				acceptance: { rules: ["ok"] },
				forEach: {
					itemsFrom: "discover.items",
					mode: "sequential",
					taskTemplate: {
						title: "Process {{item.title}}",
						input: { text: "Process item {{item.id}}" },
						acceptance: { rules: ["output is valid"] },
						decomposer: { mode: "leaf", maxChildren: 4 },
					},
				},
			}],
		});
		assert.equal(plan.tasks[0]!.forEach?.taskTemplate.decomposer?.mode, "leaf");
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P26: outputCheck validation ──

test("P26: PlanStore.create accepts valid task outputCheck contracts", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const plan = await store.create({
			...validInput,
			tasks: [
				{
					id: "scan_vendors",
					type: "discovery",
					title: "Scan vendors",
					input: { text: "Find vendors" },
					acceptance: { rules: ["output vendors"] },
					discovery: { outputKey: "vendors" },
					outputCheck: { type: "json_items", outputKey: "vendors", requiredFields: ["id", "name"] },
				},
				{
					id: "render_card",
					title: "Render card",
					input: { text: "Render card" },
					acceptance: { rules: ["valid fragment"] },
					outputCheck: { type: "html_fragment", requiredSubstrings: ["vendor-card"], forbiddenTags: ["html", "head", "body"] },
				},
				{
					id: "report_file",
					title: "Report file",
					input: { text: "Write file" },
					acceptance: { rules: ["file exists"] },
					outputCheck: { type: "file_exists", path: "worker/report.html" },
				},
			],
		} as any);
		assert.equal(plan.tasks[0]!.outputCheck?.type, "json_items");
		assert.equal(plan.tasks[1]!.outputCheck?.type, "html_fragment");
		assert.equal(plan.tasks[2]!.outputCheck?.type, "file_exists");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P26: PlanStore rejects invalid outputCheck on create and update", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		await assert.rejects(
			() => store.create({
				...validInput,
				tasks: [{ id: "t1", title: "Bad", input: { text: "x" }, acceptance: { rules: ["ok"] }, outputCheck: { type: "yaml_items" } }],
			} as any),
			{ message: "task outputCheck.type must be json_items, json_object, html_fragment, or file_exists" },
		);
		await assert.rejects(
			() => store.create({
				...validInput,
				tasks: [{ id: "t1", title: "Bad", input: { text: "x" }, acceptance: { rules: ["ok"] }, outputCheck: { type: "json_items", requiredFields: ["id", ""] } }],
			} as any),
			{ message: "task outputCheck.requiredFields must contain non-empty strings" },
		);
		await assert.rejects(
			() => store.create({
				...validInput,
				tasks: [{ id: "t1", title: "Bad", input: { text: "x" }, acceptance: { rules: ["ok"] }, outputCheck: { type: "html_fragment", forbiddenTags: ["body", "script>alert"] } }],
			} as any),
			{ message: "task outputCheck.forbiddenTags must contain safe tag names" },
		);

		const plan = await store.create(validInput);
		await assert.rejects(
			() => store.updateEditablePlan(plan.planId, {
				tasks: [{ id: "t1", title: "Bad", input: { text: "x" }, acceptance: { rules: ["ok"] }, outputCheck: { type: "yaml_items" } } as any],
			}),
			{ message: "task outputCheck.type must be json_items, json_object, html_fragment, or file_exists" },
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P26: PlanStore validates forEach.taskTemplate.outputCheck and preserves old plans without it", async () => {
	const root = await mkdtemp(join(tmpdir(), "plan-store-"));
	try {
		const store = new PlanStore(root);
		const oldPlan = await store.create(validInput);
		assert.equal(oldPlan.tasks[0]!.outputCheck, undefined);

		await assert.rejects(
			() => store.create({
				...validInput,
				tasks: [{
					id: "process_each",
					type: "for_each",
					title: "Process each",
					input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "discover.items",
						mode: "sequential",
						taskTemplate: {
							title: "Process {{item.id}}",
							input: { text: "Process" },
							acceptance: { rules: ["ok"] },
							outputCheck: { type: "html_fragment", forbiddenTags: ["html/body"] },
						},
					},
				}],
			} as any),
			{ message: "forEach.taskTemplate.outputCheck.forbiddenTags must contain safe tag names" },
		);

		const plan = await store.create({
			...validInput,
			tasks: [{
				id: "process_each",
				type: "for_each",
				title: "Process each",
				input: { text: "placeholder" },
				acceptance: { rules: ["ok"] },
				forEach: {
					itemsFrom: "discover.items",
					mode: "sequential",
					taskTemplate: {
						title: "Process {{item.id}}",
						input: { text: "Process" },
						acceptance: { rules: ["ok"] },
						outputCheck: { type: "json_object", requiredFields: ["id", "summary"] },
					},
				},
			}],
		} as any);
		assert.equal(plan.tasks[0]!.forEach?.taskTemplate.outputCheck?.type, "json_object");
	} finally {
		await rm(root, { recursive: true });
	}
});
