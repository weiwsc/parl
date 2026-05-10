import React, { useState } from 'react';
import { useAppContext, uid } from '../store';
import {
  escapeHtml,
  fmtCount,
  getComputedFactionStratumSupport,
  getComputedStratumPopulation,
  stratumTotalSupport,
} from '../utils/compute';
import type { Faction, Alliance, ProjectionResult, ProjectionEntry } from '../models/types';
import { useLang } from '../utils/localization';
import { EmptyState } from './ui/EmptyState';
import { Panel } from './ui/Panel';
interface FactionRowProps {
  faction: Faction;
  entry?: ProjectionEntry;
  allianceId: string | null;
  isFirst: boolean;
  isLast: boolean;
}

function FactionRow({ faction, entry, allianceId, isFirst, isLast }: FactionRowProps) {
  const { state, updateState, showToast } = useAppContext();
  const [editOpen, setEditOpen] = useState(false);

  const updateFaction = (field: keyof Faction, value: string) => {
    updateState(s => {
      const idx = s.factions.findIndex(x => x.id === faction.id);
      if (idx !== -1) s.factions[idx] = { ...s.factions[idx], [field]: value };
      return s;
    });
  };

  const deleteFaction = () => {
    if (!window.confirm(`Move faction "${faction.name || 'Untitled Faction'}" to recycle bin?`)) return;

    updateState(s => {
      const idx = s.factions.findIndex(x => x.id === faction.id);
      if (idx !== -1) {
        s.trash.factions.push({ id: faction.id, deletedAt: Date.now(), data: JSON.parse(JSON.stringify(faction)) });
        s.factions.splice(idx, 1);
      }
      s.alliances.forEach(a => { a.factionIds = a.factionIds.filter(id => id !== faction.id); });
      s.map.regions.forEach(region => {
        if (region.factionSupport) delete region.factionSupport[faction.id];
        region.factionControl = region.factionControl.filter(control => control.factionId !== faction.id);
        region.electionModifiers = (region.electionModifiers ?? []).filter(modifier => modifier.factionId !== faction.id);
      });
      return s;
    });
    showToast('Faction moved to bin');
  };

  const moveFaction = (dir: number) => {
    updateState(s => {
      if (allianceId) {
        const a = s.alliances.find(a => a.id === allianceId);
        if (a) {
          const idx = a.factionIds.indexOf(faction.id);
          const target = idx + dir;
          if (target >= 0 && target < a.factionIds.length)
            [a.factionIds[idx], a.factionIds[target]] = [a.factionIds[target], a.factionIds[idx]];
        }
      } else {
        const unallied = s.factions.filter(f => !s.alliances.some(a => a.factionIds.includes(f.id)));
        const ui = unallied.findIndex(f => f.id === faction.id);
        const ut = ui + dir;
        if (ut >= 0 && ut < unallied.length) {
          const gi1 = s.factions.findIndex(f => f.id === faction.id);
          const gi2 = s.factions.findIndex(f => f.id === unallied[ut].id);
          [s.factions[gi1], s.factions[gi2]] = [s.factions[gi2], s.factions[gi1]];
        }
      }
      return s;
    });
  };

  const setParticipates = (participatesInElections: boolean) => {
    updateState(s => {
      const idx = s.factions.findIndex(x => x.id === faction.id);
      if (idx !== -1) s.factions[idx].participatesInElections = participatesInElections;
      return s;
    });
  };

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('factionId', faction.id);
    e.stopPropagation();
  };

  const pct = entry ? entry.share * 100 : 0;
  const seats = entry ? entry.seats : 0;

  return (
    <div className="fr-wrap">
      <div className="fr" draggable onDragStart={onDragStart}>
        <span className="fr-dot" style={{ background: faction.color }} />

        <span className="fr-swatch" style={{ background: faction.color }}>
    <input type="color" value={faction.color} onChange={e => updateFaction('color', e.target.value)} />
  </span>

        {/* --- NEW WRAPPER START --- */}
        <div className="fr-info">
          <input
              className="fr-name"
              value={faction.name}
              onChange={e => updateFaction('name', e.target.value)}
          />
          <div className="fr-bar-track">
            <div
                className="fr-bar-fill"
                style={{ width: `${pct}%`, background: faction.color, boxShadow: `0 0 7px ${faction.color}66` }}
            />
          </div>
        </div>
        {/* --- NEW WRAPPER END --- */}

        <span className="fr-seats" style={{ color: faction.color }}>{seats > 0 ? seats : '·'}</span>
        <span className="fr-pct">{pct > 0 ? pct.toFixed(1) + '%' : '·'}</span>
        <label className="fr-election-toggle" title="Participates in parliament elections">
          <input
            type="checkbox"
            checked={faction.participatesInElections === true}
            onChange={e => setParticipates(e.target.checked)}
          />
          <span>Election</span>
        </label>
        <button data-ro-allow className={`fr-toggle${editOpen ? ' fr-toggle--open' : ''}`} onClick={() => setEditOpen(v => !v)}>▾</button>
      </div>
      {editOpen && (
        <div className="fr-detail">
          <div className="fr-detail-actions">
            <button className="small" onClick={() => moveFaction(-1)} disabled={isFirst}
              title={allianceId ? 'Move up in alliance (← left in chart)' : 'Move left in chart'}>
              {allianceId ? '↑' : '←'}
            </button>
            <button className="small" onClick={() => moveFaction(1)} disabled={isLast}
              title={allianceId ? 'Move down in alliance (→ right in chart)' : 'Move right in chart'}>
              {allianceId ? '↓' : '→'}
            </button>
            <button className="small danger ghost" onClick={deleteFaction}>Delete</button>
          </div>
          {state.strata.length === 0 ? (
            <EmptyState className="compact-empty">No strata defined.</EmptyState>
          ) : state.strata.map(s => {
            const v = getComputedFactionStratumSupport(state, faction.id, s.id);
            const population = getComputedStratumPopulation(state, s);
            const over = stratumTotalSupport(state, s) > population;
            return (
              <div key={s.id} className={`stratum-support-row${over ? ' over' : ''}`}>
                <label>
                  <span className="lbl-name">{escapeHtml(s.name)}</span>
                  <span className="popinfo">/{fmtCount(population)}</span>
                </label>
                <span className="computed-support-value">{fmtCount(v)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface AllianceBlockProps {
  alliance: Alliance;
  isFirst: boolean;
  isLast: boolean;
  projection?: ProjectionResult;
}

function AllianceBlock({ alliance, isFirst, isLast, projection }: AllianceBlockProps) {
  const { state, updateState, showToast } = useAppContext();
  const [collapsed, setCollapsed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const entries = projection?.entries.filter(e => alliance.factionIds.includes(e.faction.id)) || [];
  const totalSeats = entries.reduce((s, e) => s + e.seats, 0);
  const totalShare = entries.reduce((s, e) => s + e.share, 0);

  const updateColor = (color: string) => updateState(s => { const a = s.alliances.find(a => a.id === alliance.id); if (a) a.color = color; return s; });
  const updateName  = (name: string)  => updateState(s => { const a = s.alliances.find(a => a.id === alliance.id); if (a) a.name = name;   return s; });

  const deleteAlliance = () => {
    if (!window.confirm(`Move alliance "${alliance.name || 'Untitled Alliance'}" to recycle bin?`)) return;

    updateState(s => {
      const idx = s.alliances.findIndex(a => a.id === alliance.id);
      if (idx !== -1) {
        s.trash.alliances.push({ id: alliance.id, deletedAt: Date.now(), data: JSON.parse(JSON.stringify(alliance)) });
        s.alliances.splice(idx, 1);
      }
      return s;
    });
    showToast('Alliance moved to bin');
  };

  const moveAlliance = (dir: number) => {
    updateState(s => {
      const idx = s.alliances.findIndex(a => a.id === alliance.id);
      if (idx !== -1) {
        const t = idx + dir;
        if (t >= 0 && t < s.alliances.length) [s.alliances[idx], s.alliances[t]] = [s.alliances[t], s.alliances[idx]];
      }
      return s;
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const fid = e.dataTransfer.getData('factionId');
    if (!fid) return;
    updateState(s => {
      s.alliances.forEach(a => { a.factionIds = a.factionIds.filter(id => id !== fid); });
      const t = s.alliances.find(a => a.id === alliance.id);
      if (t && !t.factionIds.includes(fid)) t.factionIds.push(fid);
      return s;
    });
  };

  return (
    <div className="ag" style={{ borderLeftColor: alliance.color }} onDrop={onDrop} onDragOver={e => e.preventDefault()}>
      <div className="ag-head" style={{ borderBottomColor: `${alliance.color}30` }}>
        <button className="ag-collapse" onClick={() => setCollapsed(v => !v)}>
          {collapsed ? '▶' : '▼'}
        </button>

        <span className="ag-diamond" style={{ background: alliance.color, boxShadow: `0 0 8px ${alliance.color}99` }} />

        {/* NEW WRAPPER: This will grow to fill the center */}
        <div className="ag-info">
          <input
              className="ag-name"
              value={alliance.name}
              onChange={e => updateName(e.target.value)}
              style={{ color: alliance.color }}
          />
          <div className="ag-bar-track">
            <div
                className="ag-bar-fill"
                style={{ width: `${totalShare * 100}%`, background: alliance.color, boxShadow: `0 0 10px ${alliance.color}55` }}
            />
          </div>
        </div>

        <span className="ag-swatch" style={{ background: alliance.color }}>
    <input type="color" value={alliance.color} onChange={e => updateColor(e.target.value)} />
  </span>
        <span className="ag-seats" style={{ color: alliance.color }}>{totalSeats > 0 ? totalSeats : '·'}</span>
        <span className="ag-pct">{totalShare > 0 ? (totalShare * 100).toFixed(1) + '%' : '·'}</span>
        <button data-ro-allow className={`fr-toggle${editOpen ? ' fr-toggle--open' : ''}`} onClick={() => setEditOpen(v => !v)}>⋯</button>
      </div>

      {editOpen && (
        <div className="ag-edit-row">
          <button className="small" onClick={() => moveAlliance(-1)} disabled={isFirst}>↑ Up</button>
          <button className="small" onClick={() => moveAlliance(1)} disabled={isLast}>↓ Down</button>
          <button className="small danger ghost" onClick={deleteAlliance}>Delete Alliance</button>
        </div>
      )}

      {!collapsed && (
        <div className="ag-body">
          {alliance.factionIds.length === 0 ? (
            <div className="ag-drop-hint">Drop factions here to form alliance</div>
          ) : (
            alliance.factionIds.map((fid, idx) => {
              const f = state.factions.find(x => x.id === fid);
              if (!f) return null;
              const entry = projection?.entries.find(e => e.faction.id === f.id);
              return <FactionRow key={f.id} faction={f} entry={entry} allianceId={alliance.id} isFirst={idx === 0} isLast={idx === alliance.factionIds.length - 1} />;
            })
          )}
        </div>
      )}
    </div>
  );
}

export function FactionsList({ projection }: { projection?: ProjectionResult }) {
  const { state, updateState, showToast } = useAppContext();
  const t = useLang();

  const addFaction = () => {
    updateState(s => {
      const palette = ['#7a2030','#2c6fb1','#d4a14a','#c44a2a','#5fa863','#8a4cb1','#3aa39e','#b8862e','#aa5f8e','#4a8a3e'];
      s.factions.push({
        id: uid('f'),
        name: 'New Faction',
        description: '',
        color: palette[s.factions.length % palette.length],
        globalModifiers: [],
        participatesInElections: false,
      });
      return s;
    });
  };

  const createAlliance = () => {
    updateState(s => {
      s.alliances.push({ id: uid('a'), name: 'New Alliance', color: '#5f8faf', factionIds: [] });
      return s;
    });
    showToast('Alliance created');
  };

  const onDropUnallied = (e: React.DragEvent) => {
    e.preventDefault();
    const fid = e.dataTransfer.getData('factionId');
    if (!fid) return;
    updateState(s => { s.alliances.forEach(a => { a.factionIds = a.factionIds.filter(id => id !== fid); }); return s; });
  };

  const unallied = state.factions.filter(f => !state.alliances.some(a => a.factionIds.includes(f.id)));
  const hasAlliances = state.alliances.length > 0;

  return (
    <Panel title={t("political_factions")}>
      <div onDrop={onDropUnallied} onDragOver={e => e.preventDefault()}>
        {!hasAlliances && unallied.length === 0 ? (
          <EmptyState>No factions created.</EmptyState>
        ) : (
          <div className="factions-register">
            {state.alliances.map((alliance, index) => (
              <AllianceBlock key={alliance.id} alliance={alliance} isFirst={index === 0} isLast={index === state.alliances.length - 1} projection={projection} />
            ))}
            {unallied.length > 0 && (
              <>
                {hasAlliances && <div className="register-section-label">Unallied</div>}
                {unallied.map((faction, index) => {
                  const entry = projection?.entries.find(e => e.faction.id === faction.id);
                  return <FactionRow key={faction.id} faction={faction} entry={entry} allianceId={null} isFirst={index === 0} isLast={index === unallied.length - 1} />;
                })}
              </>
            )}
          </div>
        )}
        <div className="factions-add-row">
          <button className="add-btn" onClick={addFaction}>+ {t("add_faction")}</button>
          <button className="add-btn" onClick={createAlliance}>+ {t("add_alliance")}</button>
        </div>
      </div>
    </Panel>
  );
}
