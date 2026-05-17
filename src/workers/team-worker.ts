import { getAppConfig } from "../config.js";
import { pathToFileURL } from "node:url";
import { PlanStore } from "../team/plan-store.js";
import { TeamUnitStore } from "../team/team-unit-store.js";
import { RunWorkspace } from "../team/run-workspace.js";
import { TeamOrchestrator, DEFAULT_PHASE_TIMEOUTS } from "../team/orchestrator.js";
import { MockRoleRunner } from "../team/role-runner.js";
import type { TeamRoleRunner } from "../team/role-runner.js";
import { AgentProfileRoleRunner } from "../team/agent-profile-role-runner.js";
import { closeBrowserTargetsForScope } from "../agent/browser-cleanup.js";
import { setBrowserScopeRoute } from "../browser/browser-scope-routes.js";
import type { BackgroundAgentSessionFactory } from "../agent/background-agent-runner.js";
import type { BackgroundAgentProfileResolver } from "../agent/background-agent-profile.js";

interface TeamWorkerRoleRunnerDeps {
	setBrowserScopeRoute?: (scope: string, browserId: string | undefined) => Promise<void>;
	closeBrowserTargetsForScope?: (scope: string, options?: { browserId?: string }) => Promise<void>;
	sessionFactory?: BackgroundAgentSessionFactory;
	profileResolver?: BackgroundAgentProfileResolver;
}

export function createTeamWorkerRoleRunner(
	config: ReturnType<typeof getAppConfig>,
	env: Record<string, string | undefined> = process.env,
	deps: TeamWorkerRoleRunnerDeps = {},
): TeamRoleRunner {
	if (env.TEAM_USE_MOCK_RUNNER !== "false") {
		return new MockRoleRunner();
	}
	return new AgentProfileRoleRunner({
		projectRoot: config.projectRoot,
		teamDataDir: config.teamDataDir,
		workerProfileId: "main",
		checkerProfileId: "main",
		watcherProfileId: "main",
		finalizerProfileId: "main",
		...(deps.profileResolver ? { profileResolver: deps.profileResolver } : {}),
		...(deps.sessionFactory ? { sessionFactory: deps.sessionFactory } : {}),
		setBrowserScopeRoute: deps.setBrowserScopeRoute ?? setBrowserScopeRoute,
		closeBrowserTargetsForScope: deps.closeBrowserTargetsForScope ?? closeBrowserTargetsForScope,
	});
}

const STATE_WATCH_INTERVAL_MS = 2000;

function createWorkerId(): string {
	return `worker_${process.pid}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

async function main() {
	const config = getAppConfig();
	console.log("[team-worker] starting, dataDir:", config.teamDataDir);

	const planStore = new PlanStore(config.teamDataDir);
	const unitStore = new TeamUnitStore(config.teamDataDir);
	const workspace = new RunWorkspace(config.teamDataDir);

	const pollIntervalMs = config.teamWorkerPollIntervalMs;
	const leaseTtlMs = Number.isFinite(config.teamWorkerLeaseTtlMs) && config.teamWorkerLeaseTtlMs > 0 ? config.teamWorkerLeaseTtlMs : 60_000;
	const configuredHeartbeatMs = Number.isFinite(config.teamWorkerHeartbeatIntervalMs) && config.teamWorkerHeartbeatIntervalMs > 0 ? config.teamWorkerHeartbeatIntervalMs : 10_000;
	const heartbeatIntervalMs = Math.min(configuredHeartbeatMs, Math.max(1000, Math.floor(leaseTtlMs / 2)));
	const workerId = process.env.TEAM_WORKER_ID?.trim() || createWorkerId();
	console.log("[team-worker] workerId:", workerId, "leaseTtlMs:", leaseTtlMs, "heartbeatIntervalMs:", heartbeatIntervalMs);

	async function tick() {
		try {
			const claimed = await workspace.claimNextRunnableRun(workerId, leaseTtlMs);
			if (!claimed) return;

			console.log("[team-worker] claimed run:", claimed.runId);
			const roleRunner = createTeamWorkerRoleRunner(config);
			const orchestrator = new TeamOrchestrator({
				planStore,
				teamUnitStore: unitStore,
				workspace,
				roleRunner,
				dataDir: config.teamDataDir,
				maxCheckerRevisions: 3,
				maxWatcherRevisions: 1,
				maxRunDurationMinutes: config.teamMaxRunDurationMinutes,
				phaseTimeouts: {
					workerMs: config.teamWorkerPhaseTimeoutMs,
					checkerMs: config.teamCheckerPhaseTimeoutMs,
					watcherMs: config.teamWatcherPhaseTimeoutMs,
					finalizerMs: config.teamFinalizerPhaseTimeoutMs,
				},
			});

			const abortController = new AbortController();
			const heartbeat = setInterval(async () => {
				try {
					const ok = await workspace.heartbeatRunLease(claimed.runId, workerId, leaseTtlMs);
					if (!ok) {
						abortController.abort(new Error("run lease lost"));
						clearInterval(heartbeat);
					}
				} catch {
					// heartbeat errors should not crash the worker; next tick will retry or abort.
				}
			}, heartbeatIntervalMs);
			heartbeat.unref?.();
			const watcher = setInterval(async () => {
				try {
					const current = await workspace.getState(claimed.runId);
					if (!current) return;
					if (current.status === "cancelled" || current.status === "paused") {
						abortController.abort(new Error(`run externally ${current.status}`));
						clearInterval(watcher);
					}
				} catch {
					// watcher errors should not crash the worker
				}
			}, STATE_WATCH_INTERVAL_MS);

			try {
				const final = await orchestrator.runToCompletion(claimed.runId, { signal: abortController.signal, leaseOwnerId: workerId });
				console.log("[team-worker] run completed:", claimed.runId, "status:", final.status);
			} finally {
				clearInterval(watcher);
				clearInterval(heartbeat);
				await workspace.releaseRunLease(claimed.runId, workerId);
			}
		} catch (err) {
			console.error("[team-worker] tick error:", err);
		}
	}

	async function loop() {
		await tick();
		setTimeout(loop, pollIntervalMs);
	}

	loop();
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (import.meta.url === entrypoint) {
	main().catch(err => {
		console.error("[team-worker] fatal:", err);
		process.exit(1);
	});
}
