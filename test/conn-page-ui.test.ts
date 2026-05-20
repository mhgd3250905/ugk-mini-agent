import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { getConnPageJs } from "../src/ui/conn-page-js.js";

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
