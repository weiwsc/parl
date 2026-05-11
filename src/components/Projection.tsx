import { useAppContext } from '../store';
import {
  arrangeSeats,
  computeStratumElectionTotals,
  fmtFull,
} from '../utils/compute';
import type { ProjectionResult } from '../models/types';
import { useLang } from '../utils/localization';
import { EmptyState } from './ui/EmptyState';
import { Panel } from './ui/Panel';
import { TableSurface } from './ui/TableSurface';

interface ProjectionProps {
  projection: ProjectionResult;
  title?: string;
}

type ArcGroup = {
  id: string;
  name: string;
  color: string;
  share: number;
  seats: number;
  startAngle: number;
  endAngle: number;
  midAngle: number;
};

export function ProjectionChart({ projection, title }: ProjectionProps) {
  const t = useLang();
  const seats = arrangeSeats(projection.totalSeats || 0);

  let maxR = 0;
  seats.forEach(p => {
    const dr = Math.sqrt(p.x * p.x + p.y * p.y) + p.r;
    if (dr > maxR) maxR = dr;
  });
  if (maxR === 0) maxR = 50;

  const pad = 10;
  const BRACKET_R = maxR + 2.8;
  const TEXT_R = maxR + 7.0;
  const viewBox = `${-maxR - pad - 8} ${-maxR - pad} ${(maxR + pad + 8) * 2} ${maxR + pad + 6}`;

  const colors: string[] = [];
  const seatGroupNames: string[] = [];

  projection.entries.forEach(e => {
    for (let k = 0; k < e.seats; k++) {
      colors.push(e.faction.color);
      seatGroupNames.push(e.alliance ? e.alliance.name : e.faction.name);
    }
  });

  while (colors.length < seats.length) {
    colors.push('var(--ui-seat-chart-empty-seat)');
    seatGroupNames.push('');
  }

  const arcGroups: ArcGroup[] = [];
  const seenAlliances = new Set<string>();
  let cumul = 0;

  for (const entry of projection.entries) {
    if (entry.alliance) {
      const aid = entry.alliance.id;

      if (!seenAlliances.has(aid)) {
        seenAlliances.add(aid);

        const ae = projection.entries.filter(e => e.alliance?.id === aid);
        const totalShare = ae.reduce((s, e) => s + e.share, 0);
        const totalSeats = ae.reduce((s, e) => s + e.seats, 0);

        if (totalSeats > 0) {
          const sa = Math.PI * (1 - cumul);
          const ea = Math.PI * (1 - (cumul + totalShare));

          arcGroups.push({
            id: aid,
            name: entry.alliance.name,
            color: entry.alliance.color,
            share: totalShare,
            seats: totalSeats,
            startAngle: sa,
            endAngle: ea,
            midAngle: (sa + ea) / 2,
          });
        }
      }
    }

    cumul += entry.share;
  }

  const arcR = maxR - 1;

  return (
      <div className="chart-wrap">
        <div className="chart-meta">
          {title ?? t("projected_composition")}
          <span className="total">— {projection.totalSeats} {t("seats")} —</span>
          <div className="meta-line">
            <span>Strata <b>{projection.strataCount}</b></span>
            <span>Factions <b>{projection.factionsCount}</b></span>
            <span>Mode <b>{projection.unalignedMode ? 'Unaligned' : 'Proportional'}</b></span>
          </div>
        </div>

        <svg className="chart-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="seat-shine" cx="35%" cy="30%" r="60%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>

            {arcGroups.map(g => {
              const GAP = 0.022;
              const bsa = g.startAngle - GAP;
              const bea = g.endAngle + GAP;
              const span = bsa - bea;
              const largeArc = span > Math.PI ? 1 : 0;

              const tx1 = Math.cos(bsa) * TEXT_R;
              const ty1 = -Math.sin(bsa) * TEXT_R;
              const tx2 = Math.cos(bea) * TEXT_R;
              const ty2 = -Math.sin(bea) * TEXT_R;

              return (
                  <path
                      key={`tp-${g.id}`}
                      id={`arc-text-${g.id}`}
                      d={`M ${tx1.toFixed(2)},${ty1.toFixed(2)} A ${TEXT_R},${TEXT_R} 0 ${largeArc},1 ${tx2.toFixed(2)},${ty2.toFixed(2)}`}
                  />
              );
            })}
          </defs>

          {arcGroups.map(g => {
            const GAP = 0.022;
            const bsa = g.startAngle - GAP;
            const bea = g.endAngle + GAP;
            const span = bsa - bea;
            const largeArc = span > Math.PI ? 1 : 0;

            const bx1 = Math.cos(bsa) * BRACKET_R;
            const by1 = -Math.sin(bsa) * BRACKET_R;
            const bx2 = Math.cos(bea) * BRACKET_R;
            const by2 = -Math.sin(bea) * BRACKET_R;

            const TI = maxR + 0.4;
            const TO = BRACKET_R + 1.4;

            const FONT_SZ = 2.3;

            const fullLabel = g.name.toUpperCase();
            const MIN_ARC_FOR_TEXT = 0.22;
            const canUseArcText = span >= MIN_ARC_FOR_TEXT;

            const shortLabel =
                fullLabel.length > 10 ? fullLabel.slice(0, 9) + '…' : fullLabel;

            const mid = g.midAngle;

            const lx1 = Math.cos(mid) * (BRACKET_R + 0.8);
            const ly1 = -Math.sin(mid) * (BRACKET_R + 0.8);
            const lx2 = Math.cos(mid) * (BRACKET_R + 5.0);
            const ly2 = -Math.sin(mid) * (BRACKET_R + 5.0);

            const isRightSide = Math.cos(mid) >= 0;
            const textAnchor = isRightSide ? 'start' : 'end';
            const labelX = lx2 + (isRightSide ? 1.2 : -1.2);
            const labelY = ly2 + 0.8;

            return (
                <g key={g.id}>
                  <line
                      x1={Math.cos(g.startAngle) * TI}
                      y1={-Math.sin(g.startAngle) * TI}
                      x2={Math.cos(g.startAngle) * TO}
                      y2={-Math.sin(g.startAngle) * TO}
                      stroke={g.color}
                      strokeWidth="0.55"
                      strokeOpacity="0.95"
                  />

                  <line
                      x1={Math.cos(g.endAngle) * TI}
                      y1={-Math.sin(g.endAngle) * TI}
                      x2={Math.cos(g.endAngle) * TO}
                      y2={-Math.sin(g.endAngle) * TO}
                      stroke={g.color}
                      strokeWidth="0.55"
                      strokeOpacity="0.95"
                  />

                  <path
                      d={`M ${bx1.toFixed(2)},${by1.toFixed(2)} A ${BRACKET_R},${BRACKET_R} 0 ${largeArc},1 ${bx2.toFixed(2)},${by2.toFixed(2)}`}
                      fill="none"
                      stroke={g.color}
                      strokeWidth="0.55"
                      strokeOpacity="0.85"
                  />

                  {canUseArcText ? (
                      <text
                          fontSize={FONT_SZ}
                          fontFamily="'JetBrains Mono','Noto Sans Mono','Noto Sans',system-ui,sans-serif"
                          fontWeight="700"
                          letterSpacing="0.3"
                          fill={g.color}
                      >
                        <textPath href={`#arc-text-${g.id}`} startOffset="50%" textAnchor="middle">
                          {fullLabel}
                        </textPath>
                      </text>
                  ) : (
                      <g>
                        <line
                            x1={lx1}
                            y1={ly1}
                            x2={lx2}
                            y2={ly2}
                            stroke={g.color}
                            strokeWidth="0.35"
                            strokeOpacity="0.75"
                        />
                        <text
                            x={labelX}
                            y={labelY}
                            textAnchor={textAnchor}
                            fontSize="2"
                            fontFamily="'JetBrains Mono','Noto Sans Mono','Noto Sans',system-ui,sans-serif"
                            fontWeight="700"
                            fill={g.color}
                        >
                          {shortLabel}
                        </text>
                      </g>
                  )}
                </g>
            );
          })}

          {Array.from({ length: 13 }, (_, i) => {
            const angle = (i / 12) * Math.PI;
            const major = i % 3 === 0;
            const r1 = maxR + 0.4;
            const r2 = maxR + (major ? 2.2 : 1.2);

            return (
                <line
                    key={i}
                    x1={Math.cos(angle) * r1}
                    y1={-Math.sin(angle) * r1}
                    x2={Math.cos(angle) * r2}
                    y2={-Math.sin(angle) * r2}
                    stroke="var(--ui-seat-chart-tick)"
                    strokeWidth={major ? 0.35 : 0.18}
                />
            );
          })}

          <path
              d={`M ${-arcR},0 A ${arcR},${arcR} 0 0 1 ${arcR},0`}
              stroke="var(--ui-seat-chart-ring)"
              strokeWidth="0.22"
              fill="none"
          />

          <path
              d={`M ${-(arcR - 2)},0 A ${arcR - 2},${arcR - 2} 0 0 1 ${arcR - 2},0`}
              stroke="var(--ui-seat-chart-ring-soft)"
              strokeWidth="0.15"
              fill="none"
              strokeDasharray="0.5 0.7"
          />

          <line
              x1={-(maxR + pad + 6)}
              y1="0"
              x2={maxR + pad + 6}
              y2="0"
              stroke="var(--ui-seat-chart-axis)"
              strokeWidth="0.24"
          />

          <line
              x1={-arcR}
              y1="0"
              x2={-arcR}
              y2="-1.8"
              stroke="var(--ui-seat-chart-endcap)"
              strokeWidth="0.22"
          />

          <line
              x1={arcR}
              y1="0"
              x2={arcR}
              y2="-1.8"
              stroke="var(--ui-seat-chart-endcap)"
              strokeWidth="0.22"
          />

          {seats.map((p, i) => (
              <circle
                  key={`seat-${i}`}
                  className="seat"
                  cx={p.x.toFixed(3)}
                  cy={p.y.toFixed(3)}
                  r={p.r.toFixed(2)}
                  fill={colors[i]}
                  stroke="var(--ui-seat-chart-seat-stroke)"
                  strokeWidth="0.15"
              >
                <title>{`Seat ${i + 1}${seatGroupNames[i] ? ' — ' + seatGroupNames[i] : ''}`}</title>
              </circle>
          ))}

          {seats.map((p, i) => (
              <circle
                  key={`shine-${i}`}
                  cx={(p.x + p.r * 0.22).toFixed(3)}
                  cy={(p.y - p.r * 0.28).toFixed(3)}
                  r={(p.r * 0.48).toFixed(2)}
                  fill="url(#seat-shine)"
                  style={{ pointerEvents: 'none' }}
              />
          ))}

          <g style={{ pointerEvents: 'none' }}>
            <rect x="-6" y="-0.55" width="12" height="1.1" fill="var(--accent-deep)" opacity="0.5" />
            <rect x="-2.5" y="-0.55" width="5" height="1.1" fill="var(--accent)" opacity="0.7" />
            <circle cx="0" cy="-0.4" r="0.85" fill="var(--accent-hot)" opacity="0.85" />
          </g>
        </svg>
      </div>
  );
}

