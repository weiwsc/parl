import type { NodeConnectionMode, NodeGraph } from '../../game/nodes/types';
import type { CanvasPoint, WireDragState } from './nodeCanvasTypes';
import { portKey } from './nodeCanvasUtils';

interface ConnectionLayerProps {
  graph: NodeGraph;
  anchors: Record<string, CanvasPoint>;
  pendingWire: WireDragState | null;
}

export function ConnectionLayer({ graph, anchors, pendingWire }: ConnectionLayerProps) {
  const pendingFrom = pendingWire ? anchors[portKey('output', pendingWire.from)] : null;
  return (
    <svg className="ne-connection-layer">
      {graph.connections.map(connection => {
        const from = anchors[portKey('output', connection.from)];
        const to = anchors[portKey('input', connection.to)];
        if (!from || !to) return null;
        return <ConnectionPath key={connection.id} from={from} to={to} mode={connection.mode} amount={connection.amount} />;
      })}
      {pendingWire && pendingFrom && (
        <ConnectionPath from={pendingFrom} to={pendingWire.point} mode="read" preview />
      )}
    </svg>
  );
}

function ConnectionPath({
  from,
  to,
  mode,
  amount,
  preview = false,
}: {
  from: CanvasPoint;
  to: CanvasPoint;
  mode: NodeConnectionMode;
  amount?: number;
  preview?: boolean;
}) {
  const mid = Math.max(70, Math.abs(to.x - from.x) / 2);
  const d = `M ${from.x} ${from.y} C ${from.x + mid} ${from.y}, ${to.x - mid} ${to.y}, ${to.x} ${to.y}`;
  return (
    <g>
      <path d={d} className={`ne-conn-line ne-conn-${mode}${preview ? ' ne-conn-preview' : ''}`} />
      {!preview && (
        <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6} className="ne-conn-label">
          {mode === 'take' ? `take ${amount ?? 0}` : 'read'}
        </text>
      )}
    </g>
  );
}
