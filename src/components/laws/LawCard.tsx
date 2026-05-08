import { useState, type KeyboardEvent } from 'react';
import { lawStatusLabel, useLang } from '../../utils/localization';
import type { Law, LawStatus } from '../../models/types';
import { renderMarkdown } from './markdown';

const ROMAN = ['', 'I','II','III','IV','V','VI','VII','VIII','IX','X',
  'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];

const LAW_STATUS_OPTIONS: LawStatus[] = ['draft', 'voting', 'effect', 'failed', 'abolished'];

interface LawCardProps {
  law: Law;
  articleNum?: number;
  isConstitution?: boolean;
  preview?: boolean;
  canEdit?: boolean;
  onOpen?: () => void;
  onEdit?: () => void;
  onToggleConstitution?: () => void;
  onStatusChange?: (status: LawStatus) => void;
  onDelete?: () => void;
}

export function LawCard({ law, articleNum, isConstitution, preview = false, canEdit, onOpen, onEdit, onToggleConstitution, onStatusChange, onDelete }: LawCardProps) {
  const t = useLang();
  const [collapsed, setCollapsed] = useState(false);
  const isOpen = preview || !collapsed;

  const openCard = () => {
    if (preview) {
      onOpen?.();
      return;
    }
    setCollapsed(current => !current);
  };

  const handlePreviewKeyDown = (keyboardEvent: KeyboardEvent<HTMLElement>) => {
    if (!preview || keyboardEvent.currentTarget !== keyboardEvent.target) return;
    if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return;
    keyboardEvent.preventDefault();
    onOpen?.();
  };

  return (
    <article
      className={`law-card law-card--${law.status}${isConstitution ? ' law-card--const' : ''}${collapsed ? ' law-card--collapsed' : ''}${preview ? ' law-card--preview' : ''}`}
      role={preview ? 'button' : undefined}
      tabIndex={preview ? 0 : undefined}
      onClick={preview ? openCard : undefined}
      onKeyDown={handlePreviewKeyDown}
      aria-label={preview ? `${t('open_law')}: ${law.name}` : undefined}
    >
      <span className="lc-corner lc-tl" /><span className="lc-corner lc-tr" />
      <span className="lc-corner lc-bl" /><span className="lc-corner lc-br" />
      <div className="law-card-hd" onClick={preview ? undefined : openCard}>
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
                  {LAW_STATUS_OPTIONS.map(status => (
                    <option key={status} value={status}>{statusGlyph(status)} {lawStatusLabel(t, status).toUpperCase()}</option>
                  ))}
                </select>
              )}
              {onEdit && <button className="ghost small" onClick={onEdit} title={t('edit')}>✎</button>}
              {onToggleConstitution && (
                <button className="ghost small" onClick={onToggleConstitution}
                  title={isConstitution ? t('remove_from_constitution') : t('move_to_constitution')}>
                  {isConstitution ? '⊖' : '⚖'}
                </button>
              )}
              {onDelete && <button className="ghost small danger" onClick={onDelete}>✕</button>}
            </div>
          )}
          <span className="law-card-chevron">{preview ? 'OPEN' : collapsed ? '▼' : '▲'}</span>
        </div>
      </div>

      {isOpen && <LawDocumentBody law={law} isConstitution={isConstitution} preview={preview} />}
    </article>
  );
}

interface LawReaderDialogProps {
  law: Law;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}

export function LawReaderDialog({ law, canEdit, onClose, onEdit }: LawReaderDialogProps) {
  const t = useLang();

  return (
    <div className="law-reader-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="law-reader-frame"
        role="dialog"
        aria-modal="true"
        aria-labelledby="law-reader-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <article className={`law-reader-paper law-reader-paper--${law.status}${law.isConstitution ? ' law-reader-paper--const' : ''}`}>
          <span className="lc-corner lc-tl" /><span className="lc-corner lc-tr" />
          <span className="lc-corner lc-bl" /><span className="lc-corner lc-br" />
          <div className="law-reader-actions">
            {canEdit && <button className="law-reader-edit" onClick={onEdit}>{t('edit')}</button>}
            <button className="law-reader-close" data-ro-allow onClick={onClose}>{t('close')}</button>
          </div>

          <header className="law-reader-header">
            <div className="law-reader-kicker">
              <span className={`law-status-badge law-status-${law.status}`}>{lawStatusLabel(t, law.status).toUpperCase()}</span>
              {law.isConstitution && <span className="law-reader-const">{t('constitutional_law')}</span>}
            </div>
            <h2 id="law-reader-title">{law.name}</h2>
            {law.subtitle && <p>{law.subtitle}</p>}
          </header>

          <section className="law-reader-content">
            <LawDocumentBody law={law} isConstitution={!!law.isConstitution} />
          </section>
        </article>
      </div>
    </div>
  );
}

function LawDocumentBody({ law, isConstitution = false, preview = false }: { law: Law; isConstitution?: boolean; preview?: boolean }) {
  const t = useLang();

  return (
    <div className={`law-card-body${preview ? ' law-card-body--preview' : ''}`}>
      {isConstitution && (
        <div className="law-const-ornament-row">
          <span className="ornament-line" />
          <span className="ornament-glyph">◆</span>
          <span className="ornament-line" />
        </div>
      )}

      {law.description && (
        <div className="law-card-section">
          {isConstitution && <div className="law-const-sec-hd">◈ {t('preamble').toUpperCase()}</div>}
          <div className="law-md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(law.description, t('no_description')) }} />
        </div>
      )}

      {law.clauses.length > 0 && (
        <div className="law-card-section">
          {isConstitution && <div className="law-const-sec-hd">◦ {t('clauses').toUpperCase()}</div>}
          <LawClauseList clauses={law.clauses} isConstitution={isConstitution} />
        </div>
      )}
    </div>
  );
}

function LawClauseList({ clauses, isConstitution }: { clauses: Law['clauses']; isConstitution: boolean }) {
  let topLevelIndex = 0;

  return (
    <div className="law-clauses-list">
      {clauses.map(clause => {
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
  );
}

function statusGlyph(status: LawStatus): string {
  switch (status) {
    case 'draft': return '◫';
    case 'voting': return '⊡';
    case 'effect': return '◈';
    case 'failed': return '✗';
    case 'abolished': return '—';
  }
}
