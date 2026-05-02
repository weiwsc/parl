import { useMemo, useState } from 'react';
import type { Faction, MapRegion } from '../../models/types';
import {
  getFactionControlEntries,
  getRegionControlTotal,
} from '../../game/map/control';
import { DominanceBar } from '../ui/DominanceBar';

type RegionSortKey = 'name' | 'subtitle' | 'control' | 'dominant';
type SortDirection = 'asc' | 'desc';

interface RegionCardListProps {
  regions: MapRegion[];
  factions: Faction[];
  selectedId: string | null;
  onSelectRegion: (id: string) => void;
}

const SORT_OPTIONS: { key: RegionSortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'control', label: 'Control' },
  { key: 'dominant', label: 'Dominant Faction' },
];

export function RegionCardList({
  regions,
  factions,
  selectedId,
  onSelectRegion,
}: RegionCardListProps) {
  const [sortKey, setSortKey] = useState<RegionSortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const sortedRegions = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;

    return [...regions].sort((a, b) => {
      const comparison = compareRegion(a, b, factions, sortKey);
      if (comparison !== 0) return comparison * direction;
      return compareText(a.name, b.name);
    });
  }, [regions, factions, sortKey, sortDirection]);

  return (
    <section className="map-region-list-panel">
      <div className="map-region-list-toolbar">
        <div className="map-region-list-title">
          <span className="map-region-list-kicker">REGION REGISTER</span>
          <strong>{regions.length}</strong>
        </div>

        <div className="map-region-sort-controls">
          <label>
            Sort
            <select value={sortKey} onChange={event => setSortKey(event.target.value as RegionSortKey)}>
              {SORT_OPTIONS.map(option => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="map-region-sort-dir"
            onClick={() => setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc')}
            title="Toggle sort direction"
          >
            {sortDirection === 'asc' ? 'ASC' : 'DESC'}
          </button>
        </div>
      </div>

      {sortedRegions.length === 0 ? (
        <div className="map-region-list-empty">No regions defined yet.</div>
      ) : (
        <div className="map-region-card-grid">
          {sortedRegions.map(region => (
            <RegionCard
              key={region.id}
              region={region}
              factions={factions}
              selected={region.id === selectedId}
              onSelect={() => onSelectRegion(region.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface RegionCardProps {
  region: MapRegion;
  factions: Faction[];
  selected: boolean;
  onSelect: () => void;
}

function RegionCard({ region, factions, selected, onSelect }: RegionCardProps) {
  const entries = getFactionControlEntries(region, factions)
    .sort((a, b) => b.pct - a.pct || compareText(a.label, b.label));
  const totalControl = getRegionControlTotal(region);
  const dominant = entries[0];

  return (
    <article
      role="button"
      tabIndex={0}
      className={`map-region-card ${selected ? 'active' : ''}`}
      onClick={onSelect}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="map-region-card-head">
        <div className="map-region-card-title">
          <h2>{region.name || 'Unnamed Region'}</h2>
          <p>{region.name2 || 'No subtitle'}</p>
        </div>
        <div className="map-region-card-meta">
          <span>{totalControl.toFixed(0)}%</span>
          <small>{dominant ? dominant.label : 'No control'}</small>
        </div>
      </div>

      <DominanceBar
        className="map-region-dominance"
        segments={entries.map(entry => ({
          id: entry.id,
          name: entry.label,
          color: entry.color,
          value: entry.pct,
        }))}
        remainderLabel="Uncontrolled"
      />

      <div className="map-region-faction-list">
        {entries.length === 0 ? (
          <span className="map-region-faction-empty">No faction control assigned.</span>
        ) : entries.map(entry => (
          <span key={entry.id} className="map-region-faction-row">
            <span className="ctrl-swatch" style={{ background: entry.color }} />
            <span className="map-region-faction-name">{entry.label}</span>
            <span className="map-region-faction-pct">{entry.pct.toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </article>
  );
}

function compareRegion(a: MapRegion, b: MapRegion, factions: Faction[], sortKey: RegionSortKey): number {
  if (sortKey === 'control') {
    return getRegionControlTotal(a) - getRegionControlTotal(b);
  }

  if (sortKey === 'dominant') {
    const dominantA = getFactionControlEntries(a, factions).sort((x, y) => y.pct - x.pct)[0]?.label ?? '';
    const dominantB = getFactionControlEntries(b, factions).sort((x, y) => y.pct - x.pct)[0]?.label ?? '';
    return compareText(dominantA, dominantB);
  }

  if (sortKey === 'subtitle') {
    return compareText(a.name2 ?? '', b.name2 ?? '');
  }

  return compareText(a.name, b.name);
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}
