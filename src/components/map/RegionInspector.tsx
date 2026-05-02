import { useEffect, useState } from 'react';
import type { Alliance, Faction, MapRegion, Stratum } from '../../models/types';
import {
  getAllianceControlEntries,
  getAllianceControlGroups,
  getFactionControlEntries,
  getRegionControlTotal,
  setRegionFactionControl,
  shouldShowAlliancePie,
} from '../../game/map/control';
import { PieChart } from './PieChart';
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
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    setDescExpanded(false);
  }, [region?.id]);

  const editing = canEdit && editMode;

  if (!region) {
    return (
      <aside className="map-inspector">
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

  const descText = region.description || '';
  const descLong = descText.length > 160;

  const hasPieCharts = factionPie.length > 0 || showStrataPie;

  const setPct = (factionId: string, pct: number) => {
    onUpdateRegion(setRegionFactionControl(region, factionId, pct));
  };

  const setStrataWeight = (stratumId: string, pct: number) => {
    onUpdateRegion({ ...region, strataWeights: { ...strataWeights, [stratumId]: pct } });
  };

  return (
    <aside className="map-inspector">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="insp-header">
        <div className="insp-name-block">
          {editing ? (
            <input
              className="insp-name-input"
              value={region.name}
              onChange={e => onUpdateRegion({ ...region, name: e.target.value })}
              placeholder="Region Name"
            />
          ) : (
            <h2 className="insp-name">{region.name || '—'}</h2>
          )}
          {editing ? (
            <input
              className="insp-name2-input"
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
        {/* ── Seats ─────────────────────────────────────────────────── */}
        <div className="insp-section insp-section--inline">
          <div className="insp-section-label">SENATE SEATS</div>
          {editing ? (
            <input
              type="number"
              min="0"
              step="1"
              className="ctrl-pct-input"
              value={region.seatings || 0}
              onChange={e => onUpdateRegion({ ...region, seatings: Math.max(0, parseInt(e.target.value) || 0) })}
            />
          ) : (
            <span className="insp-seats-val">{region.seatings || 0}</span>
          )}
        </div>

        {/* ── Pie charts (view mode only) ────────────────────────────── */}
        {!editing && hasPieCharts && (
          <div className="insp-section insp-section--charts">
            <div className="insp-charts-grid">
              {factionPie.length > 0 && (
                <div className="insp-chart-block">
                  <div className="insp-chart-label">FACTION</div>
                  <PieChart entries={factionPie} size={96} />
                  <div className="pie-legend">
                    {factionPie.map(e => (
                      <div key={e.id} className="pie-legend-row">
                        <span className="pie-legend-dot" style={{ background: e.color }} />
                        <span className="pie-legend-name">{e.label}</span>
                        <span className="pie-legend-pct">{e.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showAlliancePie && (
                <div className="insp-chart-block">
                  <div className="insp-chart-label">ALLIANCE</div>
                  <PieChart entries={alliancePie} size={96} />
                  <div className="pie-legend">
                    {alliancePie.map(e => (
                      <div key={e.id} className="pie-legend-row">
                        <span className="pie-legend-dot" style={{ background: e.color }} />
                        <span className="pie-legend-name">{e.label}</span>
                        <span className="pie-legend-pct">{e.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showStrataPie && (
                <div className="insp-chart-block">
                  <div className="insp-chart-label">STRATA</div>
                  <PieChart entries={strataPie} size={96} />
                  <div className="pie-legend">
                    {strataPie.map(e => (
                      <div key={e.id} className="pie-legend-row">
                        <span className="pie-legend-dot" style={{ background: e.color }} />
                        <span className="pie-legend-name">{e.label}</span>
                        <span className="pie-legend-pct">{e.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Faction control ────────────────────────────────────────── */}
        <div className="insp-section">
          <div className="insp-section-label">
            FACTION CONTROL
            {(ctrlOver || ctrlUnder) && (
              <span className={`insp-ctrl-warn ${ctrlOver ? 'over' : 'under'}`}>{totalCtrl.toFixed(0)}%</span>
            )}
            {!ctrlOver && !ctrlUnder && totalCtrl > 0 && (
              <span className="insp-ctrl-ok">{totalCtrl.toFixed(0)}%</span>
            )}
          </div>

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
                        className="ctrl-pct-input"
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
        </div>

        {/* ── Strata composition ─────────────────────────────────────── */}
        {strata.length > 0 && (
          <div className="insp-section">
            <div className="insp-section-label">
              STRATA COMPOSITION
              {(strataOver || strataUnder) && strataTotal > 0 && (
                <span className={`insp-ctrl-warn ${strataOver ? 'over' : 'under'}`}>{strataTotal.toFixed(0)}%</span>
              )}
              {!strataOver && !strataUnder && strataTotal > 0 && (
                <span className="insp-ctrl-ok">{strataTotal.toFixed(0)}%</span>
              )}
            </div>
            {strata.map(st => {
              const pct = strataWeights[st.id] || 0;
              return (
                <div key={st.id} className="insp-strata-row">
                  <span className="ctrl-swatch" style={{ background: st.color || '#888' }} />
                  <span className="ctrl-name">{st.name}</span>
                  {editing ? (
                    <input
                      type="number" min="0" max="100" step="1"
                      className="ctrl-pct-input"
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
          </div>
        )}

        {/* ── Description ───────────────────────────────────────────── */}
        <div className="insp-section">
          <div className="insp-section-label">DESCRIPTION</div>
          {editing ? (
            <textarea
              className="insp-desc-input"
              value={descText}
              onChange={e => onUpdateRegion({ ...region, description: e.target.value })}
              rows={3}
              placeholder="Region description..."
            />
          ) : (
            <>
              <div className={`insp-desc-text ${descExpanded ? 'expanded' : ''}`}>
                {descText || <em className="text-mute">No description.</em>}
              </div>
              {descLong && (
                <button className="insp-expand-btn" onClick={() => setDescExpanded(v => !v)}>
                  {descExpanded ? '▲ Collapse' : '▼ Expand'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
