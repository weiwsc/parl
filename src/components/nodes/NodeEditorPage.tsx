import { useState } from 'react';
import { useAppContext, uid } from '../../store';
import { useAuth } from '../../context/AuthContext';
import { Panel } from '../ui/Panel';
import { EmptyState } from '../ui/EmptyState';
import { EditorField } from '../ui/EditorField';
import { TabBar, type TabItem } from '../ui/TabBar';
import type { EntityType, NodeGraph, SchemaChild, TransformDefinition } from '../../game/nodes/types';
import { SchemaEditor } from './SchemaEditor';
import { NodeCanvas } from './NodeCanvas';
import { TransformLibraryEditor } from './TransformLibraryEditor';
import { CanvasPalette } from './CanvasPalette';
import { countSchemaFields, ensureNodeState, removeTypeFromNodeState } from './nodeEditorUtils';
import './node-editor.css';

export function NodeEditorPage() {
  const { state, updateState } = useAppContext();
  const { canEdit } = useAuth();
  const nodeState = ensureNodeState(state.nodes);
  const types = nodeState.types;
  const graph = nodeState.graph;
  const transforms = nodeState.transforms;

  const [mode, setMode] = useState<'types' | 'canvas' | 'transforms'>('types');
  const [selectedId, setSelectedId] = useState<string | null>(types[0]?.id ?? null);
  const selected = types.find(t => t.id === selectedId) ?? null;

  const tabs: TabItem<'types' | 'canvas' | 'transforms'>[] = [
    { id: 'types', label: 'Type Editor', badge: types.length },
    { id: 'canvas', label: 'Node Canvas', badge: graph.nodes.length },
    { id: 'transforms', label: 'Transforms', badge: transforms.length },
  ];

  const updateType = (updated: EntityType) => {
    updateState(s => {
      const nodes = ensureNodeState(s.nodes);
      return {
        ...s,
        nodes: { ...nodes, types: nodes.types.map(t => t.id === updated.id ? updated : t) },
      };
    });
  };

  const updateGraph = (updated: NodeGraph) => {
    updateState(s => ({ ...s, nodes: { ...ensureNodeState(s.nodes), graph: updated } }));
  };

  const updateTransforms = (updated: TransformDefinition[]) => {
    updateState(s => ({ ...s, nodes: { ...ensureNodeState(s.nodes), transforms: updated } }));
  };

  const addType = () => {
    const t: EntityType = { id: uid('type'), name: 'NewType', builtIn: false, children: [] };
    updateState(s => {
      const nodes = ensureNodeState(s.nodes);
      return { ...s, nodes: { ...nodes, types: [...nodes.types, t] } };
    });
    setSelectedId(t.id);
    setMode('types');
  };

  const deleteType = (id: string) => {
    updateState(s => ({
      ...s,
      nodes: removeTypeFromNodeState(ensureNodeState(s.nodes), id),
    }));
    if (selectedId === id) {
      setSelectedId(types.find(t => t.id !== id)?.id ?? null);
    }
  };

  return (
    <div className={`ne-page${mode === 'canvas' ? ' ne-page--canvas' : ''}`}>
      <div className="ne-topbar">
        <span className="ne-topbar-title">NODE EDITOR</span>
        <TabBar active={mode} items={tabs} onChange={setMode} />
        <div className="ne-topbar-actions">
          {canEdit && mode === 'types' && (
            <button className="primary small" onClick={addType}>+ New Type</button>
          )}
        </div>
      </div>

      <div className="ne-workspace">
        {mode === 'canvas' ? (
          <div className="ne-editor-content ne-editor-content--canvas">
            <NodeCanvas
              types={types}
              graph={graph}
              transforms={transforms}
              factions={state.factions}
              regions={state.map.regions}
              canEdit={canEdit}
              onChange={updateGraph}
            />
            <CanvasPalette types={types} transforms={transforms} canEdit={canEdit} />
          </div>
        ) : mode === 'transforms' ? (
          <div className="ne-editor-content">
            <Panel title="TRANSFORMS" subtitle="predefined reusable logic" bodyClassName="no-scroll">
              <TransformLibraryEditor
                transforms={transforms}
                types={types}
                canEdit={canEdit}
                onChange={updateTransforms}
              />
            </Panel>
          </div>
        ) : (
          <>
            <div className="ne-editor-sidebar">
              <div className="ne-editor-sidebar-head">
                <span>TYPES</span>
                {canEdit && <button className="small ghost" onClick={addType}>+</button>}
              </div>
              <div className="ne-editor-sidebar-body">
                <div className="ne-type-list">
                  {types.map(t => (
                    <div
                      key={t.id}
                      className={`ne-type-item${selectedId === t.id ? ' active' : ''}`}
                      onClick={() => setSelectedId(t.id)}
                    >
                      <span className="ne-type-icon">{t.builtIn ? '◈' : '◇'}</span>
                      <span className="ne-type-name">{t.name}</span>
                      <span className="ne-type-count">{countSchemaFields(t.children)}</span>
                      {!t.builtIn && canEdit && (
                        <button
                          className="clause-btn clause-del"
                          onClick={e => { e.stopPropagation(); deleteType(t.id); }}
                          title="Delete type"
                        >✕</button>
                      )}
                    </div>
                  ))}
                  {types.length === 0 && <EmptyState>No types defined.</EmptyState>}
                </div>
              </div>
            </div>
            <div className="ne-editor-content">
              {selected ? (
                <Panel
                  title="SCHEMA"
                  subtitle={selected.builtIn
                    ? <>{selected.name} <span className="ne-builtin-tag">built-in</span></>
                    : selected.name
                  }
                  className="ne-schema-panel"
                >
                  <div className="ne-type-meta">
                    <EditorField label="NAME">
                      <input
                        className="law-field-input"
                        value={selected.name}
                        disabled={selected.builtIn || !canEdit}
                        onChange={e => updateType({ ...selected, name: e.target.value })}
                        placeholder="Type name…"
                      />
                    </EditorField>
                    <EditorField label="DESCRIPTION" optional="(optional)">
                      <input
                        className="law-field-input"
                        value={selected.description ?? ''}
                        disabled={!canEdit}
                        onChange={e => updateType({ ...selected, description: e.target.value || undefined })}
                        placeholder="Describe this type…"
                      />
                    </EditorField>
                    {selected.entityClass && (
                      <div className="ne-entity-class-row">
                        <span className="ne-entity-class-label">ENTITY CLASS</span>
                        <code className="ne-entity-class">{selected.entityClass}</code>
                        <span className="ne-entity-class-hint">
                          access via <code>props.{'{field}'}</code>
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="ne-schema-divider" />
                  <SchemaEditor
                    children={selected.children}
                    typeOptions={types}
                    readOnly={!canEdit}
                    onChange={(children: SchemaChild[]) => updateType({ ...selected, children })}
                  />
                </Panel>
              ) : (
                <div className="ne-empty-pane">
                  <EmptyState>Select a type to edit its schema.</EmptyState>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
