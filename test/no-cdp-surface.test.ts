import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const forbiddenPatterns = [
	/\bCDP\b/i,
	/WEB_ACCESS_CDP/i,
	/CDP_PROXY/i,
	/browser-cleanup/i,
	/browser-binding/i,
	/browser_id/,
	/browserId/,
	/browserScope/,
	/closeBrowserTargetsForScope/,
	/defaultBrowserId/,
	/\/v1\/browsers/,
	/BrowserRegistry/,
	/playground-browser-workbench/,
	/prepareBrowserBoundBashEnvironment/,
	/validateBrowserId/,
];

const checkedFiles = [
	"README.md",
	".pi/skills/agent-profile-ops/SKILL.md",
	".pi/skills/conn-orchestrator/SKILL.md",
	"docs/agent-chat-governance-map.md",
	"docs/architecture-test-matrix.md",
	"docs/native-windows-core.md",
	"docs/playground-current.md",
	"src/server.ts",
	"src/agent/agent-profile.ts",
	"src/agent/agent-profile-catalog.ts",
	"src/agent/agent-service.ts",
	"src/agent/agent-session-factory.ts",
	"src/agent/background-agent-runner.ts",
	"src/agent/background-agent-session-factory.ts",
	"src/agent/conn-db.ts",
	"src/agent/conn-sqlite-store.ts",
	"src/agent/conn-store.ts",
	"src/routes/agent-profiles.ts",
	"src/routes/chat.ts",
	"src/routes/chat-route-parsers.ts",
	"src/routes/conn-route-parsers.ts",
	"src/routes/conns.ts",
	"src/team/agent-profile-role-runner.ts",
	"src/team/routes.ts",
	"src/ui/playground.ts",
	"src/types/api.ts",
	"apps/team-console/src/api/team-api.ts",
	"apps/team-console/src/api/team-types.ts",
	"apps/team-console/src/fixtures/team-fixtures.ts",
	"apps/team-console/src/graph/ExecutionMap.tsx",
	"apps/team-console/src/tests/app-live-data-helpers.tsx",
	"apps/team-console/src/tests/app-run-observer-file-detail.test.tsx",
	"runtime/playground/app.js",
	"runtime/playground/index.html",
	"runtime/playground-factory/app.js",
	"runtime/playground-factory/index.html",
];

test("runtime source no longer exposes the removed CDP/browser surface", async () => {
	const hits: string[] = [];
	for (const file of checkedFiles) {
		const content = await readFile(join(process.cwd(), file), "utf8");
		for (const pattern of forbiddenPatterns) {
			if (pattern.test(content)) {
				hits.push(`${file}: ${pattern}`);
			}
		}
	}
	assert.deepEqual(hits, []);
});
