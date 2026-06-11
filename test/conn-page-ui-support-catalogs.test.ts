import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { getConnPageJs } from "../src/ui/conn-page-js.js";

type ConnPageElement = {
	value: string;
	checked: boolean;
	disabled: boolean;
	hidden: boolean;
	textContent: string;
	innerHTML: string;
	dataset: Record<string, string>;
	style: Record<string, string>;
	scrollTop: number;
	addEventListener: (event?: string, handler?: () => unknown) => void;
	appendChild: (child?: ConnPageElement) => void;
	setAttribute: () => void;
	querySelector: () => ConnPageElement | null;
	querySelectorAll: () => ConnPageElement[];
	scrollIntoView: () => void;
	focus: () => void;
};

function createConnPageElement(value = ""): ConnPageElement {
	return {
		value,
		checked: false,
		disabled: false,
		hidden: false,
		textContent: "",
		innerHTML: "",
		dataset: {},
		style: {},
		scrollTop: 0,
		addEventListener: () => undefined,
		appendChild: () => undefined,
		setAttribute: () => undefined,
		querySelector: () => null,
		querySelectorAll: () => [],
		scrollIntoView: () => undefined,
		focus: () => undefined,
	};
}

function createConnPageSelectElement(value = ""): ConnPageElement {
	const element = createConnPageElement();
	let selectedValue = value;
	const optionValues = new Set<string>();
	let html = "";

	Object.defineProperty(element, "value", {
		get() {
			if (optionValues.size === 0) return "";
			return optionValues.has(selectedValue) ? selectedValue : "";
		},
		set(nextValue: string) {
			selectedValue = String(nextValue || "");
		},
	});
	Object.defineProperty(element, "innerHTML", {
		get() {
			return html;
		},
		set(nextValue: string) {
			html = String(nextValue || "");
			optionValues.clear();
		},
	});
	element.appendChild = (child?: ConnPageElement) => {
		const optionValue = String(child?.value || "");
		optionValues.add(optionValue);
		if (!selectedValue) selectedValue = optionValue;
	};

	return element;
}

function createConnPageContext(options?: {
	fetchJson?: (url: string) => Promise<unknown>;
	elements?: Record<string, ConnPageElement>;
}) {
	const script = getConnPageJs().replace(/\ninit\(\);\s*$/, "");
	const elements = new Map<string, ConnPageElement>(Object.entries(options?.elements ?? {}));
	const context = vm.createContext({
		calls: [] as string[],
		result: undefined,
		window: {},
		URLSearchParams,
		document: {
			createElement: () => createConnPageElement(),
			getElementById: (id: string) => elements.get(id) ?? null,
			querySelectorAll: () => [],
			querySelector: () => null,
			addEventListener: () => undefined,
			body: {
				appendChild: () => undefined,
			},
			execCommand: () => true,
		},
		navigator: {},
		setTimeout,
		clearTimeout,
		applyTheme: () => undefined,
		readStoredTheme: () => "dark",
		toggleTheme: () => undefined,
		showToast: () => undefined,
		escapeHtml: (value: unknown) => String(value ?? ""),
		formatTimestamp: (value: unknown) => String(value ?? ""),
		fetchJson:
			options?.fetchJson ??
			(async (url: string) => {
				(context as { calls: string[] }).calls.push(url);
				if (url === "/v1/conns") {
					return { conns: [], unreadRunCountsByConnId: {}, unreadLatestRunTimesByConnId: {}, totalUnreadRuns: 0 };
				}
				if (url === "/v1/agents") return { agents: [{ agentId: "main", name: "主 Agent" }] };
				if (url === "/v1/browsers") return { browsers: [{ browserId: "default", name: "Default Chrome" }] };
				if (url === "/v1/model-config") {
					return {
						current: { provider: "zhipu-glm", model: "glm-5.1" },
						providers: [{ id: "zhipu-glm", name: "Zhipu GLM", models: [{ id: "glm-5.1", name: "GLM-5.1" }] }],
					};
				}
				if (url === "/v1/team/task-groups") return { groups: [] };
				return {};
			}),
	});
	vm.runInContext(script, context);
	return { context, elements };
}

async function runConnPageExpression<T>(context: vm.Context, expression: string): Promise<T> {
	return (await vm.runInContext(`(async () => { ${expression} })()`, context)) as T;
}

test("standalone conn editor loads support catalogs lazily and reuses the cache", async () => {
	const { context } = createConnPageContext();

	const calls = await runConnPageExpression<string[]>(
		context,
		`
			openEditor("create");
			await Promise.resolve();
			await Promise.resolve();
			openEditor("edit", { connId: "conn-1" });
			await Promise.resolve();
			await Promise.resolve();
			return calls;
		`,
	);

	assert.deepEqual(calls, ["/v1/agents", "/v1/browsers", "/v1/model-config", "/v1/team/task-groups"]);
});

