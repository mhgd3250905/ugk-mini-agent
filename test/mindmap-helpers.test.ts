import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
	buildMindmapNodes,
	collectRunTaskDefinitions,
	getMindmapChildrenByParent,
	describeMindmapNodeType,
	type MindmapNode,
} from "../src/ui/mindmap-helpers.js";

function findNodeById(root: MindmapNode, id: string): MindmapNode | null {
	if (root.id === id) return root;
	for (const c of root.children) {
		const found = findNodeById(c, id);
		if (found) return found;
	}
	return null;
}

function allNodeIds(root: MindmapNode): string[] {
	const ids: string[] = [];
	function walk(n: MindmapNode) {
		ids.push(n.id);
		for (const c of n.children) walk(c);
	}
	walk(root);
	return ids;
}

/** 1. Generated child with explicit parentTaskId attaches to that parent. */
test("child with parentTaskId attaches to correct parent", () => {
	const state = {
		runId: "run_abc123",
		status: "completed",
		summary: { totalTasks: 2, succeededTasks: 2 },
		taskStates: {
			task_1: { status: "succeeded", attemptCount: 1 },
			task_2: { status: "succeeded", attemptCount: 1 },
			"task_1__item_0": { status: "succeeded", attemptCount: 1 },
		},
		taskDefinitions: [
			{ id: "task_1__item_0", title: "Process item 0", parentTaskId: "task_1", generated: true, sourceItemId: "item_0" },
		],
	};
	const plan = {
		tasks: [
			{ id: "task_1", title: "Discovery", type: "discovery" },
			{ id: "task_2", title: "Finalize", type: "normal" },
		],
	};

	const root = buildMindmapNodes(state, plan);
	const parent = findNodeById(root, "task_1");
	assert.ok(parent, "task_1 should exist in tree");
	assert.equal(parent!.children.length, 1, "task_1 should have 1 child");
	assert.equal(parent!.children[0].id, "task_1__item_0");
	assert.equal(parent!.children[0].generated, true);
	// NOT fallback — has a real definition with parentTaskId
	assert.equal(parent!.children[0].fallback, false);
});

test("child with missing parentTaskId stays visible in orphan group", () => {
	const state = {
		runId: "run_missing_parent",
		status: "completed",
		summary: { totalTasks: 2, succeededTasks: 1 },
		taskStates: {
			real_parent: { status: "succeeded", attemptCount: 1 },
			lost_child: { status: "failed", attemptCount: 1, errorSummary: "parent missing\nsecond line" },
		},
		taskDefinitions: [
			{
				id: "lost_child",
				title: "Lost child",
				parentTaskId: "missing_parent",
				generated: true,
			},
		],
	};
	const plan = {
		tasks: [
			{ id: "real_parent", title: "Real parent" },
		],
	};

	const root = buildMindmapNodes(state, plan);
	const missingParent = findNodeById(root, "missing_parent");
	assert.equal(missingParent, null, "missing parent should not be rendered as a fake plan node");

	const orphanGroup = findNodeById(root, "__orphan_generated__");
	assert.ok(orphanGroup, "orphan group should exist");
	assert.equal(orphanGroup!.children.length, 1);
	assert.equal(orphanGroup!.children[0].id, "lost_child");
	assert.equal(orphanGroup!.children[0].fallback, true);
	assert.equal(orphanGroup!.children[0].errorSummary, "parent missing");
});

/** 2. Orphan without metadata: no definition, no parent, no prefix — still visible. */
test("orphan taskState with no definition no parent no prefix is visible in orphan group", () => {
	const state = {
		runId: "run_orphan",
		status: "running",
		summary: { totalTasks: 1 },
		taskStates: {
			task_a: { status: "running", attemptCount: 0 },
			"totally_orphan_id": { status: "failed", attemptCount: 1, errorSummary: "Something went wrong" },
		},
	};
	const plan = {
		tasks: [
			{ id: "task_a", title: "Plan task A" },
		],
	};

	const root = buildMindmapNodes(state, plan);
	const ids = allNodeIds(root);
	assert.ok(ids.includes("totally_orphan_id"), "orphan id must appear in the node tree");

	const orphanGroup = findNodeById(root, "__orphan_generated__");
	assert.ok(orphanGroup, "orphan group should exist");
	assert.equal(orphanGroup!.nodeType, "orphan-group");
	assert.equal(orphanGroup!.children.length, 1);
	assert.equal(orphanGroup!.children[0].id, "totally_orphan_id");
	assert.equal(orphanGroup!.children[0].fallback, true);
});

