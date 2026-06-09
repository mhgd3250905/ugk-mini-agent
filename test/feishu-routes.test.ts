import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FeishuSettingsStore } from "../src/integrations/feishu/settings-store.js";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("POST /v1/integrations/feishu/events is not registered on the main server", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/integrations/feishu/events",
		payload: {
			type: "url_verification",
			challenge: "challenge-token",
		},
	});

	assert.equal(response.statusCode, 404);
	await app.close();
});

test("PUT /v1/integrations/feishu/settings stores dynamic app credentials without echoing the secret", async () => {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-feishu-route-"));
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		feishuSettingsStore: new FeishuSettingsStore({
			settingsPath: join(root, "settings.json"),
			env: {},
		}),
	});

	const putResponse = await app.inject({
		method: "PUT",
		url: "/v1/integrations/feishu/settings",
		payload: {
			enabled: true,
			appId: "cli_dynamic",
			appSecret: "secret",
			allowedChatIds: ["oc_chat"],
			activityTargets: [{ type: "feishu_user", openId: "ou_user" }],
		},
	});
	assert.equal(putResponse.statusCode, 200);
	const putBody = putResponse.json();
	assert.equal(putBody.enabled, true);
	assert.equal(putBody.appId, "cli_dynamic");
	assert.equal(putBody.hasAppSecret, true);
	assert.equal("appSecret" in putBody, false);

	const getResponse = await app.inject({
		method: "GET",
		url: "/v1/integrations/feishu/settings",
	});
	assert.equal(getResponse.statusCode, 200);
	assert.deepEqual(getResponse.json().activityTargets, [{ type: "feishu_user", openId: "ou_user" }]);
	await app.close();
});

test("PUT /v1/integrations/feishu/settings rejects credentials with whitespace", async () => {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-feishu-route-"));
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		feishuSettingsStore: new FeishuSettingsStore({
			settingsPath: join(root, "settings.json"),
			env: {},
		}),
	});

	const response = await app.inject({
		method: "PUT",
		url: "/v1/integrations/feishu/settings",
		payload: {
			enabled: true,
			appId: "cli_bad value",
			appSecret: "secret",
		},
	});

	assert.equal(response.statusCode, 400);
	assert.match(response.json().error.message, /appId must not contain whitespace/);
	await app.close();
});
