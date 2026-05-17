/**
 * Team Browser Binding Smoke Script
 *
 * Verifies a real Team run uses the AgentProfile browser bindings
 * selected by a TeamUnit through the public HTTP Team APIs.
 *
 * Usage:
 *   node scripts/team-browser-binding-smoke.mjs \
 *     --worker-profile smoke-worker \
 *     --checker-profile smoke-checker \
 *     --watcher-profile smoke-watcher \
 *     --finalizer-profile smoke-finalizer \
 *     --expect-worker-browser browser-a \
 *     --expect-checker-browser browser-b \
 *     --expect-watcher-browser browser-a \
 *     --expect-finalizer-browser browser-b
 */

// ── CLI Argument Parsing ──

/**
 * @typedef {object} SmokeConfig
 * @property {string} baseUrl
 * @property {string} workerProfile
 * @property {string} checkerProfile
 * @property {string} watcherProfile
 * @property {string} finalizerProfile
 * @property {string} expectWorkerBrowser
 * @property {string} expectCheckerBrowser
 * @property {string} expectWatcherBrowser
 * @property {string} expectFinalizerBrowser
 * @property {number} timeoutMs
 * @property {number} pollMs
 */

/**
 * @param {string[]} argv
 * @param {Record<string, string|undefined>} env
 * @returns {SmokeConfig}
 */
export function parseArgs(argv, env = {}) {
	const flag = (name) => {
		const idx = argv.indexOf("--" + name);
		if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1];
		return undefined;
	};

	const required = (cliVal, envKey, label) => {
		const v = cliVal ?? env[envKey];
		if (!v) throw new Error(`missing required input: ${label} (CLI --${label.replace(/_/g, "-")} or env ${envKey})`);
		return v;
	};

	const workerProfile = required(flag("worker-profile"), "TEAM_SMOKE_WORKER_PROFILE", "worker-profile");
	const checkerProfile = required(flag("checker-profile"), "TEAM_SMOKE_CHECKER_PROFILE", "checker-profile");
	const watcherProfile = required(flag("watcher-profile"), "TEAM_SMOKE_WATCHER_PROFILE", "watcher-profile");
	const finalizerProfile = required(flag("finalizer-profile"), "TEAM_SMOKE_FINALIZER_PROFILE", "finalizer-profile");

	const expectWorkerBrowser = required(flag("expect-worker-browser"), "TEAM_SMOKE_EXPECT_WORKER_BROWSER", "expect-worker-browser");
	const expectCheckerBrowser = required(flag("expect-checker-browser"), "TEAM_SMOKE_EXPECT_CHECKER_BROWSER", "expect-checker-browser");
	const expectWatcherBrowser = required(flag("expect-watcher-browser"), "TEAM_SMOKE_EXPECT_WATCHER_BROWSER", "expect-watcher-browser");
	const expectFinalizerBrowser = required(flag("expect-finalizer-browser"), "TEAM_SMOKE_EXPECT_FINALIZER_BROWSER", "expect-finalizer-browser");

	const baseUrl = flag("base-url") ?? env.TEAM_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

	const timeoutMs = Number(flag("timeout-ms") ?? env.TEAM_SMOKE_TIMEOUT_MS ?? "600000");
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error(`timeout-ms must be a positive number, got: ${flag("timeout-ms") ?? env.TEAM_SMOKE_TIMEOUT_MS}`);

	const pollMs = Number(flag("poll-ms") ?? env.TEAM_SMOKE_POLL_MS ?? "2000");
	if (!Number.isFinite(pollMs) || pollMs <= 0) throw new Error(`poll-ms must be a positive number, got: ${flag("poll-ms") ?? env.TEAM_SMOKE_POLL_MS}`);

	return {
		baseUrl,
		workerProfile,
		checkerProfile,
		watcherProfile,
		finalizerProfile,
		expectWorkerBrowser,
		expectCheckerBrowser,
		expectWatcherBrowser,
		expectFinalizerBrowser,
		timeoutMs,
		pollMs,
	};
}

// ── Plan Payload Builder ──

/**
 * @param {string} teamUnitId
 * @returns {object}
 */
export function buildSmokePlanPayload(teamUnitId) {
	return {
		title: "P18 Browser Binding Smoke",
		defaultTeamUnitId: teamUnitId,
		goal: { text: "Verify browser bindings are correctly injected per role" },
		tasks: [{
			id: "task_1",
			title: "Browser binding verification task",
			input: { text: "Output a summary of the current browser context" },
			acceptance: { rules: ["output includes browser context information"] },
		}],
		outputContract: { text: "Summary of browser binding verification" },
	};
}

// ── Runtime Context Validation ──

function attemptTimestamp(attempt) {
	const values = [attempt?.finishedAt, attempt?.updatedAt, attempt?.createdAt]
		.map((value) => Date.parse(String(value || "")))
		.filter((value) => Number.isFinite(value));
	return values.length ? Math.max(...values) : 0;
}

