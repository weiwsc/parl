import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CanvasPoint, CanvasViewport, PanDragState } from './nodeCanvasTypes';
import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM } from './nodeCanvasUtils';

type ViewportUpdater = CanvasViewport | ((current: CanvasViewport) => CanvasViewport);

export const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = { panX: 40, panY: 40, zoom: 1 };

export function canvasViewportTransform({ panX, panY, zoom }: CanvasViewport): string {
  return `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

export function useCanvasViewport(
  viewportElementRef: RefObject<HTMLElement | null>,
  surfaceElementRef: RefObject<HTMLElement | null>,
  initialViewport: CanvasViewport = DEFAULT_CANVAS_VIEWPORT,
) {
  const [viewport, setViewportState] = useState<CanvasViewport>(initialViewport);
  const [isPanning, setIsPanning] = useState(false);
  const viewportRef = useRef<CanvasViewport>(initialViewport);
  const panDragRef = useRef<PanDragState | null>(null);
  const panFrameRef = useRef<number | null>(null);
  const pendingPanViewportRef = useRef<CanvasViewport | null>(null);

  const applyViewportToSurface = useCallback((next: CanvasViewport) => {
    const surfaceElement = surfaceElementRef.current;
    if (surfaceElement) surfaceElement.style.transform = canvasViewportTransform(next);
  }, [surfaceElementRef]);

  const setViewport = useCallback((updater: ViewportUpdater) => {
    setViewportState(current => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      viewportRef.current = next;
      pendingPanViewportRef.current = null;
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    viewportRef.current = viewport;
    applyViewportToSurface(viewport);
  }, [applyViewportToSurface, viewport]);

  useEffect(() => () => {
    if (panFrameRef.current !== null) {
      window.cancelAnimationFrame(panFrameRef.current);
      panFrameRef.current = null;
    }
  }, []);

  const getCanvasPoint = useCallback((event: { clientX: number; clientY: number }): CanvasPoint => {
    const rect = viewportElementRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const { panX, panY, zoom } = viewportRef.current;
    return {
      x: (event.clientX - rect.left - panX) / zoom,
      y: (event.clientY - rect.top - panY) / zoom,
    };
  }, [viewportElementRef]);

  const schedulePanViewport = useCallback((next: CanvasViewport) => {
    pendingPanViewportRef.current = next;
    if (panFrameRef.current !== null) return;

    panFrameRef.current = window.requestAnimationFrame(() => {
      panFrameRef.current = null;
      const pending = pendingPanViewportRef.current;
      if (!pending) return;
      viewportRef.current = pending;
      applyViewportToSurface(pending);
    });
  }, [applyViewportToSurface]);

  const beginPan = useCallback((clientX: number, clientY: number) => {
    const { panX, panY } = viewportRef.current;
    panDragRef.current = { startX: clientX, startY: clientY, startPanX: panX, startPanY: panY };
    pendingPanViewportRef.current = null;
    setIsPanning(true);
  }, []);

  const updatePan = useCallback((clientX: number, clientY: number) => {
    const panDrag = panDragRef.current;
    if (!panDrag) return false;

    schedulePanViewport({
      ...viewportRef.current,
      panX: panDrag.startPanX + (clientX - panDrag.startX),
      panY: panDrag.startPanY + (clientY - panDrag.startY),
    });
    return true;
  }, [schedulePanViewport]);

  const endPan = useCallback(() => {
    if (!panDragRef.current) return;
    panDragRef.current = null;

    const next = pendingPanViewportRef.current ?? viewportRef.current;
    pendingPanViewportRef.current = null;
    if (panFrameRef.current !== null) {
      window.cancelAnimationFrame(panFrameRef.current);
      panFrameRef.current = null;
    }

    viewportRef.current = next;
    applyViewportToSurface(next);
    setViewportState(next);
    setIsPanning(false);
  }, [applyViewportToSurface]);

  const zoomAtClientPoint = useCallback((clientX: number, clientY: number, factor: number) => {
    const element = viewportElementRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    setViewport(current => {
      const newZoom = Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, current.zoom * factor));
      if (Math.abs(newZoom - current.zoom) < 0.001) return current;
      return {
        panX: sx - (sx - current.panX) * (newZoom / current.zoom),
        panY: sy - (sy - current.panY) * (newZoom / current.zoom),
        zoom: newZoom,
      };
    });
  }, [setViewport, viewportElementRef]);

  return {
    viewport,
    viewportRef,
    setViewport,
    isPanning,
    beginPan,
    updatePan,
    endPan,
    getCanvasPoint,
    zoomAtClientPoint,
  };
}
