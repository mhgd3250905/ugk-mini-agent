#!/usr/bin/env node
import { createNativeDoctorReport } from "./native-doctor-core.mjs";
import { loadNativeEnv } from "./native-env.mjs";

function parseArgs(argv) {
	const result = {};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--platform") {
			result.platform = argv[++index];
			continue;
		}
		if (arg.startsWith("--platform=")) {
			result.platform = arg.slice("--platform=".length);
			continue;
		}
		throw new Error(`Unknown native doctor argument: ${arg}`);
	}
	return result;
}

const args = parseArgs(process.argv.slice(2));
const report = await createNativeDoctorReport({
	env: await loadNativeEnv(process.cwd(), process.env),
	...(args.platform ? { platform: args.platform } : {}),
});

console.log(`Native runtime doctor (${args.platform || process.platform}): ${report.ok ? "ok" : "failed"}`);
for (const check of report.checks) {
	const marker = check.ok ? "OK " : "FAIL";
	const scope = check.required ? "required" : "optional";
	console.log(`[${marker}] ${check.name} (${scope}) - ${check.message}`);
}

if (!report.ok) {
	process.exitCode = 1;
}
