import { useEffect, useState } from 'react';
import type { Alliance, Faction, MapRegion } from '../../models/types';
import {
  getAllianceControlEntries,
  getAllianceControlGroups,
  getFactionControlEntries,
  getRegionControlTotal,
  setRegionFactionControl,
  shouldShowAlliancePie,
} from '../../game/map/control';
import { PieChart } from './PieChart';

interface RegionInspectorProps {
  region: MapRegion | null;
  factions: Faction[];
  alliances: Alliance[];
  canEdit: boolean;
  onUpdateRegion: (region: MapRegion) => void;
  onDeleteRegion: (id: string) => void;
}

export function RegionInspector({
  region,
  factions,
  alliances,
  canEdit,
  onUpdateRegion,
  onDeleteRegion,
}: RegionInspectorProps) {
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    setDescExpanded(false);
  }, [region?.id]);

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
  const ctrlOver = totalCtrl > 100.5;
  const ctrlUnder = totalCtrl < 99.5 && totalCtrl > 0.5;
  const allianceGroups = getAllianceControlGroups(region, factions, alliances);
  const factionPie = getFactionControlEntries(region, factions);
  const alliancePie = getAllianceControlEntries(region, factions, alliances);
  const showAlliancePie = shouldShowAlliancePie(factionPie, alliancePie);
  const descText = region.description || '';
  const descLong = descText.length > 160;

  const setPct = (factionId: string, pct: number) => {
    onUpdateRegion(setRegionFactionControl(region, factionId, pct));
  };

  return (
    <aside className="map-inspector">
      <div className="insp-header">
        <div className="insp-name-block">
          {canEdit ? (
            <input
              className="insp-name-input"
              value={region.name}
              onChange={event => onUpdateRegion({ ...region, name: event.target.value })}
              placeholder="Region Name"
            />
          ) : (
            <h2 className="insp-name">{region.name || '—'}</h2>
          )}
          {canEdit ? (
            <input
              className="insp-name2-input"
              value={region.name2 ?? ''}
              onChange={event => onUpdateRegion({ ...region, name2: event.target.value || undefined })}
              placeholder="Subtitle (optional)"
            />
          ) : (
            region.name2 && <p className="insp-name2">{region.name2}</p>
          )}
        </div>
        {canEdit && (
          <button className="insp-delete-btn" title="Delete region" onClick={() => onDeleteRegion(region.id)}>✕</button>
        )}
      </div>

      <div className="insp-body">
        <div className="insp-section">
          <div className="insp-section-label">DESCRIPTION</div>
          {canEdit ? (
            <textarea
              className="insp-desc-input"
              value={descText}
              onChange={event => onUpdateRegion({ ...region, description: event.target.value })}
              rows={3}
              placeholder="Region description..."
            />
          ) : (
            <>
              <div className={`insp-desc-text ${descExpanded ? 'expanded' : ''}`}>
                {descText || <em className="text-mute">No description.</em>}
              </div>
              {descLong && (
                <button className="insp-expand-btn" onClick={() => setDescExpanded(expanded => !expanded)}>
                  {descExpanded ? '▲ Collapse' : '▼ Expand'}
                </button>
              )}
            </>
          )}
        </div>

        <div className="insp-section">
          <div className="insp-section-label">
            FACTION CONTROL
            {(ctrlOver || ctrlUnder) && (
              <span className={`insp-ctrl-warn ${ctrlOver ? 'over' : 'under'}`}>
                {totalCtrl.toFixed(0)}%
              </span>
            )}
            {!ctrlOver && !ctrlUnder && totalCtrl > 0 && (
              <span className="insp-ctrl-ok">{totalCtrl.toFixed(0)}%</span>
            )}
          </div>

          {allianceGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="insp-ctrl-group">
              {group.alliance ? (
                <div className="insp-ctrl-group-hd">
                  <span className="ctrl-swatch" style={{ background: group.alliance.color }} />
                  <span className="ctrl-alliance-name">{group.alliance.name}</span>
                </div>
              ) : allianceGroups.some(candidate => candidate.alliance) ? (
                <div className="insp-ctrl-group-hd">
                  <span className="ctrl-alliance-name ctrl-unaligned">Unaligned</span>
                </div>
              ) : null}

              {group.members
                .filter(({ pct }) => canEdit || pct > 0)
                .map(({ faction, pct }) => (
                  <div key={faction.id} className="insp-ctrl-row">
                    <span className="ctrl-swatch" style={{ background: faction.color }} />
                    <span className="ctrl-name">{faction.name}</span>
                    {canEdit ? (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        className="ctrl-pct-input"
                        value={pct || ''}
                        placeholder="0"
                        onChange={event => setPct(faction.id, Math.max(0, Math.min(100, +event.target.value || 0)))}
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

          {!canEdit && factionPie.length === 0 && (
            <p className="insp-no-ctrl">No faction control assigned.</p>
          )}
        </div>

        {factionPie.length > 0 && (
          <div className="insp-section">
            <div className="insp-charts">
              <div className="insp-chart-block">
                <div className="insp-chart-label">FACTION</div>
                <PieChart entries={factionPie} size={108} />
                <div className="pie-legend">
                  {factionPie.map(entry => (
                    <div key={entry.id} className="pie-legend-row">
                      <span className="pie-legend-dot" style={{ background: entry.color }} />
                      <span className="pie-legend-name">{entry.label}</span>
                      <span className="pie-legend-pct">{entry.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {showAlliancePie && (
                <div className="insp-chart-block">
                  <div className="insp-chart-label">ALLIANCE</div>
                  <PieChart entries={alliancePie} size={108} />
                  <div className="pie-legend">
                    {alliancePie.map(entry => (
                      <div key={entry.id} className="pie-legend-row">
                        <span className="pie-legend-dot" style={{ background: entry.color }} />
                        <span className="pie-legend-name">{entry.label}</span>
                        <span className="pie-legend-pct">{entry.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
