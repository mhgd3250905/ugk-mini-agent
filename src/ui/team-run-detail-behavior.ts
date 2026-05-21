export interface RunDetailScrollSnapshot {
	scrollX: number;
	scrollY: number;
	anchorTaskId: string | null;
	anchorOffset: number | null;
}

interface RunDetailWindowLike {
	scrollX?: number;
	scrollY?: number;
	scrollTo?: (x: number, y: number) => void;
}

interface RunDetailElementLike {
	style?: { display?: string };
	querySelectorAll?: (selector: string) => ArrayLike<RunDetailAnchorLike>;
}

interface RunDetailAnchorLike {
	getAttribute?: (name: string) => string | null;
	getBoundingClientRect?: () => { top: number };
}

interface RunDetailSourceLike {
	closest?: (selector: string) => RunDetailAnchorLike | null;
}

function getRunDetailWindow(): RunDetailWindowLike {
	return (((globalThis as any).window || globalThis) as RunDetailWindowLike);
}

export function captureRunDetailScrollSnapshot(
	runId: string,
	sourceEl?: RunDetailSourceLike | null,
	detailEl?: RunDetailElementLike | null,
): RunDetailScrollSnapshot | null {
	var finder = (globalThis as any).findRunDetailElement;
	var currentDetailEl = detailEl || (typeof finder === 'function' ? finder(runId, sourceEl) : null);
	if (!currentDetailEl || !currentDetailEl.style || currentDetailEl.style.display !== 'block') return null;
	var anchorEl = sourceEl && sourceEl.closest ? sourceEl.closest('[data-task-id]') : null;
	var win = getRunDetailWindow();
	return {
		scrollX: typeof win.scrollX === 'number' ? win.scrollX : 0,
		scrollY: typeof win.scrollY === 'number' ? win.scrollY : 0,
		anchorTaskId: anchorEl && anchorEl.getAttribute ? anchorEl.getAttribute('data-task-id') : null,
		anchorOffset: anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect().top : null,
	};
}

export function findRunDetailScrollAnchor(detailEl: RunDetailElementLike | null, anchorTaskId: string | null): RunDetailAnchorLike | null {
	if (!detailEl || !anchorTaskId || !detailEl.querySelectorAll) return null;
	var candidates = detailEl.querySelectorAll('[data-task-id]');
	for (var ci = 0; ci < candidates.length; ci++) {
		var candidate = candidates[ci];
		if (candidate && candidate.getAttribute && candidate.getAttribute('data-task-id') === anchorTaskId) {
			return candidate;
		}
	}
	return null;
}

export function restoreRunDetailScrollSnapshot(
	detailEl: RunDetailElementLike | null,
	snapshot: RunDetailScrollSnapshot | null,
): boolean {
	if (!snapshot) return false;
	var win = getRunDetailWindow();
	if (snapshot.anchorTaskId && snapshot.anchorOffset != null) {
		var newAnchor = findRunDetailScrollAnchor(detailEl, snapshot.anchorTaskId);
		if (newAnchor && newAnchor.getBoundingClientRect && win.scrollTo) {
			var newOffset = newAnchor.getBoundingClientRect().top;
			win.scrollTo(snapshot.scrollX, snapshot.scrollY + (newOffset - snapshot.anchorOffset));
			return true;
		}
	}
	if (win.scrollTo) win.scrollTo(snapshot.scrollX, snapshot.scrollY);
	return false;
}

export const TEAM_RUN_DETAIL_SCROLL_BEHAVIOR_SCRIPT = [
	getRunDetailWindow,
	captureRunDetailScrollSnapshot,
	findRunDetailScrollAnchor,
	restoreRunDetailScrollSnapshot,
].map(function(fn) { return fn.toString(); }).join('\n');
