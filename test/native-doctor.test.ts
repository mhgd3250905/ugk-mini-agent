import test from "node:test";
import assert from "node:assert/strict";
import { createNativeDoctorReport } from "../scripts/native-doctor-core.mjs";

const projectRoot = "E:\\AII\\ugk-claw-core-win";
type NativeCheck = { name: string; ok: boolean; message: string; required: boolean };

test("native doctor checks the Windows Core local prerequisites", async () => {
	const report = await createNativeDoctorReport({
		projectRoot,
		nodeVersion: "v24.15.0",
		env: {},
		fileExists: async (path: string) =>
			path.endsWith("node_modules") ||
			path.endsWith("apps\\team-console\\node_modules") ||
			path.endsWith("runtime\\skills-user") ||
			path.endsWith("Git\\bin\\bash.exe") ||
			path.endsWith("python.exe"),
		findExecutable: async (name: string) => {
			if (name === "bash") {
				return "C:\\Program Files\\Git\\bin\\bash.exe";
			}
			if (name === "python") {
				return "C:\\Python312\\python.exe";
			}
			return undefined;
		},
		isPortAvailable: async () => true,
	});

	assert.equal(report.ok, true);
	assert.deepEqual(
		report.checks.filter((check: NativeCheck) => check.required).map((check: NativeCheck) => check.name),
		[
			"Node.js 22+",
			"Git Bash",
			"Python",
			"root dependencies",
			"Team Console dependencies",
			"user skills directory",
			"server port 8888",
			"Team Console port 9999",
		],
	);
	assert.deepEqual(report.checks.filter((check: NativeCheck) => !check.required), []);
});

test("native doctor rejects Windows subsystem bash shims", async () => {
	const report = await createNativeDoctorReport({
		projectRoot,
		nodeVersion: "v24.15.0",
		env: {},
		fileExists: async (path: string) =>
			path.endsWith("node_modules") ||
			path.endsWith("apps\\team-console\\node_modules") ||
			path.endsWith("runtime\\skills-user"),
		findExecutable: async (name: string) => (name === "bash" ? "C:\\Windows\\System32\\bash.exe" : "C:\\Python312\\python.exe"),
		isPortAvailable: async () => true,
	});

	const gitBash = report.checks.find((check: NativeCheck) => check.name === "Git Bash");
	assert.equal(report.ok, false);
	assert.equal(gitBash?.ok, false);
	assert.equal(gitBash?.message, "Install Git for Windows and use Git\\bin\\bash.exe");
});

test("native doctor accepts Git for Windows from Program Files when bash is not on PATH", async () => {
	const report = await createNativeDoctorReport({
		projectRoot,
		nodeVersion: "v24.15.0",
		env: {},
		fileExists: async (path: string) =>
			path.endsWith("node_modules") ||
			path.endsWith("apps\\team-console\\node_modules") ||
			path.endsWith("runtime\\skills-user") ||
			path === "C:\\Program Files\\Git\\bin\\bash.exe",
		findExecutable: async (name: string) => (name === "python" ? "C:\\Python312\\python.exe" : undefined),
		isPortAvailable: async () => true,
	});

	const gitBash = report.checks.find((check: NativeCheck) => check.name === "Git Bash");
	assert.equal(report.ok, true);
	assert.equal(gitBash?.ok, true);
	assert.equal(gitBash?.message, "C:\\Program Files\\Git\\bin\\bash.exe");
});

test("native doctor accepts bundled portable Git Bash", async () => {
	const portableBash = `${projectRoot}\\.data\\tools\\git\\bin\\bash.exe`;
	const report = await createNativeDoctorReport({
		projectRoot,
		nodeVersion: "v24.15.0",
		env: {},
		fileExists: async (path: string) =>
			path.endsWith("node_modules") ||
			path.endsWith("apps\\team-console\\node_modules") ||
			path.endsWith("runtime\\skills-user") ||
			path === portableBash,
		findExecutable: async (name: string) => (name === "python" ? "C:\\Python312\\python.exe" : undefined),
		isPortAvailable: async () => true,
	});

	const gitBash = report.checks.find((check: NativeCheck) => check.name === "Git Bash");
	assert.equal(report.ok, true);
	assert.equal(gitBash?.ok, true);
	assert.equal(gitBash?.message, portableBash);
});
