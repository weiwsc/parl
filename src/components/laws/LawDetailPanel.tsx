import { useState } from 'react';
import { evaluateLawVote, type VoteBreakdown } from '../../game/laws/voting';
import { lawStatusLabel, useLang, voteConclusionLabel } from '../../utils/localization';
import type { Law, LawStatus } from '../../models/types';
import { Panel, PanelCorners } from '../ui/Panel';
import { renderMarkdown } from './markdown';

const ALL_STATUSES: LawStatus[] = ['draft', 'voting', 'effect', 'abolished', 'failed'];

interface LawDetailPanelProps {
  law: Law | null;
  breakdown: VoteBreakdown;
  onConclude: (status: LawStatus) => void;
  onEdit: () => void;
  canEdit: boolean;
}

export function LawDetailPanel({ law, breakdown, onConclude, onEdit, canEdit }: LawDetailPanelProps) {
  const t = useLang();
  const [clausesExpanded, setClausesExpanded] = useState(false);
  const [concludeOpen, setConcludeOpen] = useState(false);
  const [pickedStatus, setPickedStatus] = useState<LawStatus | null>(null);

  if (!law) {
    return (
      <div className="panel law-detail-panel">
        <PanelCorners />
        <div className="law-detail-empty">
          <span className="law-detail-empty-icon">⚖</span>
          <span className="law-detail-empty-lbl">{t('no_bill_on_floor')}</span>
          <span className="law-detail-empty-sub">{t('select_bill_debate')}</span>
        </div>
      </div>
    );
  }

  const { supportSeats, abstainSeats, againstSeats } = breakdown;
  const evaluation = evaluateLawVote(breakdown);
  const net = evaluation.netSeats;
  const defaultStatus: LawStatus = evaluation.outcome === 'passed' ? 'effect' : 'failed';
  const selectedStatus = pickedStatus ?? defaultStatus;

  const handleApply = () => {
    onConclude(selectedStatus);
    setConcludeOpen(false);
    setPickedStatus(null);
  };

  const openDropdown = () => {
    setPickedStatus(defaultStatus);
    setConcludeOpen(true);
  };

  return (
    <Panel
      className="law-detail-panel"
      bodyClassName="law-detail-body"
      title={law.name}
      subtitle={law.subtitle}
      actions={canEdit && <button className="ghost small" onClick={onEdit}>✎ {t('edit')}</button>}
    >
      <div className="law-status-row">
        <span className={`law-status-badge law-status-${law.status}`}>{lawStatusLabel(t, law.status).toUpperCase()}</span>
        <span className="law-vote-summary" style={{ color: net > 0 ? 'var(--good)' : net < 0 ? 'var(--danger)' : 'var(--neutral)' }}>
          {net > 0 ? `+${net}` : net < 0 ? `${net}` : '±0'} {t('net_seats')}
        </span>
      </div>

      {law.description && (
        <div className="law-detail-section">
          <div className="law-detail-sec-hd">{t('preamble')}</div>
          <div className="law-md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(law.description, t('no_description')) }} />
        </div>
      )}

      {law.clauses.length > 0 && (
        <div className="law-detail-section">
          <div className="law-detail-sec-hd law-detail-sec-hd--toggle" onClick={() => setClausesExpanded(v => !v)}>
            {t('clauses')} <span>{clausesExpanded ? '▲' : '▼'}</span>
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
            <span style={{ color: 'var(--good)' }}>{supportSeats}✓</span>
            {` ${t('vs')} `}
            <span style={{ color: 'var(--danger)' }}>{againstSeats}✗</span>
            {' · '}
            <span style={{ color: 'var(--neutral)' }}>{abstainSeats} {t('abstain').toLowerCase()}</span>
          </div>

          {!concludeOpen ? (
            <button
              className={`law-conclude-btn ${evaluation.outcome === 'passed' ? 'pass' : 'fail'}`}
              onClick={openDropdown}
            >
              ⊟ {t('conclude_voting').toUpperCase()} — {voteConclusionLabel(t, evaluation.conclusionLabel).toUpperCase()}
            </button>
          ) : (
            <div className="law-conclude-dropdown">
              <div className="law-conclude-dropdown-label">{t('set_final_status')}</div>
              <div className="law-conclude-status-grid">
                {ALL_STATUSES.map(s => (
                  <button
                    key={s}
                    className={`law-status-pick-btn law-status-${s}${selectedStatus === s ? ' selected' : ''}`}
                    onClick={() => setPickedStatus(s)}
                  >
                    {lawStatusLabel(t, s).toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="law-conclude-row">
                <button className="ghost small" onClick={() => { setConcludeOpen(false); setPickedStatus(null); }}>
                  {t('cancel')}
                </button>
                <button className="primary small" onClick={handleApply}>
                  {t('apply')} →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
