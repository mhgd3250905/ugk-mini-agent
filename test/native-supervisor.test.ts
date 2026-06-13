import test from "node:test";
import assert from "node:assert/strict";
import { createNativeSupervisorPlan } from "../scripts/native-supervisor-core.mjs";
import { loadDefaultNativeEnv } from "../src/native-default-env.js";

type NativeSupervisorStep = { name: string };

test("native supervisor plan initializes runtime deps before starting core processes", () => {
	const defaultNativeEnv = loadDefaultNativeEnv();
	const plan = createNativeSupervisorPlan({
		projectRoot: "E:\\AII\\ugk-mini-agent",
		env: {
			UGK_LOG_DIR: "D:\\ugk-logs",
		},
	});

	assert.deepEqual(
		plan.steps.map((step: NativeSupervisorStep) => step.name),
		[
			"ugk-mini-agent-runtime-check",
			"ugk-mini-agent-team-console-build",
			"ugk-mini-agent-server",
			"ugk-mini-agent-team-worker",
			"ugk-mini-agent-conn-worker",
		],
	);
	assert.equal(plan.steps[0]?.blocking, true);
	assert.match(plan.steps[0]?.args.join(" "), /run runtime:check$/);
	assert.equal(plan.steps[1]?.blocking, true);
	assert.match(plan.steps[1]?.args.join(" "), /run team-console:build$/);
	assert.equal(plan.steps[2]?.blocking, false);
	assert.equal(plan.steps[2]?.env.PORT, defaultNativeEnv.PORT);
	assert.equal("TEAM_CONSOLE_API_TARGET" in (plan.steps[2]?.env ?? {}), false);
	assert.equal(plan.logDir, "D:\\ugk-logs");
	assert.match(plan.steps[1]?.logFile ?? "", /D:\\ugk-logs[\\/]ugk-mini-agent-team-console-build\.log$/);
	assert.match(plan.steps[2]?.logFile ?? "", /D:\\ugk-logs[\\/]ugk-mini-agent-server\.log$/);
});
