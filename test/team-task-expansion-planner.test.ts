import test from "node:test";
import assert from "node:assert/strict";
import { TemplateTaskExpansionPlanner } from "../src/team/task-expansion-planner.js";
import type { TeamTask } from "../src/team/types.js";

const makeParentTask = (): TeamTask => ({
	id: "process_each",
	type: "for_each",
	title: "Process each item",
	input: { text: "Placeholder" },
	acceptance: { rules: ["placeholder"] },
	forEach: {
		itemsFrom: "discover.items",
		mode: "sequential",
		taskTemplate: {
			title: "Process {{item.title}}",
			input: { text: "Process item {{item.id}}" },
			acceptance: { rules: ["output for {{item.id}} is valid"] },
		},
	},
});

test("expands one item into one child task", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask: makeParentTask(),
		items: [{ id: "item_01", title: "First item" }],
	});
	assert.equal(result.children.length, 1);
	assert.equal(result.children[0]!.id, "process_each__item_01");
	assert.equal(result.children[0]!.title, "Process First item");
});

test("expands multiple items in stable order", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask: makeParentTask(),
		items: [
			{ id: "b_item", title: "B" },
			{ id: "a_item", title: "A" },
			{ id: "c_item", title: "C" },
		],
	});
	assert.equal(result.children.length, 3);
	assert.equal(result.children[0]!.sourceItemId, "b_item");
	assert.equal(result.children[1]!.sourceItemId, "a_item");
	assert.equal(result.children[2]!.sourceItemId, "c_item");
});

test("child id is deterministic and safe", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask: makeParentTask(),
		items: [{ id: "item/with:special chars!", title: "Special" }],
	});
	assert.equal(result.children[0]!.id, "process_each__item_with_special_chars_");
	assert.ok(/^[a-zA-Z0-9_-]+$/.test(result.children[0]!.id));
});

test("child records parentTaskId, sourceItemId, generated: true", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask: makeParentTask(),
		items: [{ id: "x1", title: "X" }],
	});
	const child = result.children[0]!;
	assert.equal(child.parentTaskId, "process_each");
	assert.equal(child.sourceItemId, "x1");
	assert.equal(child.generated, true);
	assert.equal(child.type, "normal");
});

test("template replacement supports item.id and item.title", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask: makeParentTask(),
		items: [{ id: "abc", title: "Hello World" }],
	});
	const child = result.children[0]!;
	assert.equal(child.title, "Process Hello World");
	assert.equal(child.input.text, "Process item abc");
	assert.equal(child.acceptance.rules[0], "output for abc is valid");
});

test("template replacement supports {{item}} as JSON string", async () => {
	const parentTask: TeamTask = {
		id: "fe",
		type: "for_each",
		title: "FE",
		input: { text: "p" },
		acceptance: { rules: ["ok"] },
		forEach: {
			itemsFrom: "d.items",
			mode: "sequential",
			taskTemplate: {
				title: "Item: {{item}}",
				input: { text: "Data: {{item}}" },
				acceptance: { rules: ["ok"] },
			},
		},
	};
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask: parentTask,
		items: [{ id: "i1", title: "Test" }],
	});
	const child = result.children[0]!;
	assert.ok(child.title.includes('"id":"i1"'));
	assert.ok(child.input.text.includes('"title":"Test"'));
});

test("rejects item missing stable id", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	await assert.rejects(
		() => planner.expand({
			runId: "run_1",
			planId: "plan_1",
			parentTask: makeParentTask(),
			items: [{ title: "No id" }],
		}),
		{ message: "each item must have a stable non-empty string 'id'" },
	);
});

test("rejects empty string id", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	await assert.rejects(
		() => planner.expand({
			runId: "run_1",
			planId: "plan_1",
			parentTask: makeParentTask(),
			items: [{ id: "", title: "Empty id" }],
		}),
		{ message: "each item must have a stable non-empty string 'id'" },
	);
});

test("rejects duplicate item ids", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	await assert.rejects(
		() => planner.expand({
			runId: "run_1",
			planId: "plan_1",
			parentTask: makeParentTask(),
			items: [
				{ id: "dup", title: "First" },
				{ id: "dup", title: "Second" },
			],
		}),
		{ message: "duplicate item id: dup" },
	);
});

test("falls back to item.id for title when item.title is missing", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask: makeParentTask(),
		items: [{ id: "no_title" }],
	});
	assert.equal(result.children[0]!.title, "Process no_title");
});

test("escapes unsafe characters in task ids", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask: makeParentTask(),
		items: [{ id: "path/with/slashes", title: "Slash" }],
	});
	assert.equal(result.children[0]!.id, "process_each__path_with_slashes");
	assert.ok(!result.children[0]!.id.includes("/"));
});

test("rejects parent without forEach config", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	const parent: TeamTask = {
		id: "normal_task",
		type: "normal",
		title: "Normal",
		input: { text: "Do" },
		acceptance: { rules: ["ok"] },
	};
	await assert.rejects(
		() => planner.expand({
			runId: "run_1",
			planId: "plan_1",
			parentTask: parent,
			items: [{ id: "x", title: "X" }],
		}),
		{ message: "parent task has no forEach config" },
	);
});

