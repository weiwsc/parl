import type {
  EntityGraphNode,
  EntityType,
  NodeEditorState,
  NodeGraph,
  NodeGraphNode,
  NodeValueType,
  SchemaArrayItem,
  SchemaChild,
  TransformDefinition,
  TransformGraphNode,
  TransformPort,
  TypeMethodDefinition,
} from './types';

export const NODE_EDITOR_EXPORT_KIND = 'parl.nodeEditor.export';
export const NODE_EDITOR_EXPORT_VERSION = 1;

export interface NodeEditorExportReport {
  strippedTypeReferences: number;
  strippedExternalBindings: number;
  strippedTransformReferences: number;
  strippedGraphNodes: number;
  strippedConnections: number;
}

export interface NodeEditorExportBundle {
  kind: typeof NODE_EDITOR_EXPORT_KIND;
  version: typeof NODE_EDITOR_EXPORT_VERSION;
  exportedAt: string;
  nodes: NodeEditorState;
  meta: {
    typeCount: number;
    transformCount: number;
    graphNodeCount: number;
    connectionCount: number;
    stripped: NodeEditorExportReport;
  };
}

export function createNodeEditorExportBundle(nodes: NodeEditorState): NodeEditorExportBundle {
  const { nodes: exportedNodes, report } = sanitizeStandaloneNodeEditorState(nodes);

  return {
    kind: NODE_EDITOR_EXPORT_KIND,
    version: NODE_EDITOR_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    nodes: exportedNodes,
    meta: {
      typeCount: exportedNodes.types.length,
      transformCount: exportedNodes.transforms.length,
      graphNodeCount: exportedNodes.graph.nodes.length,
      connectionCount: exportedNodes.graph.connections.length,
      stripped: report,
    },
  };
}

export function serializeNodeEditorExport(nodes: NodeEditorState): {
  json: string;
  bundle: NodeEditorExportBundle;
} {
  const bundle = createNodeEditorExportBundle(nodes);
  return { bundle, json: JSON.stringify(bundle, null, 2) };
}

export function parseNodeEditorImport(raw: string): {
  nodes: NodeEditorState;
  report: NodeEditorExportReport;
} {
  const parsed = JSON.parse(raw) as unknown;
  const candidate = getNodeEditorPayload(parsed);
  if (!candidate) throw new Error('No node editor data found.');

  return sanitizeStandaloneNodeEditorState(candidate);
}

export function sanitizeStandaloneNodeEditorState(value: unknown): {
  nodes: NodeEditorState;
  report: NodeEditorExportReport;
} {
  const report: NodeEditorExportReport = {
    strippedTypeReferences: 0,
    strippedExternalBindings: 0,
    strippedTransformReferences: 0,
    strippedGraphNodes: 0,
    strippedConnections: 0,
  };

  const source = asRecord(cloneJson(value)) ?? {};
  const rawTypes = asObjectArray(source.types).filter(hasStringId) as unknown as EntityType[];
  const typeIds = new Set(rawTypes.map(type => type.id));
  const types = rawTypes.map(type => sanitizeEntityType(type, typeIds, report));
  const transforms = asObjectArray(source.transforms)
    .filter(hasStringId)
    .map(transform => sanitizeTransformDefinition(transform as unknown as TransformDefinition, typeIds, report));
  const transformIds = new Set(transforms.map(transform => transform.id));
  const graph = sanitizeGraph(toGraph(source.graph), transformIds, typeIds, report);
  const { types: _types, graph: _graph, transforms: _transforms, config: _config, ...rest } = source;

  return {
    nodes: {
      ...rest,
      types,
      graph,
      transforms,
    } as unknown as NodeEditorState,
    report,
  };
}

function getNodeEditorPayload(value: unknown): unknown | null {
  const record = asRecord(value);
  if (!record) return null;

  if (record.kind === NODE_EDITOR_EXPORT_KIND && asRecord(record.nodes)) {
    return record.nodes;
  }

  if (looksLikeNodeEditorState(record)) return record;

  const nestedNodes = asRecord(record.nodes);
  return nestedNodes && looksLikeNodeEditorState(nestedNodes) ? nestedNodes : null;
}

