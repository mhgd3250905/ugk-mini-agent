import test from "node:test";
import assert from "node:assert/strict";

// The smoke script is plain ESM (.mjs), so we import it via dynamic import.
// We cache the module to avoid repeated file I/O across tests.
let smokeModule: typeof import("../scripts/team-browser-binding-smoke.mjs") | null = null;
async function getSmoke() {
	if (!smokeModule) smokeModule = await import("../scripts/team-browser-binding-smoke.mjs");
	return smokeModule;
}

// ── Task 1: CLI validation ──

test("Task 1: missing required profile/browser input throws before any HTTP call", async () => {
	const { parseArgs } = await getSmoke();

	// No profiles at all
	assert.throws(
		() => parseArgs([], {}),
		/worker-profile/i,
	);

	// All profiles but no browser expectations
	assert.throws(
		() => parseArgs(
			["--worker-profile", "w", "--checker-profile", "c", "--watcher-profile", "wa", "--finalizer-profile", "f"],
			{},
		),
		/expect-worker-browser/i,
	);

	// Missing one browser expectation
	assert.throws(
		() => parseArgs(
			["--worker-profile", "w", "--checker-profile", "c", "--watcher-profile", "wa", "--finalizer-profile", "f",
				"--expect-worker-browser", "bw", "--expect-checker-browser", "bc", "--expect-watcher-browser", "bwa"],
			{},
		),
		/expect-finalizer-browser/i,
	);
});

test("Task 1: CLI args override env fallback", async () => {
	const { parseArgs } = await getSmoke();

	const config = parseArgs(
		["--worker-profile", "cli-w", "--checker-profile", "cli-c", "--watcher-profile", "cli-wa", "--finalizer-profile", "cli-f",
			"--expect-worker-browser", "cli-bw", "--expect-checker-browser", "cli-bc", "--expect-watcher-browser", "cli-bwa", "--expect-finalizer-browser", "cli-bf",
			"--base-url", "http://cli:9999", "--timeout-ms", "123", "--poll-ms", "456"],
		{
			TEAM_SMOKE_WORKER_PROFILE: "env-w",
			TEAM_SMOKE_CHECKER_PROFILE: "env-c",
			TEAM_SMOKE_WATCHER_PROFILE: "env-wa",
			TEAM_SMOKE_FINALIZER_PROFILE: "env-f",
			TEAM_SMOKE_EXPECT_WORKER_BROWSER: "env-bw",
			TEAM_SMOKE_EXPECT_CHECKER_BROWSER: "env-bc",
			TEAM_SMOKE_EXPECT_WATCHER_BROWSER: "env-bwa",
			TEAM_SMOKE_EXPECT_FINALIZER_BROWSER: "env-bf",
		},
	);

	assert.equal(config.workerProfile, "cli-w");
	assert.equal(config.checkerProfile, "cli-c");
	assert.equal(config.watcherProfile, "cli-wa");
	assert.equal(config.finalizerProfile, "cli-f");
	assert.equal(config.expectWorkerBrowser, "cli-bw");
	assert.equal(config.expectCheckerBrowser, "cli-bc");
	assert.equal(config.expectWatcherBrowser, "cli-bwa");
	assert.equal(config.expectFinalizerBrowser, "cli-bf");
	assert.equal(config.baseUrl, "http://cli:9999");
	assert.equal(config.timeoutMs, 123);
	assert.equal(config.pollMs, 456);
});

test("Task 1: env fallback is used when CLI args are absent", async () => {
	const { parseArgs } = await getSmoke();

	const config = parseArgs([], {
		TEAM_SMOKE_WORKER_PROFILE: "env-w",
		TEAM_SMOKE_CHECKER_PROFILE: "env-c",
		TEAM_SMOKE_WATCHER_PROFILE: "env-wa",
		TEAM_SMOKE_FINALIZER_PROFILE: "env-f",
		TEAM_SMOKE_EXPECT_WORKER_BROWSER: "env-bw",
		TEAM_SMOKE_EXPECT_CHECKER_BROWSER: "env-bc",
		TEAM_SMOKE_EXPECT_WATCHER_BROWSER: "env-bwa",
		TEAM_SMOKE_EXPECT_FINALIZER_BROWSER: "env-bf",
		TEAM_SMOKE_BASE_URL: "http://env:8888",
	});

	assert.equal(config.workerProfile, "env-w");
	assert.equal(config.expectWorkerBrowser, "env-bw");
	assert.equal(config.baseUrl, "http://env:8888");
});

