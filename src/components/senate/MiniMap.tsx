import { useMemo, useState } from 'react';
import type { Alliance, Faction, MapRegion } from '../../models/types';
import { MAP_PATTERN_SIZE, MAP_VIEWBOX_HEIGHT, MAP_VIEWBOX_WIDTH } from '../../game/map/constants';
import { getControlEntries, getRegionFill } from '../../game/map/control';
import { fitRegionsToViewport, pointsToSvg } from '../../game/map/geometry';
import type { ViewMode } from '../../game/map/types';

interface MiniMapProps {
  regions: MapRegion[];
  factions: Faction[];
  alliances: Alliance[];
}

export function MiniMap({ regions, factions, alliances }: MiniMapProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('faction');

  const viewport = useMemo(
    () => regions.length > 0 ? fitRegionsToViewport(regions) : { panX: 0, panY: 0, zoom: 1 },
    [regions],
  );

  const W = MAP_VIEWBOX_WIDTH;
  const H = MAP_VIEWBOX_HEIGHT;
  const viewBox = `${viewport.panX} ${viewport.panY} ${W / viewport.zoom} ${H / viewport.zoom}`;

  const PREFIX = 'mm';

  return (
    <div className="senate-minimap-wrap">
      <div className="senate-map-toolbar">
        <span className="senate-map-label">MAP VIEW</span>
        <div className="map-view-btns">
          {(['faction', 'alliance'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              className={`small${viewMode === mode ? ' primary' : ' ghost'}`}
              onClick={() => setViewMode(mode)}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
        {regions.length === 0 && <span className="senate-map-hint">No regions defined</span>}
      </div>
      <svg
        className="senate-minimap"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {regions.map(region => {
            const entries = getControlEntries(region, factions, alliances, viewMode);
            if (entries.length < 2) return null;
            const patId = `${PREFIX}_${region.id.replace(/[^a-z0-9]/gi, '_')}_${viewMode}`;
            const total = entries.reduce((s, e) => s + e.pct, 0) || 1;
            let cumY = 0;
            return (
              <pattern key={patId} id={patId} patternUnits="userSpaceOnUse" width={MAP_PATTERN_SIZE} height={MAP_PATTERN_SIZE} patternTransform="rotate(45 0 0)">
                {entries.map((entry, i) => {
                  const h = (entry.pct / total) * MAP_PATTERN_SIZE;
                  const rect = <rect key={i} x="0" y={cumY.toFixed(2)} width={MAP_PATTERN_SIZE} height={h.toFixed(2)} fill={entry.color} />;
                  cumY += h;
                  return rect;
                })}
              </pattern>
            );
          })}
        </defs>

        {regions.map(region => {
          if (region.vertices.length < 3) return null;
          const entries = getControlEntries(region, factions, alliances, viewMode);
          let fill: string;
          if (entries.length === 0) fill = 'transparent';
          else if (entries.length === 1) fill = entries[0].color;
          else fill = `url(#${PREFIX}_${region.id.replace(/[^a-z0-9]/gi, '_')}_${viewMode})`;
          // use getRegionFill only for plain/none fallback check
          const baseFill = getRegionFill(region, factions, alliances, viewMode);
          const finalFill = baseFill === 'none' ? 'transparent' : fill;

          return (
            <polygon
              key={region.id}
              points={pointsToSvg(region.vertices)}
              fill={finalFill}
              fillOpacity={0.85}
              stroke="var(--bg-deeper, #0a0e1a)"
              strokeWidth="0.8"
            />
          );
        })}
      </svg>
    </div>
  );
}
