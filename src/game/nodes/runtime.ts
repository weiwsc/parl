import type {
  EntityGraphNode,
  EntityType,
  NodeGraph,
  NodeGraphConnection,
  NodeGraphPortRef,
  NodeValueType,
  SchemaChild,
  SchemaFieldChild,
  TransformDefinition,
  TransformGraphNode,
  TransformPort,
  TypeMethodDefinition,
} from './types';
import { collectPropWritePaths, methodsAssigningProp, schemaPathToPropPath } from './methodWrites';
import { findSchemaChildByPath, schemaChildValueType } from './schema';
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

export interface FunctionScriptContext {
  inputs: Record<string, NodeRuntimeValue>;
  outputs: Record<string, NodeRuntimeValue>;
  props: Record<string, NodeRuntimeValue>;
  chart: ChartScriptHelpers;
  target?: TypeMethodTarget;
}

export interface CanonicalChartItem {
  label: string;
  value: number;
  color: string;
}

export interface CanonicalChartBlock {
  title: string;
  data: CanonicalChartItem[];
}

export interface ChartScriptHelpers {
  item: (label: string, value: number | string, color?: string) => CanonicalChartItem;
  pie: (dataOrTitle: NodeRuntimeValue, dataOrTitleMaybe?: NodeRuntimeValue) => CanonicalChartBlock;
  pies: (...charts: NodeRuntimeValue[]) => CanonicalChartBlock[];
  bar: (dataOrTitle: NodeRuntimeValue, dataOrTitleMaybe?: NodeRuntimeValue) => CanonicalChartBlock;
}

export interface TypeMethodTarget {
  typeId: string;
  nodeId?: string;
  props: Record<string, NodeRuntimeValue>;
}

export interface TransformPreviewOptions {
  props?: Record<string, NodeRuntimeValue>;
  propRules?: Record<string, PropWriteRule>;
  target?: TypeMethodTarget;
}

export interface PropWriteRule {
  computed: boolean;
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

