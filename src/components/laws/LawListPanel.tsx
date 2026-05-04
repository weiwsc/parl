import { useMemo } from 'react';
import { computeVoteBreakdown, getFloorLawEntries } from '../../game/laws/voting';
import { useLang } from '../../utils/localization';
import type { Law, ProjectionEntry } from '../../models/types';
import { EmptyState } from '../ui/EmptyState';
import { Panel } from '../ui/Panel';
import { LawSupportBar } from './LawSupportBar';

interface LawListPanelProps {
  laws: Law[];
  activeLawId: string | null;
  entries: ProjectionEntry[];
  totalSeats: number;
  onActivate: (id: string) => void;
  canEdit: boolean;
}

export function LawListPanel({ laws, activeLawId, entries, totalSeats, onActivate }: LawListPanelProps) {
  const t = useLang();
  const floorLaws = useMemo(() => getFloorLawEntries(laws, entries), [laws, entries]);

  return (
    <Panel className="law-list-panel" title={t('bill_queue')} subtitle={`${floorLaws.length} ${t('bill_count')}`}>
      {floorLaws.length === 0 && (
        <EmptyState>
          {t('no_draft_bills')} {t('create_laws_hint')}
        </EmptyState>
      )}
      {floorLaws.map(({ law, net }) => {
        const breakdown = computeVoteBreakdown(law, entries, totalSeats);
        const isActive  = law.id === activeLawId;

        return (
          <div
            key={law.id}
            className={`law-list-item${isActive ? ' active' : ''}`}
            onClick={() => onActivate(law.id)}
          >
            <div className="law-item-top">
              <div className="law-item-names">
                <span className="law-item-name">{law.name}</span>
                {law.subtitle && <span className="law-item-sub">{law.subtitle}</span>}
              </div>
              <div className="law-item-net" style={{ color: net > 0 ? 'var(--good)' : net < 0 ? 'var(--danger)' : 'var(--neutral)' }}>
                {net > 0 ? '+' : ''}{net}
              </div>
            </div>
            <LawSupportBar sup={breakdown.supportSeats} abs={breakdown.abstainSeats} ag={breakdown.againstSeats} total={totalSeats} />
            <div className={`law-floor-btn${isActive ? ' active' : ''}`}>
              {isActive ? `▶ ${t('on_floor')}` : `⊳ ${t('bring_to_floor')}`}
            </div>
          </div>
        );
      })}
    </Panel>
  );
}
