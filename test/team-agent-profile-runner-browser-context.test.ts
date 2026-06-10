import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentProfileRoleRunner } from "../src/team/agent-profile-role-runner.js";
import type { BackgroundAgentSessionFactory } from "../src/agent/background-agent-runner.js";
import {
	type CapturedCleanupCall,
	type CapturedRouteCall,
	makeCapturingSessionFactory,
	makeFakeProfileResolver,
} from "./team-agent-profile-runner-helpers.js";

// ── P8-A: profile-aware browser binding ──

test("session receives snapshot.defaultBrowserId when profile has one", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["done"]);
		const resolver = makeFakeProfileResolver({ wo: { defaultBrowserId: "browser_profile_a" } });

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
			defaultBrowserId: "fallback_browser",
		});

		await runner.runWorker({
			runId: "run_br_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 1);
		assert.equal(captured[0]!.browserId, "browser_profile_a");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("session falls back to options.defaultBrowserId when profile has none", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["done"]);
		const resolver = makeFakeProfileResolver({});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
			defaultBrowserId: "fallback_browser",
		});

		await runner.runWorker({
			runId: "run_br_2", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 1);
		assert.equal(captured[0]!.browserId, "fallback_browser");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("worker and checker in same run get different browserScope", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["worker out", '{"verdict":"pass","reason":"ok"}']);
		const resolver = makeFakeProfileResolver({});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
		});

		await runner.runWorker({
			runId: "run_scope_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		await runner.runChecker({
			runId: "run_scope_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workerOutputRef: "output/w1.md", acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 2);
		assert.notEqual(captured[0]!.browserScope, captured[1]!.browserScope);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("two worker attempts get different browserScope", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["att1", "att2"]);
		const resolver = makeFakeProfileResolver({});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
		});

		await runner.runWorker({
			runId: "run_scope_2", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		await runner.runWorker({
			runId: "run_scope_2", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_2", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 2);
		assert.notEqual(captured[0]!.browserScope, captured[1]!.browserScope);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("cleanup receives same browserScope as session", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["done"]);
		const resolver = makeFakeProfileResolver({ wo: { defaultBrowserId: "chrome-01" } });

		const cleanupCalls: CapturedCleanupCall[] = [];
		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
			closeBrowserTargetsForScope: async (scope: string, options?: { browserId?: string }) => { cleanupCalls.push({ scope, options }); },
		});

		await runner.runWorker({
			runId: "run_cleanup_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 1);
		assert.equal(cleanupCalls.length, 1);
		assert.equal(cleanupCalls[0]!.scope, captured[0]!.browserScope);
		assert.equal(cleanupCalls[0]!.options?.browserId, "chrome-01");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("team role runner writes and clears browser scope route like background runner", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["done"]);
		const resolver = makeFakeProfileResolver({ wo: { defaultBrowserId: "work-01" } });
		const routeCalls: CapturedRouteCall[] = [];
		const cleanupCalls: CapturedCleanupCall[] = [];

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
			setBrowserScopeRoute: async (scope: string, browserId: string | undefined) => { routeCalls.push({ scope, browserId }); },
			closeBrowserTargetsForScope: async (scope: string, options?: { browserId?: string }) => { cleanupCalls.push({ scope, options }); },
		});

		const out = await runner.runWorker({
			runId: "run_route_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 1);
		const scope = captured[0]!.browserScope;
		assert.ok(scope, "session should receive canonical browser scope");
		assert.deepEqual(routeCalls, [
			{ scope, browserId: "work-01" },
			{ scope, browserId: undefined },
		]);
		assert.deepEqual(cleanupCalls, [
			{ scope, options: { browserId: "work-01" } },
		]);
		assert.equal(out.runtimeContext?.browserScope, scope);
		assert.equal(out.runtimeContext?.browserId, "work-01");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("team role runner clears browser scope route when browserId is absent", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory, captured } = makeCapturingSessionFactory(["done"]);
		const resolver = makeFakeProfileResolver({});
		const routeCalls: CapturedRouteCall[] = [];
		const cleanupCalls: CapturedCleanupCall[] = [];

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
			setBrowserScopeRoute: async (scope: string, browserId: string | undefined) => { routeCalls.push({ scope, browserId }); },
			closeBrowserTargetsForScope: async (scope: string, options?: { browserId?: string }) => { cleanupCalls.push({ scope, options }); },
		});

		const out = await runner.runWorker({
			runId: "run_route_none", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(captured.length, 1);
		const scope = captured[0]!.browserScope;
		assert.ok(scope, "session should still receive a scoped browser route key");
		assert.equal(captured[0]!.browserId, undefined);
		assert.deepEqual(routeCalls, [
			{ scope, browserId: undefined },
			{ scope, browserId: undefined },
		]);
		assert.deepEqual(cleanupCalls, [
			{ scope, options: undefined },
		]);
		assert.equal(out.runtimeContext?.browserId, null);
		assert.equal(out.runtimeContext?.browserScope, scope);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("team role runner clears browser scope route when session creation fails", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const resolver = makeFakeProfileResolver({ wo: { defaultBrowserId: "work-01" } });
		const routeCalls: CapturedRouteCall[] = [];
		const cleanupCalls: CapturedCleanupCall[] = [];
		const sessionFactory = {
			createSession: async () => {
				throw new Error("session init failed");
			},
		} as unknown as BackgroundAgentSessionFactory;

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "wo", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory,
			setBrowserScopeRoute: async (scope: string, browserId: string | undefined) => { routeCalls.push({ scope, browserId }); },
			closeBrowserTargetsForScope: async (scope: string, options?: { browserId?: string }) => { cleanupCalls.push({ scope, options }); },
		});

		await assert.rejects(
			() => runner.runWorker({
				runId: "run_route_fail", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
				attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
			}),
			{ message: "session init failed" },
		);

		assert.equal(routeCalls.length, 2);
		assert.equal(routeCalls[0]!.browserId, "work-01");
		assert.equal(routeCalls[1]!.scope, routeCalls[0]!.scope);
		assert.equal(routeCalls[1]!.browserId, undefined);
		assert.deepEqual(cleanupCalls, [
			{ scope: routeCalls[0]!.scope, options: { browserId: "work-01" } },
		]);
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});

test("runWorker returns profile and browser runtime context", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ap-browser-"));
	try {
		const { factory } = makeCapturingSessionFactory(["done"]);
		const resolver = makeFakeProfileResolver({
			missing_worker: {
				profileId: "main",
				fallbackUsed: true,
				fallbackReason: "profile_not_found",
				defaultBrowserId: "chrome-main",
			},
		});

		const runner = new AgentProfileRoleRunner({
			projectRoot: root, teamDataDir: root,
			workerProfileId: "missing_worker", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
			profileResolver: resolver as never, sessionFactory: factory,
			defaultBrowserId: "fallback_browser",
		});

		const out = await runner.runWorker({
			runId: "run_ctx_1", task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "att_1", workDir: join(root, "work"), outputDir: join(root, "output"), acceptanceRules: ["r1"],
		});

		assert.equal(out.runtimeContext?.requestedProfileId, "missing_worker");
		assert.equal(out.runtimeContext?.resolvedProfileId, "main");
		assert.equal(out.runtimeContext?.fallbackUsed, true);
		assert.equal(out.runtimeContext?.fallbackReason, "profile_not_found");
		assert.equal(out.runtimeContext?.browserId, "chrome-main");
		assert.equal(out.runtimeContext?.browserScope, "chrome-main-team-run_ctx_1-worker-att_1-main");
	} finally {
		await rm(root, { recursive: true }).catch(() => {});
	}
});
