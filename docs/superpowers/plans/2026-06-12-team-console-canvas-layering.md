# Team Console Canvas Layering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a maintainable z-axis layering system for Team Console Execution Atlas so Group backgrounds, connectors, nodes, child panels, selected contexts, dragging affordances, and shell overlays render in a predictable order.

**Architecture:** Add a small graph-layering module that owns layer tokens and context-depth calculations. Move CSS layer values into one imported layering stylesheet, then migrate `ExecutionMap.tsx` to assign layer context metadata instead of relying on render order and scattered z-index numbers.

**Tech Stack:** React 19, TypeScript, CSS modules by import, Vitest, Testing Library, Vite.

---

## File Structure

- Create: `apps/team-console/src/graph/atlas-layering.ts`
  - Owns layer token names, numeric values, active-context helpers, and depth math.
- Create: `apps/team-console/src/graph/execution-map-layering.css`
  - Owns CSS custom properties and generic `[data-layer-kind]` / `[data-layer-depth]` rules.
- Modify: `apps/team-console/src/graph/ExecutionMap.tsx`
  - Imports the new CSS, classifies rendered elements into layer contexts, and tracks active context.
- Modify: `apps/team-console/src/graph/AtlasCanvasShell.tsx`
  - Keeps shell-only layers such as toolbar, selection rect, overlay slot, dock/trash/flight.
- Modify: `apps/team-console/src/graph/execution-map.css`
  - Removes canvas-layer z-index magic numbers and delegates to layer variables.
- Modify: `apps/team-console/src/graph/execution-map-task-group.css`
  - Uses group layer tokens for frame/card/member controls.
- Modify: `apps/team-console/src/graph/execution-map-root-dock.css`
  - Uses shell layer tokens for dock/trash/flight.
- Modify: `apps/team-console/src/graph/execution-map-dell-1996.css`
  - Removes Dell-only z-index override that can exceed maximized overlay.
- Test: `apps/team-console/src/tests/execution-map-layering.test.tsx`
  - Behavioral layer contract tests.
- Test: `apps/team-console/src/tests/app-static-contracts.test.ts`
  - Static guard against new unregistered canvas z-index values.

---

### Task 1: Add Static Guards For Layer Ownership

**Files:**
- Modify: `apps/team-console/src/tests/app-static-contracts.test.ts`

- [ ] **Step 1: Write the failing static test**

Add this test near other static CSS contracts:

```ts
it("keeps Execution Atlas z-index values centralized in the layering stylesheet", () => {
  const mapCss = readExecutionMapCss();
  const allowedLayerVarPattern = /z-index:\s*var\(--emap-layer-[^)]+\);/g;
  const rawZIndexPattern = /z-index:\s*(-?\d+);/g;
  const rawMatches = [...mapCss.matchAll(rawZIndexPattern)].map((match) => match[0]);

  expect(mapCss).toContain('import "./execution-map-layering.css";');
  expect(mapCss.match(allowedLayerVarPattern)?.length ?? 0).toBeGreaterThan(8);
  expect(rawMatches).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm --prefix apps/team-console test -- --run src/tests/app-static-contracts.test.ts -t "Execution Atlas z-index"
```

Expected: FAIL because existing CSS still contains raw values such as `z-index: 12;`.

- [ ] **Step 3: Do not edit production CSS yet**

This task ends with a red test. Commit only after Task 2 makes it green.

---

### Task 2: Create Layer Tokens And Migrate CSS Values

**Files:**
- Create: `apps/team-console/src/graph/execution-map-layering.css`
- Modify: `apps/team-console/src/graph/execution-map.css`
- Modify: `apps/team-console/src/graph/execution-map-task-group.css`
- Modify: `apps/team-console/src/graph/execution-map-root-dock.css`
- Modify: `apps/team-console/src/graph/execution-map-dell-1996.css`
- Modify: `apps/team-console/src/graph/ExecutionMap.tsx`

- [ ] **Step 1: Create the layering stylesheet**

Create `apps/team-console/src/graph/execution-map-layering.css`:

