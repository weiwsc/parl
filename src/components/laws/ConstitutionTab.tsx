import { useMemo } from 'react';
import type { Law, LawStatus } from '../../models/types';
import { EmptyState } from '../ui/EmptyState';
import { GridSurface } from '../ui/ListSurface';
import { LawCard } from './LawCard';

interface ConstitutionTabProps {
  laws: Law[];
  canEdit: boolean;
  onEdit: (law: Law) => void;
  onUnmark: (id: string) => void;
  onStatusChange: (id: string, status: LawStatus) => void;
}

export function ConstitutionTab({ laws, canEdit, onEdit, onUnmark, onStatusChange }: ConstitutionTabProps) {
  const constitutionalLaws = useMemo(
    () => [...laws].filter(law => law.isConstitution).sort((a, b) => a.createdAt - b.createdAt),
    [laws]
  );

  if (constitutionalLaws.length === 0) {
    return (
      <div className="law-tab-content constitution-tab">
        <ConstitutionHeader count={0} />
        <EmptyState className="constitution-empty">
          <div className="constitution-empty-icon">◈</div>
          <div>No constitutional laws defined.</div>
          <div className="constitution-empty-hint">
            In the <strong>BILLS</strong> tab, press the <strong>⚖</strong> button on any law.
          </div>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="law-tab-content constitution-tab">
      <ConstitutionHeader count={constitutionalLaws.length} />
      <GridSurface className="constitution-list">
        {constitutionalLaws.map((law, index) => (
          <LawCard
            key={law.id}
            law={law}
            articleNum={index + 1}
            isConstitution
            canEdit={canEdit}
            onEdit={() => onEdit(law)}
            onStatusChange={status => onStatusChange(law.id, status)}
            onToggleConstitution={() => onUnmark(law.id)}
          />
        ))}
      </GridSurface>
    </div>
  );
}

function ConstitutionHeader({ count }: { count: number }) {
  return (
    <div className="constitution-header">
      <span className="constitution-icon">⚖</span>
      <div>
        <div className="constitution-title">CONSTITUTIONAL LAWS</div>
        <div className="constitution-sub">{count} article{count !== 1 ? 's' : ''}</div>
      </div>
    </div>
  );
}