test("Task 1: invalid timeout is rejected", async () => {
	const { parseArgs } = await getSmoke();

	assert.throws(
		() => parseArgs(
			["--worker-profile", "w", "--checker-profile", "c", "--watcher-profile", "wa", "--finalizer-profile", "f",
				"--expect-worker-browser", "a", "--expect-checker-browser", "b", "--expect-watcher-browser", "c", "--expect-finalizer-browser", "d",
				"--timeout-ms", "0"],
			{},
		),
		/timeout/i,
	);
});

test("Task 1: invalid poll is rejected", async () => {
	const { parseArgs } = await getSmoke();

	assert.throws(
		() => parseArgs(
			["--worker-profile", "w", "--checker-profile", "c", "--watcher-profile", "wa", "--finalizer-profile", "f",
				"--expect-worker-browser", "a", "--expect-checker-browser", "b", "--expect-watcher-browser", "c", "--expect-finalizer-browser", "d",
				"--poll-ms", "-1"],
			{},
		),
		/poll/i,
	);
});

test("Task 1: buildSmokePlanPayload returns valid plan structure", async () => {
	const { buildSmokePlanPayload } = await getSmoke();

	const payload = buildSmokePlanPayload("team_unit_abc");

	assert.equal(payload.defaultTeamUnitId, "team_unit_abc");
	assert.ok(payload.tasks.length >= 1);
	assert.ok(payload.goal);
	assert.ok(payload.outputContract);
});

// ── Task 2: HTTP Smoke Flow ──

test("Task 2: happy path calls endpoints in correct order and exits success", async () => {
	const { runSmoke } = await getSmoke();

	const calls: Array<{ method: string; path: string; body?: string | null }> = [];
	const teamUnitId = "tu_smoke_1";
	const planId = "plan_smoke_1";
	const runId = "run_smoke_1";

	const mockFetch = async (url: string, init?: RequestInit) => {
		const parsed = new URL(url);
		calls.push({ method: init?.method ?? "GET", path: parsed.pathname, body: init?.body?.toString() });

		if (parsed.pathname === "/v1/team/team-units" && init?.method === "POST") {
			return new Response(JSON.stringify({
				teamUnitId,
				title: "smoke",
				workerProfileId: "w",
				checkerProfileId: "c",
				watcherProfileId: "wa",
				finalizerProfileId: "f",
			}), { status: 201 });
		}

		if (parsed.pathname === "/v1/team/plans" && init?.method === "POST") {
			return new Response(JSON.stringify({
				planId,
				title: "smoke plan",
				tasks: [{ id: "task_1", title: "smoke task", input: { text: "do" }, acceptance: { rules: ["ok"] } }],
				defaultTeamUnitId: teamUnitId,
			}), { status: 201 });
		}

		if (parsed.pathname === `/v1/team/plans/${planId}/runs` && init?.method === "POST") {
			return new Response(JSON.stringify({
				runId,
				status: "queued",
			}), { status: 201 });
		}

		if (parsed.pathname === `/v1/team/runs/${runId}` && init?.method !== "POST") {
			return new Response(JSON.stringify({
				runId,
				status: "completed",
				finalizerRuntimeContext: {
					requestedProfileId: "f",
					resolvedProfileId: "f",
					browserId: "bf",
					browserScope: "team:run_smoke_1:finalizer",
				},
			}), { status: 200 });
		}

		if (parsed.pathname === `/v1/team/runs/${runId}/tasks/task_1/attempts`) {
			return new Response(JSON.stringify({
				attempts: [{
					attemptId: "att_1",
					worker: [{ outputRef: "w.md", outputIndex: 1, runtimeContext: { requestedProfileId: "w", resolvedProfileId: "w", browserId: "bw", browserScope: "team:run_smoke_1:worker" } }],
					checker: [{ verdict: "pass", reason: "ok", runtimeContext: { requestedProfileId: "c", resolvedProfileId: "c", browserId: "bc", browserScope: "team:run_smoke_1:checker" } }],
					watcher: { decision: "accept_task", reason: "ok", runtimeContext: { requestedProfileId: "wa", resolvedProfileId: "wa", browserId: "bwa", browserScope: "team:run_smoke_1:watcher" } },
				}],
			}), { status: 200 });
		}

		return new Response("not found", { status: 404 });
	};

	await runSmoke({
		baseUrl: "http://test",
		workerProfile: "w",
		checkerProfile: "c",
		watcherProfile: "wa",
		finalizerProfile: "f",
		expectWorkerBrowser: "bw",
		expectCheckerBrowser: "bc",
		expectWatcherBrowser: "bwa",
		expectFinalizerBrowser: "bf",
		timeoutMs: 5000,
		pollMs: 100,
	}, { fetch: mockFetch as typeof fetch });

	// Verify call order: team-unit → plan → run → poll → attempts
	assert.ok(calls.length >= 5);
	assert.equal(calls[0]!.method, "POST");
	assert.ok(calls[0]!.path.endsWith("/team-units"));
	assert.equal(calls[1]!.method, "POST");
	assert.ok(calls[1]!.path.endsWith("/plans"));
	assert.equal(calls[2]!.method, "POST");
	assert.ok(calls[2]!.path.includes("/runs"));
	assert.equal(calls[2]!.body, "{}");
});

