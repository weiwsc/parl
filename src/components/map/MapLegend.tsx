import { useMemo } from 'react';
import type { Alliance, Faction, MapRegion } from '../../models/types';
import { getMapLegendItems } from '../../game/map/control';
import type { ViewMode } from '../../game/map/types';

interface MapLegendProps {
  regions: MapRegion[];
  factions: Faction[];
  alliances: Alliance[];
  viewMode: ViewMode;
}

export function MapLegend({ regions, factions, alliances, viewMode }: MapLegendProps) {
  const items = useMemo(
    () => getMapLegendItems(regions, factions, alliances, viewMode),
    [regions, factions, alliances, viewMode]
  );

  if (viewMode === 'plain' || items.length === 0) return null;

  return (
    <div
      className="map-legend-floating"
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '24px',
        width: '280px',
        maxHeight: '40vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--line-strong)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        zIndex: 10,
        pointerEvents: 'auto',
      }}
      onWheel={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="insp-section" style={{ margin: 0, padding: '16px', overflowY: 'auto', borderBottom: 'none' }}>
        <div className="insp-section-label" style={{ marginBottom: '16px' }}>
          {viewMode === 'faction' ? 'FACTION' : 'ALLIANCE'} DOMINANCE
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map(item => (
            <div key={item.id} className="insp-ctrl-row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <span className="ctrl-swatch" style={{ background: item.color }} />

              <span
                className="ctrl-name"
                title={item.name}
                style={{ flex: 1, minWidth: 170, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {item.name}
              </span>

              <div className="ctrl-pct-val" style={{ display: 'flex', gap: '8px', minWidth: '45px', justifyContent: 'flex-end', fontSize: '11px' }}>
                <span title="Full Control">{item.full}F</span>
                <span style={{ color: 'var(--line-strong)' }}>|</span>
                <span title="Partial Control" style={{ color: 'var(--text-mute)' }}>{item.partial}P</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
