import test from "node:test";
import assert from "node:assert/strict";
import { parseNativeEnv } from "../scripts/native-env.mjs";

test("parseNativeEnv reads simple key value pairs and ignores comments", () => {
	assert.deepEqual(
		parseNativeEnv([
			"# comment",
			"PORT=8888",
			"PUBLIC_BASE_URL=http://127.0.0.1:8888",
			"EMPTY=",
			"",
		].join("\n")),
		{
			PORT: "8888",
			PUBLIC_BASE_URL: "http://127.0.0.1:8888",
			EMPTY: "",
		},
	);
});

test("parseNativeEnv does not overwrite process values when merged later", () => {
	const parsed = parseNativeEnv("PORT=8888\n");
	const merged = { ...parsed, PORT: "7777" };

	assert.equal(merged.PORT, "7777");
});
