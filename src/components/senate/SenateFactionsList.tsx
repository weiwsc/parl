import { useState } from 'react';
import { useAppContext } from '../../store';
import type { Alliance, Faction, ProjectionEntry } from '../../models/types';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';

interface SenateFactionRowProps {
  faction: Faction;
  entry?: ProjectionEntry;
  autoSeats: number;
  manualSeats: number;
  totalSeats: number;
  showAuto: boolean;
  onSetManual: (seats: number) => void;
}

function SenateFactionRow({
  faction, entry, autoSeats, manualSeats, totalSeats, showAuto, onSetManual,
}: SenateFactionRowProps) {
  const [open, setOpen] = useState(false);
  const seats = entry?.seats ?? 0;
  const pct = totalSeats > 0 ? (seats / totalSeats) * 100 : 0;

  return (
    <div className="fr-wrap">
      <div className="fr">
        <span className="fr-dot" style={{ background: faction.color }} />
        <span className="fr-swatch" style={{ background: faction.color }} />
        <div className="fr-info">
          <span className="fr-name">{faction.name}</span>
          <div className="fr-bar-track">
            <div className="fr-bar-fill" style={{ width: `${pct}%`, background: faction.color, boxShadow: `0 0 7px ${faction.color}66` }} />
          </div>
        </div>
        <span className="fr-seats" style={{ color: faction.color }}>{seats > 0 ? seats : '·'}</span>
        <span className="fr-pct">{pct > 0 ? pct.toFixed(1) + '%' : '·'}</span>
        <button data-ro-allow className={`fr-toggle${open ? ' fr-toggle--open' : ''}`} onClick={() => setOpen(v => !v)}>▾</button>
      </div>
      {open && (
        <div className="fr-detail">
          {showAuto && (
            <div className="senate-seat-auto-row">
              <span className="senate-seat-label">AUTO (controlled regions)</span>
              <span className="senate-seat-auto-val" style={{ color: faction.color }}>{autoSeats}</span>
            </div>
          )}
          <div className="senate-seat-input-row">
            <span className="senate-seat-label">{showAuto ? 'MANUAL EXTRA' : 'SEATS'}</span>
            <input
              type="number"
              min="0"
              step="1"
              className="senate-seat-input"
              value={manualSeats}
              onChange={e => onSetManual(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface SenateAllianceBlockProps {
  alliance: Alliance;
  factions: Faction[];
  autoSeats: Record<string, number>;
  factionSeats: Record<string, number>;
  totalSeats: number;
  showAuto: boolean;
  entries: ProjectionEntry[];
  onSetManual: (factionId: string, seats: number) => void;
}

function SenateAllianceBlock({
  alliance, factions, autoSeats, factionSeats, totalSeats, showAuto, entries, onSetManual,
}: SenateAllianceBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const totalAllianceSeats = entries.reduce((s, e) => s + e.seats, 0);
  const totalShare = totalSeats > 0 ? totalAllianceSeats / totalSeats : 0;

  return (
    <div className="ag" style={{ borderLeftColor: alliance.color }}>
      <div className="ag-head" style={{ borderBottomColor: `${alliance.color}30` }}>
        <button className="ag-collapse" onClick={() => setCollapsed(v => !v)}>
          {collapsed ? '▶' : '▼'}
        </button>
        <span className="ag-diamond" style={{ background: alliance.color, boxShadow: `0 0 8px ${alliance.color}99` }} />
        <div className="ag-info">
          <span className="ag-name" style={{ color: alliance.color }}>{alliance.name}</span>
          <div className="ag-bar-track">
            <div className="ag-bar-fill" style={{ width: `${totalShare * 100}%`, background: alliance.color }} />
          </div>
        </div>
        <span className="ag-seats" style={{ color: alliance.color }}>{totalAllianceSeats > 0 ? totalAllianceSeats : '·'}</span>
        <span className="ag-pct">{totalShare > 0 ? (totalShare * 100).toFixed(1) + '%' : '·'}</span>
      </div>
      {!collapsed && (
        <div className="ag-body">
          {alliance.factionIds.length === 0 ? (
            <div className="ag-drop-hint">No factions in this alliance</div>
          ) : alliance.factionIds.map(fid => {
            const f = factions.find(x => x.id === fid);
            if (!f) return null;
            const entry = entries.find(e => e.faction.id === fid);
            return (
              <SenateFactionRow
                key={fid}
                faction={f}
                entry={entry}
                autoSeats={autoSeats[fid] || 0}
                manualSeats={factionSeats[fid] || 0}
                totalSeats={totalSeats}
                showAuto={showAuto}
                onSetManual={seats => onSetManual(fid, seats)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SenateFactionListProps {
  totalSeats: number;
  autoSeats: Record<string, number>;
  showAuto: boolean;
  entries: ProjectionEntry[];
}

export function SenateFactionsList({ totalSeats, autoSeats, showAuto, entries }: SenateFactionListProps) {
  const { state, updateState } = useAppContext();
  const { factions, alliances } = state;
  const factionSeats = state.senate.factionSeats;

  const setManual = (factionId: string, seats: number) => {
    updateState(s => { s.senate.factionSeats[factionId] = seats; return s; });
  };

  const unallied = factions.filter(f => !alliances.some(a => a.factionIds.includes(f.id)));

  return (
    <Panel title="FACTIONS" subtitle={`${totalSeats} seats total`} bodyClassName="no-scroll">
      {factions.length === 0 ? (
        <EmptyState>No factions defined. Add factions in the Parliament page.</EmptyState>
      ) : (
        <div className="factions-register">
          {alliances.map(alliance => (
            <SenateAllianceBlock
              key={alliance.id}
              alliance={alliance}
              factions={factions}
              autoSeats={autoSeats}
              factionSeats={factionSeats}
              totalSeats={totalSeats}
              showAuto={showAuto}
              entries={entries.filter(e => alliance.factionIds.includes(e.faction.id))}
              onSetManual={setManual}
            />
          ))}
          {unallied.map(f => {
            const entry = entries.find(e => e.faction.id === f.id);
            return (
              <SenateFactionRow
                key={f.id}
                faction={f}
                entry={entry}
                autoSeats={autoSeats[f.id] || 0}
                manualSeats={factionSeats[f.id] || 0}
                totalSeats={totalSeats}
                showAuto={showAuto}
                onSetManual={seats => setManual(f.id, seats)}
              />
            );
          })}
        </div>
      )}
    </Panel>
  );
}
