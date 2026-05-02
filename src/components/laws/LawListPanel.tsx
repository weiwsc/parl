import { useMemo } from 'react';
import { computeVoteBreakdown, getFloorLawEntries } from '../../game/laws/voting';
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

export function LawListPanel({ laws, activeLawId, entries, totalSeats, onActivate, canEdit }: LawListPanelProps) {
  const floorLaws = useMemo(() => getFloorLawEntries(laws, entries), [laws, entries]);

  return (
    <Panel className="law-list-panel" title="Bills Queue" subtitle={`${floorLaws.length} bills`}>
      {floorLaws.length === 0 && (
        <EmptyState>No draft bills. Create laws in the <strong>LAWS</strong> tab.</EmptyState>
      )}
      {floorLaws.map(({ law, net }) => {
        const breakdown = computeVoteBreakdown(law, entries, totalSeats);
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
            <LawSupportBar sup={breakdown.supportSeats} abs={breakdown.abstainSeats} ag={breakdown.againstSeats} total={totalSeats} />
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
    </Panel>
  );
}
