import { useMemo, useState } from 'react';
import { uid } from '../../store';
import type { EntityType, TransformDefinition, TransformPort } from '../../game/nodes/types';
import { createTransformPort } from '../../game/nodes/schema';
import { previewTransformDefinition, type NodeRuntimeValue, type TransformPreviewResult } from '../../game/nodes/runtime';
import { EmptyState } from '../ui/EmptyState';
import { EditorField } from '../ui/EditorField';
import { NodeValueTypeEditor } from './NodeValueTypeEditor';

interface TransformLibraryEditorProps {
  transforms: TransformDefinition[];
  types: EntityType[];
  canEdit: boolean;
  onChange: (transforms: TransformDefinition[]) => void;
}

export function TransformLibraryEditor({ transforms, types, canEdit, onChange }: TransformLibraryEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(transforms[0]?.id ?? null);
  const selected = transforms.find(transform => transform.id === selectedId) ?? transforms[0] ?? null;
  const preview = useMemo(() => selected ? previewTransformDefinition(selected) : null, [selected]);
  const previewStatus = preview ? transformPreviewStatus(preview) : null;

  const updateTransform = (updated: TransformDefinition) => {
    onChange(transforms.map(transform => transform.id === updated.id ? updated : transform));
  };

  const addTransform = () => {
    const transform: TransformDefinition = {
      id: uid('transform'),
      name: 'New Transform',
      description: '',
      inputs: [createTransformPort('in', 'input')],
      outputs: [createTransformPort('out', 'output')],
      expression: 'return { output: input };',
    };
    onChange([...transforms, transform]);
    setSelectedId(transform.id);
  };

  const deleteTransform = (id: string) => {
    const next = transforms.filter(transform => transform.id !== id);
    onChange(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  return (
    <div className="ne-transform-editor">
      <div className="ne-transform-list">
        <div className="ne-transform-list-head">
          <span>LIBRARY</span>
          {canEdit && <button className="small ghost" onClick={addTransform}>+ Transform</button>}
        </div>
        {transforms.length === 0 ? (
          <EmptyState>No transforms defined.</EmptyState>
        ) : transforms.map(transform => (
          <button
            key={transform.id}
            className={`ne-transform-item${selected?.id === transform.id ? ' active' : ''}`}
            onClick={() => setSelectedId(transform.id)}
          >
            <span className="ne-kind-tag ne-kind-arr">JS</span>
            <span className="ne-transform-item-name">{transform.name}</span>
            <span className="ne-transform-item-count">{transform.inputs.length}↓ {transform.outputs.length}↑</span>
          </button>
        ))}
      </div>

      {selected ? (
        <div className="ne-transform-detail">
          <EditorField label="NAME">
            <input
              className="law-field-input"
              value={selected.name}
              disabled={!canEdit}
              onChange={event => updateTransform({ ...selected, name: event.target.value })}
            />
          </EditorField>
          <EditorField label="DESCRIPTION" optional="(optional)">
            <input
              className="law-field-input"
              value={selected.description ?? ''}
              disabled={!canEdit}
              onChange={event => updateTransform({ ...selected, description: event.target.value || undefined })}
            />
          </EditorField>

          <div className="ne-transform-editor-ports">
            <TransformDefinitionPorts
              title="INPUTS"
              direction="input"
              ports={selected.inputs}
              types={types}
              canEdit={canEdit}
              onAdd={() => updateTransform({ ...selected, inputs: [...selected.inputs, createTransformPort('in', `input${selected.inputs.length + 1}`)] })}
              onUpdate={port => updateTransform({ ...selected, inputs: selected.inputs.map(candidate => candidate.id === port.id ? port : candidate) })}
              onRemove={id => updateTransform({ ...selected, inputs: selected.inputs.filter(port => port.id !== id) })}
            />
            <TransformDefinitionPorts
              title="OUTPUTS"
              direction="output"
              ports={selected.outputs}
              types={types}
              canEdit={canEdit}
              onAdd={() => updateTransform({ ...selected, outputs: [...selected.outputs, createTransformPort('out', `output${selected.outputs.length + 1}`)] })}
              onUpdate={port => updateTransform({ ...selected, outputs: selected.outputs.map(candidate => candidate.id === port.id ? port : candidate) })}
              onRemove={id => updateTransform({ ...selected, outputs: selected.outputs.filter(port => port.id !== id) })}
            />
          </div>

          <EditorField label="JAVASCRIPT" optional={transformReturnHint(selected)}>
            <div className={`ne-transform-js-editor ne-transform-js-editor-${previewStatus?.level ?? 'info'}`}>
              <div className="ne-transform-js-toolbar">
                {previewStatus && (
                  <span className={`ne-transform-js-status ne-transform-js-status-${previewStatus.level}`}>
                    {previewStatus.label}
                  </span>
                )}
                <span className="ne-transform-js-vars">
                  {preview?.availableVariables.length ? preview.availableVariables.join(', ') : 'no input variables'}
                </span>
              </div>
              <textarea
                className="ne-transform-library-code"
                value={selected.expression}
                disabled={!canEdit}
                spellCheck={false}
                onChange={event => updateTransform({ ...selected, expression: event.target.value })}
              />
            </div>
          </EditorField>

          {preview && <TransformJsFeedback preview={preview} />}

          {canEdit && (
            <div className="ne-transform-detail-actions">
              <button className="small ghost danger" onClick={() => deleteTransform(selected.id)}>Delete Transform</button>
            </div>
          )}
        </div>
      ) : (
        <div className="ne-empty-pane"><EmptyState>Select or create a transform.</EmptyState></div>
      )}
    </div>
  );
}

function TransformJsFeedback({ preview }: { preview: TransformPreviewResult }) {
  return (
    <div className="ne-transform-js-feedback">
      {preview.diagnostics.length > 0 && (
        <div className="ne-transform-diagnostics">
          {preview.diagnostics.map((diagnostic, index) => (
            <div key={`${diagnostic.level}-${index}`} className={`ne-transform-diagnostic ne-transform-diagnostic-${diagnostic.level}`}>
              <span>{diagnostic.level}</span>
              <p>{diagnostic.message}</p>
            </div>
          ))}
        </div>
      )}

      <div className="ne-transform-preview-grid">
        <PreviewRecord title="SAMPLE INPUTS" values={preview.inputs} />
        <PreviewValue title="RETURN VALUE" value={preview.result} />
        <PreviewRecord title="PREVIEW OUTPUTS" values={preview.outputs} />
      </div>
    </div>
  );
}

function PreviewRecord({ title, values }: { title: string; values: Record<string, NodeRuntimeValue> }) {
  const entries = Object.entries(values);

  return (
    <div className="ne-transform-preview-panel">
      <div className="ne-transform-preview-title">{title}</div>
      {entries.length === 0 ? (
        <div className="ne-transform-preview-empty">none</div>
      ) : entries.map(([name, value], index) => (
        <div key={`${name}-${index}`} className="ne-transform-preview-row">
          <span>{name || '(empty)'}</span>
          <code>{formatPreviewValue(value)}</code>
        </div>
      ))}
    </div>
  );
}

function PreviewValue({ title, value }: { title: string; value: NodeRuntimeValue }) {
  return (
    <div className="ne-transform-preview-panel">
      <div className="ne-transform-preview-title">{title}</div>
      <pre className="ne-transform-preview-code">{formatPreviewValue(value)}</pre>
    </div>
  );
}

function TransformDefinitionPorts({
  title,
  direction,
  ports,
  types,
  canEdit,
  onAdd,
  onUpdate,
  onRemove,
}: {
  title: string;
  direction: 'input' | 'output';
  ports: TransformPort[];
  types: EntityType[];
  canEdit: boolean;
  onAdd: () => void;
  onUpdate: (port: TransformPort) => void;
  onRemove: (id: string) => void;
}) {
  const kindClass = direction === 'input' ? 'ne-kind-prim' : 'ne-kind-ref';
  const kindLabel = direction === 'input' ? 'IN' : 'OUT';

  return (
    <div className="ne-transform-def-port-section ne-port-section">
      <div className="ne-port-group-title">
        {title}
        {canEdit && <button className="clause-btn" onClick={onAdd}>+</button>}
      </div>
      {ports.map(port => (
        <div key={port.id} className={`ne-transform-port-unified ne-transform-port-unified-${direction}`}>
          <span className="ne-port-spacer" />
          <span className={`ne-kind-tag ${kindClass}`}>{kindLabel}</span>
          <input
            className="ne-port-name-input"
            value={port.name}
            disabled={!canEdit}
            onChange={event => onUpdate({ ...port, name: event.target.value })}
          />
          <NodeValueTypeEditor
            valueType={port.valueType}
            typeOptions={types}
            disabled={!canEdit}
            onChange={valueType => onUpdate({ ...port, valueType })}
          />
          {canEdit
            ? <button className="clause-btn clause-del" onClick={() => onRemove(port.id)}>x</button>
            : <span />
          }
          <span className="ne-port-spacer" />
        </div>
      ))}
    </div>
  );
}

function transformPreviewStatus(preview: TransformPreviewResult): { level: 'error' | 'warning' | 'info'; label: string } {
  const errorCount = preview.diagnostics.filter(diagnostic => diagnostic.level === 'error').length;
  if (errorCount > 0) return { level: 'error', label: `${errorCount} error${errorCount === 1 ? '' : 's'}` };

  const warningCount = preview.diagnostics.filter(diagnostic => diagnostic.level === 'warning').length;
  if (warningCount > 0) return { level: 'warning', label: `${warningCount} warning${warningCount === 1 ? '' : 's'}` };

  return { level: 'info', label: 'preview ok' };
}

function transformReturnHint(definition: TransformDefinition): string {
  const outputNames = definition.outputs.map(port => port.name.trim()).filter(Boolean);
  if (outputNames.length === 0) return 'return value';

  if (outputNames.length === 1) {
    return `return value or { ${formatObjectKey(outputNames[0])}: value }`;
  }

  return `return { ${outputNames.map(name => `${formatObjectKey(name)}: value`).join(', ')} }`;
}

function formatObjectKey(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function formatPreviewValue(value: NodeRuntimeValue): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);

  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
