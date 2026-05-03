import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Faction, MapRegion } from '../../models/types';
import type {
  EntityType,
  NodeConnectionMode,
  NodeGraphConnection,
  NodeGraph,
  NodeGraphNode,
  NodeGraphPortRef,
  TransformDefinition,
} from '../../game/nodes/types';
import {
  createConnection,
  createEntityGraphNode,
  createTransformGraphNode,
} from '../../game/nodes/schema';
import { evaluateGraph } from '../../game/nodes/runtime';
import { EmptyState } from '../ui/EmptyState';
import { CanvasToolbar } from './CanvasToolbar';
import { ConnectionDrawer } from './ConnectionDrawer';
import { ConnectionLayer } from './ConnectionLayer';
import { EntityNodeView } from './EntityNodeView';
import { TransformNodeView } from './TransformNodeView';
import type { CanvasPoint, CanvasViewport, NodeDragState, PanDragState, RegisterPortAnchor, WireDragState } from './nodeCanvasTypes';
import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  deleteGraphNode,
  getInputPortFromPoint,
  isInteractiveTarget,
  sameAnchors,
  samePortRef,
  validateConnection,
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

interface NodeDragPreview {
  nodeId: string;
  x: number;
  y: number;
}

export function NodeCanvas({ types, graph, transforms, factions, regions, canEdit, onChange }: NodeCanvasProps) {
  const viewportDivRef = useRef<HTMLDivElement | null>(null);
  const portElementsRef = useRef(new Map<string, HTMLElement>());
  const portResizeObserverRef = useRef<ResizeObserver | null>(null);
  const portMeasureFrameRef = useRef<number | null>(null);
  const graphRef = useRef(graph);
  const nodeDragFrameRef = useRef<number | null>(null);
  const pendingNodeDragPreviewRef = useRef<NodeDragPreview | null>(null);
  const [portAnchors, setPortAnchors] = useState<Record<string, CanvasPoint>>({});
  const [nodeDrag, setNodeDrag] = useState<NodeDragState | null>(null);
  const [nodeDragPreview, setNodeDragPreview] = useState<NodeDragPreview | null>(null);
  const [panDrag, setPanDrag] = useState<PanDragState | null>(null);
  const [wireDrag, setWireDrag] = useState<WireDragState | null>(null);
  const [viewport, setViewport] = useState<CanvasViewport>({ panX: 40, panY: 40, zoom: 1 });
  const [mode, setMode] = useState<NodeConnectionMode>('read');
  const [amount, setAmount] = useState(1);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [connectionMenu, setConnectionMenu] = useState<{ connectionId: string; x: number; y: number } | null>(null);
  const viewportRef = useRef<CanvasViewport>(viewport);
  const evaluation = useMemo(() => evaluateGraph({ graph, types, transforms, factions, regions }), [graph, types, transforms, factions, regions]);
  const typeById = useMemo(() => new Map(types.map(type => [type.id, type])), [types]);
  const displayedGraph = useMemo<NodeGraph>(() => {
    if (!nodeDragPreview) return graph;
    return {
      ...graph,
      nodes: graph.nodes.map(node => node.id === nodeDragPreview.nodeId
        ? { ...node, x: nodeDragPreview.x, y: nodeDragPreview.y }
        : node
      ),
    };
  }, [graph, nodeDragPreview]);

  viewportRef.current = viewport;
  graphRef.current = graph;

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
    const viewportElement = viewportDivRef.current;
    if (!viewportElement) return;
    const viewportRect = viewportElement.getBoundingClientRect();
    const { panX, panY, zoom } = viewportRef.current;
    const next: Record<string, CanvasPoint> = {};
    for (const [key, element] of portElementsRef.current.entries()) {
      const rect = element.getBoundingClientRect();
      next[key] = {
        x: (rect.left + rect.width / 2 - viewportRect.left - panX) / zoom,
        y: (rect.top + rect.height / 2 - viewportRect.top - panY) / zoom,
      };
    }
    setPortAnchors(current => sameAnchors(current, next) ? current : next);
  }, []);

  const schedulePortAnchorMeasure = useCallback(() => {
    if (portMeasureFrameRef.current !== null) return;
    portMeasureFrameRef.current = window.requestAnimationFrame(() => {
      portMeasureFrameRef.current = null;
      measurePortAnchors();
    });
  }, [measurePortAnchors]);

  const registerPortAnchor: RegisterPortAnchor = useCallback((key, element) => {
    const observer = portResizeObserverRef.current;
    const previous = portElementsRef.current.get(key);
    if (previous && previous !== element) observer?.unobserve(previous);

    if (element) {
      portElementsRef.current.set(key, element);
      observer?.observe(element);
    } else {
      portElementsRef.current.delete(key);
    }
    schedulePortAnchorMeasure();
  }, [schedulePortAnchorMeasure]);

  useLayoutEffect(() => {
    schedulePortAnchorMeasure();
  }, [displayedGraph.nodes, schedulePortAnchorMeasure]);

  useEffect(() => {
    window.addEventListener('resize', schedulePortAnchorMeasure);
    return () => window.removeEventListener('resize', schedulePortAnchorMeasure);
  }, [schedulePortAnchorMeasure]);

  useEffect(() => () => {
    if (portMeasureFrameRef.current !== null) {
      window.cancelAnimationFrame(portMeasureFrameRef.current);
      portMeasureFrameRef.current = null;
    }
    if (nodeDragFrameRef.current !== null) {
      window.cancelAnimationFrame(nodeDragFrameRef.current);
      nodeDragFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      schedulePortAnchorMeasure();
    });
    portResizeObserverRef.current = observer;
    portElementsRef.current.forEach(element => observer.observe(element));

    return () => {
      observer.disconnect();
      portResizeObserverRef.current = null;
    };
  }, [schedulePortAnchorMeasure]);

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

  const scheduleNodeDragPreview = useCallback((preview: NodeDragPreview) => {
    pendingNodeDragPreviewRef.current = preview;
    if (nodeDragFrameRef.current !== null) return;

    nodeDragFrameRef.current = window.requestAnimationFrame(() => {
      nodeDragFrameRef.current = null;
      const next = pendingNodeDragPreviewRef.current;
      setNodeDragPreview(next);
    });
  }, []);

  // Node drag via window listeners
  useEffect(() => {
    if (!nodeDrag) return;
    const handleMove = (event: PointerEvent) => {
      const point = getCanvasPoint(event);
      scheduleNodeDragPreview({
        nodeId: nodeDrag.nodeId,
        x: Math.round(point.x - nodeDrag.dx),
        y: Math.round(point.y - nodeDrag.dy),
      });
    };
    const handleUp = (event: PointerEvent) => {
      const point = getCanvasPoint(event);
      const finalPosition = {
        nodeId: nodeDrag.nodeId,
        x: Math.round(point.x - nodeDrag.dx),
        y: Math.round(point.y - nodeDrag.dy),
      };
      if (nodeDragFrameRef.current !== null) {
        window.cancelAnimationFrame(nodeDragFrameRef.current);
        nodeDragFrameRef.current = null;
      }
      pendingNodeDragPreviewRef.current = null;
      setNodeDragPreview(null);
      setNodeDrag(null);

      const currentGraph = graphRef.current;
      const currentNode = currentGraph.nodes.find(node => node.id === finalPosition.nodeId);
      if (!currentNode || (currentNode.x === finalPosition.x && currentNode.y === finalPosition.y)) return;

      onChange({
        ...currentGraph,
        nodes: currentGraph.nodes.map(node => node.id === finalPosition.nodeId
          ? { ...node, x: finalPosition.x, y: finalPosition.y }
          : node
        ),
      });
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [getCanvasPoint, nodeDrag, onChange, scheduleNodeDragPreview]);

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
    const validation = validateConnection(graph, types, transforms, from, to);
    if (!validation.ok) {
      setConnectionMessage(validation.message ?? 'Cannot create wire.');
      return;
    }

    const connection = createConnection(from, to);
    setConnectionMessage(null);
    updateGraph(current => ({
      ...current,
      connections: [
        ...(validation.replaceExistingTarget
          ? current.connections.filter(existing => !samePortRef(existing.to, to))
          : current.connections
        ),
        { ...connection, mode, amount: mode === 'take' ? Math.max(0, amount) : undefined },
      ],
    }));
  }, [amount, graph, mode, transforms, types, updateGraph]);

  const updateConnection = useCallback((id: string, patch: { mode?: NodeConnectionMode; amount?: number }) => {
    updateGraph(current => ({
      ...current,
      connections: current.connections.map(connection => connection.id === id
        ? {
          ...connection,
          ...patch,
          amount: (patch.mode ?? connection.mode) === 'take' ? Math.max(0, patch.amount ?? connection.amount ?? amount) : undefined,
        }
        : connection
      ),
    }));
  }, [amount, updateGraph]);

  const deleteConnection = useCallback((id: string) => {
    updateGraph(current => ({
      ...current,
      connections: current.connections.filter(connection => connection.id !== id),
    }));
    setConnectionMenu(current => current?.connectionId === id ? null : current);
  }, [updateGraph]);

  const openConnectionMenu = useCallback((connectionId: string, event: ReactMouseEvent<SVGGElement>) => {
    const rect = viewportDivRef.current?.getBoundingClientRect();
    if (!rect) return;
    setConnectionMenu({
      connectionId,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }, []);

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

  const startNodeDrag = useCallback((event: ReactPointerEvent<HTMLElement>, node: NodeGraphNode) => {
    if (!canEdit || isInteractiveTarget(event.target)) return;
    const point = getCanvasPoint(event);
    setNodeDrag({ nodeId: node.id, dx: point.x - node.x, dy: point.y - node.y });
    setNodeDragPreview({ nodeId: node.id, x: node.x, y: node.y });
    event.preventDefault();
    event.stopPropagation();
  }, [canEdit, getCanvasPoint]);

  const startWire = useCallback((event: ReactPointerEvent<HTMLElement>, from: NodeGraphPortRef) => {
    if (!canEdit) return;
    if (event.button !== 0) return;
    setWireDrag({ from, point: getCanvasPoint(event) });
    event.preventDefault();
    event.stopPropagation();
  }, [canEdit, getCanvasPoint]);

  const completeWire = useCallback((event: ReactPointerEvent<HTMLElement>, to: NodeGraphPortRef) => {
    if (!wireDrag) return;
    addConnection(wireDrag.from, to);
    setWireDrag(null);
    event.preventDefault();
    event.stopPropagation();
  }, [addConnection, wireDrag]);

  const handleViewportPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    setConnectionMenu(null);
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
  const nodeElements = useMemo(() => displayedGraph.nodes.map(node => node.kind === 'transform' ? (
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
      type={typeById.get(node.typeId)}
      types={types}
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
  )), [
    canEdit,
    completeWire,
    displayedGraph.nodes,
    evaluation,
    factions,
    regions,
    registerPortAnchor,
    startNodeDrag,
    startWire,
    transforms,
    typeById,
    types,
    updateGraph,
  ]);

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
        connectionMessage={connectionMessage}
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
        {displayedGraph.nodes.length === 0 && (
          <div className="ne-canvas-empty">
            <EmptyState>Drag a type or transform from the left panel to start.</EmptyState>
          </div>
        )}
        {/* Transformed surface — all nodes live here in canvas coords */}
        <div
          className="ne-canvas-surface"
          style={{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: '0 0' }}
        >
          <ConnectionLayer graph={displayedGraph} anchors={portAnchors} pendingWire={wireDrag} onConnectionLabelClick={openConnectionMenu} />
          {nodeElements}
        </div>
        {connectionMenu && (
          <ConnectionFloatingMenu
            connection={graph.connections.find(connection => connection.id === connectionMenu.connectionId) ?? null}
            canEdit={canEdit}
            x={connectionMenu.x}
            y={connectionMenu.y}
            onClose={() => setConnectionMenu(null)}
            onUpdate={patch => updateConnection(connectionMenu.connectionId, patch)}
            onDelete={() => deleteConnection(connectionMenu.connectionId)}
          />
        )}
      </div>

      <ConnectionDrawer
        graph={graph}
        canEdit={canEdit}
        open={connectionsOpen}
        onToggle={() => setConnectionsOpen(open => !open)}
        onDeleteConnection={deleteConnection}
        onUpdateConnection={updateConnection}
      />
    </div>
  );
}

