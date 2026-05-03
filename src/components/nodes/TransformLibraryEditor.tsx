import { useEffect, useMemo, useState } from 'react';
import { uid } from '../../store';
import type { EntityType, TransformDefinition, TransformPort } from '../../game/nodes/types';
import { createTransformPort, describeNodeValueType } from '../../game/nodes/schema';
import { previewTransformDefinition, type NodeRuntimeValue, type TransformPreviewResult } from '../../game/nodes/runtime';
import { EmptyState } from '../ui/EmptyState';
import { EditorField } from '../ui/EditorField';
import { JsCodeEditor } from './JsCodeEditor';
import type { JsCodeCompletionItem } from './JsCodeEditor';
import { NodeValueTypeEditor } from './NodeValueTypeEditor';

interface TransformLibraryEditorProps {
  transforms: TransformDefinition[];
  types: EntityType[];
  canEdit: boolean;
  onChange: (transforms: TransformDefinition[]) => void;
  listLabel?: string;
  addLabel?: string;
  emptyLabel?: string;
  emptySelectionLabel?: string;
  deleteLabel?: string;
  newItemName?: string;
  idPrefix?: string;
  fieldCompletions?: JsCodeCompletionItem[];
  methodTargetType?: EntityType;
}

export function TransformLibraryEditor({
  transforms,
  types,
  canEdit,
  onChange,
  listLabel = 'LIBRARY',
  addLabel = '+ Transform',
  emptyLabel = 'No transforms defined.',
  emptySelectionLabel = 'Select or create a transform.',
  deleteLabel = 'Delete Transform',
  newItemName = 'New Transform',
  idPrefix = 'transform',
  fieldCompletions,
  methodTargetType,
}: TransformLibraryEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(transforms[0]?.id ?? null);
  const selected = transforms.find(transform => transform.id === selectedId) ?? transforms[0] ?? null;
  const previewProps = useMemo(() => (
    fieldCompletions?.length ? sampleFieldProps(fieldCompletions) : undefined
  ), [fieldCompletions]);
  const previewPropRules = useMemo(() => (
    fieldCompletions?.length ? propRulesFromFields(fieldCompletions) : undefined
  ), [fieldCompletions]);
  const previewTarget = useMemo(() => (
    methodTargetType
      ? { typeId: methodTargetType.id, props: previewProps ?? {} }
      : undefined
  ), [methodTargetType, previewProps]);
  const preview = useMemo(() => (
    selected
      ? previewTransformDefinition(selected, { props: previewProps, propRules: previewPropRules, target: previewTarget })
      : null
  ), [previewPropRules, previewProps, previewTarget, selected]);
  const previewStatus = preview ? transformPreviewStatus(preview) : null;

  useEffect(() => {
    if (selectedId && transforms.some(transform => transform.id === selectedId)) return;
    setSelectedId(transforms[0]?.id ?? null);
  }, [selectedId, transforms]);

  const updateTransform = (updated: TransformDefinition) => {
    onChange(transforms.map(transform => transform.id === updated.id ? updated : transform));
  };

  const addTransform = () => {
    const transform: TransformDefinition = {
      id: uid(idPrefix),
      name: newItemName,
      description: '',
      inputs: [createTransformPort('in', 'input')],
      outputs: [createTransformPort('out', 'output')],
      expression: 'return inputs.input;',
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
          <span>{listLabel}</span>
          {canEdit && <button className="small ghost" onClick={addTransform}>{addLabel}</button>}
        </div>
        {transforms.length === 0 ? (
          <EmptyState>{emptyLabel}</EmptyState>
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

          <EditorField label="JAVASCRIPT" optional={transformReturnHint(selected, !!fieldCompletions?.length)}>
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
              <JsCodeEditor
                value={selected.expression}
                disabled={!canEdit}
                minLines={10}
                ariaLabel={`${selected.name} JavaScript`}
                className="ne-transform-library-code-editor"
                completionContext={{
                  inputs: selected.inputs.map(transformPortCompletion),
                  outputs: selected.outputs.map(transformPortCompletion),
                  fields: fieldCompletions,
                }}
                onChange={expression => updateTransform({ ...selected, expression })}
              />
            </div>
          </EditorField>

          {preview && <TransformJsFeedback preview={preview} />}

          {canEdit && (
            <div className="ne-transform-detail-actions">
              <button className="small ghost danger" onClick={() => deleteTransform(selected.id)}>{deleteLabel}</button>
            </div>
          )}
        </div>
      ) : (
        <div className="ne-empty-pane"><EmptyState>{emptySelectionLabel}</EmptyState></div>
      )}
    </div>
  );
}

function transformPortCompletion(port: TransformPort): JsCodeCompletionItem {
  return {
    name: port.name,
    detail: describeNodeValueType(port.valueType),
  };
}

function sampleFieldProps(fields: JsCodeCompletionItem[]): Record<string, NodeRuntimeValue> {
  const props: Record<string, NodeRuntimeValue> = {};
  for (const field of fields) {
    assignPreviewPropValue(props, field.name, sampleFieldValue(field.detail));
  }
  return props;
}

function propRulesFromFields(fields: JsCodeCompletionItem[]) {
  return Object.fromEntries(fields.map(field => [field.name, { computed: !!field.computed }]));
}

function assignPreviewPropValue(props: Record<string, NodeRuntimeValue>, key: string, value: NodeRuntimeValue) {
  props[key] = value;

  const segments = key.split('.').filter(Boolean);
  if (segments.length < 2 || segments.some(segment => !isIdentifier(segment))) return;

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

function sampleFieldValue(detail?: string): NodeRuntimeValue {
  if (detail === 'string') return 'sample';
  if (detail?.startsWith('array')) return [];
  if (detail?.startsWith('ref:')) return { typeId: detail.slice(4), nodeId: 'sample', values: {} };
  if (detail === 'pie chart' || detail === 'bar chart') {
    return {
      title: detail === 'pie chart' ? 'Vote share' : 'Queue',
      data: [
        { label: 'Draft', value: 42, color: 'var(--cyan)' },
        { label: 'Review', value: 28, color: 'var(--accent)' },
        { label: 'Passed', value: 19, color: 'var(--good)' },
      ],
    };
  }
  if (detail === 'markdown') return '# Note\n\n- Computed markdown';
  return 10;
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
        <span>{title}</span>
        {canEdit && <button type="button" className="ne-port-add-btn" onClick={onAdd}>+</button>}
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

function transformReturnHint(definition: TransformDefinition, hasProps = false): string {
  const scopeHint = hasProps ? 'inputs/props' : 'inputs';
  const outputNames = definition.outputs.map(port => port.name.trim()).filter(Boolean);
  if (outputNames.length === 0) return `return required; ${scopeHint}`;

  if (outputNames.length === 1) {
    return `return required; ${scopeHint}; value or { ${formatObjectKey(outputNames[0])}: value }`;
  }

  return `return required; ${scopeHint}; { ${outputNames.map(name => `${formatObjectKey(name)}: value`).join(', ')} }`;
}

function formatObjectKey(name: string): string {
  return isIdentifier(name) ? name : JSON.stringify(name);
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
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
