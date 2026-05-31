import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { validateTeamOutput } from "../src/team/output-validator.js";
import type { TeamPlan, TeamTask } from "../src/team/types.js";

const plan: TeamPlan = {
	schemaVersion: "team/plan-1",
	planId: "plan_p26",
	title: "P26",
	defaultTeamUnitId: "team_1",
	goal: { text: "test" },
	tasks: [{ id: "scan_vendors", type: "discovery", title: "Scan vendors", input: { text: "scan" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "vendors" } }],
	outputContract: { text: "out" },
	archived: false,
	createdAt: "",
	updatedAt: "",
	runCount: 0,
};

async function setup(task: TeamTask = plan.tasks[0]!) {
	const root = await mkdtemp(join(tmpdir(), "team-output-validator-"));
	const workspace = new RunWorkspace(root);
	const state = await workspace.createRun({ ...plan, tasks: [task] }, "team_1");
	const { attemptId } = await workspace.createAttempt(state.runId, task.id);
	return { root, workspace, runId: state.runId, attemptId, task };
}

async function writeRoleFile(root: string, runId: string, attemptId: string, role: string, relativePath: string, content: string) {
	const filePath = join(root, "runs", runId, "agent-workspaces", attemptId, role, ...relativePath.split("/"));
	await mkdir(join(filePath, ".."), { recursive: true });
	await writeFile(filePath, content, "utf8");
}