// ── P20 Task 1: generic {{item.<field>}} replacement ──

test("{{item.description}} in input.text is replaced", async () => {
	const parentTask: TeamTask = {
		id: "fe",
		type: "for_each",
		title: "FE",
		input: { text: "p" },
		acceptance: { rules: ["ok"] },
		forEach: {
			itemsFrom: "d.items",
			mode: "sequential",
			taskTemplate: {
				title: "Process {{item.id}}",
				input: { text: "Description: {{item.description}}" },
				acceptance: { rules: ["ok"] },
			},
		},
	};
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask,
		items: [{ id: "i1", title: "T", description: "A detailed description" }],
	});
	assert.equal(result.children[0]!.input.text, "Description: A detailed description");
});

test("custom field {{item.estimatedMinutes}} is replaced in acceptance rules", async () => {
	const parentTask: TeamTask = {
		id: "fe",
		type: "for_each",
		title: "FE",
		input: { text: "p" },
		acceptance: { rules: ["ok"] },
		forEach: {
			itemsFrom: "d.items",
			mode: "sequential",
			taskTemplate: {
				title: "Process {{item.id}}",
				input: { text: "Do work" },
				acceptance: { rules: ["complete within {{item.estimatedMinutes}} minutes"] },
			},
		},
	};
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask,
		items: [{ id: "i1", title: "T", estimatedMinutes: 30 }],
	});
	assert.equal(result.children[0]!.acceptance.rules[0], "complete within 30 minutes");
});

test("missing {{item.unknown}} becomes empty string", async () => {
	const parentTask: TeamTask = {
		id: "fe",
		type: "for_each",
		title: "FE",
		input: { text: "p" },
		acceptance: { rules: ["ok"] },
		forEach: {
			itemsFrom: "d.items",
			mode: "sequential",
			taskTemplate: {
				title: "Process {{item.id}}",
				input: { text: "Value: {{item.unknown}}" },
				acceptance: { rules: ["ok"] },
			},
		},
	};
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask,
		items: [{ id: "i1", title: "T" }],
	});
	assert.equal(result.children[0]!.input.text, "Value: ");
});

test("object field {{item.meta}} becomes JSON text", async () => {
	const parentTask: TeamTask = {
		id: "fe",
		type: "for_each",
		title: "FE",
		input: { text: "p" },
		acceptance: { rules: ["ok"] },
		forEach: {
			itemsFrom: "d.items",
			mode: "sequential",
			taskTemplate: {
				title: "Process {{item.id}}",
				input: { text: "Meta: {{item.meta}}" },
				acceptance: { rules: ["ok"] },
			},
		},
	};
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask,
		items: [{ id: "i1", title: "T", meta: { key: "val", nested: true } }],
	});
	const text = result.children[0]!.input.text;
	assert.ok(text.includes('"key":"val"'), `expected JSON in "${text}"`);
	assert.ok(text.includes('"nested":true'), `expected nested in "${text}"`);
});

test("{{item}} still inserts the full item JSON after generic replacement", async () => {
	const parentTask: TeamTask = {
		id: "fe",
		type: "for_each",
		title: "FE",
		input: { text: "p" },
		acceptance: { rules: ["ok"] },
		forEach: {
			itemsFrom: "d.items",
			mode: "sequential",
			taskTemplate: {
				title: "Item: {{item}}",
				input: { text: "Full: {{item}}" },
				acceptance: { rules: ["ok"] },
			},
		},
	};
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask,
		items: [{ id: "i1", description: "hello" }],
	});
	const child = result.children[0]!;
	assert.ok(child.title.includes('"description":"hello"'), "full item JSON in title");
	assert.ok(child.input.text.includes('"id":"i1"'), "full item JSON in input.text");
});

test("generic {{item.<field>}} in payload string values is replaced", async () => {
	const parentTask: TeamTask = {
		id: "fe",
		type: "for_each",
		title: "FE",
		input: { text: "p" },
		acceptance: { rules: ["ok"] },
		forEach: {
			itemsFrom: "d.items",
			mode: "sequential",
			taskTemplate: {
				title: "Process {{item.id}}",
				input: { text: "Do work", payload: { target: "{{item.url}}", note: "{{item.description}}" } },
				acceptance: { rules: ["ok"] },
			},
		},
	};
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask,
		items: [{ id: "i1", url: "https://example.com", description: "test desc" }],
	});
	const payload = result.children[0]!.input.payload!;
	assert.equal(payload!.target, "https://example.com");
	assert.equal(payload!.note, "test desc");
});

// ── P20 Task 2: run-scoped placeholders ──

