import type { TeamOutputValidationResult, TeamTask, TeamTaskOutputCheck } from "./types.js";

type ValidationKind = TeamOutputValidationResult["kind"];
type ValidationCheck = TeamOutputValidationResult["checks"][number];

interface ContentCandidate {
	ref: string;
	content: string;
}

export interface TeamOutputValidationInput {
	workspace: TeamOutputWorkspaceReader;
	runId: string;
	task: TeamTask;
	attemptId: string;
	contents?: ContentCandidate[];
}

export interface TeamOutputWorkspaceReader {
	readAttemptFile(runId: string, taskId: string, attemptId: string, fileName: string): Promise<string | null>;
	readAttemptRoleWorkspaceFile(runId: string, attemptId: string, role: "worker" | "checker" | "watcher", relativePath: string): Promise<{ content: string; normalizedRef: string } | null>;
	readRunScopedFile(runId: string, ref: string): Promise<string | null>;
}

interface ResolvedReference {
	ok: boolean;
	ref: string;
	content?: string;
	normalizedRef?: string;
	message?: string;
}

function okResult(
	kind: ValidationKind,
	sourceRef: string | null,
	checks: ValidationCheck[],
	normalizedRef?: string | null,
	items?: Array<Record<string, unknown>>,
): TeamOutputValidationResult {
	return { ok: true, kind, sourceRef, checks, normalizedRef, ...(items ? { items } : {}) };
}

function failResult(kind: ValidationKind, sourceRef: string | null, checks: ValidationCheck[], normalizedRef?: string | null): TeamOutputValidationResult {
	return { ok: false, kind, sourceRef, checks, normalizedRef };
}

export function getOutputCheckForTask(task: TeamTask): { kind: ValidationKind; check: TeamTaskOutputCheck | null } {
	if (task.type === "discovery" && task.discovery?.outputKey) {
		return {
			kind: "discovery",
			check: { type: "json_items", outputKey: task.discovery.outputKey, requiredFields: ["id"] },
		};
	}
	if (task.outputCheck) return { kind: task.outputCheck.type, check: task.outputCheck };
	return { kind: "none", check: null };
}

export async function validateTeamOutput(input: TeamOutputValidationInput): Promise<TeamOutputValidationResult> {
	const { kind, check } = getOutputCheckForTask(input.task);
	if (!check) return okResult("none", null, [{ name: "no_output_check", ok: true }], null);
	if (check.type === "file_exists") return validateFileExists(input, check, kind);

	const candidates = input.contents && input.contents.length > 0
		? input.contents
		: await readDefaultAttemptCandidates(input.workspace, input.runId, input.task.id, input.attemptId);
	const failures: ValidationCheck[] = [];

	for (const candidate of candidates) {
		const direct = validateContent(candidate.content, check, kind, candidate.ref, candidate.ref);
		if (direct.ok) return direct;
		failures.push(...direct.checks);

		const refs = extractReferencedPaths(candidate.content);
		for (const ref of refs) {
			const resolved = await resolveReference(input.workspace, input.runId, input.attemptId, ref);
			if (!resolved.ok) {
				failures.push({ name: "referenced_file_safe", ok: false, message: resolved.message, path: ref });
				continue;
			}
			if (resolved.content === undefined) {
				failures.push({ name: "referenced_file_exists", ok: false, message: `referenced file not found: ${ref}`, path: ref });
				continue;
			}
			const referenced = validateContent(resolved.content, check, kind, resolved.ref, resolved.normalizedRef ?? resolved.ref);
			if (referenced.ok) return referenced;
			failures.push(...referenced.checks);
		}
	}

	return failResult(kind, null, compactChecks(failures.length > 0 ? failures : [{ name: "content_present", ok: false, message: "no candidate output content found" }]), null);
}

async function readDefaultAttemptCandidates(workspace: TeamOutputWorkspaceReader, runId: string, taskId: string, attemptId: string): Promise<ContentCandidate[]> {
	const candidates: ContentCandidate[] = [];
	for (const fileName of ["accepted-result.md", "worker-output-001.md"]) {
		const content = await workspace.readAttemptFile(runId, taskId, attemptId, fileName);
		if (content) candidates.push({ ref: fileName, content });
	}
	return candidates;
}

async function validateFileExists(input: TeamOutputValidationInput, check: Extract<TeamTaskOutputCheck, { type: "file_exists" }>, kind: ValidationKind): Promise<TeamOutputValidationResult> {
	const refs = check.path ? [check.path] : (input.contents ?? []).flatMap(candidate => extractReferencedPaths(candidate.content));
	if (refs.length === 0) {
		return failResult(kind, null, [{ name: "file_path", ok: false, message: "file_exists requires a path or referenced file" }], null);
	}
	for (const ref of refs) {
		const resolved = await resolveReference(input.workspace, input.runId, input.attemptId, ref);
		if (!resolved.ok) {
			return failResult(kind, ref, [{ name: "referenced_file_safe", ok: false, message: resolved.message, path: ref }], null);
		}
		if (resolved.content !== undefined) {
			return okResult(kind, ref, [{ name: "referenced_file_exists", ok: true, path: ref }], resolved.normalizedRef ?? ref);
		}
	}
	return failResult(kind, refs[0] ?? null, refs.map(ref => ({ name: "referenced_file_exists", ok: false, message: `referenced file not found: ${ref}`, path: ref })), null);
}

