import type {
  EntityGraphNode,
  EntityType,
  NodeChartKind,
  NodeChartValueType,
  NodeComputedViewKind,
  NodeMarkdownValueType,
  NodeGraph,
  NodeGraphConnection,
  NodeGraphNode,
  NodeGraphPortRef,
  NodeValueType,
  SchemaArray,
  SchemaChild,
  SchemaComputedView,
  SchemaFieldChild,
  SchemaPrimitive,
  SchemaReference,
  SchemaSection,
  SchemaValueType,
  TransformGraphNode,
  TransformPort,
  TransformValueType,
} from './types';
import { schemaPathToPropPath, typeAssignedPropPaths } from './methodWrites';

function nodeUid(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export interface SchemaPort {
  path: string;
  label: string;
  typeLabel: string;
  acceptsInput: boolean;
}

export function newSection(): SchemaSection {
  return { kind: 'section', id: nodeUid('sec'), name: 'section', description: '', children: [] };
}

export function newPrimitive(): SchemaPrimitive {
  return { kind: 'primitive', id: nodeUid('prim'), name: 'value', description: '', valueType: 'number', computed: false };
}

export function newReference(typeId = ''): SchemaReference {
  return { kind: 'reference', id: nodeUid('ref'), name: 'ref', description: '', typeId, computed: false };
}

export function newArray(typeId = ''): SchemaArray {
  return {
    kind: 'array',
    id: nodeUid('arr'),
    name: 'items',
    description: '',
    item: typeId ? { kind: 'reference', typeId } : { kind: 'primitive', valueType: 'number' },
    computed: false,
  };
}

export function newComputedView(view: NodeComputedViewKind = 'pie'): SchemaComputedView {
  return {
    kind: 'computedView',
    id: nodeUid('view'),
    name: view === 'pie' ? 'pieChart' : view === 'bar' ? 'barChart' : 'markdown',
    description: '',
    valueType: view === 'markdown' ? markdownValueType() : chartValueType(view),
    computed: true,
  };
}

export function addChild(children: SchemaChild[], child: SchemaChild): SchemaChild[] {
  return [...children, child];
}

export function removeChild(children: SchemaChild[], id: string): SchemaChild[] {
  return children.filter(c => c.id !== id);
}

export function updateChild(children: SchemaChild[], updated: SchemaChild): SchemaChild[] {
  return children.map(c => c.id === updated.id ? updated : c);
}

export function moveChild(children: SchemaChild[], id: string, dir: -1 | 1): SchemaChild[] {
  const idx = children.findIndex(c => c.id === id);
  if (idx < 0) return children;
  const target = idx + dir;
  if (target < 0 || target >= children.length) return children;
  const next = [...children];
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

export function moveChildInTree(children: SchemaChild[], draggedId: string, targetId: string): SchemaChild[] {
  if (draggedId === targetId) return children;

  const extracted = extractChild(children, draggedId);
  if (!extracted.child) return children;

  const inserted = insertChildBefore(extracted.children, targetId, extracted.child);
  return inserted.inserted ? inserted.children : children;
}

export function moveChildToParentEnd(children: SchemaChild[], draggedId: string, parentId: string | null): SchemaChild[] {
  const extracted = extractChild(children, draggedId);
  if (!extracted.child) return children;

  if (!parentId) return [...extracted.children, extracted.child];

  const inserted = appendChildToSection(extracted.children, parentId, extracted.child);
  return inserted.inserted ? inserted.children : children;
}

function extractChild(children: SchemaChild[], id: string): { children: SchemaChild[]; child: SchemaChild | null } {
  let found: SchemaChild | null = null;
  const next: SchemaChild[] = [];

  for (const child of children) {
    if (child.id === id) {
      found = child;
      continue;
    }

    if (child.kind === 'section' && !found) {
      const extracted = extractChild(child.children, id);
      if (extracted.child) {
        found = extracted.child;
        next.push({ ...child, children: extracted.children });
        continue;
      }
    }

    next.push(child);
  }

  return { children: next, child: found };
}

function insertChildBefore(children: SchemaChild[], targetId: string, childToInsert: SchemaChild): { children: SchemaChild[]; inserted: boolean } {
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    if (child.id === targetId) {
      return {
        children: [...children.slice(0, index), childToInsert, child, ...children.slice(index + 1)],
        inserted: true,
      };
    }

    if (child.kind === 'section') {
      const inserted = insertChildBefore(child.children, targetId, childToInsert);
      if (inserted.inserted) {
        return {
          children: [
            ...children.slice(0, index),
            { ...child, children: inserted.children },
            ...children.slice(index + 1),
          ],
          inserted: true,
        };
      }
    }
  }

  return { children, inserted: false };
}

function appendChildToSection(children: SchemaChild[], parentId: string, childToInsert: SchemaChild): { children: SchemaChild[]; inserted: boolean } {
  for (let index = 0; index < children.length; index++) {
    const child = children[index];

    if (child.id === parentId && child.kind === 'section') {
      return {
        children: [
          ...children.slice(0, index),
          { ...child, children: [...child.children, childToInsert] },
          ...children.slice(index + 1),
        ],
        inserted: true,
      };
    }

    if (child.kind === 'section') {
      const inserted = appendChildToSection(child.children, parentId, childToInsert);
      if (inserted.inserted) {
        return {
          children: [
            ...children.slice(0, index),
            { ...child, children: inserted.children },
            ...children.slice(index + 1),
          ],
          inserted: true,
        };
      }
    }
  }

  return { children, inserted: false };
}

export function defaultEntityTypes(): EntityType[] {
  return [
    {
      id: 'builtin-faction',
      name: 'Faction',
      description: 'Built-in faction host. Add modules here to extend faction data.',
      builtIn: true,
      entityClass: 'faction',
      children: [
        { kind: 'section', id: 'builtin-faction-identity', name: 'identity', description: 'Core faction display data', children: [
          { kind: 'primitive', id: 'builtin-faction-id', name: 'id', description: 'Faction id in game state', valueType: 'string', computed: false },
          { kind: 'primitive', id: 'builtin-faction-name', name: 'name', description: 'Faction display name', valueType: 'string', computed: false },
          { kind: 'primitive', id: 'builtin-faction-color', name: 'color', description: 'Faction map/chart color', valueType: 'string', computed: false },
        ] },
        { kind: 'section', id: 'builtin-faction-support', name: 'support', description: 'Faction support data from strata', children: [
          { kind: 'primitive', id: 'builtin-faction-total-support', name: 'total', description: 'Total people supporting this faction', valueType: 'number', computed: false },
          { kind: 'array', id: 'builtin-faction-support-by-stratum', name: 'byStratum', description: 'Support values by stratum order', item: { kind: 'primitive', valueType: 'number' }, computed: false },
        ] },
      ],
    },
    {
      id: 'builtin-region',
      name: 'Region',
      description: 'Built-in region host. Add modules here to extend territorial data.',
      builtIn: true,
      entityClass: 'region',
      children: [
        { kind: 'section', id: 'builtin-region-identity', name: 'identity', description: 'Core region display data', children: [
          { kind: 'primitive', id: 'builtin-region-id', name: 'id', description: 'Region id in game state', valueType: 'string', computed: false },
          { kind: 'primitive', id: 'builtin-region-name', name: 'name', description: 'Region display name', valueType: 'string', computed: false },
          { kind: 'primitive', id: 'builtin-region-subtitle', name: 'subtitle', description: 'Region subtitle', valueType: 'string', computed: false },
        ] },
        { kind: 'section', id: 'builtin-region-civic', name: 'civic', description: 'Government-facing region data', children: [
          { kind: 'primitive', id: 'builtin-region-seats', name: 'seats', description: 'Regional senate seats', valueType: 'number', computed: false },
        ] },
        { kind: 'section', id: 'builtin-region-control', name: 'control', description: 'Faction control data', children: [
          { kind: 'array', id: 'builtin-region-control-factions', name: 'factions', description: 'Controlling factions in region order', item: { kind: 'reference', typeId: 'builtin-faction' }, computed: false },
          { kind: 'array', id: 'builtin-region-control-percentages', name: 'percentages', description: 'Control percentages in region order', item: { kind: 'primitive', valueType: 'number' }, computed: false },
        ] },
        { kind: 'section', id: 'builtin-region-geometry', name: 'geometry', description: 'Map geometry summary', children: [
          { kind: 'primitive', id: 'builtin-region-vertex-count', name: 'vertexCount', description: 'Number of polygon vertices', valueType: 'number', computed: false },
        ] },
      ],
    },
  ];
}

export function createEntityGraphNode(type: EntityType, x: number, y: number): EntityGraphNode {
  return {
    kind: 'entity',
    id: nodeUid('node'),
    typeId: type.id,
    title: type.name,
    x,
    y,
  };
}

export function createTransformGraphNode(x: number, y: number): TransformGraphNode {
  return {
    kind: 'transform',
    id: nodeUid('tx'),
    title: 'Transform',
    x,
    y,
    inputs: [{ id: nodeUid('in'), name: 'input', valueType: anyValueType() }],
    outputs: [{ id: nodeUid('out'), name: 'output', valueType: anyValueType() }],
    expression: 'return inputs.input;',
  };
}

export function createTransformPort(prefix: string, name: string, valueType: TransformValueType = anyValueType()): TransformPort {
  return { id: nodeUid(prefix), name, valueType };
}

export function anyValueType(): NodeValueType {
  return { kind: 'any' };
}

export function primitiveValueType(valueType: SchemaValueType = 'number'): NodeValueType {
  return { kind: 'primitive', valueType };
}

export function referenceValueType(typeId = ''): NodeValueType {
  return { kind: 'reference', typeId };
}

export function arrayValueType(item: SchemaArray['item'] = { kind: 'primitive', valueType: 'number' }): NodeValueType {
  return { kind: 'array', item };
}

export function chartValueType(chart: NodeChartKind = 'pie'): NodeChartValueType {
  return { kind: 'chart', chart };
}

export function markdownValueType(): NodeMarkdownValueType {
  return { kind: 'markdown' };
}

export function schemaChildValueType(child: SchemaFieldChild): NodeValueType {
  if (child.kind === 'primitive') return primitiveValueType(child.valueType);
  if (child.kind === 'reference') return referenceValueType(child.typeId);
  if (child.kind === 'computedView') return child.valueType;
  return arrayValueType(child.item);
}

export function findSchemaChildByPath(children: SchemaChild[], path: string, pathPrefix = 'props'): SchemaChild | null {
  for (const child of children) {
    const childPath = `${pathPrefix}.${child.name || child.kind}`;
    if (childPath === path) return child;
    if (child.kind === 'section') {
      const found = findSchemaChildByPath(child.children, path, childPath);
      if (found) return found;
    }
  }

  return null;
}

export function collectSchemaPorts(
  children: SchemaChild[],
  pathPrefix = 'props',
  methodAssignedPaths = new Set<string>(),
): SchemaPort[] {
  const ports: SchemaPort[] = [];

  for (const child of children) {
    const path = `${pathPrefix}.${child.name || child.kind}`;

    if (child.kind === 'section') {
      ports.push(...collectSchemaPorts(child.children, path, methodAssignedPaths));
      continue;
    }

    const methodOwned = methodAssignedPaths.has(schemaPathToPropPath(path));
    ports.push({
      path,
      label: path.replace(/^props\./, ''),
      typeLabel: describeSchemaChildType(child),
      acceptsInput: child.computed && !methodOwned,
    });
  }

  return ports;
}

export function graphNodePorts(node: NodeGraphNode, types: EntityType[], direction: 'input' | 'output'): NodeGraphPortRef[] {
  if (node.kind === 'transform') {
    const ports = direction === 'input' ? node.inputs : node.outputs;
    return ports.map(port => ({
      nodeId: node.id,
      path: port.name,
      label: `${node.title}.${port.name}`,
    }));
  }

  const type = types.find(candidate => candidate.id === node.typeId);
  if (!type) return [];

  return collectSchemaPorts(type.children, 'props', typeAssignedPropPaths(type))
    .filter(port => direction === 'output' || port.acceptsInput)
    .map(port => ({
      nodeId: node.id,
      path: port.path,
      label: `${node.title}.${port.label}`,
    }));
}

export function allGraphPorts(graph: NodeGraph, types: EntityType[], direction: 'input' | 'output'): NodeGraphPortRef[] {
  return graph.nodes.flatMap(node => graphNodePorts(node, types, direction));
}

export function createConnection(from: NodeGraphPortRef, to: NodeGraphPortRef): NodeGraphConnection {
  return {
    id: nodeUid('conn'),
    from,
    to,
    mode: 'read',
  };
}

export function describeSchemaChildType(child: SchemaFieldChild): string {
  if (child.kind === 'primitive') return child.valueType;
  if (child.kind === 'reference') return `ref:${child.typeId || 'unbound'}`;
  if (child.kind === 'computedView') return describeNodeValueType(child.valueType);
  return `array<${describeArrayItem(child.item)}>`;
}

export function describeNodeValueType(valueType: NodeValueType): string {
  if (valueType.kind === 'any') return 'any';
  if (valueType.kind === 'primitive') return valueType.valueType;
  if (valueType.kind === 'reference') return `ref:${valueType.typeId || 'unbound'}`;
  if (valueType.kind === 'chart') return `${valueType.chart} chart`;
  if (valueType.kind === 'markdown') return 'markdown';
  return `array<${describeArrayItem(valueType.item)}>`;
}

export function describeArrayItem(item: SchemaArray['item']): string {
  return item.kind === 'primitive' ? item.valueType : `ref:${item.typeId || 'unbound'}`;
}

export function normalizeSchemaValueType(value: unknown): SchemaValueType {
  if (value === 'boolean') return 'boolean';
  return value === 'string' ? 'string' : 'number';
}
