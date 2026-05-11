import type { Faction, MapRegion } from '../../models/types';
import type {
  EntityType,
  NodeGraph,
  NodeGraphConnection,
  NodeGraphNode,
  NodeGraphPortRef,
  NodeInstanceValue,
  NodeValueType,
  SchemaArray,
  SchemaArrayItem,
  SchemaFieldChild,
  SchemaPrimitive,
  SchemaReference,
  TransformDefinition,
} from '../../game/nodes/types';
import { isMethodAssignedPropPath } from '../../game/nodes/methodWrites';
import { describeArrayItem, describeNodeValueType, findSchemaChildByPath, schemaChildValueType } from '../../game/nodes/schema';
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
        { label: 'support', value: factionSupportByStratum(faction.id, regions).reduce((sum, value) => sum + value, 0).toLocaleString() },
        { label: 'strata', value: factionSupportByStratum(faction.id, regions).length },
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

function factionSupportByStratum(factionId: string, regions: MapRegion[]): number[] {
  const support = new Map<string, number>();
  for (const region of regions) {
    const byStratum = region.factionSupport?.[factionId] ?? {};
    for (const [stratumId, value] of Object.entries(byStratum)) {
      support.set(stratumId, (support.get(stratumId) || 0) + Math.max(0, value));
    }
  }
  return Array.from(support.values());
}

export function cleanValues(values: Record<string, NodeInstanceValue>): Record<string, NodeInstanceValue> | undefined {
  const next: Record<string, NodeInstanceValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== '') next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function fieldKindClass(child: SchemaFieldChild): string {
  if (child.kind === 'primitive') return 'ne-kind-prim';
  if (child.kind === 'reference') return 'ne-kind-ref';
  if (child.kind === 'markdown') return 'ne-kind-info';
  if (child.kind === 'computedView') return 'ne-kind-view';
  return 'ne-kind-arr';
}

export function fieldKindLabel(child: SchemaFieldChild): string {
  if (child.kind === 'primitive') return 'P';
  if (child.kind === 'reference') return 'R';
  if (child.kind === 'markdown') return 'i';
  if (child.kind === 'computedView') return 'V';
  return '[]';
}

