import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

export type AtlasViewport = { x: number; y: number; scale: number };
export type AtlasInteractionMode = "free" | "locked";
export type AtlasSelectionRect = { x: number; y: number; width: number; height: number };

interface AtlasCanvasShellProps {
  children: ReactNode;
  overlay?: ReactNode;
  hideWorld?: boolean;
  viewport?: AtlasViewport;
  defaultViewport?: AtlasViewport;
  onViewportChange?: (viewport: AtlasViewport) => void;
  toolbarStart?: ReactNode;
  agentFocusId?: string | null;
  interactionMode?: AtlasInteractionMode;
  onSelectionComplete?: (rect: AtlasSelectionRect) => void;
}

interface CanvasDragOrigin {
  pointerId: number;
  startX: number;
  startY: number;
  panX: number;
  panY: number;
}

interface CanvasSelectionOrigin {
  pointerId: number;
  startLocalX: number;
  startLocalY: number;
  viewport: AtlasViewport;
}

type ScreenSelectionRect = { left: number; top: number; width: number; height: number };

const DEFAULT_VIEWPORT: AtlasViewport = { x: 0, y: 0, scale: 1 };
const MIN_SCALE = 0.45;
const MAX_SCALE = 1.8;
const ZOOM_STEP = 1.1;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))));
}

function formatCanvasNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

function canStartCanvasPan(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return !target.closest(".emap-node, .emap-evidence-node, .emap-artifact-preview, .execution-map-toolbar, .agent-focus-workspace, .emap-agent-branch-shell, .emap-task-branch-shell, .emap-task-child-branch-shell, .agent-playground-branch, button, select, input, textarea, a, iframe, summary, details");
}

function pointerPoint(event: PointerEvent<HTMLDivElement>): { x: number; y: number } {
  const native = event.nativeEvent as globalThis.PointerEvent & { clientX?: number; clientY?: number };
  const x = Number.isFinite(event.clientX) ? event.clientX : Number.isFinite(native.clientX) ? native.clientX! : 0;
  const y = Number.isFinite(event.clientY) ? event.clientY : Number.isFinite(native.clientY) ? native.clientY! : 0;
  return { x, y };
}

function pointerLocalPoint(container: HTMLDivElement | null, event: PointerEvent<HTMLDivElement>): { x: number; y: number } {
  const point = pointerPoint(event);
  const rect = container?.getBoundingClientRect();
  if (!rect) return point;
  return { x: point.x - rect.left, y: point.y - rect.top };
}

