import { memo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { NodeConnectionMode, NodeGraph } from '../../game/nodes/types';
import type { CanvasPoint, WireDragState } from './nodeCanvasTypes';
import { portKey } from './nodeCanvasUtils';

interface ConnectionLayerProps {
  graph: NodeGraph;
  anchors: Record<string, CanvasPoint>;
  pendingWire: WireDragState | null;
  onConnectionLabelClick?: (connectionId: string, event: ReactMouseEvent<SVGGElement>) => void;
}

export const ConnectionLayer = memo(function ConnectionLayer({ graph, anchors, pendingWire, onConnectionLabelClick }: ConnectionLayerProps) {
  const pendingFrom = pendingWire ? anchors[portKey('output', pendingWire.from)] : null;
  return (
    <svg className="ne-connection-layer">
      {graph.connections.map(connection => {
        const from = anchors[portKey('output', connection.from)];
        const to = anchors[portKey('input', connection.to)];
        if (!from || !to) return null;
        return (
          <ConnectionPath
            key={connection.id}
            connectionId={connection.id}
            from={from}
            to={to}
            mode={connection.mode}
            amount={connection.amount}
            onLabelClick={onConnectionLabelClick}
          />
        );
      })}
      {pendingWire && pendingFrom && (
        <ConnectionPath from={pendingFrom} to={pendingWire.point} mode="read" preview />
      )}
    </svg>
  );
});

const ConnectionPath = memo(function ConnectionPath({
  connectionId,
  from,
  to,
  mode,
  amount,
  preview = false,
  onLabelClick,
}: {
  connectionId?: string;
  from: CanvasPoint;
  to: CanvasPoint;
  mode: NodeConnectionMode;
  amount?: number;
  preview?: boolean;
  onLabelClick?: (connectionId: string, event: ReactMouseEvent<SVGGElement>) => void;
}) {
  const mid = Math.max(70, Math.abs(to.x - from.x) / 2);
  const d = `M ${from.x} ${from.y} C ${from.x + mid} ${from.y}, ${to.x - mid} ${to.y}, ${to.x} ${to.y}`;
  const label = mode === 'take' ? `take ${amount ?? 0}` : 'read';
  const labelX = (from.x + to.x) / 2;
  const labelY = (from.y + to.y) / 2 - 6;
  const labelHitWidth = label.length * 7 + 16;
  return (
    <g>
      <path d={d} className={`ne-conn-line ne-conn-${mode}${preview ? ' ne-conn-preview' : ''}`} />
      {!preview && connectionId && (
        <g
          className="ne-conn-label-group"
          onClick={event => {
            event.stopPropagation();
            onLabelClick?.(connectionId, event);
          }}
        >
          <rect
            className="ne-conn-label-hit"
            x={labelX - labelHitWidth / 2}
            y={labelY - 12}
            width={labelHitWidth}
            height={18}
            rx={2}
          />
          <text x={labelX} y={labelY} className="ne-conn-label">
            {label}
          </text>
        </g>
      )}
    </g>
  );
});
