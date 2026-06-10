import type { BackgroundAgentSessionFactory } from "../src/agent/background-agent-runner.js";
import type { ResolvedBackgroundAgentSnapshot } from "../src/agent/background-agent-profile.js";
import type { DiscoveryDispatchInput } from "../src/team/role-runner.js";

export function makeFakeSessionFactory(responses: string[]): BackgroundAgentSessionFactory {
	let callIndex = 0;
	return {
		createSession: async () => {
			const content = responses[callIndex] ?? "ok";
			callIndex++;
			const messages = [
				{ role: "assistant", content: [{ type: "text", text: content }], stopReason: "end_turn" },
			];
			return {
				prompt: async () => {},
				subscribe: () => () => {},
				messages,
			};
		},
	} as unknown as BackgroundAgentSessionFactory;
}

export const fakeProfileResolver = {
	resolve: async () => ({}),
};

export function makeFakeProfileResolver(snapshotsByProfileId: Record<string, Partial<ResolvedBackgroundAgentSnapshot>>) {
	return {
		resolve: async (ref: { profileId: string }) => {
			const partial = snapshotsByProfileId[ref.profileId] ?? {};
			return {
				profileId: ref.profileId,
				profileVersion: "1",
				agentSpecId: "team-default",
				agentSpecVersion: "1",
				skillSetId: "team-default",
				skillSetVersion: "1",
				skills: [],
				modelPolicyId: "team-default",
				modelPolicyVersion: "1",
				provider: "test",
				model: "test-model",
				upgradePolicy: "latest" as const,
				resolvedAt: new Date().toISOString(),
				...partial,
			};
		},
	};
}

export interface CapturedSessionInput {
	runId: string;
	connId: string;
	browserId?: string;
	browserScope?: string;
	snapshot: ResolvedBackgroundAgentSnapshot;
	workspaceRootPath?: string;
}

export function makeCapturingSessionFactory(responses: string[]) {
	const captured: CapturedSessionInput[] = [];
	let callIndex = 0;
	const factory = {
		createSession: async (input: {
			runId: string;
			connId: string;
			browserId?: string;
			browserScope?: string;
			snapshot: ResolvedBackgroundAgentSnapshot;
			workspace?: { rootPath?: string };
		}) => {
			captured.push({
				runId: input.runId,
				connId: input.connId,
				browserId: input.browserId,
				browserScope: input.browserScope,
				snapshot: input.snapshot,
				workspaceRootPath: input.workspace?.rootPath,
			});
			const content = responses[callIndex] ?? "ok";
			callIndex++;
			return {
				prompt: async () => {},
				subscribe: () => () => {},
				messages: [{ role: "assistant", content: [{ type: "text", text: content }], stopReason: "end_turn" }],
			};
		},
	};
	return { factory: factory as unknown as BackgroundAgentSessionFactory, captured };
}

export function makeDiscoveryDispatchInput(overrides: Partial<DiscoveryDispatchInput> = {}): DiscoveryDispatchInput {
	return {
		runId: "run_discovery_dispatch",
		discoveryTaskId: "task_discovery",
		discoveryTaskTitle: "Vendor discovery",
		discoveryGoal: "Find qualified vendors for Android 16 BLE validation.",
		dispatchGoal: "Create one due-diligence work unit for each discovered vendor.",
		outputKey: "vendors",
		itemId: "vendor_1",
		itemPayload: {
			id: "vendor_1",
			title: "Acme Sensors",
			type: "vendor",
			website: "https://example.com",
		},
		requiredItemFields: ["id"],
		recommendedItemFields: ["title", "type"],
		generatedWorkerAgentId: "worker-default",
		generatedCheckerAgentId: "checker-default",
		...overrides,
	};
}

export function makeDiscoveryDispatchPatchJson(itemId = "vendor_1"): string {
	return JSON.stringify({
		itemId,
		title: "Assess Acme Sensors",
		workerInstruction: "Research Acme Sensors and summarize BLE validation fit.",
		itemAcceptanceHints: ["Cites relevant sources"],
		outputContractHint: "Include BLE validation fit evidence.",
	});
}

export interface CapturedRouteCall {
	scope: string;
	browserId: string | undefined;
}

export interface CapturedCleanupCall {
	scope: string;
	options?: { browserId?: string };
}
