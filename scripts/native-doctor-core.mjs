import { access } from "node:fs/promises";
import { dirname, posix, win32, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { buildNativeRuntimeConfig } from "./native-runtime-config.mjs";

const execFileAsync = promisify(execFile);

async function defaultFileExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function defaultFindExecutable(name) {
	const command = process.platform === "win32" ? "where" : "which";
	try {
		const { stdout } = await execFileAsync(command, [name], { windowsHide: true });
		return stdout
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean);
	} catch {
		return undefined;
	}
}

function defaultIsPortAvailable(port) {
	return new Promise((resolve) => {
		const server = createServer();
		server.once("error", () => resolve(false));
		server.once("listening", () => {
			server.close(() => resolve(true));
		});
		server.listen(port, "127.0.0.1");
	});
}

function isSupportedGitBash(path) {
	const normalized = path.replace(/\//g, "\\").toLowerCase();
	return normalized.endsWith("\\git\\bin\\bash.exe") && !normalized.includes("\\windows\\system32\\") && !normalized.includes("\\windowsapps\\");
}

async function findGitBash({ toolsDir, findExecutable, fileExists }) {
	const fromPath = await findExecutable("bash");
	if (fromPath && isSupportedGitBash(fromPath)) {
		return fromPath;
	}
	const gitPath = await findExecutable("git");
	const fromGitPath = gitPath ? resolve(dirname(gitPath), "..", "bin", "bash.exe") : undefined;
	const candidates = [
		join(toolsDir, "git", "bin", "bash.exe"),
		...(fromGitPath ? [fromGitPath] : []),
		"C:\\Program Files\\Git\\bin\\bash.exe",
		"C:\\Program Files (x86)\\Git\\bin\\bash.exe",
	];
	for (const candidate of candidates) {
		if (await fileExists(candidate)) {
			return candidate;
		}
	}
	return fromPath;
}

function isNodeSupported(nodeVersion) {
	const match = nodeVersion.match(/^v?(\d+)\./);
	return Number(match?.[1] ?? 0) >= 22;
}

function check(name, ok, message, required = true) {
	return { name, ok, message, required };
}

function getPlatform(options) {
	return options.platform ?? process.platform;
}

async function findPosixShell({ findExecutable, fileExists }) {
	if (await fileExists("/bin/bash")) return "/bin/bash";
	const bashPath = await findExecutable("bash");
	if (bashPath) return bashPath;
	if (await fileExists("/bin/sh")) return "/bin/sh";
	const shPath = await findExecutable("sh");
	return shPath;
}

async function findPython({ platform, findExecutable }) {
	const candidates = platform === "win32" ? ["python", "python3"] : ["python3", "python"];
	for (const name of candidates) {
		const found = await findExecutable(name);
		if (found) return found;
	}
	return undefined;
}

function joinForPlatform(platform, ...segments) {
	return platform === "win32" ? win32.join(...segments) : posix.join(...segments);
}

export async function createNativeDoctorReport(options = {}) {
	const projectRoot = options.projectRoot ?? process.cwd();
	const env = options.env ?? process.env;
	const fileExists = options.fileExists ?? defaultFileExists;
	const findExecutable = options.findExecutable ?? defaultFindExecutable;
	const isPortAvailable = options.isPortAvailable ?? defaultIsPortAvailable;
	const config = buildNativeRuntimeConfig({ projectRoot, env });
	const nodeVersion = options.nodeVersion ?? process.version;
	const platform = getPlatform(options);

	const pythonPath = await findPython({ platform, findExecutable });
	const platformChecks = [];
	if (platform === "win32") {
		const bashPath = await findGitBash({ toolsDir: config.toolsDir, findExecutable, fileExists });
		platformChecks.push(
			check(
				"Git Bash",
				Boolean(bashPath && isSupportedGitBash(bashPath)),
				bashPath && isSupportedGitBash(bashPath) ? bashPath : "Install Git for Windows and use Git\\bin\\bash.exe",
			),
		);
	} else {
		const npmPath = await findExecutable("npm");
		const shellPath = await findPosixShell({ findExecutable, fileExists });
		platformChecks.push(
			check("npm", Boolean(npmPath), npmPath || "Install Node.js 22+ with npm on PATH"),
			check("Shell", Boolean(shellPath), shellPath || "Install bash or sh"),
		);
	}
	const checks = [
		check("Node.js 22+", isNodeSupported(nodeVersion), `current ${nodeVersion}`),
		...platformChecks,
		check("Python", Boolean(pythonPath), pythonPath || "Install Python 3.11/3.12 and add it to PATH"),
		check("root dependencies", await fileExists(joinForPlatform(platform, projectRoot, "node_modules")), "run npm install"),
		check("Team Console dependencies", await fileExists(joinForPlatform(platform, projectRoot, "apps", "team-console", "node_modules")), "run npm --prefix apps/team-console install"),
		check("user skills directory", await fileExists(joinForPlatform(platform, projectRoot, "runtime", "skills-user")), "create runtime/skills-user"),
		check(`server port ${config.server.port}`, await isPortAvailable(config.server.port), "port must be available before native:start"),
	];

	return {
		ok: checks.every((entry) => !entry.required || entry.ok),
		checks,
		config,
	};
}
