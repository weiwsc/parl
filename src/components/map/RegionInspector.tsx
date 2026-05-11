import { useState, type ReactNode } from 'react';
import { uid } from '../../store';
import type { Alliance, Faction, MapRegion, RegionElectionModifier, Stratum } from '../../models/types';
import {
  getAllianceControlEntries,
  getAllianceControlGroups,
  getFactionControlEntries,
  getRegionControlTotal,
  setRegionFactionControl,
  shouldShowAlliancePie,
} from '../../game/map/control';
import { SupportWeightControl } from '../election/SupportWeightControl';
import { ComputedPieChartView } from '../nodes/ComputedValueView';
import { NodeInfoField } from '../ui/NodeInfoField';
import { NodeSection } from '../ui/NodeSection';
import {
  formatModifierStrataSummary,
  formatRandomnessWeight,
  formatSupportWeight,
  normalizeRandomnessModifier,
  normalizeSupportModifier,
} from '../../game/parliament/modifiers';
import type { NodeRuntimeValue } from '../../game/nodes/runtime';
import type { ControlEntry } from '../../game/map/types';

interface RegionInspectorProps {
  region: MapRegion | null;
  factions: Faction[];
  alliances: Alliance[];
  strata: Stratum[];
  canEdit: boolean;
  onUpdateRegion: (region: MapRegion) => void;
  onDeleteRegion: (id: string) => void;
  onCopyRegionJson: (region: MapRegion) => void;
}

