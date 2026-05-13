import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import type { Alliance, Faction, HistoryEntry, ProjectionEntry, ProjectionResult } from '../models/types';
import { useAuth } from '../context/AuthContext';
import { uid, useAppContext } from '../store';
import {
  fmtFull,
  getCurrentParliamentSnapshot,
  getProjectionFactionIds,
  getProjectionUnassignedSeats,
  rebuildElectionSnapshotProjection,
} from '../utils/compute';
import { useLang } from '../utils/localization';
import { ProjectionChart } from './Projection';
import { EmptyState } from './ui/EmptyState';
import { Panel } from './ui/Panel';

const SNAPSHOT_ALLIANCE_COLORS = ['#5f8faf', '#70b87e', '#d4a14a', '#b9616b', '#8c78c6', '#45a7a0'];

function normalizedSeatDelta(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

function baseSeatMap(entry: HistoryEntry): Map<string, number> {
  return new Map((entry.projection?.entries ?? [])
    .filter(projectionEntry => !projectionEntry.isUnaligned)
    .map(projectionEntry => [projectionEntry.faction.id, projectionEntry.seats]));
}

function seatDeltaBounds(entry: HistoryEntry, factionId: string): { min: number; max: number } {
  const baseSeats = baseSeatMap(entry);
  const min = -Math.max(0, baseSeats.get(factionId) ?? 0);
  let released = 0;
  let spent = 0;

  for (const [candidateId, seats] of baseSeats) {
    if (candidateId === factionId) continue;
    const delta = Math.max(normalizedSeatDelta(entry.seatAdjustments?.[candidateId]), -seats);
    if (delta < 0) released += -delta;
    if (delta > 0) spent += delta;
  }

  return { min, max: Math.max(0, released - spent) };
}

interface SnapshotFactionRowProps {
  faction: Faction;
  entry?: ProjectionEntry;
  baseSeats: number;
  seatDelta: number;
  unassignedSeats: number;
  seatDeltaMax: number;
  allianceId: string | null;
  isFirst: boolean;
  isLast: boolean;
  canEdit: boolean;
  onMove: (factionId: string, allianceId: string | null, dir: number) => void;
  onSeatAdjustmentChange: (factionId: string, delta: number) => void;
}

function SnapshotFactionRow({
  faction,
  entry,
  baseSeats,
  seatDelta,
  unassignedSeats,
  seatDeltaMax,
  allianceId,
  isFirst,
  isLast,
  canEdit,
  onMove,
  onSeatAdjustmentChange,
}: SnapshotFactionRowProps) {
  const [editOpen, setEditOpen] = useState(false);
  const pct = entry ? entry.share * 100 : 0;
  const seats = entry ? entry.seats : 0;

  const onDragStart = (event: DragEvent) => {
    if (!canEdit) return;
    event.dataTransfer.setData('factionId', faction.id);
    event.stopPropagation();
  };

  return (
    <div className="fr-wrap current-parliament-fr-wrap">
      <div className="fr current-parliament-fr" draggable={canEdit} onDragStart={onDragStart}>
        <span className="fr-dot" style={{ background: faction.color }} />
        <span className="fr-swatch current-parliament-static-swatch" style={{ background: faction.color }} />
        <div className="fr-info">
          <span className="fr-name current-parliament-static-name">{faction.name}</span>
          <div className="fr-bar-track">
            <div
              className="fr-bar-fill"
              style={{ width: `${pct}%`, background: faction.color, boxShadow: `0 0 7px ${faction.color}66` }}
            />
          </div>
        </div>
        <span className="fr-seats" style={{ color: faction.color }}>{seats > 0 ? seats : '·'}</span>
        <span className="fr-pct">{pct > 0 ? pct.toFixed(1) + '%' : '·'}</span>
        {entry && <span className="current-parliament-power">{fmtFull(entry.power)}</span>}
        {canEdit && (
          <button data-ro-allow className={`fr-toggle${editOpen ? ' fr-toggle--open' : ''}`} onClick={() => setEditOpen(current => !current)}>▾</button>
        )}
      </div>
      {canEdit && editOpen && (
        <div className="fr-detail current-parliament-fr-detail">
          <div className="fr-detail-actions current-parliament-actions">
            <button className="small" onClick={() => onMove(faction.id, allianceId, -1)} disabled={isFirst} title="Move left in the parliament chart">
              ← Left
            </button>
            <button className="small" onClick={() => onMove(faction.id, allianceId, 1)} disabled={isLast} title="Move right in the parliament chart">
              Right →
            </button>
          </div>
          <div className="current-parliament-seat-editor">
            <span className="current-parliament-seat-label">Floor Seats</span>
            <span className="current-parliament-seat-stat">Base <b>{baseSeats}</b></span>
            <label className="current-parliament-seat-delta">
              <span>Delta</span>
              <input
                type="number"
                step="1"
                min={-baseSeats}
                max={seatDeltaMax}
                value={seatDelta}
                onChange={event => onSeatAdjustmentChange(faction.id, normalizedSeatDelta(event.target.value))}
              />
            </label>
            <span className="current-parliament-seat-stat">Now <b>{seats}</b></span>
            <span className={`current-parliament-seat-free${unassignedSeats > 0 ? ' active' : ''}`}>
              Free <b>{unassignedSeats}</b>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface SnapshotAllianceBlockProps {
  alliance: Alliance;
  factions: Faction[];
  projection: ProjectionResult;
  isFirst: boolean;
  isLast: boolean;
  canEdit: boolean;
  onAllianceChange: (allianceId: string, patch: Partial<Pick<Alliance, 'name' | 'color'>>) => void;
  onAllianceMove: (allianceId: string, dir: number) => void;
  onAllianceDelete: (allianceId: string) => void;
  onFactionMove: (factionId: string, allianceId: string | null, dir: number) => void;
  onFactionAllianceChange: (factionId: string, allianceId: string | null) => void;
  getSeatEditorState: (factionId: string) => {
    baseSeats: number;
    seatDelta: number;
    seatDeltaMax: number;
    unassignedSeats: number;
  };
  onSeatAdjustmentChange: (factionId: string, delta: number) => void;
}

function SnapshotAllianceBlock({
  alliance,
  factions,
  projection,
  isFirst,
  isLast,
  canEdit,
  onAllianceChange,
  onAllianceMove,
  onAllianceDelete,
  onFactionMove,
  onFactionAllianceChange,
  getSeatEditorState,
  onSeatAdjustmentChange,
}: SnapshotAllianceBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const entryByFaction = new Map(projection.entries.map(entry => [entry.faction.id, entry]));
  const factionIds = alliance.factionIds.filter(factionId => entryByFaction.has(factionId));
  const entries = factionIds.map(factionId => entryByFaction.get(factionId)).filter((entry): entry is ProjectionEntry => !!entry);
  const totalSeats = entries.reduce((sum, entry) => sum + entry.seats, 0);
  const totalShare = entries.reduce((sum, entry) => sum + entry.share, 0);

  const onDrop = (event: DragEvent) => {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    const factionId = event.dataTransfer.getData('factionId');
    if (factionId) onFactionAllianceChange(factionId, alliance.id);
  };

  return (
    <div
      className="ag current-parliament-ag"
      style={{ borderLeftColor: alliance.color }}
      onDrop={onDrop}
      onDragOver={event => {
        if (canEdit) event.preventDefault();
      }}
    >
      <div className="ag-head" style={{ borderBottomColor: `${alliance.color}30` }}>
        <button data-ro-allow className="ag-collapse" onClick={() => setCollapsed(current => !current)}>
          {collapsed ? '▶' : '▼'}
        </button>
        <span className="ag-diamond" style={{ background: alliance.color, boxShadow: `0 0 8px ${alliance.color}99` }} />
        <div className="ag-info">
          {canEdit ? (
            <input
              className="ag-name"
              value={alliance.name}
              onChange={event => onAllianceChange(alliance.id, { name: event.target.value })}
              style={{ color: alliance.color }}
            />
          ) : (
            <span className="ag-name current-parliament-static-name" style={{ color: alliance.color }}>{alliance.name}</span>
          )}
          <div className="ag-bar-track">
            <div
              className="ag-bar-fill"
              style={{ width: `${totalShare * 100}%`, background: alliance.color, boxShadow: `0 0 10px ${alliance.color}55` }}
            />
          </div>
        </div>
        {canEdit ? (
          <span className="ag-swatch" style={{ background: alliance.color }}>
            <input type="color" value={alliance.color} onChange={event => onAllianceChange(alliance.id, { color: event.target.value })} />
          </span>
        ) : (
          <span className="ag-swatch current-parliament-static-swatch" style={{ background: alliance.color }} />
        )}
        <span className="ag-seats" style={{ color: alliance.color }}>{totalSeats > 0 ? totalSeats : '·'}</span>
        <span className="ag-pct">{totalShare > 0 ? (totalShare * 100).toFixed(1) + '%' : '·'}</span>
        {canEdit && (
          <button data-ro-allow className={`fr-toggle${editOpen ? ' fr-toggle--open' : ''}`} onClick={() => setEditOpen(current => !current)}>⋯</button>
        )}
      </div>

      {canEdit && editOpen && (
        <div className="ag-edit-row current-parliament-actions">
          <button className="small" onClick={() => onAllianceMove(alliance.id, -1)} disabled={isFirst}>← Alliance</button>
          <button className="small" onClick={() => onAllianceMove(alliance.id, 1)} disabled={isLast}>Alliance →</button>
          <button className="small danger ghost" onClick={() => onAllianceDelete(alliance.id)}>Delete Alliance</button>
        </div>
      )}

      {!collapsed && (
        <div className="ag-body">
          {factionIds.length === 0 ? (
            <div className="ag-drop-hint">Drop factions here for this election result</div>
          ) : factionIds.map((factionId, index) => {
            const faction = factions.find(item => item.id === factionId);
            const entry = entryByFaction.get(factionId);
            if (!faction || !entry) return null;
            return (
              <SnapshotFactionRow
                key={faction.id}
                faction={faction}
                entry={entry}
                {...getSeatEditorState(faction.id)}
                allianceId={alliance.id}
                isFirst={index === 0}
                isLast={index === factionIds.length - 1}
                canEdit={canEdit}
                onMove={onFactionMove}
                onSeatAdjustmentChange={onSeatAdjustmentChange}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CurrentParliamentPanel() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit } = useAuth();
  const t = useLang();

  const currentParliament = useMemo(() => getCurrentParliamentSnapshot(state), [state]);
  const latest = currentParliament.election;
  const projection = currentParliament.projection;

  if (!latest || !projection) {
    return (
      <Panel title={t('current_parliament')}>
        <EmptyState>{t('no_current_parliament')}</EmptyState>
      </Panel>
    );
  }

  const activeFactionIds = getProjectionFactionIds(projection);
  const entryByFaction = new Map(projection.entries.map(entry => [entry.faction.id, entry]));
  const factions = currentParliament.factions.filter(faction => activeFactionIds.has(faction.id));
  const unallied = factions.filter(faction => !latest.alliances.some(alliance => alliance.factionIds.includes(faction.id)));
  const entries = projection.entries.filter(entry => !entry.isUnaligned);
  const baseSeats = baseSeatMap(latest);
  const unassignedSeats = getProjectionUnassignedSeats(projection);
  const timestamp = new Date(latest.timestamp).toLocaleString();

  const updateLatestElection = (mutator: (entry: HistoryEntry) => void) => {
    updateState(appState => {
      const target = appState.history.find(entry => entry.id === latest.id);
      if (!target) return appState;
      mutator(target);
      rebuildElectionSnapshotProjection(target);
      return appState;
    });
  };

  const addSnapshotAlliance = () => {
    updateLatestElection(entry => {
      const color = SNAPSHOT_ALLIANCE_COLORS[entry.alliances.length % SNAPSHOT_ALLIANCE_COLORS.length];
      entry.alliances.push({ id: uid('ha'), name: 'New Alliance', color, factionIds: [] });
    });
    showToast('Election result alliance created');
  };

  const updateSnapshotAlliance = (allianceId: string, patch: Partial<Pick<Alliance, 'name' | 'color'>>) => {
    updateLatestElection(entry => {
      const alliance = entry.alliances.find(item => item.id === allianceId);
      if (alliance) Object.assign(alliance, patch);
    });
  };

  const deleteSnapshotAlliance = (allianceId: string) => {
    const alliance = latest.alliances.find(item => item.id === allianceId);
    if (!alliance) return;
    if (!window.confirm(`Remove alliance "${alliance.name || 'Untitled Alliance'}" from this election result?`)) return;
    updateLatestElection(entry => {
      entry.alliances = entry.alliances.filter(item => item.id !== allianceId);
    });
  };

  const moveSnapshotAlliance = (allianceId: string, dir: number) => {
    updateLatestElection(entry => {
      const index = entry.alliances.findIndex(alliance => alliance.id === allianceId);
      const target = index + dir;
      if (index >= 0 && target >= 0 && target < entry.alliances.length) {
        [entry.alliances[index], entry.alliances[target]] = [entry.alliances[target], entry.alliances[index]];
      }
    });
  };

  const setSnapshotFactionAlliance = (factionId: string, allianceId: string | null) => {
    updateLatestElection(entry => {
      entry.alliances.forEach(alliance => {
        alliance.factionIds = alliance.factionIds.filter(id => id !== factionId);
      });
      if (!allianceId) return;
      const target = entry.alliances.find(alliance => alliance.id === allianceId);
      if (target && !target.factionIds.includes(factionId)) target.factionIds.push(factionId);
    });
  };

  const moveSnapshotFaction = (factionId: string, allianceId: string | null, dir: number) => {
    updateLatestElection(entry => {
      if (allianceId) {
        const alliance = entry.alliances.find(item => item.id === allianceId);
        if (!alliance) return;
        const index = alliance.factionIds.indexOf(factionId);
        const target = index + dir;
        if (index >= 0 && target >= 0 && target < alliance.factionIds.length) {
          [alliance.factionIds[index], alliance.factionIds[target]] = [alliance.factionIds[target], alliance.factionIds[index]];
        }
        return;
      }

      const unalliedIds = entry.factions
        .filter(faction => !entry.alliances.some(alliance => alliance.factionIds.includes(faction.id)))
        .filter(faction => activeFactionIds.has(faction.id))
        .map(faction => faction.id);
      const index = unalliedIds.indexOf(factionId);
      const targetFactionId = unalliedIds[index + dir];
      if (!targetFactionId) return;
      const first = entry.factions.findIndex(faction => faction.id === factionId);
      const second = entry.factions.findIndex(faction => faction.id === targetFactionId);
      if (first >= 0 && second >= 0) {
        [entry.factions[first], entry.factions[second]] = [entry.factions[second], entry.factions[first]];
      }
    });
  };

  const updateSnapshotSeatAdjustment = (factionId: string, requestedDelta: number) => {
    updateLatestElection(entry => {
      const bounds = seatDeltaBounds(entry, factionId);
      let nextDelta = Math.max(bounds.min, normalizedSeatDelta(requestedDelta));
      if (nextDelta > 0) nextDelta = Math.min(nextDelta, bounds.max);

      const nextAdjustments = { ...(entry.seatAdjustments ?? {}) };
      if (nextDelta === 0) delete nextAdjustments[factionId];
      else nextAdjustments[factionId] = nextDelta;

      entry.seatAdjustments = Object.keys(nextAdjustments).length > 0 ? nextAdjustments : undefined;
    });
  };

  const getSeatEditorState = (factionId: string) => {
    const bounds = seatDeltaBounds(latest, factionId);
    return {
      baseSeats: Math.max(0, baseSeats.get(factionId) ?? 0),
      seatDelta: normalizedSeatDelta(latest.seatAdjustments?.[factionId]),
      seatDeltaMax: bounds.max,
      unassignedSeats,
    };
  };

  const onDropUnallied = (event: DragEvent) => {
    if (!canEdit) return;
    event.preventDefault();
    const factionId = event.dataTransfer.getData('factionId');
    if (factionId) setSnapshotFactionAlliance(factionId, null);
  };

  return (
    <div className="current-parliament-grid">
      <ProjectionChart projection={projection} title={t('current_parliament')} />

      <Panel
        title={latest.name || t('latest_election')}
        subtitle={timestamp}
        bodyClassName="current-parliament-body"
      >
        <div className="current-parliament-meta">
          <span>{latest.totalSeats} {t('seats')}</span>
          <span>{entries.length} {t('factions')}</span>
          <span>{latest.alliances.length} {t('alliances')}</span>
          <span className={unassignedSeats > 0 ? 'current-parliament-unassigned active' : 'current-parliament-unassigned'}>
            {unassignedSeats} unassigned
          </span>
        </div>

        <div
          className="factions-register current-parliament-register"
          onDrop={onDropUnallied}
          onDragOver={event => {
            if (canEdit) event.preventDefault();
          }}
        >
          {latest.alliances.map((alliance, index) => (
            <SnapshotAllianceBlock
              key={alliance.id}
              alliance={alliance}
              factions={factions}
              projection={projection}
              isFirst={index === 0}
              isLast={index === latest.alliances.length - 1}
              canEdit={canEdit}
              onAllianceChange={updateSnapshotAlliance}
              onAllianceMove={moveSnapshotAlliance}
              onAllianceDelete={deleteSnapshotAlliance}
              onFactionMove={moveSnapshotFaction}
              onFactionAllianceChange={setSnapshotFactionAlliance}
              getSeatEditorState={getSeatEditorState}
              onSeatAdjustmentChange={updateSnapshotSeatAdjustment}
            />
          ))}
          {unallied.length > 0 && (
            <>
              {latest.alliances.length > 0 && <div className="register-section-label">Unallied in this result</div>}
              {unallied.map((faction, index) => {
                const entry = entryByFaction.get(faction.id);
                return (
                  <SnapshotFactionRow
                    key={faction.id}
                    faction={faction}
                    entry={entry}
                    {...getSeatEditorState(faction.id)}
                    allianceId={null}
                    isFirst={index === 0}
                    isLast={index === unallied.length - 1}
                    canEdit={canEdit}
                    onMove={moveSnapshotFaction}
                    onSeatAdjustmentChange={updateSnapshotSeatAdjustment}
                  />
                );
              })}
            </>
          )}
          {unallied.length === 0 && latest.alliances.length === 0 && (
            <EmptyState className="compact-empty">{t('no_current_parliament')}</EmptyState>
          )}
        </div>

        {canEdit && (
          <div className="factions-add-row current-parliament-add-row">
            <button className="add-btn" onClick={addSnapshotAlliance}>+ {t('add_alliance')}</button>
          </div>
        )}
      </Panel>
    </div>
  );
}
