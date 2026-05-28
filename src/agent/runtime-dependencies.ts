import { delimiter as nativeDelimiter, join as nativeJoin, posix } from "node:path";

export interface RuntimeDependencyPaths {
	rootDir: string;
	pythonVenvDir: string;
	pythonBinDir: string;
}

type RuntimeDependencyEnv = Record<string, string | undefined> & {
	UGK_RUNTIME_DEPS_DIR?: string;
	UGK_RUNTIME_PYTHON_VENV_DIR?: string;
};

export function resolveRuntimeDependencyPaths(
	projectRoot: string,
	env: RuntimeDependencyEnv = process.env,
): RuntimeDependencyPaths {
	const rootDir = normalizeRuntimeDepsDir(env.UGK_RUNTIME_DEPS_DIR) ?? nativeJoin(projectRoot, ".data", "runtime-deps");
	const joinPath = usesPosixPath(rootDir) ? posix.join : nativeJoin;
	const pythonVenvDir = normalizeRuntimeDepsDir(env.UGK_RUNTIME_PYTHON_VENV_DIR) ?? joinPath(rootDir, `python-venv-${process.platform}`);
	const venvJoinPath = usesPosixPath(pythonVenvDir) ? posix.join : nativeJoin;
	const pythonBinDir = venvJoinPath(pythonVenvDir, usesPosixPath(pythonVenvDir) ? "bin" : process.platform === "win32" ? "Scripts" : "bin");
	return { rootDir, pythonVenvDir, pythonBinDir };
}

export function buildRuntimeDependencyEnvironment(
	projectRoot: string,
	baseEnv: RuntimeDependencyEnv = process.env,
): Record<string, string | undefined> {
	const paths = resolveRuntimeDependencyPaths(projectRoot, baseEnv);
	const pathKey = findPathKey(baseEnv);
	const currentPath = baseEnv[pathKey] ?? "";
	return {
		UGK_RUNTIME_DEPS_DIR: paths.rootDir,
		UGK_RUNTIME_PYTHON_VENV_DIR: paths.pythonVenvDir,
		VIRTUAL_ENV: paths.pythonVenvDir,
		PIP_DISABLE_PIP_VERSION_CHECK: "1",
		PIP_ROOT_USER_ACTION: "ignore",
		[pathKey]: prependPath(paths.pythonBinDir, currentPath, usesPosixPath(paths.pythonBinDir) ? ":" : nativeDelimiter),
	};
}

function normalizeRuntimeDepsDir(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed || undefined;
}

function findPathKey(env: RuntimeDependencyEnv): string {
	return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
}

function usesPosixPath(value: string): boolean {
	return value.startsWith("/");
}

function prependPath(prefix: string, currentPath: string, pathDelimiter: string): string {
	if (!currentPath) {
		return prefix;
	}
	const parts = currentPath.split(pathDelimiter).filter(Boolean);
	if (parts.includes(prefix)) {
		return currentPath;
	}
	return `${prefix}${pathDelimiter}${currentPath}`;
}