```css
.execution-map-container {
  --emap-layer-canvas-background: 0;
  --emap-layer-group-background: 10;
  --emap-layer-group-empty: 20;
  --emap-layer-connector-base: 30;
  --emap-layer-node-base: 40;
  --emap-layer-evidence-base: 45;
  --emap-layer-connector-child: 50;
  --emap-layer-panel-child: 60;
  --emap-layer-context-active: 200;
  --emap-layer-context-dragging: 300;
  --emap-layer-control-connector: 350;
  --emap-layer-shell-selection: 500;
  --emap-layer-shell-toolbar: 600;
  --emap-layer-shell-root-dock: 650;
  --emap-layer-shell-drag-affordance: 700;
  --emap-layer-shell-transient-flight: 800;
  --emap-layer-shell-maximized: 900;
  --emap-layer-app-modal: 1000;
}

.emap-task-group-frame {
  z-index: var(--emap-layer-group-background);
}

.emap-task-group-frame[data-task-group-empty="true"] {
  z-index: var(--emap-layer-group-empty);
}

.execution-map-nodes {
  z-index: var(--emap-layer-node-base);
}

.emap-task-group-card {
  z-index: var(--emap-layer-node-base);
}

.emap-link-cut-button {
  z-index: var(--emap-layer-control-connector);
}

.execution-map-selection-rect {
  z-index: var(--emap-layer-shell-selection);
}

.execution-map-toolbar {
  z-index: var(--emap-layer-shell-toolbar);
}

.emap-root-dock {
  z-index: var(--emap-layer-shell-root-dock);
}

.emap-root-trash {
  z-index: var(--emap-layer-shell-drag-affordance);
}

.emap-root-dock-flight {
  z-index: var(--emap-layer-shell-transient-flight);
}

.emap-maximized-branch-shell {
  z-index: var(--emap-layer-shell-maximized);
}
```

- [ ] **Step 2: Import the stylesheet from `ExecutionMap.tsx`**

Add this import next to the other graph styles:

```ts
import "./execution-map-layering.css";
```

- [ ] **Step 3: Remove migrated raw z-index lines**

Remove or replace the raw values from:

```css
.execution-map-toolbar
.execution-map-selection-rect
.execution-map-nodes
.emap-link-cut-button
.emap-task-group-frame
.emap-task-group-card
.emap-root-dock
.emap-root-trash
.emap-root-dock-flight
.emap-maximized-branch-shell
```

Keep local internal controls such as checkbox/menu trigger inside a card if they are scoped to that card; convert them later only if the static guard catches them as canvas-level values.

- [ ] **Step 4: Run static test**

Run:

```powershell
npm --prefix apps/team-console test -- --run src/tests/app-static-contracts.test.ts -t "Execution Atlas z-index"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- apps/team-console/src/graph/execution-map-layering.css apps/team-console/src/graph/ExecutionMap.tsx apps/team-console/src/graph/execution-map.css apps/team-console/src/graph/execution-map-task-group.css apps/team-console/src/graph/execution-map-root-dock.css apps/team-console/src/graph/execution-map-dell-1996.css apps/team-console/src/tests/app-static-contracts.test.ts
git commit -m "Centralize team console canvas layer tokens"
```

---

### Task 3: Add Layering Model Helpers

**Files:**
- Create: `apps/team-console/src/graph/atlas-layering.ts`
- Test: `apps/team-console/src/tests/execution-map-layering.test.tsx`

- [ ] **Step 1: Write helper tests**

Create `apps/team-console/src/tests/execution-map-layering.test.tsx`:

