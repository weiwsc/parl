import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Faction, MapRegion } from '../../models/types';
import type {
  EntityType,
  NodeConnectionMode,
  NodeGraph,
  NodeGraphNode,
  NodeGraphPortRef,
  NodeInstanceValue,
  SchemaArray,
  SchemaChild,
  SchemaPrimitive,
  SchemaReference,
  SchemaSection,
  TransformDefinition,
  TransformGraphNode,
  TransformPort,
} from '../../game/nodes/types';
import {
  createConnection,
  createEntityGraphNode,
  createTransformGraphNode,
  createTransformPort,
  describeSchemaChildType,
} from '../../game/nodes/schema';
import { evaluateGraph, runtimeValueLabel, transformSpec, type NodeEvaluation, type NodeRuntimeValue } from '../../game/nodes/runtime';
import { EmptyState } from '../ui/EmptyState';
import { NodeValueTypeEditor } from './NodeValueTypeEditor';
import { CanvasToolbar } from './CanvasToolbar';
import { ConnectionDrawer } from './ConnectionDrawer';
import { ConnectionLayer } from './ConnectionLayer';
import { PortHandle } from './PortHandle';
import type { CanvasPoint, CanvasViewport, NodeDragState, PanDragState, PortDirection, RegisterPortAnchor, WireDragState } from './nodeCanvasTypes';
import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  cleanValues,
  deleteGraphNode,
  emptyValueLabel,
  fieldKindClass,
  fieldKindLabel,
  getBindingOptions,
  getInputPortFromPoint,
  isInteractiveTarget,
  portKey,
  sameAnchors,
  samePortRef,
} from './nodeCanvasUtils';

interface NodeCanvasProps {
  types: EntityType[];
  graph: NodeGraph;
  transforms: TransformDefinition[];
  factions: Faction[];
  regions: MapRegion[];
  canEdit: boolean;
  onChange: (graph: NodeGraph) => void;
}

