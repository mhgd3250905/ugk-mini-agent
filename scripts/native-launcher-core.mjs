export function parseWindowsNetstatListeningPids(output, port) {
	const selectedPort = normalizePort(port);
	const pids = new Set();
	for (const line of String(output || "").split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || !trimmed.toUpperCase().startsWith("TCP ")) {
			continue;
		}
		const columns = trimmed.split(/\s+/);
		if (columns.length < 5 || columns[3].toUpperCase() !== "LISTENING") {
			continue;
		}
		if (!endpointUsesPort(columns[1], selectedPort)) {
			continue;
		}
		const pid = Number(columns[4]);
		if (Number.isInteger(pid) && pid > 0) {
			pids.add(pid);
		}
	}
	return [...pids].sort((left, right) => left - right);
}

export function upsertNativeEnvContent(content, options) {
	const host = String(options.host || "127.0.0.1").trim() || "127.0.0.1";
	const port = normalizePort(options.port);
	const replacements = new Map([
		["HOST", host],
		["PORT", String(port)],
		["PUBLIC_BASE_URL", localPublicBaseUrl(port)],
	]);
	const seen = new Set();
	const lines = String(content || "").split(/\r?\n/);
	const hadTrailingNewline = /\r?\n$/.test(String(content || ""));
	const nextLines = lines.map((line, index) => {
		if (index === lines.length - 1 && line === "" && hadTrailingNewline) {
			return line;
		}
		const match = /^(\s*)(HOST|PORT|PUBLIC_BASE_URL)(\s*=).*$/.exec(line);
		if (!match) {
			return line;
		}
		const key = match[2];
		seen.add(key);
		return `${match[1]}${key}${match[3]}${replacements.get(key)}`;
	});

	for (const [key, value] of replacements) {
		if (!seen.has(key)) {
			if (nextLines.length > 0 && nextLines[nextLines.length - 1] === "") {
				nextLines.splice(nextLines.length - 1, 0, `${key}=${value}`);
			} else {
				nextLines.push(`${key}=${value}`);
			}
		}
	}

	if (nextLines.length === 0 || nextLines[nextLines.length - 1] !== "") {
		nextLines.push("");
	}
	return nextLines.join("\n");
}

export function normalizePort(value, fallback = undefined) {
	const parsed = Number(value);
	if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
		return parsed;
	}
	if (fallback !== undefined) {
		return normalizePort(fallback);
	}
	throw new Error("PORT must be an integer between 1 and 65535");
}

export function parseLauncherArgs(argv) {
	const result = {
		askPort: false,
		autoKill: true,
		dryRun: false,
		yes: false,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--port") {
			result.port = normalizePort(argv[++index]);
			continue;
		}
		if (arg.startsWith("--port=")) {
			result.port = normalizePort(arg.slice("--port=".length));
			continue;
		}
		if (arg === "--host") {
			result.host = String(argv[++index] || "").trim();
			continue;
		}
		if (arg.startsWith("--host=")) {
			result.host = arg.slice("--host=".length).trim();
			continue;
		}
		if (arg === "--ask-port") {
			result.askPort = true;
			continue;
		}
		if (arg === "--no-kill") {
			result.autoKill = false;
			continue;
		}
		if (arg === "--yes" || arg === "-y") {
			result.yes = true;
			continue;
		}
		if (arg === "--dry-run") {
			result.dryRun = true;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			result.help = true;
			continue;
		}
		throw new Error(`Unknown launcher argument: ${arg}`);
	}
	return result;
}

function endpointUsesPort(endpoint, port) {
	const text = String(endpoint || "");
	if (text.endsWith(`:${port}`)) {
		return true;
	}
	return text.endsWith(`]:${port}`);
}

function localPublicBaseUrl(port) {
	return `http://127.0.0.1:${port}`;
}
