import { useId } from 'react';
import type { ControlEntry } from '../../game/map/types';

interface PieChartProps {
  entries: ControlEntry[];
  size?: number;
}

export function PieChart({ entries, size = 120 }: PieChartProps) {
  const uid = useId().replace(/:/g, '_');
  const cx = size / 2;
  const cy = size / 2;
  const r  = size / 2 - 5;
  const ri = r * 0.50;

  const total = entries.reduce((s, e) => s + e.pct, 0);
  const display: ControlEntry[] = [...entries];
  if (total < 99.9) {
    display.push({ id: '_gap', color: '#1e2030', label: '', pct: 100 - total });
  }

  if (display.length === 1) {
    return (
      <svg className="pie-donut-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill={display[0].color} />
        <circle cx={cx} cy={cy} r={ri} fill="var(--bg-panel)" />
        <circle cx={cx} cy={cy} r={ri} fill="none" stroke="var(--line-soft)" strokeWidth={0.75} />
      </svg>
    );
  }

  const filterId = `pglow_${uid}`;
  let angle = -Math.PI / 2;
  const slices = display.map(entry => {
    const sweep = (entry.pct / 100) * 2 * Math.PI;
    const x1o = cx + r  * Math.cos(angle);
    const y1o = cy + r  * Math.sin(angle);
    const x1i = cx + ri * Math.cos(angle);
    const y1i = cy + ri * Math.sin(angle);
    angle += sweep;
    const x2o = cx + r  * Math.cos(angle);
    const y2o = cy + r  * Math.sin(angle);
    const x2i = cx + ri * Math.cos(angle);
    const y2i = cy + ri * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    const d = `M${x1i.toFixed(2)},${y1i.toFixed(2)} L${x1o.toFixed(2)},${y1o.toFixed(2)} A${r},${r},0,${large},1,${x2o.toFixed(2)},${y2o.toFixed(2)} L${x2i.toFixed(2)},${y2i.toFixed(2)} A${ri},${ri},0,${large},0,${x1i.toFixed(2)},${y1i.toFixed(2)} Z`;
    return { ...entry, d };
  });

  return (
    <svg className="pie-donut-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>
        {slices.map((slice, i) => (
          <path
            key={i}
            d={slice.d}
            fill={slice.color}
            stroke="var(--bg-panel)"
            strokeWidth={1.2}
            opacity={0.92}
          />
        ))}
      </g>
      <circle cx={cx} cy={cy} r={ri - 0.5} fill="var(--bg-panel)" />
      <circle cx={cx} cy={cy} r={ri - 0.5} fill="none" stroke="var(--line-soft)" strokeWidth={0.75} />
    </svg>
  );
}
