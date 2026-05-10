import { useEffect, useMemo, useState } from 'react';
import { uid, useAppContext } from '../store';
import type { Faction, FactionElectionModifier, MapRegion, RegionElectionModifier } from '../models/types';
import { useAuth } from '../context/AuthContext';
import { AppHeader } from './ui/AppHeader';
import { EditorField } from './ui/EditorField';
import { EmptyState } from './ui/EmptyState';
import { ListSurface } from './ui/ListSurface';
import { Panel } from './ui/Panel';
import { SupportWeightControl } from './election/SupportWeightControl';
import {
  formatModifierStrataSummary,
  formatRandomnessWeight,
  formatSupportWeight,
  normalizeRandomnessModifier,
  normalizeSupportModifier,
} from '../game/parliament/modifiers';

type ModifierDraft = FactionElectionModifier | RegionElectionModifier;

export function FactionsPage() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(state.factions[0]?.id ?? null);

  useEffect(() => {
    if (selectedId && state.factions.some(faction => faction.id === selectedId)) return;
    setSelectedId(state.factions[0]?.id ?? null);
  }, [selectedId, state.factions]);

  const faction = useMemo(
    () => state.factions.find(candidate => candidate.id === selectedId) ?? null,
    [selectedId, state.factions]
  );

  const addFaction = () => {
    const palette = ['#7a2030', '#2c6fb1', '#d4a14a', '#c44a2a', '#5fa863', '#8a4cb1', '#3aa39e', '#b8862e'];
    const nextId = uid('f');
    updateState(s => {
      const next: Faction = {
        id: nextId,
        name: 'New Faction',
        description: '',
        color: palette[s.factions.length % palette.length],
        globalModifiers: [],
        participatesInElections: false,
      };
      s.factions.push(next);
      return s;
    });
    setSelectedId(nextId);
    showToast('Faction created');
  };

  const updateFaction = (patch: Partial<Faction>) => {
    if (!faction) return;
    updateState(s => {
      const current = s.factions.find(item => item.id === faction.id);
      if (current) Object.assign(current, patch);
      return s;
    });
  };

  const setAlliance = (allianceId: string) => {
    if (!faction) return;
    updateState(s => {
      for (const alliance of s.alliances) {
        alliance.factionIds = alliance.factionIds.filter(id => id !== faction.id);
      }
      const alliance = s.alliances.find(item => item.id === allianceId);
      if (alliance && !alliance.factionIds.includes(faction.id)) alliance.factionIds.push(faction.id);
      return s;
    });
  };

  const currentAllianceId = faction
    ? state.alliances.find(alliance => alliance.factionIds.includes(faction.id))?.id ?? ''
    : '';

  return (
    <div className="factions-page">
      <AppHeader title="Factions" subtitle="// POLITICAL ACTOR REGISTRY //">
        <button className="primary small" onClick={addFaction}>+ Add Faction</button>
      </AppHeader>

      <div className="factions-page-grid">
        <Panel title="Faction Index" bodyClassName="faction-page-list-body">
          {state.factions.length === 0 ? (
            <EmptyState>No factions defined.</EmptyState>
          ) : (
            <ListSurface className="faction-page-list">
              {state.factions.map(item => {
                const alliance = state.alliances.find(candidate => candidate.factionIds.includes(item.id));
                const regionalCount = state.map.regions.reduce(
                  (sum, region) => sum + (region.electionModifiers ?? []).filter(modifier => modifier.factionId === item.id).length,
                  0
                );
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`faction-page-list-item${item.id === selectedId ? ' active' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="swatch" style={{ background: item.color, color: item.color }} />
                    <span className="label">
                      <strong>{item.name}</strong>
                      <small>{alliance?.name ?? 'Unallied'}</small>
                    </span>
                    <span className="count">{(item.globalModifiers ?? []).length + regionalCount}</span>
                  </button>
                );
              })}
            </ListSurface>
          )}
        </Panel>

        {!faction ? (
          <Panel title="Faction Editor">
            <EmptyState>Select a faction to edit.</EmptyState>
          </Panel>
        ) : (
          <Panel
            title={faction.name}
            subtitle={currentAllianceId ? state.alliances.find(a => a.id === currentAllianceId)?.name : 'Unallied'}
            bodyClassName="faction-page-editor"
          >
            <div className="faction-editor-grid">
              <EditorField label="Name">
                <input
                  className="law-field-input"
                  value={faction.name}
                  onChange={event => updateFaction({ name: event.target.value })}
                />
              </EditorField>

              <EditorField label="Color">
                <label className="faction-color-field">
                  <span style={{ background: faction.color }} />
                  <input
                    type="color"
                    value={faction.color}
                    onChange={event => updateFaction({ color: event.target.value })}
                  />
                </label>
              </EditorField>

              <EditorField label="Alliance">
                <select className="law-field-input" value={currentAllianceId} onChange={event => setAlliance(event.target.value)}>
                  <option value="">Unallied</option>
                  {state.alliances.map(alliance => (
                    <option key={alliance.id} value={alliance.id}>{alliance.name}</option>
                  ))}
                </select>
              </EditorField>

              <EditorField label="Election">
                <label className="faction-election-field">
                  <input
                    type="checkbox"
                    checked={faction.participatesInElections === true}
                    onChange={event => updateFaction({ participatesInElections: event.target.checked })}
                  />
                  <span>Participates in elections</span>
                </label>
              </EditorField>
            </div>

            <EditorField label="Description">
              <textarea
                className="law-field-input faction-description-input"
                value={faction.description}
                onChange={event => updateFaction({ description: event.target.value })}
                rows={4}
              />
            </EditorField>

            <ModifierSection
              title="Global Modifiers"
              modifiers={faction.globalModifiers ?? []}
              strata={state.strata}
              onAdd={() => updateFaction({ globalModifiers: [...(faction.globalModifiers ?? []), newFactionModifier()] })}
              onUpdate={(id, modifier) => updateFaction({
                globalModifiers: (faction.globalModifiers ?? []).map(item => item.id === id ? modifier : item),
              })}
              onDelete={id => updateFaction({
                globalModifiers: (faction.globalModifiers ?? []).filter(item => item.id !== id),
              })}
            />

            <RegionalModifierSection
              factionId={faction.id}
              regions={state.map.regions}
              strata={state.strata}
              onAdd={(regionId) => {
                updateState(s => {
                  const region = s.map.regions.find(item => item.id === regionId);
                  if (region) region.electionModifiers.push({
                    ...newFactionModifier(),
                    factionId: faction.id,
                  });
                  return s;
                });
              }}
              onUpdate={(regionId, id, modifier) => {
                updateState(s => {
                  const region = s.map.regions.find(item => item.id === regionId);
                  if (region) {
                    region.electionModifiers = region.electionModifiers.map(item => item.id === id ? modifier : item);
                  }
                  return s;
                });
              }}
              onMove={(fromRegionId, toRegionId, id) => {
                if (fromRegionId === toRegionId) return;
                updateState(s => {
                  const from = s.map.regions.find(item => item.id === fromRegionId);
                  const to = s.map.regions.find(item => item.id === toRegionId);
                  const modifier = from?.electionModifiers.find(item => item.id === id);
                  if (!from || !to || !modifier) return s;
                  from.electionModifiers = from.electionModifiers.filter(item => item.id !== id);
                  to.electionModifiers.push(modifier);
                  return s;
                });
              }}
              onDelete={(regionId, id) => {
                updateState(s => {
                  const region = s.map.regions.find(item => item.id === regionId);
                  if (region) region.electionModifiers = region.electionModifiers.filter(item => item.id !== id);
                  return s;
                });
              }}
            />

            {!canEdit && <div className="faction-page-readonly-note">Read only</div>}
          </Panel>
        )}
      </div>
    </div>
  );
}

function ModifierSection({
  title,
  modifiers,
  strata,
  onAdd,
  onUpdate,
  onDelete,
}: {
  title: string;
  modifiers: FactionElectionModifier[];
  strata: { id: string; name: string; color: string }[];
  onAdd: () => void;
  onUpdate: (id: string, modifier: FactionElectionModifier) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="faction-mod-section">
      <div className="faction-mod-section-head">
        <h3>{title}</h3>
        <button type="button" className="ghost small" onClick={onAdd}>+ Add</button>
      </div>
      {modifiers.length === 0 ? (
        <EmptyState className="compact-empty">No modifiers.</EmptyState>
      ) : (
        <div className="insp-mod-list faction-mod-grid">
          {modifiers.map(modifier => (
            <ModifierEditor
              key={modifier.id}
              modifier={modifier}
              strata={strata}
              onChange={next => onUpdate(modifier.id, next)}
              onDelete={() => onDelete(modifier.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RegionalModifierSection({
  factionId,
  regions,
  strata,
  onAdd,
  onUpdate,
  onMove,
  onDelete,
}: {
  factionId: string;
  regions: MapRegion[];
  strata: { id: string; name: string; color: string }[];
  onAdd: (regionId: string) => void;
  onUpdate: (regionId: string, id: string, modifier: RegionElectionModifier) => void;
  onMove: (fromRegionId: string, toRegionId: string, id: string) => void;
  onDelete: (regionId: string, id: string) => void;
}) {
  const [targetRegionId, setTargetRegionId] = useState(regions[0]?.id ?? '');
  const modifiers = regions.flatMap(region => (
    (region.electionModifiers ?? [])
      .filter(modifier => modifier.factionId === factionId)
      .map(modifier => ({ region, modifier }))
  ));

  useEffect(() => {
    if (targetRegionId && regions.some(region => region.id === targetRegionId)) return;
    setTargetRegionId(regions[0]?.id ?? '');
  }, [regions, targetRegionId]);

  return (
    <section className="faction-mod-section">
      <div className="faction-mod-section-head">
        <h3>Regional Modifiers</h3>
        <div className="faction-region-add">
          <select value={targetRegionId} onChange={event => setTargetRegionId(event.target.value)}>
            {regions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
          </select>
          <button type="button" className="ghost small" disabled={!targetRegionId} onClick={() => onAdd(targetRegionId)}>+ Add</button>
        </div>
      </div>

      {modifiers.length === 0 ? (
        <EmptyState className="compact-empty">No regional modifiers.</EmptyState>
      ) : (
        <div className="insp-mod-list faction-mod-grid">
          {modifiers.map(({ region, modifier }) => (
            <ModifierEditor
              key={`${region.id}-${modifier.id}`}
              modifier={modifier}
              strata={strata}
              regionId={region.id}
              regions={regions}
              onRegionChange={nextRegionId => onMove(region.id, nextRegionId, modifier.id)}
              onChange={next => onUpdate(region.id, modifier.id, { ...next, factionId })}
              onDelete={() => onDelete(region.id, modifier.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ModifierEditor({
  modifier,
  strata,
  regionId,
  regions,
  onRegionChange,
  onChange,
  onDelete,
}: {
  modifier: ModifierDraft;
  strata: { id: string; name: string; color: string }[];
  regionId?: string;
  regions?: MapRegion[];
  onRegionChange?: (regionId: string) => void;
  onChange: (modifier: FactionElectionModifier) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const change = (patch: Partial<FactionElectionModifier>) => onChange({ ...modifier, ...patch });
  const changeEffect = (effect: Partial<FactionElectionModifier['effect']>) => {
    change({
      effect: {
        ...modifier.effect,
        ...effect,
        support: normalizeSupportModifier(effect.support ?? modifier.effect.support),
        randomness: normalizeRandomnessModifier(effect.randomness ?? modifier.effect.randomness),
      },
    });
  };
  const toggleStratum = (stratumId: string, enabled: boolean) => {
    const current = new Set(modifier.stratumIds ?? []);
    if (enabled) current.add(stratumId);
    else current.delete(stratumId);
    change({ stratumIds: Array.from(current) });
  };
  const stratumSummary = formatModifierStrataSummary(modifier.stratumIds, strata);
  const randomEffect = normalizeRandomnessModifier(modifier.effect.randomness);

  if (!expanded) {
    return (
      <div className="insp-mod-card insp-mod-card--compact">
        <button className="insp-mod-summary" type="button" onClick={() => setExpanded(true)}>
          <span className="insp-mod-summary-main">
            <span className="ctrl-swatch" style={{ background: 'var(--accent)' }} />
            <strong>{modifier.title || 'Election Modifier'}</strong>
            <small>{regions && regionId ? regions.find(region => region.id === regionId)?.name ?? 'No region' : 'Global'}</small>
          </span>
          <span className="insp-mod-summary-tags">
            <span>{stratumSummary}</span>
            <span>{formatSupportWeight(modifier.effect.support)}</span>
            <span>{formatRandomnessWeight(randomEffect)}</span>
          </span>
        </button>
        <button className="insp-mod-delete" type="button" onClick={onDelete}>DEL</button>
      </div>
    );
  }

  return (
    <div className="insp-mod-card">
      <div className="faction-mod-card-top">
        <input
          className="insp-mod-title"
          value={modifier.title}
          onChange={event => change({ title: event.target.value })}
          placeholder="Modifier title"
        />
        {regions && regionId && onRegionChange && (
          <select className="insp-mod-select" value={regionId} onChange={event => onRegionChange(event.target.value)}>
            {regions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
          </select>
        )}
      </div>

      <textarea
        className="insp-mod-desc"
        value={modifier.description}
        onChange={event => change({ description: event.target.value })}
        rows={2}
        placeholder="Description"
      />

      <div className="insp-mod-strata">
        {strata.map(stratum => (
          <label key={stratum.id} title={stratum.name}>
            <input
              type="checkbox"
              checked={(modifier.stratumIds ?? []).includes(stratum.id)}
              onChange={event => toggleStratum(stratum.id, event.target.checked)}
            />
            <span className="ctrl-swatch" style={{ background: stratum.color || '#888' }} />
            <span>{stratum.name}</span>
          </label>
        ))}
      </div>

      <div className="insp-mod-effects">
        <SupportWeightControl
          value={modifier.effect.support}
          onChange={support => changeEffect({ support })}
        />
        <SupportWeightControl
          label="Randomness"
          value={randomEffect}
          formatValue={formatRandomnessWeight}
          onChange={randomness => changeEffect({ randomness })}
        />
        <button className="insp-mod-delete" type="button" onClick={onDelete}>DEL</button>
        <button className="insp-mod-done" type="button" onClick={() => setExpanded(false)}>DONE</button>
      </div>
    </div>
  );
}

function newFactionModifier(): FactionElectionModifier {
  return {
    id: uid('mod'),
    title: 'Election Modifier',
    description: '',
    stratumIds: [],
    effect: { support: 0, randomness: 0 },
  };
}