test("P26: validator accepts pure discovery JSON object with stable ids", async () => {
	const { root, workspace, runId, attemptId, task } = await setup();
	try {
		const result = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "worker-output-001.md", content: JSON.stringify({ vendors: [{ id: "vultr", name: "Vultr" }] }) }],
		});
		assert.equal(result.ok, true);
		assert.equal(result.kind, "discovery");
		assert.equal(result.sourceRef, "worker-output-001.md");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("Step04: discovery validator returns parsed items for configured output key", async () => {
	const { root, workspace, runId, attemptId, task } = await setup();
	try {
		const items = [{ id: "vultr", name: "Vultr" }];
		const result = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "worker-output-001.md", content: JSON.stringify({ vendors: items }) }],
		});
		assert.equal(result.ok, true);
		assert.equal(result.kind, "discovery");
		assert.deepEqual(result.items, items);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("Step04: json_items outputCheck returns parsed items", async () => {
	const task: TeamTask = {
		id: "scan_items",
		title: "Scan items",
		input: { text: "scan" },
		acceptance: { rules: ["ok"] },
		outputCheck: { type: "json_items", outputKey: "items", requiredFields: ["slug"] },
	};
	const { root, workspace, runId, attemptId } = await setup(task);
	try {
		const items = [{ slug: "alpha", label: "Alpha" }];
		const result = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "worker-output-001.md", content: JSON.stringify({ items }) }],
		});
		assert.equal(result.ok, true);
		assert.equal(result.kind, "json_items");
		assert.deepEqual(result.items, items);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P26: validator accepts fenced discovery JSON", async () => {
	const { root, workspace, runId, attemptId, task } = await setup();
	try {
		const result = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "worker-output-001.md", content: "```json\n{\"vendors\":[{\"id\":\"dmit\"}]}\n```" }],
		});
		assert.equal(result.ok, true);
		assert.equal(result.checks.every(check => check.ok), true);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P26: validator resolves worker role workspace referenced JSON", async () => {
	const { root, workspace, runId, attemptId, task } = await setup();
	try {
		await writeRoleFile(root, runId, attemptId, "worker", "hk-cloud-server-scan.json", JSON.stringify({ vendors: [{ id: "vultr", name: "Vultr" }] }));
		const result = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "accepted-result.md", content: "验收通过：`worker/hk-cloud-server-scan.json`" }],
		});
		assert.equal(result.ok, true);
		assert.equal(result.sourceRef, "worker/hk-cloud-server-scan.json");
		assert.match(result.normalizedRef ?? "", /agent-workspaces/);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P26: validator trims Chinese prose after worker role workspace reference", async () => {
	const { root, workspace, runId, attemptId, task } = await setup();
	try {
		await writeRoleFile(root, runId, attemptId, "worker", "hk-cloud-server-scan.json", JSON.stringify({ vendors: [{ id: "dmit", name: "DMIT" }] }));
		const result = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "accepted-result.md", content: "验收通过。JSON 数据文件：worker/hk-cloud-server-scan.json（10 家厂商完整结构化数据）" }],
		});
		assert.equal(result.ok, true);
		assert.equal(result.sourceRef, "worker/hk-cloud-server-scan.json");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P26: validator rejects missing outputKey array and missing item ids", async () => {
	const { root, workspace, runId, attemptId, task } = await setup();
	try {
		const notArray = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "worker-output-001.md", content: JSON.stringify({ vendors: {} }) }],
		});
		assert.equal(notArray.ok, false);
		assert.ok(notArray.checks.some(check => check.name === "outputKey_array" && !check.ok));

		const missingId = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "worker-output-001.md", content: JSON.stringify({ vendors: [{ name: "missing" }] }) }],
		});
		assert.equal(missingId.ok, false);
		assert.ok(missingId.checks.some(check => check.name === "item_stable_id" && !check.ok));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P26: validator rejects unsafe referenced files", async () => {
	const { root, workspace, runId, attemptId, task } = await setup();
	try {
		const traversal = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "worker-output-001.md", content: "`worker/../../.env`" }],
		});
		assert.equal(traversal.ok, false);
		assert.ok(traversal.checks.some(check => check.name === "referenced_file_safe" && !check.ok));

		const absolute = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "worker-output-001.md", content: "`/etc/passwd`" }],
		});
		assert.equal(absolute.ok, false);
		assert.ok(absolute.checks.some(check => check.name === "referenced_file_safe" && !check.ok));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P26: validator reports missing referenced files clearly", async () => {
	const { root, workspace, runId, attemptId, task } = await setup();
	try {
		const result = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "worker-output-001.md", content: "`worker/missing-vendors.json`" }],
		});
		assert.equal(result.ok, false);
		assert.ok(result.checks.some(check => check.name === "referenced_file_exists" && !check.ok && check.path === "worker/missing-vendors.json"));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P26: validator validates html_fragment outputCheck", async () => {
	const task: TeamTask = {
		id: "render_card",
		title: "Render card",
		input: { text: "render" },
		acceptance: { rules: ["ok"] },
		outputCheck: { type: "html_fragment", requiredSubstrings: ["vendor-card", "data-vendor-id"], forbiddenTags: ["html", "body"] },
	};
	const { root, workspace, runId, attemptId } = await setup(task);
	try {
		const ok = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "worker-output-001.md", content: "```html\n<div class=\"vendor-card\" data-vendor-id=\"vultr\"></div>\n```" }],
		});
		assert.equal(ok.ok, true);

		const missingMarker = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "worker-output-001.md", content: "```html\n<div class=\"card\"></div>\n```" }],
		});
		assert.equal(missingMarker.ok, false);
		assert.ok(missingMarker.checks.some(check => check.name === "required_substring" && !check.ok));

		const fullPage = await validateTeamOutput({
			workspace,
			runId,
			task,
			attemptId,
			contents: [{ ref: "worker-output-001.md", content: "<html><body><div class=\"vendor-card\" data-vendor-id=\"vultr\"></div></body></html>" }],
		});
		assert.equal(fullPage.ok, false);
		assert.ok(fullPage.checks.some(check => check.name === "forbidden_tag" && !check.ok));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P26: validator validates file_exists outputCheck in role workspace", async () => {
	const task: TeamTask = {
		id: "write_report",
		title: "Write report",
		input: { text: "write" },
		acceptance: { rules: ["ok"] },
		outputCheck: { type: "file_exists", path: "worker/report.html" },
	};
	const { root, workspace, runId, attemptId } = await setup(task);
	try {
		await writeRoleFile(root, runId, attemptId, "worker", "report.html", "<div>ok</div>");
		const ok = await validateTeamOutput({ workspace, runId, task, attemptId });
		assert.equal(ok.ok, true);
		assert.equal(ok.sourceRef, "worker/report.html");

		const unsafeTask = { ...task, outputCheck: { type: "file_exists" as const, path: "worker/../../.env" } };
		const unsafe = await validateTeamOutput({ workspace, runId, task: unsafeTask, attemptId });
		assert.equal(unsafe.ok, false);
		assert.ok(unsafe.checks.some(check => check.name === "referenced_file_safe" && !check.ok));
	} finally {
		await rm(root, { recursive: true });
	}
});
