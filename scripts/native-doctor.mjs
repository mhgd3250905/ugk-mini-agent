#!/usr/bin/env node
import { createNativeDoctorReport } from "./native-doctor-core.mjs";
import { loadNativeEnv } from "./native-env.mjs";

const env = await loadNativeEnv();
const report = await createNativeDoctorReport({ env });

console.log(`Windows Native Core doctor: ${report.ok ? "ok" : "failed"}`);
for (const check of report.checks) {
	const marker = check.ok ? "OK " : "FAIL";
	const scope = check.required ? "required" : "optional";
	console.log(`[${marker}] ${check.name} (${scope}) - ${check.message}`);
}

if (!report.ok) {
	process.exitCode = 1;
}