test("standalone conn edit keeps selected support values while lazy catalogs load", async () => {
	const calls: string[] = [];
	const elements = {
		"conn-list-items": createConnPageElement(),
		"conn-detail-body": createConnPageElement(),
		"conn-detail-title": createConnPageElement(),
		"conn-detail-actions": createConnPageElement(),
		"editor-title-input": createConnPageElement(),
		"editor-prompt": createConnPageElement(),
		"editor-schedule-kind": createConnPageSelectElement(),
		"editor-once-at": createConnPageElement(),
		"editor-target-type": createConnPageSelectElement(),
		"editor-target-id": createConnPageElement(),
		"editor-profile-id": createConnPageSelectElement(),
		"editor-browser-id": createConnPageSelectElement(),
		"editor-model-provider": createConnPageSelectElement(),
		"editor-model-id": createConnPageSelectElement(),
		"editor-support-status": createConnPageElement(),
	};
	const { context } = createConnPageContext({
		elements,
		fetchJson: async (url: string) => {
			calls.push(url);
			if (url === "/v1/agents") return { agents: [{ agentId: "agent-a", name: "Agent A" }] };
			if (url === "/v1/browsers") return { browsers: [{ browserId: "chrome-2", name: "Chrome 2" }] };
			if (url === "/v1/model-config") {
				return {
					current: { provider: "zhipu-glm", model: "glm-5.1" },
					providers: [
						{ id: "zhipu-glm", name: "Zhipu GLM", models: [{ id: "glm-5.1", name: "GLM-5.1" }] },
						{
							id: "ali-codeplan",
							name: "Ali CodePlan",
							models: [{ id: "qwen3.7-max", name: "Qwen 3.7 Max" }],
						},
					],
				};
			}
			if (url === "/v1/team/task-groups") return { groups: [] };
			return {};
		},
	});

	const result = await runConnPageExpression<{
		immediate: { profileId: string; browserId: string; modelProvider: string; modelId: string };
		afterLoad: { profileId: string; browserId: string; modelProvider: string; modelId: string };
	}>(
		context,
		`
			state.conns = [{
				connId: "conn-1",
				title: "Daily report",
				prompt: "Summarize yesterday",
				status: "active",
				schedule: { kind: "once", at: "2026-05-23T04:00:00.000Z" },
				target: { type: "task_inbox" },
				profileId: "agent-a",
				browserId: "chrome-2",
				modelProvider: "ali-codeplan",
				modelId: "qwen3.7-max",
			}];
			openEditor("edit", state.conns[0]);
			const immediate = {
				profileId: $("editor-profile-id").value,
				browserId: $("editor-browser-id").value,
				modelProvider: $("editor-model-provider").value,
				modelId: $("editor-model-id").value,
			};
			await state.editorSupportCatalogsPromise;
			const afterLoad = {
				profileId: $("editor-profile-id").value,
				browserId: $("editor-browser-id").value,
				modelProvider: $("editor-model-provider").value,
				modelId: $("editor-model-id").value,
			};
			return { immediate, afterLoad };
		`,
	);

	assert.deepEqual(calls, ["/v1/agents", "/v1/browsers", "/v1/model-config", "/v1/team/task-groups"]);
	assert.equal(result.immediate.profileId, "agent-a");
	assert.equal(result.immediate.browserId, "chrome-2");
	assert.equal(result.immediate.modelProvider, "");
	assert.equal(result.immediate.modelId, "");
	assert.equal(result.afterLoad.profileId, "agent-a");
	assert.equal(result.afterLoad.browserId, "chrome-2");
	assert.equal(result.afterLoad.modelProvider, "ali-codeplan");
	assert.equal(result.afterLoad.modelId, "qwen3.7-max");
});

test("standalone conn editor guards save while support catalogs are unavailable", async () => {
	const { context } = createConnPageContext({
		elements: {
			"editor-title-input": createConnPageElement("Daily report"),
			"editor-prompt": createConnPageElement("Summarize yesterday"),
			"editor-schedule-kind": createConnPageElement("once"),
			"editor-once-at": createConnPageElement("2026-05-22 12:00"),
			"editor-target-type": createConnPageElement("task_inbox"),
			"editor-profile-id": createConnPageElement("main"),
			"editor-browser-id": createConnPageElement(""),
			"editor-model-provider": createConnPageElement("zhipu-glm"),
			"editor-model-id": createConnPageElement("glm-5.1"),
			"editor-error": createConnPageElement(""),
		},
	});

	const result = await runConnPageExpression<{ payload: unknown; error: string }>(
		context,
		`
			state.editorMode = "create";
			const payload = readEditorPayload();
			return { payload, error: state.editorError };
		`,
	);

	assert.equal(result.payload, null);
	assert.match(result.error, /运行配置|模型配置|加载/);
});
