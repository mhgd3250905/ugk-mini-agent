import { describe, expect, it } from "vitest";
import {
  atlasLayerKey,
  createAtlasLayerContext,
  getAtlasLayerClassName,
  getAtlasLayerTargetClassName,
  getAtlasLinkLayerBucket,
  getAtlasPanelLayerStyle,
  isAtlasLayerContextActive,
  isAtlasLayerContextDragging,
} from "../graph/atlas-layering";

describe("atlas layering helpers", () => {
  it("creates stable layer keys for canvas contexts", () => {
    expect(atlasLayerKey("task", "task_node_1")).toBe("task:task_node_1");
    expect(atlasLayerKey("branch", "task_node_1")).toBe("branch:task_node_1");
    expect(atlasLayerKey("panel", "run_history_1")).toBe("panel:run_history_1");
  });

  it("treats active, hovered, focused, selected, and dragging keys as one active context", () => {
    const context = createAtlasLayerContext({
      activeLayerKey: atlasLayerKey("task", "active"),
      hoveredLayerKey: atlasLayerKey("task", "hovered"),
      focusedLayerKeys: [atlasLayerKey("task", "focused")],
      selectedLayerKeys: new Set([atlasLayerKey("task", "selected")]),
      draggingLayerKeys: new Set([atlasLayerKey("task", "dragging")]),
    });

    expect(isAtlasLayerContextActive(context, atlasLayerKey("task", "active"))).toBe(true);
    expect(isAtlasLayerContextActive(context, atlasLayerKey("task", "hovered"))).toBe(true);
    expect(isAtlasLayerContextActive(context, atlasLayerKey("task", "focused"))).toBe(true);
    expect(isAtlasLayerContextActive(context, atlasLayerKey("task", "selected"))).toBe(true);
    expect(isAtlasLayerContextActive(context, atlasLayerKey("task", "dragging"))).toBe(true);
    expect(isAtlasLayerContextActive(context, [
      atlasLayerKey("task", "missing"),
      atlasLayerKey("task", "selected"),
    ])).toBe(true);
    expect(isAtlasLayerContextActive(context, atlasLayerKey("task", "missing"))).toBe(false);
  });

  it("keeps dragging distinguishable from ordinary active context", () => {
    const context = createAtlasLayerContext({
      activeLayerKey: atlasLayerKey("task", "active"),
      draggingLayerKeys: new Set([atlasLayerKey("task", "dragging")]),
    });

    expect(isAtlasLayerContextDragging(context, atlasLayerKey("task", "dragging"))).toBe(true);
    expect(isAtlasLayerContextDragging(context, atlasLayerKey("task", "active"))).toBe(false);
  });

  it("keeps class and panel depth helpers on named layer semantics", () => {
    expect(getAtlasLayerClassName({ active: true })).toBe("is-layer-active");
    expect(getAtlasLayerClassName({ dragging: true })).toBe("is-layer-dragging");
    expect(getAtlasLayerClassName({ active: true, dragging: true })).toBe("is-layer-active is-layer-dragging");
    expect(getAtlasPanelLayerStyle(2)).toEqual({ "--emap-panel-depth-offset": "20" });
    expect(getAtlasPanelLayerStyle(-1)).toEqual({ "--emap-panel-depth-offset": "0" });
  });

  it("projects target state into layer classes through the shared context", () => {
    const context = createAtlasLayerContext({
      activeLayerKey: atlasLayerKey("branch", "menu-a"),
      draggingLayerKeys: new Set([atlasLayerKey("task", "dragged")]),
    });

    expect(getAtlasLayerTargetClassName(context, atlasLayerKey("branch", "menu-a"))).toBe("is-layer-active");
    expect(getAtlasLayerTargetClassName(context, atlasLayerKey("task", "dragged"))).toBe("is-layer-active is-layer-dragging");
    expect(getAtlasLayerTargetClassName(context, atlasLayerKey("task", "idle"))).toBe("");
  });

  it("assigns connector buckets from layer target activity", () => {
    const context = createAtlasLayerContext({
      hoveredLayerKey: atlasLayerKey("panel", "observer"),
    });

    expect(getAtlasLinkLayerBucket(context, atlasLayerKey("task", "idle"), "base")).toBe("base");
    expect(getAtlasLinkLayerBucket(context, atlasLayerKey("panel", "idle"), "child")).toBe("child");
    expect(getAtlasLinkLayerBucket(context, atlasLayerKey("panel", "observer"), "child")).toBe("active");
  });
});
