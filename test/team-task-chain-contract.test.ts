import test from "node:test";
import assert from "node:assert/strict";
import { resolveConnectionStaleReason, wouldCreateTaskConnectionCycle } from "../src/team/task-chain-contract.js";
import type { TeamCanvasTask, TeamTaskConnection } from "../src/team/types.js";

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
	const connection = makeConnection();
	assert.equal(resolveConnectionStaleReason(source, target, connection), null);
});

test("resolveConnectionStaleReason: source_task_missing", () => {
	const target = makeTask({
		taskId: "t1",
		workUnit: { ...baseWorkUnit, inputPorts: [{ id: "in_md", type: "md" }] },
	});
	const connection = makeConnection();
	assert.equal(resolveConnectionStaleReason(null, target, connection), "source_task_missing");
});

test("resolveConnectionStaleReason: source_task_archived", () => {
	const source = makeTask({
		taskId: "s1",
		archived: true,
		workUnit: { ...baseWorkUnit, outputPorts: [{ id: "out_md", type: "md" }] },
	});
	const target = makeTask({
		taskId: "t1",
		workUnit: { ...baseWorkUnit, inputPorts: [{ id: "in_md", type: "md" }] },
	});
	const connection = makeConnection();
	assert.equal(resolveConnectionStaleReason(source, target, connection), "source_task_archived");
});

test("resolveConnectionStaleReason: target_task_missing", () => {
	const source = makeTask({
		taskId: "s1",
		workUnit: { ...baseWorkUnit, outputPorts: [{ id: "out_md", type: "md" }] },
	});
	const connection = makeConnection();
	assert.equal(resolveConnectionStaleReason(source, null, connection), "target_task_missing");
});

test("resolveConnectionStaleReason: target_task_archived", () => {
	const source = makeTask({
		taskId: "s1",
		workUnit: { ...baseWorkUnit, outputPorts: [{ id: "out_md", type: "md" }] },
	});
	const target = makeTask({
		taskId: "t1",
		archived: true,
		workUnit: { ...baseWorkUnit, inputPorts: [{ id: "in_md", type: "md" }] },
	});
	const connection = makeConnection();
	assert.equal(resolveConnectionStaleReason(source, target, connection), "target_task_archived");
});

test("resolveConnectionStaleReason: source_output_port_missing", () => {
	const source = makeTask({
		taskId: "s1",
		workUnit: { ...baseWorkUnit, outputPorts: [{ id: "out_html", type: "html" }] },
	});
	const target = makeTask({
		taskId: "t1",
		workUnit: { ...baseWorkUnit, inputPorts: [{ id: "in_md", type: "md" }] },
	});
	const connection = makeConnection();
	assert.equal(resolveConnectionStaleReason(source, target, connection), "source_output_port_missing");
});

test("resolveConnectionStaleReason: source_output_port_type_mismatch", () => {
	const source = makeTask({
		taskId: "s1",
		workUnit: { ...baseWorkUnit, outputPorts: [{ id: "out_md", type: "html" }] },
	});
	const target = makeTask({
		taskId: "t1",
		workUnit: { ...baseWorkUnit, inputPorts: [{ id: "in_md", type: "md" }] },
	});
	const connection = makeConnection();
	assert.equal(resolveConnectionStaleReason(source, target, connection), "source_output_port_type_mismatch");
});

test("resolveConnectionStaleReason: target_input_port_missing", () => {
	const source = makeTask({
		taskId: "s1",
		workUnit: { ...baseWorkUnit, outputPorts: [{ id: "out_md", type: "md" }] },
	});
	const target = makeTask({
		taskId: "t1",
		workUnit: { ...baseWorkUnit, inputPorts: [{ id: "in_html", type: "html" }] },
	});
	const connection = makeConnection();
	assert.equal(resolveConnectionStaleReason(source, target, connection), "target_input_port_missing");
});

test("resolveConnectionStaleReason: target_input_port_type_mismatch", () => {
	const source = makeTask({
		taskId: "s1",
		workUnit: { ...baseWorkUnit, outputPorts: [{ id: "out_md", type: "md" }] },
	});
	const target = makeTask({
		taskId: "t1",
		workUnit: { ...baseWorkUnit, inputPorts: [{ id: "in_md", type: "html" }] },
	});
	const connection = makeConnection();
	assert.equal(resolveConnectionStaleReason(source, target, connection), "target_input_port_type_mismatch");
});

test("resolveConnectionStaleReason: priority — source missing beats source archived", () => {
	assert.equal(resolveConnectionStaleReason(null, null, makeConnection()), "source_task_missing");
});

test("resolveConnectionStaleReason: priority — source archived beats target missing", () => {
	const source = makeTask({ taskId: "s1", archived: true });
	assert.equal(resolveConnectionStaleReason(source, null, makeConnection()), "source_task_archived");
});

// --- wouldCreateTaskConnectionCycle ---

test("wouldCreateTaskConnectionCycle: direct cycle returns true", () => {
	const connections: TeamTaskConnection[] = [
		makeConnection({ fromTaskId: "B", toTaskId: "A" }),
	];
	assert.equal(wouldCreateTaskConnectionCycle(connections, "A", "B"), true);
});

test("wouldCreateTaskConnectionCycle: indirect cycle returns true", () => {
	const connections: TeamTaskConnection[] = [
		makeConnection({ fromTaskId: "B", toTaskId: "C" }),
		makeConnection({ fromTaskId: "C", toTaskId: "D" }),
		makeConnection({ fromTaskId: "D", toTaskId: "A" }),
	];
	assert.equal(wouldCreateTaskConnectionCycle(connections, "A", "B"), true);
});

test("wouldCreateTaskConnectionCycle: acyclic edge returns false", () => {
	const connections: TeamTaskConnection[] = [
		makeConnection({ fromTaskId: "A", toTaskId: "C" }),
		makeConnection({ fromTaskId: "C", toTaskId: "D" }),
	];
	assert.equal(wouldCreateTaskConnectionCycle(connections, "A", "B"), false);
});

test("wouldCreateTaskConnectionCycle: empty existing connections with distinct source/target returns false", () => {
	assert.equal(wouldCreateTaskConnectionCycle([], "A", "B"), false);
});
