import type { CSSProperties } from "react";

const ATLAS_LAYER_DEPTH_STEP = 10;

export type AtlasLayerKeyKind = "agent" | "task" | "source" | "branch" | "panel" | "run-task";
export type AtlasLayerKey = `${AtlasLayerKeyKind}:${string}`;
export type AtlasLayerStyle = CSSProperties & Record<"--emap-panel-depth-offset", string>;

export type AtlasLayerContextInput = {
  activeLayerKey?: AtlasLayerKey | null;
  hoveredLayerKey?: AtlasLayerKey | null;
  focusedLayerKeys?: Iterable<AtlasLayerKey | null | undefined>;
  selectedLayerKeys?: ReadonlySet<AtlasLayerKey>;
  draggingLayerKeys?: ReadonlySet<AtlasLayerKey>;
};

export type AtlasLayerContext = {
  activeLayerKey: AtlasLayerKey | null;
  hoveredLayerKey: AtlasLayerKey | null;
  focusedLayerKeys: ReadonlySet<AtlasLayerKey>;
  selectedLayerKeys: ReadonlySet<AtlasLayerKey>;
  draggingLayerKeys: ReadonlySet<AtlasLayerKey>;
};

export type AtlasLayerKeyTarget = AtlasLayerKey | ReadonlyArray<AtlasLayerKey>;
export type AtlasLinkLayerBucket = "base" | "child" | "active";

export function atlasLayerKey(kind: AtlasLayerKeyKind, id: string): AtlasLayerKey {
  return `${kind}:${id}`;
}

export function createAtlasLayerContext(input: AtlasLayerContextInput): AtlasLayerContext {
  return {
    activeLayerKey: input.activeLayerKey ?? null,
    hoveredLayerKey: input.hoveredLayerKey ?? null,
    focusedLayerKeys: new Set(Array.from(input.focusedLayerKeys ?? []).filter((key): key is AtlasLayerKey => Boolean(key))),
    selectedLayerKeys: input.selectedLayerKeys ?? new Set(),
    draggingLayerKeys: input.draggingLayerKeys ?? new Set(),
  };
}

function atlasLayerKeyTargets(target: AtlasLayerKeyTarget): ReadonlyArray<AtlasLayerKey> {
  return typeof target === "string" ? [target] : target;
}

export function isAtlasLayerContextDragging(context: AtlasLayerContext, target: AtlasLayerKeyTarget): boolean {
  return atlasLayerKeyTargets(target).some((key) => context.draggingLayerKeys.has(key));
}

export function isAtlasLayerContextActive(context: AtlasLayerContext, target: AtlasLayerKeyTarget): boolean {
  return atlasLayerKeyTargets(target).some((key) => (
    context.activeLayerKey === key
    || context.hoveredLayerKey === key
    || context.focusedLayerKeys.has(key)
    || context.selectedLayerKeys.has(key)
    || context.draggingLayerKeys.has(key)
  ));
}

export function getAtlasPanelLayerStyle(depth: number): AtlasLayerStyle {
  const normalizedDepth = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;
  return { "--emap-panel-depth-offset": String(normalizedDepth * ATLAS_LAYER_DEPTH_STEP) };
}

export function getAtlasLayerClassName(options: { active?: boolean; dragging?: boolean }): string {
  return [
    options.active ? "is-layer-active" : "",
    options.dragging ? "is-layer-dragging" : "",
  ].filter(Boolean).join(" ");
}

export function getAtlasLayerTargetClassName(context: AtlasLayerContext, target: AtlasLayerKeyTarget): string {
  return getAtlasLayerClassName({
    active: isAtlasLayerContextActive(context, target),
    dragging: isAtlasLayerContextDragging(context, target),
  });
}

export function getAtlasLinkLayerBucket(
  context: AtlasLayerContext,
  target: AtlasLayerKeyTarget,
  inactiveBucket: Exclude<AtlasLinkLayerBucket, "active">,
): AtlasLinkLayerBucket {
  return isAtlasLayerContextActive(context, target) ? "active" : inactiveBucket;
}
