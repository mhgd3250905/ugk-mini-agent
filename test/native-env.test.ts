import test from "node:test";
import assert from "node:assert/strict";
import { parseNativeEnv } from "../scripts/native-env.mjs";

test("parseNativeEnv reads simple key value pairs and ignores comments", () => {
	assert.deepEqual(
		parseNativeEnv([
			"# comment",
			"PORT=7777",
			"PUBLIC_BASE_URL=http://127.0.0.1:7777",
			"EMPTY=",
			"",
		].join("\n")),
		{
			PORT: "7777",
			PUBLIC_BASE_URL: "http://127.0.0.1:7777",
			EMPTY: "",
		},
	);
});

test("parseNativeEnv does not overwrite process values when merged later", () => {
	const parsed = parseNativeEnv("PORT=7776\n");
	const merged = { ...parsed, PORT: "7777" };

	assert.equal(merged.PORT, "7777");
});
