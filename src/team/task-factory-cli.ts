import { readFile } from "node:fs/promises";
import { loadAgentProfilesSync } from "../agent/agent-profile-catalog.js";
import { buildTeamTaskFactoryPayload, type TeamTaskFactorySpec } from "./task-factory.js";

interface CliOptions {
	specPath?: string;
	baseUrl: string;
	apply: boolean;
	help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		baseUrl: process.env.TEAM_TASK_FACTORY_BASE_URL ?? "http://127.0.0.1:8888",
		apply: false,
		help: false,
	};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			options.help = true;
		} else if (arg === "--spec") {
			options.specPath = argv[++i];
		} else if (arg === "--base-url") {
			options.baseUrl = argv[++i] ?? options.baseUrl;
		} else if (arg === "--apply") {
			options.apply = true;
		} else {
			throw new Error(`unknown argument: ${arg}`);
		}
	}
	return options;
}

function printHelp(): void {
	console.log(`Usage:
  npm run team:task-factory -- --spec spec.json
  npm run team:task-factory -- --spec spec.json --apply

Options:
  --spec <file>       JSON file containing a factory spec.
  --apply             POST the generated payload to /v1/team/tasks.
  --base-url <url>    Backend base URL. Defaults to http://127.0.0.1:8888.
  --help              Show this help.

Factory kinds:
  normal
  worklist-producer
  split-task
`);
}

async function readSpec(path: string | undefined): Promise<TeamTaskFactorySpec> {
	if (!path) throw new Error("--spec is required");
	const raw = (await readFile(path, "utf8")).replace(/^\uFEFF/, "");
	return JSON.parse(raw) as TeamTaskFactorySpec;
}

async function postTask(baseUrl: string, payload: unknown): Promise<unknown> {
	const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/team/tasks`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok) {
		const message = typeof (body as { error?: unknown }).error === "string"
			? (body as { error: string }).error
			: `request failed with status ${response.status}`;
		throw new Error(message);
	}
	return body;
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		printHelp();
		return;
	}
	const spec = await readSpec(options.specPath);
	const agentIds = loadAgentProfilesSync(process.cwd()).map(profile => profile.agentId);
	const result = buildTeamTaskFactoryPayload(spec, { availableAgentIds: new Set(agentIds) });
	if (!options.apply) {
		console.log(JSON.stringify({ mode: "preview", ...result }, null, 2));
		return;
	}
	const created = await postTask(options.baseUrl, result.payload);
	console.log(JSON.stringify({ mode: "apply", warnings: result.warnings, response: created }, null, 2));
}

main().catch((error) => {
	console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, null, 2));
	process.exitCode = 1;
});
