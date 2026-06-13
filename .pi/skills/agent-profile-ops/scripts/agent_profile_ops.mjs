#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const DEFAULT_TIMEOUT_MS = 120000;

function printUsage() {
	console.log(`agent_profile_ops

Usage:
  node .pi/skills/agent-profile-ops/scripts/agent_profile_ops.mjs list [--dry-run]
  node .pi/skills/agent-profile-ops/scripts/agent_profile_ops.mjs dispatch --agent <agentId-or-name> --message <task> [--dry-run]
  node .pi/skills/agent-profile-ops/scripts/agent_profile_ops.mjs current

Dispatch compatibility:
  - agent-profile targets call POST /v1/agents/:agentId/chat
  - legacy-subagent targets are resolved from .pi/agents and runtime/agents-user
  - agent-profile matches take precedence when ids collide

Environment:
  UGK_INTERNAL_BASE_URL, PUBLIC_BASE_URL, PORT
`);
}

function parseArgs(argv) {
	const [command, ...rest] = argv;
	const options = { command: command || "help" };
	for (let index = 0; index < rest.length; index += 1) {
		const token = rest[index];
		if (token === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (token === "--agent") {
			options.agent = rest[index + 1] || "";
			index += 1;
			continue;
		}
		if (token === "--message") {
			options.message = rest[index + 1] || "";
			index += 1;
			continue;
		}
		if (token === "--base-url") {
			options.baseUrl = rest[index + 1] || "";
			index += 1;
			continue;
		}
		if (token === "--agents-json") {
			options.agentsJson = rest[index + 1] || "";
			index += 1;
			continue;
		}
		if (token === "--legacy-json") {
			options.legacyJson = rest[index + 1] || "";
			index += 1;
			continue;
		}
	}
	return options;
}

function normalizeTarget(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[\s_-]+/g, "");
}

function parseNativeEnv(content) {
	const values = {};
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const separatorIndex = trimmed.indexOf("=");
		if (separatorIndex < 0) continue;
		const key = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).trim();
		if (key) values[key] = value;
	}
	return values;
}

function loadDefaultNativeEnv() {
	try {
		return parseNativeEnv(readFileSync(resolve(".env.native.example"), "utf8"));
	} catch {
		return {};
	}
}

function localBaseUrlFromEnv(env) {
	const defaults = loadDefaultNativeEnv();
	const port = String(env.PORT || defaults.PORT || "").trim();
	const host = String(env.HOST || defaults.HOST || "127.0.0.1").trim();
	if (!port) {
		throw new Error("PORT is not configured");
	}
	const urlHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
	return `http://${urlHost}:${port}`;
}

function resolveBaseUrl(options = {}) {
	return String(
		options.baseUrl ||
			process.env.UGK_INTERNAL_BASE_URL ||
			process.env.PUBLIC_BASE_URL ||
			localBaseUrlFromEnv(process.env),
	).replace(/\/+$/, "");
}

async function requestJson(url, options = {}) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			...options,
			signal: controller.signal,
			headers: {
				accept: "application/json",
				...(options.body ? { "content-type": "application/json" } : {}),
				...(options.headers || {}),
			},
		});
		const body = await response.json().catch(() => ({}));
		if (!response.ok) {
			const message = body?.error?.message || body?.message || `${response.status} ${response.statusText}`;
			const error = new Error(message);
			error.statusCode = response.status;
			error.body = body;
			throw error;
		}
		return body;
	} finally {
		clearTimeout(timeout);
	}
}

function parseJsonOption(raw, fallback) {
	if (!raw) {
		return fallback;
	}
	const parsed = JSON.parse(raw);
	return parsed;
}

