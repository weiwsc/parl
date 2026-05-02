import type { NodeGraph } from '../../game/nodes/types';

interface ConnectionDrawerProps {
  graph: NodeGraph;
  canEdit: boolean;
  open: boolean;
  onToggle: () => void;
  onDeleteConnection: (id: string) => void;
}

export function ConnectionDrawer({
  graph,
  canEdit,
  open,
  onToggle,
  onDeleteConnection,
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
          <span>{connection.from.label}</span>
          <b>{connection.mode === 'take' ? `take ${connection.amount ?? 0}` : 'read'}</b>
          <span>{connection.to.label}</span>
          {canEdit && (
            <button className="clause-btn clause-del" onClick={() => onDeleteConnection(connection.id)}>x</button>
          )}
        </div>
      ))}
    </div>
  );
}
