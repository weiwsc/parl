import { useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import type {
  EntityType,
  SchemaArray,
  SchemaChild,
  SchemaPrimitive,
  SchemaReference,
  SchemaSection,
  SchemaValueType,
} from '../../game/nodes/types';
import {
  addChild,
  describeArrayItem,
  describeSchemaChildType,
  moveChild,
  moveChildInTree,
  moveChildToParentEnd,
  newArray,
  newPrimitive,
  newReference,
  newSection,
  removeChild,
  updateChild,
} from '../../game/nodes/schema';

interface NodeProps {
  node: SchemaChild;
  index: number;
  total: number;
  depth: number;
  pathPrefix: string;
  typeOptions: EntityType[];
  readOnly: boolean;
  onUpdate: (updated: SchemaChild) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onReorder: (draggedId: string, targetId: string) => void;
  onAppend: (draggedId: string, parentId: string | null) => void;
}

export function SchemaNodeEditor(props: NodeProps) {
  if (props.node.kind === 'section') return <SectionEditor {...props} node={props.node} />;
  if (props.node.kind === 'reference') return <ReferenceEditor {...props} node={props.node} />;
  if (props.node.kind === 'array') return <ArrayEditor {...props} node={props.node} />;
  return <PrimitiveEditor {...props} node={props.node} />;
}

function NodeShell({
  node,
  className,
  readOnly,
  onReorder,
  children,
}: Pick<NodeProps, 'node' | 'readOnly' | 'onReorder'> & { className: string; children: ReactNode }) {
  return (
    <div
      className={`ne-node ${className}`}
      onDragOver={event => {
        if (readOnly) return;
        if (hasSchemaDrag(event)) event.preventDefault();
      }}
      onDrop={event => {
        if (readOnly) return;
        const draggedId = getSchemaDragId(event);
        if (!draggedId) return;
        event.preventDefault();
        event.stopPropagation();
        onReorder(draggedId, node.id);
      }}
    >
      {children}
    </div>
  );
}

function PrimitiveEditor({
  node, index, total, pathPrefix, readOnly, onUpdate, onRemove, onMove, onReorder,
}: NodeProps & { node: SchemaPrimitive }) {
  const path = `${pathPrefix}.${node.name}`;

  return (
    <NodeShell node={node} className="ne-primitive" readOnly={readOnly} onReorder={onReorder}>
      <div className="ne-node-head">
        <DragHandle nodeId={node.id} readOnly={readOnly} />
        <span className="ne-kind-tag ne-kind-prim">P</span>
        {node.computed && <span className="ne-port-dot" title="Computed — can receive wire input">◉</span>}
        <NameInput node={node} readOnly={readOnly} onUpdate={onUpdate} />
        <select
          className="ne-type-select"
          value={node.valueType}
          disabled={readOnly}
          onChange={event => onUpdate({ ...node, valueType: event.target.value as SchemaValueType })}
        >
          <option value="number">number</option>
          <option value="string">string</option>
        </select>
        <ComputedToggle checked={node.computed} disabled={readOnly} onChange={computed => onUpdate({ ...node, computed })} />
        <NodeActions index={index} total={total} readOnly={readOnly} onMove={onMove} onRemove={onRemove} />
      </div>
      <FieldMeta
        node={node}
        readOnly={readOnly}
        typeLabel={describeSchemaChildType(node)}
        path={path}
        onDescription={description => onUpdate({ ...node, description })}
      />
    </NodeShell>
  );
}

function ReferenceEditor({
  node, index, total, pathPrefix, typeOptions, readOnly, onUpdate, onRemove, onMove, onReorder,
}: NodeProps & { node: SchemaReference }) {
  const path = `${pathPrefix}.${node.name}`;

  return (
    <NodeShell node={node} className="ne-reference" readOnly={readOnly} onReorder={onReorder}>
      <div className="ne-node-head">
        <DragHandle nodeId={node.id} readOnly={readOnly} />
        <span className="ne-kind-tag ne-kind-ref">R</span>
        {node.computed && <span className="ne-port-dot" title="Computed — can receive wire input">◉</span>}
        <NameInput node={node} readOnly={readOnly} onUpdate={onUpdate} />
        <TypeReferenceSelect
          value={node.typeId}
          typeOptions={typeOptions}
          disabled={readOnly}
          onChange={typeId => onUpdate({ ...node, typeId })}
        />
        <ComputedToggle checked={node.computed} disabled={readOnly} onChange={computed => onUpdate({ ...node, computed })} />
        <NodeActions index={index} total={total} readOnly={readOnly} onMove={onMove} onRemove={onRemove} />
      </div>
      <FieldMeta
        node={node}
        readOnly={readOnly}
        typeLabel={describeSchemaChildType(node)}
        path={path}
        onDescription={description => onUpdate({ ...node, description })}
      />
    </NodeShell>
  );
}

function ArrayEditor({
  node, index, total, pathPrefix, typeOptions, readOnly, onUpdate, onRemove, onMove, onReorder,
}: NodeProps & { node: SchemaArray }) {
  const path = `${pathPrefix}.${node.name}`;
  const itemKind = node.item.kind;

  return (
    <NodeShell node={node} className="ne-array" readOnly={readOnly} onReorder={onReorder}>
      <div className="ne-node-head">
        <DragHandle nodeId={node.id} readOnly={readOnly} />
        <span className="ne-kind-tag ne-kind-arr">[]</span>
        {node.computed && <span className="ne-port-dot" title="Computed — can receive wire input">◉</span>}
        <NameInput node={node} readOnly={readOnly} onUpdate={onUpdate} />
        <select
          className="ne-type-select"
          value={itemKind}
          disabled={readOnly}
          onChange={event => {
            const nextKind = event.target.value;
            onUpdate({
              ...node,
              item: nextKind === 'reference'
                ? { kind: 'reference', typeId: typeOptions[0]?.id ?? '' }
                : { kind: 'primitive', valueType: 'number' },
            });
          }}
        >
          <option value="primitive">primitive[]</option>
          <option value="reference">reference[]</option>
        </select>
        {node.item.kind === 'primitive' ? (
          <select
            className="ne-type-select"
            value={node.item.valueType}
            disabled={readOnly}
            onChange={event => onUpdate({ ...node, item: { kind: 'primitive', valueType: event.target.value as SchemaValueType } })}
          >
            <option value="number">number</option>
            <option value="string">string</option>
          </select>
        ) : (
          <TypeReferenceSelect
            value={node.item.typeId}
            typeOptions={typeOptions}
            disabled={readOnly}
            onChange={typeId => onUpdate({ ...node, item: { kind: 'reference', typeId } })}
          />
        )}
        <ComputedToggle checked={node.computed} disabled={readOnly} onChange={computed => onUpdate({ ...node, computed })} />
        <NodeActions index={index} total={total} readOnly={readOnly} onMove={onMove} onRemove={onRemove} />
      </div>
      <FieldMeta
        node={node}
        readOnly={readOnly}
        typeLabel={`array<${describeArrayItem(node.item)}>`}
        path={path}
        onDescription={description => onUpdate({ ...node, description })}
      />
    </NodeShell>
  );
}

function SectionEditor({
  node, index, total, depth, pathPrefix, typeOptions, readOnly, onUpdate, onRemove, onMove, onReorder, onAppend,
}: NodeProps & { node: SchemaSection }) {
  const [expanded, setExpanded] = useState(true);
  const sectionPath = `${pathPrefix}.${node.name}`;
  const updateChildren = (next: SchemaChild[]) => onUpdate({ ...node, children: next });

  return (
    <NodeShell node={node} className={`ne-section${expanded ? ' ne-expanded' : ''}`} readOnly={readOnly} onReorder={onReorder}>
      <div className="ne-node-head">
        <DragHandle nodeId={node.id} readOnly={readOnly} />
        <button className="ne-expand-btn clause-btn" onClick={() => setExpanded(expand => !expand)}>
          {expanded ? '▾' : '▸'}
        </button>
        <span className="ne-kind-tag ne-kind-sec">§</span>
        <NameInput node={node} readOnly={readOnly} onUpdate={onUpdate} placeholder="section name" />
        <input
          className="ne-desc-input"
          value={node.description ?? ''}
          disabled={readOnly}
          onChange={event => onUpdate({ ...node, description: event.target.value || undefined })}
          placeholder="description (optional)"
        />
        <NodeActions index={index} total={total} readOnly={readOnly} onMove={onMove} onRemove={onRemove} />
      </div>
      {expanded && (
        <div className="ne-node-body" style={{ paddingLeft: `${(depth + 1) * 14}px` }}>
          <SchemaChildList
            children={node.children}
            pathPrefix={sectionPath}
            depth={depth + 1}
            typeOptions={typeOptions}
            readOnly={readOnly}
            onChange={updateChildren}
            onReorder={onReorder}
            onAppend={onAppend}
            parentId={node.id}
          />
        </div>
      )}
    </NodeShell>
  );
}

interface SchemaChildListProps {
  children: SchemaChild[];
  pathPrefix: string;
  depth: number;
  typeOptions: EntityType[];
  readOnly: boolean;
  onChange: (children: SchemaChild[]) => void;
  onReorder: (draggedId: string, targetId: string) => void;
  onAppend: (draggedId: string, parentId: string | null) => void;
  parentId: string | null;
}

function SchemaChildList({ children, pathPrefix, depth, typeOptions, readOnly, onChange, onReorder, onAppend, parentId }: SchemaChildListProps) {
  const firstTypeId = typeOptions[0]?.id ?? '';
  const appendDragged = (event: DragEvent<HTMLElement>) => {
    if (readOnly) return;
    const draggedId = getSchemaDragId(event);
    if (!draggedId) return;
    event.preventDefault();
    event.stopPropagation();
    onAppend(draggedId, parentId);
  };

  return (
    <div
      className={depth === 0 ? 'ne-child-list ne-child-list-root' : 'ne-child-list'}
      onDragOver={event => {
        if (readOnly) return;
        if (hasSchemaDrag(event)) event.preventDefault();
      }}
      onDrop={event => {
        appendDragged(event);
      }}
    >
      {!readOnly && (
        <div
          className="ne-drop-zone"
          onDragOver={event => {
            if (hasSchemaDrag(event)) event.preventDefault();
          }}
          onDrop={appendDragged}
        >
          Drop here to move into {depth === 0 ? 'root' : 'this section'}
        </div>
      )}
      {children.length === 0 && (
        <div className="ne-schema-empty">No fields yet. Add or drop a component here.</div>
      )}
      {children.map((child, index) => (
        <SchemaNodeEditor
          key={child.id}
          node={child}
          index={index}
          total={children.length}
          depth={depth}
          pathPrefix={pathPrefix}
          typeOptions={typeOptions}
          readOnly={readOnly}
          onUpdate={updated => onChange(updateChild(children, updated))}
          onRemove={() => onChange(removeChild(children, child.id))}
          onMove={dir => onChange(moveChild(children, child.id, dir))}
          onReorder={onReorder}
          onAppend={onAppend}
        />
      ))}
      {!readOnly && (
        <div className={depth === 0 ? 'ne-root-add' : 'ne-add-row'}>
          <button className="small ghost" onClick={() => onChange(addChild(children, newSection()))}>+ Section</button>
          <button className="small ghost" onClick={() => onChange(addChild(children, newPrimitive()))}>+ Primitive</button>
          <button className="small ghost" onClick={() => onChange(addChild(children, newReference(firstTypeId)))}>+ Reference</button>
          <button className="small ghost" onClick={() => onChange(addChild(children, newArray(firstTypeId)))}>+ Array</button>
        </div>
      )}
    </div>
  );
}

function DragHandle({ nodeId, readOnly }: { nodeId: string; readOnly: boolean }) {
  return (
    <span
      className={`ne-drag-handle${readOnly ? ' disabled' : ''}`}
      title="Drag to reorder"
      draggable={!readOnly}
      onDragStart={event => {
        if (readOnly) return;
        event.dataTransfer.setData('application/x-schema-child', nodeId);
        event.dataTransfer.setData('text/plain', `schema-child:${nodeId}`);
        event.dataTransfer.effectAllowed = 'move';
        event.stopPropagation();
      }}
    >
      ⋮⋮
    </span>
  );
}

function NameInput<T extends SchemaChild>({
  node,
  readOnly,
  onUpdate,
  placeholder = 'name',
}: {
  node: T;
  readOnly: boolean;
  onUpdate: (updated: T) => void;
  placeholder?: string;
}) {
  return (
    <input
      className="ne-name-input"
      value={node.name}
      disabled={readOnly}
      onChange={event => onUpdate({ ...node, name: event.target.value })}
      placeholder={placeholder}
    />
  );
}

function TypeReferenceSelect({
  value,
  typeOptions,
  disabled,
  onChange,
}: {
  value: string;
  typeOptions: EntityType[];
  disabled: boolean;
  onChange: (typeId: string) => void;
}) {
  return (
    <select className="ne-type-select ne-ref-select" value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
      <option value="">unbound</option>
      {typeOptions.map(type => (
        <option key={type.id} value={type.id}>{type.name}</option>
      ))}
    </select>
  );
}

function ComputedToggle({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="ne-computed-label" title="Mark as computed — enables wire input">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
      />
      <span>computed</span>
    </label>
  );
}

function FieldMeta({
  node,
  readOnly,
  typeLabel,
  path,
  onDescription,
}: {
  node: Exclude<SchemaChild, SchemaSection>;
  readOnly: boolean;
  typeLabel: string;
  path: string;
  onDescription: (description: string | undefined) => void;
}) {
  return (
    <div className="ne-prim-meta">
      <input
        className="ne-desc-input"
        value={node.description ?? ''}
        disabled={readOnly}
        onChange={event => onDescription(event.target.value || undefined)}
        placeholder="description (optional)"
      />
      <span className="ne-type-pill">{typeLabel}</span>
      <code className="ne-path-hint">{path}</code>
    </div>
  );
}

function NodeActions({
  index,
  total,
  readOnly,
  onMove,
  onRemove,
}: Pick<NodeProps, 'index' | 'total' | 'readOnly' | 'onMove' | 'onRemove'>) {
  if (readOnly) return null;

  return (
    <div className="ne-node-actions">
      <button className="clause-btn" onClick={() => onMove(-1)} disabled={index === 0}>↑</button>
      <button className="clause-btn" onClick={() => onMove(+1)} disabled={index === total - 1}>↓</button>
      <button className="clause-btn clause-del" onClick={onRemove}>✕</button>
    </div>
  );
}

interface SchemaEditorProps {
  children: SchemaChild[];
  typeOptions: EntityType[];
  readOnly?: boolean;
  onChange: (children: SchemaChild[]) => void;
}

export function SchemaEditor({ children, typeOptions, readOnly = false, onChange }: SchemaEditorProps) {
  const handleRootDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    if (hasSchemaDrag(event)) event.preventDefault();
  };

  return (
    <div className="ne-schema-editor" onDragOver={handleRootDragOver}>
      <SchemaChildList
        children={children}
        pathPrefix="props"
        depth={0}
        typeOptions={typeOptions}
        readOnly={readOnly}
        onChange={onChange}
        onReorder={(draggedId, targetId) => onChange(moveChildInTree(children, draggedId, targetId))}
        onAppend={(draggedId, parentId) => onChange(moveChildToParentEnd(children, draggedId, parentId))}
        parentId={null}
      />
    </div>
  );
}

function hasSchemaDrag(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.types.includes('application/x-schema-child') || event.dataTransfer.types.includes('text/plain');
}

function getSchemaDragId(event: DragEvent<HTMLElement>): string {
  const custom = event.dataTransfer.getData('application/x-schema-child');
  if (custom) return custom;

  const text = event.dataTransfer.getData('text/plain');
  return text.startsWith('schema-child:') ? text.replace('schema-child:', '') : '';
}
