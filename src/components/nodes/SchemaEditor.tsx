import { useState } from 'react';
import type { SchemaChild, SchemaSection, SchemaPrimitive, SchemaValueType } from '../../game/nodes/types';
import { newSection, newPrimitive, addChild, removeChild, updateChild, moveChild } from '../../game/nodes/schema';

interface NodeProps {
  node: SchemaChild;
  index: number;
  total: number;
  depth: number;
  pathPrefix: string;
  onUpdate: (updated: SchemaChild) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

// Forward-declared via function hoisting — SectionEditor calls SchemaNodeEditor recursively
export function SchemaNodeEditor(props: NodeProps): JSX.Element {
  if (props.node.kind === 'section') {
    return <SectionEditor {...props} node={props.node} />;
  }
  return <PrimitiveEditor {...props} node={props.node} />;
}

function PrimitiveEditor({
  node, index, total, pathPrefix, onUpdate, onRemove, onMove,
}: NodeProps & { node: SchemaPrimitive }) {
  const path = `${pathPrefix}.${node.name}`;
  return (
    <div className="ne-node ne-primitive">
      <div className="ne-node-head">
        <span className="ne-kind-tag ne-kind-prim">P</span>
        {node.computed && <span className="ne-port-dot" title="Computed — can receive wire input">◉</span>}
        <input
          className="ne-name-input"
          value={node.name}
          onChange={e => onUpdate({ ...node, name: e.target.value })}
          placeholder="name"
        />
        <select
          className="ne-type-select"
          value={node.valueType}
          onChange={e => onUpdate({ ...node, valueType: e.target.value as SchemaValueType })}
        >
          <option value="number">number</option>
          <option value="string">string</option>
        </select>
        <label className="ne-computed-label" title="Mark as computed — enables wire input">
          <input
            type="checkbox"
            checked={node.computed}
            onChange={e => onUpdate({ ...node, computed: e.target.checked })}
          />
          <span>computed</span>
        </label>
        <div className="ne-node-actions">
          <button className="clause-btn" onClick={() => onMove(-1)} disabled={index === 0}>↑</button>
          <button className="clause-btn" onClick={() => onMove(+1)} disabled={index === total - 1}>↓</button>
          <button className="clause-btn clause-del" onClick={onRemove}>✕</button>
        </div>
      </div>
      <div className="ne-prim-meta">
        <input
          className="ne-desc-input"
          value={node.description ?? ''}
          onChange={e => onUpdate({ ...node, description: e.target.value || undefined })}
          placeholder="description (optional)"
        />
        <code className="ne-path-hint">{path}</code>
      </div>
    </div>
  );
}

function SectionEditor({
  node, index, total, depth, pathPrefix, onUpdate, onRemove, onMove,
}: NodeProps & { node: SchemaSection }) {
  const [expanded, setExpanded] = useState(true);
  const sectionPath = `${pathPrefix}.${node.name}`;

  const updateChildren = (next: SchemaChild[]) => onUpdate({ ...node, children: next });

  return (
    <div className={`ne-node ne-section${expanded ? ' ne-expanded' : ''}`}>
      <div className="ne-node-head">
        <button className="ne-expand-btn clause-btn" onClick={() => setExpanded(e => !e)}>
          {expanded ? '▾' : '▸'}
        </button>
        <span className="ne-kind-tag ne-kind-sec">§</span>
        <input
          className="ne-name-input"
          value={node.name}
          onChange={e => onUpdate({ ...node, name: e.target.value })}
          placeholder="section name"
        />
        <input
          className="ne-desc-input"
          value={node.description ?? ''}
          onChange={e => onUpdate({ ...node, description: e.target.value || undefined })}
          placeholder="description (optional)"
        />
        <div className="ne-node-actions">
          <button className="clause-btn" onClick={() => onMove(-1)} disabled={index === 0}>↑</button>
          <button className="clause-btn" onClick={() => onMove(+1)} disabled={index === total - 1}>↓</button>
          <button className="clause-btn clause-del" onClick={onRemove}>✕</button>
        </div>
      </div>
      {expanded && (
        <div className="ne-node-body" style={{ paddingLeft: `${(depth + 1) * 14}px` }}>
          {node.children.map((child, i) => (
            <SchemaNodeEditor
              key={child.id}
              node={child}
              index={i}
              total={node.children.length}
              depth={depth + 1}
              pathPrefix={sectionPath}
              onUpdate={updated => updateChildren(updateChild(node.children, updated))}
              onRemove={() => updateChildren(removeChild(node.children, child.id))}
              onMove={dir => updateChildren(moveChild(node.children, child.id, dir))}
            />
          ))}
          <div className="ne-add-row">
            <button className="small ghost" onClick={() => updateChildren(addChild(node.children, newSection()))}>+ Section</button>
            <button className="small ghost" onClick={() => updateChildren(addChild(node.children, newPrimitive()))}>+ Primitive</button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SchemaEditorProps {
  children: SchemaChild[];
  onChange: (children: SchemaChild[]) => void;
}

export function SchemaEditor({ children, onChange }: SchemaEditorProps) {
  return (
    <div className="ne-schema-editor">
      {children.length === 0 && (
        <div className="ne-schema-empty">No fields yet. Add a section or primitive below.</div>
      )}
      {children.map((child, i) => (
        <SchemaNodeEditor
          key={child.id}
          node={child}
          index={i}
          total={children.length}
          depth={0}
          pathPrefix="props"
          onUpdate={updated => onChange(updateChild(children, updated))}
          onRemove={() => onChange(removeChild(children, child.id))}
          onMove={dir => onChange(moveChild(children, child.id, dir))}
        />
      ))}
      <div className="ne-root-add">
        <button className="ghost small" onClick={() => onChange(addChild(children, newSection()))}>+ Section</button>
        <button className="ghost small" onClick={() => onChange(addChild(children, newPrimitive()))}>+ Primitive</button>
      </div>
    </div>
  );
}