function normalizeScreenRect(startX: number, startY: number, endX: number, endY: number): ScreenSelectionRect {
  return {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

function toWorldSelectionRect(screenRect: ScreenSelectionRect, viewport: AtlasViewport): AtlasSelectionRect {
  const scale = Number.isFinite(viewport.scale) && viewport.scale > 0 ? viewport.scale : 1;
  return {
    x: (screenRect.left - viewport.x) / scale,
    y: (screenRect.top - viewport.y) / scale,
    width: screenRect.width / scale,
    height: screenRect.height / scale,
  };
}

export function AtlasCanvasShell({ children, overlay, hideWorld = false, viewport, defaultViewport = DEFAULT_VIEWPORT, onViewportChange, toolbarStart, agentFocusId, interactionMode = "free", onSelectionComplete }: AtlasCanvasShellProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const dragOriginRef = useRef<CanvasDragOrigin | null>(null);
  const selectionOriginRef = useRef<CanvasSelectionOrigin | null>(null);
  const [internalViewport, setInternalViewport] = useState<AtlasViewport>(defaultViewport);
  const [isPanning, setIsPanning] = useState(false);
  const [selectionRect, setSelectionRect] = useState<ScreenSelectionRect | null>(null);
  const currentViewport = viewport ?? internalViewport;
  const isLocked = interactionMode === "locked";

  const updateViewport = useCallback((nextViewport: AtlasViewport) => {
    if (!viewport) {
      setInternalViewport(nextViewport);
    }
    onViewportChange?.(nextViewport);
  }, [onViewportChange, viewport]);

  const handleCanvasWheel = useCallback((event: globalThis.WheelEvent) => {
    if (isLocked) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const nextScale = clampScale(currentViewport.scale * direction);
    if (nextScale === currentViewport.scale) return;

    const container = mapContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const worldX = (cursorX - currentViewport.x) / currentViewport.scale;
    const worldY = (cursorY - currentViewport.y) / currentViewport.scale;

    updateViewport({
      x: cursorX - worldX * nextScale,
      y: cursorY - worldY * nextScale,
      scale: nextScale,
    });
  }, [currentViewport, isLocked, updateViewport]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleCanvasWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleCanvasWheel);
    };
  }, [handleCanvasWheel]);

  const zoomIn = useCallback(() => {
    if (isLocked) return;
    updateViewport({
      ...currentViewport,
      scale: clampScale(currentViewport.scale * ZOOM_STEP),
    });
  }, [currentViewport, isLocked, updateViewport]);

  const zoomOut = useCallback(() => {
    if (isLocked) return;
    updateViewport({
      ...currentViewport,
      scale: clampScale(currentViewport.scale / ZOOM_STEP),
    });
  }, [currentViewport, isLocked, updateViewport]);

  const resetView = useCallback(() => {
    if (isLocked) return;
    dragOriginRef.current = null;
    setIsPanning(false);
    updateViewport(DEFAULT_VIEWPORT);
  }, [isLocked, updateViewport]);

  const handleCanvasPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (isLocked) return;
    if ((event.button ?? 0) !== 0 || !canStartCanvasPan(event.target)) return;
    if (event.shiftKey && onSelectionComplete) {
      const localPoint = pointerLocalPoint(mapContainerRef.current, event);
      selectionOriginRef.current = {
        pointerId: event.pointerId,
        startLocalX: localPoint.x,
        startLocalY: localPoint.y,
        viewport: currentViewport,
      };
      setSelectionRect(normalizeScreenRect(localPoint.x, localPoint.y, localPoint.x, localPoint.y));
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
    const point = pointerPoint(event);
    dragOriginRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      panX: currentViewport.x,
      panY: currentViewport.y,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [currentViewport, isLocked, onSelectionComplete]);

  const handleCanvasPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (isLocked) return;
    const selectionOrigin = selectionOriginRef.current;
    if (selectionOrigin && selectionOrigin.pointerId === event.pointerId) {
      const localPoint = pointerLocalPoint(mapContainerRef.current, event);
      setSelectionRect(normalizeScreenRect(
        selectionOrigin.startLocalX,
        selectionOrigin.startLocalY,
        localPoint.x,
        localPoint.y,
      ));
      event.preventDefault();
      return;
    }
    const origin = dragOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const point = pointerPoint(event);
    updateViewport({
      ...currentViewport,
      x: origin.panX + point.x - origin.startX,
      y: origin.panY + point.y - origin.startY,
    });
  }, [currentViewport, isLocked, updateViewport]);

  const endCanvasPan = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const selectionOrigin = selectionOriginRef.current;
    if (selectionOrigin && selectionOrigin.pointerId === event.pointerId) {
      const localPoint = pointerLocalPoint(mapContainerRef.current, event);
      const screenRect = normalizeScreenRect(
        selectionOrigin.startLocalX,
        selectionOrigin.startLocalY,
        localPoint.x,
        localPoint.y,
      );
      selectionOriginRef.current = null;
      setSelectionRect(null);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      if (screenRect.width >= 4 || screenRect.height >= 4) {
        onSelectionComplete?.(toWorldSelectionRect(screenRect, selectionOrigin.viewport));
      }
      event.preventDefault();
      return;
    }
    const origin = dragOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    dragOriginRef.current = null;
    setIsPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, [onSelectionComplete]);

  const canvasTransform = `translate(${formatCanvasNumber(currentViewport.x)}px, ${formatCanvasNumber(currentViewport.y)}px) scale(${formatCanvasNumber(currentViewport.scale)})`;
  const zoomPercent = `${Math.round(currentViewport.scale * 100)}%`;

  return (
    <div
      ref={mapContainerRef}
      className={`execution-map-container ${isPanning ? "is-panning" : ""} ${selectionRect ? "is-selecting" : ""} ${isLocked ? "is-locked" : ""}`}
      data-agent-focus={agentFocusId ?? "none"}
      data-interaction-mode={interactionMode}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={endCanvasPan}
      onPointerCancel={endCanvasPan}
    >
      {!isLocked && (
        <div className="execution-map-toolbar" aria-label="视图工具">
          {toolbarStart}
          <button type="button" onClick={zoomIn}>放大</button>
          <button type="button" onClick={zoomOut}>缩小</button>
          <button type="button" onClick={resetView}>重置视图</button>
          <span className="execution-map-zoom">{zoomPercent}</span>
        </div>
      )}
      <div
        className={`execution-map-scroll ${hideWorld ? "is-hidden" : ""}`}
        style={{ transform: canvasTransform }}
        aria-hidden={hideWorld ? "true" : undefined}
      >
        {hideWorld ? null : children}
      </div>
      {selectionRect && (
        <div
          className="execution-map-selection-rect"
          style={{
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
          }}
        />
      )}
      {overlay}
    </div>
  );
}
