import test from "node:test";
import assert from "node:assert/strict";
import { resolveTaskFactoryBaseUrl } from "../src/team/task-factory-cli.js";

test("task factory CLI defaults to PUBLIC_BASE_URL when present", () => {
	assert.equal(
		resolveTaskFactoryBaseUrl({
			PUBLIC_BASE_URL: "http://127.0.0.1:7778",
			HOST: "127.0.0.1",
			PORT: "7779",
		}),
		"http://127.0.0.1:7778",
	);
});

test("task factory CLI builds default base URL from HOST and PORT", () => {
	assert.equal(
		resolveTaskFactoryBaseUrl({
			HOST: "0.0.0.0",
			PORT: "8890",
		}),
		"http://127.0.0.1:8890",
	);
});
