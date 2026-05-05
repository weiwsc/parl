import { useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { useAppContext, uid } from '../../store';
import { useAuth } from '../../context/AuthContext';
import { Panel } from '../ui/Panel';
import { EmptyState } from '../ui/EmptyState';
import { EditorField } from '../ui/EditorField';
import { TabBar, type TabItem } from '../ui/TabBar';
import type { EntityType, NodeEditorConfig, NodeEditorState, NodeGraph, SchemaChild, TransformDefinition, TypeMethodDefinition } from '../../game/nodes/types';
import {
  DEFAULT_NODE_EDITOR_CONFIG,
  NODE_EDITOR_FONT_SCALE_MAX,
  NODE_EDITOR_FONT_SCALE_MIN,
  NODE_EDITOR_FONT_SCALE_STEP,
  clampFontScale,
} from '../../game/nodes/config';
import { parseNodeEditorImport, serializeNodeEditorExport } from '../../game/nodes/export';
import { collectSchemaPorts } from '../../game/nodes/schema';
import { SchemaEditor } from './SchemaEditor';
import { NodeCanvas } from './NodeCanvas';
import { TransformLibraryEditor } from './TransformLibraryEditor';
import { CanvasPalette } from './CanvasPalette';
import { countSchemaFields, ensureNodeState, removeTypeFromNodeState } from './nodeEditorUtils';
import './node-editor.css';

type NodeEditorMode = 'types' | 'canvas' | 'transforms' | 'config';

export function NodeEditorPage() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit } = useAuth();
  const nodeState = ensureNodeState(state.nodes);
  const types = nodeState.types;
  const graph = nodeState.graph;
  const transforms = nodeState.transforms;
  const config = state.ui.nodeEditor;

  const [mode, setMode] = useState<NodeEditorMode>('types');
  const [selectedId, setSelectedId] = useState<string | null>(types[0]?.id ?? null);
  const selected = types.find(t => t.id === selectedId) ?? null;

  const tabs: TabItem<NodeEditorMode>[] = [
    { id: 'types', label: 'Type Editor', badge: types.length },
    { id: 'canvas', label: 'Node Canvas', badge: graph.nodes.length },
    { id: 'transforms', label: 'Transforms', badge: transforms.length },
    { id: 'config', label: 'Config', badge: `${Math.round(config.fontScale * 100)}%` },
  ];
  const pageStyle = nodeEditorStyle(config.fontScale);

  const updateType = (updated: EntityType) => {
    updateState(s => {
      const nodes = ensureNodeState(s.nodes);
      return {
        ...s,
        nodes: { ...nodes, types: nodes.types.map(t => t.id === updated.id ? updated : t) },
      };
    });
  };

  const updateTypeMethods = (type: EntityType, methods: TypeMethodDefinition[]) => {
    updateType({ ...type, methods: methods.length > 0 ? methods : undefined });
  };

  const updateGraph = (updated: NodeGraph) => {
    updateState(s => ({ ...s, nodes: { ...ensureNodeState(s.nodes), graph: updated } }));
  };

  const updateTransforms = (updated: TransformDefinition[]) => {
    updateState(s => ({ ...s, nodes: { ...ensureNodeState(s.nodes), transforms: updated } }));
  };

  const updateConfig = (config: NodeEditorConfig) => {
    updateState(s => ({ ...s, ui: { ...s.ui, nodeEditor: config } }));
  };

  const exportNodeData = () => {
    const { json, bundle } = serializeNodeEditorExport(nodeState);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `node_editor_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    const strippedCount = Object.values(bundle.meta.stripped).reduce((sum, count) => sum + count, 0);
    showToast(strippedCount > 0
      ? `Node data exported; stripped ${strippedCount} external references`
      : 'Node data exported');
  };

  const importNodeData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = loadEvent => {
      try {
        const raw = loadEvent.target?.result;
        if (typeof raw !== 'string') throw new Error('Import file is not text.');
        const imported = parseNodeEditorImport(raw);
        updateState(s => ({ ...s, nodes: imported.nodes }));
        setSelectedId(current => (
          imported.nodes.types.some(type => type.id === current)
            ? current
            : imported.nodes.types[0]?.id ?? null
        ));
        setMode('types');

        const strippedCount = Object.values(imported.report).reduce((sum, count) => sum + count, 0);
        showToast(strippedCount > 0
          ? `Node data imported; stripped ${strippedCount} external references`
          : 'Node data imported');
      } catch {
        showToast('Node data import failed', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
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
    <div
      className={`ne-page${mode === 'canvas' ? ' ne-page--canvas' : ''}`}
      data-node-editor-theme={config.theme}
      style={pageStyle}
    >
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
        ) : mode === 'config' ? (
          <div className="ne-editor-content ne-editor-content--config">
            <NodeEditorConfigPanel
              config={config}
              onChange={updateConfig}
              nodeState={nodeState}
              onExportNodeData={exportNodeData}
              onImportNodeData={importNodeData}
              canImport={canEdit}
            />
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
            <div className="ne-editor-content ne-editor-content--types">
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
                  <div className="ne-schema-divider" />
                  <div className="ne-type-methods">
                    <TransformLibraryEditor
                      transforms={selected.methods ?? []}
                      types={types}
                      canEdit={canEdit}
                      onChange={methods => updateTypeMethods(selected, methods)}
                      listLabel="METHODS"
                      addLabel="+ Method"
                      emptyLabel="No methods defined."
                      emptySelectionLabel="Select or create a method."
                      deleteLabel="Delete Method"
                      newItemName="New Method"
                      idPrefix="method"
                      methodTargetType={selected}
                      fieldCompletions={collectSchemaPorts(selected.children).map(port => ({
                        name: port.label,
                        detail: port.typeLabel,
                        computed: port.acceptsInput,
                      }))}
                    />
                  </div>
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

function nodeEditorStyle(fontScale: number): CSSProperties {
  return {
    '--ne-font-scale': fontScale,
    '--ne-font-7': scaledFontSize(7, fontScale),
    '--ne-font-8': scaledFontSize(8, fontScale),
    '--ne-font-9': scaledFontSize(9, fontScale),
    '--ne-font-10': scaledFontSize(10, fontScale),
    '--ne-font-11': scaledFontSize(11, fontScale),
    '--ne-font-12': scaledFontSize(12, fontScale),
    '--ne-font-13': scaledFontSize(13, fontScale),
  } as CSSProperties;
}

function scaledFontSize(size: number, scale: number): string {
  return `${Math.round(size * scale * 100) / 100}px`;
}

function NodeEditorConfigPanel({
  config,
  onChange,
  nodeState,
  onExportNodeData,
  onImportNodeData,
  canImport,
}: {
  config: NodeEditorConfig;
  onChange: (config: NodeEditorConfig) => void;
  nodeState: NodeEditorState;
  onExportNodeData: () => void;
  onImportNodeData: (event: ChangeEvent<HTMLInputElement>) => void;
  canImport: boolean;
}) {
  const importRef = useRef<HTMLInputElement>(null);
  const isDefaultConfig = config.fontScale === DEFAULT_NODE_EDITOR_CONFIG.fontScale
    && config.theme === DEFAULT_NODE_EDITOR_CONFIG.theme;

  const setFontScale = (fontScale: number) => {
    onChange({ ...config, fontScale: clampFontScale(fontScale) });
  };

  return (
    <Panel title="CONFIG" subtitle="node editor" className="ne-config-panel">
      <div className="ne-config-body">
        <div className="ne-config-row">
          <div className="ne-config-label">
            <span>UI TEXT SIZE</span>
            <code>{Math.round(config.fontScale * 100)}%</code>
          </div>
          <div className="ne-config-control">
            <button
              className="clause-btn"
              aria-label="Decrease UI text size"
              onClick={() => setFontScale(config.fontScale - NODE_EDITOR_FONT_SCALE_STEP)}
              disabled={config.fontScale <= NODE_EDITOR_FONT_SCALE_MIN}
            >
              -
            </button>
            <input
              className="ne-config-range"
              type="range"
              min={NODE_EDITOR_FONT_SCALE_MIN}
              max={NODE_EDITOR_FONT_SCALE_MAX}
              step={NODE_EDITOR_FONT_SCALE_STEP}
              value={config.fontScale}
              onInput={event => setFontScale(Number(event.currentTarget.value))}
              onChange={event => setFontScale(Number(event.currentTarget.value))}
            />
            <button
              className="clause-btn"
              aria-label="Increase UI text size"
              onClick={() => setFontScale(config.fontScale + NODE_EDITOR_FONT_SCALE_STEP)}
              disabled={config.fontScale >= NODE_EDITOR_FONT_SCALE_MAX}
            >
              +
            </button>
          </div>
          <button
            className="small ghost"
            onClick={() => onChange(DEFAULT_NODE_EDITOR_CONFIG)}
            disabled={isDefaultConfig}
          >
            Reset
          </button>
        </div>
        <div className="ne-config-row ne-config-row--export">
          <div className="ne-config-label">
            <span>NODE DATA</span>
            <code>{nodeState.types.length}T</code>
          </div>
          <div className="ne-config-export-summary">
            <span>{nodeState.graph.nodes.length} nodes</span>
            <span>{nodeState.graph.connections.length} wires</span>
            <span>{nodeState.transforms.length} transforms</span>
          </div>
          <div className="ne-config-actions">
            <button className="small ghost" onClick={() => importRef.current?.click()} disabled={!canImport} title="Import node editor JSON">
              Import JSON
            </button>
            <button className="small primary" onClick={onExportNodeData} title="Export node editor JSON">
              Export JSON
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="ne-config-file-input"
              onChange={onImportNodeData}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
