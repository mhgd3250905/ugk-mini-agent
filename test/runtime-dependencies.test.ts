import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRuntimeDependencyEnvironment, resolveRuntimeDependencyPaths } from "../src/agent/runtime-dependencies.js";

const projectRoot = process.cwd();

test("runtime dependency environment prepends the shared Python venv", () => {
	const paths = resolveRuntimeDependencyPaths(projectRoot, {
		UGK_RUNTIME_DEPS_DIR: "/app/.runtime-deps",
		UGK_RUNTIME_PYTHON_VENV_DIR: "/app/.runtime-deps/python-venv-linux",
		PATH: "/usr/local/bin:/usr/bin",
	});

	assert.equal(paths.rootDir, "/app/.runtime-deps");
	assert.equal(paths.pythonVenvDir, "/app/.runtime-deps/python-venv-linux");
	assert.equal(paths.pythonBinDir, "/app/.runtime-deps/python-venv-linux/bin");

	const env = buildRuntimeDependencyEnvironment(projectRoot, {
		UGK_RUNTIME_DEPS_DIR: "/app/.runtime-deps",
		UGK_RUNTIME_PYTHON_VENV_DIR: "/app/.runtime-deps/python-venv-linux",
		PATH: "/usr/local/bin:/usr/bin",
	});

	assert.equal(env.UGK_RUNTIME_DEPS_DIR, "/app/.runtime-deps");
	assert.equal(env.UGK_RUNTIME_PYTHON_VENV_DIR, "/app/.runtime-deps/python-venv-linux");
	assert.equal(env.VIRTUAL_ENV, "/app/.runtime-deps/python-venv-linux");
	assert.equal(env.PATH, "/app/.runtime-deps/python-venv-linux/bin:/usr/local/bin:/usr/bin");
	assert.equal(env.PIP_DISABLE_PIP_VERSION_CHECK, "1");
});

test("runtime dependency environment defaults to a platform-specific venv", () => {
	const paths = resolveRuntimeDependencyPaths(projectRoot, {
		UGK_RUNTIME_DEPS_DIR: "/app/.runtime-deps",
	});

	assert.equal(paths.pythonVenvDir, `/app/.runtime-deps/python-venv-${process.platform}`);
});

test("runtime dependency tooling has init and check commands", () => {
	const script = readFileSync(join(projectRoot, "scripts", "runtime-deps.mjs"), "utf8");

	assert.match(script, /case "init"/);
	assert.match(script, /case "check"/);
	assert.match(script, /python-requirements\.lock/);
	assert.match(script, /venv-init\.lock\.d/);
	assert.match(script, /pip\.lock\.d/);
	assert.match(script, /wait_for_pip_lock/);
	assert.match(script, /"-m", "ensurepip", "--upgrade"/);
	assert.match(script, /python3 -m venv|"-m", "venv"/);
});