async function loadAgentProfiles(baseUrl, options = {}) {
	if (options.agentsJson) {
		const parsed = parseJsonOption(options.agentsJson, []);
		return Array.isArray(parsed) ? parsed : parsed.agents || [];
	}
	if (options.dryRun) {
		return [
			{ agentId: "main", name: "主 Agent", description: "默认综合 agent" },
			{ agentId: "search", name: "搜索 Agent", description: "用于搜索、查证和资料整理" },
		];
	}
	const payload = await requestJson(`${baseUrl}/v1/agents`);
	return Array.isArray(payload?.agents) ? payload.agents : [];
}

function safeReadDirectory(directoryPath) {
	try {
		if (!statSync(directoryPath).isDirectory()) {
			return [];
		}
		return readdirSync(directoryPath, { withFileTypes: true });
	} catch {
		return [];
	}
}

function parseFrontmatter(raw) {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
	if (!match) {
		return {};
	}
	const values = {};
	for (const line of match[1].split(/\r?\n/)) {
		const item = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
		if (item) {
			values[item[1]] = item[2].replace(/^["']|["']$/g, "");
		}
	}
	return values;
}

function discoverLegacySubagents(projectRoot = process.cwd(), options = {}) {
	if (options.legacyJson) {
		const parsed = parseJsonOption(options.legacyJson, []);
		return Array.isArray(parsed) ? parsed : parsed.legacySubagents || [];
	}
	const roots = [
		{ root: join(projectRoot, ".pi", "agents"), source: "system" },
		{ root: join(projectRoot, "runtime", "agents-user"), source: "user" },
	];
	const byName = new Map();
	for (const { root, source } of roots) {
		for (const entry of safeReadDirectory(root)) {
			if (!entry.name.endsWith(".md") || (!entry.isFile() && !entry.isSymbolicLink())) {
				continue;
			}
			const filePath = join(root, entry.name);
			const raw = readFileSync(filePath, "utf8");
			const frontmatter = parseFrontmatter(raw);
			const name = String(frontmatter.name || basename(entry.name, ".md")).trim();
			if (!name) {
				continue;
			}
			byName.set(name, {
				agentId: name,
				name,
				description: String(frontmatter.description || "").trim(),
				type: "legacy-subagent",
				source,
			});
		}
	}
	return [...byName.values()].sort((left, right) => left.agentId.localeCompare(right.agentId));
}

function toAgentProfileTarget(agent) {
	return {
		agentId: String(agent.agentId || "").trim(),
		name: String(agent.name || agent.agentId || "").trim(),
		description: String(agent.description || "").trim(),
		type: "agent-profile",
	};
}

function listTargets(agentProfiles, legacySubagents) {
	return {
		agentProfiles: agentProfiles.map(toAgentProfileTarget).filter((agent) => agent.agentId),
		legacySubagents: legacySubagents.map((agent) => ({
			agentId: String(agent.agentId || agent.name || "").trim(),
			name: String(agent.name || agent.agentId || "").trim(),
			description: String(agent.description || "").trim(),
			type: "legacy-subagent",
			...(agent.source ? { source: agent.source } : {}),
		})).filter((agent) => agent.agentId),
	};
}

function aliasesForTarget(target) {
	return [
		target.agentId,
		target.name,
		String(target.name || "").replace(/\s*agent\s*$/i, ""),
		String(target.name || "").replace(/\s*智能体\s*$/, ""),
	].map(normalizeTarget).filter(Boolean);
}

function resolveDispatchTarget(inputAgent, targets, preferredType) {
	const requested = normalizeTarget(inputAgent);
	if (!requested) {
		throw new Error("--agent is required");
	}
	const typedTargets = [
		...targets.agentProfiles.map((target) => ({ ...target, type: "agent-profile" })),
		...targets.legacySubagents.map((target) => ({ ...target, type: "legacy-subagent" })),
	].filter((target) => !preferredType || target.type === preferredType);

	const exactIdMatches = typedTargets.filter((target) => normalizeTarget(target.agentId) === requested);
	const matches = exactIdMatches.length > 0
		? exactIdMatches
		: typedTargets.filter((target) => aliasesForTarget(target).includes(requested));

	if (matches.length === 0) {
		const error = new Error(`Unknown agent target: ${inputAgent}`);
		error.code = "UNKNOWN_TARGET";
		error.targets = targets;
		throw error;
	}
	const profileMatches = matches.filter((target) => target.type === "agent-profile");
	if (!preferredType && profileMatches.length === 1) {
		return profileMatches[0];
	}
	if (matches.length === 1) {
		return matches[0];
	}
	const error = new Error(`Ambiguous agent target: ${inputAgent}`);
	error.code = "AMBIGUOUS_TARGET";
	error.matches = matches;
	throw error;
}

function buildDelegationConversationId(sourceAgentId, targetAgentId) {
	const source = String(sourceAgentId || "main").replace(/[^a-zA-Z0-9_-]+/g, "-");
	const target = String(targetAgentId || "agent").replace(/[^a-zA-Z0-9_-]+/g, "-");
	return `delegation:${source}:${target}:${Date.now().toString(36)}`;
}

async function dispatchToAgentProfile(baseUrl, target, message, options = {}) {
	const conversationId = buildDelegationConversationId(options.sourceAgentId, target.agentId);
	const payload = {
		conversationId,
		message,
		userId: "agent-profile-ops",
	};
	const endpoint = `${baseUrl}/v1/agents/${encodeURIComponent(target.agentId)}/chat`;
	if (options.dryRun) {
		return {
			targetType: "agent-profile",
			targetId: target.agentId,
			targetName: target.name,
			endpoint: "POST /v1/agents/:agentId/chat",
			url: endpoint,
			payload,
		};
	}
	const response = await requestJson(endpoint, {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return {
		targetType: "agent-profile",
		targetId: target.agentId,
		targetName: target.name,
		conversationId,
		response,
	};
}

function dispatchToLegacySubagent(target, message, options = {}) {
	const result = {
		targetType: "legacy-subagent",
		targetId: target.agentId,
		targetName: target.name,
		message,
		status: "unsupported",
		error: "legacy subagent dispatch is not available through agent_profile_ops yet",
	};
	if (options.dryRun) {
		return {
			...result,
			status: "dry-run",
		};
	}
	return result;
}

async function run(options) {
	const command = options.command;
	if (command === "help" || command === "--help" || command === "-h") {
		printUsage();
		return 0;
	}
	const baseUrl = resolveBaseUrl(options);
	const agentProfiles = await loadAgentProfiles(baseUrl, options);
	const legacySubagents = discoverLegacySubagents(resolve(process.cwd()), options);
	const targets = listTargets(agentProfiles, legacySubagents);

	if (command === "list") {
		console.log(JSON.stringify(targets, null, 2));
		return 0;
	}
	if (command === "current") {
		console.log(JSON.stringify({ baseUrl }, null, 2));
		return 0;
	}
	if (command === "dispatch") {
		const message = String(options.message || "").trim();
		if (!message) {
			throw new Error("--message is required");
		}
		const target = resolveDispatchTarget(options.agent, targets, options.targetType);
		const result = target.type === "agent-profile"
			? await dispatchToAgentProfile(baseUrl, target, message, options)
			: dispatchToLegacySubagent(target, message, options);
		console.log(JSON.stringify(result, null, 2));
		return result.status === "unsupported" ? 2 : 0;
	}
	printUsage();
	return 1;
}

export {
	aliasesForTarget,
	discoverLegacySubagents,
	listTargets,
	normalizeTarget,
	resolveDispatchTarget,
};

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("agent_profile_ops.mjs")) {
	run(parseArgs(process.argv.slice(2))).then((code) => {
		process.exitCode = code;
	}).catch((error) => {
		const payload = {
			error: error instanceof Error ? error.message : String(error),
			...(error?.code ? { code: error.code } : {}),
			...(error?.matches ? { matches: error.matches } : {}),
			...(error?.targets ? { targets: error.targets } : {}),
		};
		console.error(JSON.stringify(payload, null, 2));
		process.exitCode = 1;
	});
}
