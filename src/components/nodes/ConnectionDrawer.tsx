import type { NodeConnectionMode, NodeGraph } from '../../game/nodes/types';

interface ConnectionDrawerProps {
  graph: NodeGraph;
  canEdit: boolean;
  open: boolean;
  onToggle: () => void;
  onDeleteConnection: (id: string) => void;
  onUpdateConnection: (id: string, patch: { mode?: NodeConnectionMode; amount?: number }) => void;
}

export function ConnectionDrawer({
  graph,
  canEdit,
  open,
  onToggle,
  onDeleteConnection,
  onUpdateConnection,
}: ConnectionDrawerProps) {
  return (
    <div className="ne-connection-list">
      <button className="ne-connection-list-toggle" onClick={onToggle}>
        {open ? '▾' : '▸'} CONNECTIONS ({graph.connections.length})
      </button>
      {open && graph.connections.length === 0 && (
        <span className="ne-connection-empty">No wires yet.</span>
      )}
      {open && graph.connections.map(connection => (
        <div key={connection.id} className="ne-connection-item">
          <span title={connection.from.label}>{connection.from.label}</span>
          <div className="ne-connection-controls">
            <select
              value={connection.mode}
              disabled={!canEdit}
              onChange={event => onUpdateConnection(connection.id, { mode: event.target.value as NodeConnectionMode })}
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
                onChange={event => onUpdateConnection(connection.id, { amount: Number(event.target.value) || 0 })}
              />
            )}
          </div>
          <span title={connection.to.label}>{connection.to.label}</span>
          {canEdit && (
            <button className="ne-connection-delete" title="Delete wire" onClick={() => onDeleteConnection(connection.id)}>x</button>
          )}
        </div>
      ))}
    </div>
  );
}
