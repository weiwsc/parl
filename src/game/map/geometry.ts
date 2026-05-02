import type { MapRegion, MapVertex } from '../../models/types';
import {
  MAP_FIT_PADDING,
  MAP_GRID_SIZE,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  MAP_SNAP_DISTANCE,
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_WIDTH,
} from './constants';
import type { DragState, MapViewport, RegionDragState } from './types';

export interface SegmentSnap {
  dist: number;
  pt: MapVertex;
}

export interface SnapOptions {
  extras?: MapVertex[];
  excludeRegionId?: string;
  excludeVertexIndex?: number;
  threshold?: number;
}

export interface RegionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  center: MapVertex;
}

export function svgPointFromClient(el: SVGSVGElement, clientX: number, clientY: number): MapVertex {
  const pt = el.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;

  const ctm = el.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };

  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

export function distance(a: MapVertex, b: MapVertex): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function snapGrid(p: MapVertex, gridSize = MAP_GRID_SIZE): MapVertex {
  return {
    x: Math.round(p.x / gridSize) * gridSize,
    y: Math.round(p.y / gridSize) * gridSize,
  };
}

export function closestPointOnSegment(p: MapVertex, v: MapVertex, w: MapVertex): SegmentSnap {
  const l2 = distance(v, w) ** 2;
  if (l2 === 0) return { dist: distance(p, v), pt: { ...v } };

  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));

  const pt = {
    x: v.x + t * (w.x - v.x),
    y: v.y + t * (w.y - v.y),
  };
  return { dist: distance(p, pt), pt };
}

export function snapToVertex(
  pos: MapVertex,
  regions: MapRegion[],
  {
    extras = [],
    excludeRegionId,
    excludeVertexIndex,
    threshold = MAP_SNAP_DISTANCE,
  }: SnapOptions = {}
): MapVertex | null {
  let best: MapVertex | null = null;
  let bestDistance = threshold;

  const check = (v: MapVertex) => {
    const candidateDistance = distance(pos, v);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      best = { ...v };
    }
  };

  for (const region of regions) {
    for (let i = 0; i < region.vertices.length; i++) {
      if (region.id === excludeRegionId && i === excludeVertexIndex) continue;
      check(region.vertices[i]);
    }
  }

  for (const v of extras) check(v);
  return best;
}

export function pointsToSvg(vertices: MapVertex[]): string {
  return vertices.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export function centroid(vertices: MapVertex[]): MapVertex {
  if (!vertices.length) {
    return { x: MAP_VIEWBOX_WIDTH / 2, y: MAP_VIEWBOX_HEIGHT / 2 };
  }

  return {
    x: vertices.reduce((sum, p) => sum + p.x, 0) / vertices.length,
    y: vertices.reduce((sum, p) => sum + p.y, 0) / vertices.length,
  };
}

export function moveVertices(vertices: MapVertex[], dx: number, dy: number): MapVertex[] {
  return vertices.map(v => ({ x: v.x + dx, y: v.y + dy }));
}

export function previewRegions(
  regions: MapRegion[],
  dragging: DragState | null,
  dragPos: MapVertex | null,
  dragRegion: RegionDragState | null,
  cursor: MapVertex
): MapRegion[] {
  return regions.map(region => {
    if (dragging && dragging.regionId === region.id) {
      const vertices = [...region.vertices];
      vertices[dragging.vIdx] = dragPos || vertices[dragging.vIdx];
      return { ...region, vertices };
    }

    if (dragRegion && dragRegion.id === region.id) {
      return {
        ...region,
        vertices: moveVertices(
          dragRegion.verts,
          cursor.x - dragRegion.startX,
          cursor.y - dragRegion.startY
        ),
      };
    }

    return region;
  });
}

export function boundsForRegions(regions: MapRegion[]): RegionBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const region of regions) {
    for (const vertex of region.vertices) {
      minX = Math.min(minX, vertex.x);
      minY = Math.min(minY, vertex.y);
      maxX = Math.max(maxX, vertex.x);
      maxY = Math.max(maxY, vertex.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  const width = maxX - minX || 100;
  const height = maxY - minY || 100;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    center: {
      x: minX + width / 2,
      y: minY + height / 2,
    },
  };
}

export function fitRegionsToViewport(
  regions: MapRegion[],
  viewWidth = MAP_VIEWBOX_WIDTH,
  viewHeight = MAP_VIEWBOX_HEIGHT,
  padding = MAP_FIT_PADDING
): MapViewport {
  const bounds = boundsForRegions(regions);
  if (!bounds) return { panX: 0, panY: 0, zoom: 1 };

  const zoomX = viewWidth / (bounds.width * padding);
  const zoomY = viewHeight / (bounds.height * padding);
  const zoom = clampZoom(Math.min(zoomX, zoomY));

  return {
    zoom,
    panX: bounds.center.x - (viewWidth / zoom) / 2,
    panY: bounds.center.y - (viewHeight / zoom) / 2,
  };
}

export function zoomViewport(
  viewport: MapViewport,
  zoomMultiplier: number,
  focus?: MapVertex,
  viewWidth = MAP_VIEWBOX_WIDTH,
  viewHeight = MAP_VIEWBOX_HEIGHT
): MapViewport {
  const zoom = clampZoom(viewport.zoom * zoomMultiplier);
  if (zoom === viewport.zoom) return viewport;

  const ratio = viewport.zoom / zoom;
  const focusX = focus ? focus.x : viewport.panX + (viewWidth / viewport.zoom) / 2;
  const focusY = focus ? focus.y : viewport.panY + (viewHeight / viewport.zoom) / 2;

  return {
    zoom,
    panX: focusX - (focusX - viewport.panX) * ratio,
    panY: focusY - (focusY - viewport.panY) * ratio,
  };
}

export function panViewportByClientDelta(
  viewport: MapViewport,
  dx: number,
  dy: number,
  rect: DOMRect,
  viewWidth = MAP_VIEWBOX_WIDTH,
  viewHeight = MAP_VIEWBOX_HEIGHT
): MapViewport {
  const scaleX = (viewWidth / viewport.zoom) / rect.width;
  const scaleY = (viewHeight / viewport.zoom) / rect.height;

  return {
    ...viewport,
    panX: viewport.panX - dx * scaleX,
    panY: viewport.panY - dy * scaleY,
  };
}

function clampZoom(zoom: number): number {
  return Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, zoom));
}