test("Task 2: HTTP 400 from create endpoint produces a clear error", async () => {
	const { runSmoke } = await getSmoke();

	const mockFetch = async (_url: string, init?: RequestInit) => {
		if (init?.method === "POST") {
			return new Response(JSON.stringify({ error: "bad request" }), { status: 400 });
		}
		return new Response("not found", { status: 404 });
	};

	await assert.rejects(
		() => runSmoke({
			baseUrl: "http://test",
			workerProfile: "w",
			checkerProfile: "c",
			watcherProfile: "wa",
			finalizerProfile: "f",
			expectWorkerBrowser: "bw",
			expectCheckerBrowser: "bc",
			expectWatcherBrowser: "bwa",
			expectFinalizerBrowser: "bf",
			timeoutMs: 5000,
			pollMs: 100,
		}, { fetch: mockFetch as typeof fetch }),
		/400/,
	);
});

test("Task 2: poll timeout fails with runId/status context", async () => {
	const { runSmoke } = await getSmoke();

	let pollCount = 0;
	const mockFetch = async (url: string, init?: RequestInit) => {
		const parsed = new URL(url);

		if (parsed.pathname === "/v1/team/team-units" && init?.method === "POST") {
			return new Response(JSON.stringify({ teamUnitId: "tu_t", workerProfileId: "w", checkerProfileId: "c", watcherProfileId: "wa", finalizerProfileId: "f" }), { status: 201 });
		}
		if (parsed.pathname === "/v1/team/plans" && init?.method === "POST") {
			return new Response(JSON.stringify({ planId: "plan_t", tasks: [{ id: "task_1", title: "t", input: { text: "t" }, acceptance: { rules: ["ok"] } }] }), { status: 201 });
		}
		if (parsed.pathname === "/v1/team/plans/plan_t/runs" && init?.method === "POST") {
			return new Response(JSON.stringify({ runId: "run_timeout", status: "queued" }), { status: 201 });
		}
		if (parsed.pathname === "/v1/team/runs/run_timeout") {
			pollCount++;
			return new Response(JSON.stringify({ runId: "run_timeout", status: "running" }), { status: 200 });
		}
		return new Response("not found", { status: 404 });
	};

	await assert.rejects(
		() => runSmoke({
			baseUrl: "http://test",
			workerProfile: "w",
			checkerProfile: "c",
			watcherProfile: "wa",
			finalizerProfile: "f",
			expectWorkerBrowser: "bw",
			expectCheckerBrowser: "bc",
			expectWatcherBrowser: "bwa",
			expectFinalizerBrowser: "bf",
			timeoutMs: 200,
			pollMs: 50,
		}, { fetch: mockFetch as typeof fetch }),
		/run_timeout/,
	);

	assert.ok(pollCount >= 2, "should have polled at least twice before timeout");
});

