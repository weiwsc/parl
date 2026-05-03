import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type {
  EntityType,
  NodeGraphPortRef,
  TransformDefinition,
  TransformGraphNode,
  TransformPort,
} from '../../game/nodes/types';
import { createTransformPort, describeNodeValueType } from '../../game/nodes/schema';
import { transformSpec, type NodeEvaluation } from '../../game/nodes/runtime';
import { JsCodeEditor } from './JsCodeEditor';
import { NodeValueTypeEditor } from './NodeValueTypeEditor';
import { PortHandle } from './PortHandle';
import type { PortDirection, RegisterPortAnchor } from './nodeCanvasTypes';

interface TransformNodeViewProps {
  node: TransformGraphNode;
  types: EntityType[];
  transforms: TransformDefinition[];
  evaluation: NodeEvaluation;
  canEdit: boolean;
  registerPortAnchor: RegisterPortAnchor;
  onStartDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  onStartWire: (event: ReactPointerEvent<HTMLElement>, from: NodeGraphPortRef) => void;
  onCompleteWire: (event: ReactPointerEvent<HTMLElement>, to: NodeGraphPortRef) => void;
  onUpdate: (node: TransformGraphNode) => void;
  onDelete: () => void;
}

export function TransformNodeView({
  node,
  types,
  transforms,
  evaluation,
  canEdit,
  registerPortAnchor,
  onStartDrag,
  onStartWire,
  onCompleteWire,
  onUpdate,
  onDelete,
}: TransformNodeViewProps) {
  const spec = transformSpec(node, transforms);
  const usesDefinition = !!node.transformId && transforms.some(definition => definition.id === node.transformId);
  const editableSpec = canEdit && !usesDefinition;
  const errors = evaluation.errors[node.id] ?? [];
  const [codeOpen, setCodeOpen] = useState(!usesDefinition);
  const completionContext = {
    inputs: spec.inputs.map(transformPortCompletion),
    outputs: spec.outputs.map(transformPortCompletion),
  };
  const updateInput = (port: TransformPort) => onUpdate({ ...node, inputs: node.inputs.map(candidate => candidate.id === port.id ? port : candidate) });
  const updateOutput = (port: TransformPort) => onUpdate({ ...node, outputs: node.outputs.map(candidate => candidate.id === port.id ? port : candidate) });

  return (
    <div className="ne-graph-node ne-transform-node" style={{ left: node.x, top: node.y }}>
      <div className="ne-graph-node-head" onPointerDown={onStartDrag}>
        <span className="ne-kind-tag ne-kind-arr">JS</span>
        <input value={node.title} disabled={!canEdit} onChange={event => onUpdate({ ...node, title: event.target.value })} />
        {usesDefinition ? (
          <span className="ne-def-pill" title={spec.name}>DEF</span>
        ) : (
          <select
            className="ne-def-select"
            value={node.transformId ?? ''}
            disabled={!canEdit}
            title="Transform definition"
            onChange={event => {
              const transformId = event.target.value || undefined;
              const definition = transforms.find(candidate => candidate.id === transformId);
              onUpdate({ ...node, transformId, title: definition?.name ?? node.title });
              if (transformId) setCodeOpen(false);
            }}
          >
            <option value="">local</option>
            {transforms.map(definition => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
          </select>
        )}
        {canEdit && <button className="clause-btn clause-del" onClick={onDelete}>x</button>}
      </div>
      <TransformPortSection
        node={node}
        direction="input"
        ports={spec.inputs}
        typeOptions={types}
        canEdit={editableSpec}
        canConnect={canEdit}
        registerPortAnchor={registerPortAnchor}
        onStartWire={onStartWire}
        onCompleteWire={onCompleteWire}
        onUpdate={updateInput}
        onAdd={() => onUpdate({ ...node, inputs: [...node.inputs, createTransformPort('in', `input${node.inputs.length + 1}`)] })}
        onRemove={id => onUpdate({ ...node, inputs: node.inputs.filter(port => port.id !== id) })}
      />
      <TransformPortSection
        node={node}
        direction="output"
        ports={spec.outputs}
        typeOptions={types}
        canEdit={editableSpec}
        canConnect={canEdit}
        registerPortAnchor={registerPortAnchor}
        onStartWire={onStartWire}
        onCompleteWire={onCompleteWire}
        onUpdate={updateOutput}
        onAdd={() => onUpdate({ ...node, outputs: [...node.outputs, createTransformPort('out', `output${node.outputs.length + 1}`)] })}
        onRemove={id => onUpdate({ ...node, outputs: node.outputs.filter(port => port.id !== id) })}
      />
      <div className={`ne-transform-code-section${codeOpen ? ' open' : ''}`}>
        <button className="ne-transform-code-toggle" onClick={() => setCodeOpen(open => !open)}>
          <span>{codeOpen ? 'v' : '>'}</span>
          <b>CODE</b>
          {!editableSpec && <em>read-only</em>}
        </button>
        {codeOpen && (
          <JsCodeEditor
            value={spec.expression}
            disabled={!editableSpec}
            minLines={4}
            ariaLabel={`${node.title} JavaScript`}
            className="ne-transform-node-code"
            completionContext={completionContext}
            onChange={expression => onUpdate({ ...node, expression })}
          />
        )}
      </div>
      {errors.length > 0 && (
        <div className="ne-transform-errors">
          {errors.map(error => <span key={error}>{error}</span>)}
        </div>
      )}
    </div>
  );
}

function transformPortCompletion(port: TransformPort) {
  return {
    name: port.name,
    detail: describeNodeValueType(port.valueType),
  };
}

function TransformPortSection({
  node,
  direction,
  ports,
  typeOptions,
  canEdit,
  canConnect,
  registerPortAnchor,
  onStartWire,
  onCompleteWire,
  onUpdate,
  onAdd,
  onRemove,
}: {
  node: TransformGraphNode;
  direction: PortDirection;
  ports: TransformPort[];
  typeOptions: EntityType[];
  canEdit: boolean;
  canConnect: boolean;
  registerPortAnchor: RegisterPortAnchor;
  onStartWire: (event: ReactPointerEvent<HTMLElement>, from: NodeGraphPortRef) => void;
  onCompleteWire: (event: ReactPointerEvent<HTMLElement>, to: NodeGraphPortRef) => void;
  onUpdate: (port: TransformPort) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  if (ports.length === 0 && !canEdit) return null;
  const label = direction === 'input' ? 'INPUTS' : 'OUTPUTS';
  const kindClass = direction === 'input' ? 'ne-kind-prim' : 'ne-kind-ref';
  const kindLabel = direction === 'input' ? 'IN' : 'OUT';

  return (
    <div className="ne-port-section">
      <div className="ne-port-group-title">
        <span>{label}</span>
        {canEdit && <button type="button" className="ne-port-add-btn" onClick={onAdd}>+</button>}
      </div>
      {ports.map(port => {
        const graphPort: NodeGraphPortRef = { nodeId: node.id, path: port.name, label: `${node.title}.${port.name}` };
        return (
          <div key={port.id} className={`ne-transform-port-unified ne-transform-port-unified-${direction}`}>
            {direction === 'input' ? (
              <PortHandle direction="input" port={graphPort} canEdit={canConnect} registerPortAnchor={registerPortAnchor} onStartWire={onStartWire} onCompleteWire={onCompleteWire} />
            ) : <span className="ne-port-spacer" />}
            <span className={`ne-kind-tag ${kindClass}`}>{kindLabel}</span>
            <input className="ne-port-name-input" value={port.name} disabled={!canEdit} onChange={event => onUpdate({ ...port, name: event.target.value })} />
            <NodeValueTypeEditor valueType={port.valueType} typeOptions={typeOptions} disabled={!canEdit} onChange={valueType => onUpdate({ ...port, valueType })} />
            {canEdit ? <button className="clause-btn clause-del ne-port-remove-btn" onClick={() => onRemove(port.id)}>x</button> : <span />}
            {direction === 'output' ? (
              <PortHandle direction="output" port={graphPort} canEdit={canConnect} registerPortAnchor={registerPortAnchor} onStartWire={onStartWire} onCompleteWire={onCompleteWire} />
            ) : <span className="ne-port-spacer" />}
          </div>
        );
      })}
    </div>
  );
}
