import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTeamWorkerRoleRunner } from "../src/workers/team-worker.js";
import { MockRoleRunner } from "../src/team/role-runner.js";
import type { BackgroundAgentSessionFactory } from "../src/agent/background-agent-runner.js";
import type { ResolvedBackgroundAgentSnapshot } from "../src/agent/background-agent-profile.js";

function makeConfig(root: string) {
	return {
		projectRoot: root,
		teamDataDir: root,
	} as ReturnType<typeof import("../src/config.js").getAppConfig>;
}

function makeProfileResolver(snapshot: Partial<ResolvedBackgroundAgentSnapshot>) {
	return {
		resolve: async (ref: { profileId: string }) => ({
			profileId: ref.profileId,
			profileVersion: "1",
			agentSpecId: "team-default",
			agentSpecVersion: "1",
			skillSetId: "team-default",
			skillSetVersion: "1",
			skills: [],
			modelPolicyId: "team-default",
			modelPolicyVersion: "1",
			provider: "test",
			model: "test-model",
			upgradePolicy: "latest" as const,
			resolvedAt: new Date().toISOString(),
			...snapshot,
		}),
	};
}

test("team worker uses mock runner unless real runner is explicitly enabled", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-worker-"));
	try {
		const runner = createTeamWorkerRoleRunner(makeConfig(root), {});
		assert.ok(runner instanceof MockRoleRunner);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("team worker real runner wires browser route and cleanup lifecycle", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-worker-"));
	try {
		const routeCalls: Array<{ scope: string; browserId: string | undefined }> = [];
		const cleanupCalls: Array<{ scope: string; options?: { browserId?: string } }> = [];
		const sessionScopes: string[] = [];
		const sessionFactory = {
			createSession: async (input: { browserScope?: string }) => {
				sessionScopes.push(input.browserScope ?? "");
				return {
					prompt: async () => {},
					subscribe: () => () => {},
					messages: [
						{ role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "end_turn" },
					],
				};
			},
		} as unknown as BackgroundAgentSessionFactory;

		const runner = createTeamWorkerRoleRunner(
			makeConfig(root),
			{ TEAM_USE_MOCK_RUNNER: "false" },
			{
				profileResolver: makeProfileResolver({ defaultBrowserId: "work-01" }) as never,
				sessionFactory,
				setBrowserScopeRoute: async (scope, browserId) => { routeCalls.push({ scope, browserId }); },
				closeBrowserTargetsForScope: async (scope, options) => { cleanupCalls.push({ scope, options }); },
			},
		);

		const out = await runner.runWorker({
			runId: "run_worker_1",
			task: { id: "task_1", title: "t", input: { text: "do" }, acceptance: { rules: ["r1"] } },
			attemptId: "attempt_1",
			workDir: join(root, "work"),
			outputDir: join(root, "output"),
			acceptanceRules: ["r1"],
		});

		assert.equal(out.content, "done");
		assert.equal(sessionScopes.length, 1);
		const scope = sessionScopes[0]!;
		assert.ok(scope);
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
		await rm(root, { recursive: true, force: true });
	}
});


// ── P17: worker real runner regression ──

test('P17: createTeamWorkerRoleRunner with TEAM_USE_MOCK_RUNNER=false returns AgentProfileRoleRunner', async () => {
	const root = await mkdtemp(join(tmpdir(), 'team-p17-worker-'));
	try {
		const { AgentProfileRoleRunner } = await import('../src/team/agent-profile-role-runner.js');
		const runner = createTeamWorkerRoleRunner(
			makeConfig(root),
			{ TEAM_USE_MOCK_RUNNER: 'false' },
			{ profileResolver: makeProfileResolver({}) as never },
		);
		assert.ok(runner instanceof AgentProfileRoleRunner, 'should return AgentProfileRoleRunner when real mode enabled');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('P17: worker real runner defaults to main profiles as placeholders', async () => {
	const root = await mkdtemp(join(tmpdir(), 'team-p17-worker-'));
	try {
		const { AgentProfileRoleRunner } = await import('../src/team/agent-profile-role-runner.js');
		const routeCalls: Array<{ scope: string; browserId: string | undefined }> = [];
		const cleanupCalls: Array<{ scope: string; options?: { browserId?: string } }> = [];

		const runner = createTeamWorkerRoleRunner(
			makeConfig(root),
			{ TEAM_USE_MOCK_RUNNER: 'false' },
			{
				profileResolver: makeProfileResolver({ defaultBrowserId: 'default-chrome' }) as never,
				sessionFactory: {
					createSession: async () => ({
						prompt: async () => {},
						subscribe: () => () => {},
						messages: [{ role: 'assistant', content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' }],
					}),
				} as never,
				setBrowserScopeRoute: async (scope, browserId) => { routeCalls.push({ scope, browserId }); },
				closeBrowserTargetsForScope: async (scope, options) => { cleanupCalls.push({ scope, options }); },
			},
		);

		// Without setProfileIds, the runner uses constructor defaults (main)
		const out = await (runner as InstanceType<typeof AgentProfileRoleRunner>).runWorker({
			runId: 'run_placeholder', task: { id: 'task_1', title: 't', input: { text: 'do' }, acceptance: { rules: ['r1'] } },
			attemptId: 'att_1', workDir: join(root, 'work'), outputDir: join(root, 'output'), acceptanceRules: ['r1'],
		});

		assert.equal(out.runtimeContext?.requestedProfileId, 'main');
		assert.equal(out.runtimeContext?.resolvedProfileId, 'main');
		assert.equal(out.runtimeContext?.browserId, 'default-chrome');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('P17: worker real runner profile placeholders are overridden by setProfileIds', async () => {
	const root = await mkdtemp(join(tmpdir(), 'team-p17-worker-'));
	try {
		const { AgentProfileRoleRunner } = await import('../src/team/agent-profile-role-runner.js');
		const capturedProfiles: string[] = [];

		const runner = createTeamWorkerRoleRunner(
			makeConfig(root),
			{ TEAM_USE_MOCK_RUNNER: 'false' },
			{
				profileResolver: {
					resolve: async (ref: { profileId: string }) => {
						capturedProfiles.push(ref.profileId);
						return {
							profileId: ref.profileId, profileVersion: '1',
							agentSpecId: 'team-default', agentSpecVersion: '1',
							skillSetId: 'team-default', skillSetVersion: '1',
							skills: [], modelPolicyId: 'team-default', modelPolicyVersion: '1',
							provider: 'test', model: 'test-model',
							upgradePolicy: 'latest' as const, resolvedAt: new Date().toISOString(),
							defaultBrowserId: 'chrome-' + ref.profileId,
						};
					},
				} as never,
				sessionFactory: {
					createSession: async () => ({
						prompt: async () => {},
						subscribe: () => () => {},
						messages: [{ role: 'assistant', content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' }],
					}),
				} as never,
				setBrowserScopeRoute: async () => {},
				closeBrowserTargetsForScope: async () => {},
			},
		) as InstanceType<typeof AgentProfileRoleRunner>;

		// Override with actual TeamUnit profiles
		runner.setProfileIds({
			workerProfileId: 'actual-worker',
			checkerProfileId: 'actual-checker',
			watcherProfileId: 'actual-watcher',
			finalizerProfileId: 'actual-finalizer',
			decomposerProfileId: 'actual-decomposer',
		});

		const workerOut = await runner.runWorker({
			runId: 'run_override', task: { id: 'task_1', title: 't', input: { text: 'do' }, acceptance: { rules: ['r1'] } },
			attemptId: 'att_1', workDir: join(root, 'work'), outputDir: join(root, 'output'), acceptanceRules: ['r1'],
		});

		assert.equal(workerOut.runtimeContext?.requestedProfileId, 'actual-worker');
		assert.equal(workerOut.runtimeContext?.browserId, 'chrome-actual-worker');
		assert.ok(capturedProfiles.includes('actual-worker'), 'resolver should see actual-worker, not main');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('P17: mock mode remains default when TEAM_USE_MOCK_RUNNER is not exactly false', async () => {
	const root = await mkdtemp(join(tmpdir(), 'team-p17-worker-'));
	try {
		// undefined -> mock
		const r1 = createTeamWorkerRoleRunner(makeConfig(root), {});
		assert.ok(r1 instanceof MockRoleRunner);

		// empty string -> mock
		const r2 = createTeamWorkerRoleRunner(makeConfig(root), { TEAM_USE_MOCK_RUNNER: '' });
		assert.ok(r2 instanceof MockRoleRunner);

		// 'true' -> mock
		const r3 = createTeamWorkerRoleRunner(makeConfig(root), { TEAM_USE_MOCK_RUNNER: 'true' });
		assert.ok(r3 instanceof MockRoleRunner);

		// 'false' -> real
		const { AgentProfileRoleRunner } = await import('../src/team/agent-profile-role-runner.js');
		const r4 = createTeamWorkerRoleRunner(makeConfig(root), { TEAM_USE_MOCK_RUNNER: 'false' });
		assert.ok(r4 instanceof AgentProfileRoleRunner);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
