/**
 * Team public contract drift guard.
 *
 * Verifies that the frontend Team Console types stay aligned with the
 * authoritative backend Team public DTOs defined in `src/team/public-contract.ts`.
 *
 * Direction: backend public DTO must be assignable to the frontend type.
 * This catches:
 *   - backend removing a field the frontend needs
 *   - frontend adding a required field the backend never sends
 *   - incompatible type changes on shared fields
 *
 * The checks are compile-time only (via `expectTypeOf`); the assertions
 * are no-ops at runtime but surface as TypeScript errors during `tsc`.
 */

import { describe, it, expectTypeOf } from "vitest";
import type {
	TeamCanvasTask as FTeamCanvasTask,
	TeamRunState as FTeamRunState,
	TeamAttemptMetadata as FTeamAttemptMetadata,
	TeamTaskConnection as FTeamTaskConnection,
	TeamTaskDependency as FTeamTaskDependency,
	TeamCanvasSourceNode as FTeamCanvasSourceNode,
	TeamCanvasSourceConnection as FTeamCanvasSourceConnection,
} from "@/api/team-types";
import type {
	TeamCanvasTask as BTeamCanvasTask,
	TeamCanvasSourceNode as BTeamCanvasSourceNode,
	TeamRunState as BTeamRunState,
	TeamAttemptMetadataPublic,
	TeamTaskConnectionPublic,
	TeamTaskDependencyPublic,
	TeamCanvasSourceConnectionPublic,
} from "../../../../src/team/public-contract.js";

describe("Team public contract drift guard", () => {
	it("TeamCanvasTask: backend shape is assignable to frontend", () => {
		expectTypeOf<BTeamCanvasTask>().toMatchTypeOf<FTeamCanvasTask>();
	});

	it("TeamRunState: backend shape is assignable to frontend", () => {
		expectTypeOf<BTeamRunState>().toMatchTypeOf<FTeamRunState>();
	});

	it("TeamAttemptMetadata: backend shape with files is assignable to frontend", () => {
		expectTypeOf<TeamAttemptMetadataPublic>().toMatchTypeOf<FTeamAttemptMetadata>();
	});

	it("TeamTaskConnection: resolved backend shape is assignable to frontend", () => {
		expectTypeOf<TeamTaskConnectionPublic>().toMatchTypeOf<FTeamTaskConnection>();
	});

	it("TeamTaskDependency: resolved backend shape is assignable to frontend", () => {
		expectTypeOf<TeamTaskDependencyPublic>().toMatchTypeOf<FTeamTaskDependency>();
	});

	it("TeamCanvasSourceNode: backend shape is assignable to frontend", () => {
		expectTypeOf<BTeamCanvasSourceNode>().toMatchTypeOf<FTeamCanvasSourceNode>();
	});

	it("TeamCanvasSourceConnection: resolved backend shape is assignable to frontend", () => {
		expectTypeOf<TeamCanvasSourceConnectionPublic>().toMatchTypeOf<FTeamCanvasSourceConnection>();
	});
});