  const resolveIncoming = (target: NodeGraphPortRef, targetType?: NodeValueType): NodeRuntimeValue => {
    const incoming = incomingFor(target);
    if (incoming.length === 0) return undefined;

    const resolved = incoming.map(connection => applyConnectionMode(connection, resolvePort(connection.from)));
    if (targetType?.kind === 'array') return flattenIncomingArray(resolved);
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
      value = resolveEntityPort(node, port.path, context, resolveIncoming, pushError);
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
  definition: Pick<TransformDefinition, 'inputs' | 'outputs' | 'expression'>,
  options: TransformPreviewOptions = {}
): TransformPreviewResult {
  const diagnostics: TransformPreviewDiagnostic[] = [];
  const inputs: Record<string, NodeRuntimeValue> = {};
  const outputs: Record<string, NodeRuntimeValue> = {};
  const props = options.props ?? options.target?.props ?? {};

  addPortNameDiagnostics('Input', definition.inputs.map(port => port.name), diagnostics);
  addPortNameDiagnostics('Output', definition.outputs.map(port => port.name), diagnostics);

  for (const [index, input] of definition.inputs.entries()) {
    if (!input.name.trim()) continue;
    inputs[input.name] = sampleValueForPort(input, index);
  }

  const hasProps = Object.keys(props).length > 0 || !!options.target;
  const availableVariables = [
    'scope',
    'inputs',
    'outputs',
    'chart',
    ...(hasProps ? ['props'] : []),
    ...(options.target ? ['target'] : []),
  ];
  const invalidInputNames = Object.keys(inputs).filter(name => !isSafeIdentifier(name));

  for (const name of invalidInputNames) {
    diagnostics.push({
      level: 'warning',
      message: `Input "${name}" is not a valid JavaScript variable name. Read it with inputs[${JSON.stringify(name)}].`,
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

  const propWriteDiagnostics = validatePropWrites(definition.expression, options.propRules);
  diagnostics.push(...propWriteDiagnostics);

  if (!hasExplicitReturn(definition.expression)) {
    diagnostics.push({
      level: 'error',
      message: returnRequirementMessage(definition.outputs),
    });
  }

  if (diagnostics.some(diagnostic => diagnostic.level === 'error')) {
    for (const output of definition.outputs) outputs[output.name] = undefined;
    return { inputs, availableVariables, result: undefined, outputs, diagnostics };
  }

  try {
    const result = executeTransformExpression(definition.expression, inputs, {
      props,
      target: options.target,
    }) as NodeRuntimeValue;

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
  child: SchemaFieldChild,
  path: string,
  context: Pick<NodeRuntimeContext, 'factions' | 'regions'>
): NodeRuntimeValue {
  const saved = node.values?.[path];
  if (saved !== undefined) return saved;

  const bound = boundValue(type, node.binding, path, context.factions, context.regions);
  if (bound !== undefined) return bound;

  if (child.kind === 'primitive') return child.defaultValue ?? (child.valueType === 'boolean' ? false : '');
  return undefined;
}

function resolveEntityPort(
  node: EntityGraphNode,
  path: string,
  context: NodeRuntimeContext,
  resolveIncoming: (target: NodeGraphPortRef, targetType?: NodeValueType) => NodeRuntimeValue,
  pushError: (nodeId: string, message: string) => void
): NodeRuntimeValue {
  const type = context.types.find(candidate => candidate.id === node.typeId);
  if (!type) return undefined;

  const methodPort = findMethodPortByPath(type, path);
  if (methodPort) {
    if (methodPort.direction === 'input') {
      return resolveIncoming(
        { nodeId: node.id, path, label: `${node.title}.${methodPort.method.name}.${methodPort.port.name}` },
        methodPort.port.valueType
      );
    }

    return resolveMethodOutput(node, type, methodPort.method, path, context, resolveIncoming, pushError);
  }

  const child = findSchemaChildByPath(type.children, path);
  if (!child || child.kind === 'section') return undefined;

  if (child.computed) {
    if (methodsAssigningProp(type, path).length > 0) {
      return resolveMethodAssignedProp(node, type, path, context, resolveIncoming, pushError);
    }

    const wired = resolveIncoming({ nodeId: node.id, path, label: `${node.title}.${path}` }, schemaChildValueType(child));
    if (wired !== undefined) return wired;
  }

  return entityFieldValue(node, type, child, path, context);
}

function resolveMethodAssignedProp(
  node: EntityGraphNode,
  type: EntityType,
  schemaPath: string,
  context: NodeRuntimeContext,
  resolveIncoming: (target: NodeGraphPortRef, targetType?: NodeValueType) => NodeRuntimeValue,
  pushError: (nodeId: string, message: string) => void
): NodeRuntimeValue {
  const methods = methodsAssigningProp(type, schemaPath);
  if (methods.length === 0) return undefined;

  const props = collectEntityProps(node, type, context, resolveIncoming);
  const propRules = collectPropWriteRules(type.children);

  for (const method of methods) {
    const inputValues: Record<string, NodeRuntimeValue> = {};
    for (const input of method.inputs) {
      inputValues[input.name] = resolveIncoming(
        {
          nodeId: node.id,
          path: methodPortPath(method, 'input', input),
          label: `${node.title}.${method.name}.${input.name}`,
        },
        input.valueType
      );
    }

    const propWriteDiagnostics = validatePropWrites(method.expression, propRules);
    if (propWriteDiagnostics.some(diagnostic => diagnostic.level === 'error')) {
      for (const diagnostic of propWriteDiagnostics) pushError(node.id, diagnostic.message);
      continue;
    }

    try {
      executeTransformExpression(method.expression, inputValues, {
        props,
        target: { typeId: type.id, nodeId: node.id, props },
      });
    } catch (error) {
      pushError(node.id, error instanceof Error ? error.message : 'Method failed');
    }
  }

  return getPropValue(props, schemaPathToPropPath(schemaPath));
}

function resolveMethodOutput(
  node: EntityGraphNode,
  type: EntityType,
  method: TypeMethodDefinition,
  outputPath: string,
  context: NodeRuntimeContext,
  resolveIncoming: (target: NodeGraphPortRef, targetType?: NodeValueType) => NodeRuntimeValue,
  pushError: (nodeId: string, message: string) => void
): NodeRuntimeValue {
  const inputValues: Record<string, NodeRuntimeValue> = {};

  for (const input of method.inputs) {
    inputValues[input.name] = resolveIncoming(
      {
        nodeId: node.id,
        path: methodPortPath(method, 'input', input),
        label: `${node.title}.${method.name}.${input.name}`,
      },
      input.valueType
    );
  }

  const props = collectEntityProps(node, type, context, resolveIncoming);
  const propWriteDiagnostics = validatePropWrites(method.expression, collectPropWriteRules(type.children));
  if (propWriteDiagnostics.some(diagnostic => diagnostic.level === 'error')) {
    for (const diagnostic of propWriteDiagnostics) pushError(node.id, diagnostic.message);
    return undefined;
  }

  try {
    const result = executeTransformExpression(method.expression, inputValues, {
      props,
      target: { typeId: type.id, nodeId: node.id, props },
    });
    return resolveTransformOutputValue(result, methodPortNameFromPath(outputPath), method.outputs);
  } catch (error) {
    pushError(node.id, error instanceof Error ? error.message : 'Method failed');
    return undefined;
  }
}

function findMethodPortByPath(
  type: EntityType,
  path: string
): { method: TypeMethodDefinition; direction: 'input' | 'output'; port: TransformPort } | null {
  const match = /^methods\.([^.]+)\.(inputs|outputs)\.(.+)$/.exec(path);
  if (!match) return null;

  const [, methodId, portGroup, portName] = match;
  const method = type.methods?.find(candidate => candidate.id === methodId);
  if (!method) return null;

  const direction = portGroup === 'inputs' ? 'input' : 'output';
  const ports = direction === 'input' ? method.inputs : method.outputs;
  const port = ports.find(candidate => candidate.name === portName);
  return port ? { method, direction, port } : null;
}

function methodPortPath(method: TypeMethodDefinition, direction: 'input' | 'output', port: TransformPort): string {
  return `methods.${method.id}.${direction === 'input' ? 'inputs' : 'outputs'}.${port.name}`;
}

function methodPortNameFromPath(path: string): string {
  return /^methods\.[^.]+\.(?:inputs|outputs)\.(.+)$/.exec(path)?.[1] ?? path;
}

function collectEntityProps(
  node: EntityGraphNode,
  type: EntityType,
  context: NodeRuntimeContext,
  resolveIncoming: (target: NodeGraphPortRef, targetType?: NodeValueType) => NodeRuntimeValue
): Record<string, NodeRuntimeValue> {
  const props: Record<string, NodeRuntimeValue> = {};

  for (const path of collectSchemaPaths(type.children)) {
    const child = findSchemaChildByPath(type.children, path);
    if (!child || child.kind === 'section') continue;

    const key = path.replace(/^props\./, '');
    if (child.computed) {
      const wired = resolveIncoming({ nodeId: node.id, path, label: `${node.title}.${key}` }, schemaChildValueType(child));
      assignPropValue(props, key, wired !== undefined ? wired : entityFieldValue(node, type, child, path, context));
    } else {
      assignPropValue(props, key, entityFieldValue(node, type, child, path, context));
    }
  }

  return props;
}

function assignPropValue(props: Record<string, NodeRuntimeValue>, key: string, value: NodeRuntimeValue) {
  props[key] = value;

  const segments = key.split('.').filter(Boolean);
  if (segments.length < 2 || segments.some(segment => !isSafeIdentifier(segment))) return;

  let cursor: Record<string, NodeRuntimeValue> = props;
  for (const segment of segments.slice(0, -1)) {
    const existing = cursor[segment];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, NodeRuntimeValue>;
  }

  cursor[segments[segments.length - 1]] = value;
}

function getPropValue(props: Record<string, NodeRuntimeValue>, key: string): NodeRuntimeValue {
  const nestedValue = getNestedPropValue(props, key);
  if (nestedValue !== undefined) return nestedValue;

  if (Object.prototype.hasOwnProperty.call(props, key)) return props[key];

  return undefined;
}

function getNestedPropValue(props: Record<string, NodeRuntimeValue>, key: string): NodeRuntimeValue {
  const segments = key.split('.').filter(Boolean);
  if (segments.length < 2 || segments.some(segment => !isSafeIdentifier(segment))) return undefined;

  let cursor: NodeRuntimeValue = props;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, NodeRuntimeValue>)[segment];
  }

  return cursor;
}

function collectPropWriteRules(children: SchemaChild[], pathPrefix = 'props'): Record<string, PropWriteRule> {
  const rules: Record<string, PropWriteRule> = {};

  for (const child of children) {
    const path = `${pathPrefix}.${child.name || child.kind}`;
    if (child.kind === 'section') {
      Object.assign(rules, collectPropWriteRules(child.children, path));
      continue;
    }

    rules[path.replace(/^props\./, '')] = { computed: child.computed };
  }

  return rules;
}

function validatePropWrites(
  expression: string,
  propRules?: Record<string, PropWriteRule>
): TransformPreviewDiagnostic[] {
  if (!propRules) return [];

  const diagnostics: TransformPreviewDiagnostic[] = [];
  const seen = new Set<string>();
  for (const key of collectPropWritePaths(expression)) {
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const rule = propRules[key];
    if (!rule) {
      diagnostics.push({
        level: 'error',
        message: `Cannot assign props.${key}; it is not a field on this type.`,
      });
      continue;
    }

    if (!rule.computed) {
      diagnostics.push({
        level: 'error',
        message: `Cannot assign props.${key}; it is user-editable. Mark the field computed before writing it in method code.`,
      });
    }
  }

  return diagnostics;
}

function resolveTransformPort(
  node: TransformGraphNode,
  path: string,
  resolveIncoming: (target: NodeGraphPortRef, targetType?: NodeValueType) => NodeRuntimeValue,
  pushError: (nodeId: string, message: string) => void,
  definitions: TransformDefinition[]
): NodeRuntimeValue {
  const spec = transformSpec(node, definitions);
  const inputValues: Record<string, NodeRuntimeValue> = {};

  for (const input of spec.inputs) {
    inputValues[input.name] = resolveIncoming({ nodeId: node.id, path: input.name, label: `${node.title}.${input.name}` }, input.valueType);
  }

  try {
    const result = executeTransformExpression(spec.expression, inputValues);
    return resolveTransformOutputValue(result, path, spec.outputs);
  } catch (error) {
    pushError(node.id, error instanceof Error ? error.message : 'Transform failed');
    return undefined;
  }
}

export function executeTransformExpression(
  expression: string,
  inputs: Record<string, NodeRuntimeValue>,
  context: Partial<FunctionScriptContext> = {}
): any {
  const props = context.props ?? context.target?.props ?? {};
  const scriptContext: FunctionScriptContext = {
    inputs,
    outputs: context.outputs ?? {},
    props,
    chart: createChartScriptHelpers(),
    target: context.target,
  };
  if (!hasExplicitReturn(expression)) {
    throw new Error('JavaScript must include a return statement.');
  }
  const fn = new Function('scope', 'inputs', 'outputs', 'props', 'target', 'chart', expression);
  return fn(
    scriptContext,
    scriptContext.inputs,
    scriptContext.outputs,
    scriptContext.props,
    scriptContext.target,
    scriptContext.chart
  );
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
    if (port.valueType.valueType === 'boolean') return index % 2 === 0;
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
      if (port.valueType.item.valueType === 'boolean') return [true, false, true];
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

  if (port.valueType.kind === 'chart') {
    return {
      title: port.valueType.chart === 'pie' ? 'Vote share' : 'Queue',
      data: [
        { label: 'Draft', value: ordinal * 8, color: 'var(--ne-cyan)' },
        { label: 'Review', value: ordinal * 5, color: 'var(--ne-accent)' },
        { label: 'Passed', value: ordinal * 3, color: 'var(--ne-good)' },
      ],
    };
  }

  if (port.valueType.kind === 'markdown') {
    return [
      '# Computed note',
      '',
      '- Generated from method output',
      '- Supports **bold** and *italic* text',
    ].join('\n');
  }

  return ordinal * 10;
}

const CHART_SCRIPT_PALETTE = [
  'var(--ne-cyan)',
  'var(--ne-accent)',
  'var(--ne-accent-hot)',
  'var(--ne-neutral)',
  'var(--ne-good)',
  'var(--ne-danger)',
  '#8bbcff',
  '#f5d56f',
];

const CHART_VALUE_KEYS = ['value', 'amount', 'count', 'total', 'pct', 'percentage', 'percent', 'seats', 'power', 'population'];
const CHART_LABEL_KEYS = ['label', 'name', 'title', 'id', 'key'];
const CHART_COLOR_KEYS = ['color', 'colour', 'fill'];

function createChartScriptHelpers(): ChartScriptHelpers {
  return {
    item: (label, value, color) => chartScriptItem(label, value, color),
    pie: (dataOrTitle, dataOrTitleMaybe) => chartBlockFromArgs(dataOrTitle, dataOrTitleMaybe, 'Pie'),
    pies: (...charts) => charts.map((chart, index) => chartBlockFromValue(chart, `Pie ${index + 1}`)),
    bar: (dataOrTitle, dataOrTitleMaybe) => chartBlockFromArgs(dataOrTitle, dataOrTitleMaybe, 'Bar'),
  };
}

function chartBlockFromArgs(
  dataOrTitle: NodeRuntimeValue,
  dataOrTitleMaybe: NodeRuntimeValue,
  fallbackTitle: string
): CanonicalChartBlock {
  if (typeof dataOrTitle === 'string' && dataOrTitleMaybe !== undefined) {
    return chartBlockFromValue(dataOrTitleMaybe, dataOrTitle);
  }

  const title = typeof dataOrTitleMaybe === 'string' ? dataOrTitleMaybe : fallbackTitle;
  return chartBlockFromValue(dataOrTitle, title);
}

function chartBlockFromValue(value: NodeRuntimeValue, fallbackTitle: string): CanonicalChartBlock {
  if (isChartRecord(value) && Array.isArray(value.data)) {
    return {
      title: stringFromChartRecord(value, ['title', 'name', 'label']) ?? fallbackTitle,
      data: normalizeChartScriptItems(value.data),
    };
  }

  return {
    title: fallbackTitle,
    data: normalizeChartScriptItems(value),
  };
}

function normalizeChartScriptItems(value: NodeRuntimeValue): CanonicalChartItem[] {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => normalizeChartScriptItem(item, index))
      .filter((item): item is CanonicalChartItem => !!item);
  }

  if (isChartRecord(value)) {
    const nested = value.data ?? value.segments ?? value.items ?? value.values ?? value.entries;
    if (Array.isArray(nested)) return normalizeChartScriptItems(nested);

    const direct = normalizeChartScriptItem(value, 0);
    if (direct) return [direct];

    return Object.entries(value)
      .map(([key, item], index) => {
        const amount = coerceChartNumber(item);
        return amount === null ? null : { label: key, value: amount, color: chartScriptColorAt(index) };
      })
      .filter((item): item is CanonicalChartItem => !!item);
  }

  const direct = normalizeChartScriptItem(value, 0);
  return direct ? [direct] : [];
}

function normalizeChartScriptItem(value: NodeRuntimeValue, index: number): CanonicalChartItem | null {
  if (Array.isArray(value)) {
    const amount = coerceChartNumber(value[1]);
    if (amount === null) return null;
    const label = runtimeValueLabel(value[0]) || `Item ${index + 1}`;
    const color = typeof value[2] === 'string' && value[2] ? value[2] : chartScriptColorAt(index);
    return { label, value: amount, color };
  }

  if (isChartRecord(value)) {
    const amount = numberFromChartRecord(value, CHART_VALUE_KEYS);
    if (amount === null) return null;
    return {
      label: stringFromChartRecord(value, CHART_LABEL_KEYS) ?? `Item ${index + 1}`,
      value: amount,
      color: stringFromChartRecord(value, CHART_COLOR_KEYS) ?? chartScriptColorAt(index),
    };
  }

  const amount = coerceChartNumber(value);
  return amount === null ? null : { label: `Item ${index + 1}`, value: amount, color: chartScriptColorAt(index) };
}

function chartScriptItem(label: string, value: NodeRuntimeValue, color = CHART_SCRIPT_PALETTE[0]): CanonicalChartItem {
  return {
    label,
    value: coerceChartNumber(value) ?? 0,
    color,
  };
}

function stringFromChartRecord(record: Record<string, NodeRuntimeValue>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }

