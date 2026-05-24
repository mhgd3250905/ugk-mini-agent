import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

export type AtlasViewport = { x: number; y: number; scale: number };

interface AtlasCanvasShellProps {
  children: ReactNode;
  viewport?: AtlasViewport;
  defaultViewport?: AtlasViewport;
  onViewportChange?: (viewport: AtlasViewport) => void;
}

interface CanvasDragOrigin {
  pointerId: number;
  startX: number;
  startY: number;
  panX: number;
  panY: number;
}

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
  return !target.closest(".emap-node, .emap-evidence-node, .emap-artifact-preview, .execution-map-toolbar, .agent-chat-panel, button, select, input, textarea, a, iframe, summary, details");
}

function pointerPoint(event: PointerEvent<HTMLDivElement>): { x: number; y: number } {
  const native = event.nativeEvent as globalThis.PointerEvent & { clientX?: number; clientY?: number };
  const x = Number.isFinite(event.clientX) ? event.clientX : Number.isFinite(native.clientX) ? native.clientX! : 0;
  const y = Number.isFinite(event.clientY) ? event.clientY : Number.isFinite(native.clientY) ? native.clientY! : 0;
  return { x, y };
}

export function AtlasCanvasShell({ children, viewport, defaultViewport = DEFAULT_VIEWPORT, onViewportChange }: AtlasCanvasShellProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const dragOriginRef = useRef<CanvasDragOrigin | null>(null);
  const [internalViewport, setInternalViewport] = useState<AtlasViewport>(defaultViewport);
  const [isPanning, setIsPanning] = useState(false);
  const currentViewport = viewport ?? internalViewport;

  const updateViewport = useCallback((nextViewport: AtlasViewport) => {
    if (!viewport) {
      setInternalViewport(nextViewport);
    }
    onViewportChange?.(nextViewport);
  }, [onViewportChange, viewport]);

  const handleCanvasWheel = useCallback((event: globalThis.WheelEvent) => {
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
  }, [currentViewport, updateViewport]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleCanvasWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleCanvasWheel);
    };
  }, [handleCanvasWheel]);

  const zoomIn = useCallback(() => {
    updateViewport({
      ...currentViewport,
      scale: clampScale(currentViewport.scale * ZOOM_STEP),
    });
  }, [currentViewport, updateViewport]);

  const zoomOut = useCallback(() => {
    updateViewport({
      ...currentViewport,
      scale: clampScale(currentViewport.scale / ZOOM_STEP),
    });
  }, [currentViewport, updateViewport]);

  const resetView = useCallback(() => {
    dragOriginRef.current = null;
    setIsPanning(false);
    updateViewport(DEFAULT_VIEWPORT);
  }, [updateViewport]);

  const handleCanvasPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if ((event.button ?? 0) !== 0 || !canStartCanvasPan(event.target)) return;
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
  }, [currentViewport.x, currentViewport.y]);

  const handleCanvasPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const origin = dragOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const point = pointerPoint(event);
    updateViewport({
      ...currentViewport,
      x: origin.panX + point.x - origin.startX,
      y: origin.panY + point.y - origin.startY,
    });
  }, [currentViewport, updateViewport]);

  const endCanvasPan = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const origin = dragOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    dragOriginRef.current = null;
    setIsPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const canvasTransform = `translate(${formatCanvasNumber(currentViewport.x)}px, ${formatCanvasNumber(currentViewport.y)}px) scale(${formatCanvasNumber(currentViewport.scale)})`;
  const zoomPercent = `${Math.round(currentViewport.scale * 100)}%`;

  return (
    <div
      ref={mapContainerRef}
      className={`execution-map-container ${isPanning ? "is-panning" : ""}`}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={endCanvasPan}
      onPointerCancel={endCanvasPan}
    >
      <div className="execution-map-toolbar" aria-label="视图工具">
        <button type="button" onClick={zoomIn}>放大</button>
        <button type="button" onClick={zoomOut}>缩小</button>
        <button type="button" onClick={resetView}>重置视图</button>
        <span className="execution-map-zoom">{zoomPercent}</span>
      </div>
      <div className="execution-map-scroll" style={{ transform: canvasTransform }}>
        {children}
      </div>
    </div>
  );
}
