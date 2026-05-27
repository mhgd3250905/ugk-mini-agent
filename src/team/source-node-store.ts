import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { generateSourceNodeId } from "./ids.js";
import type { TeamCanvasSourceNode, TeamCanvasSourceNodeType, TeamCanvasSourcePortType } from "./types.js";

export interface SourceNodeStoreListOptions {
	includeArchived?: boolean;
}

export interface CreateSourceNodeInput {
	sourceNodeId?: string;
	title: string;
	nodeType: TeamCanvasSourceNodeType;
	outputPort?: {
		id?: string;
		label?: string;
		type?: string;
	};
	content?: TeamCanvasSourceNode["content"];
}

export interface UpdateSourceNodeInput {
	title?: string;
	nodeType?: TeamCanvasSourceNodeType;
	outputPort?: {
		id?: string;
		label?: string;
		type?: string;
	};
	content?: TeamCanvasSourceNode["content"];
}

const SOURCE_NODE_ID_PATTERN = /^source_[A-Za-z0-9_-]{1,80}$/;
const SOURCE_PORT_TYPES = new Set<TeamCanvasSourcePortType>(["string", "md", "json", "html", "file"]);

const now = () => new Date().toISOString();

export function inferSourceNodeOutputType(fileName: string | undefined): TeamCanvasSourcePortType {
	const extension = extname(fileName ?? "").toLowerCase();
	if (extension === ".md" || extension === ".markdown") return "md";
	if (extension === ".json") return "json";
	if (extension === ".html" || extension === ".htm") return "html";
	if (extension === ".txt") return "string";
	return "file";
}

export class SourceNodeStore {
	private readonly filePath: string;

	constructor(private readonly rootDir: string) {
		this.filePath = join(rootDir, "source-nodes.json");
	}

	async list(options: SourceNodeStoreListOptions = {}): Promise<TeamCanvasSourceNode[]> {
		const nodes = await this.readAll();
		return nodes
			.filter(node => options.includeArchived || !node.archived)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}

	async get(sourceNodeId: string): Promise<TeamCanvasSourceNode | null> {
		const nodes = await this.readAll();
		return nodes.find(node => node.sourceNodeId === sourceNodeId) ?? null;
	}

	async create(input: CreateSourceNodeInput): Promise<TeamCanvasSourceNode> {
		const title = validateTitle(input.title);
		const nodeType = validateNodeType(input.nodeType);
		const sourceNodeId = input.sourceNodeId ? validateSourceNodeId(input.sourceNodeId) : generateSourceNodeId();
		const outputPort = normalizeOutputPort(input, nodeType);
		const content = normalizeContent(input.content, nodeType);
		const timestamp = now();
		const node: TeamCanvasSourceNode = {
			schemaVersion: "team/source-node-1",
			sourceNodeId,
			title,
			nodeType,
			outputPort,
			...(content ? { content } : {}),
			createdAt: timestamp,
			updatedAt: timestamp,
			archived: false,
		};
		const nodes = await this.readAll();
		if (nodes.some(existing => existing.sourceNodeId === sourceNodeId)) {
			throw new Error(`source node already exists: ${sourceNodeId}`);
		}
		await this.writeAll([...nodes, node]);
		return node;
	}

	async update(sourceNodeId: string, patch: UpdateSourceNodeInput): Promise<TeamCanvasSourceNode> {
		const nodes = await this.readAll();
		const index = nodes.findIndex(node => node.sourceNodeId === sourceNodeId);
		if (index < 0) throw new Error(`source node not found: ${sourceNodeId}`);
		const existing = nodes[index]!;
		const hasTitle = Object.hasOwn(patch, "title");
		const hasNodeType = Object.hasOwn(patch, "nodeType");
		const hasContent = Object.hasOwn(patch, "content");
		const hasOutputPort = Object.hasOwn(patch, "outputPort");
		const nodeType = hasNodeType ? validateNodeType(patch.nodeType) : existing.nodeType;
		const content = hasContent ? normalizeContent(patch.content, nodeType) : existing.content;
		const outputPort = hasOutputPort
			? normalizeOutputPort({ ...patch, content } as CreateSourceNodeInput, nodeType)
			: hasNodeType || hasContent
				? {
					...existing.outputPort,
					type: nodeType === "text" ? "string" : inferSourceNodeOutputType(content?.fileName),
				}
				: existing.outputPort;
		const updated: TeamCanvasSourceNode = {
			...existing,
			...(hasTitle ? { title: validateTitle(patch.title) } : {}),
			nodeType,
			outputPort,
			...(content ? { content } : {}),
			updatedAt: now(),
		};
		nodes[index] = updated;
		await this.writeAll(nodes);
		return updated;
	}

