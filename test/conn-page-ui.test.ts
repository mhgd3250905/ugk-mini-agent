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

function createRunHistoryTestElement() {
	const element = createConnPageElement();
	const loadButton = createConnPageElement();
	let loadHandler: (() => unknown) | undefined;
	loadButton.addEventListener = (_event?: string, handler?: () => unknown) => {
		loadHandler = handler;
	};
	element.querySelector = () => (element.innerHTML.includes("data-load-run-history") ? loadButton : null);
	return {
		element,
		clickLoad: async () => {
			assert.ok(loadHandler, "expected lazy run-history button to be wired");
			await loadHandler();
			await Promise.resolve();
		},
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
				return {};
			}),
	});
	vm.runInContext(script, context);
	return { context, elements };
}

async function runConnPageExpression<T>(context: vm.Context, expression: string): Promise<T> {
	return (await vm.runInContext(`(async () => { ${expression} })()`, context)) as T;
}

function parseDailyCronExpression(value: string): string {
	return evaluateConnPageScript(`parseDailyTimeToCronExpression(input)`, value) as string;
}

function formatDailyScheduleEditorValue(expression: string, nextRunAt?: string): string {
	return evaluateConnPageScript(
		`formatDailyScheduleEditorValue({ kind: "cron", expression: input }, nextRunAt)`,
		expression,
		nextRunAt,
	) as string;
}

function evaluateConnPageScript(expression: string, input: string, nextRunAt?: string): unknown {
	const script = getConnPageJs().replace(/\ninit\(\);\s*$/, "");
	const context = vm.createContext({
		input,
		nextRunAt,
		result: undefined,
		window: {},
		document: {
			getElementById: () => null,
			querySelectorAll: () => [],
			querySelector: () => null,
			addEventListener: () => undefined,
			body: {},
		},
		navigator: {},
	});
	vm.runInContext(`${script}\nresult = ${expression};`, context);
	return context.result;
}

test("conn editor daily schedule accepts time-only and datetime picker values", () => {
	assert.equal(parseDailyCronExpression("09:30"), "30 9 * * *");
	assert.equal(parseDailyCronExpression("2026-05-20 09:30"), "30 9 * * *");
	assert.equal(parseDailyCronExpression("2026/05/20 23:05"), "5 23 * * *");
	assert.equal(parseDailyCronExpression("2026-05-20"), "");
	assert.equal(parseDailyCronExpression("25:00"), "");
	assert.equal(parseDailyCronExpression("09:60"), "");
});

test("conn editor daily schedule fills editor time from existing cron schedule", () => {
	const todayValue = formatDailyScheduleEditorValue("30 9 * * *");
	assert.match(todayValue, / 09:30$/);
	assert.equal(
		formatDailyScheduleEditorValue("5 23 * * *", "2026-05-21T15:05:00.000Z"),
		"2026-05-21 23:05",
	);
	assert.equal(formatDailyScheduleEditorValue("* * * * *"), "");
});

test("standalone conn first data load fetches only the conn list", async () => {
	const { context } = createConnPageContext();

	const calls = await runConnPageExpression<string[]>(
		context,
		`
			await loadData();
			return calls;
		`,
	);

	assert.deepEqual(calls, ["/v1/conns"]);
});

test("standalone conn init auto-selects first conn without fetching run history", async () => {
	const { context } = createConnPageContext({
		fetchJson: async (url: string) => {
			(context as { calls: string[] }).calls.push(url);
			if (url === "/v1/conns") {
				return {
					conns: [
						{
							connId: "conn-1",
							title: "Daily report",
							status: "active",
							latestRun: {
								runId: "run-latest",
								connId: "conn-1",
								status: "succeeded",
								resultSummary: "Summary from latest run",
								createdAt: "2026-05-22T01:00:00.000Z",
								updatedAt: "2026-05-22T01:01:00.000Z",
							},
						},
					],
					unreadRunCountsByConnId: {},
					unreadLatestRunTimesByConnId: {},
					totalUnreadRuns: 0,
				};
			}
			if (url.includes("/runs")) return { runs: [] };
			return {};
		},
	});

	const result = await runConnPageExpression<{ calls: string[]; selectedId: string | null }>(
		context,
		`
			init();
			await new Promise(resolve => setTimeout(resolve, 0));
			await new Promise(resolve => setTimeout(resolve, 0));
			return { calls, selectedId: state.selectedId };
		`,
	);

	assert.equal(result.selectedId, "conn-1");
	assert.deepEqual(result.calls, ["/v1/conns"]);
});

test("standalone conn first render uses latestRun summary before full history is loaded", async () => {
	const runHistory = createRunHistoryTestElement();
	const { context } = createConnPageContext({
		elements: {
			"conn-run-history-list": runHistory.element,
		},
	});

	const html = await runConnPageExpression<string>(
		context,
		`
			state.conns = [{
				connId: "conn-1",
				title: "Daily report",
				status: "active",
				latestRun: {
					runId: "run-latest",
					connId: "conn-1",
					status: "succeeded",
					resultSummary: "Summary from latest run",
					createdAt: "2026-05-22T01:00:00.000Z",
					updatedAt: "2026-05-22T01:01:00.000Z",
				},
			}];
			state.selectedId = "conn-1";
			renderRunHistory(state.conns[0]);
			return $("conn-run-history-list").innerHTML;
		`,
	);

	assert.match(html, /Summary from latest run/);
	assert.match(html, /加载运行历史/);
});

