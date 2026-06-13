import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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

async function findGitBash({ projectRoot, findExecutable, fileExists }) {
	const fromPath = await findExecutable("bash");
	if (fromPath && isSupportedGitBash(fromPath)) {
		return fromPath;
	}
	const gitPath = await findExecutable("git");
	const fromGitPath = gitPath ? resolve(dirname(gitPath), "..", "bin", "bash.exe") : undefined;
	const candidates = [
		join(projectRoot, ".data", "tools", "git", "bin", "bash.exe"),
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

export async function createNativeDoctorReport(options = {}) {
	const projectRoot = options.projectRoot ?? process.cwd();
	const env = options.env ?? process.env;
	const fileExists = options.fileExists ?? defaultFileExists;
	const findExecutable = options.findExecutable ?? defaultFindExecutable;
	const isPortAvailable = options.isPortAvailable ?? defaultIsPortAvailable;
	const config = buildNativeRuntimeConfig({ projectRoot, env });
	const nodeVersion = options.nodeVersion ?? process.version;

	const bashPath = await findGitBash({ projectRoot, findExecutable, fileExists });
	const pythonPath = await findExecutable("python");
	const checks = [
		check("Node.js 22+", isNodeSupported(nodeVersion), `current ${nodeVersion}`),
		check("Git Bash", Boolean(bashPath && isSupportedGitBash(bashPath)), bashPath && isSupportedGitBash(bashPath) ? bashPath : "Install Git for Windows and use Git\\bin\\bash.exe"),
		check("Python", Boolean(pythonPath), pythonPath || "Install Python 3.11/3.12 and add it to PATH"),
		check("root dependencies", await fileExists(join(projectRoot, "node_modules")), "run npm install"),
		check("Team Console dependencies", await fileExists(join(projectRoot, "apps", "team-console", "node_modules")), "run npm --prefix apps/team-console install"),
		check("user skills directory", await fileExists(join(projectRoot, "runtime", "skills-user")), "create runtime/skills-user"),
		check(`server port ${config.server.port}`, await isPortAvailable(config.server.port), "port must be available before native:start"),
		check(`Team Console port ${config.teamConsole.port}`, await isPortAvailable(config.teamConsole.port), "port must be available before native:start"),
	];

	return {
		ok: checks.every((entry) => !entry.required || entry.ok),
		checks,
		config,
	};
}