export function SupportMatrix({ projection }: ProjectionProps) {
  const { state } = useAppContext();

  if (state.factions.length === 0 || state.strata.length === 0) {
    return (
        <Panel title="Votes / Supporters By Strata &mdash; Read Only" bodyClassName="no-scroll">
          <EmptyState>Requires both strata and factions.</EmptyState>
        </Panel>
    );
  }

  const stratumTotals = computeStratumElectionTotals(state, { randomize: false });

  return (
      <Panel title="Votes / Supporters By Strata &mdash; Read Only" bodyClassName="matrix-wrap no-scroll">
        <TableSurface>
          <table className="matrix">
            <thead>
            <tr>
              <th className="faction-col">Faction</th>
              {state.strata.map(s => <th key={s.id} title={s.name}>{s.name}</th>)}
              <th title="Votes multiplied by strata political power">Weighted Power</th>
            </tr>
            </thead>

            <tbody>
            {state.factions.map(f => {
              const pEntry = projection.entries.find(e => e.faction.id === f.id);
              const pwr = pEntry ? pEntry.power : 0;

              return (
                  <tr key={f.id}>
                    <th className="faction-col">
                    <span
                        className="swatch-inline"
                        style={{ background: f.color, color: f.color }}
                    ></span>
                      {f.name}
                    </th>

                    {state.strata.map(s => {
                      const vote = stratumTotals.votesByFactionByStratum[f.id]?.[s.id] || 0;
                      const support = stratumTotals.supportByFactionByStratum[f.id]?.[s.id] || 0;
                      const totalVote = stratumTotals.totalVotesByStratum[s.id] || 0;
                      const pct = totalVote > 0 ? Math.min(100, (vote / totalVote) * 100) : vote > 0 ? 100 : 0;

                      return (
                          <td
                              key={s.id}
                              className="cell-support"
                              style={{ color: f.color }}
                              title={`${fmtFull(vote)} votes / ${fmtFull(support)} supporters`}
                          >
                            <div className="cell-bar" style={{ width: `${pct}%` }}></div>
                            <span className="cell-val"><span className="cell-label">Votes</span>{fmtMatrixNumber(vote)}</span>
                            <span className="cell-sub"><span className="cell-label">Sup</span>{fmtMatrixNumber(support)} · {fmtMatrixPercent(pct)}</span>
                          </td>
                      );
                    })}

                    <td className="cell-power">{fmtFull(pwr)}</td>
                  </tr>
              );
            })}

            <tr className="totals">
              <th className="faction-col">Total Votes / Supporters</th>
              {state.strata.map(s => {
                const vote = stratumTotals.totalVotesByStratum[s.id] || 0;
                const support = stratumTotals.totalSupportByStratum[s.id] || 0;
                const population = stratumTotals.populationByStratum[s.id] || 0;
                const isOver = support > population;
                const votePct = population > 0 ? vote / population * 100 : vote > 0 ? 100 : 0;

                return (
                    <td key={s.id} style={{ color: isOver ? 'var(--danger)' : '' }}>
                      <span className="cell-val"><span className="cell-label">Votes</span>{fmtMatrixNumber(vote)}</span>
                      <span className="cell-sub"><span className="cell-label">Sup</span>{fmtMatrixNumber(support)} · {fmtMatrixPercent(votePct)} of pop</span>
                    </td>
                );
              })}
              <td></td>
            </tr>
            </tbody>
          </table>
        </TableSurface>
      </Panel>
  );
}

function fmtMatrixNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs < 1000) return String(Math.round(value));

  const units = [
    { threshold: 1_000_000_000, suffix: 'B' },
    { threshold: 1_000_000, suffix: 'M' },
    { threshold: 1_000, suffix: 'K' },
  ];
  const unit = units.find(item => abs >= item.threshold)!;
  const scaled = value / unit.threshold;
  const maxDigits = Math.abs(scaled) < 10 ? 3 : Math.abs(scaled) < 100 ? 3 : 3;

  return `${formatSignificant(scaled, maxDigits)}${unit.suffix}`;
}

function fmtMatrixPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 10 ? 1 : 0;
  return `${value.toFixed(digits).replace(/\.0$/, '')}%`;
}

function formatSignificant(value: number, maxSignificantDigits: number): string {
  return new Intl.NumberFormat('en', {
    maximumSignificantDigits: maxSignificantDigits,
  }).format(value);
}
