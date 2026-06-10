import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentProfileRoleRunner } from "../src/team/agent-profile-role-runner.js";
import {
	type CapturedCleanupCall,
	type CapturedRouteCall,
	makeCapturingSessionFactory,
	makeFakeProfileResolver,
} from "./team-agent-profile-runner-helpers.js";

// ── P17: multi-role browser binding coverage ──

test("P17: each role resolves its own profile and gets its own browserId", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p17-multi-"));
	try {
		const responses = [
			"worker output",
			'{"verdict":"pass","reason":"ok","resultContent":"ok"}',
			'{"decision":"accept_task","reason":"ok"}',
			"# final report",
		];
		const { factory, captured } = makeCapturingSessionFactory(responses);
		const resolver = makeFakeProfileResolver({
			"p-worker": { defaultBrowserId: "browser-worker" },
			"p-checker": { defaultBrowserId: "browser-checker" },
			"p-watcher": { defaultBrowserId: "browser-watcher" },
			"p-finalizer": { defaultBrowserId: "browser-finalizer" },
		});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			profileResolver: resolver as never, sessionFactory: factory,
		});

		// Worker
		const workerOut = await runner.runWorker({
			runId: "run_multi_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});
		assert.equal(workerOut.runtimeContext?.requestedProfileId, "p-worker");
		assert.equal(workerOut.runtimeContext?.browserId, "browser-worker");
		assert.ok(workerOut.runtimeContext?.browserScope?.includes("worker"));

		// Checker
		const checkerOut = await runner.runChecker({
			runId: "run_multi_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "output/w1.md", acceptanceRules: ["r1"],
		});
		assert.equal(checkerOut.runtimeContext?.requestedProfileId, "p-checker");
		assert.equal(checkerOut.runtimeContext?.browserId, "browser-checker");
		assert.ok(checkerOut.runtimeContext?.browserScope?.includes("checker"));

		// Watcher
		const watcherOut = await runner.runWatcher({
			runId: "run_multi_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workUnitStatus: "passed", resultRef: "r.md", errorSummary: null,
		});
		assert.equal(watcherOut.runtimeContext?.requestedProfileId, "p-watcher");
		assert.equal(watcherOut.runtimeContext?.browserId, "browser-watcher");
		assert.ok(watcherOut.runtimeContext?.browserScope?.includes("watcher"));

		// Finalizer
		const finalizerOut = await runner.runFinalizer({
			runId: "run_multi_1",
			plan: {
				schemaVersion: "team/plan-1", planId: "plan_1", title: "t",
				defaultTeamUnitId: "tu_1", goal: { text: "g" },
				tasks: [{ id: "task_1", title: "t1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
				outputContract: { text: "out" }, runCount: 0, archived: false,
				createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
			},
			taskResults: [{ taskId: "task_1", status: "succeeded", resultRef: "r.md", errorSummary: null }],
		});
		assert.equal(finalizerOut.runtimeContext?.requestedProfileId, "p-finalizer");
		assert.equal(finalizerOut.runtimeContext?.browserId, "browser-finalizer");
		assert.ok(finalizerOut.runtimeContext?.browserScope?.includes("finalizer"));

		// Prove all 4 sessions got different browser IDs
		assert.equal(captured.length, 4);
		const browserIds = captured.map(c => c.browserId);
		assert.deepEqual(browserIds, ["browser-worker", "browser-checker", "browser-watcher", "browser-finalizer"]);

		// Prove all 4 scopes are unique (no scope collapse)
		const scopes = captured.map(c => c.browserScope);
		const uniqueScopes = new Set(scopes);
		assert.equal(uniqueScopes.size, 4, "each role must get a unique browser scope");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("P17: all roles falling back to shared browser must not collapse scopes", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p17-nocollapse-"));
	try {
		const responses = [
			"worker out", '{"verdict":"pass","reason":"ok"}',
			'{"decision":"accept_task","reason":"ok"}', "# report",
		];
		const { factory, captured } = makeCapturingSessionFactory(responses);
		const resolver = makeFakeProfileResolver({
			"p-worker": { defaultBrowserId: "shared-chrome" },
			"p-checker": { defaultBrowserId: "shared-chrome" },
			"p-watcher": { defaultBrowserId: "shared-chrome" },
			"p-finalizer": { defaultBrowserId: "shared-chrome" },
		});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			profileResolver: resolver as never, sessionFactory: factory,
		});

		await runner.runWorker({
			runId: "run_nocollapse", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});
		await runner.runChecker({
			runId: "run_nocollapse", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "w.md", acceptanceRules: ["r1"],
		});
		await runner.runWatcher({
			runId: "run_nocollapse", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workUnitStatus: "passed", resultRef: null, errorSummary: null,
		});
		await runner.runFinalizer({
			runId: "run_nocollapse",
			plan: {
				schemaVersion: "team/plan-1", planId: "p", title: "t",
				defaultTeamUnitId: "tu", goal: { text: "g" },
				tasks: [{ id: "task_1", title: "t1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
				outputContract: { text: "out" }, runCount: 0, archived: false,
				createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
			},
			taskResults: [{ taskId: "task_1", status: "succeeded", resultRef: "r.md", errorSummary: null }],
		});

		assert.equal(captured.length, 4);
		for (const c of captured) {
			assert.equal(c.browserId, "shared-chrome");
		}
		const scopes = captured.map(c => c.browserScope);
		const uniqueScopes = new Set(scopes);
		assert.equal(uniqueScopes.size, 4, "scopes must remain role-specific even with shared browserId");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("P17: route setup/cleanup/clear use matching scope and browserId per role", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p17-routes-"));
	try {
		const responses = [
			"worker out", '{"verdict":"pass","reason":"ok"}',
			'{"decision":"accept_task","reason":"ok"}', "# report",
		];
		const { factory, captured } = makeCapturingSessionFactory(responses);
		const resolver = makeFakeProfileResolver({
			"p-worker": { defaultBrowserId: "bw" },
			"p-checker": { defaultBrowserId: "bc" },
			"p-watcher": { defaultBrowserId: "bwa" },
			"p-finalizer": { defaultBrowserId: "bf" },
		});

		const routeCalls: CapturedRouteCall[] = [];
		const cleanupCalls: CapturedCleanupCall[] = [];

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			profileResolver: resolver as never, sessionFactory: factory,
			setBrowserScopeRoute: async (scope, browserId) => { routeCalls.push({ scope, browserId }); },
			closeBrowserTargetsForScope: async (scope, options) => { cleanupCalls.push({ scope, options }); },
		});

		await runner.runWorker({
			runId: "run_route_multi", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});
		await runner.runChecker({
			runId: "run_route_multi", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "w.md", acceptanceRules: ["r1"],
		});
		await runner.runWatcher({
			runId: "run_route_multi", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workUnitStatus: "passed", resultRef: null, errorSummary: null,
		});
		await runner.runFinalizer({
			runId: "run_route_multi",
			plan: {
				schemaVersion: "team/plan-1", planId: "p", title: "t",
				defaultTeamUnitId: "tu", goal: { text: "g" },
				tasks: [{ id: "task_1", title: "t1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
				outputContract: { text: "out" }, runCount: 0, archived: false,
				createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
			},
			taskResults: [{ taskId: "task_1", status: "succeeded", resultRef: "r.md", errorSummary: null }],
		});

		assert.equal(routeCalls.length, 8);
		assert.equal(cleanupCalls.length, 4);

		for (let i = 0; i < 4; i++) {
			const setup = routeCalls[i * 2]!;
			const clear = routeCalls[i * 2 + 1]!;
			const cleanup = cleanupCalls[i]!;
			assert.equal(setup.scope, clear.scope, "role " + i + ": setup and clear must use same scope");
			assert.equal(setup.scope, cleanup.scope, "role " + i + ": setup and cleanup must use same scope");
			assert.equal(setup.browserId, cleanup.options?.browserId, "role " + i + ": setup browserId must match cleanup");
			assert.equal(clear.browserId, undefined, "role " + i + ": clear must set browserId to undefined");
		}

		assert.equal(routeCalls[0]!.browserId, "bw");
		assert.equal(routeCalls[2]!.browserId, "bc");
		assert.equal(routeCalls[4]!.browserId, "bwa");
		assert.equal(routeCalls[6]!.browserId, "bf");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("P17: worker and checker with different browserId must not silently share", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p17-mainfail-"));
	try {
		const responses = ["w out", '{"verdict":"pass","reason":"ok"}'];
		const { factory, captured } = makeCapturingSessionFactory(responses);
		const resolver = makeFakeProfileResolver({
			"p-worker": { defaultBrowserId: "dedicated-browser" },
			"p-checker": {},
		});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "p-worker", checkerProfileId: "p-checker",
			watcherProfileId: "p-watcher", finalizerProfileId: "p-finalizer",
			profileResolver: resolver as never, sessionFactory: factory,
		});

		await runner.runWorker({
			runId: "run_fail_main", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});
		await runner.runChecker({
			runId: "run_fail_main", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "w.md", acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 2);
		assert.equal(captured[0]!.browserId, "dedicated-browser");
		assert.equal(captured[1]!.browserId, undefined);
		assert.notEqual(captured[0]!.browserId, captured[1]!.browserId,
			"worker and checker must not silently share browserId");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});
