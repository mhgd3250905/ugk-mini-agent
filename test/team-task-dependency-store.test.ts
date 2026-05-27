import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskDependencyStore } from "../src/team/task-dependency-store.js";
import { TaskStore } from "../src/team/task-store.js";

async function makeRoot(): Promise<string> {
	return mkdtemp(join(tmpdir(), "team-dep-store-"));
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

async function createTask(taskStore: TaskStore, title: string) {
	return taskStore.create({
		title,
		leaderAgentId: "main",
		status: "ready",
		workUnit: baseWorkUnit,
	});
}

test("missing task-dependencies.json returns empty array", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const list = await store.list();
		assert.deepEqual(list, []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("invalid task-dependencies.json throws instead of returning empty", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		await writeFile(join(root, "task-dependencies.json"), "{bad json", "utf8");
		await assert.rejects(
			() => store.list(),
			(err: Error) => /task dependency store/i.test(err.message),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("non-array task-dependencies.json throws", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		await writeFile(join(root, "task-dependencies.json"), JSON.stringify({ foo: 1 }), "utf8");
		await assert.rejects(
			() => store.list(),
			(err: Error) => /task dependency store/i.test(err.message),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("creates dependency between two Tasks that have no ports", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const taskA = await createTask(taskStore, "A");
		const taskB = await createTask(taskStore, "B");

		const dep = await store.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });
		assert.ok(dep.dependencyId.startsWith("dep_"));
		assert.equal(dep.fromTaskId, taskA.taskId);
		assert.equal(dep.toTaskId, taskB.taskId);
		assert.equal(dep.trigger, "on_success");

		const list = await store.list();
		assert.equal(list.length, 1);
		assert.equal(list[0]!.dependencyId, dep.dependencyId);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects missing source Task", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const taskB = await createTask(taskStore, "B");

		await assert.rejects(
			() => store.create({ fromTaskId: "nonexistent", toTaskId: taskB.taskId }),
			(err: Error) => /task not found/i.test(err.message),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects archived source Task", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const taskA = await createTask(taskStore, "A");
		await taskStore.archive(taskA.taskId);
		const taskB = await createTask(taskStore, "B");

		await assert.rejects(
			() => store.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId }),
			(err: Error) => /archived/i.test(err.message),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects missing target Task", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const taskA = await createTask(taskStore, "A");

		await assert.rejects(
			() => store.create({ fromTaskId: taskA.taskId, toTaskId: "nonexistent" }),
			(err: Error) => /task not found/i.test(err.message),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects archived target Task", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const taskA = await createTask(taskStore, "A");
		const taskB = await createTask(taskStore, "B");
		await taskStore.archive(taskB.taskId);

		await assert.rejects(
			() => store.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId }),
			(err: Error) => /archived/i.test(err.message),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects self dependency", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const taskA = await createTask(taskStore, "A");

		await assert.rejects(
			() => store.create({ fromTaskId: taskA.taskId, toTaskId: taskA.taskId }),
			(err: Error) => /same task/i.test(err.message),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects duplicate fromTaskId + toTaskId", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const taskA = await createTask(taskStore, "A");
		const taskB = await createTask(taskStore, "B");

		await store.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });
		await assert.rejects(
			() => store.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId }),
			(err: Error) => /already exists/i.test(err.message),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects direct cycle", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const taskA = await createTask(taskStore, "A");
		const taskB = await createTask(taskStore, "B");

		await store.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });
		await assert.rejects(
			() => store.create({ fromTaskId: taskB.taskId, toTaskId: taskA.taskId }),
			(err: Error) => /cycle/i.test(err.message),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("rejects indirect cycle", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const taskA = await createTask(taskStore, "A");
		const taskB = await createTask(taskStore, "B");
		const taskC = await createTask(taskStore, "C");

		await store.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });
		await store.create({ fromTaskId: taskB.taskId, toTaskId: taskC.taskId });
		await assert.rejects(
			() => store.create({ fromTaskId: taskC.taskId, toTaskId: taskA.taskId }),
			(err: Error) => /cycle/i.test(err.message),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("listResolved returns stale reasons for missing / archived tasks", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const taskA = await createTask(taskStore, "A");
		const taskB = await createTask(taskStore, "B");

		await store.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });

		// Archive source
		await taskStore.archive(taskA.taskId);
		let resolved = await store.listResolved();
		assert.equal(resolved[0]!.status, "stale");
		assert.equal(resolved[0]!.staleReason, "source_task_archived");

		// Restore and delete target
		await taskStore.archive(taskB.taskId);
		resolved = await store.listResolved();
		// Source is archived first in priority
		assert.equal(resolved[0]!.status, "stale");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("listResolved returns active for valid tasks", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const taskA = await createTask(taskStore, "A");
		const taskB = await createTask(taskStore, "B");

		await store.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });
		const resolved = await store.listResolved();
		assert.equal(resolved[0]!.status, "active");
		assert.equal(resolved[0]!.staleReason, undefined);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("parallel create/delete follows existing lock style", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const source = await createTask(taskStore, "source");
		const targets = await Promise.all(
			Array.from({ length: 5 }, (_, i) => createTask(taskStore, `target-${i}`)),
		);

		const created = await Promise.all(
			targets.map(target =>
				store.create({ fromTaskId: source.taskId, toTaskId: target.taskId }),
			),
		);

		const list = await store.list();
		assert.equal(list.length, 5);
		const listIds = new Set(list.map(d => d.dependencyId));
		for (const d of created) {
			assert.ok(listIds.has(d.dependencyId));
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("delete removes dependency and returns true", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const taskA = await createTask(taskStore, "A");
		const taskB = await createTask(taskStore, "B");

		const dep = await store.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });
		const deleted = await store.delete(dep.dependencyId);
		assert.equal(deleted, true);
		assert.equal((await store.list()).length, 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("delete returns false for nonexistent dependency", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const deleted = await store.delete("dep_nonexistent");
		assert.equal(deleted, false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("listFromTask returns only outgoing dependencies", async () => {
	const root = await makeRoot();
	try {
		const taskStore = makeTaskStore(root);
		const store = new TaskDependencyStore(root, taskStore);
		const taskA = await createTask(taskStore, "A");
		const taskB = await createTask(taskStore, "B");
		const taskC = await createTask(taskStore, "C");

		await store.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });
		await store.create({ fromTaskId: taskB.taskId, toTaskId: taskC.taskId });

		const fromA = await store.listFromTask(taskA.taskId);
		assert.equal(fromA.length, 1);
		assert.equal(fromA[0]!.toTaskId, taskB.taskId);

		const fromB = await store.listFromTask(taskB.taskId);
		assert.equal(fromB.length, 1);
		assert.equal(fromB[0]!.toTaskId, taskC.taskId);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
