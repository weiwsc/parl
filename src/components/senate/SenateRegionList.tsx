import type { Faction, MapRegion } from '../../models/types';
import { getFactionControlEntries } from '../../game/map/control';
import { DominanceBar } from '../ui/DominanceBar';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';

interface SenateRegionListProps {
  regions: MapRegion[];
  factions: Faction[];
  autoSeats: Record<string, number>;
  autoAssign: boolean;
}

export function SenateRegionList({ regions, factions, autoSeats, autoAssign }: SenateRegionListProps) {
  const totalSeats = regions.reduce((s, r) => s + (r.seatings || 0), 0);
  const autoTotal = Object.values(autoSeats).reduce((s, v) => s + v, 0);

  return (
    <Panel
      title="REGIONS"
      subtitle={`${totalSeats} seats total`}
      bodyClassName="no-scroll"
      actions={
        autoAssign && autoTotal > 0
          ? <span className="senate-auto-badge">{autoTotal} auto-assigned</span>
          : undefined
      }
    >
      {regions.filter(r => (r.seatings || 0) > 0).length === 0 ? (
        <EmptyState>No regions with seats. Set seatings in the Map inspector.</EmptyState>
      ) : (
        <div className="senate-region-list">
          {regions.filter(r => (r.seatings || 0) > 0).map(region => {
            const seats = region.seatings || 0;
            const entries = getFactionControlEntries(region, factions)
              .sort((a, b) => b.pct - a.pct);
            const isDominant = entries.length > 0 && entries[0].pct >= 99.5;

            return (
              <div key={region.id} className="senate-region-row">
                <div className="senate-region-main">
                  <span className="senate-region-name">{region.name || '—'}</span>
                  <span className={`senate-region-seats${seats === 0 ? ' zero' : ''}`}>{seats}</span>
                  {autoAssign && isDominant && seats > 0 && (
                    <span className="senate-auto-dot" style={{ color: entries[0].color }} title={`Auto-assigned to ${entries[0].label}`}>◈</span>
                  )}
                </div>
                {entries.length > 0 && (
                  <DominanceBar
                    className="senate-region-bar"
                    segments={entries.map(e => ({ id: e.id, name: e.label, color: e.color, value: e.pct }))}
                    remainderLabel="Uncontrolled"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
