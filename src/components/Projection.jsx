import { useAppContext, UNALIGNED_COLOR } from '../store';
import { computeProjection, arrangeSeats, escapeHtml, fmtFull } from '../utils/compute';

export function ProjectionChart({ projection }) {
  const seats = arrangeSeats(projection.totalSeats);
  let maxR = 0;
  seats.forEach(p => {
    const dr = Math.sqrt(p.x*p.x + p.y*p.y) + p.r;
    if (dr > maxR) maxR = dr;
  });
  if (maxR === 0) maxR = 50;
  const pad = 4;
  const viewBox = `${-maxR-pad} ${-maxR-pad} ${(maxR+pad)*2} ${maxR+pad+pad}`;

  const colors = [];
  projection.entries.forEach(e => {
    for (let k = 0; k < e.seats; k++) colors.push(e.faction.color);
  });
  while (colors.length < seats.length) colors.push('#2a3a5a');

  const arcR = maxR - 1;

  return (
    <div className="chart-wrap">
      <div className="chart-meta">
        Projected Composition
        <span className="total">— {projection.totalSeats} SEATS —</span>
        <div className="meta-line">
          <span>Strata <b>{projection.strataCount}</b></span>
          <span>Factions <b>{projection.factionsCount}</b></span>
          <span>Mode <b>{projection.unalignedMode ? 'Unaligned' : 'Proportional'}</b></span>
        </div>
      </div>
      <svg className="chart-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        <path d={`M ${-arcR},0 A ${arcR},${arcR} 0 0 1 ${arcR},0`} stroke="rgba(95,216,255,0.20)" strokeWidth="0.25" fill="none" />
        <path d={`M ${-(arcR-2)},0 A ${arcR-2},${arcR-2} 0 0 1 ${arcR-2},0`} stroke="rgba(212,161,74,0.14)" strokeWidth="0.18" fill="none" strokeDasharray="0.4 0.6" />
        <line x1={-(maxR+pad-1)} y1="0" x2={maxR+pad-1} y2="0" stroke="rgba(95,216,255,0.30)" strokeWidth="0.3" />
        <line x1={-arcR} y1="0" x2={-arcR} y2="-1.6" stroke="rgba(212,161,74,0.6)" strokeWidth="0.25" />
        <line x1={arcR} y1="0" x2={arcR} y2="-1.6" stroke="rgba(212,161,74,0.6)" strokeWidth="0.25" />
        {seats.map((p, i) => (
          <circle
            key={`seat-${i}`}
            className="seat"
            cx={p.x.toFixed(3)}
            cy={p.y.toFixed(3)}
            r={p.r.toFixed(2)}
            fill={colors[i]}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth="0.15"
          >
            <title>Seat {i + 1}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

export function ResultsGrid({ projection }) {
  return (
    <div className="panel">
      <span className="corner tl"></span><span className="corner tr"></span>
      <span className="corner bl"></span><span className="corner br"></span>
      <div className="panel-header"><h2>Live Projection</h2></div>
      <div className="panel-body no-scroll">
        <div className="results-grid">
          {projection.entries.map((entry, i) => (
            <div key={i} className="result">
              <span className="swatch" style={{ background: entry.faction.color, color: entry.faction.color }}></span>
              <span className="name" title={entry.faction.name}>{entry.faction.name}</span>
              <div className="right">
                <div className="seats">{entry.seats}</div>
                <div className="pct">{(entry.share * 100).toFixed(1)}%</div>
              </div>
              <div className="bar" style={{ color: entry.faction.color }}>
                <span style={{ width: `${(entry.share * 100).toFixed(2)}%` }}></span>
              </div>
            </div>
          ))}
          {projection.entries.length === 0 && <div className="empty">No projection data.</div>}
        </div>
      </div>
    </div>
  );
}

export function SupportMatrix({ projection }) {
  const { state } = useAppContext();

  if (state.factions.length === 0 || state.strata.length === 0) {
    return (
      <div className="panel">
        <span className="corner tl"></span><span className="corner tr"></span>
        <span className="corner bl"></span><span className="corner br"></span>
        <div className="panel-header"><h2>Support Matrix &mdash; Read Only</h2></div>
        <div className="panel-body no-scroll">
          <div className="empty">Requires both strata and factions.</div>
        </div>
      </div>
    );
  }

  const totals = state.strata.map(s => state.factions.reduce((a, f) => a + (f.support[s.id] || 0), 0));

  return (
    <div className="panel">
      <span className="corner tl"></span><span className="corner tr"></span>
      <span className="corner bl"></span><span className="corner br"></span>
      <div className="panel-header"><h2>Support Matrix &mdash; Read Only</h2></div>
      <div className="panel-body matrix-wrap no-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th className="faction-col">Faction</th>
              {state.strata.map(s => <th key={s.id} title={s.name}>{s.name}</th>)}
              <th>Power</th>
            </tr>
          </thead>
          <tbody>
            {state.factions.map((f, i) => {
              const pEntry = projection.entries.find(e => e.faction.id === f.id);
              const pwr = pEntry ? pEntry.power : 0;
              return (
                <tr key={f.id}>
                  <th className="faction-col">
                    <span className="swatch-inline" style={{ background: f.color, color: f.color }}></span>
                    {f.name}
                  </th>
                  {state.strata.map((s, j) => {
                    const v = f.support[s.id] || 0;
                    const pop = s.population || 1;
                    const pct = Math.min(100, (v / pop) * 100);
                    return (
                      <td key={s.id} className="cell-support" style={{ color: f.color }} title={`${fmtFull(v)} / ${fmtFull(s.population)}`}>
                        <div className="cell-bar" style={{ width: `${pct}%` }}></div>
                        <span className="cell-val">{(v/1000).toFixed(0)}k</span>
                      </td>
                    );
                  })}
                  <td className="cell-power">{fmtFull(pwr)}</td>
                </tr>
              );
            })}
            <tr className="totals">
              <th className="faction-col">Total Allocated</th>
              {state.strata.map((s, j) => {
                const isOver = totals[j] > s.population;
                return (
                  <td key={s.id} style={{ color: isOver ? 'var(--danger)' : '' }}>
                    {(totals[j]/1000).toFixed(0)}k / {(s.population/1000).toFixed(0)}k
                  </td>
                );
              })}
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
