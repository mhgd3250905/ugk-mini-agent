import assert from "node:assert/strict";
import test from "node:test";
import {
	createAgentRunScope,
	runWithScopedAgentEnvironment,
} from "../src/agent/agent-run-scope.js";
import { getCurrentAgentScope } from "../src/agent/agent-scope-context.js";

const SCOPE_ENV_KEYS = ["CLAUDE_AGENT_ID", "CLAUDE_HOOK_AGENT_ID", "agent_id"] as const;

test("createAgentRunScope sanitizes conversation ids for scoped agent runs", () => {
	assert.equal(createAgentRunScope("manual:hello/world"), "manual-hello-world");
	assert.equal(createAgentRunScope("manual:hello/world", "search"), "search-manual-hello-world");
	assert.equal(createAgentRunScope("!!!"), "conversation");
});

test("runWithScopedAgentEnvironment exposes scope without mutating process env", async () => {
	const previous = snapshotScopeEnv();
	process.env.CLAUDE_AGENT_ID = "old-agent";
	delete process.env.CLAUDE_HOOK_AGENT_ID;
	process.env.agent_id = "old-lower";

	try {
		const observed = await runWithScopedAgentEnvironment("manual-scope", async () => ({
			scope: getCurrentAgentScope()?.scope,
			CLAUDE_AGENT_ID: process.env.CLAUDE_AGENT_ID,
			CLAUDE_HOOK_AGENT_ID: process.env.CLAUDE_HOOK_AGENT_ID,
			agent_id: process.env.agent_id,
		}));

		assert.deepEqual(observed, {
			scope: "manual-scope",
			CLAUDE_AGENT_ID: "old-agent",
			CLAUDE_HOOK_AGENT_ID: undefined,
			agent_id: "old-lower",
		});
		assert.equal(process.env.CLAUDE_AGENT_ID, "old-agent");
		assert.equal(process.env.CLAUDE_HOOK_AGENT_ID, undefined);
		assert.equal(process.env.agent_id, "old-lower");
	} finally {
		restoreScopeEnv(previous);
	}
});

test("runWithScopedAgentEnvironment restores scope environment after errors", async () => {
	const previous = snapshotScopeEnv();
	for (const key of SCOPE_ENV_KEYS) {
		delete process.env[key];
	}

	try {
		await assert.rejects(
			runWithScopedAgentEnvironment("manual-error", async () => {
				assert.equal(getCurrentAgentScope()?.scope, "manual-error");
				assert.equal(process.env.CLAUDE_AGENT_ID, undefined);
				throw new Error("boom");
			}),
			/boom/,
		);
		for (const key of SCOPE_ENV_KEYS) {
			assert.equal(process.env[key], undefined);
		}
	} finally {
		restoreScopeEnv(previous);
	}
});

test("runWithScopedAgentEnvironment keeps async-local scopes isolated", async () => {
	const previous = snapshotScopeEnv();
	for (const key of SCOPE_ENV_KEYS) {
		delete process.env[key];
	}

	try {
		let releaseA!: () => void;
		const waitA = new Promise<void>((resolve) => {
			releaseA = resolve;
		});
		const firstRun = runWithScopedAgentEnvironment("scope-a", async () => {
			await waitA;
			return getCurrentAgentScope()?.scope;
		});
		const secondRun = runWithScopedAgentEnvironment("scope-b", async () => getCurrentAgentScope()?.scope);

		assert.equal(await secondRun, "scope-b");
		releaseA();
		assert.equal(await firstRun, "scope-a");
	} finally {
		restoreScopeEnv(previous);
	}
});

function snapshotScopeEnv(): Record<(typeof SCOPE_ENV_KEYS)[number], string | undefined> {
	return {
		CLAUDE_AGENT_ID: process.env.CLAUDE_AGENT_ID,
		CLAUDE_HOOK_AGENT_ID: process.env.CLAUDE_HOOK_AGENT_ID,
		agent_id: process.env.agent_id,
	};
}

function restoreScopeEnv(snapshot: Record<(typeof SCOPE_ENV_KEYS)[number], string | undefined>): void {
	for (const key of SCOPE_ENV_KEYS) {
		const value = snapshot[key];
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}