test("standalone conn selection shows lazy run history until the explicit load action", async () => {
	const calls: string[] = [];
	const runHistory = createRunHistoryTestElement();
	const { context } = createConnPageContext({
		elements: {
			"conn-run-history-list": runHistory.element,
		},
		fetchJson: async (url: string) => {
			calls.push(url);
			if (url.includes("/runs")) {
				return {
					runs: [],
				};
			}
			return {};
		},
	});

	const before = await runConnPageExpression<{ calls: string[]; html: string }>(
		context,
		`
			state.conns = [{ connId: "conn-1", title: "Daily report", status: "active" }];
			await handleConnSelect("conn-1");
			renderRunHistory(state.conns[0]);
			return { calls, html: $("conn-run-history-list").innerHTML };
		`,
	);

	assert.deepEqual(before.calls, []);
	assert.match(before.html, /加载运行历史/);

	await runHistory.clickLoad();
	await new Promise((resolve) => setTimeout(resolve, 0));

	assert.deepEqual(calls, ["/v1/conns/conn-1/runs?limit=10"]);
	assert.match(runHistory.element.innerHTML, /暂无运行历史/);
});

test("standalone conn loaded empty run history is a valid cache state", async () => {
	const runHistory = createRunHistoryTestElement();
	const { context } = createConnPageContext({
		elements: {
			"conn-run-history-list": runHistory.element,
		},
	});

	const html = await runConnPageExpression<string>(
		context,
		`
			state.conns = [{ connId: "conn-1", title: "Daily report", status: "active" }];
			state.selectedId = "conn-1";
			state.runsByConnId["conn-1"] = [];
			state.runHistoryStateByConnId["conn-1"] = { status: "loaded", error: "" };
			renderRunHistory(state.conns[0]);
			return $("conn-run-history-list").innerHTML;
		`,
	);

	assert.match(html, /暂无运行历史/);
	assert.doesNotMatch(html, /加载运行历史/);
});

test("standalone conn ignores stale run history paint after selected conn changes", async () => {
	const runHistory = createRunHistoryTestElement();
	const { context } = createConnPageContext({
		elements: {
			"conn-run-history-list": runHistory.element,
		},
		fetchJson: async (url: string) => {
			if (url.includes("/runs")) {
				await new Promise((resolve) => setTimeout(resolve, 0));
				return {
					runs: [
						{
							runId: "run-stale",
							connId: "conn-1",
							status: "succeeded",
							resultSummary: "Stale run should not paint",
							createdAt: "2026-05-22T01:00:00.000Z",
							updatedAt: "2026-05-22T01:01:00.000Z",
						},
					],
				};
			}
			return {};
		},
	});

	const html = await runConnPageExpression<string>(
		context,
		`
			state.conns = [
				{ connId: "conn-1", title: "Daily report", status: "active" },
				{ connId: "conn-2", title: "Weekly report", status: "active" },
			];
			state.selectedId = "conn-1";
			const pending = loadRunHistory("conn-1");
			state.selectedId = "conn-2";
			await pending;
			return $("conn-run-history-list").innerHTML;
		`,
	);

	assert.doesNotMatch(html, /Stale run should not paint/);
});

test("standalone conn load more appends run history without resetting selected state", async () => {
	const calls: string[] = [];
	const detailBody = createConnPageElement();
	detailBody.scrollTop = 120;
	const { context } = createConnPageContext({
		elements: {
			"conn-detail-body": detailBody,
		},
		fetchJson: async (url: string) => {
			calls.push(url);
			if (url.includes("/runs")) {
				return {
					runs: [
						{
							runId: "run-2",
							connId: "conn-1",
							status: "succeeded",
							resultSummary: "Second page",
							createdAt: "2026-05-22T01:02:00.000Z",
							updatedAt: "2026-05-22T01:03:00.000Z",
						},
					],
					hasMore: false,
					limit: 10,
				};
			}
			return {};
		},
	});

	const result = await runConnPageExpression<{
		selectedId: string | null;
		expandedRunId: string | null;
		runIds: string[];
		hasMore: boolean;
		scrollTop: number;
	}>(
		context,
		`
			state.conns = [{ connId: "conn-1", title: "Daily report", status: "active" }];
			state.selectedId = "conn-1";
			state.expandedRunId = "run-1";
			state.runsByConnId["conn-1"] = [{
				runId: "run-1",
				connId: "conn-1",
				status: "succeeded",
				resultSummary: "First page",
				createdAt: "2026-05-22T01:00:00.000Z",
				updatedAt: "2026-05-22T01:01:00.000Z",
			}];
			state.runHistoryStateByConnId["conn-1"] = { status: "loaded", error: "" };
			state.runHistoryPageByConnId["conn-1"] = { hasMore: true, nextBefore: "cursor-1", limit: 10 };
			$("conn-detail-body").scrollTop = 120;
			await loadMoreRunHistory("conn-1");
			return {
				selectedId: state.selectedId,
				expandedRunId: state.expandedRunId,
				runIds: state.runsByConnId["conn-1"].map(run => run.runId),
				hasMore: state.runHistoryPageByConnId["conn-1"].hasMore,
				scrollTop: $("conn-detail-body").scrollTop,
			};
		`,
	);

	assert.deepEqual(calls, ["/v1/conns/conn-1/runs?limit=10&before=cursor-1"]);
	assert.equal(result.selectedId, "conn-1");
	assert.equal(result.expandedRunId, "run-1");
	assert.deepEqual(Array.from(result.runIds), ["run-1", "run-2"]);
	assert.equal(result.hasMore, false);
	assert.equal(result.scrollTop, 120);
});

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

	assert.deepEqual(calls, ["/v1/agents", "/v1/browsers", "/v1/model-config"]);
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

	assert.deepEqual(calls, ["/v1/agents", "/v1/browsers", "/v1/model-config"]);
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