function hasRoleRuntimeContexts(attempt) {
	return Boolean(
		attempt?.worker?.some?.((entry) => entry?.runtimeContext) &&
		attempt?.checker?.some?.((entry) => entry?.runtimeContext) &&
		attempt?.watcher?.runtimeContext,
	);
}

/**
 * Pick the attempt that best represents the terminal task result.
 *
 * `listAttempts()` currently returns filesystem `readdir()` order, so callers
 * must not assume `attempts[0]` is the newest or successful attempt.
 *
 * @param {Array<object>} attempts
 * @returns {object}
 */
export function selectAttemptForRuntimeContexts(attempts) {
	if (!Array.isArray(attempts) || attempts.length === 0) {
		throw new Error("no attempts found for task_1");
	}

	const withContexts = attempts.filter(hasRoleRuntimeContexts);
	const contextPool = withContexts.length > 0 ? withContexts : attempts;
	const succeeded = contextPool.filter((attempt) => attempt?.status === "succeeded");
	const pool = succeeded.length > 0 ? succeeded : contextPool;

	return [...pool].sort((a, b) => {
		const byTime = attemptTimestamp(a) - attemptTimestamp(b);
		if (byTime !== 0) return byTime;
		return String(a?.attemptId || "").localeCompare(String(b?.attemptId || ""));
	}).at(-1);
}

/**
 * @param {object} finalRun
 * @param {Array<object>} attempts
 * @param {object} expected
 */
export function validateRuntimeContexts(finalRun, attempts, expected) {
	const attempt = selectAttemptForRuntimeContexts(attempts);

	// Worker context: selected attempt's worker array, last entry (latest revision)
	const workerEntries = attempt.worker ?? [];
	const workerCtx = workerEntries[workerEntries.length - 1]?.runtimeContext;
	if (!workerCtx) throw new Error("worker runtimeContext missing");
	if (workerCtx.requestedProfileId !== expected.workerProfile) {
		throw new Error(`worker requestedProfileId mismatch: expected ${expected.workerProfile}, got ${workerCtx.requestedProfileId}\n  observed: ${JSON.stringify(workerCtx)}`);
	}
	if (workerCtx.browserId !== expected.expectWorkerBrowser) {
		throw new Error(`worker browserId mismatch: expected ${expected.expectWorkerBrowser}, got ${workerCtx.browserId}\n  observed: ${JSON.stringify(workerCtx)}`);
	}
	if (!workerCtx.browserScope) {
		throw new Error(`worker browserScope is empty\n  observed: ${JSON.stringify(workerCtx)}`);
	}

	// Checker context: selected attempt's checker array, last entry
	const checkerEntries = attempt.checker ?? [];
	const checkerCtx = checkerEntries[checkerEntries.length - 1]?.runtimeContext;
	if (!checkerCtx) throw new Error("checker runtimeContext missing");
	if (checkerCtx.requestedProfileId !== expected.checkerProfile) {
		throw new Error(`checker requestedProfileId mismatch: expected ${expected.checkerProfile}, got ${checkerCtx.requestedProfileId}\n  observed: ${JSON.stringify(checkerCtx)}`);
	}
	if (checkerCtx.browserId !== expected.expectCheckerBrowser) {
		throw new Error(`checker browserId mismatch: expected ${expected.expectCheckerBrowser}, got ${checkerCtx.browserId}\n  observed: ${JSON.stringify(checkerCtx)}`);
	}
	if (!checkerCtx.browserScope) {
		throw new Error(`checker browserScope is empty\n  observed: ${JSON.stringify(checkerCtx)}`);
	}

	// Watcher context: selected attempt's watcher object
	const watcherCtx = attempt.watcher?.runtimeContext;
	if (!watcherCtx) throw new Error("watcher runtimeContext missing");
	if (watcherCtx.requestedProfileId !== expected.watcherProfile) {
		throw new Error(`watcher requestedProfileId mismatch: expected ${expected.watcherProfile}, got ${watcherCtx.requestedProfileId}\n  observed: ${JSON.stringify(watcherCtx)}`);
	}
	if (watcherCtx.browserId !== expected.expectWatcherBrowser) {
		throw new Error(`watcher browserId mismatch: expected ${expected.expectWatcherBrowser}, got ${watcherCtx.browserId}\n  observed: ${JSON.stringify(watcherCtx)}`);
	}
	if (!watcherCtx.browserScope) {
		throw new Error(`watcher browserScope is empty\n  observed: ${JSON.stringify(watcherCtx)}`);
	}

	// Finalizer context: from run state
	const finalizerCtx = finalRun.finalizerRuntimeContext;
	if (!finalizerCtx) throw new Error("finalizer runtimeContext missing on run state");
	if (finalizerCtx.requestedProfileId !== expected.finalizerProfile) {
		throw new Error(`finalizer requestedProfileId mismatch: expected ${expected.finalizerProfile}, got ${finalizerCtx.requestedProfileId}\n  observed: ${JSON.stringify(finalizerCtx)}`);
	}
	if (finalizerCtx.browserId !== expected.expectFinalizerBrowser) {
		throw new Error(`finalizer browserId mismatch: expected ${expected.expectFinalizerBrowser}, got ${finalizerCtx.browserId}\n  observed: ${JSON.stringify(finalizerCtx)}`);
	}
	if (!finalizerCtx.browserScope) {
		throw new Error(`finalizer browserScope is empty\n  observed: ${JSON.stringify(finalizerCtx)}`);
	}
}