export function NodeCanvas({ types, graph, transforms, factions, regions, canEdit, onChange }: NodeCanvasProps) {
  const viewportDivRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const portElementsRef = useRef(new Map<string, HTMLElement>());
  const [portAnchors, setPortAnchors] = useState<Record<string, CanvasPoint>>({});
  const [nodeDrag, setNodeDrag] = useState<NodeDragState | null>(null);
  const [panDrag, setPanDrag] = useState<PanDragState | null>(null);
  const [wireDrag, setWireDrag] = useState<WireDragState | null>(null);
  const [viewport, setViewport] = useState<CanvasViewport>({ panX: 40, panY: 40, zoom: 1 });
  const [mode, setMode] = useState<NodeConnectionMode>('read');
  const [amount, setAmount] = useState(1);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const viewportRef = useRef<CanvasViewport>(viewport);
  const evaluation = useMemo(() => evaluateGraph({ graph, types, transforms, factions, regions }), [graph, types, transforms, factions, regions]);

  // Keep viewportRef in sync (used in callbacks without triggering re-renders)
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  const updateGraph = useCallback((updater: (graph: NodeGraph) => NodeGraph) => onChange(updater(graph)), [graph, onChange]);

  // Convert client coords to canvas (content) coords
  const getCanvasPoint = useCallback((event: { clientX: number; clientY: number }): CanvasPoint => {
    const rect = viewportDivRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const { panX, panY, zoom } = viewportRef.current;
    return {
      x: (event.clientX - rect.left - panX) / zoom,
      y: (event.clientY - rect.top - panY) / zoom,
    };
  }, []);

  const measurePortAnchors = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const surfaceRect = surface.getBoundingClientRect();
    const zoom = viewportRef.current.zoom;
    const next: Record<string, CanvasPoint> = {};
    for (const [key, element] of portElementsRef.current.entries()) {
      const rect = element.getBoundingClientRect();
      next[key] = {
        x: (rect.left + rect.width / 2 - surfaceRect.left) / zoom,
        y: (rect.top + rect.height / 2 - surfaceRect.top) / zoom,
      };
    }
    setPortAnchors(current => sameAnchors(current, next) ? current : next);
  }, []);

  const registerPortAnchor: RegisterPortAnchor = useCallback((key, element) => {
    if (element) portElementsRef.current.set(key, element);
    else portElementsRef.current.delete(key);
    window.requestAnimationFrame(measurePortAnchors);
  }, [measurePortAnchors]);

  useLayoutEffect(() => {
    measurePortAnchors();
  }, [graph.nodes, graph.connections, wireDrag, viewport.zoom, measurePortAnchors]);

  useEffect(() => {
    window.addEventListener('resize', measurePortAnchors);
    return () => window.removeEventListener('resize', measurePortAnchors);
  }, [measurePortAnchors]);

  // Wheel zoom (non-passive to prevent browser scroll)
  useEffect(() => {
    const el = viewportDivRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setViewport(v => {
        const newZoom = Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, v.zoom * factor));
        if (Math.abs(newZoom - v.zoom) < 0.001) return v;
        return {
          panX: sx - (sx - v.panX) * (newZoom / v.zoom),
          panY: sy - (sy - v.panY) * (newZoom / v.zoom),
          zoom: newZoom,
        };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Fit all nodes into view
  const fitToView = useCallback(() => {
    const el = viewportDivRef.current;
    if (!el || graph.nodes.length === 0) {
      setViewport({ panX: 40, panY: 40, zoom: 1 });
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of graph.nodes) {
      const w = node.kind === 'transform' ? 320 : 360;
      const h = 220;
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + w);
      maxY = Math.max(maxY, node.y + h);
    }
    const pad = 0.86;
    const zoom = Math.max(CANVAS_MIN_ZOOM, Math.min(2, Math.min(
      (width * pad) / (maxX - minX),
      (height * pad) / (maxY - minY)
    )));
    setViewport({
      panX: width / 2 - ((minX + maxX) / 2) * zoom,
      panY: height / 2 - ((minY + maxY) / 2) * zoom,
      zoom,
    });
  }, [graph.nodes]);

  // Auto-fit on first mount if nodes exist
  useLayoutEffect(() => {
    if (graph.nodes.length > 0) fitToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Node drag via window listeners
  useEffect(() => {
    if (!nodeDrag) return;
    const handleMove = (event: PointerEvent) => {
      const point = getCanvasPoint(event);
      onChange({
        ...graph,
        nodes: graph.nodes.map(node => node.id === nodeDrag.nodeId
          ? { ...node, x: Math.max(0, Math.round(point.x - nodeDrag.dx)), y: Math.max(0, Math.round(point.y - nodeDrag.dy)) }
          : node
        ),
      });
    };
    const handleUp = () => setNodeDrag(null);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [getCanvasPoint, graph, nodeDrag, onChange]);

  const addLocalTransform = () => {
    const el = viewportDivRef.current;
    const cx = el ? el.getBoundingClientRect().width / 2 : 420;
    const cy = el ? el.getBoundingClientRect().height / 2 : 200;
    const { panX, panY, zoom } = viewportRef.current;
    updateGraph(current => ({
      ...current,
      nodes: [...current.nodes, createTransformGraphNode(
        (cx - panX) / zoom + current.nodes.length * 24,
        (cy - panY) / zoom + current.nodes.length * 16,
      )],
    }));
  };

  const addConnection = useCallback((from: NodeGraphPortRef, to: NodeGraphPortRef) => {
    if (from.nodeId === to.nodeId) return;
    const connection = createConnection(from, to);
    updateGraph(current => ({
      ...current,
      connections: current.connections.some(existing => samePortRef(existing.from, from) && samePortRef(existing.to, to))
        ? current.connections
        : [...current.connections, { ...connection, mode, amount: mode === 'take' ? Math.max(0, amount) : undefined }],
    }));
  }, [amount, mode, updateGraph]);

  useEffect(() => {
    if (!wireDrag) return;

    const handleMove = (event: PointerEvent) => {
      setWireDrag(current => current ? { ...current, point: getCanvasPoint(event) } : current);
    };
    const handleUp = (event: PointerEvent) => {
      const targetPort = getInputPortFromPoint(event.clientX, event.clientY);
      if (targetPort) addConnection(wireDrag.from, targetPort);
      setWireDrag(null);
    };
    const handleCancel = () => setWireDrag(null);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    window.addEventListener('pointercancel', handleCancel, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [addConnection, getCanvasPoint, wireDrag]);

  const startNodeDrag = (event: ReactPointerEvent<HTMLElement>, node: NodeGraphNode) => {
    if (!canEdit || isInteractiveTarget(event.target)) return;
    const point = getCanvasPoint(event);
    setNodeDrag({ nodeId: node.id, dx: point.x - node.x, dy: point.y - node.y });
    event.preventDefault();
    event.stopPropagation();
  };

  const startWire = (event: ReactPointerEvent<HTMLElement>, from: NodeGraphPortRef) => {
    if (!canEdit) return;
    if (event.button !== 0) return;
    setWireDrag({ from, point: getCanvasPoint(event) });
    event.preventDefault();
    event.stopPropagation();
  };

  const completeWire = (event: ReactPointerEvent<HTMLElement>, to: NodeGraphPortRef) => {
    if (!wireDrag) return;
    addConnection(wireDrag.from, to);
    setWireDrag(null);
    event.preventDefault();
    event.stopPropagation();
  };

  const handleViewportPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 1) {
      event.preventDefault();
      setPanDrag({ startX: event.clientX, startY: event.clientY, startPanX: viewport.panX, startPanY: viewport.panY });
    }
  };

  const handleViewportPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panDrag) {
      setViewport(v => ({
        ...v,
        panX: panDrag.startPanX + (event.clientX - panDrag.startX),
        panY: panDrag.startPanY + (event.clientY - panDrag.startY),
      }));
    }
  };

  const handleViewportPointerUp = () => {
    setPanDrag(null);
  };

  const handleSurfaceDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    const canvasPoint = getCanvasPoint(event);
    const textPayload = event.dataTransfer.getData('text/plain');

    const typeId = event.dataTransfer.getData('application/x-node-type')
      || (textPayload.startsWith('node-type:') ? textPayload.replace('node-type:', '') : '');

    const transformId = event.dataTransfer.getData('application/x-transform-def')
      || (textPayload.startsWith('transform-def:') ? textPayload.replace('transform-def:', '') : '');

    if (typeId) {
      const type = types.find(candidate => candidate.id === typeId);
      if (!type) return;
      event.preventDefault();
      updateGraph(current => ({
        ...current,
        nodes: [...current.nodes, createEntityGraphNode(type, canvasPoint.x, canvasPoint.y)],
      }));
    } else if (transformId) {
      const definition = transforms.find(candidate => candidate.id === transformId);
      if (!definition) return;
      event.preventDefault();
      updateGraph(current => ({
        ...current,
        nodes: [...current.nodes, {
          ...createTransformGraphNode(canvasPoint.x, canvasPoint.y),
          transformId,
          title: definition.name,
        }],
      }));
    }
  };

  const { panX, panY, zoom } = viewport;
  const isPanning = !!panDrag;

  return (
    <div className="ne-canvas-shell">
      <CanvasToolbar
        mode={mode}
        amount={amount}
        zoom={zoom}
        canEdit={canEdit}
        onModeChange={setMode}
        onAmountChange={setAmount}
        onAddLocalTransform={addLocalTransform}
        onZoomOut={() => setViewport(v => ({ ...v, zoom: Math.max(CANVAS_MIN_ZOOM, v.zoom / 1.2) }))}
        onZoomIn={() => setViewport(v => ({ ...v, zoom: Math.min(CANVAS_MAX_ZOOM, v.zoom * 1.2) }))}
        onFitToView={fitToView}
      />

      {/* Canvas viewport */}
      <div
        ref={viewportDivRef}
        className={`ne-canvas-viewport${isPanning ? ' ne-pan-active' : ''}`}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onDragOver={event => {
          if (!canEdit) return;
          if (
            event.dataTransfer.types.includes('application/x-node-type') ||
            event.dataTransfer.types.includes('application/x-transform-def') ||
            event.dataTransfer.types.includes('text/plain')
          ) {
            event.preventDefault();
          }
        }}
        onDrop={handleSurfaceDrop}
      >
        {graph.nodes.length === 0 && (
          <div className="ne-canvas-empty">
            <EmptyState>Drag a type or transform from the left panel to start.</EmptyState>
          </div>
        )}
        {/* Transformed surface — all nodes live here in canvas coords */}
        <div
          ref={surfaceRef}
          className="ne-canvas-surface"
          style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: '0 0' }}
        >
          <ConnectionLayer graph={graph} anchors={portAnchors} pendingWire={wireDrag} />
          {graph.nodes.map(node => node.kind === 'transform' ? (
            <TransformNodeView
              key={node.id}
              node={node}
              types={types}
              transforms={transforms}
              evaluation={evaluation}
              canEdit={canEdit}
              registerPortAnchor={registerPortAnchor}
              onStartDrag={event => startNodeDrag(event, node)}
              onStartWire={startWire}
              onCompleteWire={completeWire}
              onUpdate={updated => updateGraph(current => ({
                ...current,
                nodes: current.nodes.map(candidate => candidate.id === updated.id ? updated : candidate),
              }))}
              onDelete={() => updateGraph(current => deleteGraphNode(current, node.id))}
            />
          ) : (
            <EntityNodeView
              key={node.id}
              node={node}
              type={types.find(type => type.id === node.typeId)}
              factions={factions}
              regions={regions}
              evaluation={evaluation}
              canEdit={canEdit}
              registerPortAnchor={registerPortAnchor}
              onStartDrag={event => startNodeDrag(event, node)}
              onStartWire={startWire}
              onCompleteWire={completeWire}
              onUpdate={updated => updateGraph(current => ({
                ...current,
                nodes: current.nodes.map(candidate => candidate.id === updated.id ? updated : candidate),
              }))}
              onDelete={() => updateGraph(current => deleteGraphNode(current, node.id))}
            />
          ))}
        </div>
      </div>

      <ConnectionDrawer
        graph={graph}
        canEdit={canEdit}
        open={connectionsOpen}
        onToggle={() => setConnectionsOpen(open => !open)}
        onDeleteConnection={id => updateGraph(current => ({
          ...current,
          connections: current.connections.filter(connection => connection.id !== id),
        }))}
      />
    </div>
  );
}

