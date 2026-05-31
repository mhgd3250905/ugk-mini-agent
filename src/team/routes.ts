import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { join } from "node:path";
import { PlanStore } from "./plan-store.js";
import { TaskStore } from "./task-store.js";
import { TeamUnitStore } from "./team-unit-store.js";
import { RunWorkspace } from "./run-workspace.js";
import { TeamOrchestrator, DEFAULT_PHASE_TIMEOUTS } from "./orchestrator.js";
import { CanvasTaskRunService } from "./task-run-service.js";
import { computeTeamConfigLocks } from "./config-locks.js";
import { buildTeamPlanDraft, listTeamPlanTemplates } from "./plan-draft.js";
import { validateCreatePlanInput } from "./plan-validation.js";
import type { UpdateTeamCanvasTaskInput } from "./task-validation.js";
import { TaskConnectionStore } from "./task-connection-store.js";
import { TaskDependencyStore } from "./task-dependency-store.js";
import { SourceConnectionStore } from "./source-connection-store.js";
import { SourceNodeStore, type UpdateSourceNodeInput } from "./source-node-store.js";
import { MockRoleRunner } from "./role-runner.js";
import type { TeamRoleRunner } from "./role-runner.js";
import { buildRunDetailResponse } from "./run-presenter.js";
import type { TeamRunState } from "./types.js";
import { AgentProfileRoleRunner } from "./agent-profile-role-runner.js";
import { closeBrowserTargetsForScope } from "../agent/browser-cleanup.js";
import { loadAgentProfilesSync } from "../agent/agent-profile-catalog.js";
import { setBrowserScopeRoute } from "../browser/browser-scope-routes.js";
import { configureSseResponse, writeSseEvent, startSseHeartbeat, endSseResponse } from "../routes/chat-sse.js";
import { idParam, jsonBody, optionalJsonBody, parseIncludeArchived, parseIncludeGenerated } from "./route-parsers.js";
import { sendMappedError, sendNotFound } from "./route-errors.js";
import { sendTaskResponse } from "./route-presenters.js";

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
	const taskStore = new TaskStore(options.teamDataDir, {
		getAgentIds: () => loadAgentProfilesSync(options.projectRoot).map((profile) => profile.agentId),
	});
	const unitStore = new TeamUnitStore(options.teamDataDir);
	const sourceNodeStore = new SourceNodeStore(options.teamDataDir);
	const taskConnectionStore = new TaskConnectionStore(options.teamDataDir, taskStore);
	const taskDependencyStore = new TaskDependencyStore(options.teamDataDir, taskStore);
	taskConnectionStore.setExistingDependencies(() => taskDependencyStore.list());
	taskDependencyStore.setExistingConnections(() => taskConnectionStore.list());
	const sourceConnectionStore = new SourceConnectionStore(options.teamDataDir, sourceNodeStore, taskStore);
	const workspace = new RunWorkspace(options.teamDataDir);
	const taskRunDataDir = join(options.teamDataDir, "task-runs");
	const taskRunWorkspace = new RunWorkspace(taskRunDataDir);
	const taskRunService = new CanvasTaskRunService({
		taskStore,
		workspace: taskRunWorkspace,
		createRoleRunner: () => createRoleRunner({ ...options, teamDataDir: taskRunDataDir }),
		connectionStore: taskConnectionStore,
		dependencyStore: taskDependencyStore,
		sourceNodeStore,
		sourceConnectionStore,
		dataDir: taskRunDataDir,
		maxCheckerRevisions: 3,
		maxRunDurationMinutes: options.maxRunDurationMinutes,
	});

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

	// ── Canvas Tasks ──


	app.get("/v1/team/tasks", async (request, reply) => {
		const tasks = await taskStore.list({
			includeArchived: parseIncludeArchived(request),
			includeGenerated: parseIncludeGenerated(request),
		});
		reply.send({ tasks });
	});

	app.post("/v1/team/tasks", async (request, reply) => {
		const body = jsonBody(request);
		if (Object.hasOwn(body, "generatedSource")) {
			reply.code(400).send({ error: "generated Task source identity cannot be created through this route" });
			return;
		}
		try {
			const task = await taskStore.create({
				canvasKind: body.canvasKind as any,
				title: body.title as string,
				leaderAgentId: body.leaderAgentId as string,
				status: body.status as any,
				workUnit: body.workUnit as any,
				discoverySpec: body.discoverySpec as any,
				createdByAgentId: body.createdByAgentId as string | undefined,
			});
			reply.code(201);
			sendTaskResponse(reply, task);
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	app.get("/v1/team/tasks/:taskId", async (request, reply) => {
		const taskId = idParam(request, "taskId");
		const task = await taskStore.get(taskId);
		if (!task) { sendNotFound(reply, "task"); return; }
		sendTaskResponse(reply, task);
	});

	app.get("/v1/team/tasks/:taskId/generated-tasks", async (request, reply) => {
		const taskId = idParam(request, "taskId");
		const task = await taskStore.get(taskId);
		if (!task) { sendNotFound(reply, "task"); return; }
		if (task.canvasKind !== "discovery") {
			reply.code(400).send({ error: "generated tasks can only be listed for Discovery root tasks" });
			return;
		}
		const tasks = await taskStore.listGeneratedForDiscoveryTask(taskId, {
			includeArchived: parseIncludeArchived(request),
		});
		reply.send({ tasks });
	});

	app.patch("/v1/team/tasks/:taskId", async (request, reply) => {
		const taskId = idParam(request, "taskId");
		const body = jsonBody(request);
		if (Object.hasOwn(body, "canvasKind")) {
			reply.code(400).send({ error: "canvasKind cannot be updated through this route" });
			return;
		}
		if (Object.hasOwn(body, "generatedSource")) {
			reply.code(400).send({ error: "generated Task source identity cannot be updated through this route" });
			return;
		}
		const patch: UpdateTeamCanvasTaskInput = {};
		if (Object.hasOwn(body, "title")) patch.title = body.title as string;
		if (Object.hasOwn(body, "leaderAgentId")) patch.leaderAgentId = body.leaderAgentId as string;
		if (Object.hasOwn(body, "workUnit")) patch.workUnit = body.workUnit as any;
		if (Object.hasOwn(body, "discoverySpec")) patch.discoverySpec = body.discoverySpec as any;
		if (Object.hasOwn(body, "status")) patch.status = body.status as any;
		try {
			const task = await taskStore.update(taskId, patch);
			sendTaskResponse(reply, task);
		} catch (err) {
			sendMappedError(reply, err, [["not found", 404], ["locked", 409]]);
		}
	});

	app.post("/v1/team/tasks/:taskId/generated-workunit/reset", async (request, reply) => {
		const taskId = idParam(request, "taskId");
		try {
			const task = await taskStore.resetGeneratedTaskWorkUnit(taskId);
			sendTaskResponse(reply, task);
		} catch (err) {
			sendMappedError(reply, err, [["not found", 404], ["archived", 409], ["latest managed", 409]]);
		}
	});

	app.post("/v1/team/tasks/:taskId/archive", async (request, reply) => {
		const taskId = idParam(request, "taskId");
		try {
			const task = await taskStore.archive(taskId);
			sendTaskResponse(reply, task);
		} catch (err) {
			sendMappedError(reply, err, [["not found", 404]]);
		}
	});

	app.get("/v1/team/source-nodes", async (request, reply) => {
		const query = request.query as { includeArchived?: string };
		try {
			const sourceNodes = await sourceNodeStore.list({ includeArchived: parseIncludeArchived(request) });
			reply.send({ sourceNodes });
		} catch (err) {
			reply.code(500).send({ error: (err as Error).message });
		}
	});

	app.post("/v1/team/source-nodes", async (request, reply) => {
		const body = jsonBody(request);
		try {
			const sourceNode = await sourceNodeStore.create({
				title: body.title as string,
				nodeType: body.nodeType as any,
				outputPort: body.outputPort as any,
				content: body.content as any,
			});
			reply.code(201).send({ sourceNode });
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	app.patch("/v1/team/source-nodes/:sourceNodeId", async (request, reply) => {
		const sourceNodeId = idParam(request, "sourceNodeId");
		const body = jsonBody(request);
		const patch: UpdateSourceNodeInput = {};
		if (Object.hasOwn(body, "title")) patch.title = body.title as string;
		if (Object.hasOwn(body, "nodeType")) patch.nodeType = body.nodeType as any;
		if (Object.hasOwn(body, "outputPort")) patch.outputPort = body.outputPort as any;
		if (Object.hasOwn(body, "content")) patch.content = body.content as any;
		try {
			const sourceNode = await sourceNodeStore.update(sourceNodeId, patch);
			reply.send({ sourceNode });
		} catch (err) {
			sendMappedError(reply, err, [["not found", 404]]);
		}
	});

	app.post("/v1/team/source-nodes/:sourceNodeId/archive", async (request, reply) => {
		const sourceNodeId = idParam(request, "sourceNodeId");
		try {
			const sourceNode = await sourceNodeStore.archive(sourceNodeId);
			reply.send({ sourceNode });
		} catch (err) {
			sendMappedError(reply, err, [["not found", 404]]);
		}
	});

	app.get("/v1/team/source-connections", async (_request, reply) => {
		try {
			const connections = await sourceConnectionStore.listResolved();
			reply.send({ connections });
		} catch (err) {
			reply.code(500).send({ error: (err as Error).message });
		}
	});

	app.post("/v1/team/source-connections", async (request, reply) => {
		const body = jsonBody(request);
		try {
			const connection = await sourceConnectionStore.create({
				fromSourceNodeId: body.fromSourceNodeId as string,
				fromOutputPortId: body.fromOutputPortId as string,
				toTaskId: body.toTaskId as string,
				toInputPortId: body.toInputPortId as string,
			});
			reply.code(201).send({ connection });
		} catch (err) {
			sendMappedError(reply, err, [["lock busy", 409], ["source connection store", 500], ["not found", 404], ["port not found", 404], ["already exists", 409], ["archived", 409]]);
		}
	});

	app.delete("/v1/team/source-connections/:connectionId", async (request, reply) => {
		const connectionId = idParam(request, "connectionId");
		try {
			const deleted = await sourceConnectionStore.delete(connectionId);
			if (!deleted) {
				sendNotFound(reply, "source connection");
				return;
			}
			reply.code(204).send();
		} catch (err) {
			sendMappedError(reply, err, [["lock busy", 409]], 500);
		}
	});

	app.get("/v1/team/task-connections", async (_request, reply) => {
		try {
			const connections = await taskConnectionStore.listResolved();
			reply.send({ connections });
		} catch (err) {
			reply.code(500).send({ error: (err as Error).message });
		}
	});

	app.post("/v1/team/task-connections", async (request, reply) => {
		const body = jsonBody(request);
		try {
			const connection = await taskConnectionStore.create({
				fromTaskId: body.fromTaskId as string,
				fromOutputPortId: body.fromOutputPortId as string,
				toTaskId: body.toTaskId as string,
				toInputPortId: body.toInputPortId as string,
			});
			reply.code(201).send({ connection });
		} catch (err) {
			sendMappedError(reply, err, [["lock busy", 409], ["task connection store", 500], ["task not found", 404], ["port not found", 404], ["already exists", 409], ["cycle", 409], ["archived", 409]]);
		}
	});

	app.delete("/v1/team/task-connections/:connectionId", async (request, reply) => {
		const connectionId = idParam(request, "connectionId");
		try {
			const deleted = await taskConnectionStore.delete(connectionId);
			if (!deleted) {
				sendNotFound(reply, "task connection");
				return;
			}
			reply.code(204).send();
		} catch (err) {
			sendMappedError(reply, err, [["lock busy", 409]], 500);
		}
	});


		// -- Task Control Dependencies --

		app.get("/v1/team/task-dependencies", async (_request, reply) => {
			try {
				const dependencies = await taskDependencyStore.listResolved();
				reply.send({ dependencies });
			} catch (err) {
				reply.code(500).send({ error: (err as Error).message });
			}
		});

		app.post("/v1/team/task-dependencies", async (request, reply) => {
			const body = jsonBody(request);
			try {
				const dependency = await taskDependencyStore.create({
					fromTaskId: body.fromTaskId as string,
					toTaskId: body.toTaskId as string,
				});
				reply.code(201).send({ dependency });
			} catch (err) {
				sendMappedError(reply, err, [["lock busy", 409], ["task dependency store", 500], ["task not found", 404], ["already exists", 409], ["cycle", 409], ["archived", 409], ["same task", 409]]);
			}
		});

		app.delete("/v1/team/task-dependencies/:dependencyId", async (request, reply) => {
			const dependencyId = idParam(request, "dependencyId");
			try {
				const deleted = await taskDependencyStore.delete(dependencyId);
				if (!deleted) {
					sendNotFound(reply, "task dependency");
					return;
				}
				reply.code(204).send();
			} catch (err) {
				sendMappedError(reply, err, [["lock busy", 409]], 500);
			}
		});
	app.get("/v1/team/tasks/:taskId/runs", async (request, reply) => {
		const taskId = idParam(request, "taskId");
		const task = await taskStore.get(taskId);
		if (!task) { sendNotFound(reply, "task"); return; }
		const runs = await taskRunService.listRuns(taskId);
		reply.send({ runs });
	});

	app.post("/v1/team/tasks/:taskId/runs", async (request, reply) => {
		const taskId = idParam(request, "taskId");
		const body = optionalJsonBody(request);
		try {
			let maxRunDurationMinutes: number | undefined;
			if (body?.maxRunDurationMinutes != null) {
				const num = Number(body.maxRunDurationMinutes);
				if (!Number.isFinite(num) || num <= 0 || num > 1440) {
					reply.code(400).send({ error: "maxRunDurationMinutes must be a positive number up to 1440" });
					return;
				}
				maxRunDurationMinutes = num;
			}
			const state = await taskRunService.createRun(taskId, { maxRunDurationMinutes, includeSourceBindings: true });
			reply.code(201).send(state);
		} catch (err) {
			const msg = (err as Error).message;
			if (msg.includes("task not found")) {
				reply.code(404).send({ error: "task not found" });
				return;
			}
			sendMappedError(reply, err, [["ready", 409], ["archived", 409], ["active", 409]]);
		}
	});

	app.get("/v1/team/task-runs/:runId", async (request, reply) => {
		const runId = idParam(request, "runId");
		const state = await taskRunService.getRun(runId);
		if (!state) { sendNotFound(reply, "task run"); return; }
		reply.send(state);
	});

	app.post("/v1/team/task-runs/:runId/cancel", async (request, reply) => {
		const runId = idParam(request, "runId");
		try {
			const state = await taskRunService.cancelRun(runId, "user cancel");
			reply.send(state);
		} catch (err) {
			sendMappedError(reply, err, [["not found", 404], ["terminal", 409]]);
		}
	});

	app.get("/v1/team/task-runs/:runId/tasks/:taskId/attempts", async (request, reply) => {
		const runId = idParam(request, "runId");
		const taskId = idParam(request, "taskId");
		const state = await taskRunService.getRun(runId);
		if (!state) { sendNotFound(reply, "task run"); return; }
		if (!state.taskStates[taskId]) { sendNotFound(reply, "task"); return; }
		try {
			const attempts = await taskRunWorkspace.listAttempts(runId, taskId);
			reply.send({ attempts });
		} catch {
			reply.send({ attempts: [] });
		}
	});

	app.get("/v1/team/task-runs/:runId/tasks/:taskId/attempts/:attemptId/files/:fileName", async (request, reply) => {
		const runId = idParam(request, "runId");
		const taskId = idParam(request, "taskId");
		const attemptId = idParam(request, "attemptId");
		const fileName = idParam(request, "fileName");
		const state = await taskRunService.getRun(runId);
		if (!state) { sendNotFound(reply, "task run"); return; }
		if (!state.taskStates[taskId]) { sendNotFound(reply, "task"); return; }
		if (/[^a-zA-Z0-9._-]/.test(fileName) || fileName.includes("..")) {
			reply.code(400).send({ error: "invalid file name" }); return;
		}
		try {
			const content = await taskRunWorkspace.readAttemptFile(runId, taskId, attemptId, fileName);
			if (content === null) { sendNotFound(reply, "file"); return; }
			reply.type("text/plain; charset=utf-8").send(content);
		} catch {
			reply.code(404).send({ error: "file not found" });
		}
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
		const body = jsonBody(request);
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
		const body = jsonBody(request);
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
		const planId = idParam(request, "planId");
		const plan = await planStore.get(planId);
		if (!plan) { sendNotFound(reply, "plan"); return; }
		reply.send(plan);
	});

	app.patch("/v1/team/plans/:planId", async (request, reply) => {
		const planId = idParam(request, "planId");
		const body = jsonBody(request);
		try {
			const plan = await planStore.updateEditablePlan(planId, {
				title: body.title as string | undefined,
				goal: body.goal as { text: string } | undefined,
				tasks: body.tasks as any,
				outputContract: body.outputContract as { text: string } | undefined,
			} as Parameters<typeof planStore.updateEditablePlan>[1]);
			reply.send(plan);
		} catch (err) {
			sendMappedError(reply, err, [["immutable", 409]]);
		}
	});

	app.patch("/v1/team/plans/:planId/default-team", async (request, reply) => {
		const planId = idParam(request, "planId");
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
		const planId = idParam(request, "planId");
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
		const planId = idParam(request, "planId");
		try {
			await planStore.deleteUnused(planId);
			reply.code(204).send();
		} catch (err) {
			sendMappedError(reply, err, [["used plan", 409]], 404);
		}
	});

	app.post("/v1/team/plans/:planId/runs", async (request, reply) => {
		const planId = idParam(request, "planId");
		try {
			const body = optionalJsonBody(request);
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
			sendMappedError(reply, err, [["active run", 409], ["admission lock busy", 409]]);
		}
	});

	// ── Team Units ──

	app.get("/v1/team/team-units", async (_request, reply) => {
		const units = await unitStore.list();
		reply.send(units);
	});

	app.post("/v1/team/team-units", async (request, reply) => {
		const body = jsonBody(request);
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
		const teamUnitId = idParam(request, "teamUnitId");
		const unit = await unitStore.get(teamUnitId);
		if (!unit) { sendNotFound(reply, "team unit"); return; }
		reply.send(unit);
	});

	app.patch("/v1/team/team-units/:teamUnitId", async (request, reply) => {
		const teamUnitId = idParam(request, "teamUnitId");
		const body = jsonBody(request);
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
		const teamUnitId = idParam(request, "teamUnitId");
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
		const teamUnitId = idParam(request, "teamUnitId");
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
		const runId = idParam(request, "runId");
		const state = await workspace.getState(runId);
		if (!state) { sendNotFound(reply, "run"); return; }
		const plan = await planStore.get(state.planId);
		reply.send(await buildRunDetailResponse(state, plan, workspace));
	});

	app.post("/v1/team/runs/:runId/pause", async (request, reply) => {
		const runId = idParam(request, "runId");
		try {
			const orchestrator = makeOrchestrator();
			const state = await orchestrator.pauseRun(runId, "user pause");
			reply.send(state);
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	app.post("/v1/team/runs/:runId/resume", async (request, reply) => {
		const runId = idParam(request, "runId");
		try {
			const orchestrator = makeOrchestrator();
			const state = await orchestrator.resumeRun(runId);
			reply.send(state);
		} catch (err) {
			reply.code(400).send({ error: (err as Error).message });
		}
	});

	app.post("/v1/team/runs/:runId/cancel", async (request, reply) => {
		const runId = idParam(request, "runId");
		try {
			const orchestrator = makeOrchestrator();
			const state = await orchestrator.cancelRun(runId, "user cancel");
			reply.send(state);
		} catch (err) {
			sendMappedError(reply, err, [["terminal", 409]]);
		}
	});


	// ── P24: Manual task disposition and rerun ──

	const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "paused"]);

	app.patch("/v1/team/runs/:runId/tasks/:taskId/manual-disposition", async (request, reply) => {
		const runId = idParam(request, "runId");
		const taskId = idParam(request, "taskId");
		const body = request.body as { disposition?: string };
		const validDispositions = new Set(["default", "skip", "force_rerun"]);
		if (!body.disposition || !validDispositions.has(body.disposition)) {
		reply.code(400).send({ error: "disposition must be one of: default, skip, force_rerun" });
		return;
		}
		const state = await workspace.getState(runId);
		if (!state) { sendNotFound(reply, "run"); return; }
		if (!state.taskStates[taskId]) { sendNotFound(reply, "task"); return; }
		if (ACTIVE_RUN_STATUSES.has(state.status)) { reply.code(409).send({ error: "cannot modify disposition of active run" }); return; }

		state.taskStates[taskId]!.manualDisposition = body.disposition as "default" | "skip" | "force_rerun";
		state.taskStates[taskId]!.manualDispositionUpdatedAt = new Date().toISOString();
		state.updatedAt = new Date().toISOString();
		await workspace.saveState(state);

		const plan = await planStore.get(state.planId);
		reply.send(await buildRunDetailResponse(state, plan, workspace));
	});

	app.patch("/v1/team/runs/:runId/tasks/manual-dispositions", async (request, reply) => {
		const runId = idParam(request, "runId");
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
		if (!state) { sendNotFound(reply, "run"); return; }
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
		const runId = idParam(request, "runId");
		try {
		const orchestrator = makeOrchestrator();
		const state = await orchestrator.rerunRun(runId);
		const plan = await planStore.get(state.planId);
		reply.send(await buildRunDetailResponse(state, plan, workspace));
		} catch (err) {
		sendMappedError(reply, err, [["cannot rerun", 409]]);
		}
	});


	app.delete("/v1/team/runs/:runId", async (request, reply) => {
		const runId = idParam(request, "runId");
		try {
			const orchestrator = makeOrchestrator();
			await orchestrator.deleteTerminalRun(runId);
			reply.code(204).send();
		} catch (err) {
			sendMappedError(reply, err, [["non-terminal", 409]], 404);
		}
	});

	app.get("/v1/team/runs/:runId/final-report", async (request, reply) => {
		const runId = idParam(request, "runId");
		const state = await workspace.getState(runId);
		if (!state) { sendNotFound(reply, "run"); return; }
		const report = await workspace.readFinalReport(runId);
		if (report === null) {
			reply.code(404).send({ error: "final report not found" });
			return;
		}
		reply.type("text/markdown; charset=utf-8").send(report);
	});

		// SSE: run state snapshots
		app.get("/v1/team/runs/:runId/events", async (request, reply) => {
			const runId = idParam(request, "runId");
			const state = await workspace.getState(runId);
			if (!state) { sendNotFound(reply, "run"); return; }

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
			const runId = idParam(request, "runId");
			const taskId = idParam(request, "taskId");
			const state = await workspace.getState(runId);
			if (!state) { sendNotFound(reply, "run"); return; }
			if (!state.taskStates[taskId]) { sendNotFound(reply, "task"); return; }
			try {
				const attempts = await workspace.listAttempts(runId, taskId);
				reply.send({ attempts });
			} catch {
				reply.send({ attempts: [] });
			}
		});

		app.get("/v1/team/runs/:runId/tasks/:taskId/attempts/:attemptId/files/:fileName", async (request, reply) => {
			const runId = idParam(request, "runId");
			const taskId = idParam(request, "taskId");
			const attemptId = idParam(request, "attemptId");
			const fileName = idParam(request, "fileName");
			const state = await workspace.getState(runId);
			if (!state) { sendNotFound(reply, "run"); return; }
			if (!state.taskStates[taskId]) { sendNotFound(reply, "task"); return; }
			if (/[^a-zA-Z0-9._-]/.test(fileName) || fileName.includes("..")) {
				reply.code(400).send({ error: "invalid file name" }); return;
			}
			try {
				const content = await workspace.readAttemptFile(runId, taskId, attemptId, fileName);
				if (content === null) { sendNotFound(reply, "file"); return; }
				reply.type("text/plain; charset=utf-8").send(content);
			} catch {
				reply.code(404).send({ error: "file not found" });
			}
		});
}