// ── HTTP Helper ──

async function jsonFetch(fetchFn, method, url, body) {
	const init = { method, headers: { "Content-Type": "application/json" } };
	if (body !== undefined) init.body = JSON.stringify(body);
	const res = await fetchFn(url, init);
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`${method} ${url} returned ${res.status}: ${text.slice(0, 200)}`);
	}
	return res.json();
}

// ── Main Smoke Flow ──

/**
 * @param {SmokeConfig} config
 * @param {{ fetch?: typeof fetch }} deps
 */
export async function runSmoke(config, deps = {}) {
	const fetchFn = deps.fetch ?? globalThis.fetch;
	const base = config.baseUrl.replace(/\/$/, "");

	// 1. Create TeamUnit
	const teamUnit = await jsonFetch(fetchFn, "POST", `${base}/v1/team/team-units`, {
		title: "P18 Smoke TeamUnit",
		description: "Created by browser binding smoke script",
		workerProfileId: config.workerProfile,
		checkerProfileId: config.checkerProfile,
		watcherProfileId: config.watcherProfile,
		finalizerProfileId: config.finalizerProfile,
	});

	console.log(`[smoke] TeamUnit created: ${teamUnit.teamUnitId}`);

	// 2. Create Plan
	const plan = await jsonFetch(fetchFn, "POST", `${base}/v1/team/plans`, buildSmokePlanPayload(teamUnit.teamUnitId));
	console.log(`[smoke] Plan created: ${plan.planId}`);

	// 3. Create Run
	const run = await jsonFetch(fetchFn, "POST", `${base}/v1/team/plans/${plan.planId}/runs`, {});
	console.log(`[smoke] Run created: ${run.runId}`);

	// 4. Poll until terminal or timeout
	const terminal = new Set(["completed", "completed_with_failures", "failed", "cancelled"]);
	const deadline = Date.now() + config.timeoutMs;
	let finalRun = run;

	while (!terminal.has(finalRun.status)) {
		if (Date.now() >= deadline) {
			throw new Error(`poll timeout after ${config.timeoutMs}ms — runId: ${finalRun.runId}, status: ${finalRun.status}`);
		}
		await new Promise((r) => setTimeout(r, config.pollMs));
		finalRun = await jsonFetch(fetchFn, "GET", `${base}/v1/team/runs/${run.runId}`);
	}

	console.log(`[smoke] Run terminal: ${finalRun.runId} → ${finalRun.status}`);

	// 5. Reject failed / completed_with_failures
	if (finalRun.status === "failed" || finalRun.status === "cancelled") {
		throw new Error(`run ${finalRun.runId} ended with status: ${finalRun.status}${finalRun.lastError ? ` — ${finalRun.lastError}` : ""}`);
	}
	if (finalRun.status === "completed_with_failures") {
		throw new Error(`run ${finalRun.runId} ended with completed_with_failures${finalRun.lastError ? ` — ${finalRun.lastError}` : ""}`);
	}

	// 6. Fetch attempts for task_1
	const attemptsRes = await jsonFetch(fetchFn, "GET", `${base}/v1/team/runs/${run.runId}/tasks/task_1/attempts`);
	const attempts = attemptsRes.attempts ?? [];

	// 7. Validate runtime contexts
	validateRuntimeContexts(finalRun, attempts, config);

	// 8. Print success report
	console.log(`\n=== P18 Browser Binding Smoke PASSED ===`);
	console.log(`  runId:       ${finalRun.runId}`);
	console.log(`  status:      ${finalRun.status}`);
	console.log(`  worker:      profile=${config.workerProfile} browser=${config.expectWorkerBrowser}`);
	console.log(`  checker:     profile=${config.checkerProfile} browser=${config.expectCheckerBrowser}`);
	console.log(`  watcher:     profile=${config.watcherProfile} browser=${config.expectWatcherBrowser}`);
	console.log(`  finalizer:   profile=${config.finalizerProfile} browser=${config.expectFinalizerBrowser}`);
	console.log(`==========================================\n`);

	return { runId: finalRun.runId, status: finalRun.status };
}

// ── CLI Entry ──

const isMain = import.meta.url === new URL(process.argv[1], "file:///").href || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") ?? "__none__");
if (isMain) {
	const config = parseArgs(process.argv.slice(2), process.env);
	runSmoke(config).then(
		() => { process.exit(0); },
		(err) => {
			console.error(`\n[smoke] FAILED: ${err.message}\n`);
			process.exit(1);
		},
	);
}
