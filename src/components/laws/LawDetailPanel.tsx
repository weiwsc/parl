import { useState } from 'react';
import { evaluateLawVote, type VoteBreakdown } from '../../game/laws/voting';
import type { Law } from '../../models/types';
import { Panel, PanelCorners } from '../ui/Panel';
import { renderMarkdown } from './markdown';

interface LawDetailPanelProps {
  law: Law | null;
  breakdown: VoteBreakdown;
  onConclude: () => void;
  onEdit: () => void;
  canEdit: boolean;
}

export function LawDetailPanel({ law, breakdown, onConclude, onEdit, canEdit }: LawDetailPanelProps) {
  const [clausesExpanded, setClausesExpanded] = useState(false);

  if (!law) {
    return (
      <div className="panel law-detail-panel">
        <PanelCorners />
        <div className="law-detail-empty">
          <span className="law-detail-empty-icon">⚖</span>
          <span className="law-detail-empty-lbl">NO BILL ON FLOOR</span>
          <span className="law-detail-empty-sub">Select a bill from the queue to begin debate</span>
        </div>
      </div>
    );
  }

  const { supportSeats, abstainSeats, againstSeats } = breakdown;
  const evaluation = evaluateLawVote(breakdown);
  const net = evaluation.netSeats;

  return (
    <Panel
      className="law-detail-panel"
      bodyClassName="law-detail-body"
      title={law.name}
      subtitle={law.subtitle}
      actions={canEdit && <button className="ghost small" onClick={onEdit}>✎ Edit</button>}
    >
      <div className="law-status-row">
        <span className={`law-status-badge law-status-${law.status}`}>{law.status.toUpperCase()}</span>
        <span className="law-vote-summary" style={{ color: net > 0 ? 'var(--good)' : net < 0 ? 'var(--danger)' : 'var(--neutral)' }}>
          {net > 0 ? `+${net}` : net < 0 ? `${net}` : '±0'} net seats
        </span>
      </div>

      {law.description && (
        <div className="law-detail-section">
          <div className="law-detail-sec-hd">PREAMBLE</div>
          <div className="law-md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(law.description) }} />
        </div>
      )}

      {law.clauses.length > 0 && (
        <div className="law-detail-section">
          <div className="law-detail-sec-hd law-detail-sec-hd--toggle" onClick={() => setClausesExpanded(current => !current)}>
            CLAUSES <span>{clausesExpanded ? '▲' : '▼'}</span>
          </div>
          {clausesExpanded && (
            <ol className="law-clauses-list">
              {law.clauses.map(clause => (
                <li key={clause.id} className="law-clause-item" style={{ marginLeft: `${clause.level * 16}px`, listStyleType: clause.level === 0 ? 'decimal' : 'lower-alpha' }}>
                  {clause.text}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

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
            className={`law-conclude-btn ${evaluation.outcome === 'passed' ? 'pass' : 'fail'}`}
            onClick={onConclude}
          >
            ⊟ CONCLUDE VOTING — {evaluation.conclusionLabel}
          </button>
        </div>
      )}
    </Panel>
  );
}