async function resolveReference(workspace: TeamOutputWorkspaceReader, runId: string, attemptId: string, ref: string): Promise<ResolvedReference> {
	const clean = cleanRef(ref);
	if (!clean) return { ok: false, ref, message: "empty referenced file path" };
	if (clean.includes("..")) return { ok: false, ref: clean, message: "referenced file outside run" };
	if (/^[a-zA-Z]:\//.test(clean)) return { ok: false, ref: clean, message: "absolute host paths are not allowed" };
	if (clean.startsWith("/") && !clean.startsWith(`/app/.data/team/runs/${runId}/`)) {
		return { ok: false, ref: clean, message: "absolute path outside current run is not allowed" };
	}

	const roleMatch = clean.match(/^(worker|checker|watcher)\/(.+)$/);
	if (roleMatch) {
		const loaded = await workspace.readAttemptRoleWorkspaceFile(runId, attemptId, roleMatch[1] as "worker" | "checker" | "watcher", roleMatch[2]!);
		return loaded
			? { ok: true, ref: clean, content: loaded.content, normalizedRef: loaded.normalizedRef }
			: { ok: true, ref: clean };
	}

	const workerRelative = clean.match(/^(output|work)\/(.+)$/);
	if (workerRelative) {
		const loaded = await workspace.readAttemptRoleWorkspaceFile(runId, attemptId, "worker", clean);
		return loaded
			? { ok: true, ref: clean, content: loaded.content, normalizedRef: loaded.normalizedRef }
			: { ok: true, ref: clean };
	}

	if (clean.startsWith(`/app/.data/team/runs/${runId}/`) || clean.startsWith(`runs/${runId}/`)) {
		const content = await workspace.readRunScopedFile(runId, clean);
		return content === null ? { ok: true, ref: clean } : { ok: true, ref: clean, content, normalizedRef: clean };
	}

	return { ok: false, ref: clean, message: "referenced file must be run-scoped" };
}

function validateContent(content: string, check: TeamTaskOutputCheck, kind: ValidationKind, sourceRef: string, normalizedRef?: string | null): TeamOutputValidationResult {
	if (check.type === "json_items") return validateJsonItems(content, check, kind, sourceRef, normalizedRef);
	if (check.type === "json_object") return validateJsonObject(content, check, kind, sourceRef, normalizedRef);
	if (check.type === "html_fragment") return validateHtmlFragment(content, check, kind, sourceRef, normalizedRef);
	return failResult(kind, sourceRef, [{ name: "unsupported_check", ok: false, message: `unsupported output check: ${check.type}` }], normalizedRef);
}

function validateJsonItems(content: string, check: Extract<TeamTaskOutputCheck, { type: "json_items" }>, kind: ValidationKind, sourceRef: string, normalizedRef?: string | null): TeamOutputValidationResult {
	const parsed = extractJsonFromContent(content);
	if (parsed.value === null) {
		return failResult(kind, sourceRef, [{ name: "json_parse", ok: false, message: parsed.message }], normalizedRef);
	}
	const outputKey = check.outputKey;
	const arr = check.allowDirectArray && Array.isArray(parsed.value)
		? parsed.value
		: outputKey && parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value)
			? (parsed.value as Record<string, unknown>)[outputKey]
			: null;
	const checks: ValidationCheck[] = [{ name: "json_parse", ok: true }];
	if (!Array.isArray(arr)) {
		checks.push({ name: "outputKey_array", ok: false, message: outputKey ? `missing or non-array outputKey '${outputKey}'` : "expected array output" });
		return failResult(kind, sourceRef, checks, normalizedRef);
	}
	checks.push({ name: "outputKey_array", ok: true, path: outputKey });
	const requiredFields = check.requiredFields ?? [];
	const items: Array<Record<string, unknown>> = [];
	for (let i = 0; i < arr.length; i++) {
		const item = arr[i];
		if (!item || typeof item !== "object" || Array.isArray(item)) {
			checks.push({ name: "item_object", ok: false, message: `item ${i} is not an object` });
			return failResult(kind, sourceRef, checks, normalizedRef);
		}
		const obj = item as Record<string, unknown>;
		items.push(obj);
		for (const field of requiredFields) {
			if (typeof obj[field] !== "string" || !obj[field].trim()) {
				checks.push({ name: field === "id" ? "item_stable_id" : "required_field", ok: false, message: `item ${i} missing required field '${field}'`, path: field });
				return failResult(kind, sourceRef, checks, normalizedRef);
			}
		}
	}
	checks.push({ name: "item_object", ok: true }, { name: "item_stable_id", ok: true });
	return okResult(kind, sourceRef, checks, normalizedRef, items);
}

