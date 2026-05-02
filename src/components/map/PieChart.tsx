import type { ControlEntry } from '../../game/map/types';

interface PieChartProps {
  entries: ControlEntry[];
  size?: number;
}

export function PieChart({ entries, size = 120 }: PieChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const currentTotal = entries.reduce((sum, entry) => sum + entry.pct, 0);
  const displayEntries = [...entries];

  if (currentTotal < 99.9) {
    displayEntries.push({
      id: 'neutral',
      color: '#444',
      label: 'Neutral',
      pct: 100 - currentTotal,
    });
  }

  if (displayEntries.length === 1) {
    return (
      <svg className="map-pie-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill={displayEntries[0].color} stroke="var(--bg-deeper)" strokeWidth={1.2} />
      </svg>
    );
  }

  let angle = -Math.PI / 2;
  const slices = displayEntries.map(entry => {
    const sweep = (entry.pct / 100) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;

    return {
      ...entry,
      d: `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r},0,${large},1,${x2.toFixed(2)},${y2.toFixed(2)} Z`,
    };
  });

  return (
    <svg className="map-pie-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((slice, i) => (
        <path key={i} d={slice.d} fill={slice.color} fillOpacity={0.85} stroke="var(--bg-deeper)" strokeWidth={1.2} />
      ))}
    </svg>
  );
}
