import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 3000;

const DOCKER_PROCESS_NAMES = new Set([
	"com.docker.backend",
	"com.docker.proxy",
	"docker",
	"docker-proxy",
	"wslrelay",
]);

export function parseWindowsNetstat(output, port = DEFAULT_PORT) {
	const listeners = [];
	const suffix = `:${port}`;
	for (const line of output.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("TCP")) {
			continue;
		}
		const parts = trimmed.split(/\s+/);
		if (parts.length < 5) {
			continue;
		}
		const [, localAddress, , state, pid] = parts;
		if (state !== "LISTENING" || !localAddress.endsWith(suffix)) {
			continue;
		}
		listeners.push({
			protocol: "tcp",
			localAddress,
			pid,
		});
	}
	return listeners;
}

export function findLoopbackShadows(listeners, processMap) {
	return listeners.filter((listener) => {
		if (!isLoopbackAddress(listener.localAddress)) {
			return false;
		}
		const processInfo = processMap.get(listener.pid);
		return !isDockerProcess(processInfo?.name);
	});
}

function isLoopbackAddress(localAddress) {
	return (
		localAddress.startsWith("127.") ||
		localAddress.startsWith("[::1]") ||
		localAddress.startsWith("localhost:")
	);
}

function isDockerProcess(name) {
	return Boolean(name && DOCKER_PROCESS_NAMES.has(name.toLowerCase()));
}

function readWindowsListeners(port) {
	const output = execFileSync("netstat", ["-ano", "-p", "tcp"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return parseWindowsNetstat(output, port);
}

function readWindowsProcessMap(pids) {
	const processMap = new Map();
	for (const pid of pids) {
		try {
			const output = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			}).trim();
			const row = parseTasklistCsvLine(output.split(/\r?\n/).find((line) => line.trim()) ?? "");
			processMap.set(pid, {
				name: row?.[0] ? row[0].replace(/\.exe$/i, "") : "unknown",
				pid,
			});
		} catch {
			processMap.set(pid, { name: "unknown", pid });
		}
	}
	return processMap;
}

function parseTasklistCsvLine(line) {
	if (!line || line.includes("INFO:")) {
		return undefined;
	}
	const values = [];
	let current = "";
	let quoted = false;
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (char === '"' && line[index + 1] === '"') {
			current += '"';
			index += 1;
			continue;
		}
		if (char === '"') {
			quoted = !quoted;
			continue;
		}
		if (char === "," && !quoted) {
			values.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	values.push(current);
	return values;
}

function readUnixListeners(port) {
	const commands = [
		["lsof", ["-nP", "-iTCP:" + port, "-sTCP:LISTEN"]],
		["ss", ["-ltnp"]],
	];
	for (const [command, args] of commands) {
		try {
			const output = execFileSync(command, args, {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			});
			return command === "lsof" ? parseLsof(output, port) : parseSs(output, port);
		} catch {
			// Try the next local inspector.
		}
	}
	return [];
}

function parseLsof(output, port) {
	const listeners = [];
	for (const line of output.split(/\r?\n/).slice(1)) {
		const parts = line.trim().split(/\s+/);
		if (parts.length < 9) {
			continue;
		}
		const [name, pid] = parts;
		const address = parts.at(-2) ?? "";
		if (!address.endsWith(`:${port}`)) {
			continue;
		}
		listeners.push({ protocol: "tcp", localAddress: address, pid, name });
	}
	return listeners;
}

function parseSs(output, port) {
	const listeners = [];
	for (const line of output.split(/\r?\n/).slice(1)) {
		const parts = line.trim().split(/\s+/);
		if (parts.length < 4) {
			continue;
		}
		const localAddress = parts[3];
		if (!localAddress.endsWith(`:${port}`)) {
			continue;
		}
		const processMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
		listeners.push({
			protocol: "tcp",
			localAddress,
			pid: processMatch?.[2] ?? "unknown",
			name: processMatch?.[1] ?? "unknown",
		});
	}
	return listeners;
}

function buildProcessMapFromListeners(listeners) {
	return new Map(
		listeners.map((listener) => [
			listener.pid,
			{
				name: listener.name ?? "unknown",
				pid: listener.pid,
			},
		]),
	);
}

function formatListener(listener, processMap) {
	const processInfo = processMap.get(listener.pid);
	return `${listener.localAddress.padEnd(22)} pid=${listener.pid.padEnd(8)} process=${processInfo?.name ?? "unknown"}`;
}

function main() {
	const portArg = process.argv[2];
	const port = portArg ? Number(portArg) : DEFAULT_PORT;
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		console.error(`Invalid port: ${portArg}`);
		process.exit(2);
	}

	const listeners = process.platform === "win32" ? readWindowsListeners(port) : readUnixListeners(port);
	const processMap = process.platform === "win32"
		? readWindowsProcessMap([...new Set(listeners.map((listener) => listener.pid))])
		: buildProcessMapFromListeners(listeners);
	const shadows = findLoopbackShadows(listeners, processMap);

	console.log(`Local port ${port} listeners:`);
	if (listeners.length === 0) {
		console.log("  none");
	} else {
		for (const listener of listeners) {
			console.log(`  ${formatListener(listener, processMap)}`);
		}
	}

	if (shadows.length > 0) {
		console.error("");
		console.error(`Shadow localhost listener detected on port ${port}.`);
		console.error("The browser may hit this host process instead of Docker's published ugk-pi service.");
		for (const listener of shadows) {
			console.error(`  ${formatListener(listener, processMap)}`);
		}
		console.error("");
		console.error("Stop the host process or move it to another port, then rerun this doctor.");
		if (process.platform === "win32") {
			console.error("Example from an elevated PowerShell:");
			console.error(`  taskkill /PID ${shadows[0].pid} /T /F`);
		}
		process.exit(1);
	}

	console.log("");
	console.log(`OK: no non-Docker loopback listener is shadowing port ${port}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