test("{{task.outputDir}} expands to run-scoped path containing run ID and parent task ID", async () => {
	const parentTask: TeamTask = {
		id: "process",
		type: "for_each",
		title: "FE",
		input: { text: "p" },
		acceptance: { rules: ["ok"] },
		forEach: {
			itemsFrom: "d.items",
			mode: "sequential",
			taskTemplate: {
				title: "Process {{item.id}}",
				input: { text: "Write to {{task.outputDir}}/{{item.id}}.md" },
				acceptance: { rules: ["ok"] },
			},
		},
	};
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_abc123",
		planId: "plan_1",
		parentTask,
		items: [{ id: "i1", title: "T" }],
	});
	const text = result.children[0]!.input.text;
	assert.ok(text.includes("run_abc123"), `expected run ID in "${text}"`);
	assert.ok(text.includes("process"), `expected parent task ID in "${text}"`);
	assert.ok(text.includes("i1.md"), `expected item id in "${text}"`);
	assert.ok(!text.includes("{{"), `no raw placeholders in "${text}"`);
});

test("{{run.id}}, {{plan.id}}, and {{parentTask.id}} are replaced in payload and rules", async () => {
	const parentTask: TeamTask = {
		id: "scan",
		type: "for_each",
		title: "FE",
		input: { text: "p" },
		acceptance: { rules: ["ok"] },
		forEach: {
			itemsFrom: "d.items",
			mode: "sequential",
			taskTemplate: {
				title: "Scan {{item.id}}",
				input: { text: "Go", payload: { ref: "run={{run.id}} plan={{plan.id}} parent={{parentTask.id}}" } },
				acceptance: { rules: ["output for {{run.id}}/{{plan.id}}/{{parentTask.id}}"] },
			},
		},
	};
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_r1",
		planId: "plan_p1",
		parentTask,
		items: [{ id: "x", title: "X" }],
	});
	const child = result.children[0]!;
	assert.equal(child.input.payload!.ref, "run=run_r1 plan=plan_p1 parent=scan");
	assert.equal(child.acceptance.rules[0], "output for run_r1/plan_p1/scan");
});

test("generated output path does not contain raw {{...}}", async () => {
	const parentTask: TeamTask = {
		id: "proc",
		type: "for_each",
		title: "FE",
		input: { text: "p" },
		acceptance: { rules: ["ok"] },
		forEach: {
			itemsFrom: "d.items",
			mode: "sequential",
			taskTemplate: {
				title: "Proc {{item.id}}",
				input: { text: "Dir: {{task.outputDir}}" },
				acceptance: { rules: ["check {{task.outputDir}}"] },
			},
		},
	};
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_test1",
		planId: "plan_1",
		parentTask,
		items: [{ id: "a1", title: "A" }, { id: "b2", title: "B" }],
	});
	for (const child of result.children) {
		assert.ok(!child.input.text.includes("{{"), `no raw placeholder in "${child.input.text}"`);
		assert.ok(!child.acceptance.rules[0]!.includes("{{"), `no raw placeholder in "${child.acceptance.rules[0]}"`);
	}
});


// ── P23 Task 1: source item snapshot persistence ──

test("generated child includes sourceItem with id and full data snapshot", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask: makeParentTask(),
		items: [{ id: "battle_08", title: "藏经阁大战", chapter: "第8章" }],
	});
	const child = result.children[0]!;
	assert.equal(child.sourceItemId, "battle_08");
	assert.ok(child.sourceItem, "child must have sourceItem");
	assert.equal(child.sourceItem!.id, "battle_08");
	assert.deepEqual(child.sourceItem!.data, { id: "battle_08", title: "藏经阁大战", chapter: "第8章" });
});

test("sourceItem.data is a shallow copy, not the original item reference", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	const originalItem = { id: "x1", title: "Original", meta: { nested: true } };
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask: makeParentTask(),
		items: [originalItem],
	});
	const child = result.children[0]!;
	assert.deepEqual(child.sourceItem!.data, originalItem);
	originalItem.title = "Mutated";
	assert.equal(child.sourceItem!.data.title, "Original", "sourceItem.data must not be mutated by external changes");
});

test("generated child from item with only id still has sourceItem", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask: makeParentTask(),
		items: [{ id: "bare_id" }],
	});
	const child = result.children[0]!;
	assert.ok(child.sourceItem);
	assert.equal(child.sourceItem!.id, "bare_id");
	assert.deepEqual(child.sourceItem!.data, { id: "bare_id" });
});

test("multiple generated children each have their own sourceItem", async () => {
	const planner = new TemplateTaskExpansionPlanner();
	const result = await planner.expand({
		runId: "run_1",
		planId: "plan_1",
		parentTask: makeParentTask(),
		items: [
			{ id: "a", title: "Alpha" },
			{ id: "b", title: "Beta" },
		],
	});
	assert.equal(result.children[0]!.sourceItem!.id, "a");
	assert.deepEqual(result.children[0]!.sourceItem!.data, { id: "a", title: "Alpha" });
	assert.equal(result.children[1]!.sourceItem!.id, "b");
	assert.deepEqual(result.children[1]!.sourceItem!.data, { id: "b", title: "Beta" });
});
