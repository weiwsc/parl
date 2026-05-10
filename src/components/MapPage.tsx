import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { useAppContext, uid } from '../store';
import { useAuth } from '../context/AuthContext';
import type { MapRegion, MapVertex } from '../models/types';
import { MAP_VIEWBOX_HEIGHT, MAP_VIEWBOX_WIDTH } from '../game/map/constants';
import {
  closestPointOnSegment,
  distance,
  fitRegionsToViewport,
  moveVertices,
  panViewportByClientDelta,
  snapGrid,
  snapToVertex,
  svgPointFromClient,
  zoomViewport,
} from '../game/map/geometry';
import { normalizeImportedMapRegions, serializeMapRegions } from '../game/map/io';
import type { DragState, EditorTool, HoverEdge, MapViewport, RegionDragState, ViewMode } from '../game/map/types';
import { MapCanvas } from './map/MapCanvas';
import { MapLegend } from './map/MapLegend';
import { MapToolbar } from './map/MapToolbar';
import { RegionInspector } from './map/RegionInspector';
import { RegionCardList } from './map/RegionCardList';

const INITIAL_VIEWPORT: MapViewport = { panX: 0, panY: 0, zoom: 1 };
const INITIAL_CURSOR: MapVertex = { x: MAP_VIEWBOX_WIDTH / 2, y: MAP_VIEWBOX_HEIGHT / 2 };