  return null;
}

function numberFromChartRecord(record: Record<string, NodeRuntimeValue>, keys: string[]): number | null {
  for (const key of keys) {
    const amount = coerceChartNumber(record[key]);
    if (amount !== null) return amount;
  }

  return null;
}

function coerceChartNumber(value: NodeRuntimeValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isChartRecord(value: NodeRuntimeValue): value is Record<string, NodeRuntimeValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function chartScriptColorAt(index: number): string {
  return CHART_SCRIPT_PALETTE[index % CHART_SCRIPT_PALETTE.length];
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
    if (path === 'props.identity.participatesInElections') return faction.participatesInElections === true;
    if (path === 'props.support.total') return factionSupportByStratum(faction.id, regions).reduce((sum, value) => sum + value, 0);
    if (path === 'props.support.byStratum') return factionSupportByStratum(faction.id, regions);
  }

  if (binding.entityClass === 'region') {
    const region = regions.find(candidate => candidate.id === binding.entityId);
    if (!region) return undefined;

    if (path === 'props.identity.id') return region.id;
    if (path === 'props.identity.name') return region.name;
    if (path === 'props.identity.subtitle') return region.name2 ?? '';
    if (path === 'props.civic.seats') return region.seatings;
    if (path === 'props.civic.population') return region.population;
    if (path === 'props.control.factions') return region.factionControl.map(entry => entry.factionId);
    if (path === 'props.control.percentages') return region.factionControl.map(entry => entry.percentage);
    if (path === 'props.geometry.vertexCount') return region.vertices.length;
  }

  return undefined;
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

function flattenIncomingArray(values: NodeRuntimeValue[]): NodeRuntimeValue[] {
  const next: NodeRuntimeValue[] = [];
  for (const value of values) {
    if (value === undefined) continue;
    if (Array.isArray(value)) next.push(...value);
    else next.push(value);
  }
  return next;
}

function isSafeIdentifier(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}

function hasExplicitReturn(expression: string): boolean {
  return /\breturn\b/.test(expression);
}

function returnRequirementMessage(outputs: TransformPort[]): string {
  if (outputs.length === 1) {
    const outputName = outputs[0].name.trim() || 'output';
    return `JavaScript must include a return statement. With one output, return the value directly or return { ${formatObjectKey(outputName)}: value }.`;
  }

  if (outputs.length > 1) {
    return `JavaScript must include a return statement that returns an object with output keys.`;
  }

  return 'JavaScript must include a return statement.';
}

function formatObjectKey(name: string): string {
  return isSafeIdentifier(name) ? name : JSON.stringify(name);
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