function EntityNodeView({
  node, type, factions, regions, evaluation, canEdit,
  registerPortAnchor, onStartDrag, onStartWire, onCompleteWire, onUpdate, onDelete,
}: {
  node: Extract<NodeGraphNode, { kind: 'entity' }>;
  type?: EntityType;
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
}) {
  const bindingOptions = type ? getBindingOptions(type, factions, regions) : [];
  const bound = bindingOptions.find(option => option.id === node.binding?.entityId);

  const updateBinding = (entityId: string) => {
    if (!type?.entityClass || !entityId) { onUpdate({ ...node, binding: undefined }); return; }
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
              <span className="ne-binding-color" style={{ background: bound.color ?? 'var(--line)' }} />
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
          node={node} type={type} children={type.children} pathPrefix="props" depth={0}
          factions={factions} regions={regions} evaluation={evaluation} canEdit={canEdit}
          registerPortAnchor={registerPortAnchor} onStartWire={onStartWire}
          onCompleteWire={onCompleteWire} onValueChange={updateValue}
        />
      ) : (
        <div className="ne-node-missing">Missing type definition</div>
      )}
    </div>
  );
}

function InstanceSchemaView({
  node, type, children, pathPrefix, depth, factions, regions, evaluation, canEdit,
  registerPortAnchor, onStartWire, onCompleteWire, onValueChange,
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
          key={child.id} node={node} type={type} child={child} pathPrefix={pathPrefix}
          depth={depth} factions={factions} regions={regions} evaluation={evaluation}
          canEdit={canEdit} registerPortAnchor={registerPortAnchor}
          onStartWire={onStartWire} onCompleteWire={onCompleteWire} onValueChange={onValueChange}
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
  node, type, child, pathPrefix, depth, factions, regions, evaluation, canEdit,
  registerPortAnchor, onStartWire, onCompleteWire, onValueChange,
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

  return (
    <div className={`ne-node ne-section${expanded ? ' ne-expanded' : ''}`}>
      <div className="ne-node-head ne-instance-section-head">
        <button className="ne-expand-btn clause-btn" onClick={() => setExpanded(current => !current)}>{expanded ? 'v' : '>'}</button>
        <span className="ne-kind-tag ne-kind-sec">§</span>
        <span className="ne-instance-section-name">{child.name}</span>
        {child.description && <span className="ne-instance-desc">{child.description}</span>}
      </div>
      {expanded && (
        <div className="ne-node-body" style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
          <InstanceSchemaView
            node={node} type={type} children={child.children} pathPrefix={sectionPath}
            depth={depth + 1} factions={factions} regions={regions} evaluation={evaluation}
            canEdit={canEdit} registerPortAnchor={registerPortAnchor}
            onStartWire={onStartWire} onCompleteWire={onCompleteWire} onValueChange={onValueChange}
          />
        </div>
      )}
    </div>
  );
}

function InstanceField({
  node, child, pathPrefix, evaluation, canEdit,
  registerPortAnchor, onStartWire, onCompleteWire, onValueChange,
}: {
  node: Extract<NodeGraphNode, { kind: 'entity' }>;
  child: SchemaPrimitive | SchemaReference | SchemaArray;
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
  const titleAttr = child.description ? `${path} — ${child.description}` : path;

  return (
    <div className={`ne-node ne-${child.kind}`} title={titleAttr}>
      <div className="ne-node-head ne-instance-field-row">
        {child.computed ? (
          <PortHandle direction="input" port={port} canEdit={canEdit} registerPortAnchor={registerPortAnchor} onStartWire={onStartWire} onCompleteWire={onCompleteWire} />
        ) : <span className="ne-port-spacer" />}
        <span className={`ne-kind-tag ${fieldKindClass(child)}`}>{fieldKindLabel(child)}</span>
        <span className="ne-instance-field-name">{child.name}</span>
        <span className="ne-type-pill">{typeLabel}</span>
        <InstanceValueEditor child={child} value={value} computed={child.computed} canEdit={canEdit} onChange={next => onValueChange(path, next)} />
        <PortHandle direction="output" port={port} canEdit={canEdit} registerPortAnchor={registerPortAnchor} onStartWire={onStartWire} onCompleteWire={onCompleteWire} />
      </div>
    </div>
  );
}

function InstanceValueEditor({
  child, value, computed, canEdit, onChange,
}: {
  child: SchemaPrimitive | SchemaReference | SchemaArray;
  value: NodeRuntimeValue;
  computed: boolean;
  canEdit: boolean;
  onChange: (value: NodeInstanceValue) => void;
}) {
  if (child.kind !== 'primitive' || computed) {
    const fallback = child.kind === 'primitive' ? 'computed' : emptyValueLabel(child);
    return <span className="ne-value-readout">{runtimeValueLabel(value) || fallback}</span>;
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

function TransformNodeView({
  node, types, transforms, evaluation, canEdit,
  registerPortAnchor, onStartDrag, onStartWire, onCompleteWire, onUpdate, onDelete,
}: {
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
}) {
  const spec = transformSpec(node, transforms);
  const usesDefinition = !!node.transformId && transforms.some(definition => definition.id === node.transformId);
  const editableSpec = canEdit && !usesDefinition;
  const errors = evaluation.errors[node.id] ?? [];
  const updateInput = (port: TransformPort) => onUpdate({ ...node, inputs: node.inputs.map(candidate => candidate.id === port.id ? port : candidate) });
  const updateOutput = (port: TransformPort) => onUpdate({ ...node, outputs: node.outputs.map(candidate => candidate.id === port.id ? port : candidate) });

  return (
    <div className="ne-graph-node ne-transform-node" style={{ left: node.x, top: node.y }}>
      <div className="ne-graph-node-head" onPointerDown={onStartDrag}>
        <span className="ne-kind-tag ne-kind-arr">JS</span>
        <input value={node.title} disabled={!canEdit} onChange={event => onUpdate({ ...node, title: event.target.value })} />
        <select
          className="ne-def-select"
          value={node.transformId ?? ''}
          disabled={!canEdit}
          title="Transform definition"
          onChange={event => {
            const transformId = event.target.value || undefined;
            const definition = transforms.find(candidate => candidate.id === transformId);
            onUpdate({ ...node, transformId, title: definition?.name ?? node.title });
          }}
        >
          <option value="">local</option>
          {transforms.map(definition => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
        </select>
        {canEdit && <button className="clause-btn clause-del" onClick={onDelete}>x</button>}
      </div>
      <TransformPortSection
        node={node} direction="input" ports={spec.inputs} typeOptions={types} canEdit={editableSpec} canConnect={canEdit}
        registerPortAnchor={registerPortAnchor} onStartWire={onStartWire} onCompleteWire={onCompleteWire}
        onUpdate={updateInput}
        onAdd={() => onUpdate({ ...node, inputs: [...node.inputs, createTransformPort('in', `input${node.inputs.length + 1}`)] })}
        onRemove={id => onUpdate({ ...node, inputs: node.inputs.filter(port => port.id !== id) })}
      />
      <TransformPortSection
        node={node} direction="output" ports={spec.outputs} typeOptions={types} canEdit={editableSpec} canConnect={canEdit}
        registerPortAnchor={registerPortAnchor} onStartWire={onStartWire} onCompleteWire={onCompleteWire}
        onUpdate={updateOutput}
        onAdd={() => onUpdate({ ...node, outputs: [...node.outputs, createTransformPort('out', `output${node.outputs.length + 1}`)] })}
        onRemove={id => onUpdate({ ...node, outputs: node.outputs.filter(port => port.id !== id) })}
      />
      <div className="ne-transform-code-section">
        <div className="ne-transform-code-hint">Inputs are JS variables. Return object matching output names.</div>
        <textarea
          className="ne-transform-code"
          value={spec.expression}
          disabled={!editableSpec}
          onChange={event => onUpdate({ ...node, expression: event.target.value })}
        />
      </div>
      {errors.length > 0 && (
        <div className="ne-transform-errors">
          {errors.map(error => <span key={error}>{error}</span>)}
        </div>
      )}
    </div>
  );
}

function TransformPortSection({
  node, direction, ports, typeOptions, canEdit, canConnect,
  registerPortAnchor, onStartWire, onCompleteWire, onUpdate, onAdd, onRemove,
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
        {label}
        {canEdit && <button className="clause-btn" onClick={onAdd}>+</button>}
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
            {canEdit ? <button className="clause-btn clause-del" onClick={() => onRemove(port.id)}>x</button> : <span />}
            {direction === 'output' ? (
              <PortHandle direction="output" port={graphPort} canEdit={canConnect} registerPortAnchor={registerPortAnchor} onStartWire={onStartWire} onCompleteWire={onCompleteWire} />
            ) : <span className="ne-port-spacer" />}
          </div>
        );
      })}
    </div>
  );
}
