import type {
  EntityGraphNode,
  EntityType,
  NodeGraph,
  NodeGraphConnection,
  NodeGraphPortRef,
  SchemaArray,
  SchemaChild,
  SchemaPrimitive,
  SchemaReference,
  TransformDefinition,
  TransformGraphNode,
  TransformPort,
} from './types';
import type { Faction, MapRegion } from '../../models/types';

export type NodeRuntimeValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | NodeRuntimeValue[]
  | { typeId?: string; nodeId?: string; values?: Record<string, NodeRuntimeValue>; [key: string]: NodeRuntimeValue };

export interface NodeRuntimeContext {
  graph: NodeGraph;
  types: EntityType[];
  transforms: TransformDefinition[];
  factions: Faction[];
  regions: MapRegion[];
}

export interface NodeEvaluation {
  values: Record<string, NodeRuntimeValue>;
  errors: Record<string, string[]>;
}

export type TransformPreviewDiagnosticLevel = 'error' | 'warning' | 'info';

export interface TransformPreviewDiagnostic {
  level: TransformPreviewDiagnosticLevel;
  message: string;
}

export interface TransformPreviewResult {
  inputs: Record<string, NodeRuntimeValue>;
  availableVariables: string[];
  result: NodeRuntimeValue;
  outputs: Record<string, NodeRuntimeValue>;
  diagnostics: TransformPreviewDiagnostic[];
}

export function evaluateGraph(context: NodeRuntimeContext): NodeEvaluation {
  const values: Record<string, NodeRuntimeValue> = {};
  const errors: Record<string, string[]> = {};
  const resolving = new Set<string>();

  const pushError = (nodeId: string, message: string) => {
    errors[nodeId] = [...(errors[nodeId] ?? []), message];
  };

  const incomingFor = (target: NodeGraphPortRef) => (
    context.graph.connections.filter(connection => connection.to.nodeId === target.nodeId && connection.to.path === target.path)
  );

  const resolveIncoming = (target: NodeGraphPortRef): NodeRuntimeValue => {
    const incoming = incomingFor(target);
    if (incoming.length === 0) return undefined;

    const resolved = incoming.map(connection => applyConnectionMode(connection, resolvePort(connection.from)));
    return resolved.length === 1 ? resolved[0] : resolved;
  };

  const resolvePort = (port: NodeGraphPortRef): NodeRuntimeValue => {
    const key = portKey(port);
    if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];

    if (resolving.has(key)) {
      pushError(port.nodeId, `Cycle while resolving ${port.path}`);
      return undefined;
    }

    resolving.add(key);
    const node = context.graph.nodes.find(candidate => candidate.id === port.nodeId);
    let value: NodeRuntimeValue;

    if (!node) {
      value = undefined;
    } else if (node.kind === 'transform') {
      value = resolveTransformPort(node, port.path, resolveIncoming, pushError, context.transforms);
    } else {
      value = resolveEntityPort(node, port.path, context, resolveIncoming);
    }

    values[key] = value;
    resolving.delete(key);
    return value;
  };

  for (const node of context.graph.nodes) {
    if (node.kind === 'transform') {
      for (const port of transformSpec(node, context.transforms).outputs) {
        resolvePort({ nodeId: node.id, path: port.name, label: `${node.title}.${port.name}` });
      }
    } else {
      const type = context.types.find(candidate => candidate.id === node.typeId);
      if (!type) continue;

      for (const path of collectSchemaPaths(type.children)) {
        resolvePort({ nodeId: node.id, path, label: `${node.title}.${path.replace(/^props\./, '')}` });
      }
    }
  }

  return { values, errors };
}

export function transformSpec(node: TransformGraphNode, definitions: TransformDefinition[]): TransformDefinition {
  const definition = node.transformId
    ? definitions.find(candidate => candidate.id === node.transformId)
    : undefined;

  return definition ?? {
    id: node.id,
    name: node.title,
    inputs: node.inputs,
    outputs: node.outputs,
    expression: node.expression,
  };
}

