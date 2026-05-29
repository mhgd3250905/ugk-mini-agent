import test from "node:test";
import assert from "node:assert/strict";
import { planDownstreamDelivery } from "../src/team/downstream-delivery.js";
import type { DownstreamSource, DownstreamPlanContext, DownstreamAction, TriggerTypedRunAction, TriggerControlRunAction, SkipTypedAction, SkipControlAction } from "../src/team/downstream-delivery.js";
import type { TeamCanvasTask, TeamTaskConnection, TeamTaskDependency } from "../src/team/types.js";

// --- Helpers ---

function makeTask(taskId: string, overrides: Partial<TeamCanvasTask> = {}): TeamCanvasTask {
	return {
		taskId,
		title: `Task ${taskId}`,
		leaderAgentId: "main",
		workUnit: {
			title: `WorkUnit ${taskId}`,
			input: { text: "do work" },
			outputContract: { text: "output" },
			acceptance: { rules: ["ok"] },
			workerAgentId: "main",
			checkerAgentId: "main",
			...overrides.workUnit,
		},
		status: "ready",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		archived: false,
		...overrides,
	};
}

function makeConnection(fromTaskId: string, toTaskId: string, overrides: Partial<TeamTaskConnection> = {}): TeamTaskConnection {
	return {
		schemaVersion: "team/task-connection-1",
		connectionId: `conn-${fromTaskId}-${toTaskId}`,
		fromTaskId,
		fromOutputPortId: "out",
		toTaskId,
		toInputPortId: "in",
		type: "md",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function makeDependency(fromTaskId: string, toTaskId: string): TeamTaskDependency {
	return {
		schemaVersion: "team/task-dependency-1",
		dependencyId: `dep-${fromTaskId}-${toTaskId}`,
		fromTaskId,
		toTaskId,
		trigger: "on_success",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

function makeSource(taskId = "A"): DownstreamSource {
	return {
		runId: "run-1",
		taskId,
		attemptId: "att-1",
		resultRef: "result.md",
		resultContent: "# Result",
	};
}

function makeContext(overrides: Partial<DownstreamPlanContext> = {}): DownstreamPlanContext {
	return {
		sourceTask: makeTask("A"),
		connections: [],
		dependencies: [],
		getTask: () => null,
		...overrides,
	};
}

// --- Tests ---

test("typed fan-out: one source produces trigger_typed_run for each connection", () => {
	const taskA = makeTask("A", {
		workUnit: {
			title: "A",
			input: { text: "do" },
			outputContract: { text: "out" },
			acceptance: { rules: ["ok"] },
			workerAgentId: "main",
			checkerAgentId: "main",
			outputPorts: [{ id: "out", type: "md" }],
		},
	});
	const taskB = makeTask("B", {
		workUnit: {
			title: "B",
			input: { text: "do" },
			outputContract: { text: "out" },
			acceptance: { rules: ["ok"] },
			workerAgentId: "main",
			checkerAgentId: "main",
			inputPorts: [{ id: "in", type: "md" }],
		},
	});
	const taskC = makeTask("C", {
		workUnit: {
			title: "C",
			input: { text: "do" },
			outputContract: { text: "out" },
			acceptance: { rules: ["ok"] },
			workerAgentId: "main",
			checkerAgentId: "main",
			inputPorts: [{ id: "in", type: "md" }],
		},
	});
	const taskMap = new Map<string, TeamCanvasTask>([
		["B", taskB],
		["C", taskC],
	]);
	const connAB = makeConnection("A", "B");
	const connAC = makeConnection("A", "C");
	const actions = planDownstreamDelivery(makeSource("A"), {
		sourceTask: taskA,
		connections: [connAB, connAC],
		dependencies: [],
		getTask: (id) => taskMap.get(id) ?? null,
	});

	assert.equal(actions.length, 2);
	assert.equal(actions[0].type, "trigger_typed_run");
	assert.equal(actions[1].type, "trigger_typed_run");

	const [a0, a1] = actions as TriggerTypedRunAction[];
	assert.equal(a0.targetTask.taskId, "B");
	assert.equal(a0.connection.connectionId, connAB.connectionId);
	assert.equal(a0.artifactParams.sourceOutputPortId, "out");
	assert.equal(a0.triggeredBy.fromTaskId, "A");

	assert.equal(a1.targetTask.taskId, "C");
	assert.equal(a1.connection.connectionId, connAC.connectionId);
});

test("control dependency trigger: produces trigger_control_run action", () => {
	const taskA = makeTask("A");
	const taskB = makeTask("B");
	const dep = makeDependency("A", "B");
	const actions = planDownstreamDelivery(makeSource("A"), {
		sourceTask: taskA,
		connections: [],
		dependencies: [dep],
		getTask: (id) => id === "B" ? taskB : null,
	});

	assert.equal(actions.length, 1);
	assert.equal(actions[0].type, "trigger_control_run");
	const action = actions[0] as TriggerControlRunAction;
	assert.equal(action.targetTask.taskId, "B");
	assert.equal(action.dependency.dependencyId, dep.dependencyId);
	assert.equal(action.triggeredBy.type, "task-dependency");
	assert.equal(action.triggeredBy.fromTaskId, "A");
	assert.equal(action.triggeredBy.fromRunId, "run-1");
	assert.equal(action.triggeredBy.fromAttemptId, "att-1");
});

test("stale target skip: archived target produces skip_typed", () => {
	const taskA = makeTask("A", {
		workUnit: {
			title: "A",
			input: { text: "do" },
			outputContract: { text: "out" },
			acceptance: { rules: ["ok"] },
			workerAgentId: "main",
			checkerAgentId: "main",
			outputPorts: [{ id: "out", type: "md" }],
		},
	});
	const taskB = makeTask("B", { archived: true });
	const conn = makeConnection("A", "B");
	const actions = planDownstreamDelivery(makeSource("A"), {
		sourceTask: taskA,
		connections: [conn],
		dependencies: [],
		getTask: (id) => id === "B" ? taskB : null,
	});

	assert.equal(actions.length, 1);
	assert.equal(actions[0].type, "skip_typed");
	const skip = actions[0] as SkipTypedAction;
	assert.equal(skip.toTaskId, "B");
	assert.equal(skip.staleReason, "target_task_archived");
	assert.equal(skip.connectionId, conn.connectionId);
	assert.equal(skip.toInputPortId, "in");
});

test("stale target skip: missing target produces skip_typed", () => {
	const taskA = makeTask("A", {
		workUnit: {
			title: "A",
			input: { text: "do" },
			outputContract: { text: "out" },
			acceptance: { rules: ["ok"] },
			workerAgentId: "main",
			checkerAgentId: "main",
			outputPorts: [{ id: "out", type: "md" }],
		},
	});
	const conn = makeConnection("A", "missing");
	const actions = planDownstreamDelivery(makeSource("A"), {
		sourceTask: taskA,
		connections: [conn],
		dependencies: [],
		getTask: () => null,
	});

	assert.equal(actions.length, 1);
	assert.equal(actions[0].type, "skip_typed");
	assert.equal((actions[0] as SkipTypedAction).staleReason, "target_task_missing");
});

test("stale control dependency: archived target produces skip_control", () => {
	const taskA = makeTask("A");
	const taskB = makeTask("B", { archived: true });
	const dep = makeDependency("A", "B");
	const actions = planDownstreamDelivery(makeSource("A"), {
		sourceTask: taskA,
		connections: [],
		dependencies: [dep],
		getTask: (id) => id === "B" ? taskB : null,
	});

	assert.equal(actions.length, 1);
	assert.equal(actions[0].type, "skip_control");
	const skip = actions[0] as SkipControlAction;
	assert.equal(skip.toTaskId, "B");
	assert.equal(skip.staleReason, "target_task_archived");
	assert.equal(skip.dependencyId, dep.dependencyId);
});

test("source task missing: all connections and dependencies become skip actions", () => {
	const conn = makeConnection("A", "B");
	const dep = makeDependency("A", "C");
	const actions = planDownstreamDelivery(makeSource("A"), {
		sourceTask: null,
		connections: [conn],
		dependencies: [dep],
		getTask: () => null,
	});

	assert.equal(actions.length, 2);
	assert.equal(actions[0].type, "skip_typed");
	assert.equal((actions[0] as SkipTypedAction).staleReason, "source_task_missing");
	assert.equal(actions[1].type, "skip_control");
	assert.equal((actions[1] as SkipControlAction).staleReason, "source_task_missing");
});

test("source task archived: all connections and dependencies skip with source_task_archived", () => {
	const taskA = makeTask("A", { archived: true });
	const conn = makeConnection("A", "B");
	const dep = makeDependency("A", "C");
	const actions = planDownstreamDelivery(makeSource("A"), {
		sourceTask: taskA,
		connections: [conn],
		dependencies: [dep],
		getTask: () => null,
	});

	assert.equal(actions.length, 2);
	assert.equal(actions[0].type, "skip_typed");
	assert.equal((actions[0] as SkipTypedAction).staleReason, "source_task_archived");
	assert.equal(actions[1].type, "skip_control");
	assert.equal((actions[1] as SkipControlAction).staleReason, "source_task_archived");
});

test("no connections or dependencies returns empty actions", () => {
	const actions = planDownstreamDelivery(makeSource("A"), makeContext());
	assert.deepEqual(actions, []);
});

test("mixed: stale typed + valid control produces skip_typed and trigger_control_run", () => {
	const taskA = makeTask("A", {
		workUnit: {
			title: "A",
			input: { text: "do" },
			outputContract: { text: "out" },
			acceptance: { rules: ["ok"] },
			workerAgentId: "main",
			checkerAgentId: "main",
			outputPorts: [{ id: "out", type: "md" }],
		},
	});
	const taskB = makeTask("B", { archived: true });
	const taskC = makeTask("C");
	const conn = makeConnection("A", "B");
	const dep = makeDependency("A", "C");
	const taskMap = new Map<string, TeamCanvasTask>([
		["B", taskB],
		["C", taskC],
	]);
	const actions = planDownstreamDelivery(makeSource("A"), {
		sourceTask: taskA,
		connections: [conn],
		dependencies: [dep],
		getTask: (id) => taskMap.get(id) ?? null,
	});

	assert.equal(actions.length, 2);
	assert.equal(actions[0].type, "skip_typed");
	assert.equal((actions[0] as SkipTypedAction).staleReason, "target_task_archived");
	assert.equal(actions[1].type, "trigger_control_run");
	assert.equal((actions[1] as TriggerControlRunAction).targetTask.taskId, "C");
});

test("typed artifact params carry source context correctly", () => {
	const taskA = makeTask("A", {
		workUnit: {
			title: "A",
			input: { text: "do" },
			outputContract: { text: "out" },
			acceptance: { rules: ["ok"] },
			workerAgentId: "main",
			checkerAgentId: "main",
			outputPorts: [{ id: "report", type: "html" }],
		},
	});
	const taskB = makeTask("B", {
		workUnit: {
			title: "B",
			input: { text: "do" },
			outputContract: { text: "out" },
			acceptance: { rules: ["ok"] },
			workerAgentId: "main",
			checkerAgentId: "main",
			inputPorts: [{ id: "report-in", type: "html" }],
		},
	});
	const conn = makeConnection("A", "B", {
		fromOutputPortId: "report",
		toInputPortId: "report-in",
		type: "html",
	});
	const source = makeSource("A");
	source.resultContent = "<h1>Hello</h1>";
	const actions = planDownstreamDelivery(source, {
		sourceTask: taskA,
		connections: [conn],
		dependencies: [],
		getTask: (id) => id === "B" ? taskB : null,
	});

	assert.equal(actions.length, 1);
	const trigger = actions[0] as TriggerTypedRunAction;
	assert.equal(trigger.artifactParams.type, "html");
	assert.equal(trigger.artifactParams.sourceOutputPortId, "report");
	assert.equal(trigger.artifactParams.content, "<h1>Hello</h1>");
	assert.equal(trigger.artifactParams.sourceRunId, "run-1");
	assert.equal(trigger.artifactParams.sourceAttemptId, "att-1");
	assert.equal(trigger.artifactParams.fileRef, "result.md");
});

test("port type mismatch produces skip_typed with type mismatch reason", () => {
	const taskA = makeTask("A", {
		workUnit: {
			title: "A",
			input: { text: "do" },
			outputContract: { text: "out" },
			acceptance: { rules: ["ok"] },
			workerAgentId: "main",
			checkerAgentId: "main",
			outputPorts: [{ id: "out", type: "md" }],
		},
	});
	const taskB = makeTask("B", {
		workUnit: {
			title: "B",
			input: { text: "do" },
			outputContract: { text: "out" },
			acceptance: { rules: ["ok"] },
			workerAgentId: "main",
			checkerAgentId: "main",
			inputPorts: [{ id: "in", type: "json" }],
		},
	});
	const conn = makeConnection("A", "B", { type: "md" });
	const actions = planDownstreamDelivery(makeSource("A"), {
		sourceTask: taskA,
		connections: [conn],
		dependencies: [],
		getTask: (id) => id === "B" ? taskB : null,
	});

	assert.equal(actions.length, 1);
	assert.equal(actions[0].type, "skip_typed");
	assert.equal((actions[0] as SkipTypedAction).staleReason, "target_input_port_type_mismatch");
});

test("control fan-out: multiple dependencies produce multiple trigger_control_run actions", () => {
	const taskA = makeTask("A");
	const taskB = makeTask("B");
	const taskC = makeTask("C");
	const taskMap = new Map<string, TeamCanvasTask>([
		["B", taskB],
		["C", taskC],
	]);
	const depAB = makeDependency("A", "B");
	const depAC = makeDependency("A", "C");
	const actions = planDownstreamDelivery(makeSource("A"), {
		sourceTask: taskA,
		connections: [],
		dependencies: [depAB, depAC],
		getTask: (id) => taskMap.get(id) ?? null,
	});

	assert.equal(actions.length, 2);
	assert.equal(actions[0].type, "trigger_control_run");
	assert.equal(actions[1].type, "trigger_control_run");
	const [a0, a1] = actions as TriggerControlRunAction[];
	assert.equal(a0.targetTask.taskId, "B");
	assert.equal(a1.targetTask.taskId, "C");
});

test("mixed typed + control: produces correct action types in order", () => {
	const taskA = makeTask("A", {
		workUnit: {
			title: "A",
			input: { text: "do" },
			outputContract: { text: "out" },
			acceptance: { rules: ["ok"] },
			workerAgentId: "main",
			checkerAgentId: "main",
			outputPorts: [{ id: "out", type: "md" }],
		},
	});
	const taskB = makeTask("B", {
		workUnit: {
			title: "B",
			input: { text: "do" },
			outputContract: { text: "out" },
			acceptance: { rules: ["ok"] },
			workerAgentId: "main",
			checkerAgentId: "main",
			inputPorts: [{ id: "in", type: "md" }],
		},
	});
	const taskC = makeTask("C");
	const taskMap = new Map<string, TeamCanvasTask>([
		["B", taskB],
		["C", taskC],
	]);
	const conn = makeConnection("A", "B");
	const dep = makeDependency("A", "C");
	const actions = planDownstreamDelivery(makeSource("A"), {
		sourceTask: taskA,
		connections: [conn],
		dependencies: [dep],
		getTask: (id) => taskMap.get(id) ?? null,
	});

	assert.equal(actions.length, 2);
	assert.equal(actions[0].type, "trigger_typed_run");
	assert.equal(actions[1].type, "trigger_control_run");
});