function ConnectionFloatingMenu({
  connection,
  canEdit,
  x,
  y,
  onClose,
  onUpdate,
  onDelete,
}: {
  connection: NodeGraphConnection | null;
  canEdit: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onUpdate: (patch: { mode?: NodeConnectionMode; amount?: number }) => void;
  onDelete: () => void;
}) {
  if (!connection) return null;

  return (
    <div
      className="ne-connection-popover"
      style={{ left: x, top: y }}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="ne-connection-popover-path">
        <span>{connection.from.label}</span>
        <b>→</b>
        <span>{connection.to.label}</span>
      </div>
      <div className="ne-connection-popover-controls">
        <select
          value={connection.mode}
          disabled={!canEdit}
          onChange={event => onUpdate({ mode: event.target.value as NodeConnectionMode })}
        >
          <option value="read">read</option>
          <option value="take">take</option>
        </select>
        {connection.mode === 'take' && (
          <input
            type="number"
            min="0"
            value={connection.amount ?? 0}
            disabled={!canEdit}
            onChange={event => onUpdate({ amount: Number(event.target.value) || 0 })}
          />
        )}
        {canEdit && <button className="ne-connection-delete" onClick={onDelete}>x</button>}
        <button className="ne-connection-popover-close" onClick={onClose}>close</button>
      </div>
    </div>
  );
}
