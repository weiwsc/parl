import { useMemo } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent,
} from 'react';
import type { Alliance, Faction, MapRegion, MapVertex } from '../../models/types';
import { MAP_PATTERN_SIZE, MAP_VIEWBOX_HEIGHT, MAP_VIEWBOX_WIDTH } from '../../game/map/constants';
import { getControlEntries, getRegionFill, getRegionPatternId } from '../../game/map/control';
import {
  centroid,
  distance,
  pointsToSvg,
  previewRegions,
} from '../../game/map/geometry';
import type { DragState, EditorTool, HoverEdge, RegionDragState, ViewMode } from '../../game/map/types';

interface MapCanvasProps {
  regions: MapRegion[];
  factions: Faction[];
  alliances: Alliance[];
  viewMode: ViewMode;
  editorMode: boolean;
  tool: EditorTool;
  selectedId: string | null;
  drawVerts: MapVertex[];
  dragging: DragState | null;
  dragPos: MapVertex | null;
  dragRegion: RegionDragState | null;
  hoverEdge: HoverEdge | null;
  snapPos: MapVertex | null;
  cursor: MapVertex;
  zoom: number;
  panX: number;
  panY: number;
  svgRef: RefObject<SVGSVGElement | null>;
  onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onSvgPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onSelectRegion: (id: string, event: ReactPointerEvent) => void;
  onVertexPointerDown: (event: ReactPointerEvent, regionId: string, vIdx: number) => void;
  onEdgePointerDown: (event: ReactPointerEvent, regionId: string, eIdx: number, pos: MapVertex) => void;
  onContextMenuVertex: (event: ReactMouseEvent, regionId: string, vIdx: number) => void;
  onContextMenuSvg: (event: ReactMouseEvent) => void;
  onWheel: (event: ReactWheelEvent<SVGSVGElement>) => void;
}

