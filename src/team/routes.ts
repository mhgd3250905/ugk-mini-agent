import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { PlanStore } from "./plan-store.js";
import { TeamUnitStore } from "./team-unit-store.js";
import { RunWorkspace } from "./run-workspace.js";
import { TeamOrchestrator, DEFAULT_PHASE_TIMEOUTS } from "./orchestrator.js";
import { computeTeamConfigLocks } from "./config-locks.js";
import { buildTeamPlanDraft, listTeamPlanTemplates } from "./plan-draft.js";
import { validateCreatePlanInput } from "./plan-validation.js";
import { MockRoleRunner } from "./role-runner.js";
import type { TeamRoleRunner } from "./role-runner.js";
import { buildRunDetailResponse } from "./run-presenter.js";
import type { TeamRunState } from "./types.js";
import { AgentProfileRoleRunner } from "./agent-profile-role-runner.js";
import { closeBrowserTargetsForScope } from "../agent/browser-cleanup.js";
import { loadAgentProfilesSync } from "../agent/agent-profile-catalog.js";
import { setBrowserScopeRoute } from "../browser/browser-scope-routes.js";
import { configureSseResponse, writeSseEvent, startSseHeartbeat, endSseResponse } from "../routes/chat-sse.js";

export interface TeamRouteOptions {
	teamDataDir: string;
	projectRoot: string;
	maxConcurrentRuns?: number;
	maxRunDurationMinutes?: number;
}

function createRoleRunner(options: TeamRouteOptions): TeamRoleRunner {
	if (process.env.TEAM_USE_MOCK_RUNNER !== "false") {
		return new MockRoleRunner();
	}
	return new AgentProfileRoleRunner({
		projectRoot: options.projectRoot,
		teamDataDir: options.teamDataDir,
		workerProfileId: "main",
		checkerProfileId: "main",
		watcherProfileId: "main",
		finalizerProfileId: "main",
		decomposerProfileId: "main",
		setBrowserScopeRoute,
		closeBrowserTargetsForScope,
	});
}

function validateTeamUnitProfileIds(options: TeamRouteOptions, profileIds: string[]): void {
	const availableProfiles = new Set(loadAgentProfilesSync(options.projectRoot).map((profile) => profile.agentId));
	for (const profileId of profileIds) {
		if (!availableProfiles.has(profileId)) {
			throw new Error(`agent profile not found: ${profileId}`);
		}
	}
}

async function validateUsableTeamUnit(unitStore: TeamUnitStore, teamUnitId: string | undefined): Promise<void> {
	if (!teamUnitId) {
		throw new Error("defaultTeamUnitId is required");
	}
	const teamUnit = await unitStore.get(teamUnitId);
	if (!teamUnit) {
		throw new Error(`team unit not found: ${teamUnitId}`);
	}
	if (teamUnit.archived) {
		throw new Error("archived team unit cannot be used");
	}
}

