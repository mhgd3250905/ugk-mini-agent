import { createCloneUpdater as createCoreCloneUpdater } from "../../scripts/clone-updater-core.mjs";

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

export function createCloneUpdater(projectRoot: string, runner?: CommandRunner): CloneUpdater {
	return createCoreCloneUpdater(projectRoot, runner) as CloneUpdater;
}
