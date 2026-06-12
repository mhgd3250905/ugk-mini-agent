import type { CSSProperties } from "react";

const ATLAS_LAYER_DEPTH_STEP = 10;

export type AtlasLayerStyle = CSSProperties & Record<"--emap-panel-depth-offset", string>;

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