test("Task 2: terminal failed status fails by default", async () => {
	const { runSmoke } = await getSmoke();

	const mockFetch = async (url: string, init?: RequestInit) => {
		const parsed = new URL(url);

		if (parsed.pathname === "/v1/team/team-units" && init?.method === "POST") {
			return new Response(JSON.stringify({ teamUnitId: "tu_f" }), { status: 201 });
		}
		if (parsed.pathname === "/v1/team/plans" && init?.method === "POST") {
			return new Response(JSON.stringify({ planId: "plan_f", tasks: [{ id: "task_1" }] }), { status: 201 });
		}
		if (parsed.pathname === "/v1/team/plans/plan_f/runs" && init?.method === "POST") {
			return new Response(JSON.stringify({ runId: "run_fail", status: "queued" }), { status: 201 });
		}
		if (parsed.pathname === "/v1/team/runs/run_fail") {
			return new Response(JSON.stringify({ runId: "run_fail", status: "failed", lastError: "worker crashed" }), { status: 200 });
		}
		return new Response("not found", { status: 404 });
	};

	await assert.rejects(
		() => runSmoke({
			baseUrl: "http://test",
			workerProfile: "w",
			checkerProfile: "c",
			watcherProfile: "wa",
			finalizerProfile: "f",
			expectWorkerBrowser: "bw",
			expectCheckerBrowser: "bc",
			expectWatcherBrowser: "bwa",
			expectFinalizerBrowser: "bf",
			timeoutMs: 5000,
			pollMs: 100,
		}, { fetch: mockFetch as typeof fetch }),
		/failed/,
	);
});

test("Task 2: completed_with_failures status fails by default", async () => {
	const { runSmoke } = await getSmoke();

	const mockFetch = async (url: string, init?: RequestInit) => {
		const parsed = new URL(url);

		if (parsed.pathname === "/v1/team/team-units" && init?.method === "POST") {
			return new Response(JSON.stringify({ teamUnitId: "tu_cwf" }), { status: 201 });
		}
		if (parsed.pathname === "/v1/team/plans" && init?.method === "POST") {
			return new Response(JSON.stringify({ planId: "plan_cwf", tasks: [{ id: "task_1" }] }), { status: 201 });
		}
		if (parsed.pathname === "/v1/team/plans/plan_cwf/runs" && init?.method === "POST") {
			return new Response(JSON.stringify({ runId: "run_cwf", status: "queued" }), { status: 201 });
		}
		if (parsed.pathname === "/v1/team/runs/run_cwf") {
			return new Response(JSON.stringify({ runId: "run_cwf", status: "completed_with_failures" }), { status: 200 });
		}
		return new Response("not found", { status: 404 });
	};

	await assert.rejects(
		() => runSmoke({
			baseUrl: "http://test",
			workerProfile: "w",
			checkerProfile: "c",
			watcherProfile: "wa",
			finalizerProfile: "f",
			expectWorkerBrowser: "bw",
			expectCheckerBrowser: "bc",
			expectWatcherBrowser: "bwa",
			expectFinalizerBrowser: "bf",
			timeoutMs: 5000,
			pollMs: 100,
		}, { fetch: mockFetch as typeof fetch }),
		/completed_with_failures/,
	);
});

// ── Task 3: Runtime Context Assertions ──

