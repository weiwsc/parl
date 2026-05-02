import type { Faction, MapRegion } from '../../models/types';
import type {
  EntityType,
  NodeGraph,
  NodeGraphPortRef,
  NodeInstanceValue,
  SchemaArray,
  SchemaPrimitive,
  SchemaReference,
} from '../../game/nodes/types';
import { describeArrayItem } from '../../game/nodes/schema';
import type { CanvasPoint, PortDirection } from './nodeCanvasTypes';

export const CANVAS_MIN_ZOOM = 0.1;
export const CANVAS_MAX_ZOOM = 4;

export interface BindingOption {
  id: string;
  label: string;
  subtitle: string;
  color?: string;
  stats: { label: string; value: string | number }[];
}

export function deleteGraphNode(graph: NodeGraph, nodeId: string): NodeGraph {
  return {
    nodes: graph.nodes.filter(node => node.id !== nodeId),
    connections: graph.connections.filter(connection => connection.from.nodeId !== nodeId && connection.to.nodeId !== nodeId),
  };
}

export function getBindingOptions(type: EntityType, factions: Faction[], regions: MapRegion[]): BindingOption[] {
  if (type.entityClass === 'faction') {
    return factions.map(faction => ({
      id: faction.id, label: faction.name, subtitle: faction.id, color: faction.color,
      stats: [
        { label: 'support', value: Object.values(faction.support).reduce((sum, value) => sum + value, 0).toLocaleString() },
        { label: 'strata', value: Object.keys(faction.support).length },
      ],
    }));
  }
  if (type.entityClass === 'region') {
    return regions.map(region => ({
      id: region.id, label: region.name, subtitle: region.name2 || region.id,
      stats: [
        { label: 'seats', value: region.seatings },
        { label: 'control', value: region.factionControl.length },
        { label: 'vertices', value: region.vertices.length },
      ],
    }));
  }
  return [];
}

export function cleanValues(values: Record<string, NodeInstanceValue>): Record<string, NodeInstanceValue> | undefined {
  const next: Record<string, NodeInstanceValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== '') next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function fieldKindClass(child: SchemaPrimitive | SchemaReference | SchemaArray): string {
  if (child.kind === 'primitive') return 'ne-kind-prim';
  if (child.kind === 'reference') return 'ne-kind-ref';
  return 'ne-kind-arr';
}

export function fieldKindLabel(child: SchemaPrimitive | SchemaReference | SchemaArray): string {
  if (child.kind === 'primitive') return 'P';
  if (child.kind === 'reference') return 'R';
  return '[]';
}

export function emptyValueLabel(child: SchemaReference | SchemaArray): string {
  if (child.kind === 'reference') return child.typeId ? `ref:${child.typeId}` : 'unbound ref';
  return `array<${describeArrayItem(child.item)}>`;
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, button, .ne-port-handle');
}

export function portKey(direction: PortDirection, port: NodeGraphPortRef): string {
  return `${direction}:${port.nodeId}:${port.path}`;
}

export function samePortRef(a: NodeGraphPortRef, b: NodeGraphPortRef): boolean {
  return a.nodeId === b.nodeId && a.path === b.path;
}

export function getInputPortFromPoint(clientX: number, clientY: number): NodeGraphPortRef | null {
  const target = document.elementFromPoint(clientX, clientY);
  if (!(target instanceof HTMLElement)) return null;

  const handle = target.closest('.ne-port-handle-input[data-ne-port-direction="input"]');
  if (!(handle instanceof HTMLElement)) return null;

  const nodeId = handle.dataset.nePortNodeId;
  const path = handle.dataset.nePortPath;
  const label = handle.dataset.nePortLabel;
  return nodeId && path && label ? { nodeId, path, label } : null;
}

export function sameAnchors(a: Record<string, CanvasPoint>, b: Record<string, CanvasPoint>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return bKeys.every(key => a[key] && Math.abs(a[key].x - b[key].x) < 0.5 && Math.abs(a[key].y - b[key].y) < 0.5);
}
