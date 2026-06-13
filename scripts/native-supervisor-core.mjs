import { join } from "node:path";
import { buildNativeRuntimeConfig } from "./native-runtime-config.mjs";

function npmCommand() {
	return process.platform === "win32" ? "cmd.exe" : "npm";
}

function npmArgs(args) {
	return process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args;
}

function withRuntimeEnv(processConfig, env, logDir) {
	return {
		...processConfig,
		env,
		blocking: false,
		logFile: join(logDir, `${processConfig.name}.log`),
	};
}

export function createNativeSupervisorPlan(options = {}) {
	const projectRoot = options.projectRoot ?? process.cwd();
	const config = buildNativeRuntimeConfig({
		projectRoot,
		env: options.env ?? process.env,
	});
	const logDir = join(projectRoot, "logs", "native");
	const env = config.env;

	return {
		projectRoot,
		logDir,
		config,
		steps: [
			{
				name: "ugk-claw-core-win-runtime-check",
				command: npmCommand(),
				args: npmArgs(["run", "runtime:check"]),
				cwd: projectRoot,
				env,
				blocking: true,
				logFile: join(logDir, "ugk-claw-core-win-runtime-check.log"),
			},
			...config.processes.map((processConfig) => withRuntimeEnv(processConfig, env, logDir)),
		],
	};
}
