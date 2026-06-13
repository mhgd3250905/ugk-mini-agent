import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { readExecutionMapCss } from "./execution-map-css-test-utils";

function readAppCss(): string {
  const appCss = readFileSync("src/app/app.css", "utf8");
  return appCss.replace(/^@import "\.\/([^"]+)";\s*/gm, (_match, importPath: string) => {
    return `${readFileSync(`src/app/${importPath}`, "utf8")}\n`;
  });
}

describe("Team Console static contracts", () => {
  it("keeps App task branches on the multi-branch panel path", () => {
    const appSource = readFileSync("src/app/App.tsx", "utf8");

    expect(appSource).toContain("taskBranchPanels={taskBranchPanelItems}");
    expect(appSource).not.toContain("taskBranchPanel={expandedTaskBranchPanel}");
    expect(appSource).not.toContain("taskChildBranchPanel={expandedTaskChildBranchPanel}");
    expect(appSource).not.toContain("taskChildBranchInteractive={");
    expect(appSource).not.toContain("const expandedTaskChildBranchPanel");
    expect(appSource).not.toContain("const expandedTaskBranchPanel");
    expect(appSource).not.toContain("runExpandedTask");
    expect(appSource).not.toContain("cancelExpandedTaskRun");
    expect(appSource).not.toContain("archiveExpandedTask");
    expect(appSource).not.toContain("openTaskRunObserverBranch");
    expect(appSource).not.toContain("closeTaskRunObserverBranch");
    expect(appSource).not.toContain("openTaskEditBranch");
  });

  it("keeps the Task branch hook singular value named as focused state", () => {
    const hookSource = readFileSync("src/app/use-task-branch-stack.ts", "utf8");
    const appSource = readFileSync("src/app/App.tsx", "utf8");

    expect(hookSource).toContain("focusedTaskBranch: TaskBranchState | null");
    expect(hookSource).toContain("const focusedTaskBranch = useMemo(");
    expect(hookSource).toContain("focusedTaskBranch,");
    expect(hookSource).not.toContain("expandedTaskBranch: TaskBranchState | null");
    expect(hookSource).not.toMatch(/\bsetExpandedTaskBranch\b/);
    expect(hookSource).not.toContain("type TaskBranchUpdater");
    expect(appSource).toContain("const [focusedTaskNodeId, setFocusedTaskNodeId] = useState<string | null>(null);");
    expect(appSource).toContain("setFocusedTaskNodeId(node.nodeId);");
    expect(appSource).toContain("focusedTaskNodeId={focusedTaskNodeId}");
    expect(appSource).not.toContain("focusedTaskNodeId={focusedTaskBranch?.nodeId ?? null}");
    expect(appSource).not.toContain("focusedTaskNodeId={expandedTaskBranch?.nodeId ?? null}");
  });

  it("keeps Task root drag subtree sync on the multi-branch panel path", () => {
    const mapSource = readFileSync("src/graph/ExecutionMap.tsx", "utf8");

    expect(mapSource).toContain("taskBranchPanels?: Array");
    expect(mapSource).toContain("taskChildBranchPanels?: Array");
    expect(mapSource).toContain("const hasTaskBranchTree = Boolean(taskBranchPanels?.length);");
    expect(mapSource).toContain('entry.kind === "task" && hasTaskBranchTree');
    expect(mapSource).not.toContain("taskBranchPanel?:");
    expect(mapSource).not.toContain("taskChildBranchPanel?:");
    expect(mapSource).not.toContain("taskChildBranchInteractive?:");
    expect(mapSource).not.toContain('entry.kind === "task" && taskBranchPanel');
    expect(mapSource).not.toContain("taskChildBranchNode && taskChildBranchPanel");
  });

  it("vite proxy includes the Team Console API surface and embedded playground route", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain('"/v1"');
    expect(config).toContain('"/playground"');
    expect(config).toContain('"/assets"');
    expect(config).toContain('"/runtime"');
    expect(config).toContain('"/vendor"');
    expect(config).not.toContain("VITE_TEAM_CONSOLE_API_TARGET");
    expect(config).not.toContain('"/v1/conns"');
    expect(config).not.toContain('"/v1/activity"');
    expect(config).toContain("teamApiTarget");
  });

  it("keeps atlas content from stretching the app width during node drag", () => {
    const appCss = readAppCss();
    const mapCss = readExecutionMapCss();

    expect(appCss).toMatch(/\.app-main\s*{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(appCss).toMatch(/\.workspace\s*{[^}]*min-width:\s*0;/s);
    expect(appCss).toMatch(/\.workspace-map\s*{[^}]*min-width:\s*0;/s);
    expect(mapCss).toMatch(/\.execution-map-container\s*{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s);
  });

  it("keeps the canvas restore loading animation from changing layout", () => {
    const appCss = readAppCss();
    const appSource = readFileSync("src/app/App.tsx", "utf8");
    const loadingStateRule = appCss.match(/\.canvas-loading-state\s*{[^}]*}/)?.[0] ?? "";
    const pulseKeyframes = appCss.match(/@keyframes canvas-loading-pulse\s*{[\s\S]*?\n}/)?.[0] ?? "";
    const loadingMarkRule = appCss.match(/\.canvas-loading-mark span\s*{[^}]*}/)?.[0] ?? "";

    expect(appSource).toContain('key="canvas-loading"');
    expect(appSource).toContain('key="workspace"');
    expect(loadingStateRule).toContain("height: 100%");
    expect(loadingStateRule).toContain("min-height: 0");
    expect(loadingStateRule).not.toContain("min-height: 280px");
    expect(pulseKeyframes).not.toMatch(/\bheight\s*:/);
    expect(pulseKeyframes).toContain("transform:");
    expect(pulseKeyframes).toContain("scaleY");
    expect(loadingMarkRule).toContain("transform-origin: bottom center");
    expect(loadingMarkRule).toContain("will-change: transform, opacity");
  });

  it("keeps expanded Task Group header controls out of the member chip row", () => {
    const mapCss = readExecutionMapCss();
    const mapSource = readFileSync("src/graph/ExecutionMap.tsx", "utf8");
    const memberRowsSource = readFileSync("src/graph/task-group-member-rows.ts", "utf8");
    const groupProjectionSource = readFileSync("src/app/team-console-task-group-projection.ts", "utf8");
    const appSource = readFileSync("src/app/App.tsx", "utf8");
    const headRule = mapCss.match(/\.emap-task-group-head\s*{[^}]*}/)?.[0] ?? "";
    const footerRule = mapCss.match(/\.emap-task-group-footer\s*{[^}]*}/)?.[0] ?? "";
    const membersRule = mapCss.match(/\.emap-task-group-members\s*{[^}]*}/)?.[0] ?? "";
    const memberRowRule = mapCss.match(/\.emap-task-group-member-row\s*{[^}]*}/)?.[0] ?? "";

    expect(mapSource).toContain("const TASK_GROUP_MIN_WIDTH = 560");
    expect(mapSource).toContain("taskGroupHeaderBandHeight");
    expect(mapSource).toContain("buildTaskGroupMemberRows");
    expect(memberRowsSource).toContain("const TASK_GROUP_MEMBER_ROW_HEIGHT = 24");
    expect(memberRowsSource).toContain("function taskGroupHeaderBandHeight");
    expect(memberRowsSource).toContain("function buildTaskGroupMemberRows");
    expect(memberRowsSource).toContain("group.headTaskIds");
    expect(memberRowsSource).toContain("connection.status !== \"stale\"");
    expect(memberRowsSource).toContain("connection.fromTaskId");
    expect(memberRowsSource).toContain("connection.toTaskId");
    expect(appSource).toContain("buildLiveTaskGroups");
    expect(groupProjectionSource).toContain("headTaskIds: group.headTaskIds");
    expect(mapSource).toContain('renderNodeIdCopyButton("group", group.groupId)');
    expect(mapSource).toContain('taskCount === 1 ? "Task" : "Tasks"');
    expect(headRule).toContain("overflow: hidden");
    expect(headRule).toContain("flex-wrap: nowrap");
    expect(headRule).not.toContain("flex-wrap: wrap");
    expect(mapCss).toContain(".emap-task-group-task-count");
    expect(footerRule).toContain("padding-top: 8px");
    expect(footerRule).toContain("border-top:");
    expect(membersRule).toContain("top: 42px");
    expect(membersRule).toContain("flex-direction: column");
    expect(membersRule).toContain("flex-wrap: nowrap");
    expect(membersRule).not.toContain("max-height: 28px");
    expect(memberRowRule).toContain("flex-wrap: nowrap");
    expect(memberRowRule).toContain("overflow-x: auto");
  });

  it("keeps root filter counts inline and removes the separate atlas stats block", () => {
    const appSource = readFileSync("src/app/App.tsx", "utf8");
    const appCss = readAppCss();
    const mapSource = readFileSync("src/graph/ExecutionMap.tsx", "utf8");

    expect(appSource).toContain('type RootNodeFilter = "all" | "agent" | "task" | "source"');
    expect(appSource).toContain('setRootNodeFilter("source")');
    expect(appSource).toContain('className="root-filter-count"');
    expect(appSource).not.toContain('className="agent-atlas-stats"');
    expect(appCss).toContain('.root-filter-segment[data-active-filter="source"]::before');
    expect(appCss).not.toContain(".agent-atlas-stats");
    expect(appCss).not.toContain(".agent-atlas-count");
    expect(mapSource).toContain('const showSources = rootNodeFilter === "all" || rootNodeFilter === "source";');
  });

  it("uses a light default theme for the Team Console app chrome", () => {
    const appCss = readAppCss();

    expect(appCss).toContain("--bg: #f6f8fb");
    expect(appCss).toContain("--surface: #ffffff");
    expect(appCss).toContain("--surface-raised: #f9fbff");
    expect(appCss).toContain("--primary: #182230");
    expect(appCss).toContain("--secondary: #667085");
    expect(appCss).toMatch(/body\s*{[^}]*background:\s*var\(--bg\);/s);
  });

  it("uses a light atlas canvas while preserving task and agent state accents", () => {
    const mapCss = readExecutionMapCss();
    const canvasRule = mapCss.match(/\.execution-map-container\s*{[^}]*}/)?.[0] ?? "";
    const nodeRule = mapCss.match(/\.emap-node\s*{[^}]*}/)?.[0] ?? "";
    const branchRule = mapCss.match(/\.emap-dialog-branch,\n\.agent-playground-branch\s*{[^}]*}/)?.[0] ?? "";

    expect(canvasRule).toContain("linear-gradient(180deg, #eef3f8 0%, #f8fafc 100%)");
    expect(canvasRule).toContain("rgba(101, 119, 145, 0.16) 1px");
    expect(nodeRule).toContain("0 10px 24px rgba(15, 23, 42, 0.1)");
    expect(branchRule).toContain("background: var(--surface)");
    expect(mapCss).toContain("rgba(14, 165, 233");
    expect(mapCss).toContain("rgba(255, 190, 96");
  });

  it("keeps the dark atlas canvas grid at the original tile size", () => {
    const mapCss = readExecutionMapCss();
    const darkCanvasRule = mapCss.match(/\[data-theme="dark"\] \.execution-map-container\s*{[^}]*}/)?.[0] ?? "";

    expect(darkCanvasRule).toContain("linear-gradient(180deg, #050813 0%, #02040b 100%)");
    expect(darkCanvasRule).toContain("rgba(255, 255, 255, 0.025) 1px");
    expect(darkCanvasRule).toContain("background-size: 32px 32px, 32px 32px, auto");
  });

  it("keeps the Task leader picker on the light theme surface", () => {
    const appCss = readAppCss();
    const pickerRule = appCss.match(/\.agent-picker\s*{[^}]*}/)?.[0] ?? "";
    const optionRule = appCss.match(/\.agent-picker-option\s*{[^}]*}/)?.[0] ?? "";
    const hoverRule = appCss.match(/\.agent-picker-option:hover:not\(:disabled\)\s*{[^}]*}/)?.[0] ?? "";

    expect(pickerRule).toContain("background: rgba(255, 255, 255, 0.96)");
    expect(pickerRule).not.toContain("rgba(8, 11, 19");
    expect(optionRule).toContain("background: rgba(248, 250, 252, 0.82)");
    expect(optionRule).not.toContain("rgba(16, 20, 31");
    expect(hoverRule).toContain("background: rgba(22, 124, 128, 0.08)");
  });

  it("keeps Agent workspace panels on the light theme surface", () => {
    const appCss = readAppCss();
    const topbarRule = appCss.match(/\.agent-focus-topbar-action\s*{[^}]*}/)?.[0] ?? "";
    const panelRule = appCss.match(/\.agent-focus-panel\s*{[^}]*}/)?.[0] ?? "";
    const messageBodyRule = appCss.match(/\.agent-focus-message-body\s*{[^}]*}/)?.[0] ?? "";
    const composerRule = appCss.match(/\.agent-focus-composer\s*{[^}]*}/)?.[0] ?? "";
    const modalRule = appCss.match(/\.root-archive-modal\s*{[^}]*}/)?.[0] ?? "";

    expect(topbarRule).toContain("background: rgba(255, 255, 255, 0.88)");
    expect(topbarRule).not.toContain("rgba(16, 20, 31");
    expect(panelRule).toContain("rgba(255, 255, 255, 0.98)");
    expect(panelRule).not.toContain("rgba(19, 24, 38");
    expect(messageBodyRule).toContain("rgba(255, 255, 255, 0.96)");
    expect(messageBodyRule).not.toContain("rgba(18, 22, 35");
    expect(composerRule).toContain("rgba(255, 255, 255, 0.96)");
    expect(composerRule).not.toContain("rgba(14, 18, 31");
    expect(modalRule).toContain("background: rgba(255, 255, 255, 0.98)");
    expect(appCss).toContain('[data-theme="dark"] .agent-focus-panel');
    expect(appCss).toContain('[data-theme="dark"] .agent-focus-message-body');
    expect(appCss).toContain('[data-theme="dark"] .agent-focus-composer');
    expect(appCss).toContain('[data-theme="dark"] .root-archive-modal');
  });

  it("exposes a persisted light/dark theme toggle in the app shell", () => {
    const appSource = readFileSync("src/app/App.tsx", "utf8");
    const appCss = readAppCss();

    expect(appSource).toContain('TEAM_CONSOLE_THEME_STORAGE_KEY = "ugk-team-console:theme:v1"');
    expect(appSource).toContain('data-theme={effectiveTheme}');
    expect(appSource).toContain('aria-label="切换主题"');
    expect(appSource).toContain('className="map-toolbar-controls"');
    expect(appSource).toContain("toolbarEnd={mapToolbarControls}");
    expect(appSource).not.toContain('className="app-header"');
    expect(appSource).not.toContain('className="app-header-right"');
    expect(appSource).not.toContain("团队控制台");
    expect(appSource).not.toContain("执行地图预览");
    expect(appSource).toContain("setTheme((current) =>");
    expect(appSource).toContain('className="theme-toggle-track"');
    expect(appSource).toContain('className="theme-toggle-thumb"');
    expect(appSource).toContain('className="theme-toggle-icon theme-toggle-sun"');
    expect(appSource).toContain('className="theme-toggle-icon theme-toggle-moon"');
    expect(appSource).not.toContain("theme-toggle-label");
    expect(appCss).toContain('[data-theme="dark"]');
    expect(appCss).toContain(".theme-toggle-btn");
    expect(appCss).toContain(".theme-toggle-track");
    expect(appCss).toContain(".theme-toggle-thumb");
    expect(appCss).toContain(".map-toolbar-controls");
    expect(appCss).not.toContain(".app-header");
    expect(appCss).not.toContain(".app-title");
    expect(appCss).not.toContain(".app-subtitle");
    expect(appCss).not.toContain(".theme-toggle-label");
    expect(appCss).toContain("transform: translateX(16px)");
    expect(appCss).toContain("cubic-bezier(0.2, 0.8, 0.2, 1)");
  });

  it("exposes Dell 1996 as an independent persisted visual theme", () => {
    const appSource = readFileSync("src/app/App.tsx", "utf8");
    const mapSource = readFileSync("src/graph/ExecutionMap.tsx", "utf8");
    const appCss = readAppCss();
    const mapCss = readExecutionMapCss();

    expect(appSource).toContain('TEAM_CONSOLE_VISUAL_THEME_STORAGE_KEY = "ugk-team-console:visual-theme:v1"');
    expect(appSource).toContain('type TeamConsoleVisualTheme = "default" | "dell-1996"');
    expect(appSource).toContain("data-visual-theme={visualTheme}");
    expect(mapSource).toContain("emap-split-task-node");
    expect(mapSource).toContain("data-canvas-kind={task.canvasKind}");
    expect(appSource).toContain('aria-label="切换视觉主题"');
    expect(appSource).toContain('className="visual-theme-toggle-btn"');
    expect(appSource).toContain('current === "default" ? "dell-1996" : "default"');
    expect(appSource).toContain('const effectiveTheme: TeamConsoleTheme = visualTheme === "dell-1996" ? "light" : theme');
    expect(appSource).toContain('disabled={visualTheme === "dell-1996"}');
    expect(mapSource).toContain('import "./execution-map-dell-1996.css";');
    expect(appCss).toContain(".visual-theme-toggle-btn");
    expect(mapCss).toContain('[data-visual-theme="dell-1996"] .execution-map-container');
    expect(mapCss).toContain('[data-visual-theme="dell-1996"] .emap-canvas-task-node');
    expect(mapCss).toContain('[data-visual-theme="dell-1996"] .emap-split-task-node');
    expect(mapCss).toContain('[data-visual-theme="dell-1996"] .emap-agent-node');
    expect(mapCss).toContain('[data-visual-theme="dell-1996"] .emap-source-node');
    expect(mapCss).toContain('[data-visual-theme="dell-1996"] .task-action-branch');
    expect(mapCss).toContain('[data-visual-theme="dell-1996"] .emap-run-observer-panel');
    expect(mapCss).toContain('[data-visual-theme="dell-1996"] .emap-artifact-preview');
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-task-group-frame\s*{[^}]*background:\s*rgba\(241,\s*238,\s*228,\s*0\.52\);/s);
    expect(mapCss).not.toContain('[data-visual-theme="dell-1996"][data-theme="dark"]');
    expect(mapCss).toContain("--dell-selected: #1f5e73");
    expect(mapCss).toContain("--dell-hover: #dfe9ec");
    expect(mapCss).not.toContain("--dell-canvas: #050807");
    expect(mapCss).not.toContain("--dell-selected: #39ff88");
    expect(mapCss).not.toContain("#a855f7");
    expect(mapCss).not.toContain("#00e5ff");
    expect(mapCss).not.toContain("#ff3d8d");
    expect(mapCss).not.toContain("#17130e");
    expect(mapCss).not.toContain("#ead8b6");
    expect(mapCss).toContain("border: 2px solid var(--dell-border)");
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-node\s*{[^}]*box-shadow:\s*none;/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-node:hover\s*{[^}]*box-shadow:\s*4px 4px 0 var\(--dell-shadow\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-node:hover\s*{[^}]*transform:\s*translate\(-2px,\s*-2px\);/s);
    expect(mapCss).not.toMatch(/\[data-visual-theme="dell-1996"\] \.emap-node:hover\s*{[^}]*background:/s);
    expect(mapCss).not.toMatch(/\[data-visual-theme="dell-1996"\] \.emap-task-agent-row:hover\s*{[^}]*box-shadow:/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.agent-playground-branch:hover,[\s\S]*?\.emap-run-observer-panel:hover\s*{[^}]*box-shadow:\s*4px 4px 0 var\(--dell-shadow\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.agent-playground-branch:hover,[\s\S]*?\.emap-run-observer-panel:hover\s*{[^}]*transform:\s*none;/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.agent-playground-branch:hover,[\s\S]*?\.emap-run-observer-panel:hover\s*{[^}]*outline:\s*2px solid var\(--dell-border\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-agent-branch-shell,[\s\S]*?\.emap-task-child-branch-shell\s*{[^}]*contain:\s*layout style;/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-agent-branch-shell:hover,[\s\S]*?\.emap-task-child-branch-shell:hover\s*{[^}]*z-index:\s*var\(--emap-layer-context-active\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-agent-branch-shell:hover,[\s\S]*?\.emap-task-child-branch-shell:hover\s*{[^}]*transform:\s*translate\(-2px,\s*-2px\) translateZ\(0\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-node\.selected,\n\[data-visual-theme="dell-1996"\] \.emap-node\.is-atlas-selected\s*{[^}]*color:\s*var\(--dell-ink\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-node\.selected,\n\[data-visual-theme="dell-1996"\] \.emap-node\.is-atlas-selected\s*{[^}]*box-shadow:\s*none;/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-node\.selected:hover,[\s\S]*?\.emap-node\.is-atlas-selected:hover\s*{[^}]*box-shadow:\s*4px 4px 0 var\(--dell-shadow\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.execution-map-toolbar,[\s\S]*?\.emap-root-trash\s*{[^}]*box-shadow:\s*none;/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-run-observer-panel\s*{[^}]*box-shadow:\s*none;/s);
    expect(mapCss).not.toMatch(/\[data-visual-theme="dell-1996"\] \.emap-observer-process-node:hover\s*{[^}]*box-shadow:/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-observer-file-detail-node:hover\s*{[^}]*box-shadow:\s*4px 4px 0 var\(--dell-shadow\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-task-group-card:hover,[\s\S]*?\.discovery-channel-set-row:hover[\s\S]*?{[^}]*box-shadow:\s*3px 3px 0 var\(--dell-shadow\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-run-history-item\.selected,[\s\S]*?\.run-history-file-row\.selected\s*{[^}]*box-shadow:\s*none;/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-run-history-item\.selected:hover,[\s\S]*?\.run-history-file-row\.selected:hover\s*{[^}]*box-shadow:\s*3px 3px 0 var\(--dell-shadow\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-observer-file-row\.selected\s*{[^}]*box-shadow:\s*none;/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-observer-file-row:hover\s*{[^}]*box-shadow:\s*none;/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-observer-file-row\.selected:hover\s*{[^}]*box-shadow:\s*none;/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-observer-file-row\.worker,[\s\S]*?\.emap-observer-file-row\.result\s*{[^}]*border:\s*2px solid var\(--dell-border\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-run-observer-stage-files\.worker,[\s\S]*?\.emap-run-observer-stage-files\.result\s*{[^}]*border-left:\s*0;/s);
    expect(mapCss).not.toContain(".emap-node.selected::before");
    expect(mapCss).not.toContain(".emap-node.is-atlas-selected::before");
    expect(mapCss).not.toContain(".emap-node.selected *");
    expect(mapCss).not.toContain(".emap-node.is-atlas-selected *");
    expect(mapCss).toContain("--dell-agent-accent: #356f9f");
    expect(mapCss).toContain("--dell-split-accent: #8b3f6f");
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-agent-node \.emap-node-status-bar\s*{[^}]*background:\s*var\(--dell-agent-accent\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-canvas-task-node \.emap-node-status-bar\s*{[^}]*background:\s*var\(--dell-task-accent\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-discovery-task-node \.emap-node-status-bar\s*{[^}]*background:\s*var\(--dell-discovery-accent\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-split-task-node \.emap-node-status-bar\s*{[^}]*background:\s*var\(--dell-split-accent\);/s);
    expect(mapCss).toContain(".emap-evidence-card");
    expect(mapCss).toContain(".emap-evidence-node");
    expect(mapCss).toContain(".emap-run-history-panel");
    expect(mapCss).toContain(".emap-run-history-toolbar");
    expect(mapCss).toContain(".emap-run-history-item.selected");
    expect(mapCss).toContain(".emap-run-history-badge");
    expect(mapCss).toContain(".emap-run-history-actions button");
    expect(mapCss).toContain(".run-history-drawer");
    expect(mapCss).toContain(".run-history-row-shell.selected");
    expect(mapCss).toContain(".run-history-file-preview");
    expect(mapCss).toContain(".emap-run-observer-history-summary");
    expect(mapCss).toContain(".emap-run-observer-stage");
    expect(mapCss).toContain(".emap-observer-file-row");
    expect(mapCss).toContain(".emap-observer-file-detail-node");
    expect(mapCss).not.toMatch(/\[data-visual-theme="dell-1996"\] \.emap-observer-process-node\.(worker|checker)\s*{[^}]*border-left:/s);
    expect(mapCss).not.toMatch(/\[data-visual-theme="dell-1996"\] \.emap-run-observer-stage\.(worker|checker)\s*{[^}]*border-left:/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-run-observer-stage\s*{[^}]*padding-left:\s*12px;/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-run-observer-panel \.emap-observer-process-node\s*{[^}]*border:\s*2px solid var\(--dell-border\);/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-run-observer-stage::before\s*{[^}]*display:\s*none;/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-run-observer-stage::after\s*{[^}]*display:\s*none;/s);
    expect(mapCss).toMatch(/\[data-visual-theme="dell-1996"\] \.emap-run-observer-stage-files\s*{[^}]*padding-left:\s*12px;/s);
    expect(mapCss).toContain(".task-run-detail-pre");
    expect(mapCss).toContain(".team-md-content pre");
    expect(mapCss).toContain(".emap-observer-process-status");
    expect(mapCss).toContain(".emap-task-group-member-chip");
    expect(mapCss).toContain(".discovery-stage-strip");
    expect(mapCss).toContain(".discovery-channel-set-row");
    expect(mapCss).toContain(".discovery-dispatch-diagnostic-item");
    expect(mapCss).toContain(".discovery-generated-card-actions");
    expect(mapCss).toContain(".task-edit-field input");
    expect(mapCss).toContain("border-radius: 0 !important");
    expect(mapCss).not.toContain("background: var(--dell-yellow);");
  });

  it("keeps Dell 1996 connector lines legible over task group backgrounds", () => {
    const mapCss = readExecutionMapCss();
    const linkRule = mapCss.match(/\[data-visual-theme="dell-1996"\] \.emap-link\s*{[^}]*}/)?.[0] ?? "";
    const branchRule = mapCss.match(/\[data-visual-theme="dell-1996"\] \.emap-link-branch\s*{[^}]*}/)?.[0] ?? "";
    const taskConnectionRule =
      mapCss.match(
        /\[data-visual-theme="dell-1996"\] \.emap-link-task-connection,\n\[data-visual-theme="dell-1996"\] \.emap-link-source-connection\s*{[^}]*}/,
      )?.[0] ?? "";
    const dependencyRule =
      mapCss.match(
        /\[data-visual-theme="dell-1996"\] \.emap-link-task-dependency,\n\[data-visual-theme="dell-1996"\] \.emap-link-failed\s*{[^}]*}/,
      )?.[0] ?? "";

    expect(linkRule).toContain("stroke: var(--dell-frame)");
    expect(linkRule).toContain("stroke-width: 2.8");
    expect(linkRule).toContain("drop-shadow(0 1px 0 var(--dell-paper))");
    expect(linkRule).toContain("drop-shadow(1px 0 0 var(--dell-paper))");
    expect(linkRule).toContain("vector-effect: non-scaling-stroke");
    expect(branchRule).toContain("stroke-width: 2.4");
    expect(branchRule).toContain("opacity: 1");
    expect(taskConnectionRule).toContain("stroke-width: 3");
    expect(dependencyRule).toContain("stroke-width: 2.8");
  });

  it("does not render the obsolete live run switcher bar", () => {
    const appSource = readFileSync("src/app/App.tsx", "utf8");

    expect(appSource).not.toContain("live-run-bar");
    expect(appSource).not.toContain("运行图：");
    expect(appSource).not.toContain("最新 Run");
  });

  it("does not render the obsolete mock fixture switcher bar", () => {
    const appSource = readFileSync("src/app/App.tsx", "utf8");
    const appCss = readAppCss();

    expect(appSource).not.toContain('className="fixture-bar"');
    expect(appSource).not.toContain("示例：");
    expect(appSource).not.toContain("ALL_FIXTURES.map");
    expect(appCss).not.toContain(".fixture-bar");
    expect(appCss).not.toContain(".fixture-btn");
  });

  it("uses an animated sliding segment for root node filters", () => {
    const appSource = readFileSync("src/app/App.tsx", "utf8");
    const appCss = readAppCss();
    const mapCss = readExecutionMapCss();
    const segmentRule = appCss.match(/\.root-filter-segment\s*{[^}]*}/)?.[0] ?? "";
    const sliderRule = appCss.match(/\.root-filter-segment::before\s*{[^}]*}/)?.[0] ?? "";
    const agentRule = appCss.match(/\.root-filter-segment\[data-active-filter="agent"\]::before\s*{[^}]*}/)?.[0] ?? "";
    const taskRule = appCss.match(/\.root-filter-segment\[data-active-filter="task"\]::before\s*{[^}]*}/)?.[0] ?? "";
    const activeButtonRule = appCss.match(/\.root-filter-btn\.is-active\s*{[^}]*}/)?.[0] ?? "";
    const toolbarResetRule = mapCss.match(/\.execution-map-toolbar \.root-filter-btn\s*{[^}]*}/)?.[0] ?? "";
    const toolbarHoverResetRule = mapCss.match(/\.execution-map-toolbar \.root-filter-btn:hover\s*{[^}]*}/)?.[0] ?? "";
    const toolbarSideRule = mapCss.match(/\.execution-map-toolbar-side\s*{[^}]*}/)?.[0] ?? "";

    expect(appSource).toContain("data-active-filter={rootNodeFilter}");
    expect(toolbarSideRule).toContain("display: inline-flex");
    expect(toolbarSideRule).toContain("align-items: center");
    expect(segmentRule).toContain("position: relative");
    expect(segmentRule).toContain("border-radius: 8px");
    expect(segmentRule).toContain("overflow: hidden");
    expect(sliderRule).toContain('content: ""');
    expect(sliderRule).toContain("width: var(--root-filter-item-width)");
    expect(sliderRule).toContain("border-radius: 6px");
    expect(sliderRule).toContain("transition:");
    expect(sliderRule).toContain("cubic-bezier(0.2, 0.8, 0.2, 1)");
    expect(agentRule).toContain("transform: translateX(var(--root-filter-item-width))");
    expect(taskRule).toContain("transform: translateX(calc(var(--root-filter-item-width) * 2))");
    expect(activeButtonRule).not.toContain("background:");
    expect(activeButtonRule).not.toContain("box-shadow:");
    expect(toolbarResetRule).toContain("border: 0");
    expect(toolbarResetRule).toContain("background: transparent");
    expect(toolbarResetRule).toContain("box-shadow: none");
    expect(toolbarHoverResetRule).toContain("background: transparent");
    expect(toolbarHoverResetRule).toContain("transform: none");
  });

  it("keeps the merged run observer outer panel auto-height while process sections use themed internal scrollbars", () => {
    const mapCss = readExecutionMapCss();
    const appCss = readAppCss();
    const panelRule = mapCss.match(/\.emap-run-observer-panel\s*{[^}]*}/)?.[0] ?? "";
    const appPanelRule = appCss.match(/\.emap-run-observer-panel\s*{[^}]*}/)?.[0] ?? "";
    const stageRule = mapCss.match(/\.emap-run-observer-stage\s*{[^}]*}/)?.[0] ?? "";
    const processTopRule = mapCss.match(/\.emap-run-observer-panel\s+\.emap-observer-process-top\s*{[^}]*}/)?.[0] ?? "";
    const scrollbarRule = mapCss.match(/\.emap-run-observer-panel\s+\.emap-observer-process-top::-webkit-scrollbar\s*{[^}]*}/)?.[0] ?? "";
    const thumbRule = mapCss.match(/\.emap-run-observer-panel\s+\.emap-observer-process-top::-webkit-scrollbar-thumb\s*{[^}]*}/)?.[0] ?? "";
    const checkerThumbRule = mapCss.match(/\.emap-run-observer-stage\.checker\s+\.emap-observer-process-top::-webkit-scrollbar-thumb\s*{[^}]*}/)?.[0] ?? "";
    const connectorSocketRule = mapCss.match(/\.emap-connector-sockets\s*{[^}]*}/)?.[0] ?? "";
    const sourceSocketRule = mapCss.match(/^\.emap-connector-source-socket\s*{[^}]*}/m)?.[0] ?? "";
    const taskConnectionSocketRule = mapCss.match(/\.emap-connector-socket-task-connection\s+\.emap-connector-source-socket\s*{[^}]*}/)?.[0] ?? "";
    const agentSocketRule = mapCss.match(/\.emap-connector-socket-agent-branch\s+\.emap-connector-source-socket\s*{[^}]*}/)?.[0] ?? "";
    const evidenceSocketRule = mapCss.match(/\.emap-connector-socket-evidence\s+\.emap-connector-source-socket\s*{[^}]*}/)?.[0] ?? "";
    const detailBodyRule = mapCss.match(/\.emap-observer-file-detail-body\s*{[^}]*}/)?.[0] ?? "";
    const detailScrollbarRule = mapCss.match(/\.emap-observer-file-detail-body::-webkit-scrollbar\s*{[^}]*}/)?.[0] ?? "";
    const detailThumbRule = mapCss.match(/\.emap-observer-file-detail-body::-webkit-scrollbar-thumb\s*{[^}]*}/)?.[0] ?? "";
    const observerNodeRule = mapCss.match(/\.emap-observer-node\s*{[^}]*}/)?.[0] ?? "";
    const processNodeRule = mapCss.match(/\.emap-observer-process-node\s*{[^}]*}/)?.[0] ?? "";
    const fileDetailRule = mapCss.match(/\.emap-observer-file-detail-node\s*{[^}]*}/)?.[0] ?? "";
    const detailPreRule = mapCss.match(/\.task-run-detail-pre\s*{[^}]*}/)?.[0] ?? "";
    const mdContentRule = mapCss.match(/\.team-md-content\s*{[^}]*}/)?.[0] ?? "";
    const maximizeButtonRule = mapCss.match(/\.emap-agent-branch-maximize-button\s*{[^}]*}/)?.[0] ?? "";
    const artifactPreviewRule = mapCss.match(/\.emap-artifact-preview\s*{[^}]*}/)?.[0] ?? "";

    expect(panelRule).toContain("overflow: visible");
    expect(panelRule).not.toContain("overflow: auto");
    expect(appPanelRule).toContain("max-height: none");
    expect(appPanelRule).toContain("overflow: visible");
    expect(appPanelRule).not.toContain("overflow-y: auto");
    expect(appPanelRule).not.toContain("overscroll-behavior: contain");
    expect(stageRule).toContain("height: 204px");
    expect(processTopRule).toContain("overflow-y: auto");
    expect(processTopRule).toContain("scrollbar-width: thin");
    expect(processTopRule).toContain("scrollbar-color: rgba(22, 124, 128, 0.58) rgba(226, 232, 240, 0.78)");
    expect(scrollbarRule).toContain("width: 8px");
    expect(scrollbarRule).not.toContain("display: none");
    expect(thumbRule).toContain("border: 2px solid rgba(226, 232, 240, 0.78)");
    expect(thumbRule).toContain("rgba(22, 124, 128");
    expect(checkerThumbRule).toContain("rgba(255, 206, 118");
    expect(detailBodyRule).toContain("scrollbar-width: thin");
    expect(detailBodyRule).toContain("scrollbar-color: rgba(22, 124, 128, 0.58) rgba(226, 232, 240, 0.78)");
    expect(detailScrollbarRule).toContain("width: 8px");
    expect(detailThumbRule).toContain("border: 2px solid rgba(226, 232, 240, 0.78)");
    expect(detailThumbRule).toContain("rgba(22, 124, 128");
    expect(observerNodeRule).toContain("background: rgba(255, 255, 255, 0.92)");
    expect(processNodeRule).toContain("rgba(255, 255, 255, 0.88)");
    expect(fileDetailRule).toContain("rgba(255, 255, 255, 0.92)");
    expect(detailPreRule).toContain("background: rgba(248, 250, 252, 0.92)");
    expect(detailPreRule).toContain("color: var(--primary)");
    expect(mdContentRule).toContain("color: var(--primary)");
    expect(maximizeButtonRule).toContain("background: rgba(255, 255, 255, 0.88)");
    expect(artifactPreviewRule).toContain("background: rgba(255, 255, 255, 0.96)");
    expect(connectorSocketRule).toContain("pointer-events: none");
    expect(sourceSocketRule).toContain("stroke-width: 1.6");
    expect(sourceSocketRule).toContain("stroke-linecap: round");
    expect(sourceSocketRule).toContain("vector-effect: non-scaling-stroke");
    expect(sourceSocketRule).toContain("fill: rgba(255, 255, 255, 0.92)");
    expect(sourceSocketRule).toContain("rgba(255, 190, 96");
    expect(taskConnectionSocketRule).toContain("rgba(103, 210, 168");
    expect(agentSocketRule).toContain("rgba(121, 216, 208");
    expect(evidenceSocketRule).toContain("rgba(121, 216, 208");
    expect(mapCss).toContain('[data-theme="dark"] .emap-connector-source-socket');
    expect(mapCss).toContain("fill: rgba(7, 12, 22, 0.94)");
    expect(mapCss).toContain('[data-theme="dark"] .emap-run-observer-panel .emap-observer-process-top');
    expect(mapCss).toContain('[data-theme="dark"] .emap-observer-file-detail-body');
    expect(mapCss).toContain('[data-theme="dark"] .emap-observer-node');
    expect(mapCss).toContain('[data-theme="dark"] .task-run-detail-pre');
    expect(mapCss).toContain('[data-theme="dark"] .emap-artifact-preview');
    expect(mapCss).not.toContain(".emap-connector-anchor-ring");
    expect(mapCss).not.toContain(".emap-connector-anchor-dot");
  });

  it("keeps dark selected run history actions on a dark surface", () => {
    const appCss = readAppCss();
    const darkSelectedRule = appCss.match(/\[data-theme="dark"\] \.emap-run-history-item\.selected\s*{[^}]*}/)?.[0] ?? "";
    const darkSelectedActionRule = appCss.match(/\[data-theme="dark"\] \.emap-run-history-item\.selected \.emap-run-history-actions button\s*{[^}]*}/)?.[0] ?? "";
    const darkSelectedDisabledActionRule = appCss.match(/\[data-theme="dark"\] \.emap-run-history-item\.selected \.emap-run-history-actions button:disabled\s*{[^}]*}/)?.[0] ?? "";

    expect(darkSelectedRule).toContain("rgba(8, 14, 24, 0.92)");
    expect(darkSelectedActionRule).toContain("background: rgba(8, 14, 24, 0.78)");
    expect(darkSelectedActionRule).not.toContain("rgba(255, 255, 255");
    expect(darkSelectedDisabledActionRule).toContain("background: rgba(8, 14, 24, 0.46)");
    expect(darkSelectedDisabledActionRule).toContain("opacity: 1");
  });

  it("uses themed scrollbars for the run history list", () => {
    const appCss = readAppCss();
    const lastMatch = (pattern: RegExp): string => Array.from(appCss.matchAll(pattern)).at(-1)?.[0] ?? "";
    const listRule = lastMatch(/(?:^|\n)\.emap-run-history-list\s*{[^}]*}/g);
    const scrollbarRule = lastMatch(/(?:^|\n)\.emap-run-history-list::-webkit-scrollbar\s*{[^}]*}/g);
    const thumbRule = lastMatch(/(?:^|\n)\.emap-run-history-list::-webkit-scrollbar-thumb\s*{[^}]*}/g);
    const darkListRule = lastMatch(/\[data-theme="dark"\] \.emap-run-history-list\s*{[^}]*}/g);
    const darkThumbRule = lastMatch(/\[data-theme="dark"\] \.emap-run-history-list::-webkit-scrollbar-thumb\s*{[^}]*}/g);

    expect(listRule).toContain("scrollbar-width: thin");
    expect(listRule).toContain("scrollbar-color: rgba(22, 124, 128, 0.58) rgba(226, 232, 240, 0.78)");
    expect(scrollbarRule).toContain("width: 8px");
    expect(scrollbarRule).not.toContain("display: none");
    expect(thumbRule).toContain("border: 2px solid rgba(226, 232, 240, 0.78)");
    expect(thumbRule).toContain("background: rgba(22, 124, 128, 0.58)");
    expect(darkListRule).toContain("scrollbar-color: rgba(121, 216, 208, 0.62) rgba(8, 14, 24, 0.78)");
    expect(darkThumbRule).toContain("border-color: rgba(8, 14, 24, 0.78)");
  });

  it("keeps Task action run summaries readable instead of clipping runtime text", () => {
    const mapCss = readExecutionMapCss();
    const taskActionRule = mapCss.match(/\.task-action-branch\s*{[^}]*}/)?.[0] ?? "";
    const taskTitleRule = mapCss.match(/\.task-action-branch\s+\.task-leader-branch-title\s+strong\s*{[^}]*}/)?.[0] ?? "";
    const taskMenuRule = mapCss.match(/\.task-action-menu\s*{[^}]*}/)?.[0] ?? "";
    const summaryRule = mapCss.match(/\.task-run-summary\s*{[^}]*}/)?.[0] ?? "";
    const metricsRule = mapCss.match(/\.task-run-summary-metrics\s+strong\s*{[^}]*}/)?.[0] ?? "";
    const messageRule = mapCss.match(/\.task-run-summary-message\s*{[^}]*}/)?.[0] ?? "";
    const runIdRule = mapCss.match(/\.task-run-summary\s+code\s*{[^}]*}/)?.[0] ?? "";

    expect(taskActionRule).toContain("width: 320px");
    expect(taskActionRule).not.toContain("max-width: 280px");
    expect(taskTitleRule).toContain("white-space: normal");
    expect(taskTitleRule).not.toContain("text-overflow: ellipsis");
    expect(taskMenuRule).toContain("width: 100%");
    expect(summaryRule).toContain("width: 100%");
    expect(metricsRule).toContain("overflow-wrap: anywhere");
    expect(metricsRule).not.toContain("text-overflow: ellipsis");
    expect(messageRule).toContain("white-space: normal");
    expect(messageRule).not.toContain("text-overflow: ellipsis");
    expect(runIdRule).toContain("overflow-wrap: anywhere");
    expect(runIdRule).not.toContain("text-overflow: ellipsis");
  });

  it("uses an active accent for busy Agent cards", () => {
    const mapCss = readExecutionMapCss();
    const busyRule = mapCss.match(/\.emap-agent-node\[data-agent-run-state="busy"\]\s*{[^}]*}/)?.[0];
    const busyBarRule = mapCss.match(/\.emap-agent-node\[data-agent-run-state="busy"\]\s+\.emap-node-status-bar\s*{[^}]*}/)?.[0];
    const busyPillRule = mapCss.match(/\.emap-agent-node\[data-agent-run-state="busy"\]\s+\.emap-node-state-pill\.running\s*{[^}]*}/)?.[0];

    expect(busyRule).toContain("rgba(14, 165, 233");
    expect(busyRule).not.toContain("rgba(255, 104, 64");
    expect(busyBarRule).toContain("rgb(14, 165, 233)");
    expect(busyBarRule).toContain("rgb(20, 184, 166)");
    expect(busyPillRule).toContain("rgba(14, 165, 233");
    expect(busyPillRule).toContain("color: rgb(2, 132, 199)");
    expect(busyPillRule).not.toContain("rgb(255, 190, 165)");
    expect(mapCss).toContain('[data-theme="dark"] .emap-agent-node[data-agent-run-state="busy"] .emap-node-state-pill.running');
  });

  it("uses an active accent for running Task cards", () => {
    const mapCss = readExecutionMapCss();
    const runningRule = mapCss.match(/\.emap-canvas-task-node\.status-running\s*{[^}]*}/)?.[0] ?? "";
    const runningBarRule = mapCss.match(/\.emap-canvas-task-node\.status-running\s+\.emap-node-status-bar\s*{[^}]*}/)?.[0] ?? "";
    const runningPillRule = mapCss.match(/\.emap-canvas-task-node\.status-running\s+\.emap-node-state-pill\.running,\n\.emap-canvas-task-node\.status-running\s+\.emap-node-state-pill\.queued\s*{[^}]*}/)?.[0] ?? "";
    const atlasCardRule = mapCss.match(/\.emap-atlas-card\s*{[^}]*}/)?.[0] ?? "";
    const taskNodeContentRule = mapCss.match(/\.emap-canvas-task-node\s+\.emap-node-content\s*{[^}]*}/)?.[0] ?? "";
    const idCopyRule = mapCss.match(/\.emap-node-id-copy\s*{[^}]*}/)?.[0] ?? "";
    const executionMapSource = readFileSync("src/graph/ExecutionMap.tsx", "utf8");
    const taskAgentGridRule = mapCss.match(/\.emap-task-agent-grid\s*{[^}]*}/)?.[0] ?? "";
    const taskAgentRule = mapCss.match(/\.emap-task-agent-row\s*{[^}]*}/)?.[0] ?? "";
    const taskLeaderRule = mapCss.match(/\.emap-task-agent-row\.role-leader\s*{[^}]*}/)?.[0] ?? "";
    const taskWorkerRule = mapCss.match(/\.emap-task-agent-row\.role-worker\s*{[^}]*}/)?.[0] ?? "";
    const taskCheckerRule = mapCss.match(/\.emap-task-agent-row\.role-checker\s*{[^}]*}/)?.[0] ?? "";
    const portHoverRule = mapCss.match(/\.emap-task-port-chip:hover,\n\.emap-task-port-chip:focus-visible\s*{[^}]*}/)?.[0] ?? "";
    const portSelectedRule = mapCss.match(/\.emap-task-port-output\.is-selected\s*{[^}]*}/)?.[0] ?? "";

    expect(runningRule).toContain("rgba(14, 165, 233");
    expect(runningRule).not.toContain("rgba(255, 104, 64");
    expect(runningBarRule).toContain("rgb(14, 165, 233)");
    expect(runningBarRule).toContain("rgb(20, 184, 166)");
    expect(runningBarRule).toContain("animation: pulse-bar");
    expect(runningPillRule).toContain("display: inline-flex");
    expect(runningPillRule).toContain("rgba(14, 165, 233");
    expect(atlasCardRule).not.toContain("--emap-card-action-rail");
    expect(mapCss).not.toContain(".emap-atlas-card::before");
    expect(mapCss).not.toContain(".emap-node-minimize-button");
    expect(taskNodeContentRule).toContain("padding-right: 44px");
    expect(idCopyRule).toContain("cursor: copy");
    expect(idCopyRule).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(idCopyRule).toContain("justify-self: start");
    expect(idCopyRule).toContain("width: fit-content");
    expect(idCopyRule).toContain("max-width: min(100%, 178px)");
    expect(idCopyRule).not.toContain("width: 100%");
    expect(executionMapSource).toContain("AGENT_NODE_HEIGHT");
    const atlasGeometrySource = readFileSync("src/graph/atlas-geometry.ts", "utf8");
    expect(atlasGeometrySource).toContain("export const AGENT_NODE_HEIGHT = 132");
    expect(taskAgentGridRule).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(taskAgentGridRule).not.toContain("padding:");
    expect(taskAgentGridRule).not.toContain("border:");
    expect(taskAgentGridRule).not.toContain("border-radius:");
    expect(taskAgentGridRule).not.toContain("background:");
    expect(taskAgentRule).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(taskAgentRule).toContain("border-left");
    expect(taskLeaderRule).toContain("grid-column: 1 / -1");
    expect(taskLeaderRule).toContain("grid-template-columns: 46px minmax(0, 1fr)");
    expect(taskWorkerRule).toContain("rgba(22, 124, 128");
    expect(taskCheckerRule).toContain("rgba(184, 115, 0");
    expect(portHoverRule).toContain("background: rgba(22, 124, 128, 0.1)");
    expect(portHoverRule).not.toContain("rgba(52, 81, 68");
    expect(portSelectedRule).toContain("border-color: rgba(184, 115, 0, 0.58)");
    expect(portSelectedRule).toContain("background: rgba(255, 190, 96, 0.22)");
    expect(portSelectedRule).toContain("box-shadow: 0 0 0 1px rgba(184, 115, 0, 0.16)");
    expect(mapCss).toContain('[data-theme="dark"] .emap-task-port-output.is-selected');
  });

  it("restores dark card internals when the Team Console theme is dark", () => {
    const mapCss = readExecutionMapCss();

    expect(mapCss).toContain('[data-theme="dark"] .emap-node-state-pill');
    expect(mapCss).toContain("background: rgba(255, 255, 255, 0.04)");
    expect(mapCss).toContain('[data-theme="dark"] .emap-node-id-copy');
    expect(mapCss).toContain("rgba(2, 4, 11, 0.28)");
    expect(mapCss).toContain('[data-theme="dark"] .emap-root-dock-item');
    expect(mapCss).toContain("rgba(255, 255, 255, 0.035)");
    expect(mapCss).toContain('[data-theme="dark"] .agent-playground-branch-head');
    expect(mapCss).toContain("background: rgba(15, 24, 38, 0.96)");
    expect(mapCss).toContain('[data-theme="dark"] .task-leader-branch-hint');
    expect(mapCss).toContain("background: rgba(255, 190, 96, 0.06)");
    expect(mapCss).toContain('[data-theme="dark"] .emap-run-observer-panel');
    expect(mapCss).toContain("rgba(6, 11, 18, 0.98)");
    expect(mapCss).not.toContain('[data-theme="dark"] .emap-task-agent-grid');
    expect(mapCss).toContain('[data-theme="dark"] .emap-task-agent-row');
    expect(mapCss).toContain("rgba(16, 22, 32, 0.36)");
    expect(mapCss).toContain('[data-theme="dark"] .emap-task-agent-row b');
    expect(mapCss).toContain("rgba(216, 228, 241, 0.54)");
    expect(mapCss).toContain('[data-theme="dark"] .emap-task-agent-row em');
    expect(mapCss).toContain("rgba(232, 239, 247, 0.84)");
  });

  it("pins atlas card status pills to the top right", () => {
    const mapCss = readExecutionMapCss();

    const headerRule = mapCss.match(/\.emap-atlas-card\s+\.emap-node-header\s*{[^}]*}/)?.[0] ?? "";
    const pillRule = mapCss.match(/\.emap-atlas-card\s+\.emap-node-state-pill\s*{[^}]*}/)?.[0] ?? "";

    expect(headerRule).toContain("padding-right: 92px");
    expect(pillRule).toContain("position: absolute");
    expect(pillRule).toContain("top: 8px");
    expect(pillRule).toContain("right: 10px");
  });

  it("keeps Discovery subcanvas light by default while preserving dark theme overrides", () => {
    const mapCss = readExecutionMapCss();
    const appTsx = readFileSync("src/app/App.tsx", "utf8");
    const discoverySubcanvasRule = mapCss.match(/\.discovery-subcanvas-panel\s*{[^}]*}/)?.[0] ?? "";
    const discoveryGeneratedCardRule = mapCss.match(/\.discovery-generated-card\s*{[^}]*}/)?.[0] ?? "";

    expect(discoverySubcanvasRule).toContain("rgba(255, 255, 255, 0.98)");
    expect(discoverySubcanvasRule).not.toContain("rgba(7, 12, 22");
    expect(discoveryGeneratedCardRule).toContain("color: var(--primary)");
    expect(discoveryGeneratedCardRule).toContain("aspect-ratio: 1 / 1");
    expect(discoveryGeneratedCardRule).toContain("cursor: pointer");
    expect(discoveryGeneratedCardRule).not.toContain("color: #d8e4f1");
    expect(mapCss).toContain(".discovery-generated-card:hover");
    expect(mapCss).toContain(".discovery-generated-card:active");
    expect(mapCss).toContain(".discovery-generated-card.is-history-open");
    expect(mapCss).toContain(".discovery-generated-card.is-channel-selected");
    expect(mapCss).toContain(".discovery-generated-card-watermark");
    expect(mapCss).toContain(".discovery-generated-channel-checkbox");
    expect(mapCss).toContain(".discovery-channel-set-panel");
    expect(mapCss).toContain(".discovery-generated-card.state-running::after");
    expect(mapCss).toContain("@keyframes discovery-generated-card-progress");
    expect(mapCss).not.toContain(".discovery-subcanvas-running-grid");
    expect(mapCss).toContain(".discovery-generated-card.state-queued");
    expect(mapCss).toContain(".discovery-generated-card.state-done");
    expect(mapCss).toContain(".discovery-generated-card.state-failed");
    expect(mapCss).toContain(".discovery-generated-card.state-idle");
    expect(mapCss).toContain('[data-theme="dark"] .discovery-subcanvas-panel');
    expect(mapCss).toContain('[data-theme="dark"] .discovery-generated-card');
    expect(mapCss).toContain('[data-theme="dark"] .discovery-generated-card.is-channel-selected');
    expect(mapCss).toContain('[data-theme="dark"] .discovery-channel-set-panel');
    expect(mapCss).toContain('[data-theme="dark"] .discovery-generated-card.state-running');
    expect(mapCss).toContain('[data-theme="dark"] .discovery-generated-card.state-failed');
    expect(mapCss).toContain("rgba(7, 12, 22, 0.98)");
    expect(mapCss).toContain("color: #d8e4f1");
    expect(appTsx).toContain("discovery-generated-card-watermark");
    expect(appTsx).toContain("discovery-channel-set-panel");
    expect(appTsx).toContain("data-generated-channel-selected");
    expect(appTsx).toContain("discoveryChannelSetId");
    expect(appTsx).not.toContain("discovery-generated-card-meta");
    expect(appTsx).not.toContain("generatedSource?.sourceItemId");
  });

  it("keeps dark toolbar action buttons from being flattened by generic map button styles", () => {
    const mapCss = readExecutionMapCss();

    expect(mapCss).toContain('[data-theme="dark"] .execution-map-toolbar .agent-add-btn');
    expect(mapCss).toContain("border-color: rgba(121, 216, 208, 0.42)");
    expect(mapCss).toContain("rgba(13, 30, 36, 0.68)");
    expect(mapCss).toContain("color: rgb(182, 246, 240)");
    expect(mapCss).toContain("box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08)");
    expect(mapCss).toContain('[data-theme="dark"] .execution-map-toolbar .agent-add-btn:hover');
    expect(mapCss).toContain("border-color: rgba(121, 216, 208, 0.76)");
  });

  it("keeps zoom buttons removed and restores dark root filter tab highlights", () => {
    const appCss = readAppCss();
    const mapCss = readExecutionMapCss();
    const darkToolbarButtonRule = mapCss.match(/\[data-theme="dark"\] \.execution-map-toolbar button\s*{[^}]*}/)?.[0] ?? "";
    const darkToolbarHoverRule = mapCss.match(/\[data-theme="dark"\] \.execution-map-toolbar button:hover\s*{[^}]*}/)?.[0] ?? "";
    const darkRootFilterSliderRule = appCss.match(/\[data-theme="dark"\] \.root-filter-segment::before\s*{[^}]*}/)?.[0] ?? "";
    const darkRootFilterRule = appCss.match(/\[data-theme="dark"\] \.root-filter-btn\.is-active\s*{[^}]*}/)?.[0] ?? "";
    const darkRootFilterHoverRule = appCss.match(/\[data-theme="dark"\] \.root-filter-btn:not\(\.is-active\):hover\s*{[^}]*}/)?.[0] ?? "";
    const darkRootFilterToolbarResetRule = mapCss.match(/\[data-theme="dark"\] \.execution-map-toolbar \.root-filter-btn\s*{[^}]*}/)?.[0] ?? "";

    expect(mapCss).not.toContain(".execution-map-toolbar-viewport");
    expect(mapCss).not.toContain(".execution-map-icon-button");
    expect(mapCss).not.toContain(".execution-map-reset-button");
    expect(mapCss).not.toContain(".execution-map-zoom");
    expect(darkToolbarButtonRule).toContain("box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08)");
    expect(darkToolbarButtonRule).not.toContain("rgba(255, 255, 255, 0.88)");
    expect(darkToolbarHoverRule).toContain("background: rgba(121, 216, 208, 0.12)");
    expect(darkToolbarHoverRule).toContain("box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1)");
    expect(darkRootFilterSliderRule).toContain("box-shadow:");
    expect(darkRootFilterSliderRule).toContain("inset 0 1px 0 rgba(255, 255, 255, 0.18)");
    expect(darkRootFilterSliderRule).toContain("rgba(121, 216, 208, 0.42)");
    expect(darkRootFilterRule).not.toContain("rgba(255, 255, 255, 0.84)");
    expect(darkRootFilterHoverRule).not.toContain("background:");
    expect(darkRootFilterHoverRule).toContain("color: rgba(232, 239, 247, 0.92)");
    expect(darkRootFilterToolbarResetRule).toContain("background: transparent");
    expect(darkRootFilterToolbarResetRule).toContain("box-shadow: none");
  });

  it("uses light surfaces for Task menu run summaries, run observer headers, and edit panels", () => {
    const mapCss = readExecutionMapCss();
    const summaryRule = mapCss.match(/\.task-run-summary\s*{[^}]*}/)?.[0] ?? "";
    const summaryHeadRule = mapCss.match(/\.task-run-summary-head\s+strong\s*{[^}]*}/)?.[0] ?? "";
    const observerHeadRule = mapCss.match(/\.emap-run-observer-head\s*{[^}]*}/)?.[0] ?? "";
    const observerHeadSpanRule = mapCss.match(/\.emap-run-observer-head\s+span\s*{[^}]*}/)?.[0] ?? "";
    const editFormRule = mapCss.match(/(?:^|\n)\.task-edit-form\s*{[^}]*}/)?.[0] ?? "";
    const editNoteRule = mapCss.match(/\.task-edit-note,\n\.task-edit-warning\s*{[^}]*}/)?.[0] ?? "";
    const editFieldRule = mapCss.match(/\.task-edit-field\s+input,\n\.task-edit-field\s+select\s*{[^}]*}/)?.[0] ?? "";
    const darkEditFieldRule = mapCss.match(/\[data-theme="dark"\] \.task-edit-field input,\n\[data-theme="dark"\] \.task-edit-field select\s*{[^}]*}/)?.[0] ?? "";
    const darkEditOptionRule = mapCss.match(/\[data-theme="dark"\] \.task-edit-field select option\s*{[^}]*}/)?.[0] ?? "";

    expect(summaryRule).toContain("rgba(255, 255, 255, 0.88)");
    expect(summaryRule).toContain("color: var(--primary)");
    expect(summaryRule).not.toContain("rgba(12, 20, 28, 0.72)");
    expect(summaryHeadRule).toContain("color: var(--primary)");
    expect(observerHeadRule).toContain("background: rgba(248, 250, 252, 0.84)");
    expect(observerHeadSpanRule).toContain("rgba(71, 85, 105, 0.68)");
    expect(editFormRule).toContain("rgba(255, 255, 255, 0.96)");
    expect(editNoteRule).toContain("background: rgba(248, 250, 252, 0.82)");
    expect(editFieldRule).toContain("background: rgba(255, 255, 255, 0.92)");
    expect(mapCss).toContain('[data-theme="dark"] .task-run-summary');
    expect(mapCss).toContain('[data-theme="dark"] .emap-run-observer-head');
    expect(mapCss).toContain('[data-theme="dark"] .task-edit-form');
    expect(darkEditFieldRule).toContain("color-scheme: dark");
    expect(darkEditOptionRule).toContain("background: rgb(15, 23, 42)");
    expect(darkEditOptionRule).toContain("color: rgb(232, 239, 247)");
  });

  it("uses a light amber surface for the Task dependency connector button", () => {
    const mapCss = readExecutionMapCss();
    const depHandleRule = mapCss.match(/(?:^|\n)\.emap-task-dep-handle\s*{[^}]*}/)?.[0] ?? "";
    const depHandleHoverRule = mapCss.match(/\.emap-task-dep-handle:hover,\n\.emap-task-dep-handle:focus-visible\s*{[^}]*}/)?.[0] ?? "";

    expect(depHandleRule).toContain("border: 1.5px solid rgba(184, 115, 0, 0.34)");
    expect(depHandleRule).toContain("rgba(255, 248, 235, 0.88)");
    expect(depHandleRule).toContain("color: #9a5f00");
    expect(depHandleRule).not.toContain("rgba(2, 4, 11, 0.42)");
    expect(depHandleHoverRule).toContain("background: rgba(255, 190, 96, 0.18)");
    expect(depHandleHoverRule).toContain("border-color: rgba(184, 115, 0, 0.58)");
    expect(mapCss).toContain('[data-theme="dark"] .emap-task-dep-handle');
    expect(mapCss).toContain("rgba(2, 4, 11, 0.42)");
  });

  it("centers link cut buttons on the connector point instead of using fixed offsets", () => {
    const mapCss = readExecutionMapCss();
    const cutRule = mapCss.match(/\.emap-link-cut-button\s*{[^}]*}/)?.[0] ?? "";
    const visibleRule = mapCss.match(/\.emap-link-cut-button\.is-visible,\n\.emap-link-cut-button:hover,\n\.emap-link-cut-button:focus-visible\s*{[^}]*}/)?.[0] ?? "";

    expect(cutRule).toContain("box-sizing: border-box");
    expect(cutRule).toContain("transform: translate(-50%, -50%) scale(0.78)");
    expect(visibleRule).toContain("transform: translate(-50%, -50%) scale(1)");
  });

  it("keeps Execution Atlas canvas layer z-index values on named tokens", () => {
    const mapCss = readExecutionMapCss();
    const mapSource = readFileSync("src/graph/ExecutionMap.tsx", "utf8");
    const rules = (selector: string) =>
      Array.from(mapCss.matchAll(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*{[^}]*}`, "g")), (match) => match[0]);
    const rule = (selector: string) => rules(selector)[0] ?? "";
    const layerRule = (selector: string) => rules(selector).find((candidate) => candidate.includes("z-index:")) ?? "";

    expect(mapSource).toContain('import "./execution-map-layering.css";');
    expect(mapSource).toContain('from "./atlas-layering";');
    expect(mapSource).toContain("activeAtlasLayerKey");
    expect(mapSource).toContain("createAtlasLayerContext");
    expect(mapSource).toContain("isAtlasLayerContextActive");
    expect(mapSource).toContain("getAtlasLayerTargetClassName");
    expect(mapSource).toContain("getAtlasLinkLayerBucket");
    expect(mapSource).toContain("atlasLayerKey(");
    expect(mapSource).not.toContain("const isAtlasLayerKeyActive = (key: string) => activeAtlasLayerKey === key || hoveredAtlasLayerKey === key;");
    expect(mapSource).toContain("getAtlasPanelLayerStyle(p.layerDepth)");
    expect(rule(".execution-map-toolbar")).toContain("z-index: var(--emap-layer-shell-toolbar)");
    expect(rule(".execution-map-selection-rect")).toContain("z-index: var(--emap-layer-shell-selection)");
    expect(rule(".execution-map-links")).not.toContain("z-index:");
    expect(rule(".execution-map-link-layer")).not.toContain("z-index:");
    expect(rule(".execution-map-link-layer-base")).toContain("z-index: var(--emap-layer-connector-base)");
    expect(rule(".execution-map-link-layer-child")).toContain("z-index: var(--emap-layer-connector-child)");
    expect(rule(".execution-map-link-layer-active")).toContain("z-index: var(--emap-layer-context-active)");
    expect(rule(".execution-map-nodes")).not.toContain("z-index:");
    expect(rule(".emap-node")).toContain("z-index: var(--emap-layer-node-base)");
    expect(rule(".emap-link-cut-button")).toContain("z-index: var(--emap-layer-control-connector)");
    expect(rule(".emap-task-group-frame")).toContain("z-index: var(--emap-layer-group-background)");
    expect(rule('.emap-task-group-frame[data-task-group-empty="true"]')).toContain("z-index: var(--emap-layer-group-empty)");
    expect(layerRule(".emap-task-group-card")).toContain("z-index: var(--emap-layer-node-base)");
    expect(rule(".emap-root-dock")).toContain("z-index: var(--emap-layer-shell-root-dock)");
    expect(rule(".emap-root-trash")).toContain("z-index: var(--emap-layer-shell-drag-affordance)");
    expect(rule(".emap-root-dock-flight")).toContain("z-index: var(--emap-layer-shell-transient-flight)");
    expect(rule(".emap-maximized-branch-shell")).toContain("z-index: var(--emap-layer-shell-maximized)");
    expect(mapCss).toMatch(/\.emap-node\.is-layer-active\s*{[^}]*z-index:\s*var\(--emap-layer-context-active\);/s);
    expect(mapCss).toMatch(/\.emap-node\.is-layer-dragging\s*{[^}]*z-index:\s*var\(--emap-layer-context-dragging\);/s);
    expect(mapCss).toMatch(/\.emap-agent-branch-shell\s*{[^}]*z-index:\s*calc\(var\(--emap-layer-panel-child\) \+ var\(--emap-panel-depth-offset, 0\)\);/s);
    expect(mapCss).toMatch(/\.emap-task-child-branch-shell\s*{[^}]*z-index:\s*calc\(var\(--emap-layer-panel-child\) \+ var\(--emap-panel-depth-offset, 0\)\);/s);
    expect(mapCss).toContain("--emap-layer-app-modal: 1000");
    expect(mapSource).toContain('className="execution-map-links execution-map-link-layer execution-map-link-layer-base"');
    expect(mapSource).toContain('className="execution-map-links execution-map-link-layer execution-map-link-layer-child"');
    expect(mapSource).toContain('className="execution-map-links execution-map-link-layer execution-map-link-layer-active"');
  });

  it("documents Team Console current Windows Core behavior", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("Execution Atlas");
    expect(readme).toContain("Agent 分支");
    expect(readme).toContain("Live API");
    expect(readme).toContain("/v1/agents");
    expect(readme).toContain("/v1/agents/status");
    expect(readme).toContain("TEAM_CONSOLE_API_TARGET=http://127.0.0.1:8888");
    expect(readme).toContain("/playground?view=chat&agentId=<agentId>&embed=team-console");
    expect(readme).toContain("Task、Source、Group、Task run 和 Agent profile 的权威数据来自主服务 API");
    expect(readme).not.toContain("5174");
    expect(readme).not.toContain("Docker");

    const runtimeDoc = readFileSync("../../docs/team-runtime.md", "utf8");
    expect(runtimeDoc).toContain("Team Runtime 是 UGK Mini Agent 的 Canvas Task 执行层");
    expect(runtimeDoc).toContain("http://127.0.0.1:9999");
    expect(runtimeDoc).toContain("http://127.0.0.1:8888");
    expect(runtimeDoc).toContain("POST /v1/team/tasks/:taskId/runs");
    expect(runtimeDoc).toContain("ARTIFACT_PUBLIC_DIR");
    expect(runtimeDoc).not.toContain("docker compose");

    const playgroundCurrent = readFileSync("../../docs/playground-current.md", "utf8");
    expect(playgroundCurrent).toContain("http://127.0.0.1:8888/playground");
    expect(playgroundCurrent).toContain("Conn 是后台定时 / 周期 / 延迟执行能力");
    expect(playgroundCurrent).toContain('{ "type": "task_inbox" }');
    expect(playgroundCurrent).not.toContain("飞书");
    expect(playgroundCurrent).not.toContain("web-access");
  });
});
