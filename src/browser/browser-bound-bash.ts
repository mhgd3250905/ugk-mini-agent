import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";

const DEFAULT_BROWSER_ID = "default";
const DEFAULT_CDP_HOST = "127.0.0.1";
const DEFAULT_CDP_PORT = "9222";

export interface BrowserBoundBashEnvironmentInput {
	workspaceRoot: string;
	browserId?: string;
	browserScope?: string;
	binDir?: string;
	env?: NodeJS.ProcessEnv;
}

export async function prepareBrowserBoundBashEnvironment(
	input: BrowserBoundBashEnvironmentInput,
): Promise<Record<string, string>> {
	const env: Record<string, string> = {};
	const sourceEnv = input.env ?? process.env;
	const browserId = normalizeBrowserId(input.browserId) ?? normalizeBrowserId(sourceEnv.WEB_ACCESS_BROWSER_ID) ?? normalizeBrowserId(sourceEnv.UGK_DEFAULT_BROWSER_ID);
	if (input.browserScope) {
		env.CLAUDE_AGENT_ID = input.browserScope;
		env.CLAUDE_HOOK_AGENT_ID = input.browserScope;
		env.agent_id = input.browserScope;
		env.UGK_REQUIRE_SCOPED_BROWSER_PROXY = "true";
	}
	if (browserId) {
		const scopedInstance = resolveScopedBrowserInstance(browserId, sourceEnv);
		env.WEB_ACCESS_BROWSER_ID = scopedInstance.browserId;
		env.UGK_DEFAULT_BROWSER_ID = scopedInstance.browserId;
		env.WEB_ACCESS_CDP_HOST = scopedInstance.cdpHost;
		env.WEB_ACCESS_CDP_PORT = String(scopedInstance.cdpPort);
		env.UGK_BROWSER_INSTANCES_JSON = JSON.stringify([scopedInstance]);
	}
	if (!input.browserId && !input.browserScope) {
		return env;
	}

	const binDir = input.binDir ?? join(input.workspaceRoot, ".data", "browser-bin");
	await mkdir(binDir, { recursive: true });
	const curlWrapperPath = join(binDir, process.platform === "win32" ? "curl.cmd" : "curl");
	const curlWrapperScript = buildCurlBrowserBindingWrapper();
	if (process.platform === "win32") {
		await writeFile(join(binDir, "curl-browser-binding.mjs"), curlWrapperScript, "utf8");
		await writeFile(curlWrapperPath, "@echo off\r\nnode \"%~dp0curl-browser-binding.mjs\" %*\r\n", "utf8");
	} else {
		await writeFile(curlWrapperPath, curlWrapperScript, "utf8");
		await chmod(curlWrapperPath, 0o755);
	}

	const currentPath = input.env?.PATH ?? input.env?.Path ?? process.env.PATH ?? "";
	env.PATH = currentPath ? `${binDir}${delimiter}${currentPath}` : binDir;
	return env;
}

interface ScopedBrowserInstance {
	browserId: string;
	cdpHost: string;
	cdpPort: number;
}

function normalizeBrowserId(value: unknown): string | undefined {
	const browserId = String(value || "").trim();
	return /^[a-z][a-z0-9-]{0,62}$/.test(browserId) ? browserId : undefined;
}

function normalizeCdpPort(value: unknown): number {
	const port = Number(value);
	return Number.isInteger(port) && port > 0 && port <= 65535 ? port : Number(DEFAULT_CDP_PORT);
}

function normalizeBrowserInstance(input: unknown): ScopedBrowserInstance | undefined {
	if (!input || typeof input !== "object") return undefined;
	const record = input as Record<string, unknown>;
	const browserId = normalizeBrowserId(record.browserId);
	const cdpHost = String(record.cdpHost || "").trim();
	const cdpPort = normalizeCdpPort(record.cdpPort);
	if (!browserId || !cdpHost) return undefined;
	return { browserId, cdpHost, cdpPort };
}

function readBrowserInstances(env: NodeJS.ProcessEnv): ScopedBrowserInstance[] {
	const raw = String(env.UGK_BROWSER_INSTANCES_JSON || "").trim();
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.map(normalizeBrowserInstance).filter(isScopedBrowserInstance) : [];
	} catch {
		return [];
	}
}

function isScopedBrowserInstance(value: ScopedBrowserInstance | undefined): value is ScopedBrowserInstance {
	return Boolean(value);
}

function resolveScopedBrowserInstance(browserId: string, env: NodeJS.ProcessEnv): ScopedBrowserInstance {
	const instances = readBrowserInstances(env);
	return instances.find((entry) => entry.browserId === browserId) ?? {
		browserId,
		cdpHost: String(env.WEB_ACCESS_CDP_HOST || DEFAULT_CDP_HOST),
		cdpPort: normalizeCdpPort(env.WEB_ACCESS_CDP_PORT),
	};
}

function buildCurlBrowserBindingWrapper(): string {
	return `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const realCurl = process.platform === 'win32' ? 'curl.exe' : existsSync('/usr/bin/curl') ? '/usr/bin/curl' : '/usr/local/bin/curl';
const scope = process.env.CLAUDE_AGENT_ID || process.env.CLAUDE_HOOK_AGENT_ID || process.env.agent_id || '';

function appendMeta(raw) {
  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost):3456(\\/|$)/.test(raw)) {
    return raw;
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  if (scope && !parsed.searchParams.has('metaAgentScope')) {
    parsed.searchParams.set('metaAgentScope', scope);
  }
  return parsed.toString();
}

const result = spawnSync(realCurl, process.argv.slice(2).map(appendMeta), {
  stdio: 'inherit',
  ...(process.platform === 'win32' ? { windowsHide: true } : {}),
});
if (typeof result.status === 'number') {
  process.exit(result.status);
}
if (result.signal) {
  process.kill(process.pid, result.signal);
}
process.exit(1);
`;
}
