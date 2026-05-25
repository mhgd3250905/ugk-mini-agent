import type { TeamTaskInputPort, TeamTaskOutputPort, TeamTaskPortBase, TeamWorkUnitDefinition } from "./types.js";

const PORT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const PORT_TYPE_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;

export function validateTaskPorts(workUnit: TeamWorkUnitDefinition): void {
	validatePortList("workUnit.inputPorts", workUnit.inputPorts);
	validatePortList("workUnit.outputPorts", workUnit.outputPorts);
}

export function findInputPort(workUnit: TeamWorkUnitDefinition, portId: string): TeamTaskInputPort | null {
	return workUnit.inputPorts?.find(port => port.id === portId) ?? null;
}

export function findOutputPort(workUnit: TeamWorkUnitDefinition, portId: string): TeamTaskOutputPort | null {
	return workUnit.outputPorts?.find(port => port.id === portId) ?? null;
}

export function displayPortLabel(port: TeamTaskPortBase): string {
	return typeof port.label === "string" && port.label.trim() ? port.label : port.id;
}

function validatePortList(label: string, ports: TeamTaskPortBase[] | undefined): void {
	if (ports === undefined) return;
	if (!Array.isArray(ports)) {
		throw new Error(`${label} must be an array`);
	}
	const ids = new Set<string>();
	for (const [index, port] of ports.entries()) {
		validatePort(label, index, port);
		if (ids.has(port.id)) {
			throw new Error(`${label} contains duplicate port id: ${port.id}`);
		}
		ids.add(port.id);
	}
}

function validatePort(label: string, index: number, port: TeamTaskPortBase): void {
	if (!port || typeof port !== "object" || Array.isArray(port)) {
		throw new Error(`${label}[${index}] must be an object`);
	}
	if (typeof port.id !== "string" || !PORT_ID_PATTERN.test(port.id)) {
		throw new Error(`${label}[${index}].id must be a stable identifier`);
	}
	if (port.label !== undefined && (typeof port.label !== "string" || !port.label.trim())) {
		throw new Error(`${label}[${index}].label must be a non-empty string`);
	}
	if (typeof port.type !== "string" || !port.type.trim()) {
		throw new Error(`${label}[${index}].type is required`);
	}
	if (!PORT_TYPE_PATTERN.test(port.type)) {
		throw new Error(`${label}[${index}].type must be a stable type identifier`);
	}
}