export function previewTransformDefinition(
  definition: Pick<TransformDefinition, 'inputs' | 'outputs' | 'expression'>
): TransformPreviewResult {
  const diagnostics: TransformPreviewDiagnostic[] = [];
  const inputs: Record<string, NodeRuntimeValue> = {};
  const outputs: Record<string, NodeRuntimeValue> = {};

  addPortNameDiagnostics('Input', definition.inputs.map(port => port.name), diagnostics);
  addPortNameDiagnostics('Output', definition.outputs.map(port => port.name), diagnostics);

  for (const [index, input] of definition.inputs.entries()) {
    if (!input.name.trim()) continue;
    inputs[input.name] = sampleValueForPort(input, index);
  }

  const availableVariables = Object.keys(inputs).filter(isSafeIdentifier);
  const invalidInputNames = Object.keys(inputs).filter(name => !isSafeIdentifier(name));

  for (const name of invalidInputNames) {
    diagnostics.push({
      level: 'warning',
      message: `Input "${name}" is not a valid JavaScript variable name, so the snippet cannot read it directly.`,
    });
  }

  if (availableVariables.length > 0) {
    diagnostics.push({
      level: 'info',
      message: `Available variables: ${availableVariables.join(', ')}`,
    });
  }

  if (!definition.expression.trim()) {
    diagnostics.push({
      level: 'error',
      message: 'JavaScript is empty.',
    });

    for (const output of definition.outputs) outputs[output.name] = undefined;
    return { inputs, availableVariables, result: undefined, outputs, diagnostics };
  }

  if (!hasExplicitReturn(definition.expression)) {
    diagnostics.push({
      level: 'info',
      message: 'No return statement found; this is evaluated as a single expression.',
    });
  }

  try {
    const result = executeTransformExpression(definition.expression, inputs) as NodeRuntimeValue;

    for (const output of definition.outputs) {
      outputs[output.name] = resolveTransformOutputValue(result, output.name, definition.outputs);
    }

    addOutputDiagnostics(result, definition.outputs, outputs, diagnostics);
    return { inputs, availableVariables, result, outputs, diagnostics };
  } catch (error) {
    diagnostics.push({
      level: 'error',
      message: error instanceof Error ? error.message : 'Transform failed.',
    });

    for (const output of definition.outputs) outputs[output.name] = undefined;
    return { inputs, availableVariables, result: undefined, outputs, diagnostics };
  }
}

