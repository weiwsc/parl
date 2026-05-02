import type { NodeGraphPortRef } from '../../game/nodes/types';

export interface CanvasViewport {
  panX: number;
  panY: number;
  zoom: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface NodeDragState {
  nodeId: string;
  dx: number;
  dy: number;
}

export interface PanDragState {
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
}

export interface WireDragState {
  from: NodeGraphPortRef;
  point: CanvasPoint;
}

export type PortDirection = 'input' | 'output';
export type RegisterPortAnchor = (key: string, element: HTMLElement | null) => void;