export function registerTeamRoutes(app: FastifyInstance, options: TeamRouteOptions): void {
	const planStore = new PlanStore(options.teamDataDir);
	const unitStore = new TeamUnitStore(options.teamDataDir);
	const workspace = new RunWorkspace(options.teamDataDir);

	function makeOrchestrator(): TeamOrchestrator {
		const roleRunner = createRoleRunner(options);
		return new TeamOrchestrator({
			planStore,
			teamUnitStore: unitStore,
			workspace,
			roleRunner,
			dataDir: options.teamDataDir,
			maxCheckerRevisions: 3,
			maxWatcherRevisions: 1,
			maxRunDurationMinutes: options.maxRunDurationMinutes ?? 100,
			maxConcurrentRuns: options.maxConcurrentRuns,
		});
	}

	// healthz
	app.get("/v1/team/healthz", async (_request, reply) => {
		reply.send({ status: "ok", version: "v2" });
	});

	// ── Plans ──

	app.get("/v1/team/plans", async (_request, reply) => {
		const plans = await planStore.list();
		reply.send(plans);
	});

	app.get("/v1/team/plan-templates", async (_request, reply) => {
		reply.send(listTeamPlanTemplates());
	});

	app.post("/v1/team/plan-drafts", async (request, reply) => {
		const body = request.body as Record<string, unknown>;
		try {
			await validateUsableTeamUnit(unitStore, body.defaultTeamUnitId as string | undefined);
			const draft = buildTeamPlanDraft({
				prompt: body.prompt as string,
				defaultTeamUnitId: body.defaultTeamUnitId as string,
				preferredTemplateId: body.preferredTemplateId as string | undefined,
			});
			validateCreatePlanInput(draft.plan);
			reply.send(draft);
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	app.post("/v1/team/plans", async (request, reply) => {
		const body = request.body as Record<string, unknown>;
		try {
			await validateUsableTeamUnit(unitStore, body.defaultTeamUnitId as string | undefined);
			const plan = await planStore.create({
				title: body.title as string,
				defaultTeamUnitId: body.defaultTeamUnitId as string,
				goal: body.goal as { text: string },
				tasks: body.tasks as any,
				outputContract: body.outputContract as { text: string },
			});
			reply.code(201).send(plan);
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	app.get("/v1/team/plans/:planId", async (request, reply) => {
		const { planId } = request.params as { planId: string };
		const plan = await planStore.get(planId);
		if (!plan) { reply.code(404).send({ error: "plan not found" }); return; }
		reply.send(plan);
	});

	app.patch("/v1/team/plans/:planId", async (request, reply) => {
		const { planId } = request.params as { planId: string };
		const body = request.body as Record<string, unknown>;
		try {
			const plan = await planStore.updateEditablePlan(planId, {
				title: body.title as string | undefined,
				goal: body.goal as { text: string } | undefined,
				tasks: body.tasks as any,
				outputContract: body.outputContract as { text: string } | undefined,
			} as Parameters<typeof planStore.updateEditablePlan>[1]);
			reply.send(plan);
		} catch (err) {
			const msg = (err as Error).message;
			reply.code(msg.includes("immutable") ? 409 : 400).send({ error: msg });
		}
	});

	app.patch("/v1/team/plans/:planId/default-team", async (request, reply) => {
		const { planId } = request.params as { planId: string };
		const body = request.body as { defaultTeamUnitId?: string };
		if (!body.defaultTeamUnitId) { reply.code(400).send({ error: "defaultTeamUnitId is required" }); return; }
		try {
			const locks = computeTeamConfigLocks(await workspace.listStates(), await unitStore.list());
			if (locks.lockedPlanIds.has(planId)) { reply.code(409).send({ error: "locked by active run" }); return; }
			await validateUsableTeamUnit(unitStore, body.defaultTeamUnitId);
			const plan = await planStore.updateDefaultTeam(planId, body.defaultTeamUnitId);
			reply.send(plan);
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	app.post("/v1/team/plans/:planId/archive", async (request, reply) => {
		const { planId } = request.params as { planId: string };
		try {
			const locks = computeTeamConfigLocks(await workspace.listStates(), await unitStore.list());
			if (locks.lockedPlanIds.has(planId)) { reply.code(409).send({ error: "locked by active run" }); return; }
			const plan = await planStore.archive(planId);
			reply.send(plan);
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	app.delete("/v1/team/plans/:planId", async (request, reply) => {
		const { planId } = request.params as { planId: string };
		try {
			await planStore.deleteUnused(planId);
			reply.code(204).send();
		} catch (err) {
			const msg = (err as Error).message;
			reply.code(msg.includes("used plan") ? 409 : 404).send({ error: msg });
		}
	});

	app.post("/v1/team/plans/:planId/runs", async (request, reply) => {
		const { planId } = request.params as { planId: string };
		try {
			const body = request.body as Record<string, unknown> | undefined;
			let perRunTimeout: number | undefined;
			if (body?.maxRunDurationMinutes != null) {
				const raw = body.maxRunDurationMinutes;
				const num = Number(raw);
				if (!Number.isFinite(num) || num <= 0 || num > 1440) {
					reply.code(400).send({ error: "maxRunDurationMinutes must be a positive number up to 1440" });
					return;
				}
				perRunTimeout = num;
			}
			const orchestrator = makeOrchestrator();
			const runOptions = perRunTimeout != null ? { maxRunDurationMinutes: perRunTimeout } : { maxRunDurationMinutes: options.maxRunDurationMinutes ?? 100 };
			const state = await orchestrator.createRun(planId, runOptions);
			reply.code(201).send(state);
		} catch (err) {
			const msg = (err as Error).message;
			reply.code(msg.includes("active run") || msg.includes("admission lock busy") ? 409 : 400).send({ error: msg });
		}
	});

	// ── Team Units ──

	app.get("/v1/team/team-units", async (_request, reply) => {
		const units = await unitStore.list();
		reply.send(units);
	});

	app.post("/v1/team/team-units", async (request, reply) => {
		const body = request.body as Record<string, unknown>;
		try {
			const decomposerProfileId = (body.decomposerProfileId as string | undefined) ?? body.workerProfileId as string;
			validateTeamUnitProfileIds(options, [
				body.watcherProfileId as string,
				body.workerProfileId as string,
				body.checkerProfileId as string,
				body.finalizerProfileId as string,
				decomposerProfileId,
			]);
			const unit = await unitStore.create({
				title: body.title as string,
				description: body.description as string,
				watcherProfileId: body.watcherProfileId as string,
				workerProfileId: body.workerProfileId as string,
				checkerProfileId: body.checkerProfileId as string,
				finalizerProfileId: body.finalizerProfileId as string,
				decomposerProfileId,
			});
			reply.code(201).send(unit);
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	app.get("/v1/team/team-units/:teamUnitId", async (request, reply) => {
		const { teamUnitId } = request.params as { teamUnitId: string };
		const unit = await unitStore.get(teamUnitId);
		if (!unit) { reply.code(404).send({ error: "team unit not found" }); return; }
		reply.send(unit);
	});

	app.patch("/v1/team/team-units/:teamUnitId", async (request, reply) => {
		const { teamUnitId } = request.params as { teamUnitId: string };
		const body = request.body as Record<string, unknown>;
		try {
			const locks = computeTeamConfigLocks(await workspace.listStates(), await unitStore.list());
			if (locks.lockedTeamUnitIds.has(teamUnitId)) { reply.code(409).send({ error: "locked by active run" }); return; }
			const existing = await unitStore.get(teamUnitId);
			validateTeamUnitProfileIds(options, [
				(body.watcherProfileId as string | undefined) ?? existing?.watcherProfileId ?? "",
				(body.workerProfileId as string | undefined) ?? existing?.workerProfileId ?? "",
				(body.checkerProfileId as string | undefined) ?? existing?.checkerProfileId ?? "",
				(body.finalizerProfileId as string | undefined) ?? existing?.finalizerProfileId ?? "",
				(body.decomposerProfileId as string | undefined) ?? existing?.decomposerProfileId ?? "",
			]);
			const unit = await unitStore.update(teamUnitId, {
				title: body.title as string | undefined,
				description: body.description as string | undefined,
				watcherProfileId: body.watcherProfileId as string | undefined,
				workerProfileId: body.workerProfileId as string | undefined,
				checkerProfileId: body.checkerProfileId as string | undefined,
				finalizerProfileId: body.finalizerProfileId as string | undefined,
				...(body.decomposerProfileId != null ? { decomposerProfileId: body.decomposerProfileId as string } : {}),
			});
			reply.send(unit);
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	app.delete("/v1/team/team-units/:teamUnitId", async (request, reply) => {
		const { teamUnitId } = request.params as { teamUnitId: string };
		try {
			const locks = computeTeamConfigLocks(await workspace.listStates(), await unitStore.list());
			if (locks.lockedTeamUnitIds.has(teamUnitId)) { reply.code(409).send({ error: "locked by active run" }); return; }
			await unitStore.delete(teamUnitId);
			reply.code(204).send();
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	app.post("/v1/team/team-units/:teamUnitId/archive", async (request, reply) => {
		const { teamUnitId } = request.params as { teamUnitId: string };
		try {
			const locks = computeTeamConfigLocks(await workspace.listStates(), await unitStore.list());
			if (locks.lockedTeamUnitIds.has(teamUnitId)) { reply.code(409).send({ error: "locked by active run" }); return; }
			const unit = await unitStore.archive(teamUnitId);
			reply.send(unit);
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	// ── Runs ──

	app.get("/v1/team/runs", async (_request, reply) => {
		const states = await workspace.listStates();
		reply.send(states);
	});

	app.get("/v1/team/runs/:runId", async (request, reply) => {
		const { runId } = request.params as { runId: string };
		const state = await workspace.getState(runId);
		if (!state) { reply.code(404).send({ error: "run not found" }); return; }
		const plan = await planStore.get(state.planId);
		reply.send(await buildRunDetailResponse(state, plan, workspace));
	});

	app.post("/v1/team/runs/:runId/pause", async (request, reply) => {
		const { runId } = request.params as { runId: string };
		try {
			const orchestrator = makeOrchestrator();
			const state = await orchestrator.pauseRun(runId, "user pause");
			reply.send(state);
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	app.post("/v1/team/runs/:runId/resume", async (request, reply) => {
		const { runId } = request.params as { runId: string };
		try {
			const orchestrator = makeOrchestrator();
			const state = await orchestrator.resumeRun(runId);
			reply.send(state);
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	app.post("/v1/team/runs/:runId/cancel", async (request, reply) => {
		const { runId } = request.params as { runId: string };
		try {
			const orchestrator = makeOrchestrator();
			const state = await orchestrator.cancelRun(runId, "user cancel");
			reply.send(state);
		} catch (err) {
			const msg = (err as Error).message;
			reply.code(msg.includes("terminal") ? 409 : 400).send({ error: msg });
		}
	});


	// ── P24: Manual task disposition and rerun ──

	const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "paused"]);

	app.patch("/v1/team/runs/:runId/tasks/:taskId/manual-disposition", async (request, reply) => {
		const { runId, taskId } = request.params as { runId: string; taskId: string };
		const body = request.body as { disposition?: string };
		const validDispositions = new Set(["default", "skip", "force_rerun"]);
		if (!body.disposition || !validDispositions.has(body.disposition)) {
		reply.code(400).send({ error: "disposition must be one of: default, skip, force_rerun" });
		return;
		}
		const state = await workspace.getState(runId);
		if (!state) { reply.code(404).send({ error: "run not found" }); return; }
		if (!state.taskStates[taskId]) { reply.code(404).send({ error: "task not found" }); return; }
		if (ACTIVE_RUN_STATUSES.has(state.status)) { reply.code(409).send({ error: "cannot modify disposition of active run" }); return; }

		state.taskStates[taskId]!.manualDisposition = body.disposition as "default" | "skip" | "force_rerun";
		state.taskStates[taskId]!.manualDispositionUpdatedAt = new Date().toISOString();
		state.updatedAt = new Date().toISOString();
		await workspace.saveState(state);

		const plan = await planStore.get(state.planId);
		reply.send(await buildRunDetailResponse(state, plan, workspace));
	});

	app.patch("/v1/team/runs/:runId/tasks/manual-dispositions", async (request, reply) => {
		const { runId } = request.params as { runId: string };
		const body = request.body as { updates?: Array<{ taskId: string; disposition: string }> };
		if (!Array.isArray(body.updates) || body.updates.length === 0) {
		reply.code(400).send({ error: "updates must be a non-empty array of { taskId, disposition }" });
		return;
		}
		const validDispositions = new Set(["default", "skip", "force_rerun"]);
		for (const u of body.updates) {
		if (!u.taskId || !u.disposition || !validDispositions.has(u.disposition)) {
			reply.code(400).send({ error: "invalid update: taskId=" + u.taskId + ", disposition=" + u.disposition });
			return;
		}
		}
		const state = await workspace.getState(runId);
		if (!state) { reply.code(404).send({ error: "run not found" }); return; }
		if (ACTIVE_RUN_STATUSES.has(state.status)) { reply.code(409).send({ error: "cannot modify disposition of active run" }); return; }
		for (const u of body.updates) {
		if (!state.taskStates[u.taskId]) {
			reply.code(404).send({ error: "task not found: " + u.taskId });
			return;
		}
		}
		for (const u of body.updates) {
		state.taskStates[u.taskId]!.manualDisposition = u.disposition as "default" | "skip" | "force_rerun";
		state.taskStates[u.taskId]!.manualDispositionUpdatedAt = new Date().toISOString();
		}
		state.updatedAt = new Date().toISOString();
		await workspace.saveState(state);

		const plan = await planStore.get(state.planId);
		reply.send(await buildRunDetailResponse(state, plan, workspace));
	});

	app.post("/v1/team/runs/:runId/rerun", async (request, reply) => {
		const { runId } = request.params as { runId: string };
		try {
		const orchestrator = makeOrchestrator();
		const state = await orchestrator.rerunRun(runId);
		const plan = await planStore.get(state.planId);
		reply.send(await buildRunDetailResponse(state, plan, workspace));
		} catch (err) {
		const msg = (err as Error).message;
		reply.code(msg.includes("cannot rerun") ? 409 : 400).send({ error: msg });
		}
	});


	app.delete("/v1/team/runs/:runId", async (request, reply) => {
		const { runId } = request.params as { runId: string };
		try {
			const orchestrator = makeOrchestrator();
			await orchestrator.deleteTerminalRun(runId);
			reply.code(204).send();
		} catch (err) {
			const msg = (err as Error).message;
			reply.code(msg.includes("non-terminal") ? 409 : 404).send({ error: msg });
		}
	});

	app.get("/v1/team/runs/:runId/final-report", async (request, reply) => {
		const { runId } = request.params as { runId: string };
		const state = await workspace.getState(runId);
		if (!state) { reply.code(404).send({ error: "run not found" }); return; }
		const report = await workspace.readFinalReport(runId);
		if (report === null) {
			reply.code(404).send({ error: "final report not found" });
			return;
		}
		reply.type("text/markdown; charset=utf-8").send(report);
	});

		// SSE: run state snapshots
		app.get("/v1/team/runs/:runId/events", async (request, reply) => {
			const { runId } = request.params as { runId: string };
			const state = await workspace.getState(runId);
			if (!state) { reply.code(404).send({ error: "run not found" }); return; }

			configureSseResponse(reply.raw);

			const sendSnapshot = (s: TeamRunState) => {
				writeSseEvent(reply.raw, { type: "snapshot", data: s });
			};

			sendSnapshot(state);
			let lastSnapshotJson = JSON.stringify(state);

			const TERMINAL = new Set(["completed", "completed_with_failures", "failed", "cancelled"]);
			if (TERMINAL.has(state.status)) {
				endSseResponse(reply.raw);
				return;
			}

			const heartbeat = startSseHeartbeat(reply.raw, 15_000);

			let stopped = false;
			let subscription: { unsubscribe(): void } | null = null;
			let fallbackPoll: ReturnType<typeof setInterval> | null = null;
			const stopStream = () => {
				if (stopped) return;
				stopped = true;
				subscription?.unsubscribe();
				heartbeat.stop();
				if (fallbackPoll) clearInterval(fallbackPoll);
			};
			const sendIfChanged = (fresh: TeamRunState) => {
				if (stopped || reply.raw.destroyed || reply.raw.writableEnded) return;
				const snapshotJson = JSON.stringify(fresh);
				if (snapshotJson === lastSnapshotJson) return;
				lastSnapshotJson = snapshotJson;
				sendSnapshot(fresh);
				if (TERMINAL.has(fresh.status)) {
					stopStream();
					endSseResponse(reply.raw);
				}
			};
			subscription = workspace.events.subscribe(runId, (fresh) => {
				sendIfChanged(fresh);
			});
			fallbackPoll = setInterval(async () => {
				if (stopped || reply.raw.destroyed || reply.raw.writableEnded) {
					stopStream();
					return;
				}
				try {
					const fresh = await workspace.getState(runId);
					if (!fresh) {
						stopStream();
						endSseResponse(reply.raw);
						return;
					}
					sendIfChanged(fresh);
				} catch {
					// A transient disk read failure should not kill the SSE stream.
				}
			}, 1000);
			fallbackPoll.unref?.();

			request.raw.on("close", () => {
				stopStream();
			});
		});

		// Attempt read-only API (safe path resolution)
		app.get("/v1/team/runs/:runId/tasks/:taskId/attempts", async (request, reply) => {
			const { runId, taskId } = request.params as { runId: string; taskId: string };
			const state = await workspace.getState(runId);
			if (!state) { reply.code(404).send({ error: "run not found" }); return; }
			if (!state.taskStates[taskId]) { reply.code(404).send({ error: "task not found" }); return; }
			try {
				const attempts = await workspace.listAttempts(runId, taskId);
				reply.send({ attempts });
			} catch {
				reply.send({ attempts: [] });
			}
		});

		app.get("/v1/team/runs/:runId/tasks/:taskId/attempts/:attemptId/files/:fileName", async (request, reply) => {
			const { runId, taskId, attemptId, fileName } = request.params as { runId: string; taskId: string; attemptId: string; fileName: string };
			const state = await workspace.getState(runId);
			if (!state) { reply.code(404).send({ error: "run not found" }); return; }
			if (!state.taskStates[taskId]) { reply.code(404).send({ error: "task not found" }); return; }
			if (/[^a-zA-Z0-9._-]/.test(fileName) || fileName.includes("..")) {
				reply.code(400).send({ error: "invalid file name" }); return;
			}
			try {
				const content = await workspace.readAttemptFile(runId, taskId, attemptId, fileName);
				if (content === null) { reply.code(404).send({ error: "file not found" }); return; }
				reply.type("text/plain; charset=utf-8").send(content);
			} catch {
				reply.code(404).send({ error: "file not found" });
			}
		});
}