export function MapPage() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit } = useAuth();

  const [viewMode, setViewMode] = useState<ViewMode>('faction');
  const [editorMode, setEditorMode] = useState(false);
  const [tool, setTool] = useState<EditorTool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawVerts, setDrawVerts] = useState<MapVertex[]>([]);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [dragPos, setDragPos] = useState<MapVertex | null>(null);
  const [dragRegion, setDragRegion] = useState<RegionDragState | null>(null);
  const [hoverEdge, setHoverEdge] = useState<HoverEdge | null>(null);
  const [snapPos, setSnapPos] = useState<MapVertex | null>(null);
  const [cursor, setCursor] = useState<MapVertex>(INITIAL_CURSOR);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [viewport, setViewport] = useState<MapViewport>(INITIAL_VIEWPORT);
  const [middlePanStart, setMiddlePanStart] = useState<{ x: number; y: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const hasCenteredOnce = useRef(false);
  const regions = useMemo(() => state.map?.regions ?? [], [state.map?.regions]);

  const updateRegions = useCallback(
    (updater: (prev: MapRegion[]) => MapRegion[]) => {
      updateState(appState => {
        if (!appState.map) appState.map = { regions: [] };
        appState.map.regions = updater(appState.map.regions);
        return appState;
      });
    },
    [updateState]
  );

  const completeRegion = useCallback(() => {
    if (drawVerts.length < 3) return;

    const newRegion: MapRegion = {
      id: uid('r'),
      name: 'New Region',
      description: '',
      vertices: [...drawVerts],
      factionControl: [],
      seatings: 0,
      strataWeights: {},
      population: 0,
      factionSupport: {},
      electionModifiers: [],
    };

    updateRegions(prev => [...prev, newRegion]);
    setSelectedId(newRegion.id);
    setDrawVerts([]);
    setTool('select');
  }, [drawVerts, updateRegions]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (event.key === 'Escape') {
        if (tool === 'add' && drawVerts.length > 0) {
          setDrawVerts([]);
          return;
        }
        if (tool === 'add') {
          setTool('select');
          return;
        }
        setSelectedId(null);
      }

      if (event.key === 'Enter' && tool === 'add' && drawVerts.length >= 3) {
        completeRegion();
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && editorMode && selectedId && tool === 'select') {
        const id = selectedId;
        updateRegions(prev => prev.filter(region => region.id !== id));
        setSelectedId(null);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, drawVerts, selectedId, editorMode, updateRegions, completeRegion]);

  const handleCenterMap = useCallback(() => {
    setViewport(fitRegionsToViewport(regions));
  }, [regions]);

  const performZoom = useCallback((zoomMultiplier: number, pointerSvg?: MapVertex) => {
    setViewport(current => zoomViewport(current, zoomMultiplier, pointerSvg));
  }, []);

  const handleWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    const point = svgPointFromClient(svgRef.current, event.clientX, event.clientY);
    performZoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, point);
  }, [performZoom]);

  const handleZoomIn = useCallback(() => performZoom(1.2), [performZoom]);
  const handleZoomOut = useCallback(() => performZoom(1 / 1.2), [performZoom]);

  const handleViewMode = useCallback((nextMode: ViewMode) => {
    setViewMode(nextMode);
    if (nextMode === 'regions') {
      setEditorMode(false);
      setTool('select');
      setDrawVerts([]);
      setDragging(null);
      setDragPos(null);
      setDragRegion(null);
      setHoverEdge(null);
      setSnapPos(null);
    }
  }, []);

  useEffect(() => {
    if (!hasCenteredOnce.current && regions.length > 0) {
      handleCenterMap();
      hasCenteredOnce.current = true;
    }
  }, [handleCenterMap, regions.length]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    if (middlePanStart) {
      const dx = event.clientX - middlePanStart.x;
      const dy = event.clientY - middlePanStart.y;
      const rect = svgRef.current.getBoundingClientRect();

      setViewport(current => panViewportByClientDelta(current, dx, dy, rect));
      setMiddlePanStart({ x: event.clientX, y: event.clientY });
      return;
    }

    let raw = svgPointFromClient(svgRef.current, event.clientX, event.clientY);
    if (snapToGrid) raw = snapGrid(raw);
    setCursor(raw);

    if (dragging) {
      const snapped = snapToVertex(raw, regions, {
        excludeRegionId: dragging.regionId,
        excludeVertexIndex: dragging.vIdx,
      });
      setDragPos(snapped ?? raw);
      setSnapPos(snapped);
      return;
    }

    if (dragRegion) return;

    if (tool === 'add') {
      const extras = drawVerts.length > 0 ? [drawVerts[0]] : [];
      setSnapPos(snapToVertex(raw, regions, { extras }));
      return;
    }

    if (editorMode && tool === 'select' && selectedId) {
      const region = regions.find(candidate => candidate.id === selectedId);
      if (!region) return;

      let found: HoverEdge | null = null;
      let minDist = 15;

      for (let i = 0; i < region.vertices.length; i++) {
        const a = region.vertices[i];
        const b = region.vertices[(i + 1) % region.vertices.length];
        const { dist, pt } = closestPointOnSegment(raw, a, b);
        if (dist < minDist) {
          minDist = dist;
          found = { regionId: selectedId, eIdx: i, pos: pt };
        }
      }

      setHoverEdge(found);
    }
  }, [middlePanStart, snapToGrid, dragging, regions, dragRegion, tool, editorMode, selectedId, drawVerts]);

  const handleSvgPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button === 1) {
      event.preventDefault();
      setMiddlePanStart({ x: event.clientX, y: event.clientY });
      return;
    }

    if (event.button === 2 || !svgRef.current) return;

    let raw = svgPointFromClient(svgRef.current, event.clientX, event.clientY);
    if (snapToGrid) raw = snapGrid(raw);

    if (tool === 'select') {
      setSelectedId(null);
    }

    if (tool === 'add') {
      const extras = drawVerts.length > 0 ? [drawVerts[0]] : [];
      const snapped = snapToVertex(raw, regions, { extras });
      const pos = snapped ?? raw;

      if (drawVerts.length >= 3 && snapped && distance(snapped, drawVerts[0]) < 1) {
        completeRegion();
        return;
      }

      setDrawVerts(prev => [...prev, pos]);
    }
  }, [tool, drawVerts, regions, completeRegion, snapToGrid]);

  const handleSelectRegion = useCallback((id: string, event: ReactPointerEvent) => {
    if (tool !== 'select') return;

    setSelectedId(id);

    if (editorMode && svgRef.current && event.button === 0) {
      try {
        (event.target as Element).setPointerCapture(event.pointerId);
      } catch {}

      const hit = regions.find(region => region.id === id);
      if (hit) {
        let raw = svgPointFromClient(svgRef.current, event.clientX, event.clientY);
        if (snapToGrid) raw = snapGrid(raw);
        setDragRegion({ id: hit.id, startX: raw.x, startY: raw.y, verts: [...hit.vertices] });
      }
    }
  }, [tool, editorMode, regions, snapToGrid]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragging) {
      if (dragPos) {
        updateRegions(prev => prev.map(region => {
          if (region.id !== dragging.regionId) return region;
          const vertices = [...region.vertices];
          vertices[dragging.vIdx] = dragPos;
          return { ...region, vertices };
        }));
      }

      setDragging(null);
      setDragPos(null);
    }

    if (dragRegion) {
      const dx = cursor.x - dragRegion.startX;
      const dy = cursor.y - dragRegion.startY;

      updateRegions(prev => prev.map(region => {
        if (region.id !== dragRegion.id) return region;
        return { ...region, vertices: moveVertices(dragRegion.verts, dx, dy) };
      }));

      setDragRegion(null);
      try {
        (event.target as Element).releasePointerCapture(event.pointerId);
      } catch {}
    }

    setMiddlePanStart(null);
    setSnapPos(null);
  }, [dragging, dragPos, dragRegion, cursor, updateRegions]);

  const handleVertexPointerDown = useCallback((event: ReactPointerEvent, regionId: string, vIdx: number) => {
    if (event.button !== 0) return;

    event.preventDefault();
    try {
      (event.target as Element).setPointerCapture(event.pointerId);
    } catch {}

    setDragging({ regionId, vIdx });
    const region = regions.find(candidate => candidate.id === regionId);
    if (region) setDragPos({ ...region.vertices[vIdx] });
  }, [regions]);

  const handleEdgePointerDown = useCallback((
    event: ReactPointerEvent,
    regionId: string,
    eIdx: number,
    pos: MapVertex
  ) => {
    event.stopPropagation();
    updateRegions(prev => prev.map(region => {
      if (region.id !== regionId) return region;

      const vertices = [...region.vertices];
      vertices.splice(eIdx + 1, 0, { ...pos });
      return { ...region, vertices };
    }));
    setHoverEdge(null);
  }, [updateRegions]);

  const handleContextMenuVertex = useCallback((_event: ReactMouseEvent, regionId: string, vIdx: number) => {
    updateRegions(prev => prev.map(region => {
      if (region.id !== regionId || region.vertices.length <= 3) return region;

      const vertices = [...region.vertices];
      vertices.splice(vIdx, 1);
      return { ...region, vertices };
    }));
  }, [updateRegions]);

  const handleContextMenuSvg = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    if (tool === 'add' && drawVerts.length >= 3) {
      completeRegion();
    }
  }, [tool, drawVerts, completeRegion]);

  const handleUpdateRegion = useCallback((updated: MapRegion) => {
    updateRegions(prev => prev.map(region => region.id === updated.id ? updated : region));
  }, [updateRegions]);

  const handleDeleteRegion = useCallback((id: string) => {
    updateRegions(prev => prev.filter(region => region.id !== id));
    setSelectedId(null);
  }, [updateRegions]);

  const handleCopyRegionJson = useCallback(async (region: MapRegion) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(region, null, 2));
      showToast('Region JSON copied');
    } catch {
      showToast('Copy failed', 'error');
    }
  }, [showToast]);

  const handleExport = useCallback(() => {
    const url = URL.createObjectURL(new Blob([serializeMapRegions(regions)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `map_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [regions]);

  const handleImport = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = loadEvent => {
      try {
        const parsed = JSON.parse(String(loadEvent.target?.result ?? ''));
        const imported = normalizeImportedMapRegions(parsed, () => uid('r'));
        if (imported) updateRegions(() => imported);
      } catch {}
    };

    reader.readAsText(file);
    event.target.value = '';
  }, [updateRegions]);

  const selectedRegion = useMemo(
    () => regions.find(region => region.id === selectedId) ?? null,
    [regions, selectedId]
  );

  return (
    <div className="map-page">
      <MapToolbar
        viewMode={viewMode}
        editorMode={editorMode}
        tool={tool}
        canEdit={canEdit}
        drawVerts={drawVerts}
        snapToGrid={snapToGrid}
        onToggleSnap={() => setSnapToGrid(current => !current)}
        onCenterMap={handleCenterMap}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onViewMode={handleViewMode}
        onEditorMode={on => {
          setEditorMode(on);
          if (!on) {
            setTool('select');
            setDrawVerts([]);
          }
        }}
        onTool={nextTool => {
          setTool(nextTool);
          setDrawVerts([]);
          if (nextTool === 'add') setSelectedId(null);
        }}
        onCompleteRegion={completeRegion}
        onCancelDraw={() => setDrawVerts([])}
        onExport={handleExport}
        onImport={handleImport}
      />

      <div className="map-workspace">
        <div className="map-canvas-wrap">
          {viewMode === 'regions' ? (
            <RegionCardList
              regions={regions}
              factions={state.factions}
              selectedId={selectedId}
              onSelectRegion={setSelectedId}
            />
          ) : (
            <>
              <MapCanvas
                regions={regions}
                factions={state.factions}
                alliances={state.alliances}
                viewMode={viewMode}
                editorMode={editorMode}
                tool={tool}
                selectedId={selectedId}
                drawVerts={drawVerts}
                dragging={dragging}
                dragPos={dragPos}
                dragRegion={dragRegion}
                hoverEdge={hoverEdge}
                snapPos={snapPos}
                cursor={cursor}
                zoom={viewport.zoom}
                panX={viewport.panX}
                panY={viewport.panY}
                svgRef={svgRef}
                onPointerMove={handlePointerMove}
                onSvgPointerDown={handleSvgPointerDown}
                onPointerUp={handlePointerUp}
                onSelectRegion={handleSelectRegion}
                onVertexPointerDown={handleVertexPointerDown}
                onEdgePointerDown={handleEdgePointerDown}
                onContextMenuVertex={handleContextMenuVertex}
                onContextMenuSvg={handleContextMenuSvg}
                onWheel={handleWheel}
              />
              <MapLegend
                regions={regions}
                factions={state.factions}
                alliances={state.alliances}
                viewMode={viewMode}
              />
              {regions.length === 0 && (
                <div className="map-empty-hint">
                  {canEdit
                    ? <>Enable <strong>EDIT MAP</strong> and use <strong>ADD REGION</strong> to draw polygons</>
                    : 'No regions defined yet.'}
                </div>
              )}
            </>
          )}
        </div>

        <RegionInspector
          region={selectedRegion}
          factions={state.factions}
          alliances={state.alliances}
          strata={state.strata}
          canEdit={canEdit}
          onUpdateRegion={handleUpdateRegion}
          onDeleteRegion={handleDeleteRegion}
          onCopyRegionJson={handleCopyRegionJson}
        />
      </div>
    </div>
  );
}
