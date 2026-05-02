import type { MapVertex } from '../../models/types';

export type ViewMode = 'plain' | 'faction' | 'alliance';
export type EditorTool = 'select' | 'add';

export interface DragState {
  regionId: string;
  vIdx: number;
}

export interface RegionDragState {
  id: string;
  startX: number;
  startY: number;
  verts: MapVertex[];
}

export interface HoverEdge {
  regionId: string;
  eIdx: number;
  pos: MapVertex;
}

export interface ControlEntry {
  id: string;
  color: string;
  label: string;
  pct: number;
}

export interface MapViewport {
  panX: number;
  panY: number;
  zoom: number;
}
