import { useMemo } from 'react';
import { computeVoteBreakdown } from '../../game/laws/voting';
import type { FactionStance, Law, ProjectionEntry } from '../../models/types';
import { LawDetailPanel } from './LawDetailPanel';
import { LawListPanel } from './LawListPanel';
import { StancePanel } from './StancePanel';
import { VoteChart } from './VoteChart';

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

export function FloorTab({ activeLaw, laws, entries, totalSeats, canEdit, onActivate, onConclude, onUpdateStance, onEditLaw }: FloorTabProps) {
  const breakdown = useMemo(
    () => computeVoteBreakdown(activeLaw, entries, totalSeats),
    [activeLaw, entries, totalSeats]
  );

  return (
    <div className="law-floor-grid">
      <LawListPanel
        laws={laws}
        activeLawId={activeLaw?.id ?? null}
        entries={entries}
        totalSeats={totalSeats}
        onActivate={onActivate}
        canEdit={canEdit}
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
        law={activeLaw}
        breakdown={breakdown}
        onConclude={onConclude}
        onEdit={() => activeLaw && onEditLaw(activeLaw)}
        canEdit={canEdit}
      />
    </div>
  );
}