	async archive(sourceNodeId: string): Promise<TeamCanvasSourceNode> {
		const nodes = await this.readAll();
		const index = nodes.findIndex(node => node.sourceNodeId === sourceNodeId);
		if (index < 0) throw new Error(`source node not found: ${sourceNodeId}`);
		const existing = nodes[index]!;
		if (existing.archived) throw new Error(`source node already archived: ${sourceNodeId}`);
		const archived: TeamCanvasSourceNode = {
			...existing,
			archived: true,
			updatedAt: now(),
		};
		nodes[index] = archived;
		await this.writeAll(nodes);
		return archived;
	}

	private async readAll(): Promise<TeamCanvasSourceNode[]> {
		let content: string;
		try {
			content = await readFile(this.filePath, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw new Error(`source node store read failed: ${(error as Error).message}`);
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(content);
		} catch {
			throw new Error("source node store contains invalid JSON");
		}
		if (!Array.isArray(parsed)) {
			throw new Error("source node store does not contain an array");
		}
		return parsed
			.filter((node: unknown) => (node as Record<string, unknown>)?.schemaVersion === "team/source-node-1")
			.map(node => normalizeStoredNode(node as TeamCanvasSourceNode));
	}

	private async writeAll(nodes: TeamCanvasSourceNode[]): Promise<void> {
		await mkdir(this.rootDir, { recursive: true });
		const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
		try {
			await writeFile(tmp, JSON.stringify(nodes, null, 2), "utf8");
			await rename(tmp, this.filePath);
		} finally {
			await rm(tmp, { force: true }).catch(() => {});
		}
	}
}

function normalizeStoredNode(node: TeamCanvasSourceNode): TeamCanvasSourceNode {
	return {
		...node,
		archived: node.archived ?? false,
	};
}

function validateSourceNodeId(sourceNodeId: string): string {
	if (typeof sourceNodeId !== "string" || !SOURCE_NODE_ID_PATTERN.test(sourceNodeId)) {
		throw new Error("sourceNodeId must be a stable source identifier");
	}
	return sourceNodeId;
}

function validateTitle(title: unknown): string {
	if (typeof title !== "string" || !title.trim()) {
		throw new Error("title must be a non-empty string");
	}
	return title.trim();
}

function validateNodeType(nodeType: unknown): TeamCanvasSourceNodeType {
	if (nodeType !== "text" && nodeType !== "file") {
		throw new Error("nodeType must be text or file");
	}
	return nodeType;
}

function normalizeOutputPort(
	input: CreateSourceNodeInput,
	nodeType: TeamCanvasSourceNodeType,
): TeamCanvasSourceNode["outputPort"] {
	const id = input.outputPort?.id ?? "value";
	if (id !== "value") {
		throw new Error('outputPort.id must be "value"');
	}
	const inferredType = nodeType === "text" ? "string" : inferSourceNodeOutputType(input.content?.fileName);
	const type = input.outputPort?.type ?? inferredType;
	if (typeof type !== "string" || !type.trim()) {
		throw new Error("outputPort.type is required");
	}
	if (!SOURCE_PORT_TYPES.has(type as TeamCanvasSourcePortType)) {
		throw new Error(`outputPort.type must be one of: ${[...SOURCE_PORT_TYPES].join(", ")}`);
	}
	const label = input.outputPort?.label;
	if (label !== undefined && (typeof label !== "string" || !label.trim())) {
		throw new Error("outputPort.label must be a non-empty string");
	}
	return {
		id: "value",
		...(label ? { label: label.trim() } : {}),
		type,
	};
}

function normalizeContent(
	content: TeamCanvasSourceNode["content"] | undefined,
	nodeType: TeamCanvasSourceNodeType,
): TeamCanvasSourceNode["content"] | undefined {
	if (content === undefined) return undefined;
	if (!content || typeof content !== "object" || Array.isArray(content)) {
		throw new Error("content must be an object");
	}
	if (content.text !== undefined && typeof content.text !== "string") {
		throw new Error("content.text must be a string");
	}
	if (content.fileName !== undefined && (typeof content.fileName !== "string" || !content.fileName.trim())) {
		throw new Error("content.fileName must be a non-empty string");
	}
	if (nodeType === "file" && !content.fileName) {
		throw new Error("file source node requires content.fileName");
	}
	if (content.mimeType !== undefined && (typeof content.mimeType !== "string" || !content.mimeType.trim())) {
		throw new Error("content.mimeType must be a non-empty string");
	}
	if (content.storageRef !== undefined && (typeof content.storageRef !== "string" || !content.storageRef.trim())) {
		throw new Error("content.storageRef must be a non-empty string");
	}
	if (content.size !== undefined && (!Number.isFinite(content.size) || content.size < 0)) {
		throw new Error("content.size must be a non-negative number");
	}
	return {
		...(content.text !== undefined ? { text: content.text } : {}),
		...(content.fileName !== undefined ? { fileName: content.fileName.trim() } : {}),
		...(content.mimeType !== undefined ? { mimeType: content.mimeType.trim() } : {}),
		...(content.size !== undefined ? { size: content.size } : {}),
		...(content.storageRef !== undefined ? { storageRef: content.storageRef.trim() } : {}),
	};
}
