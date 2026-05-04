import { useMemo, useState } from 'react';
import type { FactionStance, Law, ProjectionEntry } from '../../models/types';

interface StancePanelProps {
  law: Law;
  entries: ProjectionEntry[];
  onUpdateStance: (factionId: string, stance: FactionStance) => void;
  canEdit: boolean;
  editableFactionId?: string | null;
}

export function StancePanel({ law, entries, onUpdateStance, canEdit, editableFactionId }: StancePanelProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<FactionStance | null>(null);
  const hasEditableFaction = canEdit || !!editableFactionId;
  const canDragFaction = (factionId: string) => canEdit || editableFactionId === factionId;
  const playerEntry = editableFactionId
    ? entries.find(entry => entry.faction.id === editableFactionId)
    : null;
  const playerStance = editableFactionId ? (law.factionStances[editableFactionId] ?? 'abstain') : null;
  const showPlayerMobileVote = !canEdit && !!editableFactionId && !!playerEntry;

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
    <>
      {showPlayerMobileVote && (
        <div className="player-mobile-vote" aria-label="Your faction vote">
          <div className="player-mobile-vote__meta">
            <span className="player-mobile-vote__label">YOUR VOTE</span>
            <span className="player-mobile-vote__faction">
              <span className="chip-dot" style={{ background: playerEntry.faction.color }} />
              {playerEntry.faction.name}
            </span>
          </div>
          <div className="player-mobile-vote__buttons">
            {columns.map(column => (
              <button
                key={column.key}
                type="button"
                className={`player-vote-btn player-vote-btn--${column.key}${playerStance === column.key ? ' active' : ''}`}
                aria-pressed={playerStance === column.key}
                onClick={() => onUpdateStance(editableFactionId, column.key)}
              >
                {column.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="stance-panel">
        {columns.map(column => (
          <div
            key={column.key}
            className={`stance-col${dropTarget === column.key ? ' drop-active' : ''}`}
            onDragOver={hasEditableFaction ? e => { e.preventDefault(); setDropTarget(column.key); } : undefined}
            onDragLeave={hasEditableFaction ? () => setDropTarget(null) : undefined}
            onDrop={hasEditableFaction ? e => {
              e.preventDefault();
              if (draggingId && canDragFaction(draggingId)) onUpdateStance(draggingId, column.key);
              setDraggingId(null);
              setDropTarget(null);
            } : undefined}
          >
            <div className="stance-col-hd" style={{ borderBottomColor: column.color }}>
              <span style={{ color: column.color }}>{column.label}</span>
              <span className="stance-col-count">{column.entries.reduce((sum, entry) => sum + entry.seats, 0)} seats</span>
            </div>
            <div className="stance-chips">
              {column.entries.map(entry => {
                const canDrag = canDragFaction(entry.faction.id);
                return (
                  <div
                    key={entry.faction.id}
                    className={`stance-chip${draggingId === entry.faction.id ? ' dragging' : ''}${canDrag ? ' draggable' : ' locked'}`}
                    draggable={canDrag}
                    onDragStart={canDrag ? () => setDraggingId(entry.faction.id) : undefined}
                    onDragEnd={canDrag ? () => { setDraggingId(null); setDropTarget(null); } : undefined}
                  >
                    <span className="chip-dot" style={{ background: entry.faction.color }} />
                    <span className="chip-name">{entry.faction.name}</span>
                    <span className="chip-seats">{entry.seats}</span>
                  </div>
                );
              })}
              {column.entries.length === 0 && <div className="stance-col-empty">drop here</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
