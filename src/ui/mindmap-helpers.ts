/**
 * Pure view-model helpers for the Team Run vertical mindmap.
 *
 * No DOM dependency. Consumes the same state/plan/attemptsMap shapes
 * that the inline page script receives from the Team API.
 */

export interface MindmapNode {
	id: string;
	title: string;
	status: string;
	nodeType: string;
	summary?: string;
	attemptCount?: number;
	errorSummary?: string;
	resultRef?: string | null;
	parentTaskId?: string | null;
	sourceItemId?: string | null;
	generated?: boolean;
	fallback?: boolean;
	children: MindmapNode[];
}

export function collectRunTaskDefinitions(
	state: { taskDefinitions?: unknown[]; generatedTasks?: unknown[]; tasks?: unknown[] },
	_plan: { tasks?: Array<Record<string, unknown>> },
): Array<Record<string, unknown>> {
	const defs: Array<Record<string, unknown>> = [];
	if (Array.isArray(state.taskDefinitions)) {
		for (const d of state.taskDefinitions) {
			if (d && typeof d === "object") defs.push(d as Record<string, unknown>);
		}
	}
	if (!defs.length && Array.isArray(state.generatedTasks)) {
		for (const d of state.generatedTasks) {
			if (d && typeof d === "object") defs.push(d as Record<string, unknown>);
		}
	}
	if (Array.isArray(state.tasks)) {
		for (const t of state.tasks) {
			if (t && typeof t === "object" && (t as Record<string, unknown>).generated) {
				defs.push(t as Record<string, unknown>);
			}
		}
	}
	return defs;
}

export function describeMindmapNodeType(
	task: Record<string, unknown> | null,
	isGenerated: boolean,
): string {
	if (!task) return "任务";
	const type = task.type;
	if (type === "discovery") return "发现";
	if (type === "for_each") return "逐项处理";
	if (isGenerated) {
		const src = task.generatedSource;
		if (src === "for_each") return "动态子任务";
		if (src === "decomposition") return "拆分子任务";
		return "生成任务";
	}
	return "任务";
}

/**
 * Build a parent → childId[] map using the priority chain:
 *
 * 1. Explicit parentTaskId on generated task definitions.
 * 2. Generated task definitions matched by id against taskStates.
 * 3. sourceItemId cross-reference (child def's sourceItemId matches
 *    a parent task's forEach.itemsFrom or the parent itself generated
 *    that source item). Currently sourceItemId alone cannot uniquely
 *    identify a single parent, so it feeds into orphan detection.
 * 4. Id prefix fallback: `parentId + "__"` → last resort, marked fallback.
 *
 * Returns { byParent, orphanIds, prefixFallbackIds }.
 */
export function getMindmapChildrenByParent(
	planTasks: Array<Record<string, unknown>>,
	generatedDefs: Array<Record<string, unknown>>,
	taskStates: Record<string, unknown>,
): {
	byParent: Record<string, string[]>;
	orphanIds: string[];
	prefixFallbackIds: string[];
} {
	const planIdSet = new Set<string>();
	for (const t of planTasks) {
		if (t.id) planIdSet.add(t.id as string);
	}

	// Build defById for quick lookup
	const defById = new Map<string, Record<string, unknown>>();
	for (const d of generatedDefs) {
		if (d && d.id) defById.set(d.id as string, d);
	}

	// Track which children have been assigned and how
	const assigned = new Set<string>();
	const byParent: Record<string, string[]> = {};
	const prefixFallbackIds = new Set<string>();

	function addChild(parentId: string, childId: string, isPrefixFallback: boolean) {
		if (!planIdSet.has(parentId)) return false;
		if (!byParent[parentId]) byParent[parentId] = [];
		if (!byParent[parentId].includes(childId)) {
			byParent[parentId].push(childId);
		}
		assigned.add(childId);
		if (isPrefixFallback) prefixFallbackIds.add(childId);
		return true;
	}

	// Priority 1: explicit parentTaskId on generated defs
	for (const d of generatedDefs) {
		if (!d || !d.id) continue;
		const id = d.id as string;
		if (planIdSet.has(id)) continue;
		const pid = d.parentTaskId;
		if (pid && typeof pid === "string") {
			addChild(pid, id, false);
		}
	}

	// Priority 2: taskStates with defs that have parentTaskId
	// (defs that weren't picked up in priority 1 because their id
	//  appears in taskStates but not in generatedDefs)
	const stateIds = Object.keys(taskStates);
	for (const id of stateIds) {
		if (planIdSet.has(id)) continue;
		if (assigned.has(id)) continue;
		const def = defById.get(id);
		if (def && def.parentTaskId && typeof def.parentTaskId === "string") {
			addChild(def.parentTaskId as string, id, false);
		}
	}

	// Priority 3: sourceItemId cross-reference
	// A generated def may have sourceItemId that matches a plan task's
	// forEach.itemsFrom key. However, sourceItemId alone often cannot
	// uniquely identify the parent. We do a best-effort: if a generated
	// def has sourceItemId and only ONE plan task has type "for_each",
	// attach to that parent. Otherwise leave for orphan/fallback.
	for (const id of stateIds) {
		if (planIdSet.has(id)) continue;
		if (assigned.has(id)) continue;
		const def = defById.get(id);
		if (!def) continue;
		const sid = def.sourceItemId;
		if (!sid || typeof sid !== "string") continue;

		// Find for_each parents
		const forEachParents = planTasks.filter(
			(t) => t.type === "for_each" || t.forEach,
		);
		if (forEachParents.length === 1) {
			addChild(forEachParents[0].id as string, id, false);
		}
		// If multiple for_each parents, sourceItemId alone can't determine
		// which one. Leave for orphan/prefix fallback.
	}

	// Priority 4: id prefix fallback
	for (const id of stateIds) {
		if (planIdSet.has(id)) continue;
		if (assigned.has(id)) continue;
		for (const parent of planTasks) {
			const pid = parent.id as string;
			if (id.startsWith(pid + "__")) {
				addChild(pid, id, true);
				break;
			}
		}
	}

	// Collect orphan ids: non-plan, unassigned
	const orphanIds = stateIds.filter(
		(id) => !planIdSet.has(id) && !assigned.has(id),
	);

	return {
		byParent,
		orphanIds,
		prefixFallbackIds: [...prefixFallbackIds],
	};
}

