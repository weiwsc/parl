import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Faction, MapRegion } from '../../models/types';
import type {
  EntityType,
  NodeGraphNode,
  NodeGraphPortRef,
  NodeInstanceValue,
  SchemaChild,
  SchemaFieldChild,
  SchemaSection,
  TransformPort,
  TypeMethodDefinition,
} from '../../game/nodes/types';
import { isMethodAssignedPropPath } from '../../game/nodes/methodWrites';
import { describeNodeValueType, describeSchemaChildType } from '../../game/nodes/schema';
import { runtimeValueLabel, type NodeEvaluation, type NodeRuntimeValue } from '../../game/nodes/runtime';
import { ComputedValueView } from './ComputedValueView';
import { NodeValueTypeEditor } from './NodeValueTypeEditor';
import { PortHandle } from './PortHandle';
import type { PortDirection, RegisterPortAnchor } from './nodeCanvasTypes';
import {
  cleanValues,
  emptyValueLabel,
  fieldKindClass,
  fieldKindLabel,
  getBindingOptions,
  portKey,
} from './nodeCanvasUtils';

interface EntityNodeViewProps {
  node: Extract<NodeGraphNode, { kind: 'entity' }>;
  type?: EntityType;
  types: EntityType[];
  factions: Faction[];
  regions: MapRegion[];
  evaluation: NodeEvaluation;
  canEdit: boolean;
  registerPortAnchor: RegisterPortAnchor;
  onStartDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  onStartWire: (event: ReactPointerEvent<HTMLElement>, from: NodeGraphPortRef) => void;
  onCompleteWire: (event: ReactPointerEvent<HTMLElement>, to: NodeGraphPortRef) => void;
  onUpdate: (node: Extract<NodeGraphNode, { kind: 'entity' }>) => void;
  onDelete: () => void;
}