test("Task 3: mismatched worker browser fails", async () => {
	const { validateRuntimeContexts } = await getSmoke();

	assert.throws(
		() => validateRuntimeContexts(
			{
				status: "completed",
				runId: "run_mismatch",
				finalizerRuntimeContext: {
					requestedProfileId: "f", resolvedProfileId: "f",
					browserId: "bf", browserScope: "team:run:finalizer",
				},
			},
			[{
				attemptId: "att_1",
				worker: [{ runtimeContext: { requestedProfileId: "w", resolvedProfileId: "w", browserId: "WRONG", browserScope: "team:run:worker" } }],
				checker: [{ runtimeContext: { requestedProfileId: "c", resolvedProfileId: "c", browserId: "bc", browserScope: "team:run:checker" } }],
				watcher: { runtimeContext: { requestedProfileId: "wa", resolvedProfileId: "wa", browserId: "bwa", browserScope: "team:run:watcher" } },
			}],
			{
				workerProfile: "w", checkerProfile: "c", watcherProfile: "wa", finalizerProfile: "f",
				expectWorkerBrowser: "bw", expectCheckerBrowser: "bc", expectWatcherBrowser: "bwa", expectFinalizerBrowser: "bf",
			},
		),
		/worker.*browserId/i,
	);
});

test("Task 3: missing checker runtime context fails", async () => {
	const { validateRuntimeContexts } = await getSmoke();

	assert.throws(
		() => validateRuntimeContexts(
			{
				status: "completed",
				runId: "run_no_checker",
				finalizerRuntimeContext: {
					requestedProfileId: "f", resolvedProfileId: "f",
					browserId: "bf", browserScope: "team:run:finalizer",
				},
			},
			[{
				attemptId: "att_1",
				worker: [{ runtimeContext: { requestedProfileId: "w", resolvedProfileId: "w", browserId: "bw", browserScope: "team:run:worker" } }],
				checker: [{ runtimeContext: undefined }],
				watcher: { runtimeContext: { requestedProfileId: "wa", resolvedProfileId: "wa", browserId: "bwa", browserScope: "team:run:watcher" } },
			}],
			{
				workerProfile: "w", checkerProfile: "c", watcherProfile: "wa", finalizerProfile: "f",
				expectWorkerBrowser: "bw", expectCheckerBrowser: "bc", expectWatcherBrowser: "bwa", expectFinalizerBrowser: "bf",
			},
		),
		/checker.*runtimeContext/i,
	);
});

test("Task 3: missing finalizer runtime context fails", async () => {
	const { validateRuntimeContexts } = await getSmoke();

	assert.throws(
		() => validateRuntimeContexts(
			{
				status: "completed",
				runId: "run_no_finalizer",
				finalizerRuntimeContext: null,
			},
			[{
				attemptId: "att_1",
				worker: [{ runtimeContext: { requestedProfileId: "w", resolvedProfileId: "w", browserId: "bw", browserScope: "team:run:worker" } }],
				checker: [{ runtimeContext: { requestedProfileId: "c", resolvedProfileId: "c", browserId: "bc", browserScope: "team:run:checker" } }],
				watcher: { runtimeContext: { requestedProfileId: "wa", resolvedProfileId: "wa", browserId: "bwa", browserScope: "team:run:watcher" } },
			}],
			{
				workerProfile: "w", checkerProfile: "c", watcherProfile: "wa", finalizerProfile: "f",
				expectWorkerBrowser: "bw", expectCheckerBrowser: "bc", expectWatcherBrowser: "bwa", expectFinalizerBrowser: "bf",
			},
		),
		/finalizer.*runtimeContext/i,
	);
});

