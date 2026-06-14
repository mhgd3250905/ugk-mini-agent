import { execFile } from "node:child_process";

const RUNTIME_ARTIFACT_PREFIXES = [
	".data/",
	"logs/",
	"node_modules/",
	"apps/team-console/dist/",
	"apps/team-console/node_modules/",
	"runtime/playground/",
	"runtime/playground-factory/",
];

const RUNTIME_ARTIFACT_FILES = new Set([
	".env.native",
	"apps/team-console/tsconfig.node.tsbuildinfo",
]);

export function createCloneUpdater(projectRoot, runner = execFileRunner) {
	return {
		getStatus: () => getCloneUpdateStatus(projectRoot, runner),
		applyUpdate: () => applyCloneUpdate(projectRoot, runner),
	};
}

async function getCloneUpdateStatus(projectRoot, runner) {
	const run = (command, args) => runner(command, args, { cwd: projectRoot });
	const branch = (await run("git", ["branch", "--show-current"])).stdout.trim() || "unknown";
	const currentCommit = (await run("git", ["rev-parse", "HEAD"])).stdout.trim();

	await run("git", ["fetch", "origin", "main", "--prune"]);
	const remoteCommit = (await run("git", ["rev-parse", "origin/main"])).stdout.trim();
	const counts = (await run("git", ["rev-list", "--left-right", "--count", "HEAD...origin/main"])).stdout.trim().split(/\s+/);
	const ahead = Number(counts[0] ?? 0) || 0;
	const behind = Number(counts[1] ?? 0) || 0;
	const changes = parsePorcelain((await run("git", ["status", "--porcelain"])).stdout);

	return {
		ok: true,
		branch,
		currentCommit,
		currentShortCommit: shortCommit(currentCommit),
		remoteCommit,
		remoteShortCommit: shortCommit(remoteCommit),
		hasUpdates: currentCommit !== remoteCommit || behind > 0,
		behind,
		ahead,
		blockingChanges: changes.blocking,
		allowedLocalArtifacts: changes.allowed,
	};
}

async function applyCloneUpdate(projectRoot, runner) {
	const status = await getCloneUpdateStatus(projectRoot, runner);
	if (status.blockingChanges.length > 0) {
		return {
			ok: false,
			reason: "dirty_worktree",
			message: "存在本地代码改动，不能自动更新。",
			blockingChanges: status.blockingChanges,
			allowedLocalArtifacts: status.allowedLocalArtifacts,
		};
	}

	const run = (command, args) => runner(command, args, { cwd: projectRoot });
	const log = [];
	const previousCommit = status.currentCommit;
	log.push("git pull --ff-only origin main");
	await run("git", ["pull", "--ff-only", "origin", "main"]);
	const currentCommit = (await run("git", ["rev-parse", "HEAD"])).stdout.trim();
	const changedFiles = currentCommit === previousCommit
		? []
		: (await run("git", ["diff", "--name-only", previousCommit, currentCommit])).stdout.split(/\r?\n/).filter(Boolean);
	const npmInstallRan = changedFiles.some((file) => file === "package.json" || file === "package-lock.json");
	const teamConsoleInstallRan = changedFiles.some((file) => file === "apps/team-console/package.json" || file === "apps/team-console/package-lock.json");
	if (npmInstallRan) {
		log.push("npm install");
		await run("npm", ["install"]);
	}
	if (teamConsoleInstallRan) {
		log.push("npm --prefix apps/team-console install");
		await run("npm", ["--prefix", "apps/team-console", "install"]);
	}

	return {
		ok: true,
		previousCommit,
		currentCommit,
		currentShortCommit: shortCommit(currentCommit),
		updated: currentCommit !== previousCommit,
		npmInstallRan,
		teamConsoleInstallRan,
		restartRequired: currentCommit !== previousCommit,
		log,
	};
}

function parsePorcelain(output) {
	const blocking = [];
	const allowed = [];
	for (const line of output.split(/\r?\n/)) {
		const entry = line.trimEnd();
		if (!entry) {
			continue;
		}
		const path = entry.slice(3).replace(/\\/g, "/");
		if (isAllowedRuntimeArtifact(path)) {
			allowed.push(entry);
		} else {
			blocking.push(entry);
		}
	}
	return { blocking, allowed };
}

function isAllowedRuntimeArtifact(path) {
	return RUNTIME_ARTIFACT_FILES.has(path) || RUNTIME_ARTIFACT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function shortCommit(commit) {
	return commit.slice(0, 7);
}

function execFileRunner(command, args, options) {
	return new Promise((resolve, reject) => {
		execFile(command, args, { cwd: options.cwd, windowsHide: true, maxBuffer: 1024 * 1024 * 8 }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(`${command} ${args.join(" ")} failed: ${stderr || error.message}`));
				return;
			}
			resolve({ stdout, stderr });
		});
	});
}