function validateJsonObject(content: string, check: Extract<TeamTaskOutputCheck, { type: "json_object" }>, kind: ValidationKind, sourceRef: string, normalizedRef?: string | null): TeamOutputValidationResult {
	const parsed = extractJsonFromContent(content);
	const checks: ValidationCheck[] = [];
	if (parsed.value === null) return failResult(kind, sourceRef, [{ name: "json_parse", ok: false, message: parsed.message }], normalizedRef);
	checks.push({ name: "json_parse", ok: true });
	if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
		checks.push({ name: "json_object", ok: false, message: "expected JSON object" });
		return failResult(kind, sourceRef, checks, normalizedRef);
	}
	const obj = parsed.value as Record<string, unknown>;
	for (const field of check.requiredFields ?? []) {
		if (obj[field] === undefined || obj[field] === null || obj[field] === "") {
			checks.push({ name: "required_field", ok: false, message: `missing required field '${field}'`, path: field });
			return failResult(kind, sourceRef, checks, normalizedRef);
		}
	}
	checks.push({ name: "json_object", ok: true });
	return okResult(kind, sourceRef, checks, normalizedRef);
}

function validateHtmlFragment(content: string, check: Extract<TeamTaskOutputCheck, { type: "html_fragment" }>, kind: ValidationKind, sourceRef: string, normalizedRef?: string | null): TeamOutputValidationResult {
	const fragment = extractHtmlFragment(content);
	const checks: ValidationCheck[] = [{ name: "html_fragment_present", ok: fragment.trim().length > 0 }];
	if (!fragment.trim()) return failResult(kind, sourceRef, checks, normalizedRef);
	if (check.requireFence && !/```html\s*[\s\S]*?```/i.test(content)) {
		checks.push({ name: "html_fence", ok: false, message: "expected fenced html fragment" });
		return failResult(kind, sourceRef, checks, normalizedRef);
	}
	for (const substring of check.requiredSubstrings ?? []) {
		if (!fragment.includes(substring)) {
			checks.push({ name: "required_substring", ok: false, message: `missing required substring '${substring}'`, path: substring });
			return failResult(kind, sourceRef, checks, normalizedRef);
		}
	}
	for (const tag of check.forbiddenTags ?? []) {
		if (new RegExp(`<\\s*${escapeRegExp(tag)}\\b`, "i").test(fragment)) {
			checks.push({ name: "forbidden_tag", ok: false, message: `forbidden tag '${tag}'`, path: tag });
			return failResult(kind, sourceRef, checks, normalizedRef);
		}
	}
	checks.push({ name: "required_substring", ok: true }, { name: "forbidden_tag", ok: true });
	return okResult(kind, sourceRef, checks, normalizedRef);
}

function extractJsonFromContent(content: string): { value: unknown | null; message?: string } {
	try { return { value: JSON.parse(content.trim()) }; } catch { /* not pure JSON */ }
	const fenceMatch = content.match(/```json\s*([\s\S]*?)```/i);
	if (fenceMatch) {
		try { return { value: JSON.parse(fenceMatch[1]!.trim()) }; } catch (error) { return { value: null, message: error instanceof Error ? error.message : String(error) }; }
	}
	const braceStart = content.indexOf("{");
	const braceEnd = content.lastIndexOf("}");
	if (braceStart !== -1 && braceEnd > braceStart) {
		try { return { value: JSON.parse(content.slice(braceStart, braceEnd + 1)) }; } catch { /* brace extract failed */ }
	}
	const bracketStart = content.indexOf("[");
	const bracketEnd = content.lastIndexOf("]");
	if (bracketStart !== -1 && bracketEnd > bracketStart) {
		try { return { value: JSON.parse(content.slice(bracketStart, bracketEnd + 1)) }; } catch { /* bracket extract failed */ }
	}
	return { value: null, message: "no parseable JSON found" };
}

function extractHtmlFragment(content: string): string {
	const fenceMatch = content.match(/```html\s*([\s\S]*?)```/i);
	return fenceMatch ? fenceMatch[1]!.trim() : content.trim();
}

function extractReferencedPaths(content: string): string[] {
	const refs: string[] = [];
	const seen = new Set<string>();
	const add = (raw: string) => {
		const clean = cleanRef(raw);
		if (!clean || seen.has(clean)) return;
		seen.add(clean);
		refs.push(clean);
	};
	for (const match of content.matchAll(/`([^`]+)`/g)) add(match[1]!);
	for (const match of content.matchAll(/(?:^|[\s（(：:])((?:\/app\/\.data\/team\/runs\/|runs\/|worker\/|checker\/|watcher\/|output\/|work\/)[^\s（）)\]，。；：,;]+)/g)) add(match[1]!);
	for (const match of content.matchAll(/`(\/[^`]+)`/g)) add(match[1]!);
	return refs;
}

function cleanRef(ref: string): string {
	return ref.trim().replace(/^["'`]+|["'`,.;:，。；：（）)]+$/g, "").replace(/\\/g, "/");
}

function compactChecks(checks: ValidationCheck[]): ValidationCheck[] {
	const seen = new Set<string>();
	const result: ValidationCheck[] = [];
	for (const check of checks) {
		const key = `${check.name}:${check.ok}:${check.message ?? ""}:${check.path ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(check);
	}
	return result;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