```ts
import { describe, expect, it } from "vitest";
import { atlasLayerStyle, atlasPanelLayerStyle } from "../graph/atlas-layering";

describe("atlas layering helpers", () => {
  it("keeps group backgrounds below connectors and nodes", () => {
    expect(atlasLayerStyle("group-background").zIndex).toBeLessThan(atlasLayerStyle("connector-base").zIndex);
    expect(atlasLayerStyle("connector-base").zIndex).toBeLessThan(atlasLayerStyle("node-base").zIndex);
  });

  it("places deeper child panels above shallower child panels", () => {
    expect(atlasPanelLayerStyle({ depth: 2 }).zIndex).toBeGreaterThan(atlasPanelLayerStyle({ depth: 1 }).zIndex);
  });

  it("raises active panel contexts above inactive deeper panels", () => {
    expect(atlasPanelLayerStyle({ depth: 1, active: true }).zIndex).toBeGreaterThan(atlasPanelLayerStyle({ depth: 4 }).zIndex);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm --prefix apps/team-console test -- --run src/tests/execution-map-layering.test.tsx
```

Expected: FAIL because `atlas-layering.ts` does not exist.

- [ ] **Step 3: Create helper module**

Create `apps/team-console/src/graph/atlas-layering.ts`:

```ts
import type { CSSProperties } from "react";

export type AtlasLayerKind =
  | "group-background"
  | "group-empty"
  | "connector-base"
  | "node-base"
  | "evidence-base"
  | "connector-child"
  | "panel-child"
  | "active-context"
  | "dragging-context"
  | "connector-control";

export const ATLAS_LAYER = {
  groupBackground: 10,
  groupEmpty: 20,
  connectorBase: 30,
  nodeBase: 40,
  evidenceBase: 45,
  connectorChild: 50,
  panelChild: 60,
  depthStep: 10,
  activeContext: 200,
  draggingContext: 300,
  connectorControl: 350,
} as const;

export function atlasLayerStyle(kind: AtlasLayerKind): CSSProperties & { zIndex: number } {
  switch (kind) {
    case "group-background":
      return { zIndex: ATLAS_LAYER.groupBackground };
    case "group-empty":
      return { zIndex: ATLAS_LAYER.groupEmpty };
    case "connector-base":
      return { zIndex: ATLAS_LAYER.connectorBase };
    case "node-base":
      return { zIndex: ATLAS_LAYER.nodeBase };
    case "evidence-base":
      return { zIndex: ATLAS_LAYER.evidenceBase };
    case "connector-child":
      return { zIndex: ATLAS_LAYER.connectorChild };
    case "panel-child":
      return { zIndex: ATLAS_LAYER.panelChild };
    case "active-context":
      return { zIndex: ATLAS_LAYER.activeContext };
    case "dragging-context":
      return { zIndex: ATLAS_LAYER.draggingContext };
    case "connector-control":
      return { zIndex: ATLAS_LAYER.connectorControl };
  }
}

export function atlasPanelLayerStyle(input: { depth: number; active?: boolean; dragging?: boolean }): CSSProperties & { zIndex: number } {
  if (input.dragging) return { zIndex: ATLAS_LAYER.draggingContext };
  if (input.active) return { zIndex: ATLAS_LAYER.activeContext + Math.max(0, input.depth) };
  return { zIndex: ATLAS_LAYER.panelChild + Math.max(0, input.depth) * ATLAS_LAYER.depthStep };
}
```

- [ ] **Step 4: Run helper tests**

Run:

```powershell
npm --prefix apps/team-console test -- --run src/tests/execution-map-layering.test.tsx
```

Expected: PASS.

---

### Task 4: Track Active Canvas Context

**Files:**
- Modify: `apps/team-console/src/graph/ExecutionMap.tsx`
- Test: `apps/team-console/src/tests/execution-map-layering.test.tsx`

- [ ] **Step 1: Add behavior test**

Extend the test file with a focused render test using existing ExecutionMap test helpers. The assertion should verify that clicking one task branch marks its shell as active and gives it a greater `z-index` than another branch shell.

Expected DOM contract:

```ts
expect(activeShell).toHaveAttribute("data-layer-active", "true");
expect(Number(activeShell.style.zIndex)).toBeGreaterThan(Number(inactiveShell.style.zIndex));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm --prefix apps/team-console test -- --run src/tests/execution-map-layering.test.tsx
```

Expected: FAIL because branch shells do not expose active layer state.

- [ ] **Step 3: Implement active context state**

In `ExecutionMap.tsx`, add:

