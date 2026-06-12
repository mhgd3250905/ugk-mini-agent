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
	TeamCanvasTaskKind as FTeamCanvasTaskKind,
	TeamDiscoverySpec as FTeamDiscoverySpec,
	TeamGeneratedTaskItemStatus as FTeamGeneratedTaskItemStatus,
	TeamGeneratedTaskSource as FTeamGeneratedTaskSource,
	TeamGeneratedTaskWorkUnitMode as FTeamGeneratedTaskWorkUnitMode,
	TeamDiscoveryGeneratedRunOutcome as FTeamDiscoveryGeneratedRunOutcome,
	TeamRunState as FTeamRunState,
	TeamSplitTaskSpec as FTeamSplitTaskSpec,
	TeamAttemptMetadata as FTeamAttemptMetadata,
	TeamTaskConnection as FTeamTaskConnection,
	TeamTaskDependency as FTeamTaskDependency,
	TeamCanvasSourceNode as FTeamCanvasSourceNode,
	TeamCanvasSourceConnection as FTeamCanvasSourceConnection,
	TeamTaskOutputCheck as FTeamTaskOutputCheck,
	TeamWorklistItem as FTeamWorklistItem,
	TeamWorklistItemResult as FTeamWorklistItemResult,
	TeamWorklistRecord as FTeamWorklistRecord,
	TeamWorklistResultsRecord as FTeamWorklistResultsRecord,
	TeamWorkUnitDefinition as FTeamWorkUnitDefinition,
} from "@/api/team-types";
import type {
	TeamCanvasTask as BTeamCanvasTask,
	TeamCanvasTaskKind as BTeamCanvasTaskKind,
	TeamCanvasSourceNode as BTeamCanvasSourceNode,
	TeamDiscoverySpec as BTeamDiscoverySpec,
	TeamGeneratedTaskItemStatus as BTeamGeneratedTaskItemStatus,
	TeamGeneratedTaskSource as BTeamGeneratedTaskSource,
	TeamGeneratedTaskWorkUnitMode as BTeamGeneratedTaskWorkUnitMode,
	TeamRunState as BTeamRunState,
	TeamSplitTaskSpec as BTeamSplitTaskSpec,
	TeamAttemptMetadataPublic,
	TeamTaskConnectionPublic,
	TeamTaskDependencyPublic,
	TeamCanvasSourceConnectionPublic,
	TeamTaskOutputCheck as BTeamTaskOutputCheck,
	TeamWorklistItem as BTeamWorklistItem,
	TeamWorklistItemResult as BTeamWorklistItemResult,
	TeamWorklistRecord as BTeamWorklistRecord,
	TeamWorklistResultsRecord as BTeamWorklistResultsRecord,
	TeamWorkUnitDefinition as BTeamWorkUnitDefinition,
} from "../../../../src/team/public-contract.js";

