import test from "node:test";
import assert from "node:assert/strict";
import { findLoopbackShadows, parseWindowsNetstat } from "../scripts/local-port-doctor.mjs";

test("local port doctor detects a host loopback listener shadowing Docker", () => {
	const listeners = parseWindowsNetstat(
		[
			"  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       27564",
			"  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       36124",
			"  TCP    [::]:3000              [::]:0                 LISTENING       27564",
		].join("\n"),
		3000,
	);
	const shadows = findLoopbackShadows(
		listeners,
		new Map([
			["27564", { name: "com.docker.backend", pid: "27564" }],
			["36124", { name: "node", pid: "36124" }],
		]),
	);

	assert.deepEqual(
		shadows.map((listener: { localAddress: string }) => listener.localAddress),
		["127.0.0.1:3000"],
	);
});

test("local port doctor allows Docker-owned listeners", () => {
	const listeners = parseWindowsNetstat(
		[
			"  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       27564",
			"  TCP    [::1]:3000             [::]:0                 LISTENING       24596",
		].join("\n"),
		3000,
	);
	const shadows = findLoopbackShadows(
		listeners,
		new Map([
			["27564", { name: "com.docker.backend", pid: "27564" }],
			["24596", { name: "wslrelay", pid: "24596" }],
		]),
	);

	assert.deepEqual(shadows, []);
});
