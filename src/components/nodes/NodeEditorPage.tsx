import { useState } from 'react';
import { useAppContext, uid } from '../../store';
import { useAuth } from '../../context/AuthContext';
import { AppHeader } from '../ui/AppHeader';
import { Panel } from '../ui/Panel';
import { EmptyState } from '../ui/EmptyState';
import type { EntityType, SchemaChild } from '../../game/nodes/types';
import { SchemaEditor } from './SchemaEditor';

export function NodeEditorPage() {
  const { state, updateState } = useAppContext();
  const { canEdit } = useAuth();
  const types = state.nodes.types;

  const [selectedId, setSelectedId] = useState<string | null>(types[0]?.id ?? null);
  const selected = types.find(t => t.id === selectedId) ?? null;

  const updateType = (updated: EntityType) => {
    updateState(s => ({
      ...s,
      nodes: { ...s.nodes, types: s.nodes.types.map(t => t.id === updated.id ? updated : t) },
    }));
  };

  const addType = () => {
    const t: EntityType = { id: uid('type'), name: 'NewType', builtIn: false, children: [] };
    updateState(s => ({ ...s, nodes: { ...s.nodes, types: [...s.nodes.types, t] } }));
    setSelectedId(t.id);
  };

  const deleteType = (id: string) => {
    updateState(s => ({ ...s, nodes: { ...s.nodes, types: s.nodes.types.filter(t => t.id !== id) } }));
    if (selectedId === id) {
      setSelectedId(types.find(t => t.id !== id)?.id ?? null);
    }
  };

  return (
    <div className="ne-page">
      <AppHeader title="TYPE EDITOR" subtitle="// SCHEMA DESIGNER · v0.1 //">
        {canEdit && (
          <button className="primary small" onClick={addType}>+ New Type</button>
        )}
      </AppHeader>

      <div className="ne-layout">
        <Panel title="TYPES" subtitle={`${types.length} defined`} className="ne-type-panel" bodyClassName="no-scroll">
          <div className="ne-type-list">
            {types.map(t => (
              <div
                key={t.id}
                className={`ne-type-item${selectedId === t.id ? ' active' : ''}`}
                onClick={() => setSelectedId(t.id)}
              >
                <span className="ne-type-icon">{t.builtIn ? '◈' : '◇'}</span>
                <span className="ne-type-name">{t.name}</span>
                <span className="ne-type-count">{countFields(t.children)}</span>
                {t.builtIn
                  ? <span className="ne-builtin-tag">built-in</span>
                  : canEdit && (
                    <button
                      className="clause-btn clause-del"
                      onClick={e => { e.stopPropagation(); deleteType(t.id); }}
                      title="Delete type"
                    >✕</button>
                  )
                }
              </div>
            ))}
            {types.length === 0 && <EmptyState>No types defined.</EmptyState>}
          </div>
        </Panel>

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
              <div className="law-field">
                <label className="law-field-label">NAME</label>
                <input
                  className="law-field-input"
                  value={selected.name}
                  disabled={selected.builtIn || !canEdit}
                  onChange={e => updateType({ ...selected, name: e.target.value })}
                  placeholder="Type name…"
                />
              </div>
              <div className="law-field">
                <label className="law-field-label">
                  DESCRIPTION <span className="law-field-opt">(optional)</span>
                </label>
                <input
                  className="law-field-input"
                  value={selected.description ?? ''}
                  disabled={!canEdit}
                  onChange={e => updateType({ ...selected, description: e.target.value || undefined })}
                  placeholder="Describe this type…"
                />
              </div>
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
              onChange={(children: SchemaChild[]) => updateType({ ...selected, children })}
            />
          </Panel>
        ) : (
          <div className="ne-empty-pane">
            <EmptyState>Select a type to edit its schema.</EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}

function countFields(children: SchemaChild[]): number {
  let count = 0;
  for (const c of children) {
    if (c.kind === 'primitive') count++;
    else count += countFields(c.children);
  }
  return count;
}
