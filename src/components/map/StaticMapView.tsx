import { useMemo, useState } from 'react';
import type { Alliance, Faction, MapRegion } from '../../models/types';
import { MAP_PATTERN_SIZE, MAP_VIEWBOX_HEIGHT, MAP_VIEWBOX_WIDTH } from '../../game/map/constants';
import { getControlEntries } from '../../game/map/control';
import { fitRegionsToViewport, pointsToSvg } from '../../game/map/geometry';
import type { ViewMode } from '../../game/map/types';

const MODES: ViewMode[] = ['faction', 'alliance'];
// Unique prefix so pattern IDs don't clash with the interactive MapCanvas
const PAT = 'smv';

interface StaticMapViewProps {
  regions: MapRegion[];
  factions: Faction[];
  alliances: Alliance[];
  defaultMode?: ViewMode;
}

export function StaticMapView({ regions, factions, alliances, defaultMode = 'faction' }: StaticMapViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultMode);

  const viewport = useMemo(
    () => regions.length > 0 ? fitRegionsToViewport(regions) : { panX: 0, panY: 0, zoom: 1 },
    [regions],
  );

  const viewBox = `${viewport.panX} ${viewport.panY} ${MAP_VIEWBOX_WIDTH / viewport.zoom} ${MAP_VIEWBOX_HEIGHT / viewport.zoom}`;

  return (
    <div className="static-map">
      <div className="static-map-toolbar">
        {MODES.map(mode => (
          <button
            key={mode}
            className={`small${viewMode === mode ? '' : ' ghost'}`}
            onClick={() => setViewMode(mode)}
          >
            {mode.toUpperCase()}
          </button>
        ))}
        {regions.length === 0 && <span className="static-map-hint">No regions</span>}
      </div>

      <div className="map-canvas-wrap static-map-canvas-wrap">
        <svg className="map-canvas" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          <defs>
            {regions.map(region => {
              const entries = getControlEntries(region, factions, alliances, viewMode);
              if (entries.length < 2) return null;
              const id = `${PAT}_${region.id.replace(/[^a-z0-9]/gi, '_')}_${viewMode}`;
              const total = entries.reduce((s, e) => s + e.pct, 0) || 1;
              let cumY = 0;
              return (
                <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={MAP_PATTERN_SIZE} height={MAP_PATTERN_SIZE} patternTransform="rotate(45 0 0)">
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
            let fill = 'transparent';
            if (entries.length === 1) fill = entries[0].color;
            else if (entries.length > 1) fill = `url(#${PAT}_${region.id.replace(/[^a-z0-9]/gi, '_')}_${viewMode})`;

            return (
              <g key={region.id} pointerEvents="none">
                <polygon
                  points={pointsToSvg(region.vertices)}
                  fill={fill}
                  fillOpacity={0.9}
                  stroke="var(--bg-deeper, #030810)"
                  strokeWidth="7"
                />
                <polygon
                  points={pointsToSvg(region.vertices)}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.1"
                  strokeOpacity={0.65}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
