import { execFile } from "node:child_process";

export interface CloneUpdateStatus {
	ok: true;
	branch: string;
	currentCommit: string;
	currentShortCommit: string;
	remoteCommit: string;
	remoteShortCommit: string;
	hasUpdates: boolean;
	behind: number;
	ahead: number;
	blockingChanges: string[];
	allowedLocalArtifacts: string[];
}

export interface CloneUpdateDirtyResult {
	ok: false;
	reason: "dirty_worktree";
	message: string;
	blockingChanges: string[];
	allowedLocalArtifacts: string[];
}

export interface CloneUpdateApplySuccess {
	ok: true;
	previousCommit: string;
	currentCommit: string;
	currentShortCommit: string;
	updated: boolean;
	npmInstallRan: boolean;
	teamConsoleInstallRan: boolean;
	restartRequired: boolean;
	log: string[];
}

export type CloneUpdateApplyResult = CloneUpdateDirtyResult | CloneUpdateApplySuccess;

export interface CloneUpdater {
	getStatus(): Promise<CloneUpdateStatus>;
	applyUpdate(): Promise<CloneUpdateApplyResult>;
}

export interface CommandResult {
	stdout: string;
	stderr: string;
}

export type CommandRunner = (command: string, args: string[], options: { cwd: string }) => Promise<CommandResult>;

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

export function createCloneUpdater(projectRoot: string, runner: CommandRunner = execFileRunner): CloneUpdater {
	return {
		getStatus: () => getCloneUpdateStatus(projectRoot, runner),
		applyUpdate: () => applyCloneUpdate(projectRoot, runner),
	};
}

async function getCloneUpdateStatus(projectRoot: string, runner: CommandRunner): Promise<CloneUpdateStatus> {
	const logRunner = (command: string, args: string[]) => runner(command, args, { cwd: projectRoot });
	const branch = (await logRunner("git", ["branch", "--show-current"])).stdout.trim() || "unknown";
	const currentCommit = (await logRunner("git", ["rev-parse", "HEAD"])).stdout.trim();

	await logRunner("git", ["fetch", "origin", "main", "--prune"]);
	const remoteCommit = (await logRunner("git", ["rev-parse", "origin/main"])).stdout.trim();
	const counts = (await logRunner("git", ["rev-list", "--left-right", "--count", "HEAD...origin/main"])).stdout.trim().split(/\s+/);
	const ahead = Number(counts[0] ?? 0) || 0;
	const behind = Number(counts[1] ?? 0) || 0;
	const changes = parsePorcelain((await logRunner("git", ["status", "--porcelain"])).stdout);

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

async function applyCloneUpdate(projectRoot: string, runner: CommandRunner): Promise<CloneUpdateApplyResult> {
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

	const run = (command: string, args: string[]) => runner(command, args, { cwd: projectRoot });
	const log: string[] = [];
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

function parsePorcelain(output: string): { blocking: string[]; allowed: string[] } {
	const blocking: string[] = [];
	const allowed: string[] = [];
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

function isAllowedRuntimeArtifact(path: string): boolean {
	return RUNTIME_ARTIFACT_FILES.has(path) || RUNTIME_ARTIFACT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function shortCommit(commit: string): string {
	return commit.slice(0, 7);
}

function execFileRunner(command: string, args: string[], options: { cwd: string }): Promise<CommandResult> {
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
