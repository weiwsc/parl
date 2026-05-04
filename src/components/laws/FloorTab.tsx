import { useMemo } from 'react';
import { computeVoteBreakdown } from '../../game/laws/voting';
import type { FactionStance, Law, LawStatus, ProjectionEntry } from '../../models/types';
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
  editableFactionId?: string | null;
  chamber: 'parliament' | 'senate';
  onActivate: (id: string) => void;
  onConclude: (status: LawStatus) => void;
  onUpdateStance: (factionId: string, stance: FactionStance) => void;
  onEditLaw: (law: Law) => void;
}

export function FloorTab({ activeLaw, laws, entries, totalSeats, canEdit, editableFactionId, chamber, onActivate, onConclude, onUpdateStance, onEditLaw }: FloorTabProps) {
  // Create a view of the law with the correct chamber's stances
  const effectiveLaw = useMemo(() => {
    if (!activeLaw) return null;
    const stances = chamber === 'senate'
      ? (activeLaw.senateFactionStances ?? {})
      : activeLaw.factionStances;
    return { ...activeLaw, factionStances: stances };
  }, [activeLaw, chamber]);

  const breakdown = useMemo(
    () => computeVoteBreakdown(effectiveLaw, entries, totalSeats),
    [effectiveLaw, entries, totalSeats]
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
        {effectiveLaw
          ? <>
              <VoteChart breakdown={breakdown} totalSeats={totalSeats} />
              <StancePanel
                law={effectiveLaw}
                entries={entries}
                onUpdateStance={onUpdateStance}
                canEdit={canEdit}
                editableFactionId={editableFactionId}
              />
            </>
          : <div className="law-no-floor">
              <span className="law-no-floor-icon">⚖</span>
              <span className="law-no-floor-txt">No bill on the floor</span>
              <span className="law-no-floor-sub">Select a bill from the queue on the left</span>
            </div>
        }
      </div>

      <LawDetailPanel
        law={effectiveLaw}
        breakdown={breakdown}
        onConclude={onConclude}
        onEdit={() => activeLaw && onEditLaw(activeLaw)}
        canEdit={canEdit}
      />
    </div>
  );
}
