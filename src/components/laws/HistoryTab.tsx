import { useState } from 'react';
import { recordToBreakdown } from '../../game/laws/voting';
import { useAppContext } from '../../store';
import { stanceLabel, useLang } from '../../utils/localization';
import type { LawVoteRecord } from '../../models/types';
import { EmptyState } from '../ui/EmptyState';
import { VoteChart } from './VoteChart';

export function HistoryTab({ history }: { history: LawVoteRecord[] }) {
  const t = useLang();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { updateState, showToast } = useAppContext();

  const toggle = (id: string) => setOpen(previous => {
    const next = new Set(previous);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const del = (id: string) => {
    updateState(state => {
      state.lawHistory = state.lawHistory.filter(record => record.id !== id);
      return state;
    });
    showToast(t('record_deleted'));
  };

  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="law-tab-content">
      {sorted.length === 0 && <EmptyState className="law-history-empty">{t('no_voting_records')}</EmptyState>}
      {sorted.map(record => {
        const isOpen = open.has(record.id);
        const dt = new Date(record.timestamp).toLocaleString();
        return (
          <div key={record.id} className={`hist-item law-hist-item${isOpen ? ' open' : ''}`}>
            <div className="hist-item-hd" onClick={() => toggle(record.id)}>
              <div className="hist-item-left">
                <span className={`law-outcome-badge ${record.outcome}`}>
                  {record.outcome === 'passed' ? `✓ ${t('passed').toUpperCase()}` : `✗ ${t('failed').toUpperCase()}`}
                </span>
                <span className={`law-chamber-badge law-chamber-${record.chamber ?? 'parliament'}`}>
                  {record.chamber === 'senate' ? 'SEN' : 'PARL'}
                </span>
                <span className="hist-item-title">{record.lawSnapshot.name}</span>
                {record.lawSnapshot.subtitle && <span className="hist-item-sub">{record.lawSnapshot.subtitle}</span>}
              </div>
              <div className="hist-item-right">
                <span className="hist-item-date">{dt}</span>
                <button className="ghost small danger" onClick={event => { event.stopPropagation(); del(record.id); }}>✕</button>
                <span className="hist-chevron">{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {isOpen && (
              <div className="hist-item-body">
                <div className="hist-vote-chart-wrap">
                  <VoteChart breakdown={recordToBreakdown(record)} totalSeats={record.totalSeats} />
                </div>
                <div className="law-hist-factions">
                  {record.factionResults.map(factionResult => (
                    <div key={factionResult.factionId} className="law-hist-faction-row">
                      <span className="chip-dot" style={{ background: factionResult.color }} />
                      <span className="chip-name">{factionResult.name}</span>
                      <span className={`hist-stance-badge stance-${factionResult.stance}`}>{stanceLabel(t, factionResult.stance)}</span>
                      <span className="chip-seats">{factionResult.seats} {t('seats').toLowerCase()}</span>
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
