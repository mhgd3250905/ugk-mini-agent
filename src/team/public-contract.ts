/**
 * Browser-safe Team public DTO contract.
 *
 * Defines the authoritative shapes returned by the Team API.
 * Frontend consumers align with these types via assignability guards
 * in `apps/team-console/src/tests/team-contract-drift.test.ts`.
 *
 * This module uses only `import type` — no runtime import of server-only
 * modules reaches the browser bundle.
 */

// Types returned as-is by the API
export type {
	TeamCanvasTask,
	TeamCanvasSourceNode,
	TeamRunState,
} from "./types.js";

// "Resolved" variants: the API returns these with status/staleReason
export type { ResolvedTaskConnection as TeamTaskConnectionPublic } from "./types.js";
export type { ResolvedTaskDependency as TeamTaskDependencyPublic } from "./types.js";
export type { ResolvedSourceConnection as TeamCanvasSourceConnectionPublic } from "./types.js";

// TeamAttemptMetadata: the route handler attaches `files` from the attempt workspace
// before serialization, so the public shape includes it.
import type { TeamAttemptMetadata } from "./types.js";
export type TeamAttemptMetadataPublic = TeamAttemptMetadata & { files: string[] };