function looksLikeNodeEditorState(value: Record<string, unknown>): boolean {
  return Array.isArray(value.types) || asRecord(value.graph) !== null || Array.isArray(value.transforms);
}

function sanitizeEntityType(
  type: EntityType,
  typeIds: Set<string>,
  report: NodeEditorExportReport,
): EntityType {
  const methods = asObjectArray(type.methods).map(method => (
    sanitizeTransformDefinition(method as unknown as TypeMethodDefinition, typeIds, report)
  ));
  return {
    ...type,
    children: sanitizeSchemaChildren(asObjectArray(type.children) as unknown as SchemaChild[], typeIds, report),
    ...(methods.length > 0 ? { methods: methods as TypeMethodDefinition[] } : { methods: undefined }),
  };
}

function sanitizeSchemaChildren(
  children: SchemaChild[],
  typeIds: Set<string>,
  report: NodeEditorExportReport,
): SchemaChild[] {
  const next: SchemaChild[] = [];

  for (const child of children) {
    if (child.kind === 'section') {
      next.push({ ...child, children: sanitizeSchemaChildren(child.children, typeIds, report) });
      continue;
    }

    if (child.kind === 'reference' && !typeIds.has(child.typeId)) {
      report.strippedTypeReferences += 1;
      continue;
    }

    if (child.kind === 'array' && child.item.kind === 'reference' && !typeIds.has(child.item.typeId)) {
      report.strippedTypeReferences += 1;
      continue;
    }

    if (child.kind === 'computedView') {
      const valueType = sanitizeNodeValueType(child.valueType, typeIds, report);
      next.push({
        ...child,
        valueType: valueType.kind === 'chart' || valueType.kind === 'markdown' ? valueType : { kind: 'chart', chart: 'pie' },
        computed: true,
      });
      continue;
    }

    if (child.kind === 'markdown') {
      next.push({
        ...child,
        defaultValue: typeof child.defaultValue === 'string' ? child.defaultValue : '',
        computed: !!child.computed,
      });
      continue;
    }

    next.push(child);
  }

  return next;
}

function sanitizeTransformDefinition(
  transform: TransformDefinition,
  typeIds: Set<string>,
  report: NodeEditorExportReport,
): TransformDefinition {
  return {
    ...transform,
    name: typeof transform.name === 'string' && transform.name.length > 0 ? transform.name : 'Transform',
    description: typeof transform.description === 'string' ? transform.description : undefined,
    inputs: asObjectArray(transform.inputs).map(port => sanitizeTransformPort(port as unknown as TransformPort, typeIds, report)),
    outputs: asObjectArray(transform.outputs).map(port => sanitizeTransformPort(port as unknown as TransformPort, typeIds, report)),
    expression: typeof transform.expression === 'string' ? transform.expression : 'return {};',
  } as TransformDefinition;
}

function sanitizeTransformPort(
  port: TransformPort,
  typeIds: Set<string>,
  report: NodeEditorExportReport,
): TransformPort {
  return {
    ...port,
    id: typeof port.id === 'string' && port.id.length > 0 ? port.id : 'port',
    name: typeof port.name === 'string' && port.name.length > 0 ? port.name : 'port',
    valueType: sanitizeNodeValueType(port.valueType, typeIds, report),
  };
}

function sanitizeNodeValueType(
  valueType: unknown,
  typeIds: Set<string>,
  report: NodeEditorExportReport,
): NodeValueType {
  const value = asRecord(valueType);
  if (!value) return { kind: 'any' };

  if (value.kind === 'primitive' && (value.valueType === 'number' || value.valueType === 'string' || value.valueType === 'boolean')) {
    return { kind: 'primitive', valueType: value.valueType };
  }

  if (value.kind === 'reference' && typeof value.typeId === 'string' && typeIds.has(value.typeId)) {
    return { kind: 'reference', typeId: value.typeId };
  }

  if (value.kind === 'reference') {
    report.strippedTypeReferences += 1;
    return { kind: 'any' };
  }

  if (value.kind === 'array') {
    const item = sanitizeArrayItem(value.item, typeIds, report);
    return item ? { kind: 'array', item } : { kind: 'any' };
  }

  if (value.kind === 'chart') {
    return { kind: 'chart', chart: value.chart === 'bar' ? 'bar' : 'pie' };
  }

  if (value.kind === 'markdown') {
    return { kind: 'markdown' };
  }

  return { kind: 'any' };
}