/** 3. Id prefix fallback attaches child and marks fallback. */
test("id prefix fallback attaches and marks fallback", () => {
	const state = {
		runId: "run_prefix",
		status: "completed",
		summary: { totalTasks: 1, succeededTasks: 1 },
		taskStates: {
			parent_task: { status: "succeeded", attemptCount: 1 },
			"parent_task__gen_0": { status: "succeeded", attemptCount: 1 },
		},
		// No taskDefinitions — no explicit parentTaskId metadata
	};
	const plan = {
		tasks: [
			{ id: "parent_task", title: "Parent" },
		],
	};

	const root = buildMindmapNodes(state, plan);
	const parent = findNodeById(root, "parent_task");
	assert.ok(parent, "parent_task exists");
	assert.equal(parent!.children.length, 1, "should have 1 child via prefix");
	assert.equal(parent!.children[0].id, "parent_task__gen_0");
	assert.equal(parent!.children[0].fallback, true, "prefix fallback should be marked");
});

/** 4. sourceItemId with single for_each parent attaches to that parent. */
test("sourceItemId attaches to sole for_each parent", () => {
	const state = {
		runId: "run_srcid",
		status: "completed",
		summary: { totalTasks: 2, succeededTasks: 2 },
		taskStates: {
			discovery: { status: "succeeded", attemptCount: 1 },
			for_each_main: { status: "succeeded", attemptCount: 0 },
			"fe_child_0": { status: "succeeded", attemptCount: 1 },
		},
		taskDefinitions: [
			{
				id: "fe_child_0",
				title: "Handle item 0",
				sourceItemId: "item_0",
				generated: true,
				// No parentTaskId — sourceItemId is the only clue
			},
		],
	};
	const plan = {
		tasks: [
			{ id: "discovery", title: "Discover items", type: "discovery" },
			{
				id: "for_each_main",
				title: "Process each item",
				type: "for_each",
				forEach: { itemsFrom: "discovery.output.items" },
			},
		],
	};

	const root = buildMindmapNodes(state, plan);
	const parent = findNodeById(root, "for_each_main");
	assert.ok(parent, "for_each_main should exist");
	assert.equal(parent!.children.length, 1, "should have 1 child via sourceItemId");
	assert.equal(parent!.children[0].id, "fe_child_0");
	assert.equal(parent!.children[0].fallback, false, "has definition, not fallback");
});

/** 5. sourceItemId with multiple for_each parents → orphan group (can't uniquely determine). */
test("sourceItemId with multiple for_each parents becomes orphan", () => {
	const state = {
		runId: "run_multi_fe",
		status: "completed",
		summary: { totalTasks: 3, succeededTasks: 3 },
		taskStates: {
			disc: { status: "succeeded", attemptCount: 1 },
			fe_a: { status: "succeeded", attemptCount: 0 },
			fe_b: { status: "succeeded", attemptCount: 0 },
			"ambiguous_child": { status: "succeeded", attemptCount: 1 },
		},
		taskDefinitions: [
			{ id: "ambiguous_child", title: "Ambiguous", sourceItemId: "x", generated: true },
		],
	};
	const plan = {
		tasks: [
			{ id: "disc", title: "Discover", type: "discovery" },
			{ id: "fe_a", title: "Process A", type: "for_each", forEach: { itemsFrom: "disc.items" } },
			{ id: "fe_b", title: "Process B", type: "for_each", forEach: { itemsFrom: "disc.items" } },
		],
	};

	const root = buildMindmapNodes(state, plan);
	const ids = allNodeIds(root);
	assert.ok(ids.includes("ambiguous_child"), "ambiguous child must be in tree");

	// Should NOT be under fe_a or fe_b
	const feA = findNodeById(root, "fe_a");
	const feB = findNodeById(root, "fe_b");
	assert.equal(feA!.children.length, 0, "fe_a should have no children");
	assert.equal(feB!.children.length, 0, "fe_b should have no children");

	// Should be in orphan group
	const orphanGroup = findNodeById(root, "__orphan_generated__");
	assert.ok(orphanGroup, "orphan group should exist");
	assert.equal(orphanGroup!.children.length, 1);
	assert.equal(orphanGroup!.children[0].id, "ambiguous_child");
});

/** 6. Failed node shows only first line of errorSummary. */
test("failed node errorSummary is first line only", () => {
	const state = {
		runId: "run_err",
		status: "failed",
		summary: { totalTasks: 1, failedTasks: 1 },
		taskStates: {
			fail_task: {
				status: "failed",
				attemptCount: 1,
				errorSummary: "Connection refused\nDetail: ECONNREFUSED 127.0.0.1:3000\nStack: ...",
			},
		},
	};
	const plan = {
		tasks: [
			{ id: "fail_task", title: "Failing task" },
		],
	};

	const root = buildMindmapNodes(state, plan);
	const node = findNodeById(root, "fail_task");
	assert.ok(node);
	assert.equal(node!.errorSummary, "Connection refused");
	assert.ok(
		!node!.errorSummary!.includes("Detail"),
		"should not include second line",
	);
});

