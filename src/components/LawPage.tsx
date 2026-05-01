import { useState, useMemo, useRef, useCallback } from 'react';
import { useAppContext, uid, clone } from '../store';
import { useAuth } from '../context/AuthContext';
import { computeProjection, arrangeSeats } from '../utils/compute';
import type { Law, LawClause, LawStatus, FactionStance, LawVoteRecord, ProjectionEntry } from '../models/types';

// ── Types ─────────────────────────────────────────────────────────────────────
type LawTab = 'floor' | 'laws' | 'constitution' | 'history';
type LawsFilter = LawStatus | 'all';

interface VoteGroup { factionId: string; seats: number; color: string; name: string; }
interface VoteBreakdown {
  support: VoteGroup[]; abstain: VoteGroup[]; against: VoteGroup[];
  supportSeats: number; abstainSeats: number; againstSeats: number;
}

// ── Markdown renderer (XSS-safe) ──────────────────────────────────────────────
function renderMarkdown(text: string): string {
  if (!text.trim()) return '<p class="md-empty">No description.</p>';
  const esc = (s: string) =>
    s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>');

  const lines = text.split('\n');
  let html = '', inUL = false, depth = 0;

  const closeUL = () => {
    while (depth > 0) { html += '</ul>'; depth--; }
    inUL = false;
  };

  for (const raw of lines) {
    const m = raw.match(/^(\s*)[-*•]\s(.+)$/);
    const h2 = raw.match(/^##\s(.+)$/);
    const h1 = raw.match(/^#\s(.+)$/);
    if (h2) { closeUL(); html += `<h4 class="md-h4">${inline(h2[1])}</h4>`; }
    else if (h1) { closeUL(); html += `<h3 class="md-h3">${inline(h1[1])}</h3>`; }
    else if (m) {
      const d = Math.min(3, Math.floor(m[1].length / 2));
      if (!inUL) { html += '<ul class="md-ul">'; inUL = true; depth = 0; }
      while (depth < d) { html += '<ul class="md-ul-nested">'; depth++; }
      while (depth > d) { html += '</ul>'; depth--; }
      html += `<li class="md-li">${inline(m[2])}</li>`;
    } else {
      closeUL();
      if (raw.trim()) html += `<p class="md-p">${inline(raw.trim())}</p>`;
    }
  }
  closeUL();
  return html;
}

// ── Vote calculation ───────────────────────────────────────────────────────────
function computeVoteBreakdown(
  law: Law | null,
  entries: ProjectionEntry[],
  totalSeats: number
): VoteBreakdown {
  const support: VoteGroup[] = [], abstain: VoteGroup[] = [], against: VoteGroup[] = [];
  for (const entry of entries) {
    if (entry.isUnaligned) continue;
    const stance: FactionStance = law?.factionStances[entry.faction.id] ?? 'abstain';
    const item: VoteGroup = { factionId: entry.faction.id, seats: entry.seats, color: entry.faction.color, name: entry.faction.name };
    if (stance === 'support') support.push(item);
    else if (stance === 'against') against.push(item);
    else abstain.push(item);
  }
  const supportSeats = support.reduce((s,g) => s+g.seats, 0);
  const againstSeats = against.reduce((s,g) => s+g.seats, 0);
  const abstainSeats = Math.max(0, totalSeats - supportSeats - againstSeats);
  return { support, abstain, against, supportSeats, abstainSeats, againstSeats };
}

function computeLawNetSupport(law: Law, entries: ProjectionEntry[]): number {
  let s = 0, a = 0;
  for (const e of entries) {
    if (e.isUnaligned) continue;
    const stance = law.factionStances[e.faction.id] ?? 'abstain';
    if (stance === 'support') s += e.seats;
    else if (stance === 'against') a += e.seats;
  }
  return s - a;
}

function recordToBreakdown(rec: LawVoteRecord): VoteBreakdown {
  const support: VoteGroup[] = [], abstain: VoteGroup[] = [], against: VoteGroup[] = [];
  for (const fr of rec.factionResults) {
    const item: VoteGroup = { factionId: fr.factionId, seats: fr.seats, color: fr.color, name: fr.name };
    if (fr.stance === 'support') support.push(item);
    else if (fr.stance === 'against') against.push(item);
    else abstain.push(item);
  }
  return { support, abstain, against, supportSeats: rec.supportSeats, abstainSeats: rec.abstainSeats, againstSeats: rec.againstSeats };
}

// ── VoteChart ─────────────────────────────────────────────────────────────────
function VoteChart({ breakdown, totalSeats }: { breakdown: VoteBreakdown; totalSeats: number }) {
  const seats = arrangeSeats(totalSeats);
  const NEUTRAL = '#6b7e9e';

  let maxR = 0;
  seats.forEach(p => { const dr = Math.sqrt(p.x*p.x + p.y*p.y)+p.r; if (dr>maxR) maxR=dr; });
  if (maxR === 0) maxR = 50;

  const pad = 10, BRACKET_R = maxR + 3.2, LABEL_R = maxR + 9;
  const vb = `${-maxR-pad-14} ${-maxR-pad} ${(maxR+pad+14)*2} ${maxR+pad+12}`;

  // build color array: support → abstain → against (order = left → center → right)
  const colors: string[] = [], stances: FactionStance[] = [];
  const addGroup = (g: VoteGroup[], s: FactionStance) =>
    g.forEach(item => { for (let k=0; k<item.seats; k++) { colors.push(s==='abstain'?NEUTRAL:item.color); stances.push(s); }});
  addGroup(breakdown.support, 'support');
  addGroup(breakdown.abstain, 'abstain');
  addGroup(breakdown.against, 'against');
  while (colors.length < seats.length) { colors.push('#1a2438'); stances.push('abstain'); }

  // Arc labels
  const { supportSeats, abstainSeats, againstSeats } = breakdown;
  type Sec = { label: string; color: string; start: number; end: number; count: number };

  const sections: Sec[] = [];
  let cursor = 0;
  const addSec = (label: string, color: string, count: number) => {
    if (count > 0 && cursor < seats.length) {
      const last = Math.min(cursor + count - 1, seats.length - 1);
      sections.push({ label, color, start: seats[cursor].angle, end: seats[last].angle, count });
    }
    cursor += count;
  };
  addSec('SUPPORT', 'var(--good)', supportSeats);
  addSec('ABSTAIN', 'var(--neutral)', abstainSeats);
  addSec('AGAINST', 'var(--danger)', againstSeats);

  const arcLabel = ({ label, color, start, end, count }: Sec) => {
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

  const votingRate = totalSeats > 0 ? ((supportSeats + againstSeats) / totalSeats * 100).toFixed(0) : '0';
  const passedVotingVoteThreadhold : boolean = ((supportSeats + againstSeats) / totalSeats) >= 0.51;
  const net = supportSeats - againstSeats;
  const status = !passedVotingVoteThreadhold? 'FAILING (NOT ENOUGH VOTE)' : net > 0 ? 'PASSING' : net < 0 ? 'FAILING' : supportSeats+againstSeats > 0 ? 'TIED' : 'NO VOTE';
  const statusColor = net > 0 ? 'var(--good)' : net < 0 ? 'var(--danger)' : 'var(--neutral)';

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

        {sections.map(s => arcLabel(s))}

        <text x="0" y="2" textAnchor="middle" fontSize="2.8"
          fontFamily="'JetBrains Mono',monospace" fill="var(--text-mute)">
          {totalSeats} SEATS
        </text>
      </svg>

      <div className="vote-stats-bar">
        <div className="vote-stat">
          <span className="vote-stat-val" style={{color:'var(--good)'}}>{supportSeats}</span>
          <span className="vote-stat-lbl">SUPPORT</span>
        </div>
        <div className="vote-stat-sep" />
        <div className="vote-stat">
          <span className="vote-stat-val" style={{color:'var(--neutral)'}}>{abstainSeats}</span>
          <span className="vote-stat-lbl">ABSTAIN</span>
        </div>
        <div className="vote-stat-sep" />
        <div className="vote-stat">
          <span className="vote-stat-val" style={{color:'var(--danger)'}}>{againstSeats}</span>
          <span className="vote-stat-lbl">AGAINST</span>
        </div>
        <div className="vote-stat-sep" />
        <div className="vote-stat">
          <span className="vote-stat-val">{votingRate}%</span>
          <span className="vote-stat-lbl">VOTING RATE</span>
        </div>
        <div className="vote-stat-sep" />
        <div className="vote-stat">
          <span className="vote-stat-val vote-status" style={{color: statusColor}}>{status}</span>
          <span className="vote-stat-lbl">STATUS</span>
        </div>
      </div>
    </div>
  );
}

// ── StancePanel (DnD) ─────────────────────────────────────────────────────────
interface StancePanelProps {
  law: Law;
  entries: ProjectionEntry[];
  onUpdateStance: (factionId: string, stance: FactionStance) => void;
  canEdit: boolean;
}

function StancePanel({ law, entries, onUpdateStance, canEdit }: StancePanelProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<FactionStance | null>(null);

  const grouped = useMemo(() => {
    const sup: ProjectionEntry[] = [], abs: ProjectionEntry[] = [], ag: ProjectionEntry[] = [];
    for (const e of entries) {
      if (e.isUnaligned) continue;
      const s = law.factionStances[e.faction.id] ?? 'abstain';
      if (s === 'support') sup.push(e);
      else if (s === 'against') ag.push(e);
      else abs.push(e);
    }
    return { support: sup, abstain: abs, against: ag };
  }, [law.factionStances, entries]);

  const cols: { key: FactionStance; label: string; color: string; entries: ProjectionEntry[] }[] = [
    { key: 'support', label: 'SUPPORT', color: 'var(--good)',    entries: grouped.support },
    { key: 'abstain', label: 'ABSTAIN', color: 'var(--neutral)', entries: grouped.abstain },
    { key: 'against', label: 'AGAINST', color: 'var(--danger)',  entries: grouped.against },
  ];

  return (
    <div className="stance-panel">
      {cols.map(col => (
        <div
          key={col.key}
          className={`stance-col${dropTarget === col.key ? ' drop-active' : ''}`}
          onDragOver={canEdit ? e => { e.preventDefault(); setDropTarget(col.key); } : undefined}
          onDragLeave={canEdit ? () => setDropTarget(null) : undefined}
          onDrop={canEdit ? e => {
            e.preventDefault();
            if (draggingId) onUpdateStance(draggingId, col.key);
            setDraggingId(null); setDropTarget(null);
          } : undefined}
        >
          <div className="stance-col-hd" style={{ borderBottomColor: col.color }}>
            <span style={{ color: col.color }}>{col.label}</span>
            <span className="stance-col-count">{col.entries.reduce((s,e)=>s+e.seats,0)} seats</span>
          </div>
          <div className="stance-chips">
            {col.entries.map(e => (
              <div
                key={e.faction.id}
                className={`stance-chip${draggingId === e.faction.id ? ' dragging' : ''}${canEdit ? ' draggable' : ''}`}
                draggable={canEdit}
                onDragStart={() => setDraggingId(e.faction.id)}
                onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
              >
                <span className="chip-dot" style={{ background: e.faction.color }} />
                <span className="chip-name">{e.faction.name}</span>
                <span className="chip-seats">{e.seats}</span>
              </div>
            ))}
            {col.entries.length === 0 && (
              <div className="stance-col-empty">drop here</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── LawSupportBar ─────────────────────────────────────────────────────────────
function LawSupportBar({ sup, abs, ag, total }: { sup: number; abs: number; ag: number; total: number }) {
  if (total === 0) return <div className="law-sup-bar" />;
  const pct = (n: number) => `${(n / total * 100).toFixed(1)}%`;
  return (
    <div className="law-sup-bar" title={`Support: ${sup}  Abstain: ${abs}  Against: ${ag}`}>
      {sup > 0 && <div className="lsb-seg lsb-sup" style={{ width: pct(sup) }} />}
      {abs > 0 && <div className="lsb-seg lsb-abs" style={{ width: pct(abs) }} />}
      {ag  > 0 && <div className="lsb-seg lsb-ag"  style={{ width: pct(ag)  }} />}
    </div>
  );
}

// ── LawCard ───────────────────────────────────────────────────────────────────
const ROMAN = ['', 'I','II','III','IV','V','VI','VII','VIII','IX','X',
  'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];

const STATUS_LABELS: Record<LawStatus, string> = {
  draft: 'Draft', effect: 'In Effect', abolished: 'Abolished', failed: 'Failed'
};

interface LawCardProps {
  law: Law;
  articleNum?: number;
  isConstitution?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
  onToggleConstitution?: () => void;
  onStatusChange?: (s: LawStatus) => void;
  onDelete?: () => void;
}

function LawCard({ law, articleNum, isConstitution, canEdit, onEdit, onToggleConstitution, onStatusChange, onDelete }: LawCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  let l0 = 0;

  return (
    <div className={`law-card law-card--${law.status}${isConstitution ? ' law-card--const' : ''}${collapsed ? ' law-card--collapsed' : ''}`}>
      <span className="lc-corner lc-tl" /><span className="lc-corner lc-tr" />
      <span className="lc-corner lc-bl" /><span className="lc-corner lc-br" />
      <div className="law-card-hd" onClick={() => setCollapsed(c => !c)}>
        <div className="law-card-hd-left">
          {isConstitution && articleNum !== undefined && (
            <span className="law-card-artnum">ART.{String(articleNum).padStart(2, '0')}</span>
          )}
          <div className="law-card-titles">
            <span className="law-card-name">{law.name}</span>
            {law.subtitle && <span className="law-card-sub">{law.subtitle}</span>}
          </div>
        </div>
        <div className="law-card-hd-right">
          {canEdit && (
            <div className="law-card-actions" onClick={e => e.stopPropagation()}>
              {onStatusChange && (
                <select className="law-status-select" value={law.status}
                  onChange={e => onStatusChange(e.target.value as LawStatus)}>
                  <option value="draft">◫ DRAFT</option>
                  <option value="effect">◈ IN EFFECT</option>
                  <option value="failed">✗ FAILED</option>
                  <option value="abolished">— ABOLISHED</option>
                </select>
              )}
              {onEdit && <button className="ghost small" onClick={onEdit} title="Edit">✎</button>}
              {onToggleConstitution && (
                <button className="ghost small" onClick={onToggleConstitution}
                  title={isConstitution ? 'Remove from Constitution' : 'Move to Constitution'}>
                  {isConstitution ? '⊖' : '⚖'}
                </button>
              )}
              {onDelete && <button className="ghost small danger" onClick={onDelete}>✕</button>}
            </div>
          )}
          <span className="law-card-chevron">{collapsed ? '▼' : '▲'}</span>
        </div>
      </div>

      {!collapsed && (
        <div className="law-card-body">
          {isConstitution && (
            <div className="law-const-ornament-row">
              <span className="ornament-line" />
              <span className="ornament-glyph">◆</span>
              <span className="ornament-line" />
            </div>
          )}

          {law.description && (
            <div className="law-card-section">
              {isConstitution && <div className="law-const-sec-hd">◈ PREAMBLE</div>}
              <div className="law-md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(law.description) }} />
            </div>
          )}

          {law.clauses.length > 0 && (
            <div className="law-card-section">
              {isConstitution && <div className="law-const-sec-hd">◦ PROVISIONS</div>}
              <div className="law-clauses-list">
                {law.clauses.map(c => {
                  if (c.level === 0) l0++;
                  const marker = c.level === 0
                    ? (isConstitution ? `${ROMAN[l0] ?? l0}.` : `${String(l0).padStart(2,'0')}.`)
                    : (['◦','·','—'][c.level - 1] ?? '—');
                  return (
                    <div key={c.id} className={`law-clause-item law-clause-level-${c.level}`}
                      style={{ paddingLeft: `${c.level * 24}px` }}>
                      <span className="law-clause-marker">{marker}</span>
                      <span className="law-clause-text">{c.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── LawListPanel ──────────────────────────────────────────────────────────────
interface ListPanelProps {
  laws: Law[];
  activeLawId: string | null;
  entries: ProjectionEntry[];
  totalSeats: number;
  onActivate: (id: string) => void;
  canEdit: boolean;
}

function LawListPanel({ laws, activeLawId, entries, totalSeats, onActivate, canEdit }: ListPanelProps) {
  const floorLaws = useMemo(() => {
    return [...laws]
      .filter(l => (l.status === 'draft' || l.status === 'failed') && !l.isConstitution)
      .map(l => ({ law: l, net: computeLawNetSupport(l, entries) }))
      .sort((a, b) => b.net - a.net);
  }, [laws, entries]);

  return (
    <div className="panel law-list-panel">
      <span className="corner tl" /><span className="corner tr" />
      <span className="corner bl" /><span className="corner br" />
      <div className="panel-header">
        <h2>Bills Queue</h2>
        <span className="panel-sub">{floorLaws.length} bills</span>
      </div>
      <div className="panel-body">
        {floorLaws.length === 0 && (
          <div className="empty">No draft bills. Create laws in the <strong>LAWS</strong> tab.</div>
        )}
        {floorLaws.map(({ law, net }) => {
          const bd = computeVoteBreakdown(law, entries, totalSeats);
          const isActive = law.id === activeLawId;
          return (
            <div key={law.id} className={`law-list-item${isActive ? ' active' : ''}`}>
              <div className="law-item-top">
                <div className="law-item-names">
                  <span className="law-item-name">{law.name}</span>
                  {law.subtitle && <span className="law-item-sub">{law.subtitle}</span>}
                </div>
                <div className="law-item-net" style={{ color: net > 0 ? 'var(--good)' : net < 0 ? 'var(--danger)' : 'var(--neutral)' }}>
                  {net > 0 ? '+' : ''}{net}
                </div>
              </div>
              <LawSupportBar sup={bd.supportSeats} abs={bd.abstainSeats} ag={bd.againstSeats} total={totalSeats} />
              {canEdit && (
                <button
                  className={`law-floor-btn${isActive ? ' active' : ''}`}
                  onClick={() => onActivate(law.id)}
                >
                  {isActive ? '▶ ON FLOOR' : '⊳ BRING TO FLOOR'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ClauseEditor ──────────────────────────────────────────────────────────────
function ClauseEditor({ clauses, onChange }: { clauses: LawClause[]; onChange: (c: LawClause[]) => void }) {
  const update = (i: number, c: LawClause) => { const n=[...clauses]; n[i]=c; onChange(n); };
  const addClause = () => onChange([...clauses, { id: uid('c'), text: '', level: 0 }]);
  const del = (i: number) => onChange(clauses.filter((_,j)=>j!==i));
  const move = (i: number, dir: number) => {
    const n=[...clauses], t=i+dir;
    if (t<0||t>=n.length) return;
    [n[i],n[t]]=[n[t],n[i]]; onChange(n);
  };
  const indent = (i: number, d: number) => {
    const c={...clauses[i], level: Math.max(0, Math.min(3, clauses[i].level+d))};
    update(i, c);
  };

  return (
    <div className="clause-editor">
      {clauses.map((c, i) => (
        <div key={c.id} className="clause-row" style={{ paddingLeft: `${c.level * 18 + 4}px` }}>
          <button className="clause-btn" onClick={() => indent(i,-1)} title="Outdent" disabled={c.level===0}>←</button>
          <button className="clause-btn" onClick={() => indent(i,+1)} title="Indent"  disabled={c.level===3}>→</button>
          <span className="clause-bullet">{'◦●◈◆'[c.level]}</span>
          <input
            className="clause-input"
            value={c.text}
            onChange={e => update(i, { ...c, text: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); onChange([...clauses.slice(0,i+1), { id:uid('c'), text:'', level:c.level }, ...clauses.slice(i+1)]); }
              if (e.key === 'Tab') { e.preventDefault(); indent(i, e.shiftKey ? -1 : 1); }
              if (e.key === 'Backspace' && c.text === '') { e.preventDefault(); del(i); }
            }}
            placeholder="Clause text…"
          />
          <button className="clause-btn" onClick={() => move(i,-1)} disabled={i===0}>↑</button>
          <button className="clause-btn" onClick={() => move(i,+1)} disabled={i===clauses.length-1}>↓</button>
          <button className="clause-btn clause-del" onClick={() => del(i)}>✕</button>
        </div>
      ))}
      <button className="clause-add-btn" onClick={addClause}>+ Add Clause</button>
    </div>
  );
}

// ── LawEditor ─────────────────────────────────────────────────────────────────
interface EditorProps {
  initial: Partial<Law>;
  onSave: (l: Law) => void;
  onCancel: () => void;
}

function LawEditor({ initial, onSave, onCancel }: EditorProps) {
  const [name, setName] = useState(initial.name ?? '');
  const [subtitle, setSubtitle] = useState(initial.subtitle ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [clauses, setClauses] = useState<LawClause[]>(initial.clauses ?? []);
  const [preview, setPreview] = useState(false);
  const [isConstitution, setIsConstitution] = useState(initial.isConstitution ?? false);

  const save = () => {
    if (!name.trim()) return;
    onSave({
      id: initial.id ?? uid('law'),
      name: name.trim(),
      subtitle: subtitle.trim() || undefined,
      description,
      clauses,
      status: initial.status ?? 'draft',
      isConstitution,
      factionStances: initial.factionStances ?? {},
      createdAt: initial.createdAt ?? Date.now(),
      votedAt: initial.votedAt,
    });
  };

  return (
    <div className="law-editor">
      <div className="law-editor-hd">
        <span className="law-editor-title">{initial.id ? 'EDIT BILL' : 'NEW BILL'}</span>
      </div>
      <div className="law-editor-body">
        <div className="law-field">
          <label className="law-field-label">TITLE</label>
          <input className="law-field-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Bill title…" autoFocus />
        </div>
        <div className="law-field">
          <label className="law-field-label">SUBTITLE <span className="law-field-opt">(optional)</span></label>
          <input className="law-field-input" value={subtitle} onChange={e=>setSubtitle(e.target.value)} placeholder="Short description…" />
        </div>
        <div className="law-field">
          <div className="law-field-label-row">
            <label className="law-field-label">DESCRIPTION <span className="law-field-opt">(markdown)</span></label>
            <button className="law-preview-btn" onClick={()=>setPreview(p=>!p)}>{preview ? '✎ EDIT' : '◉ PREVIEW'}</button>
          </div>
          {preview
            ? <div className="law-md-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(description) }} />
            : <textarea className="law-field-textarea" value={description} onChange={e=>setDescription(e.target.value)} rows={6} placeholder={"Use **bold**, *italic*, # Heading, - list item…"} />
          }
        </div>
        <div className="law-field">
          <label className="law-field-label">CLAUSES</label>
          <ClauseEditor clauses={clauses} onChange={setClauses} />
        </div>
        <div className="law-field law-field--inline">
          <label className="toggle law-constitution-toggle" title="Constitutional laws are displayed separately in the Constitution tab">
            <input type="checkbox" checked={isConstitution} onChange={e => setIsConstitution(e.target.checked)} />
            <span className="switch" />
            <span className="toggle-label">⚖ Constitutional Law</span>
          </label>
        </div>
      </div>
      <div className="law-editor-foot">
        <button className="btn ghost small" onClick={onCancel}>Cancel</button>
        <button className="btn primary small" onClick={save} disabled={!name.trim()}>
          {initial.id ? 'Save Changes' : 'Create Bill'}
        </button>
      </div>
    </div>
  );
}

// ── LawDetailPanel ────────────────────────────────────────────────────────────
interface DetailProps {
  law: Law | null;
  breakdown: VoteBreakdown;
  onConclude: () => void;
  onEdit: () => void;
  canEdit: boolean;
}

function LawDetailPanel({ law, breakdown, onConclude, onEdit, canEdit }: DetailProps) {
  const [clausesExpanded, setClausesExpanded] = useState(false);

  if (!law) {
    return (
      <div className="panel law-detail-panel">
        <span className="corner tl"/><span className="corner tr"/>
        <span className="corner bl"/><span className="corner br"/>
        <div className="law-detail-empty">
          <span className="law-detail-empty-icon">⚖</span>
          <span className="law-detail-empty-lbl">NO BILL ON FLOOR</span>
          <span className="law-detail-empty-sub">Select a bill from the queue to begin debate</span>
        </div>
      </div>
    );
  }

  const { supportSeats, abstainSeats, againstSeats } = breakdown;
  const net = supportSeats - againstSeats;
  const passedVotingVoteThreadhold : boolean = ((supportSeats + againstSeats) / (supportSeats + abstainSeats + againstSeats)) >= 0.51;

  return (
    <div className="panel law-detail-panel">
      <span className="corner tl"/><span className="corner tr"/>
      <span className="corner bl"/><span className="corner br"/>
      <div className="panel-header">
        <div>
          <h2>{law.name}</h2>
          {law.subtitle && <div className="panel-sub">{law.subtitle}</div>}
        </div>
        {canEdit && (
          <button className="ghost small" onClick={onEdit}>✎ Edit</button>
        )}
      </div>
      <div className="panel-body law-detail-body">
        {/* Status badge */}
        <div className="law-status-row">
          <span className={`law-status-badge law-status-${law.status}`}>{law.status.toUpperCase()}</span>
          <span className="law-vote-summary" style={{ color: net > 0 ? 'var(--good)' : net < 0 ? 'var(--danger)' : 'var(--neutral)' }}>
            {net > 0 ? `+${net}` : net < 0 ? `${net}` : '±0'} net seats
          </span>
        </div>

        {/* Description */}
        {law.description && (
          <div className="law-detail-section">
            <div className="law-detail-sec-hd">PREAMBLE</div>
            <div className="law-md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(law.description) }} />
          </div>
        )}

        {/* Clauses */}
        {law.clauses.length > 0 && (
          <div className="law-detail-section">
            <div className="law-detail-sec-hd law-detail-sec-hd--toggle" onClick={() => setClausesExpanded(x=>!x)}>
              CLAUSES <span>{clausesExpanded ? '▲' : '▼'}</span>
            </div>
            {clausesExpanded && (
              <ol className="law-clauses-list">
                {law.clauses.map(c => (
                  <li key={c.id} className="law-clause-item" style={{ marginLeft: `${c.level * 16}px`, listStyleType: c.level === 0 ? 'decimal' : 'lower-alpha' }}>
                    {c.text}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {/* Conclude button */}
        {canEdit && (
          <div className="law-conclude-area">
            <div className="law-conclude-info">
              <span style={{color:'var(--good)'}}>{supportSeats}✓</span>
              {' vs '}
              <span style={{color:'var(--danger)'}}>{againstSeats}✗</span>
              {' · '}
              <span style={{color:'var(--neutral)'}}>{abstainSeats} abstain</span>
            </div>
            <button
              className={`law-conclude-btn ${net > 0 && passedVotingVoteThreadhold ? 'pass' : 'fail'}`}
              onClick={onConclude}
            >
              ⊟ CONCLUDE VOTING — {net > 0 && passedVotingVoteThreadhold ? 'PASS' : net < 0 ? 'FAIL' : 'TIE → FAIL'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── FloorTab ──────────────────────────────────────────────────────────────────
interface FloorTabProps {
  activeLaw: Law | null;
  laws: Law[];
  entries: ProjectionEntry[];
  totalSeats: number;
  canEdit: boolean;
  onActivate: (id: string) => void;
  onConclude: () => void;
  onUpdateStance: (factionId: string, stance: FactionStance) => void;
  onEditLaw: (law: Law) => void;
}

function FloorTab({ activeLaw, laws, entries, totalSeats, canEdit, onActivate, onConclude, onUpdateStance, onEditLaw }: FloorTabProps) {
  const breakdown = useMemo(
    () => computeVoteBreakdown(activeLaw, entries, totalSeats),
    [activeLaw, entries, totalSeats]
  );

  return (
    <div className="law-floor-grid">
      <LawListPanel
        laws={laws} activeLawId={activeLaw?.id ?? null}
        entries={entries} totalSeats={totalSeats}
        onActivate={onActivate} canEdit={canEdit}
      />

      <div className="law-center-col">
        {activeLaw
          ? <>
              <VoteChart breakdown={breakdown} totalSeats={totalSeats} />
              <StancePanel law={activeLaw} entries={entries} onUpdateStance={onUpdateStance} canEdit={canEdit} />
            </>
          : <div className="law-no-floor">
              <span className="law-no-floor-icon">⚖</span>
              <span className="law-no-floor-txt">No bill on the floor</span>
              <span className="law-no-floor-sub">Select a bill from the queue on the left</span>
            </div>
        }
      </div>

      <LawDetailPanel
        law={activeLaw} breakdown={breakdown}
        onConclude={onConclude} onEdit={() => activeLaw && onEditLaw(activeLaw)}
        canEdit={canEdit}
      />
    </div>
  );
}

// ── LawsTab ───────────────────────────────────────────────────────────────────
interface LawsTabProps {
  laws: Law[];
  editingLaw: Law | null;
  isNew: boolean;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (law: Law) => void;
  onSave: (law: Law) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, s: LawStatus) => void;
  onToggleConstitution: (id: string) => void;
}

const FILTER_ORDER: LawsFilter[] = ['all', 'effect', 'draft', 'failed', 'abolished'];

function LawsTab({ laws, editingLaw, isNew, canEdit, onAdd, onEdit, onSave, onCancelEdit, onDelete, onStatusChange, onToggleConstitution }: LawsTabProps) {
  const [filter, setFilter] = useState<LawsFilter>('all');

  if (editingLaw || isNew) {
    return (
      <div className="law-tab-content">
        <LawEditor
          initial={editingLaw ?? {}}
          onSave={onSave}
          onCancel={onCancelEdit}
        />
      </div>
    );
  }

  // Bills tab only shows non-constitution laws
  const billLaws = laws.filter(l => !l.isConstitution);
  const filtered = filter === 'all' ? billLaws : billLaws.filter(l => l.status === filter);
  const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="law-tab-content">
      <div className="law-registry-toolbar">
        <div className="law-filter-group">
          {FILTER_ORDER.map(f => {
            const count = f === 'all' ? billLaws.length : billLaws.filter(l => l.status === f).length;
            return (
              <button key={f} className={`law-filter-btn${filter===f?' active':''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'ALL' : STATUS_LABELS[f as LawStatus]}
                {' '}<span className="badge">{count}</span>
              </button>
            );
          })}
        </div>
        {canEdit && (
          <button className="primary small" onClick={onAdd}>+ New Bill</button>
        )}
      </div>

      <div className="law-registry-list">
        {sorted.length === 0 && <div className="empty">No bills in this category.</div>}
        {sorted.map(law => (
          <LawCard
            key={law.id}
            law={law}
            canEdit={canEdit}
            onEdit={() => onEdit(law)}
            onStatusChange={s => onStatusChange(law.id, s)}
            onToggleConstitution={() => onToggleConstitution(law.id)}
            onDelete={() => onDelete(law.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── HistoryTab ────────────────────────────────────────────────────────────────
function HistoryTab({ history }: { history: LawVoteRecord[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { updateState, showToast } = useAppContext();

  const toggle = (id: string) => setOpen(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const del = (id: string) => {
    updateState(s => { s.lawHistory = s.lawHistory.filter(r => r.id !== id); return s; });
    showToast('Record deleted');
  };

  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="law-tab-content">
      {sorted.length === 0 && <div className="empty" style={{padding:'32px'}}>No voting records yet.</div>}
      {sorted.map(rec => {
        const isOpen = open.has(rec.id);
        const dt = new Date(rec.timestamp).toLocaleString();
        return (
          <div key={rec.id} className={`hist-item law-hist-item${isOpen ? ' open' : ''}`}>
            <div className="hist-item-hd" onClick={() => toggle(rec.id)}>
              <div className="hist-item-left">
                <span className={`law-outcome-badge ${rec.outcome}`}>{rec.outcome === 'passed' ? '✓ PASSED' : '✗ FAILED'}</span>
                <span className="hist-item-title">{rec.lawSnapshot.name}</span>
                {rec.lawSnapshot.subtitle && <span className="hist-item-sub">{rec.lawSnapshot.subtitle}</span>}
              </div>
              <div className="hist-item-right">
                <span className="hist-item-date">{dt}</span>
                <button className="ghost small danger" onClick={e => { e.stopPropagation(); del(rec.id); }}>✕</button>
                <span className="hist-chevron">{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {isOpen && (
              <div className="hist-item-body">
                <div className="hist-vote-chart-wrap">
                  <VoteChart breakdown={recordToBreakdown(rec)} totalSeats={rec.totalSeats} />
                </div>
                <div className="law-hist-factions">
                  {rec.factionResults.map(fr => (
                    <div key={fr.factionId} className="law-hist-faction-row">
                      <span className="chip-dot" style={{ background: fr.color }} />
                      <span className="chip-name">{fr.name}</span>
                      <span className={`hist-stance-badge stance-${fr.stance}`}>{fr.stance}</span>
                      <span className="chip-seats">{fr.seats} seats</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── ConstitutionTab ───────────────────────────────────────────────────────────
interface ConstitutionTabProps {
  laws: Law[];
  canEdit: boolean;
  onEdit: (law: Law) => void;
  onUnmark: (id: string) => void;
  onStatusChange: (id: string, s: LawStatus) => void;
}

function ConstitutionTab({ laws, canEdit, onEdit, onUnmark, onStatusChange }: ConstitutionTabProps) {
  const constLaws = useMemo(
    () => [...laws].filter(l => l.isConstitution).sort((a, b) => a.createdAt - b.createdAt),
    [laws]
  );

  if (constLaws.length === 0) {
    return (
      <div className="law-tab-content constitution-tab">
        <div className="constitution-header">
          <span className="constitution-icon">⚖</span>
          <div>
            <div className="constitution-title">CONSTITUTIONAL LAWS</div>
            <div className="constitution-sub">0 articles</div>
          </div>
        </div>
        <div className="empty constitution-empty">
          <div className="constitution-empty-icon">◈</div>
          <div>No constitutional laws defined.</div>
          <div className="constitution-empty-hint">
            In the <strong>BILLS</strong> tab, press the <strong>⚖</strong> button on any law.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="law-tab-content constitution-tab">
      <div className="constitution-header">
        <span className="constitution-icon">⚖</span>
        <div>
          <div className="constitution-title">CONSTITUTIONAL LAWS</div>
          <div className="constitution-sub">{constLaws.length} article{constLaws.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div className="constitution-list">
        {constLaws.map((law, idx) => (
          <LawCard
            key={law.id}
            law={law}
            articleNum={idx + 1}
            isConstitution
            canEdit={canEdit}
            onEdit={() => onEdit(law)}
            onStatusChange={s => onStatusChange(law.id, s)}
            onToggleConstitution={() => onUnmark(law.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── LawPage ───────────────────────────────────────────────────────────────────
export function LawPage() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit } = useAuth();

  const [lawTab, setLawTab] = useState<LawTab>('floor');
  const [activeLawId, setActiveLawId] = useState<string | null>(null);
  const [editingLaw, setEditingLaw] = useState<Law | null>(null);
  const [isNewLaw, setIsNewLaw] = useState(false);

  const projection = useMemo(() => computeProjection(state), [state]);
  const { entries } = projection;
  const totalSeats = state.totalSeats;

  const activeLaw = useMemo(
    () => state.laws.find(l => l.id === activeLawId) ?? null,
    [state.laws, activeLawId]
  );

  // Keep activeLaw in sync if it's been modified
  const handleActivate = useCallback((id: string) => {
    setActiveLawId(prev => prev === id ? null : id);
  }, []);

  const handleUpdateStance = useCallback((factionId: string, stance: FactionStance) => {
    if (!activeLawId) return;
    updateState(s => {
      const l = s.laws.find(l => l.id === activeLawId);
      if (l) l.factionStances[factionId] = stance;
      return s;
    });
  }, [activeLawId, updateState]);

  const handleConclude = useCallback(() => {
    if (!activeLaw) return;
    const bd = computeVoteBreakdown(activeLaw, entries, totalSeats);
    const outcome = (bd.supportSeats > bd.againstSeats) && ((bd.supportSeats + bd.againstSeats) / (bd.supportSeats + bd.abstainSeats + bd.againstSeats) >= 0.51) ? 'passed' : 'failed';

    const record: LawVoteRecord = {
      id: uid('lvr'),
      timestamp: Date.now(),
      lawSnapshot: clone(activeLaw),
      factionResults: entries
        .filter(e => !e.isUnaligned)
        .map(e => ({
          factionId: e.faction.id, name: e.faction.name, color: e.faction.color,
          seats: e.seats, stance: activeLaw.factionStances[e.faction.id] ?? 'abstain',
        })),
      supportSeats: bd.supportSeats,
      abstainSeats: bd.abstainSeats,
      againstSeats: bd.againstSeats,
      totalSeats,
      outcome,
    };

    updateState(s => {
      const idx = s.laws.findIndex(l => l.id === activeLaw.id);
      if (idx >= 0) {
        s.laws[idx].status = outcome === 'passed' ? 'effect' : 'failed';
        s.laws[idx].votedAt = Date.now();
      }
      s.lawHistory.unshift(record);
      return s;
    });

    setActiveLawId(null);
    setLawTab('history');
    showToast(`Bill ${outcome === 'passed' ? 'passed' : 'failed'}: ${activeLaw.name}`);
  }, [activeLaw, entries, totalSeats, updateState, showToast]);

  const handleSaveLaw = useCallback((law: Law) => {
    updateState(s => {
      const idx = s.laws.findIndex(l => l.id === law.id);
      if (idx >= 0) s.laws[idx] = law;
      else s.laws.push(law);
      return s;
    });
    setEditingLaw(null);
    setIsNewLaw(false);
    showToast(isNewLaw ? 'Bill created' : 'Bill updated');
  }, [updateState, showToast, isNewLaw]);

  const handleDeleteLaw = useCallback((id: string) => {
    if (!window.confirm('Delete this bill permanently?')) return;
    updateState(s => { s.laws = s.laws.filter(l => l.id !== id); return s; });
    if (activeLawId === id) setActiveLawId(null);
    showToast('Bill deleted');
  }, [updateState, activeLawId, showToast]);

  const handleStatusChange = useCallback((id: string, status: LawStatus) => {
    updateState(s => { const l = s.laws.find(l => l.id === id); if (l) l.status = status; return s; });
    showToast(`Status → ${status}`);
  }, [updateState, showToast]);

  const handleToggleConstitution = useCallback((id: string) => {
    updateState(s => {
      const l = s.laws.find(l => l.id === id);
      if (l) l.isConstitution = !l.isConstitution;
      return s;
    });
  }, [updateState]);

  const lawCount = state.laws.filter(l => !l.isConstitution).length;
  const constCount = state.laws.filter(l => l.isConstitution).length;
  const histCount = state.lawHistory.length;

  return (
    <div className="law-page">
      {/* Header */}
      <header className="app-header law-header">
        <span className="crest" />
        <div className="title-block">
          <h1>SENATE</h1>
          <span className="sub">// LEGISLATIVE CHAMBER · v1.0 //</span>
        </div>
        <div className="header-spacer" />
        {activeLaw && (
          <div className="law-active-indicator">
            <span className="law-active-icon">⊟</span>
            <span className="law-active-name">{activeLaw.name}</span>
            <span className="law-active-sub">ON FLOOR</span>
          </div>
        )}
        <div className="law-header-stats">
          <span>{totalSeats} seats</span>
          <span>{state.factions.length} factions</span>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="tab-bar">
        <button data-ro-allow className={`tab${lawTab==='floor'?' active':''}`} onClick={()=>setLawTab('floor')}>
          Senate Floor
        </button>
        <button data-ro-allow className={`tab${lawTab==='laws'?' active':''}`} onClick={()=>setLawTab('laws')}>
          Bills <span className="badge">{lawCount}</span>
        </button>
        <button data-ro-allow className={`tab${lawTab==='constitution'?' active':''}`} onClick={()=>setLawTab('constitution')}>
          ⚖ Constitution <span className="badge">{constCount}</span>
        </button>
        <button data-ro-allow className={`tab${lawTab==='history'?' active':''}`} onClick={()=>setLawTab('history')}>
          Vote History <span className="badge">{histCount}</span>
        </button>
      </nav>

      {/* Content */}
      {lawTab === 'floor' && (
        <FloorTab
          activeLaw={activeLaw}
          laws={state.laws}
          entries={entries}
          totalSeats={totalSeats}
          canEdit={canEdit}
          onActivate={handleActivate}
          onConclude={handleConclude}
          onUpdateStance={handleUpdateStance}
          onEditLaw={law => { setEditingLaw(law); setIsNewLaw(false); setLawTab('laws'); }}
        />
      )}

      {lawTab === 'laws' && (
        <LawsTab
          laws={state.laws}
          editingLaw={editingLaw}
          isNew={isNewLaw}
          canEdit={canEdit}
          onAdd={() => { setEditingLaw(null); setIsNewLaw(true); }}
          onEdit={law => { setEditingLaw(law); setIsNewLaw(false); }}
          onSave={handleSaveLaw}
          onCancelEdit={() => { setEditingLaw(null); setIsNewLaw(false); }}
          onDelete={handleDeleteLaw}
          onStatusChange={handleStatusChange}
          onToggleConstitution={handleToggleConstitution}
        />
      )}

      {lawTab === 'constitution' && (
        <ConstitutionTab
          laws={state.laws}
          canEdit={canEdit}
          onEdit={law => { setEditingLaw(law); setIsNewLaw(false); setLawTab('laws'); }}
          onUnmark={handleToggleConstitution}
          onStatusChange={handleStatusChange}
        />
      )}

      {lawTab === 'history' && (
        <HistoryTab history={state.lawHistory} />
      )}
    </div>
  );
}