test("Task 3: wrong requestedProfileId fails even if browserId matches", async () => {
	const { validateRuntimeContexts } = await getSmoke();

	assert.throws(
		() => validateRuntimeContexts(
			{
				status: "completed",
				runId: "run_wrong_profile",
				finalizerRuntimeContext: {
					requestedProfileId: "f", resolvedProfileId: "f",
					browserId: "bf", browserScope: "team:run:finalizer",
				},
			},
			[{
				attemptId: "att_1",
				worker: [{ runtimeContext: { requestedProfileId: "WRONG", resolvedProfileId: "w", browserId: "bw", browserScope: "team:run:worker" } }],
				checker: [{ runtimeContext: { requestedProfileId: "c", resolvedProfileId: "c", browserId: "bc", browserScope: "team:run:checker" } }],
				watcher: { runtimeContext: { requestedProfileId: "wa", resolvedProfileId: "wa", browserId: "bwa", browserScope: "team:run:watcher" } },
			}],
			{
				workerProfile: "w", checkerProfile: "c", watcherProfile: "wa", finalizerProfile: "f",
				expectWorkerBrowser: "bw", expectCheckerBrowser: "bc", expectWatcherBrowser: "bwa", expectFinalizerBrowser: "bf",
			},
		),
		/worker.*requestedProfileId/i,
	);
});

test("Task 3: validation chooses succeeded attempt over earlier interrupted attempt", async () => {
	const { validateRuntimeContexts } = await getSmoke();

	// Should not throw. The first attempt is an earlier watcher revision and
	// deliberately contains wrong/missing contexts; the terminal attempt wins.
	validateRuntimeContexts(
		{
			status: "completed",
			runId: "run_multi_attempt",
			finalizerRuntimeContext: {
				requestedProfileId: "f", resolvedProfileId: "f",
				browserId: "bf", browserScope: "team:run:finalizer",
			},
		},
		[
			{
				attemptId: "attempt_old",
				status: "interrupted",
				updatedAt: "2026-05-17T00:00:00.000Z",
				worker: [{ runtimeContext: { requestedProfileId: "WRONG", resolvedProfileId: "w", browserId: "WRONG", browserScope: "team:run:worker-old" } }],
				checker: [],
				watcher: null,
			},
			{
				attemptId: "attempt_new",
				status: "succeeded",
				updatedAt: "2026-05-17T00:01:00.000Z",
				worker: [{ runtimeContext: { requestedProfileId: "w", resolvedProfileId: "w", browserId: "bw", browserScope: "team:run:worker" } }],
				checker: [{ runtimeContext: { requestedProfileId: "c", resolvedProfileId: "c", browserId: "bc", browserScope: "team:run:checker" } }],
				watcher: { runtimeContext: { requestedProfileId: "wa", resolvedProfileId: "wa", browserId: "bwa", browserScope: "team:run:watcher" } },
			},
		],
		{
			workerProfile: "w", checkerProfile: "c", watcherProfile: "wa", finalizerProfile: "f",
			expectWorkerBrowser: "bw", expectCheckerBrowser: "bc", expectWatcherBrowser: "bwa", expectFinalizerBrowser: "bf",
		},
	);
});

test("Task 3: all correct contexts pass validation", async () => {
	const { validateRuntimeContexts } = await getSmoke();

	// Should not throw
	validateRuntimeContexts(
		{
			status: "completed",
			runId: "run_ok",
			finalizerRuntimeContext: {
				requestedProfileId: "f", resolvedProfileId: "f",
				browserId: "bf", browserScope: "team:run:finalizer",
			},
		},
		[{
			attemptId: "att_1",
			worker: [{ runtimeContext: { requestedProfileId: "w", resolvedProfileId: "w", browserId: "bw", browserScope: "team:run:worker" } }],
			checker: [{ runtimeContext: { requestedProfileId: "c", resolvedProfileId: "c", browserId: "bc", browserScope: "team:run:checker" } }],
			watcher: { runtimeContext: { requestedProfileId: "wa", resolvedProfileId: "wa", browserId: "bwa", browserScope: "team:run:watcher" } },
		}],
		{
			workerProfile: "w", checkerProfile: "c", watcherProfile: "wa", finalizerProfile: "f",
			expectWorkerBrowser: "bw", expectCheckerBrowser: "bc", expectWatcherBrowser: "bwa", expectFinalizerBrowser: "bf",
		},
	);
});
