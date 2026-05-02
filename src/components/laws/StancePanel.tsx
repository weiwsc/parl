import { useMemo, useState } from 'react';
import type { FactionStance, Law, ProjectionEntry } from '../../models/types';

interface StancePanelProps {
  law: Law;
  entries: ProjectionEntry[];
  onUpdateStance: (factionId: string, stance: FactionStance) => void;
  canEdit: boolean;
}

export function StancePanel({ law, entries, onUpdateStance, canEdit }: StancePanelProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<FactionStance | null>(null);

  const grouped = useMemo(() => {
    const support: ProjectionEntry[] = [], abstain: ProjectionEntry[] = [], against: ProjectionEntry[] = [];
    for (const entry of entries) {
      if (entry.isUnaligned) continue;
      const stance = law.factionStances[entry.faction.id] ?? 'abstain';
      if (stance === 'support') support.push(entry);
      else if (stance === 'against') against.push(entry);
      else abstain.push(entry);
    }
    return { support, abstain, against };
  }, [law.factionStances, entries]);

  const columns: { key: FactionStance; label: string; color: string; entries: ProjectionEntry[] }[] = [
    { key: 'support', label: 'SUPPORT', color: 'var(--good)', entries: grouped.support },
    { key: 'abstain', label: 'ABSTAIN', color: 'var(--neutral)', entries: grouped.abstain },
    { key: 'against', label: 'AGAINST', color: 'var(--danger)', entries: grouped.against },
  ];

  return (
    <div className="stance-panel">
      {columns.map(column => (
        <div
          key={column.key}
          className={`stance-col${dropTarget === column.key ? ' drop-active' : ''}`}
          onDragOver={canEdit ? e => { e.preventDefault(); setDropTarget(column.key); } : undefined}
          onDragLeave={canEdit ? () => setDropTarget(null) : undefined}
          onDrop={canEdit ? e => {
            e.preventDefault();
            if (draggingId) onUpdateStance(draggingId, column.key);
            setDraggingId(null);
            setDropTarget(null);
          } : undefined}
        >
          <div className="stance-col-hd" style={{ borderBottomColor: column.color }}>
            <span style={{ color: column.color }}>{column.label}</span>
            <span className="stance-col-count">{column.entries.reduce((sum, entry) => sum + entry.seats, 0)} seats</span>
          </div>
          <div className="stance-chips">
            {column.entries.map(entry => (
              <div
                key={entry.faction.id}
                className={`stance-chip${draggingId === entry.faction.id ? ' dragging' : ''}${canEdit ? ' draggable' : ''}`}
                draggable={canEdit}
                onDragStart={() => setDraggingId(entry.faction.id)}
                onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
              >
                <span className="chip-dot" style={{ background: entry.faction.color }} />
                <span className="chip-name">{entry.faction.name}</span>
                <span className="chip-seats">{entry.seats}</span>
              </div>
            ))}
            {column.entries.length === 0 && <div className="stance-col-empty">drop here</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