describe("Team public contract drift guard", () => {
	it("TeamCanvasTask: backend shape is assignable to frontend", () => {
		expectTypeOf<BTeamCanvasTask>().toMatchTypeOf<FTeamCanvasTask>();
	});

	it("TeamCanvasTask discovery/generated fields stay aligned", () => {
		expectTypeOf<BTeamCanvasTask["canvasKind"]>().toEqualTypeOf<FTeamCanvasTask["canvasKind"]>();
		expectTypeOf<BTeamCanvasTask["discoverySpec"]>().toEqualTypeOf<FTeamCanvasTask["discoverySpec"]>();
		expectTypeOf<BTeamCanvasTask["splitTaskSpec"]>().toEqualTypeOf<FTeamCanvasTask["splitTaskSpec"]>();
		expectTypeOf<BTeamCanvasTask["generatedSource"]>().toMatchTypeOf<FTeamCanvasTask["generatedSource"]>();
	});

	it("Discovery contract types mirror backend public types", () => {
		expectTypeOf<BTeamCanvasTaskKind>().toEqualTypeOf<FTeamCanvasTaskKind>();
		expectTypeOf<BTeamGeneratedTaskItemStatus>().toEqualTypeOf<FTeamGeneratedTaskItemStatus>();
		expectTypeOf<BTeamGeneratedTaskWorkUnitMode>().toEqualTypeOf<FTeamGeneratedTaskWorkUnitMode>();
		expectTypeOf<BTeamDiscoverySpec>().toEqualTypeOf<FTeamDiscoverySpec>();
		expectTypeOf<BTeamSplitTaskSpec>().toEqualTypeOf<FTeamSplitTaskSpec>();
		expectTypeOf<BTeamGeneratedTaskSource>().toMatchTypeOf<FTeamGeneratedTaskSource>();
	});

	it("Worklist contracts mirror backend public types", () => {
		expectTypeOf<BTeamWorklistItem>().toEqualTypeOf<FTeamWorklistItem>();
		expectTypeOf<BTeamWorklistRecord>().toEqualTypeOf<FTeamWorklistRecord>();
		expectTypeOf<BTeamWorklistItemResult>().toEqualTypeOf<FTeamWorklistItemResult>();
		expectTypeOf<BTeamWorklistResultsRecord>().toEqualTypeOf<FTeamWorklistResultsRecord>();
	});

	it("TeamGeneratedTaskSource latestManagedWorkUnit mirrors the WorkUnit contract and remains optional", () => {
		type BackendLatestManagedWorkUnit = BTeamGeneratedTaskSource["latestManagedWorkUnit"];
		type FrontendLatestManagedWorkUnit = FTeamGeneratedTaskSource["latestManagedWorkUnit"];
		const oldBackendSource: BTeamGeneratedTaskSource = {
			schemaVersion: "team/generated-task-source-1",
			sourceDiscoveryTaskId: "task_discovery",
			sourceItemId: "item_1",
			itemStatus: "active",
			itemPayload: { id: "item_1" },
			workUnitMode: "managed",
		};
		const backendSourceWithSnapshot: BTeamGeneratedTaskSource = {
			...oldBackendSource,
			latestManagedWorkUnit: {
				title: "Managed snapshot",
				input: { text: "Run managed task" },
				outputContract: { text: "Return report" },
				acceptance: { rules: ["include evidence"] },
				workerAgentId: "search",
				checkerAgentId: "reviewer",
			},
		};
		const frontendSource: FTeamGeneratedTaskSource = backendSourceWithSnapshot;

		expectTypeOf<BackendLatestManagedWorkUnit>().toEqualTypeOf<FrontendLatestManagedWorkUnit>();
		expectTypeOf<NonNullable<BackendLatestManagedWorkUnit>>().toEqualTypeOf<BTeamWorkUnitDefinition>();
		expectTypeOf<NonNullable<FrontendLatestManagedWorkUnit>>().toEqualTypeOf<FTeamWorkUnitDefinition>();
		expectTypeOf(frontendSource).toEqualTypeOf<FTeamGeneratedTaskSource>();
	});

	it("TeamDiscoverySpec uses generated task agent field names", () => {
		type GeneratedTaskAgentKeys = "generatedWorkerAgentId" | "generatedCheckerAgentId";
		type BackendGeneratedTaskAgentFields = Pick<BTeamDiscoverySpec, GeneratedTaskAgentKeys>;
		type FrontendGeneratedTaskAgentFields = Pick<FTeamDiscoverySpec, GeneratedTaskAgentKeys>;
		type BackendLegacyAgentKeys = Extract<keyof BTeamDiscoverySpec, "workerAgentId" | "checkerAgentId">;
		type FrontendLegacyAgentKeys = Extract<keyof FTeamDiscoverySpec, "workerAgentId" | "checkerAgentId">;
		const backendSpec: BTeamDiscoverySpec = {
			schemaVersion: "team/discovery-spec-1",
			discoveryGoal: "Discover items",
			outputKey: "items",
			itemIdField: "id",
			requiredItemFields: ["id"],
			dispatchGoal: "Create item tasks",
			dispatcherAgentId: "dispatcher",
			generatedWorkerAgentId: "worker",
			generatedCheckerAgentId: "checker",
			autoRun: {
				enabled: true,
				concurrency: 3,
			},
		};
		const frontendSpec: FTeamDiscoverySpec = backendSpec;

		expectTypeOf<BackendGeneratedTaskAgentFields>().toEqualTypeOf<FrontendGeneratedTaskAgentFields>();
		expectTypeOf<BackendLegacyAgentKeys>().toEqualTypeOf<never>();
		expectTypeOf<FrontendLegacyAgentKeys>().toEqualTypeOf<never>();
		expectTypeOf(frontendSpec).toEqualTypeOf<FTeamDiscoverySpec>();
	});

	it("Discovery and generated task payloads remain assignable to frontend TeamCanvasTask", () => {
		type DiscoveryTaskPayload = BTeamCanvasTask & {
			canvasKind: "discovery";
			discoverySpec: BTeamDiscoverySpec;
		};
		type GeneratedTaskPayload = BTeamCanvasTask & {
			generatedSource: BTeamGeneratedTaskSource;
		};

		expectTypeOf<DiscoveryTaskPayload>().toMatchTypeOf<FTeamCanvasTask>();
		expectTypeOf<GeneratedTaskPayload>().toMatchTypeOf<FTeamCanvasTask>();
	});

	it("TeamWorkUnitDefinition outputCheck uses the shared TeamTaskOutputCheck contract", () => {
		expectTypeOf<BTeamWorkUnitDefinition["outputCheck"]>().toEqualTypeOf<FTeamWorkUnitDefinition["outputCheck"]>();
		expectTypeOf<BTeamTaskOutputCheck>().toEqualTypeOf<FTeamTaskOutputCheck>();
		expectTypeOf<BTeamTaskOutputCheck>().toMatchTypeOf<NonNullable<BTeamWorkUnitDefinition["outputCheck"]>>();
	});

	it("TeamRunState: backend shape is assignable to frontend", () => {
		expectTypeOf<BTeamRunState>().toMatchTypeOf<FTeamRunState>();
	});

	it("Discovery generated run launch diagnostics stay aligned", () => {
		expectTypeOf<NonNullable<TeamAttemptMetadataPublic["discoveryGeneratedRuns"]>[number]>().toEqualTypeOf<FTeamDiscoveryGeneratedRunOutcome>();
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
