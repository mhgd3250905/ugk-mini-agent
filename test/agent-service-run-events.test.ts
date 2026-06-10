import test from "node:test";
import assert from "node:assert/strict";
import { AgentService } from "../src/agent/agent-service.js";
import type { ChatStreamEvent } from "../src/types/api.js";
import {
	FakeAgentSessionFactory,
	FakeSession,
	createStore,
	textDelta,
} from "./agent-service-helpers.js";

test("getRunEvents returns buffered events for a completed chat run", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(
		() =>
			new FakeSession(
				"E:/sessions/run-events.jsonl",
				[
					{
						type: "tool_execution_start",
						toolCallId: "tool-readme",
						toolName: "read",
						args: '{\n  "path": "README.md"\n}',
					},
					{
						type: "message_update",
						assistantMessageEvent: {
							type: "text_delta",
							delta: "weather summary",
						},
					},
					{
						type: "tool_execution_end",
						toolCallId: "tool-readme",
						toolName: "read",
						isError: false,
						result: '{\n  "ok": true\n}',
					},
				],
				"weather summary",
			),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const streamedEvents: Array<Record<string, unknown>> = [];
	await service.streamChat({
		conversationId: "manual:run-events",
		message: "query weather",
	}, (event) => {
		streamedEvents.push(event as unknown as Record<string, unknown>);
	});
	const runStarted = streamedEvents.find((event) => event.type === "run_started");
	assert.equal(typeof runStarted?.runId, "string");
	const events = await service.getRunEvents("manual:run-events", String(runStarted?.runId || ""));
	assert.deepEqual(
		events.map((event) => event.type),
		["run_started", "tool_started", "text_delta", "tool_finished", "done"],
	);
	const doneEvent = events.at(-1) as ChatStreamEvent | undefined;
	assert.ok(doneEvent && doneEvent.type === "done");
	assert.equal(doneEvent.conversationId, "manual:run-events");
	assert.equal(doneEvent.runId, runStarted?.runId);
	assert.equal(doneEvent.text, "weather summary");
	assert.equal(doneEvent.sessionFile, "E:/sessions/run-events.jsonl");
});

test("reuses an existing session when the skill fingerprint changes", async () => {
	const store = await createStore();
	await store.set("manual:existing", "E:/sessions/existing.jsonl", {
		skillFingerprint: "skills-v1",
	});

	const factory = new FakeAgentSessionFactory(
		() => new FakeSession("E:/sessions/new-after-skill-change.jsonl", [textDelta("新的技能集")]),
	);
	factory.skillFingerprint = "skills-v2";
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const result = await service.chat({
		conversationId: "manual:existing",
		message: "继续",
	});

	assert.equal(result.sessionFile, "E:/sessions/new-after-skill-change.jsonl");
	assert.deepEqual(factory.calls, [
		{
			browserScope: "manual-existing",
			conversationId: "manual:existing",
			sessionFile: "E:/sessions/existing.jsonl",
		},
	]);
	const storedConversation = await store.get("manual:existing");
	assert.equal(storedConversation?.sessionFile, "E:/sessions/new-after-skill-change.jsonl");
	assert.equal(storedConversation?.skillFingerprint, "skills-v2");
	assert.equal(storedConversation?.title, "新会话");
	assert.equal(storedConversation?.preview, "");
	assert.equal(storedConversation?.messageCount, 0);
});