export function runtimeValueLabel(value: NodeRuntimeValue): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(runtimeValueLabel).join(', ')}]`;
  if (typeof value === 'object') {
    if (typeof value.name === 'string') return value.name;
    if (typeof value.id === 'string') return value.id;
    return JSON.stringify(value);
  }
  return String(value);
}

export function entityFieldValue(
  node: EntityGraphNode,
  type: EntityType,
  child: SchemaPrimitive | SchemaReference | SchemaArray,
  path: string,
  context: Pick<NodeRuntimeContext, 'factions' | 'regions'>
): NodeRuntimeValue {
  const saved = node.values?.[path];
  if (saved !== undefined) return saved;

  const bound = boundValue(type, node.binding, path, context.factions, context.regions);
  if (bound !== undefined) return bound;

  if (child.kind === 'primitive') return child.defaultValue ?? '';
  return undefined;
}

function resolveEntityPort(
  node: EntityGraphNode,
  path: string,
  context: NodeRuntimeContext,
  resolveIncoming: (target: NodeGraphPortRef) => NodeRuntimeValue
): NodeRuntimeValue {
  const type = context.types.find(candidate => candidate.id === node.typeId);
  if (!type) return undefined;

  const child = findSchemaChild(type.children, path);
  if (!child || child.kind === 'section') return undefined;

  if (child.computed) {
    const wired = resolveIncoming({ nodeId: node.id, path, label: `${node.title}.${path}` });
    if (wired !== undefined) return wired;
  }

  return entityFieldValue(node, type, child, path, context);
}

function resolveTransformPort(
  node: TransformGraphNode,
  path: string,
  resolveIncoming: (target: NodeGraphPortRef) => NodeRuntimeValue,
  pushError: (nodeId: string, message: string) => void,
  definitions: TransformDefinition[]
): NodeRuntimeValue {
  const spec = transformSpec(node, definitions);
  const inputValues: Record<string, NodeRuntimeValue> = {};

  for (const input of spec.inputs) {
    inputValues[input.name] = resolveIncoming({ nodeId: node.id, path: input.name, label: `${node.title}.${input.name}` });
  }

  try {
    const result = executeTransformExpression(spec.expression, inputValues);
    return resolveTransformOutputValue(result, path, spec.outputs);
  } catch (error) {
    pushError(node.id, error instanceof Error ? error.message : 'Transform failed');
    return undefined;
  }
}

export function executeTransformExpression(expression: string, inputs: Record<string, NodeRuntimeValue>): any {
  const names = Object.keys(inputs).filter(isSafeIdentifier);
  const args = names.map(name => inputs[name]);
  const source = hasExplicitReturn(expression) ? expression : `return (${expression});`;
  const fn = new Function(...names, source);
  return fn(...args);
}

function resolveTransformOutputValue(result: any, path: string, outputs: TransformPort[]): NodeRuntimeValue {
  if (outputs.length === 1 && !isPlainOutputObject(result, outputs)) return result;
  if (!isOutputObject(result)) return undefined;
  return result[path];
}

function addPortNameDiagnostics(
  label: 'Input' | 'Output',
  names: string[],
  diagnostics: TransformPreviewDiagnostic[]
) {
  const counts = new Map<string, number>();

  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) {
      diagnostics.push({ level: 'error', message: `${label} port names cannot be empty.` });
      continue;
    }

    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }

  for (const [name, count] of counts) {
    if (count > 1) {
      diagnostics.push({ level: 'error', message: `${label} port "${name}" is duplicated.` });
    }
  }
}

function addOutputDiagnostics(
  result: NodeRuntimeValue,
  outputs: TransformPort[],
  resolvedOutputs: Record<string, NodeRuntimeValue>,
  diagnostics: TransformPreviewDiagnostic[]
) {
  if (outputs.length === 0) {
    diagnostics.push({ level: 'warning', message: 'This transform has no output ports.' });
    return;
  }

  if (outputs.length === 1 && !isPlainOutputObject(result, outputs)) {
    diagnostics.push({
      level: 'info',
      message: `Single output "${outputs[0].name}" receives the returned value directly.`,
    });
  } else if (!isOutputObject(result)) {
    diagnostics.push({
      level: 'error',
      message: 'Multiple outputs need an object return value keyed by output name.',
    });
  }

  for (const output of outputs) {
    if (resolvedOutputs[output.name] === undefined) {
      diagnostics.push({
        level: 'warning',
        message: `Output "${output.name}" resolves to undefined in the preview.`,
      });
    }
  }
}

function sampleValueForPort(port: TransformPort, index: number): NodeRuntimeValue {
  const ordinal = index + 1;

  if (port.valueType.kind === 'primitive') {
    return port.valueType.valueType === 'string' ? `${port.name || 'value'} sample` : ordinal * 10;
  }

  if (port.valueType.kind === 'reference') {
    return {
      typeId: port.valueType.typeId || 'entity',
      id: `${port.name || 'entity'}-sample`,
      name: `${port.name || 'Entity'} Sample`,
    };
  }

  if (port.valueType.kind === 'array') {
    if (port.valueType.item.kind === 'primitive') {
      return port.valueType.item.valueType === 'string'
        ? [`${port.name || 'item'} A`, `${port.name || 'item'} B`]
        : [ordinal, ordinal + 1, ordinal + 2];
    }

    return [
      {
        typeId: port.valueType.item.typeId || 'entity',
        id: `${port.name || 'entity'}-sample-a`,
        name: `${port.name || 'Entity'} Sample A`,
      },
      {
        typeId: port.valueType.item.typeId || 'entity',
        id: `${port.name || 'entity'}-sample-b`,
        name: `${port.name || 'Entity'} Sample B`,
      },
    ];
  }

  return ordinal * 10;
}

function applyConnectionMode(connection: NodeGraphConnection, value: NodeRuntimeValue): NodeRuntimeValue {
  if (connection.mode !== 'take') return value;
  const amount = Math.max(0, connection.amount ?? 0);

  if (typeof value === 'number') return amount;
  if (Array.isArray(value)) return value.slice(0, amount);
  return value;
}

function collectSchemaPaths(children: SchemaChild[], pathPrefix = 'props'): string[] {
  const paths: string[] = [];

  for (const child of children) {
    const path = `${pathPrefix}.${child.name || child.kind}`;
    if (child.kind === 'section') paths.push(...collectSchemaPaths(child.children, path));
    else paths.push(path);
  }

  return paths;
}

function findSchemaChild(children: SchemaChild[], path: string, pathPrefix = 'props'): SchemaChild | null {
  for (const child of children) {
    const childPath = `${pathPrefix}.${child.name || child.kind}`;
    if (childPath === path) return child;
    if (child.kind === 'section') {
      const found = findSchemaChild(child.children, path, childPath);
      if (found) return found;
    }
  }

  return null;
}

function boundValue(
  type: EntityType,
  binding: EntityGraphNode['binding'],
  path: string,
  factions: Faction[],
  regions: MapRegion[]
): NodeRuntimeValue {
  if (!binding || binding.entityClass !== type.entityClass) return undefined;

  if (binding.entityClass === 'faction') {
    const faction = factions.find(candidate => candidate.id === binding.entityId);
    if (!faction) return undefined;

    if (path === 'props.identity.id') return faction.id;
    if (path === 'props.identity.name') return faction.name;
    if (path === 'props.identity.color') return faction.color;
    if (path === 'props.support.total') return Object.values(faction.support).reduce((sum, value) => sum + value, 0);
    if (path === 'props.support.byStratum') return Object.values(faction.support);
  }

  if (binding.entityClass === 'region') {
    const region = regions.find(candidate => candidate.id === binding.entityId);
    if (!region) return undefined;

    if (path === 'props.identity.id') return region.id;
    if (path === 'props.identity.name') return region.name;
    if (path === 'props.identity.subtitle') return region.name2 ?? '';
    if (path === 'props.civic.seats') return region.seatings;
    if (path === 'props.control.factions') return region.factionControl.map(entry => entry.factionId);
    if (path === 'props.control.percentages') return region.factionControl.map(entry => entry.percentage);
    if (path === 'props.geometry.vertexCount') return region.vertices.length;
  }

  return undefined;
}

function isSafeIdentifier(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}

function hasExplicitReturn(expression: string): boolean {
  return /\breturn\b/.test(expression);
}

function isOutputObject(value: any): value is Record<string, NodeRuntimeValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPlainOutputObject(value: any, outputs: TransformPort[]): value is Record<string, NodeRuntimeValue> {
  if (!isOutputObject(value)) return false;
  return outputs.some(output => Object.prototype.hasOwnProperty.call(value, output.name));
}

function portKey(port: NodeGraphPortRef): string {
  return `${port.nodeId}:${port.path}`;
}