/** 7. collectRunTaskDefinitions merges from multiple sources. */
test("collectRunTaskDefinitions merges from multiple sources", () => {
	// taskDefinitions is present → use it, skip generatedTasks
	const state1 = {
		taskDefinitions: [{ id: "a" }],
		generatedTasks: [{ id: "b" }],
	};
	const plan = { tasks: [] };
	const defs1 = collectRunTaskDefinitions(state1, plan);
	assert.equal(defs1.length, 1);
	assert.equal(defs1[0].id, "a");

	// No taskDefinitions → fall through to generatedTasks
	const state2 = { generatedTasks: [{ id: "b" }], tasks: [{ id: "c", generated: true }] };
	const defs2 = collectRunTaskDefinitions(state2, plan);
	assert.equal(defs2.length, 2);

	// No taskDefinitions or generatedTasks → use tasks with generated flag
	const state3 = { tasks: [{ id: "c", generated: true }, { id: "d", generated: false }] };
	const defs3 = collectRunTaskDefinitions(state3, plan);
	assert.equal(defs3.length, 1);
	assert.equal(defs3[0].id, "c");
});

/** 8. No duplicate children — same id via definition and taskState. */
test("child is not duplicated when both definition and taskState exist", () => {
	const state = {
		runId: "run_dup",
		status: "completed",
		summary: { totalTasks: 1, succeededTasks: 1 },
		taskStates: {
			parent: { status: "succeeded", attemptCount: 1 },
			"parent__child_0": { status: "succeeded", attemptCount: 1 },
		},
		taskDefinitions: [
			{ id: "parent__child_0", title: "Child 0", parentTaskId: "parent", generated: true },
		],
	};
	const plan = {
		tasks: [
			{ id: "parent", title: "Parent" },
		],
	};

	const root = buildMindmapNodes(state, plan);
	const parent = findNodeById(root, "parent");
	assert.ok(parent);
	assert.equal(parent!.children.length, 1, "child should appear exactly once");
});

/** 9. getMindmapChildrenByParent returns correct structure independently. */
test("getMindmapChildrenByParent returns byParent, orphanIds, prefixFallbackIds", () => {
	const planTasks = [
		{ id: "t1", title: "Task 1" },
		{ id: "t2", title: "Task 2", type: "for_each" },
	];
	const defs = [
		{ id: "t1__c1", parentTaskId: "t1", generated: true },
		{ id: "no_parent_no_prefix", generated: true, sourceItemId: "x" },
	];
	const taskStates: Record<string, unknown> = {
		t1__c1: {},
		no_parent_no_prefix: {},
		t2__via_prefix: {},
		"completely_unknown": {},
	};

	const result = getMindmapChildrenByParent(planTasks, defs, taskStates);

	// t1__c1 attached via parentTaskId
	assert.deepEqual(result.byParent["t1"], ["t1__c1"]);
	assert.ok(result.prefixFallbackIds.includes("t1__c1") === false, "not a prefix fallback");

	// t2 gets both: no_parent_no_prefix via sourceItemId (sole for_each parent), t2__via_prefix via prefix
	assert.equal(result.byParent["t2"].length, 2);
	assert.ok(result.byParent["t2"].includes("no_parent_no_prefix"), "sourceItemId child attached to t2");
	assert.ok(result.byParent["t2"].includes("t2__via_prefix"), "prefix child attached to t2");
	assert.ok(result.prefixFallbackIds.includes("t2__via_prefix"), "is prefix fallback");
	assert.ok(!result.prefixFallbackIds.includes("no_parent_no_prefix"), "sourceItemId child is not prefix fallback");

	// Orphans: only completely_unknown (no def, no parent, no prefix)
	assert.ok(result.orphanIds.includes("completely_unknown"), "unknown id is orphan");
	assert.ok(!result.orphanIds.includes("no_parent_no_prefix"), "sourceItemId child is not orphan");
});

/** 10. describeMindmapNodeType returns correct labels. */
test("describeMindmapNodeType labels", () => {
	assert.equal(describeMindmapNodeType({ type: "discovery" }, false), "发现");
	assert.equal(describeMindmapNodeType({ type: "for_each" }, false), "逐项处理");
	assert.equal(describeMindmapNodeType({ generatedSource: "for_each" }, true), "动态子任务");
	assert.equal(describeMindmapNodeType({ generatedSource: "decomposition" }, true), "拆分子任务");
	assert.equal(describeMindmapNodeType({}, true), "生成任务");
	assert.equal(describeMindmapNodeType(null, false), "任务");
	assert.equal(describeMindmapNodeType({ type: "normal" }, false), "任务");
});