export function emptyValueLabel(child: Exclude<SchemaFieldChild, SchemaPrimitive>): string {
  if (child.kind === 'reference') return child.typeId ? `ref:${child.typeId}` : 'unbound ref';
  if (child.kind === 'markdown') return 'markdown';
  if (child.kind === 'computedView') return child.valueType.kind === 'markdown' ? 'markdown' : `${child.valueType.chart} chart`;
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

export interface ConnectionValidationResult {
  ok: boolean;
  message?: string;
  replaceExistingTarget?: boolean;
}

export function validateConnection(
  graph: NodeGraph,
  types: EntityType[],
  transforms: TransformDefinition[],
  from: NodeGraphPortRef,
  to: NodeGraphPortRef,
): ConnectionValidationResult {
  const sourceType = graphPortValueType(from, graph, types, transforms, 'output');
  const targetType = graphPortValueType(to, graph, types, transforms, 'input');

  if (!sourceType || !targetType) {
    return { ok: false, message: 'Cannot determine port type.' };
  }

  if (!isConnectionValueCompatible(sourceType, targetType)) {
    return {
      ok: false,
      message: `${describeNodeValueType(sourceType)} cannot connect to ${describeNodeValueType(targetType)}.`,
    };
  }

  const existing = graph.connections.filter(connection => samePortRef(connection.to, to));
  const duplicate = existing.some(connection => samePortRef(connection.from, from));
  if (duplicate) return { ok: false, message: 'That wire already exists.' };

  return {
    ok: true,
    replaceExistingTarget: targetType.kind !== 'array' && existing.length > 0,
  };
}

export function graphPortValueType(
  port: NodeGraphPortRef,
  graph: NodeGraph,
  types: EntityType[],
  transforms: TransformDefinition[],
  direction: PortDirection,
): NodeValueType | null {
  const node = graph.nodes.find(candidate => candidate.id === port.nodeId);
  if (!node) return null;

  if (node.kind === 'transform') {
    return transformPortValueType(node, transforms, port.path, direction);
  }

  const type = types.find(candidate => candidate.id === node.typeId);
  if (!type) return null;

  const methodPortType = methodPortValueType(type, port.path, direction);
  if (methodPortType) return methodPortType;

  const child = findSchemaChildByPath(type.children, port.path);
  if (!child || child.kind === 'section') return null;
  if (direction === 'input' && isMethodAssignedPropPath(type, port.path)) return null;
  return schemaChildValueType(child);
}

export function isArrayCollectorTarget(
  port: NodeGraphPortRef,
  graph: NodeGraph,
  types: EntityType[],
  transforms: TransformDefinition[],
): boolean {
  return graphPortValueType(port, graph, types, transforms, 'input')?.kind === 'array';
}

export function targetConnectionCount(connections: NodeGraphConnection[], target: NodeGraphPortRef): number {
  return connections.filter(connection => samePortRef(connection.to, target)).length;
}

export function sameAnchors(a: Record<string, CanvasPoint>, b: Record<string, CanvasPoint>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return bKeys.every(key => a[key] && Math.abs(a[key].x - b[key].x) < 0.5 && Math.abs(a[key].y - b[key].y) < 0.5);
}

function transformPortValueType(
  node: Extract<NodeGraphNode, { kind: 'transform' }>,
  transforms: TransformDefinition[],
  path: string,
  direction: PortDirection,
): NodeValueType | null {
  const definition = node.transformId
    ? transforms.find(candidate => candidate.id === node.transformId)
    : undefined;
  const spec = definition ?? node;
  const ports = direction === 'input' ? spec.inputs : spec.outputs;
  return ports.find(port => port.name === path)?.valueType ?? null;
}

function methodPortValueType(type: EntityType, path: string, direction: PortDirection): NodeValueType | null {
  const match = /^methods\.([^.]+)\.(inputs|outputs)\.(.+)$/.exec(path);
  if (!match) return null;

  const [, methodId, portGroup, portName] = match;
  if ((direction === 'input' && portGroup !== 'inputs') || (direction === 'output' && portGroup !== 'outputs')) {
    return null;
  }

  const method = type.methods?.find(candidate => candidate.id === methodId);
  if (!method) return null;

  const ports = portGroup === 'inputs' ? method.inputs : method.outputs;
  return ports.find(port => port.name === portName)?.valueType ?? null;
}

function isConnectionValueCompatible(source: NodeValueType, target: NodeValueType): boolean {
  if (target.kind === 'any' || source.kind === 'any') return true;

  if (target.kind === 'array') {
    if (source.kind === 'array') return isArrayItemCompatible(source.item, target.item);
    return isConnectionValueCompatible(source, arrayItemValueType(target.item));
  }

  if (source.kind === 'array') return false;

  if (target.kind === 'primitive') {
    return source.kind === 'primitive' && source.valueType === target.valueType;
  }

  if (target.kind === 'reference') {
    return source.kind === 'reference' && compatibleTypeId(source.typeId, target.typeId);
  }

  if (target.kind === 'chart') {
    return source.kind === 'chart' && source.chart === target.chart;
  }

  if (target.kind === 'markdown') {
    return source.kind === 'markdown';
  }

  return false;
}

function isArrayItemCompatible(source: SchemaArrayItem, target: SchemaArrayItem): boolean {
  if (target.kind === 'primitive') {
    return source.kind === 'primitive' && source.valueType === target.valueType;
  }

  return source.kind === 'reference' && compatibleTypeId(source.typeId, target.typeId);
}

function arrayItemValueType(item: SchemaArrayItem): NodeValueType {
  if (item.kind === 'primitive') return { kind: 'primitive', valueType: item.valueType };
  return { kind: 'reference', typeId: item.typeId };
}

function compatibleTypeId(sourceTypeId: string, targetTypeId: string): boolean {
  return !sourceTypeId || !targetTypeId || sourceTypeId === targetTypeId;
}
