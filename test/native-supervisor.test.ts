import test from "node:test";
import assert from "node:assert/strict";
import { createNativeSupervisorPlan } from "../scripts/native-supervisor-core.mjs";

type NativeSupervisorStep = { name: string };

test("native supervisor plan initializes runtime deps before starting core processes", () => {
	const plan = createNativeSupervisorPlan({
		projectRoot: "E:\\AII\\ugk-claw-core-win",
		env: {},
	});

	assert.deepEqual(
		plan.steps.map((step: NativeSupervisorStep) => step.name),
		[
			"ugk-claw-core-win-runtime-check",
			"ugk-claw-core-win-server",
			"ugk-claw-core-win-team-console",
			"ugk-claw-core-win-team-worker",
			"ugk-claw-core-win-conn-worker",
		],
	);
	assert.equal(plan.steps[0]?.blocking, true);
	assert.match(plan.steps[0]?.args.join(" "), /run runtime:check$/);
	assert.equal(plan.steps[1]?.blocking, false);
	assert.equal(plan.steps[1]?.env.PORT, "8888");
	assert.equal(plan.steps[2]?.env.TEAM_CONSOLE_API_TARGET, "http://127.0.0.1:8888");
	assert.match(plan.steps[1]?.logFile ?? "", /logs[\\/]native[\\/]ugk-claw-core-win-server\.log$/);
	assert.match(plan.steps[2]?.logFile ?? "", /logs[\\/]native[\\/]ugk-claw-core-win-team-console\.log$/);
});
