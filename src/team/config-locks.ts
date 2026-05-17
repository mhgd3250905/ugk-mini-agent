import type { TeamRunState, TeamUnit } from "./types.js";
import { RunWorkspace } from "./run-workspace.js";
import { TeamUnitStore } from "./team-unit-store.js";

export const activeRunStatuses: ReadonlySet<string> = new Set(["queued", "running", "paused"]);

export interface TeamConfigLocks {
	lockedPlanIds: Set<string>;
	lockedTeamUnitIds: Set<string>;
	lockedProfileIds: Set<string>;
}

export function computeTeamConfigLocks(states: TeamRunState[], teams: TeamUnit[]): TeamConfigLocks {
	const lockedPlanIds = new Set<string>();
	const lockedTeamUnitIds = new Set<string>();
	const lockedProfileIds = new Set<string>();

	for (const state of states) {
		if (!activeRunStatuses.has(state.status)) continue;
		lockedPlanIds.add(state.planId);
		lockedTeamUnitIds.add(state.teamUnitId);

		const team = teams.find(t => t.teamUnitId === state.teamUnitId);
		if (team) {
			lockedProfileIds.add(team.watcherProfileId);
			lockedProfileIds.add(team.workerProfileId);
			lockedProfileIds.add(team.checkerProfileId);
			lockedProfileIds.add(team.finalizerProfileId);
			if (team.decomposerProfileId) {
				lockedProfileIds.add(team.decomposerProfileId);
			}
		}
	}

	return { lockedPlanIds, lockedTeamUnitIds, lockedProfileIds };
}

export async function getActiveTeamProfileLocks(teamDataDir: string): Promise<Set<string>> {
	const workspace = new RunWorkspace(teamDataDir);
	const teamUnitStore = new TeamUnitStore(teamDataDir);
	const locks = computeTeamConfigLocks(await workspace.listStates(), await teamUnitStore.list());
	return locks.lockedProfileIds;
}