export function MapCanvas(props: MapCanvasProps) {
  const {
    regions,
    factions,
    alliances,
    viewMode,
    editorMode,
    tool,
    selectedId,
    drawVerts,
    dragging,
    dragPos,
    dragRegion,
    hoverEdge,
    snapPos,
    cursor,
    zoom,
    panX,
    panY,
    svgRef,
    onPointerMove,
    onSvgPointerDown,
    onPointerUp,
    onSelectRegion,
    onVertexPointerDown,
    onEdgePointerDown,
    onContextMenuVertex,
    onContextMenuSvg,
    onWheel,
  } = props;

  const displayRegions = useMemo(
    () => previewRegions(regions, dragging, dragPos, dragRegion, cursor),
    [regions, dragging, dragPos, dragRegion, cursor]
  );

  const closingSnap = drawVerts.length >= 3 && snapPos && distance(snapPos, drawVerts[0]) < 1;

  return (
    <svg
      ref={svgRef}
      className="map-canvas"
      viewBox={`${panX} ${panY} ${MAP_VIEWBOX_WIDTH / zoom} ${MAP_VIEWBOX_HEIGHT / zoom}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ cursor: tool === 'add' ? 'crosshair' : 'default' }}
      onPointerMove={onPointerMove}
      onPointerDown={onSvgPointerDown}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenuSvg}
      onWheel={onWheel}
    >
      <defs>
        <filter id="map-glow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="map-sel-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {viewMode !== 'plain' && displayRegions.map(region => {
          const entries = getControlEntries(region, factions, alliances, viewMode);
          if (entries.length < 2) return null;

          const id = getRegionPatternId(region.id, viewMode);
          const total = entries.reduce((sum, entry) => sum + entry.pct, 0) || 1;
          let cumY = 0;

          return (
            <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={MAP_PATTERN_SIZE} height={MAP_PATTERN_SIZE} patternTransform="rotate(45 0 0)">
              {entries.map((entry, i) => {
                const height = (entry.pct / total) * MAP_PATTERN_SIZE;
                const rect = <rect key={i} x="0" y={cumY.toFixed(2)} width={MAP_PATTERN_SIZE} height={height.toFixed(2)} fill={entry.color} />;
                cumY += height;
                return rect;
              })}
            </pattern>
          );
        })}
      </defs>

      {[0, 200, 400, 600, 800, 1000].map(x => (
        <line key={`vg${x}`} x1={x} y1={-1000} x2={x} y2={2000} stroke="var(--line-soft)" strokeWidth="0.5" opacity="0.35" />
      ))}
      {[0, 150, 300, 450, 600, 750].map(y => (
        <line key={`hg${y}`} x1={-1000} y1={y} x2={2000} y2={y} stroke="var(--line-soft)" strokeWidth="0.5" opacity="0.35" />
      ))}

      {displayRegions.map(region => {
        const vertices = region.vertices;
        if (vertices.length < 3) return null;

        const isSelected = region.id === selectedId;
        const rawFill = getRegionFill(region, factions, alliances, viewMode);
        const fill = rawFill === 'none' ? 'transparent' : rawFill;
        const fillOpacity = viewMode === 'plain' ? 0 : 0.9;

        return (
          <g key={region.id}>
            <polygon
              points={pointsToSvg(vertices)}
              fill={fill}
              fillOpacity={fillOpacity}
              stroke="var(--bg-deeper)"
              strokeWidth={isSelected ? 10 : 7}
              pointerEvents="all"
              style={{ cursor: tool === 'add' ? 'crosshair' : (isSelected && editorMode ? 'move' : 'pointer') }}
              onPointerDown={event => {
                if (tool === 'select') {
                  event.stopPropagation();
                  onSelectRegion(region.id, event);
                }
              }}
            />
            <polygon
              points={pointsToSvg(vertices)}
              fill="none"
              stroke={isSelected ? 'var(--accent-hot)' : 'var(--accent)'}
              strokeWidth={isSelected ? 1.8 : 1.1}
              strokeOpacity={isSelected ? 1 : 0.7}
              filter={isSelected ? 'url(#map-sel-glow)' : 'url(#map-glow)'}
              pointerEvents="none"
            />
            <RegionLabel region={region} selected={isSelected} />
          </g>
        );
      })}

      {tool === 'add' && drawVerts.length > 0 && (() => {
        const previewPos = snapPos ?? cursor;
        const allPts = [...drawVerts, previewPos];

        return (
          <g pointerEvents="none">
            {drawVerts.length >= 2 && (
              <polygon
                points={pointsToSvg(allPts)}
                fill="var(--accent)"
                fillOpacity={0.07}
                stroke="var(--accent)"
                strokeWidth={1}
                strokeDasharray="6 4"
                strokeOpacity={0.65}
              />
            )}
            <line
              x1={drawVerts[drawVerts.length - 1].x}
              y1={drawVerts[drawVerts.length - 1].y}
              x2={previewPos.x}
              y2={previewPos.y}
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              strokeOpacity={0.85}
            />
            {drawVerts.map((vertex, i) => (
              <circle
                key={i}
                cx={vertex.x}
                cy={vertex.y}
                r={i === 0 ? 7 : 5}
                fill={closingSnap && i === 0 ? 'var(--good)' : 'var(--bg-panel)'}
                stroke={i === 0 ? (closingSnap ? 'var(--good)' : 'var(--accent-hot)') : 'var(--accent)'}
                strokeWidth={i === 0 ? 2.5 : 1.5}
              />
            ))}
            {snapPos && (
              <circle
                cx={snapPos.x}
                cy={snapPos.y}
                r={13}
                fill="none"
                stroke={closingSnap ? 'var(--good)' : 'var(--cyan)'}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                opacity={0.85}
              />
            )}
          </g>
        );
      })()}

      {dragging && snapPos && (
        <circle
          cx={snapPos.x}
          cy={snapPos.y}
          r={13}
          fill="none"
          stroke="var(--cyan)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          opacity={0.8}
          pointerEvents="none"
        />
      )}

      {tool === 'add' && drawVerts.length === 0 && (
        <g pointerEvents="none" opacity={0.45}>
          <line x1={cursor.x - 12} y1={cursor.y} x2={cursor.x + 12} y2={cursor.y} stroke="var(--accent)" strokeWidth={1} />
          <line x1={cursor.x} y1={cursor.y - 12} x2={cursor.x} y2={cursor.y + 12} stroke="var(--accent)" strokeWidth={1} />
          <circle cx={cursor.x} cy={cursor.y} r={4} fill="none" stroke="var(--accent)" strokeWidth={1} />
        </g>
      )}

      {editorMode && tool === 'select' && selectedId && !dragging && !dragRegion && (() => {
        const region = displayRegions.find(candidate => candidate.id === selectedId);
        if (!region) return null;

        return (
          <g>
            {hoverEdge && hoverEdge.regionId === selectedId && (
              <circle
                cx={hoverEdge.pos.x}
                cy={hoverEdge.pos.y}
                r={6}
                fill="var(--cyan)"
                stroke="var(--bg-panel)"
                strokeWidth={1.5}
                style={{ cursor: 'copy' }}
                onPointerDown={event => onEdgePointerDown(event, selectedId, hoverEdge.eIdx, hoverEdge.pos)}
              />
            )}
            {region.vertices.map((vertex, i) => {
              return (
                <circle
                  key={`vtx${i}`}
                  cx={vertex.x}
                  cy={vertex.y}
                  r={6}
                  fill="var(--bg-panel)"
                  stroke="var(--cyan)"
                  strokeWidth={2}
                  style={{ cursor: 'grab' }}
                  onPointerDown={event => {
                    event.stopPropagation();
                    onVertexPointerDown(event, selectedId, i);
                  }}
                  onContextMenu={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    onContextMenuVertex(event, selectedId, i);
                  }}
                />
              );
            })}
          </g>
        );
      })()}
    </svg>
  );
}

interface RegionLabelProps {
  region: MapRegion;
  selected: boolean;
}

function RegionLabel({ region, selected }: RegionLabelProps) {
  const center = centroid(region.vertices);

  return (
    <text
      x={center.x}
      y={center.y}
      textAnchor="middle"
      fontSize="14"
      fontFamily="'JetBrains Mono', monospace"
      fill={selected ? 'var(--accent-hot)' : 'var(--text)'}
      pointerEvents="none"
      style={{ userSelect: 'none' }}
    >
      <tspan x={center.x} dy={region.name2 ? '-0.4em' : '0.3em'}>{region.name || '?'}</tspan>
      {region.name2 && (
        <tspan x={center.x} dy="1.2em" fontSize="8" opacity="0.6" fontStyle="italic">
          {region.name2}
        </tspan>
      )}
    </text>
  );
}
