import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SourceConnectionStore } from "../src/team/source-connection-store.js";
import { SourceNodeStore } from "../src/team/source-node-store.js";
import { TaskStore } from "../src/team/task-store.js";

async function makeRoot(): Promise<string> {
	return mkdtemp(join(tmpdir(), "team-source-connection-store-"));
}

function makeTaskStore(root: string): TaskStore {
	return new TaskStore(root, { getAgentIds: () => ["main"] });
}

const baseWorkUnit = {
	title: "t",
	input: { text: "in" },
	outputContract: { text: "out" },
	acceptance: { rules: ["r"] },
	workerAgentId: "main",
	checkerAgentId: "main",
};

async function createTaskWithInputPort(taskStore: TaskStore, inputType = "md") {
	return taskStore.create({
		title: `target-${inputType}`,
		leaderAgentId: "main",
		status: "ready",
		workUnit: {
			...baseWorkUnit,
			inputPorts: [{ id: "source_input", label: "Source", type: inputType }],
		},
	});
}

test("creates source connection when source output type equals target input type", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const sourceNodeStore = new SourceNodeStore(root);
		const sourceConnectionStore = new SourceConnectionStore(root, sourceNodeStore, taskStore);
		const source = await sourceNodeStore.create({
			title: "Markdown source",
			nodeType: "file",
			content: { fileName: "brief.md" },
		});
		const target = await createTaskWithInputPort(taskStore, "md");

		const connection = await sourceConnectionStore.create({
			fromSourceNodeId: source.sourceNodeId,
			fromOutputPortId: "value",
			toTaskId: target.taskId,
			toInputPortId: "source_input",
		});

		assert.equal(connection.schemaVersion, "team/source-connection-1");
		assert.match(connection.connectionId, /^source_conn_/);
		assert.equal(connection.fromSourceNodeId, source.sourceNodeId);
		assert.equal(connection.fromOutputPortId, "value");
		assert.equal(connection.toTaskId, target.taskId);
		assert.equal(connection.toInputPortId, "source_input");
		assert.equal(connection.type, "md");
		assert.deepEqual(await sourceConnectionStore.list(), [connection]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects missing source node and archived source node", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const sourceNodeStore = new SourceNodeStore(root);
		const sourceConnectionStore = new SourceConnectionStore(root, sourceNodeStore, taskStore);
		const target = await createTaskWithInputPort(taskStore, "string");

		await assert.rejects(
			() => sourceConnectionStore.create({
				fromSourceNodeId: "source_missing",
				fromOutputPortId: "value",
				toTaskId: target.taskId,
				toInputPortId: "source_input",
			}),
			/source node not found/,
		);

		const source = await sourceNodeStore.create({ title: "Text", nodeType: "text", content: { text: "x" } });
		await sourceNodeStore.archive(source.sourceNodeId);
		await assert.rejects(
			() => sourceConnectionStore.create({
				fromSourceNodeId: source.sourceNodeId,
				fromOutputPortId: "value",
				toTaskId: target.taskId,
				toInputPortId: "source_input",
			}),
			/archived source node cannot be connected/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects missing target task and archived target task", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const sourceNodeStore = new SourceNodeStore(root);
		const sourceConnectionStore = new SourceConnectionStore(root, sourceNodeStore, taskStore);
		const source = await sourceNodeStore.create({ title: "Text", nodeType: "text", content: { text: "x" } });

		await assert.rejects(
			() => sourceConnectionStore.create({
				fromSourceNodeId: source.sourceNodeId,
				fromOutputPortId: "value",
				toTaskId: "task_missing",
				toInputPortId: "source_input",
			}),
			/task not found/,
		);

		const target = await createTaskWithInputPort(taskStore, "string");
		await taskStore.archive(target.taskId);
		await assert.rejects(
			() => sourceConnectionStore.create({
				fromSourceNodeId: source.sourceNodeId,
				fromOutputPortId: "value",
				toTaskId: target.taskId,
				toInputPortId: "source_input",
			}),
			/archived task cannot be connected/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects missing input port and type mismatch", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const sourceNodeStore = new SourceNodeStore(root);
		const sourceConnectionStore = new SourceConnectionStore(root, sourceNodeStore, taskStore);
		const source = await sourceNodeStore.create({ title: "Markdown", nodeType: "file", content: { fileName: "brief.md" } });
		const target = await createTaskWithInputPort(taskStore, "html");

		await assert.rejects(
			() => sourceConnectionStore.create({
				fromSourceNodeId: source.sourceNodeId,
				fromOutputPortId: "value",
				toTaskId: target.taskId,
				toInputPortId: "missing",
			}),
			/input port not found/,
		);
		await assert.rejects(
			() => sourceConnectionStore.create({
				fromSourceNodeId: source.sourceNodeId,
				fromOutputPortId: "value",
				toTaskId: target.taskId,
				toInputPortId: "source_input",
			}),
			/port type mismatch: md -> html/,
		);
		await assert.rejects(
			() => sourceConnectionStore.create({
				fromSourceNodeId: source.sourceNodeId,
				fromOutputPortId: "other",
				toTaskId: target.taskId,
				toInputPortId: "source_input",
			}),
			/source output port not found/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects duplicate source connection", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const sourceNodeStore = new SourceNodeStore(root);
		const sourceConnectionStore = new SourceConnectionStore(root, sourceNodeStore, taskStore);
		const source = await sourceNodeStore.create({ title: "Text", nodeType: "text", content: { text: "x" } });
		const target = await createTaskWithInputPort(taskStore, "string");
		const input = {
			fromSourceNodeId: source.sourceNodeId,
			fromOutputPortId: "value",
			toTaskId: target.taskId,
			toInputPortId: "source_input",
		};

		await sourceConnectionStore.create(input);
		await assert.rejects(
			() => sourceConnectionStore.create(input),
			/source connection already exists/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("source connection store uses mutation lock for create and delete", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const sourceNodeStore = new SourceNodeStore(root);
		const sourceConnectionStore = new SourceConnectionStore(root, sourceNodeStore, taskStore);
		const source = await sourceNodeStore.create({ title: "Text", nodeType: "text", content: { text: "x" } });
		const target = await createTaskWithInputPort(taskStore, "string");
		const lockDir = join(root, ".source-connections.lock");
		await mkdir(lockDir, { recursive: true });

		try {
			await assert.rejects(
				() => sourceConnectionStore.create({
					fromSourceNodeId: source.sourceNodeId,
					fromOutputPortId: "value",
					toTaskId: target.taskId,
					toInputPortId: "source_input",
				}),
				/source connection store lock busy/,
			);
			await assert.rejects(
				() => sourceConnectionStore.delete("source_conn_missing"),
				/source connection store lock busy/,
			);
		} finally {
			await rm(lockDir, { recursive: true, force: true });
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
