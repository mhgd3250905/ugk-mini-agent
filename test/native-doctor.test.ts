import test from "node:test";
import assert from "node:assert/strict";
import { createNativeDoctorReport } from "../scripts/native-doctor-core.mjs";
import { loadDefaultNativeEnv } from "../src/native-default-env.js";

const projectRoot = "E:\\AII\\ugk-mini-agent";
type NativeCheck = { name: string; ok: boolean; message: string; required: boolean };

test("native doctor checks the Windows Core local prerequisites", async () => {
	const defaultNativeEnv = loadDefaultNativeEnv();
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
			`server port ${defaultNativeEnv.PORT}`,
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

test("native doctor resolves Git Bash next to git.exe when Git is installed outside Program Files", async () => {
	const report = await createNativeDoctorReport({
		projectRoot,
		nodeVersion: "v24.15.0",
		env: {},
		fileExists: async (path: string) =>
			path.endsWith("node_modules") ||
			path.endsWith("apps\\team-console\\node_modules") ||
			path.endsWith("runtime\\skills-user") ||
			path === "D:\\Git\\bin\\bash.exe",
		findExecutable: async (name: string) => {
			if (name === "bash") return "C:\\Windows\\System32\\bash.exe";
			if (name === "git") return "D:\\Git\\cmd\\git.exe";
			if (name === "python") return "C:\\Python312\\python.exe";
			return undefined;
		},
		isPortAvailable: async () => true,
	});

	const gitBash = report.checks.find((check: NativeCheck) => check.name === "Git Bash");
	assert.equal(report.ok, true);
	assert.equal(gitBash?.ok, true);
	assert.equal(gitBash?.message, "D:\\Git\\bin\\bash.exe");
});

test("native doctor accepts bundled portable Git Bash", async () => {
	const portableBash = "D:\\ugk-tools\\git\\bin\\bash.exe";
	const report = await createNativeDoctorReport({
		projectRoot,
		nodeVersion: "v24.15.0",
		env: {
			UGK_TOOLS_DIR: "D:\\ugk-tools",
		},
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

test("native doctor checks macOS prerequisites without requiring Git Bash", async () => {
	const report = await createNativeDoctorReport({
		projectRoot: "/Users/demo/ugk-mini-agent",
		platform: "darwin",
		nodeVersion: "v24.15.0",
		env: {
			PORT: "9999",
			PUBLIC_BASE_URL: "http://127.0.0.1:9999",
			PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
		},
		fileExists: async (path: string) =>
			path === "/bin/bash" ||
			path.endsWith("node_modules") ||
			path.endsWith("apps/team-console/node_modules") ||
			path.endsWith("runtime/skills-user"),
		findExecutable: async (name: string) => {
			if (name === "bash") return "/bin/bash";
			if (name === "python3") return "/opt/homebrew/bin/python3";
			if (name === "npm") return "/opt/homebrew/bin/npm";
			return undefined;
		},
		isPortAvailable: async () => true,
	});

	assert.equal(report.ok, true);
	assert.deepEqual(
		report.checks.filter((check: NativeCheck) => check.required).map((check: NativeCheck) => check.name),
		[
			"Node.js 22+",
			"npm",
			"Shell",
			"Python",
			"root dependencies",
			"Team Console dependencies",
			"user skills directory",
			"server port 9999",
		],
	);
	const shell = report.checks.find((check: NativeCheck) => check.name === "Shell");
	const python = report.checks.find((check: NativeCheck) => check.name === "Python");
	assert.equal(shell?.message, "/bin/bash");
	assert.equal(python?.message, "/opt/homebrew/bin/python3");
	assert.equal(report.checks.some((check: NativeCheck) => check.name === "Git Bash"), false);
});

test("native doctor checks Linux prerequisites with sh fallback", async () => {
	const report = await createNativeDoctorReport({
		projectRoot: "/home/demo/ugk-mini-agent",
		platform: "linux",
		nodeVersion: "v22.11.0",
		env: {
			PORT: "9999",
			PUBLIC_BASE_URL: "http://127.0.0.1:9999",
			PATH: "/usr/local/bin:/usr/bin:/bin",
		},
		fileExists: async (path: string) =>
			path === "/bin/sh" ||
			path.endsWith("node_modules") ||
			path.endsWith("apps/team-console/node_modules") ||
			path.endsWith("runtime/skills-user"),
		findExecutable: async (name: string) => {
			if (name === "python3") return "/usr/bin/python3";
			if (name === "npm") return "/usr/bin/npm";
			return undefined;
		},
		isPortAvailable: async () => true,
	});

	assert.equal(report.ok, true);
	const shell = report.checks.find((check: NativeCheck) => check.name === "Shell");
	const python = report.checks.find((check: NativeCheck) => check.name === "Python");
	assert.equal(shell?.message, "/bin/sh");
	assert.equal(python?.message, "/usr/bin/python3");
	assert.equal(report.checks.some((check: NativeCheck) => check.name === "Git Bash"), false);
});
