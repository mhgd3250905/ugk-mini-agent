import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskConnectionStore } from "../src/team/task-connection-store.js";
import { TaskStore } from "../src/team/task-store.js";

async function makeRoot(): Promise<string> {
	return mkdtemp(join(tmpdir(), "team-conn-store-"));
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

async function createTaskWithPorts(
	taskStore: TaskStore,
	title: string,
	ports: {
		inputPorts?: Array<{ id: string; label: string; type: string }>;
		outputPorts?: Array<{ id: string; label: string; type: string }>;
	},
) {
	return taskStore.create({
		title,
		leaderAgentId: "main",
		status: "ready",
		workUnit: { ...baseWorkUnit, ...ports },
	});
}

test("missing task-connections.json returns empty array", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskConnectionStore(root, taskStore);
		const list = await store.list();
		assert.deepEqual(list, []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("invalid task-connections.json throws instead of returning empty", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskConnectionStore(root, taskStore);
		await writeFile(join(root, "task-connections.json"), "{bad json", "utf8");
		await assert.rejects(
			() => store.list(),
			(err: Error) => /task connection store/i.test(err.message),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("non-array task-connections.json throws instead of returning empty", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskConnectionStore(root, taskStore);
		await writeFile(join(root, "task-connections.json"), JSON.stringify({ foo: 1 }), "utf8");
		await assert.rejects(
			() => store.list(),
			(err: Error) => /task connection store/i.test(err.message),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("parallel create for distinct edges preserves every accepted connection", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskConnectionStore(root, taskStore);

		const source = await createTaskWithPorts(taskStore, "source", {
			outputPorts: [{ id: "draft_md", label: "Draft", type: "md" }],
		});
		const targets = await Promise.all(
			Array.from({ length: 5 }, (_, i) =>
				createTaskWithPorts(taskStore, `target-${i}`, {
					inputPorts: [{ id: "source_md", label: "Source", type: "md" }],
				}),
			),
		);

		const created = await Promise.all(
			targets.map(target =>
				store.create({
					fromTaskId: source.taskId,
					fromOutputPortId: "draft_md",
					toTaskId: target.taskId,
					toInputPortId: "source_md",
				}),
			),
		);

		const list = await store.list();
		const listIds = new Set(list.map(c => c.connectionId));
		for (const c of created) {
			assert.ok(listIds.has(c.connectionId), `connection ${c.connectionId} should exist in list()`);
		}
		assert.equal(list.length, 5, "all 5 connections should persist");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("parallel delete for distinct connections removes every requested connection", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskConnectionStore(root, taskStore);

		const source = await createTaskWithPorts(taskStore, "source", {
			outputPorts: [{ id: "draft_md", label: "Draft", type: "md" }],
		});
		const targets = await Promise.all(
			Array.from({ length: 4 }, (_, i) =>
				createTaskWithPorts(taskStore, `target-${i}`, {
					inputPorts: [{ id: "source_md", label: "Source", type: "md" }],
				}),
			),
		);

		const connections = [];
		for (const target of targets) {
			connections.push(await store.create({
				fromTaskId: source.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: target.taskId,
				toInputPortId: "source_md",
			}));
		}
		assert.equal((await store.list()).length, 4);

		const toDelete = connections.slice(0, 3);
		const results = await Promise.all(toDelete.map(c => store.delete(c.connectionId)));
		assert.ok(results.every(r => r === true), "all deletes should return true");

		const remaining = await store.list();
		assert.equal(remaining.length, 1, "one connection should remain");
		assert.equal(remaining[0]!.connectionId, connections[3]!.connectionId);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("create and delete contention preserves non-conflicting changes", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskConnectionStore(root, taskStore);

		const source = await createTaskWithPorts(taskStore, "source", {
			outputPorts: [{ id: "draft_md", label: "Draft", type: "md" }],
		});
		const targetA = await createTaskWithPorts(taskStore, "target-a", {
			inputPorts: [{ id: "source_md", label: "Source", type: "md" }],
		});
		const targetB = await createTaskWithPorts(taskStore, "target-b", {
			inputPorts: [{ id: "source_md", label: "Source", type: "md" }],
		});
		const targetC = await createTaskWithPorts(taskStore, "target-c", {
			inputPorts: [{ id: "source_md", label: "Source", type: "md" }],
		});

		const connA = await store.create({
			fromTaskId: source.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetA.taskId,
			toInputPortId: "source_md",
		});
		const connB = await store.create({
			fromTaskId: source.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetB.taskId,
			toInputPortId: "source_md",
		});

		await Promise.all([
			store.delete(connA.connectionId),
			store.create({
				fromTaskId: source.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: targetC.taskId,
				toInputPortId: "source_md",
			}),
		]);

		const remaining = await store.list();
		const remainingIds = new Set(remaining.map(c => c.connectionId));
		assert.ok(!remainingIds.has(connA.connectionId), "deleted connection A should be absent");
		assert.ok(remainingIds.has(connB.connectionId), "untouched connection B should remain");
		assert.equal(remaining.length, 2, "should have B and the new C connection");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("lock busy rejects mutation after retry timeout", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskConnectionStore(root, taskStore);

		const lockDir = join(root, ".task-connections.lock");
		await mkdir(lockDir, { recursive: true });

		try {
			const source = await createTaskWithPorts(taskStore, "source", {
				outputPorts: [{ id: "draft_md", label: "Draft", type: "md" }],
			});
			const target = await createTaskWithPorts(taskStore, "target", {
				inputPorts: [{ id: "source_md", label: "Source", type: "md" }],
			});

			await assert.rejects(
				() => store.create({
					fromTaskId: source.taskId,
					fromOutputPortId: "draft_md",
					toTaskId: target.taskId,
					toInputPortId: "source_md",
				}),
				(err: Error) => /lock busy/i.test(err.message),
			);

			await assert.rejects(
				() => store.delete("nonexistent"),
				(err: Error) => /lock busy/i.test(err.message),
			);
		} finally {
			await rm(lockDir, { recursive: true, force: true });
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("fn() error inside lock propagates instead of being misread as lock busy", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskConnectionStore(root, taskStore);

		// Write corrupt JSON so readAll() throws inside the critical section.
		await writeFile(join(root, "task-connections.json"), "{bad json", "utf8");

		const source = await createTaskWithPorts(taskStore, "source", {
			outputPorts: [{ id: "draft_md", label: "Draft", type: "md" }],
		});
		const target = await createTaskWithPorts(taskStore, "target", {
			inputPorts: [{ id: "source_md", label: "Source", type: "md" }],
		});

		await assert.rejects(
			() => store.create({
				fromTaskId: source.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: target.taskId,
				toInputPortId: "source_md",
			}),
			(err: Error) => /task connection store/i.test(err.message) && !/lock busy/i.test(err.message),
		);

		// Lock must still be released: a subsequent valid call should not see "lock busy".
		await writeFile(join(root, "task-connections.json"), "[]", "utf8");
		const connection = await store.create({
			fromTaskId: source.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: target.taskId,
			toInputPortId: "source_md",
		});
		assert.ok(connection.connectionId.startsWith("conn_"), "lock should have been released after fn() error");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
