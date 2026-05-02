import { useState } from 'react';
import type { Law, LawStatus } from '../../models/types';
import { renderMarkdown } from './markdown';

const ROMAN = ['', 'I','II','III','IV','V','VI','VII','VIII','IX','X',
  'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];

export const STATUS_LABELS: Record<LawStatus, string> = {
  draft: 'Draft', voting: 'Voting', effect: 'In Effect', abolished: 'Abolished', failed: 'Failed'
};

interface LawCardProps {
  law: Law;
  articleNum?: number;
  isConstitution?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
  onToggleConstitution?: () => void;
  onStatusChange?: (status: LawStatus) => void;
  onDelete?: () => void;
}

export function LawCard({ law, articleNum, isConstitution, canEdit, onEdit, onToggleConstitution, onStatusChange, onDelete }: LawCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  let topLevelIndex = 0;

  return (
    <div className={`law-card law-card--${law.status}${isConstitution ? ' law-card--const' : ''}${collapsed ? ' law-card--collapsed' : ''}`}>
      <span className="lc-corner lc-tl" /><span className="lc-corner lc-tr" />
      <span className="lc-corner lc-bl" /><span className="lc-corner lc-br" />
      <div className="law-card-hd" onClick={() => setCollapsed(current => !current)}>
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
            <div className="law-card-actions" onClick={event => event.stopPropagation()}>
              {onStatusChange && (
                <select className="law-status-select" value={law.status}
                  onChange={event => onStatusChange(event.target.value as LawStatus)}>
                  <option value="draft">◫ DRAFT</option>
                  <option value="voting">⊡ VOTING</option>
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
                {law.clauses.map(clause => {
                  if (clause.level === 0) topLevelIndex++;
                  const marker = clause.level === 0
                    ? (isConstitution ? `${ROMAN[topLevelIndex] ?? topLevelIndex}.` : `${String(topLevelIndex).padStart(2,'0')}.`)
                    : (['◦','·','—'][clause.level - 1] ?? '—');
                  return (
                    <div key={clause.id} className={`law-clause-item law-clause-level-${clause.level}`}
                      style={{ paddingLeft: `${clause.level * 24}px` }}>
                      <span className="law-clause-marker">{marker}</span>
                      <span className="law-clause-text">{clause.text}</span>
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