export interface RunSummary {
	totalTasks?: number;
	succeededTasks?: number;
	failedTasks?: number;
	skippedTasks?: number;
	cancelledTasks?: number;
}

export interface TaskState {
	status?: string;
	attemptCount?: number;
	errorSummary?: string | null;
	resultRef?: string | null;
}

export function buildMindmapNodes(
	state: {
		runId?: string;
		status?: string;
		summary?: RunSummary;
		taskStates?: Record<string, TaskState>;
		taskDefinitions?: unknown[];
		generatedTasks?: unknown[];
		tasks?: unknown[];
	},
	plan: { tasks?: Array<Record<string, unknown>> },
	_attemptsMap?: Record<string, unknown>,
): MindmapNode {
	const planTasks = plan?.tasks ? (plan.tasks as Array<Record<string, unknown> & { id: string; title?: string; type?: string; parentTaskId?: string; sourceItemId?: string }>) : [];
	const taskStates = (state.taskStates || {}) as Record<string, TaskState>;
	const generatedDefs = collectRunTaskDefinitions(state, plan);

	// Build taskById from plan tasks + generated defs
	const taskById = new Map<string, Record<string, unknown>>();
	for (const t of planTasks) taskById.set(t.id, t);
	for (const d of generatedDefs) {
		if (d && d.id) taskById.set(d.id as string, d);
	}

	const { byParent, orphanIds, prefixFallbackIds } = getMindmapChildrenByParent(
		planTasks,
		generatedDefs,
		taskStates as Record<string, unknown>,
	);
	const prefixSet = new Set(prefixFallbackIds);

	const s = state.summary || {};
	const rootNode: MindmapNode = {
		id: state.runId || "",
		title: "Run " + (state.runId || "").slice(0, 12),
		status: state.status || "queued",
		nodeType: "root",
		summary: `总 ${s.totalTasks || 0} | 成功 ${s.succeededTasks || 0} | 失败 ${s.failedTasks || 0} | 跳过 ${s.skippedTasks || 0}`,
		children: [],
	};

	const rendered = new Set<string>();

	for (const task of planTasks) {
		const ts = taskStates[task.id];
		const childIds = byParent[task.id] || [];
		const errorLine = ts?.errorSummary
			? ts.errorSummary.split("\n")[0]
			: "";

		const taskNode: MindmapNode = {
			id: task.id,
			title: (task.title as string) || task.id,
			status: ts?.status || "pending",
			nodeType: describeMindmapNodeType(task, false),
			attemptCount: ts?.attemptCount || 0,
			errorSummary: errorLine,
			resultRef: ts?.resultRef || null,
			parentTaskId: (task.parentTaskId as string) || null,
			sourceItemId: (task.sourceItemId as string) || null,
			generated: false,
			children: [],
		};

		for (const cid of childIds) {
			rendered.add(cid);
			const childDef = taskById.get(cid) || null;
			const childTs = taskStates[cid];
			const childErrorLine = childTs?.errorSummary
				? childTs.errorSummary.split("\n")[0]
				: "";
			const isFallback = prefixSet.has(cid);

			taskNode.children.push({
				id: cid,
				title: childDef
					? ((childDef.title as string) || cid)
					: cid,
				status: childTs?.status || "pending",
				nodeType: describeMindmapNodeType(childDef, true),
				attemptCount: childTs?.attemptCount || 0,
				errorSummary: childErrorLine,
				resultRef: childTs?.resultRef || null,
				parentTaskId: childDef
					? ((childDef.parentTaskId as string) || task.id)
					: task.id,
				sourceItemId: childDef
					? ((childDef.sourceItemId as string) || null)
					: null,
				generated: true,
				fallback: isFallback || !childDef,
				children: [],
			});
		}

		rendered.add(task.id);
		rootNode.children.push(taskNode);
	}

	// Orphan group: unassigned generated/orphan task states
	if (orphanIds.length > 0) {
		const orphanChildren: MindmapNode[] = [];
		for (const oid of orphanIds) {
			rendered.add(oid);
			const def = taskById.get(oid) || null;
			const ts = taskStates[oid];
			const errLine = ts?.errorSummary
				? ts.errorSummary.split("\n")[0]
				: "";
			orphanChildren.push({
				id: oid,
				title: def ? ((def.title as string) || oid) : oid,
				status: ts?.status || "pending",
				nodeType: describeMindmapNodeType(def, true),
				attemptCount: ts?.attemptCount || 0,
				errorSummary: errLine,
				resultRef: ts?.resultRef || null,
				generated: true,
				fallback: true,
				children: [],
			});
		}
		rootNode.children.push({
			id: "__orphan_generated__",
			title: "未归属子任务",
			status: "orphan-group",
			nodeType: "orphan-group",
			generated: true,
			fallback: true,
			children: orphanChildren,
		});
	}

	return rootNode;
}