function sanitizeArrayItem(
  item: unknown,
  typeIds: Set<string>,
  report: NodeEditorExportReport,
): SchemaArrayItem | null {
  const value = asRecord(item);
  if (!value) return null;

  if (value.kind === 'primitive' && (value.valueType === 'number' || value.valueType === 'string' || value.valueType === 'boolean')) {
    return { kind: 'primitive', valueType: value.valueType };
  }

  if (value.kind === 'reference' && typeof value.typeId === 'string' && typeIds.has(value.typeId)) {
    return { kind: 'reference', typeId: value.typeId };
  }

  if (value.kind === 'reference') {
    report.strippedTypeReferences += 1;
    return null;
  }

  return null;
}

function sanitizeGraph(
  graph: NodeGraph,
  transformIds: Set<string>,
  typeIds: Set<string>,
  report: NodeEditorExportReport,
): NodeGraph {
  const nodes = graph.nodes.flatMap(node => sanitizeGraphNode(node, transformIds, typeIds, report));
  const nodeIds = new Set(nodes.map(node => node.id));
  const draftGraph: NodeGraph = { nodes, connections: [] };
  const connections = graph.connections.flatMap(connection => {
    const from = toPortRef(connection.from);
    const to = toPortRef(connection.to);
    if (!from || !to) {
      report.strippedConnections += 1;
      return [];
    }

    const isValid = nodeIds.has(from.nodeId)
      && nodeIds.has(to.nodeId);
    if (!isValid) {
      report.strippedConnections += 1;
      return [];
    }

    return [{ ...connection, from, to }];
  });

  return { ...draftGraph, connections };
}

function sanitizeGraphNode(
  node: NodeGraphNode,
  transformIds: Set<string>,
  typeIds: Set<string>,
  report: NodeEditorExportReport,
): NodeGraphNode[] {
  if (node.kind === 'entity') {
    if (!typeIds.has(node.typeId)) {
      report.strippedTypeReferences += 1;
      report.strippedGraphNodes += 1;
      return [];
    }

    const { binding: _binding, ...standalone } = node;
    if (node.binding) report.strippedExternalBindings += 1;
    return [standalone as EntityGraphNode];
  }

  const transformNode: TransformGraphNode = {
    ...node,
    inputs: node.inputs.map(port => sanitizeTransformPort(port, typeIds, report)),
    outputs: node.outputs.map(port => sanitizeTransformPort(port, typeIds, report)),
  };

  if (transformNode.transformId && !transformIds.has(transformNode.transformId)) {
    report.strippedTransformReferences += 1;
    delete transformNode.transformId;
  }

  return [transformNode];
}

function toGraph(value: unknown): NodeGraph {
  const graph = asRecord(value);
  if (!graph) return { nodes: [], connections: [] };
  return {
    nodes: asObjectArray(graph.nodes).filter(hasStringId) as unknown as NodeGraphNode[],
    connections: asObjectArray(graph.connections).filter(hasStringId) as unknown as NodeGraph['connections'],
  };
}

function toPortRef(value: unknown): { nodeId: string; path: string; label: string } | null {
  const ref = asRecord(value);
  if (!ref || typeof ref.nodeId !== 'string' || typeof ref.path !== 'string') return null;
  return {
    nodeId: ref.nodeId,
    path: ref.path,
    label: typeof ref.label === 'string' ? ref.label : ref.path,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(item => asRecord(item) !== null) as Record<string, unknown>[]
    : [];
}

function hasStringId(value: Record<string, unknown>): boolean {
  return typeof value.id === 'string' && value.id.length > 0;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
