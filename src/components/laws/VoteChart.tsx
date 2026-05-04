import { arrangeSeats } from '../../game/parliament/seating';
import { evaluateLawVote, type VoteBreakdown, type VoteGroup } from '../../game/laws/voting';
import { stanceLabel, useLang, voteStatusLabel } from '../../utils/localization';
import type { FactionStance } from '../../models/types';

interface VoteChartProps {
  breakdown: VoteBreakdown;
  totalSeats: number;
}

export function VoteChart({ breakdown, totalSeats }: VoteChartProps) {
  const t = useLang();
  const seats = arrangeSeats(totalSeats);
  const NEUTRAL = '#6b7e9e';

  let maxR = 0;
  seats.forEach(p => { const dr = Math.sqrt(p.x*p.x + p.y*p.y)+p.r; if (dr>maxR) maxR=dr; });
  if (maxR === 0) maxR = 50;

  const pad = 10, BRACKET_R = maxR + 3.2, LABEL_R = maxR + 9;
  const vb = `${-maxR-pad-14} ${-maxR-pad} ${(maxR+pad+14)*2} ${maxR+pad+12}`;

  const colors: string[] = [];
  const stances: FactionStance[] = [];
  const addGroup = (group: VoteGroup[], stance: FactionStance) =>
    group.forEach(item => {
      for (let k=0; k<item.seats; k++) {
        colors.push(stance === 'abstain' ? NEUTRAL : item.color);
        stances.push(stance);
      }
    });
  addGroup(breakdown.support, 'support');
  addGroup(breakdown.abstain, 'abstain');
  addGroup(breakdown.against, 'against');
  while (colors.length < seats.length) { colors.push('#1a2438'); stances.push('abstain'); }

  const { supportSeats, abstainSeats, againstSeats } = breakdown;
  type Section = { label: string; color: string; start: number; end: number; count: number };

  const sections: Section[] = [];
  let cursor = 0;
  const addSection = (label: string, color: string, count: number) => {
    if (count > 0 && cursor < seats.length) {
      const last = Math.min(cursor + count - 1, seats.length - 1);
      sections.push({ label, color, start: seats[cursor].angle, end: seats[last].angle, count });
    }
    cursor += count;
  };
  addSection(stanceLabel(t, 'support').toUpperCase(), 'var(--good)', supportSeats);
  addSection(stanceLabel(t, 'abstain').toUpperCase(), 'var(--neutral)', abstainSeats);
  addSection(stanceLabel(t, 'against').toUpperCase(), 'var(--danger)', againstSeats);

  const arcLabel = ({ label, color, start, end, count }: Section) => {
    if (count < 1) return null;
    const span = start - end;
    if (span < 0.001) return null;
    const largeArc = span > Math.PI ? 1 : 0;
    const bx1 = Math.cos(start)*BRACKET_R, by1 = -Math.sin(start)*BRACKET_R;
    const bx2 = Math.cos(end)*BRACKET_R,   by2 = -Math.sin(end)*BRACKET_R;
    const mid = (start + end) / 2;
    const lx = Math.cos(mid)*LABEL_R, ly = -Math.sin(mid)*LABEL_R;
    return (
      <g key={label}>
        <path d={`M${bx1.toFixed(2)},${by1.toFixed(2)} A${BRACKET_R},${BRACKET_R} 0 ${largeArc},1 ${bx2.toFixed(2)},${by2.toFixed(2)}`}
          fill="none" stroke={color} strokeWidth="0.9" opacity="0.65" />
        <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
          fontSize="2.6" fontFamily="'JetBrains Mono',monospace" fill={color} opacity="0.85">
          {label}
        </text>
      </g>
    );
  };

  const evaluation = evaluateLawVote(breakdown);
  const statusColor = evaluation.statusTone === 'support'
    ? 'var(--good)'
    : evaluation.statusTone === 'against'
      ? 'var(--danger)'
      : 'var(--neutral)';

  return (
    <div className="vote-chart-wrap">
      <svg className="chart-svg vote-svg" viewBox={vb} preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="vote-shine" cx="35%" cy="30%" r="60%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        {seats.map((seat, i) => (
          <g key={i}>
            <circle cx={seat.x} cy={seat.y} r={seat.r}
              fill={colors[i]} opacity={colors[i]==='#1a2438' ? 0.25 : 0.82} />
            <circle cx={seat.x} cy={seat.y} r={seat.r} fill="url(#vote-shine)" />
          </g>
        ))}

        {sections.map(section => arcLabel(section))}

        <text x="0" y="2" textAnchor="middle" fontSize="2.8"
          fontFamily="'JetBrains Mono',monospace" fill="var(--text-mute)">
          {totalSeats} {t('seats').toUpperCase()}
        </text>
      </svg>

      <div className="vote-stats-bar">
        <div className="vote-stat">
          <span className="vote-stat-val" style={{color:'var(--good)'}}>{supportSeats}</span>
          <span className="vote-stat-lbl">{stanceLabel(t, 'support').toUpperCase()}</span>
        </div>
        <div className="vote-stat-sep" />
        <div className="vote-stat">
          <span className="vote-stat-val" style={{color:'var(--neutral)'}}>{abstainSeats}</span>
          <span className="vote-stat-lbl">{stanceLabel(t, 'abstain').toUpperCase()}</span>
        </div>
        <div className="vote-stat-sep" />
        <div className="vote-stat">
          <span className="vote-stat-val" style={{color:'var(--danger)'}}>{againstSeats}</span>
          <span className="vote-stat-lbl">{stanceLabel(t, 'against').toUpperCase()}</span>
        </div>
        <div className="vote-stat-sep" />
        <div className="vote-stat">
          <span className="vote-stat-val">{evaluation.votingRateLabel}</span>
          <span className="vote-stat-lbl">{t('voting_rate').toUpperCase()}</span>
        </div>
        <div className="vote-stat-sep" />
        <div className="vote-stat">
          <span className="vote-stat-val vote-status" style={{color: statusColor}}>{voteStatusLabel(t, evaluation.statusLabel).toUpperCase()}</span>
          <span className="vote-stat-lbl">{t('status').toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