export function RegionInspector({
  region,
  factions,
  alliances,
  strata,
  canEdit,
  onUpdateRegion,
  onDeleteRegion,
  onCopyRegionJson,
}: RegionInspectorProps) {
  const [editMode, setEditMode] = useState(false);

  const editing = canEdit && editMode;

  if (!region) {
    return (
      <aside className="map-inspector ui-node-surface ui-compact-surface">
        <div className="map-inspector-empty">
          <span className="insp-empty-icon">◎</span>
          <span className="insp-empty-label">SELECT A REGION</span>
          <span className="insp-empty-sub">Click any polygon on the map to inspect</span>
        </div>
      </aside>
    );
  }

  const totalCtrl = getRegionControlTotal(region);
  const ctrlOver  = totalCtrl > 100.5;
  const ctrlUnder = totalCtrl < 99.5 && totalCtrl > 0.5;
  const allianceGroups = getAllianceControlGroups(region, factions, alliances);
  const factionPie  = getFactionControlEntries(region, factions);
  const alliancePie = getAllianceControlEntries(region, factions, alliances);
  const showAlliancePie = shouldShowAlliancePie(factionPie, alliancePie);

  const strataWeights = region.strataWeights ?? {};
  const strataTotal   = strata.reduce((s, st) => s + (strataWeights[st.id] || 0), 0);
  const strataOver    = strataTotal > 100.5;
  const strataUnder   = strataTotal < 99.5 && strataTotal > 0.5;

  const strataPie: ControlEntry[] = strata
    .filter(st => (strataWeights[st.id] || 0) > 0)
    .map(st => ({
      id: st.id,
      color: st.color || '#888',
      label: st.name,
      pct: strataWeights[st.id] || 0,
    }));
  const showStrataPie = strataPie.length > 0;
  const overviewPieCharts = [
    pieChartBlock('Faction', factionPie),
    showAlliancePie ? pieChartBlock('Alliance', alliancePie) : null,
    showStrataPie ? pieChartBlock('Strata', strataPie) : null,
  ].filter((chart): chart is NodeRuntimeValue => !!chart);

  const descText = region.description || '';

  const hasPieCharts = overviewPieCharts.length > 0;
  const population = Math.max(0, region.population || 0);
  const factionSupport = region.factionSupport ?? {};
  const supportTotal = factions.reduce((sum, faction) => (
    sum + strata.reduce((inner, stratum) => inner + getFactionStratumSupport(faction.id, stratum.id), 0)
  ), 0);
  const supportOverByStratum = Object.fromEntries(strata.map(stratum => {
    const capacity = getRegionStratumPopulation(stratum.id);
    const assigned = factions.reduce((sum, faction) => sum + getFactionStratumSupport(faction.id, stratum.id), 0);
    return [stratum.id, assigned > capacity + 0.5];
  }));
  const supportOver = Object.values(supportOverByStratum).some(Boolean);
  const supportPct = population > 0 ? Math.min(100, supportTotal / population * 100) : 0;
  const modifiers = region.electionModifiers ?? [];

  const setPct = (factionId: string, pct: number) => {
    onUpdateRegion(setRegionFactionControl(region, factionId, pct));
  };

  const setStrataWeight = (stratumId: string, pct: number) => {
    onUpdateRegion({ ...region, strataWeights: { ...strataWeights, [stratumId]: pct } });
  };

  const setPopulation = (value: number) => {
    onUpdateRegion({ ...region, population: Math.max(0, value) });
  };

  function getRegionStratumPopulation(stratumId: string): number {
    return population * Math.max(0, strataWeights[stratumId] || 0) / 100;
  }

  function getFactionStratumSupport(factionId: string, stratumId: string): number {
    return Math.max(0, factionSupport[factionId]?.[stratumId] || 0);
  }

  const setFactionStratumSupport = (factionId: string, stratumId: string, value: number) => {
    onUpdateRegion({
      ...region,
      factionSupport: {
        ...factionSupport,
        [factionId]: {
          ...(factionSupport[factionId] ?? {}),
          [stratumId]: Math.max(0, value),
        },
      },
    });
  };

  const addModifier = () => {
    const next: RegionElectionModifier = {
      id: uid('rem'),
      title: 'Election Modifier',
      description: '',
      factionId: factions[0]?.id ?? '',
      stratumIds: [],
      effect: { support: 0, randomness: 0 },
    };
    onUpdateRegion({ ...region, electionModifiers: [...modifiers, next] });
  };

  const updateModifier = (id: string, patch: Partial<RegionElectionModifier>) => {
    onUpdateRegion({
      ...region,
      electionModifiers: modifiers.map(modifier => (
        modifier.id === id ? { ...modifier, ...patch } : modifier
      )),
    });
  };

  const updateModifierEffect = (id: string, effect: Partial<RegionElectionModifier['effect']>) => {
    onUpdateRegion({
      ...region,
      electionModifiers: modifiers.map(modifier => (
        modifier.id === id
          ? {
              ...modifier,
              effect: {
                ...modifier.effect,
                ...effect,
                support: normalizeSupportModifier(effect.support ?? modifier.effect.support),
                randomness: normalizeRandomnessModifier(effect.randomness ?? modifier.effect.randomness),
              },
            }
          : modifier
      )),
    });
  };

  const toggleModifierStratum = (id: string, stratumId: string, enabled: boolean) => {
    onUpdateRegion({
      ...region,
      electionModifiers: modifiers.map(modifier => {
        if (modifier.id !== id) return modifier;
        const current = new Set(modifier.stratumIds ?? []);
        if (enabled) current.add(stratumId);
        else current.delete(stratumId);
        return { ...modifier, stratumIds: Array.from(current) };
      }),
    });
  };

  const deleteModifier = (id: string) => {
    onUpdateRegion({
      ...region,
      electionModifiers: modifiers.filter(modifier => modifier.id !== id),
    });
  };

  return (
    <aside className="map-inspector ui-node-surface ui-compact-surface">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="insp-header ui-compact-head">
        <div className="insp-name-block">
          {editing ? (
            <input
              className="ui-input insp-name-input"
              value={region.name}
              onChange={e => onUpdateRegion({ ...region, name: e.target.value })}
              placeholder="Region Name"
            />
          ) : (
            <h2 className="insp-name">{region.name || '—'}</h2>
          )}
          {editing ? (
            <input
              className="ui-input insp-name2-input"
              value={region.name2 ?? ''}
              onChange={e => onUpdateRegion({ ...region, name2: e.target.value || undefined })}
              placeholder="Subtitle (optional)"
            />
          ) : (
            region.name2 && <p className="insp-name2">{region.name2}</p>
          )}
        </div>
        <div className="insp-actions">
          {canEdit && (
            <button
              className={`insp-copy-btn${editMode ? ' active' : ''}`}
              onClick={() => setEditMode(v => !v)}
              title="Toggle inspector editing"
            >
              {editMode ? '✎' : '◎'}
            </button>
          )}
          <button className="insp-copy-btn" title="Copy region JSON" onClick={() => onCopyRegionJson(region)}>
            JSON
          </button>
          {editing && (
            <button className="insp-delete-btn" title="Delete region" onClick={() => onDeleteRegion(region.id)}>
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="insp-body">
        <InspectorSection title="Basics">
          <div className="insp-basics-grid">
            <div className="insp-inline-field">
              <span>SENATE SEATS</span>
              {editing ? (
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="ui-input ctrl-pct-input"
                  value={region.seatings || 0}
                  onChange={e => onUpdateRegion({ ...region, seatings: Math.max(0, parseInt(e.target.value) || 0) })}
                />
              ) : (
                <strong>{region.seatings || 0}</strong>
              )}
            </div>

            <div className="insp-inline-field">
              <span>POPULATION</span>
              {editing ? (
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="ui-input ctrl-num-input"
                  value={population || ''}
                  placeholder="0"
                  onChange={e => setPopulation(parseInt(e.target.value, 10) || 0)}
                />
              ) : (
                <strong>{population.toLocaleString()}</strong>
              )}
            </div>
          </div>
        </InspectorSection>

        {/* ── Pie charts (view mode only) ────────────────────────────── */}
        {!editing && hasPieCharts && (
          <InspectorSection title="Overview" className="insp-section--charts">
            <ComputedPieChartView value={overviewPieCharts} className="insp-node-pie-grid" />
          </InspectorSection>
        )}

        {/* ── Faction control ────────────────────────────────────────── */}
        <InspectorSection
          title="Faction Control"
          badge={(
            <>
            {(ctrlOver || ctrlUnder) && (
              <span className={`insp-ctrl-warn ${ctrlOver ? 'over' : 'under'}`}>{totalCtrl.toFixed(0)}%</span>
            )}
            {!ctrlOver && !ctrlUnder && totalCtrl > 0 && (
              <span className="insp-ctrl-ok">{totalCtrl.toFixed(0)}%</span>
            )}
            </>
          )}
        >

          {allianceGroups.map((group, gi) => (
            <div key={gi} className="insp-ctrl-group">
              {group.alliance ? (
                <div className="insp-ctrl-group-hd">
                  <span className="ctrl-swatch" style={{ background: group.alliance.color }} />
                  <span className="ctrl-alliance-name">{group.alliance.name}</span>
                </div>
              ) : allianceGroups.some(g => g.alliance) ? (
                <div className="insp-ctrl-group-hd">
                  <span className="ctrl-alliance-name ctrl-unaligned">Unaligned</span>
                </div>
              ) : null}

              {group.members
                .filter(({ pct }) => editing || pct > 0)
                .map(({ faction, pct }) => (
                  <div key={faction.id} className="insp-ctrl-row">
                    <span className="ctrl-swatch" style={{ background: faction.color }} />
                    <span className="ctrl-name">{faction.name}</span>
                    {editing ? (
                      <input
                        type="number" min="0" max="100" step="1"
                        className="ui-input ctrl-pct-input"
                        value={pct || ''}
                        placeholder="0"
                        onChange={e => setPct(faction.id, Math.max(0, Math.min(100, +e.target.value || 0)))}
                      />
                    ) : (
                      <span className="ctrl-pct-val">{pct.toFixed(0)}%</span>
                    )}
                    <div className="ctrl-bar-wrap">
                      <div className="ctrl-bar-fill" style={{ width: `${pct}%`, background: faction.color }} />
                    </div>
                  </div>
                ))}
            </div>
          ))}

          {!editing && factionPie.length === 0 && (
            <p className="insp-no-ctrl">No faction control assigned.</p>
          )}
        </InspectorSection>

        {/* ── Election support ──────────────────────────────────────── */}
        <InspectorSection
          title="Election Support"
          badge={(
            <>
            {supportOver && <span className="insp-ctrl-warn over">{supportTotal.toLocaleString()}</span>}
            {!supportOver && supportTotal > 0 && population > 0 && (
              <span className="insp-ctrl-ok">{supportPct.toFixed(0)}%</span>
            )}
            </>
          )}
        >

          {strata.map(stratum => {
            const capacity = getRegionStratumPopulation(stratum.id);
            const assigned = factions.reduce((sum, faction) => sum + getFactionStratumSupport(faction.id, stratum.id), 0);
            const over = assigned > capacity + 0.5;
            if (!editing && assigned <= 0) return null;

            return (
              <SupportStratumPanel
                key={`${region.id}-${stratum.id}`}
                stratum={stratum}
                assigned={assigned}
                capacity={capacity}
                over={over}
              >
                {factions.map(faction => {
                  const support = getFactionStratumSupport(faction.id, stratum.id);
                  const pct = capacity > 0 ? Math.min(100, support / capacity * 100) : 0;
                  if (!editing && support <= 0) return null;

                  return (
                    <div key={faction.id} className="insp-support-row">
                      <span className="ctrl-swatch" style={{ background: faction.color }} />
                      <span className="ctrl-name">{faction.name}</span>
                      {editing ? (
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="ui-input ctrl-num-input"
                          value={support || ''}
                          placeholder="0"
                          onChange={e => setFactionStratumSupport(faction.id, stratum.id, parseInt(e.target.value, 10) || 0)}
                        />
                      ) : (
                        <span className="ctrl-pct-val">{support > 0 ? support.toLocaleString() : '—'}</span>
                      )}
                      <div className="ctrl-bar-wrap">
                        <div className="ctrl-bar-fill" style={{ width: `${pct}%`, background: faction.color }} />
                      </div>
                    </div>
                  );
                })}
              </SupportStratumPanel>
            );
          })}

          {!editing && supportTotal <= 0 && (
            <p className="insp-no-ctrl">No election support assigned.</p>
          )}
        </InspectorSection>

        {/* ── Election modifiers ────────────────────────────────────── */}
        <InspectorSection
          title="Region Modifiers"
          badge={modifiers.length > 0 ? <span className="insp-ctrl-ok">{modifiers.length}</span> : null}
        >

          {modifiers.length === 0 && !editing && (
            <p className="insp-no-ctrl">No regional modifiers assigned.</p>
          )}

          <div className="insp-mod-list">
            {modifiers.map(modifier => {
              const faction = factions.find(candidate => candidate.id === modifier.factionId);
              return (
                <RegionModifierCard
                  key={modifier.id}
                  modifier={modifier}
                  faction={faction}
                  factions={factions}
                  strata={strata}
                  editing={editing}
                  onUpdate={patch => updateModifier(modifier.id, patch)}
                  onUpdateEffect={effect => updateModifierEffect(modifier.id, effect)}
                  onToggleStratum={(stratumId, enabled) => toggleModifierStratum(modifier.id, stratumId, enabled)}
                  onDelete={() => deleteModifier(modifier.id)}
                />
              );
            })}
          </div>

          {editing && (
            <button className="insp-add-modifier" type="button" onClick={addModifier} disabled={factions.length === 0}>
              + Add Modifier
            </button>
          )}
        </InspectorSection>

        {/* ── Strata composition ─────────────────────────────────────── */}
        {strata.length > 0 && (
          <InspectorSection
            title="Strata Composition"
            badge={(
              <>
                {(strataOver || strataUnder) && strataTotal > 0 && (
                  <span className={`insp-ctrl-warn ${strataOver ? 'over' : 'under'}`}>{strataTotal.toFixed(0)}%</span>
                )}
                {!strataOver && !strataUnder && strataTotal > 0 && (
                  <span className="insp-ctrl-ok">{strataTotal.toFixed(0)}%</span>
                )}
              </>
            )}
          >
            {strata.map(st => {
              const pct = strataWeights[st.id] || 0;
              return (
                <div key={st.id} className="insp-strata-row">
                  <span className="ctrl-swatch" style={{ background: st.color || '#888' }} />
                  <span className="ctrl-name">{st.name}</span>
                  {editing ? (
                    <input
                      type="number" min="0" max="100" step="1"
                      className="ui-input ctrl-pct-input"
                      value={pct || ''}
                      placeholder="0"
                      onChange={e => setStrataWeight(st.id, Math.max(0, Math.min(100, +e.target.value || 0)))}
                    />
                  ) : (
                    <span className="ctrl-pct-val">{pct > 0 ? `${pct.toFixed(0)}%` : '—'}</span>
                  )}
                  <div className="ctrl-bar-wrap">
                    <div className="ctrl-bar-fill" style={{ width: `${pct}%`, background: st.color || 'var(--accent)' }} />
                  </div>
                </div>
              );
            })}
          </InspectorSection>
        )}

        <NodeInfoField
          label="description"
          value={descText}
          editing={editing}
          onChange={description => onUpdateRegion({ ...region, description })}
          placeholder="Region description..."
          emptyLabel="No description."
        />
      </div>
    </aside>
  );
}

function pieChartBlock(title: string, entries: ControlEntry[]): NodeRuntimeValue | null {
  const data = entries
    .filter(entry => entry.pct > 0)
    .map(entry => ({
      id: entry.id,
      label: entry.label,
      value: entry.pct,
      color: entry.color,
    }));

  return data.length > 0 ? { title, data } : null;
}

function InspectorSection({
  title,
  badge,
  children,
  className = '',
  defaultOpen = true,
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  return (
    <NodeSection
      title={title}
      badge={badge}
      defaultOpen={defaultOpen}
      className={`insp-section${className ? ` ${className}` : ''}`}
      headClassName="insp-section-toggle"
      titleClassName="insp-section-title"
      badgeClassName="insp-section-badge"
      bodyClassName="insp-section-body"
    >
      {children}
    </NodeSection>
  );
}

function SupportStratumPanel({
  stratum,
  assigned,
  capacity,
  over,
  children,
}: {
  stratum: Stratum;
  assigned: number;
  capacity: number;
  over: boolean;
  children: ReactNode;
}) {
  return (
    <NodeSection
      defaultOpen={false}
      className={`insp-support-stratum${over ? ' over' : ''}`}
      headClassName="insp-support-stratum-head"
      titleClassName="insp-support-stratum-title"
      badgeClassName="insp-support-stratum-badge"
      bodyClassName="insp-support-stratum-body"
      title={(
        <>
          <span className="ctrl-swatch" style={{ background: stratum.color || '#888' }} />
          <span className="ctrl-name">{stratum.name}</span>
        </>
      )}
      badge={(
        <>
          <span className={`insp-support-cap ${over ? 'over' : ''}`}>
            {Math.round(assigned).toLocaleString()} / {Math.round(capacity).toLocaleString()}
          </span>
          {over && (
            <span className="insp-support-over">
              Over by {Math.round(assigned - capacity).toLocaleString()}
            </span>
          )}
        </>
      )}
    >
      {children}
    </NodeSection>
  );
}

function RegionModifierCard({
  modifier,
  faction,
  factions,
  strata,
  editing,
  onUpdate,
  onUpdateEffect,
  onToggleStratum,
  onDelete,
}: {
  modifier: RegionElectionModifier;
  faction?: Faction;
  factions: Faction[];
  strata: Stratum[];
  editing: boolean;
  onUpdate: (patch: Partial<RegionElectionModifier>) => void;
  onUpdateEffect: (effect: Partial<RegionElectionModifier['effect']>) => void;
  onToggleStratum: (stratumId: string, enabled: boolean) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const supportEffect = modifier.effect?.support ?? 0;
  const randomEffect = normalizeRandomnessModifier(modifier.effect?.randomness);
  const stratumSummary = formatModifierStrataSummary(modifier.stratumIds, strata);

  if (!editing || !expanded) {
    const summary = (
      <>
        <span className="insp-mod-summary-main">
          <span className="ctrl-swatch" style={{ background: faction?.color ?? 'var(--text-mute)' }} />
          <strong>{modifier.title || 'Election Modifier'}</strong>
          <small>{faction?.name ?? 'No faction selected'}</small>
        </span>
        <span className="insp-mod-summary-tags">
          <span>{stratumSummary}</span>
          <span>{formatSupportWeight(supportEffect)}</span>
          <span>{formatRandomnessWeight(randomEffect)}</span>
        </span>
      </>
    );

    return (
      <div className="insp-mod-card insp-mod-card--compact">
        {editing ? (
          <button className="insp-mod-summary" type="button" onClick={() => setExpanded(true)}>
            {summary}
          </button>
        ) : (
          <div className="insp-mod-summary">{summary}</div>
        )}
        {editing && <button className="insp-mod-delete" type="button" onClick={onDelete}>DEL</button>}
      </div>
    );
  }

  return (
    <div className="insp-mod-card">
      <input
        className="ui-input insp-mod-title"
        value={modifier.title}
        onChange={event => onUpdate({ title: event.target.value })}
        placeholder="Modifier title"
      />
      <select
        className="ui-select insp-mod-select"
        value={modifier.factionId}
        onChange={event => onUpdate({ factionId: event.target.value })}
      >
        <option value="">Select faction</option>
        {factions.map(option => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </select>
      <textarea
        className="ui-textarea insp-mod-desc"
        value={modifier.description}
        onChange={event => onUpdate({ description: event.target.value })}
        rows={2}
        placeholder="Description"
      />
      <div className="insp-mod-strata">
        {strata.map(stratum => (
          <label key={stratum.id} title={stratum.name}>
            <input
              type="checkbox"
              checked={(modifier.stratumIds ?? []).includes(stratum.id)}
              onChange={event => onToggleStratum(stratum.id, event.target.checked)}
            />
            <span className="ctrl-swatch" style={{ background: stratum.color || '#888' }} />
            <span>{stratum.name}</span>
          </label>
        ))}
      </div>
      <div className="insp-mod-effects">
        <SupportWeightControl
          value={supportEffect}
          onChange={support => onUpdateEffect({ support })}
        />
        <SupportWeightControl
          label="Randomness"
          value={randomEffect}
          formatValue={formatRandomnessWeight}
          onChange={randomness => onUpdateEffect({ randomness })}
        />
        <button className="insp-mod-delete" type="button" onClick={onDelete}>DEL</button>
        <button className="insp-mod-done" type="button" onClick={() => setExpanded(false)}>DONE</button>
      </div>
    </div>
  );
}
