import test from "node:test";
import assert from "node:assert/strict";
import {
	type TaskGraphEdge,
	typedEdgesFromConnections,
	controlEdgesFromDependencies,
	isDuplicateTypedConnection,
	isDuplicateDependency,
	wouldCreateCycle,
	wouldCreateMixedCycle,
	resolveConnectionStaleReason,
	resolveDependencyStaleReason,
} from "../src/team/task-graph.js";
import type { TeamCanvasTask, TeamTaskConnection, TeamTaskDependency } from "../src/team/types.js";

const baseWorkUnit = {
	title: "t",
	input: { text: "in" },
	outputContract: { text: "out" },
	acceptance: { rules: ["r"] },
	workerAgentId: "main",
	checkerAgentId: "main",
};

function makeTask(overrides: Partial<TeamCanvasTask> & { taskId: string }): TeamCanvasTask {
	return {
		title: "t",
		leaderAgentId: "main",
		workUnit: { ...baseWorkUnit, ...overrides.workUnit },
		status: overrides.status ?? "ready",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		archived: overrides.archived ?? false,
		...overrides,
	};
}

function makeConnection(overrides: Partial<TeamTaskConnection> = {}): TeamTaskConnection {
	return {
		schemaVersion: "team/task-connection-1",
		connectionId: "conn_test",
		fromTaskId: "s1",
		fromOutputPortId: "out_md",
		toTaskId: "t1",
		toInputPortId: "in_md",
		type: "md",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function makeDependency(overrides: Partial<TeamTaskDependency> = {}): TeamTaskDependency {
	return {
		schemaVersion: "team/task-dependency-1",
		dependencyId: "dep_test",
		fromTaskId: "s1",
		toTaskId: "t1",
		trigger: "on_success",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

// --- typedEdgesFromConnections ---

test("typedEdgesFromConnections extracts fromTaskId/toTaskId pairs", () => {
	const connections = [
		makeConnection({ fromTaskId: "A", toTaskId: "B" }),
		makeConnection({ fromTaskId: "B", toTaskId: "C" }),
	];
	const edges = typedEdgesFromConnections(connections);
	assert.deepEqual(edges, [
		{ fromTaskId: "A", toTaskId: "B" },
		{ fromTaskId: "B", toTaskId: "C" },
	]);
});

test("typedEdgesFromConnections returns empty for empty input", () => {
	assert.deepEqual(typedEdgesFromConnections([]), []);
});

// --- controlEdgesFromDependencies ---

test("controlEdgesFromDependencies extracts fromTaskId/toTaskId pairs", () => {
	const deps = [
		makeDependency({ fromTaskId: "A", toTaskId: "B" }),
	];
	const edges = controlEdgesFromDependencies(deps);
	assert.deepEqual(edges, [{ fromTaskId: "A", toTaskId: "B" }]);
});

// --- isDuplicateTypedConnection ---

test("isDuplicateTypedConnection detects exact 4-field match", () => {
	const connections = [
		makeConnection({ fromTaskId: "A", fromOutputPortId: "out_md", toTaskId: "B", toInputPortId: "in_md" }),
	];
	assert.equal(isDuplicateTypedConnection(connections, "A", "out_md", "B", "in_md"), true);
});

test("isDuplicateTypedConnection rejects partial mismatch (different port)", () => {
	const connections = [
		makeConnection({ fromTaskId: "A", fromOutputPortId: "out_md", toTaskId: "B", toInputPortId: "in_md" }),
	];
	assert.equal(isDuplicateTypedConnection(connections, "A", "out_md", "B", "in_html"), false);
	assert.equal(isDuplicateTypedConnection(connections, "A", "out_html", "B", "in_md"), false);
	assert.equal(isDuplicateTypedConnection(connections, "B", "out_md", "A", "in_md"), false);
});

test("isDuplicateTypedConnection returns false for empty list", () => {
	assert.equal(isDuplicateTypedConnection([], "A", "out_md", "B", "in_md"), false);
});

// --- isDuplicateDependency ---

test("isDuplicateDependency detects same fromTaskId + toTaskId", () => {
	const deps = [makeDependency({ fromTaskId: "A", toTaskId: "B" })];
	assert.equal(isDuplicateDependency(deps, "A", "B"), true);
});

test("isDuplicateDependency rejects reversed direction", () => {
	const deps = [makeDependency({ fromTaskId: "A", toTaskId: "B" })];
	assert.equal(isDuplicateDependency(deps, "B", "A"), false);
});

test("isDuplicateDependency returns false for empty list", () => {
	assert.equal(isDuplicateDependency([], "A", "B"), false);
});

// --- wouldCreateCycle ---

test("wouldCreateCycle: direct cycle", () => {
	const edges: TaskGraphEdge[] = [{ fromTaskId: "B", toTaskId: "A" }];
	assert.equal(wouldCreateCycle(edges, "A", "B"), true);
});

test("wouldCreateCycle: indirect cycle through chain", () => {
	const edges: TaskGraphEdge[] = [
		{ fromTaskId: "B", toTaskId: "C" },
		{ fromTaskId: "C", toTaskId: "D" },
		{ fromTaskId: "D", toTaskId: "A" },
	];
	assert.equal(wouldCreateCycle(edges, "A", "B"), true);
});

test("wouldCreateCycle: acyclic edge returns false", () => {
	const edges: TaskGraphEdge[] = [
		{ fromTaskId: "A", toTaskId: "C" },
		{ fromTaskId: "C", toTaskId: "D" },
	];
	assert.equal(wouldCreateCycle(edges, "A", "B"), false);
});

test("wouldCreateCycle: empty graph returns false", () => {
	assert.equal(wouldCreateCycle([], "A", "B"), false);
});

test("wouldCreateCycle: self-loop detection (from === to)", () => {
	assert.equal(wouldCreateCycle([], "A", "A"), true);
});

// --- wouldCreateMixedCycle ---

test("wouldCreateMixedCycle: typed-only cycle", () => {
	const connections = [makeConnection({ fromTaskId: "B", toTaskId: "A" })];
	assert.equal(wouldCreateMixedCycle(connections, [], "A", "B"), true);
});

test("wouldCreateMixedCycle: control-only cycle", () => {
	const deps = [makeDependency({ fromTaskId: "B", toTaskId: "A" })];
	assert.equal(wouldCreateMixedCycle([], deps, "A", "B"), true);
});

test("wouldCreateMixedCycle: mixed typed + control forms cycle", () => {
	const connections = [makeConnection({ fromTaskId: "A", toTaskId: "B" })];
	const deps = [makeDependency({ fromTaskId: "B", toTaskId: "C" })];
	assert.equal(wouldCreateMixedCycle(connections, deps, "C", "A"), true);
});

test("wouldCreateMixedCycle: acyclic mixed edges", () => {
	const connections = [makeConnection({ fromTaskId: "A", toTaskId: "B" })];
	const deps = [makeDependency({ fromTaskId: "B", toTaskId: "C" })];
	assert.equal(wouldCreateMixedCycle(connections, deps, "A", "D"), false);
});

test("wouldCreateMixedCycle: empty everything returns false", () => {
	assert.equal(wouldCreateMixedCycle([], [], "A", "B"), false);
});

test("wouldCreateMixedCycle: cycle through 3-edge chain of mixed types", () => {
	const connections = [
		makeConnection({ fromTaskId: "A", toTaskId: "B" }),
	];
	const deps = [
		makeDependency({ fromTaskId: "B", toTaskId: "C" }),
		makeDependency({ fromTaskId: "C", toTaskId: "D" }),
	];
	assert.equal(wouldCreateMixedCycle(connections, deps, "D", "A"), true);
});

// --- resolveConnectionStaleReason ---

test("resolveConnectionStaleReason: active connection returns null", () => {
	const source = makeTask({
		taskId: "s1",
		workUnit: { ...baseWorkUnit, outputPorts: [{ id: "out_md", type: "md" }] },
	});
	const target = makeTask({
		taskId: "t1",
		workUnit: { ...baseWorkUnit, inputPorts: [{ id: "in_md", type: "md" }] },
	});
	assert.equal(resolveConnectionStaleReason(source, target, makeConnection()), null);
});

test("resolveConnectionStaleReason: source_task_missing", () => {
	assert.equal(resolveConnectionStaleReason(null, null, makeConnection()), "source_task_missing");
});

test("resolveConnectionStaleReason: source_task_archived", () => {
	const source = makeTask({ taskId: "s1", archived: true });
	assert.equal(resolveConnectionStaleReason(source, null, makeConnection()), "source_task_archived");
});

test("resolveConnectionStaleReason: target_task_missing", () => {
	const source = makeTask({ taskId: "s1" });
	assert.equal(resolveConnectionStaleReason(source, null, makeConnection()), "target_task_missing");
});

test("resolveConnectionStaleReason: target_task_archived", () => {
	const source = makeTask({ taskId: "s1" });
	const target = makeTask({ taskId: "t1", archived: true });
	assert.equal(resolveConnectionStaleReason(source, target, makeConnection()), "target_task_archived");
});

test("resolveConnectionStaleReason: port type mismatch", () => {
	const source = makeTask({
		taskId: "s1",
		workUnit: { ...baseWorkUnit, outputPorts: [{ id: "out_md", type: "html" }] },
	});
	const target = makeTask({
		taskId: "t1",
		workUnit: { ...baseWorkUnit, inputPorts: [{ id: "in_md", type: "md" }] },
	});
	assert.equal(resolveConnectionStaleReason(source, target, makeConnection()), "source_output_port_type_mismatch");
});

// --- resolveDependencyStaleReason ---

test("resolveDependencyStaleReason: active returns null", () => {
	assert.equal(resolveDependencyStaleReason(makeTask({ taskId: "s1" }), makeTask({ taskId: "t1" })), null);
});

test("resolveDependencyStaleReason: source_task_missing", () => {
	assert.equal(resolveDependencyStaleReason(null, makeTask({ taskId: "t1" })), "source_task_missing");
});

test("resolveDependencyStaleReason: source_task_archived", () => {
	assert.equal(resolveDependencyStaleReason(makeTask({ taskId: "s1", archived: true }), makeTask({ taskId: "t1" })), "source_task_archived");
});

test("resolveDependencyStaleReason: target_task_missing", () => {
	assert.equal(resolveDependencyStaleReason(makeTask({ taskId: "s1" }), null), "target_task_missing");
});

test("resolveDependencyStaleReason: target_task_archived", () => {
	assert.equal(resolveDependencyStaleReason(makeTask({ taskId: "s1" }), makeTask({ taskId: "t1", archived: true })), "target_task_archived");
});