```ts
type ActiveAtlasContext =
  | { kind: "node"; id: string }
  | { kind: "task-branch"; id: string }
  | { kind: "task-panel"; id: string }
  | { kind: "agent-branch"; id: string }
  | { kind: "group"; id: string };
```

Use `useState<ActiveAtlasContext | null>(null)` and set it from pointer down / focus capture handlers on nodes, groups, branch shells, and child panels.

- [ ] **Step 4: Apply helper styles**

For branch shell and child panel wrappers, set:

```tsx
data-layer-active={isActive ? "true" : "false"}
style={{
  ...existingStyle,
  ...atlasPanelLayerStyle({ depth: entry.depth ?? 1, active: isActive }),
}}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm --prefix apps/team-console test -- --run src/tests/execution-map-layering.test.tsx
```

Expected: PASS.

---

### Task 5: Split Connector Render Layers

**Files:**
- Modify: `apps/team-console/src/graph/ExecutionMap.tsx`
- Modify: `apps/team-console/src/graph/execution-map-layering.css`
- Test: `apps/team-console/src/tests/execution-map-layering.test.tsx`

- [ ] **Step 1: Write failing test**

Add a test that renders a selected task with child panel links and asserts the SVG groups exist in this order:

```ts
expect([...container.querySelectorAll("[data-link-layer]")].map((node) => node.getAttribute("data-link-layer"))).toEqual([
  "base",
  "child",
  "selected",
]);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm --prefix apps/team-console test -- --run src/tests/execution-map-layering.test.tsx
```

Expected: FAIL because the current SVG renders all paths in one flat sequence.

- [ ] **Step 3: Refactor SVG groups**

In `ExecutionMap.tsx`, keep one `svg.execution-map-links`, but split children into:

```tsx
<g data-link-layer="base">{baseLinks}</g>
<g data-link-layer="child">{childLinks}</g>
<g data-link-layer="selected">{selectedLinks}</g>
```

Selected links must render last inside the SVG.

- [ ] **Step 4: Run tests**

Run:

```powershell
npm --prefix apps/team-console test -- --run src/tests/execution-map-layering.test.tsx
```

Expected: PASS.

---

### Task 6: Full Verification And Documentation

**Files:**
- Modify: `docs/team-console-canvas-layering.md`
- Modify: `docs/change-log.md`

- [ ] **Step 1: Update docs**

Update `docs/team-console-canvas-layering.md` with the final token names and any differences from the planned table.

- [ ] **Step 2: Update change log**

Add a new top entry to `docs/change-log.md` describing:

- centralized layer tokens
- Group background below connectors/nodes
- active/selected context lifting
- connector layer split

- [ ] **Step 3: Run focused tests**

Run:

```powershell
npm --prefix apps/team-console test -- --run src/tests/execution-map-layering.test.tsx src/tests/app-static-contracts.test.ts src/tests/app-live-task-groups.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run build and type checks**

Run:

```powershell
npm --prefix apps/team-console run build
npx tsc --noEmit
git diff --check
```

Expected: all pass.

- [ ] **Step 5: Browser verification**

Open `http://127.0.0.1:5174/`, switch to Dell 1996, and verify:

- Group frame sits under task connector lines.
- Clicking a branch/panel brings it above overlapping sibling panels.
- Selected task and related connector are visually above unselected contexts.
- Maximized panel stays above Dell hover branch styles.

- [ ] **Step 6: Commit**

```powershell
git add -- apps/team-console/src/graph/atlas-layering.ts apps/team-console/src/graph/execution-map-layering.css apps/team-console/src/graph/ExecutionMap.tsx apps/team-console/src/graph/AtlasCanvasShell.tsx apps/team-console/src/graph/execution-map.css apps/team-console/src/graph/execution-map-task-group.css apps/team-console/src/graph/execution-map-root-dock.css apps/team-console/src/graph/execution-map-dell-1996.css apps/team-console/src/tests/execution-map-layering.test.tsx apps/team-console/src/tests/app-static-contracts.test.ts docs/team-console-canvas-layering.md docs/change-log.md
git commit -m "Add team console canvas layering system"
```