export function EntityNodeView({
  node,
  type,
  types,
  factions,
  regions,
  evaluation,
  canEdit,
  registerPortAnchor,
  onStartDrag,
  onStartWire,
  onCompleteWire,
  onUpdate,
  onDelete,
}: EntityNodeViewProps) {
  const bindingOptions = type ? getBindingOptions(type, factions, regions) : [];
  const bound = bindingOptions.find(option => option.id === node.binding?.entityId);

  const updateBinding = (entityId: string) => {
    if (!type?.entityClass || !entityId) {
      onUpdate({ ...node, binding: undefined });
      return;
    }

    const option = bindingOptions.find(candidate => candidate.id === entityId);
    onUpdate({ ...node, title: option?.label ?? node.title, binding: { entityClass: type.entityClass, entityId } });
  };

  const updateValue = (path: string, value: NodeInstanceValue) => {
    onUpdate({ ...node, values: cleanValues({ ...(node.values ?? {}), [path]: value }) });
  };

  return (
    <div className="ne-graph-node ne-entity-node" style={{ left: node.x, top: node.y }}>
      <div className="ne-graph-node-head" onPointerDown={onStartDrag}>
        <span className="ne-kind-tag ne-kind-ref">TYPE</span>
        <input value={node.title} disabled={!canEdit} onChange={event => onUpdate({ ...node, title: event.target.value })} />
        {type && <span className="ne-entity-badge" title={type.description ?? type.name}>{type.name}</span>}
        {canEdit && <button className="clause-btn clause-del" onClick={onDelete}>x</button>}
      </div>
      {type?.entityClass && (
        <div className="ne-binding-panel">
          <label className="ne-binding-row">
            <span>BIND</span>
            <select value={node.binding?.entityId ?? ''} disabled={!canEdit} onChange={event => updateBinding(event.target.value)}>
              <option value="">unbound {type.entityClass}</option>
              {bindingOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          {bound && (
            <div className="ne-binding-preview">
              <span className="ne-binding-color" style={{ background: bound.color ?? 'var(--ne-line)' }} />
              <div className="ne-binding-main">
                <b>{bound.label}</b>
                <small>{bound.subtitle}</small>
              </div>
              {bound.stats.map(stat => <span key={stat.label} className="ne-binding-stat">{stat.label}: {stat.value}</span>)}
            </div>
          )}
        </div>
      )}
      {type ? (
        <InstanceSchemaView
          node={node}
          type={type}
          children={type.children}
          pathPrefix="props"
          depth={0}
          factions={factions}
          regions={regions}
          evaluation={evaluation}
          canEdit={canEdit}
          registerPortAnchor={registerPortAnchor}
          onStartWire={onStartWire}
          onCompleteWire={onCompleteWire}
          onValueChange={updateValue}
        />
      ) : (
        <div className="ne-node-missing">Missing type definition</div>
      )}
      {type?.methods?.length ? (
        <EntityMethodList
          node={node}
          methods={type.methods}
          types={types}
          canEdit={canEdit}
          registerPortAnchor={registerPortAnchor}
          onStartWire={onStartWire}
          onCompleteWire={onCompleteWire}
        />
      ) : null}
    </div>
  );
}

function InstanceSchemaView({
  node,
  type,
  children,
  pathPrefix,
  depth,
  factions,
  regions,
  evaluation,
  canEdit,
  registerPortAnchor,
  onStartWire,
  onCompleteWire,
  onValueChange,
}: {
  node: Extract<NodeGraphNode, { kind: 'entity' }>;
  type: EntityType;
  children: SchemaChild[];
  pathPrefix: string;
  depth: number;
  factions: Faction[];
  regions: MapRegion[];
  evaluation: NodeEvaluation;
  canEdit: boolean;
  registerPortAnchor: RegisterPortAnchor;
  onStartWire: (event: ReactPointerEvent<HTMLElement>, from: NodeGraphPortRef) => void;
  onCompleteWire: (event: ReactPointerEvent<HTMLElement>, to: NodeGraphPortRef) => void;
  onValueChange: (path: string, value: NodeInstanceValue) => void;
}) {
  return (
    <div className={depth === 0 ? 'ne-instance-schema' : 'ne-instance-children'}>
      {children.map(child => (
        <InstanceSchemaNode
          key={child.id}
          node={node}
          type={type}
          child={child}
          pathPrefix={pathPrefix}
          depth={depth}
          factions={factions}
          regions={regions}
          evaluation={evaluation}
          canEdit={canEdit}
          registerPortAnchor={registerPortAnchor}
          onStartWire={onStartWire}
          onCompleteWire={onCompleteWire}
          onValueChange={onValueChange}
        />
      ))}
    </div>
  );
}

function InstanceSchemaNode(props: {
  node: Extract<NodeGraphNode, { kind: 'entity' }>;
  type: EntityType;
  child: SchemaChild;
  pathPrefix: string;
  depth: number;
  factions: Faction[];
  regions: MapRegion[];
  evaluation: NodeEvaluation;
  canEdit: boolean;
  registerPortAnchor: RegisterPortAnchor;
  onStartWire: (event: ReactPointerEvent<HTMLElement>, from: NodeGraphPortRef) => void;
  onCompleteWire: (event: ReactPointerEvent<HTMLElement>, to: NodeGraphPortRef) => void;
  onValueChange: (path: string, value: NodeInstanceValue) => void;
}) {
  if (props.child.kind === 'section') return <InstanceSection {...props} child={props.child} />;
  return <InstanceField {...props} child={props.child} />;
}

function InstanceSection({
  node,
  type,
  child,
  pathPrefix,
  depth,
  factions,
  regions,
  evaluation,
  canEdit,
  registerPortAnchor,
  onStartWire,
  onCompleteWire,
  onValueChange,
}: {
  node: Extract<NodeGraphNode, { kind: 'entity' }>;
  type: EntityType;
  child: SchemaSection;
  pathPrefix: string;
  depth: number;
  factions: Faction[];
  regions: MapRegion[];
  evaluation: NodeEvaluation;
  canEdit: boolean;
  registerPortAnchor: RegisterPortAnchor;
  onStartWire: (event: ReactPointerEvent<HTMLElement>, from: NodeGraphPortRef) => void;
  onCompleteWire: (event: ReactPointerEvent<HTMLElement>, to: NodeGraphPortRef) => void;
  onValueChange: (path: string, value: NodeInstanceValue) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const sectionPath = `${pathPrefix}.${child.name}`;
  const collapsedPortRefs = collectSectionPortRefs(node, type, child.children, sectionPath);
  const registerCollapsedAnchors = (element: HTMLElement | null) => {
    collapsedPortRefs.forEach(({ direction, port }) => {
      registerPortAnchor(portKey(direction, port), element);
    });
  };

  return (
    <div className={`ne-node ne-section${expanded ? ' ne-expanded' : ''}`}>
      <div className="ne-node-head ne-instance-section-head">
        <button className="ne-expand-btn clause-btn" onClick={() => setExpanded(current => !current)}>{expanded ? 'v' : '>'}</button>
        <span className="ne-kind-tag ne-kind-sec">§</span>
        <span className="ne-instance-section-name">{child.name}</span>
        {child.description && <span className="ne-instance-desc">{child.description}</span>}
        {!expanded && collapsedPortRefs.length > 0 && (
          <span
            ref={registerCollapsedAnchors}
            className="ne-section-port-proxy"
            title={`${collapsedPortRefs.length} hidden port${collapsedPortRefs.length === 1 ? '' : 's'}`}
          />
        )}
      </div>
      {expanded && (
        <div className="ne-node-body" style={{ paddingLeft: `${(depth + 1) * 6}px` }}>
          <InstanceSchemaView
            node={node}
            type={type}
            children={child.children}
            pathPrefix={sectionPath}
            depth={depth + 1}
            factions={factions}
            regions={regions}
            evaluation={evaluation}
            canEdit={canEdit}
            registerPortAnchor={registerPortAnchor}
            onStartWire={onStartWire}
            onCompleteWire={onCompleteWire}
            onValueChange={onValueChange}
          />
        </div>
      )}
    </div>
  );
}

function EntityMethodList({
  node,
  methods,
  types,
  canEdit,
  registerPortAnchor,
  onStartWire,
  onCompleteWire,
}: {
  node: Extract<NodeGraphNode, { kind: 'entity' }>;
  methods: TypeMethodDefinition[];
  types: EntityType[];
  canEdit: boolean;
  registerPortAnchor: RegisterPortAnchor;
  onStartWire: (event: ReactPointerEvent<HTMLElement>, from: NodeGraphPortRef) => void;
  onCompleteWire: (event: ReactPointerEvent<HTMLElement>, to: NodeGraphPortRef) => void;
}) {
  return (
    <div className="ne-instance-methods">
      <div className="ne-instance-methods-head">
        <span>METHODS</span>
        <span>{methods.length}</span>
      </div>
      {methods.map(method => (
        <div key={method.id} className="ne-instance-method" title={method.description ?? method.name}>
          <div className="ne-instance-method-row">
            <span className="ne-kind-tag ne-kind-arr">JS</span>
            <span className="ne-instance-method-name">{method.name}</span>
            <span className="ne-instance-method-ports" title={methodPortTitle(method)}>
              {method.inputs.length}in {method.outputs.length}out
            </span>
          </div>
          {(method.inputs.length > 0 || method.outputs.length > 0) && (
            <div className="ne-instance-method-port-list">
              {method.inputs.map(port => (
                <MethodPortRow
                  key={`in-${port.id}`}
                  node={node}
                  method={method}
                  port={port}
                  direction="input"
                  types={types}
                  canEdit={canEdit}
                  registerPortAnchor={registerPortAnchor}
                  onStartWire={onStartWire}
                  onCompleteWire={onCompleteWire}
                />
              ))}
              {method.outputs.map(port => (
                <MethodPortRow
                  key={`out-${port.id}`}
                  node={node}
                  method={method}
                  port={port}
                  direction="output"
                  types={types}
                  canEdit={canEdit}
                  registerPortAnchor={registerPortAnchor}
                  onStartWire={onStartWire}
                  onCompleteWire={onCompleteWire}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MethodPortRow({
  node,
  method,
  port,
  direction,
  types,
  canEdit,
  registerPortAnchor,
  onStartWire,
  onCompleteWire,
}: {
  node: Extract<NodeGraphNode, { kind: 'entity' }>;
  method: TypeMethodDefinition;
  port: TransformPort;
  direction: 'input' | 'output';
  types: EntityType[];
  canEdit: boolean;
  registerPortAnchor: RegisterPortAnchor;
  onStartWire: (event: ReactPointerEvent<HTMLElement>, from: NodeGraphPortRef) => void;
  onCompleteWire: (event: ReactPointerEvent<HTMLElement>, to: NodeGraphPortRef) => void;
}) {
  const kindClass = direction === 'input' ? 'ne-kind-prim' : 'ne-kind-ref';
  const kindLabel = direction === 'input' ? 'IN' : 'OUT';
  const graphPort: NodeGraphPortRef = {
    nodeId: node.id,
    path: methodPortPath(method, direction, port),
    label: `${node.title}.${method.name}.${port.name}`,
  };

  return (
    <div className={`ne-transform-port-unified ne-instance-method-port-row ne-transform-port-unified-${direction}`}>
      {direction === 'input' ? (
        <PortHandle direction="input" port={graphPort} canEdit={canEdit} registerPortAnchor={registerPortAnchor} onStartWire={onStartWire} onCompleteWire={onCompleteWire} />
      ) : <span className="ne-port-spacer" />}
      <span className={`ne-kind-tag ${kindClass}`}>{kindLabel}</span>
      <input className="ne-port-name-input" value={port.name} disabled title={port.name} readOnly />
      <NodeValueTypeEditor
        valueType={port.valueType}
        typeOptions={types}
        disabled
        onChange={() => undefined}
      />
      <span />
      {direction === 'output' ? (
        <PortHandle direction="output" port={graphPort} canEdit={canEdit} registerPortAnchor={registerPortAnchor} onStartWire={onStartWire} onCompleteWire={onCompleteWire} />
      ) : <span className="ne-port-spacer" />}
    </div>
  );
}

function methodPortPath(method: TypeMethodDefinition, direction: 'input' | 'output', port: TransformPort): string {
  return `methods.${method.id}.${direction === 'input' ? 'inputs' : 'outputs'}.${port.name}`;
}

function methodPortTitle(method: TypeMethodDefinition): string {
  const inputs = method.inputs.map(port => `${port.name}: ${describeNodeValueType(port.valueType)}`).join(', ') || 'none';
  const outputs = method.outputs.map(port => `${port.name}: ${describeNodeValueType(port.valueType)}`).join(', ') || 'none';
  return `inputs: ${inputs}\noutputs: ${outputs}`;
}

function collectSectionPortRefs(
  node: Extract<NodeGraphNode, { kind: 'entity' }>,
  type: EntityType,
  children: SchemaChild[],
  pathPrefix: string,
): { direction: PortDirection; port: NodeGraphPortRef }[] {
  const refs: { direction: PortDirection; port: NodeGraphPortRef }[] = [];

  for (const child of children) {
    const path = `${pathPrefix}.${child.name}`;
    if (child.kind === 'section') {
      refs.push(...collectSectionPortRefs(node, type, child.children, path));
      continue;
    }

    const label = `${node.title}.${path.replace(/^props\./, '')}`;
    const port = { nodeId: node.id, path, label };
    refs.push({ direction: 'output', port });
    if (child.computed && !isMethodAssignedPropPath(type, path)) refs.push({ direction: 'input', port });
  }

  return refs;
}

function InstanceField({
  node,
  child,
  type,
  pathPrefix,
  evaluation,
  canEdit,
  registerPortAnchor,
  onStartWire,
  onCompleteWire,
  onValueChange,
}: {
  node: Extract<NodeGraphNode, { kind: 'entity' }>;
  child: SchemaFieldChild;
  type: EntityType;
  pathPrefix: string;
  evaluation: NodeEvaluation;
  canEdit: boolean;
  registerPortAnchor: RegisterPortAnchor;
  onStartWire: (event: ReactPointerEvent<HTMLElement>, from: NodeGraphPortRef) => void;
  onCompleteWire: (event: ReactPointerEvent<HTMLElement>, to: NodeGraphPortRef) => void;
  onValueChange: (path: string, value: NodeInstanceValue) => void;
}) {
  const path = `${pathPrefix}.${child.name}`;
  const displayLabel = path.replace(/^props\./, '');
  const typeLabel = describeSchemaChildType(child);
  const port: NodeGraphPortRef = { nodeId: node.id, path, label: `${node.title}.${displayLabel}` };
  const value = evaluation.values[`${node.id}:${path}`];
  const titleAttr = child.description ? `${path} - ${child.description}` : path;
  const isComputedView = child.kind === 'computedView';
  const methodOwned = child.computed && isMethodAssignedPropPath(type, path);
  const rowClass = [
    'ne-node-head',
    'ne-instance-field-row',
    isComputedView ? 'ne-instance-visual-row' : '',
    methodOwned ? 'ne-instance-field-row--method-owned' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={`ne-node ne-${isComputedView ? 'computed-view' : child.kind}${methodOwned ? ' ne-method-owned-field' : ''}`} title={titleAttr}>
      <div className={rowClass}>
        {child.computed && !methodOwned ? (
          <PortHandle direction="input" port={port} canEdit={canEdit} registerPortAnchor={registerPortAnchor} onStartWire={onStartWire} onCompleteWire={onCompleteWire} />
        ) : <span className={`ne-port-spacer${methodOwned ? ' ne-port-spacer--method-owned' : ''}`} title={methodOwned ? 'Method-owned field rejects outside wire input' : undefined} />}
        <span className={`ne-kind-tag ${fieldKindClass(child)}`}>{fieldKindLabel(child)}</span>
        <span className="ne-instance-field-name">{child.name}</span>
        <span className="ne-type-pill">{typeLabel}</span>
        <InstanceValueEditor child={child} value={value} computed={child.computed} canEdit={canEdit} onChange={next => onValueChange(path, next)} />
        <PortHandle direction="output" port={port} canEdit={canEdit} registerPortAnchor={registerPortAnchor} onStartWire={onStartWire} onCompleteWire={onCompleteWire} />
      </div>
      {isComputedView && <ComputedValueView valueType={child.valueType} value={value} />}
    </div>
  );
}

function InstanceValueEditor({
  child,
  value,
  computed,
  canEdit,
  onChange,
}: {
  child: SchemaFieldChild;
  value: NodeRuntimeValue;
  computed: boolean;
  canEdit: boolean;
  onChange: (value: NodeInstanceValue) => void;
}) {
  if (child.kind !== 'primitive' || computed) {
    const fallback = child.kind === 'primitive' ? 'computed' : emptyValueLabel(child);
    const readoutClass = `ne-value-readout${computed ? ' ne-value-readout--computed' : ''}`;
    return <span className={readoutClass}>{runtimeValueLabel(value) || fallback}</span>;
  }

  if (child.valueType === 'boolean') {
    return (
      <label className="ne-value-checkbox" title={runtimeValueLabel(value) || 'false'}>
        <input
          type="checkbox"
          checked={value === true}
          disabled={!canEdit}
          onChange={event => onChange(event.target.checked)}
        />
        <span>{value === true ? 'true' : 'false'}</span>
      </label>
    );
  }

  return (
    <input
      className="ne-value-input"
      type={child.valueType === 'number' ? 'number' : 'text'}
      value={runtimeValueLabel(value)}
      disabled={!canEdit}
      onChange={event => onChange(child.valueType === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)}
      placeholder="value"
    />
  );
}
