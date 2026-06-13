import { delimiter, join } from "node:path";

const DEFAULT_SERVER_PORT = 8888;

function parsePort(value, fallback) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function localBaseUrl(port) {
	return `http://127.0.0.1:${port}`;
}

function npmCommand() {
	return process.platform === "win32" ? "cmd.exe" : "npm";
}

function npmArgs(args) {
	return process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args;
}

function pickEnvCaseInsensitive(env, names) {
	const result = {};
	const byLower = new Map(Object.keys(env).map((key) => [key.toLowerCase(), key]));
	for (const name of names) {
		const key = byLower.get(name.toLowerCase());
		if (key && typeof env[key] === "string") {
			result[key] = env[key];
		}
	}
	return result;
}

function getEnvKeyCaseInsensitive(env, name) {
	return Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase());
}

function prependLocalToolPaths(env, projectRoot) {
	const pathKey = getEnvKeyCaseInsensitive(env, "PATH") ?? (process.platform === "win32" ? "Path" : "PATH");
	const existingPath = env[pathKey] ?? "";
	const localGitBin = join(projectRoot, ".data", "tools", "git", "bin");
	return {
		...env,
		[pathKey]: existingPath ? `${localGitBin}${delimiter}${existingPath}` : localGitBin,
	};
}

function buildProcessEnv(env, projectRoot) {
	const base = pickEnvCaseInsensitive(env, [
		"SystemRoot",
		"ComSpec",
		"PATHEXT",
		"Path",
		"PATH",
		"TEMP",
		"TMP",
		"APPDATA",
		"LOCALAPPDATA",
		"USERPROFILE",
		"HOMEDRIVE",
		"HOMEPATH",
		"ProgramData",
		"ProgramFiles",
		"ProgramFiles(x86)",
		"ProgramW6432",
	]);
	for (const [key, value] of Object.entries(env)) {
		if (typeof value === "string" && /(?:API_KEY|TOKEN|SECRET|AUTH|PASSWORD)$/i.test(key)) {
			base[key] = value;
		}
	}
	return prependLocalToolPaths(base, projectRoot);
}

export function buildNativeRuntimeConfig(options = {}) {
	const env = options.env ?? process.env;
	const projectRoot = options.projectRoot ?? process.cwd();
	const serverPort = parsePort(env.PORT, DEFAULT_SERVER_PORT);
	const publicBaseUrl = env.PUBLIC_BASE_URL?.trim() || localBaseUrl(serverPort);
	const command = npmCommand();

	const nativeEnv = {
		...buildProcessEnv(env, projectRoot),
		HOST: env.HOST?.trim() || "127.0.0.1",
		PORT: String(serverPort),
		PUBLIC_BASE_URL: publicBaseUrl,
		TEAM_RUNTIME_ENABLED: env.TEAM_RUNTIME_ENABLED?.trim() || "true",
		TEAM_USE_MOCK_RUNNER: env.TEAM_USE_MOCK_RUNNER?.trim() || "false",
		FEISHU_ENABLED: "false",
		UGK_DISABLE_BROWSER_SIDECAR_DEFAULT: env.UGK_DISABLE_BROWSER_SIDECAR_DEFAULT?.trim() || "true",
		UGK_MODEL_SETTINGS_PATH: env.UGK_MODEL_SETTINGS_PATH?.trim() || join(projectRoot, ".data", "agent", "model-settings.json"),
		SEARXNG_BASE_URL: env.SEARXNG_BASE_URL?.trim() || "",
	};

	return {
		projectRoot,
		server: {
			port: serverPort,
			url: publicBaseUrl,
		},
		teamConsole: {
			url: `${publicBaseUrl}/playground/team`,
		},
		env: nativeEnv,
		processes: [
			{
				name: "ugk-mini-agent-server",
				command,
				args: npmArgs(["start"]),
				cwd: projectRoot,
			},
			{
				name: "ugk-mini-agent-team-worker",
				command,
				args: npmArgs(["run", "worker:team"]),
				cwd: projectRoot,
			},
			{
				name: "ugk-mini-agent-conn-worker",
				command,
				args: npmArgs(["run", "worker:conn"]),
				cwd: projectRoot,
			},
		],
	};
}
