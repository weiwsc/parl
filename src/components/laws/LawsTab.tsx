import { useState } from 'react';
import type { Law, LawStatus } from '../../models/types';
import { EmptyState } from '../ui/EmptyState';
import { GridSurface } from '../ui/ListSurface';
import { LawCard, STATUS_LABELS } from './LawCard';
import { LawEditor } from './LawEditor';

export type LawsFilter = LawStatus | 'all';

interface LawsTabProps {
  laws: Law[];
  editingLaw: Law | null;
  isNew: boolean;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (law: Law) => void;
  onSave: (law: Law) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: LawStatus) => void;
  onToggleConstitution: (id: string) => void;
}

const FILTER_ORDER: LawsFilter[] = ['all', 'effect', 'draft', 'failed', 'abolished'];

export function LawsTab({ laws, editingLaw, isNew, canEdit, onAdd, onEdit, onSave, onCancelEdit, onDelete, onStatusChange, onToggleConstitution }: LawsTabProps) {
  const [filter, setFilter] = useState<LawsFilter>('all');

  if (editingLaw || isNew) {
    return (
      <div className="law-tab-content">
        <LawEditor
          initial={editingLaw ?? {}}
          onSave={onSave}
          onCancel={onCancelEdit}
        />
      </div>
    );
  }

  const billLaws = laws.filter(law => !law.isConstitution);
  const filtered = filter === 'all' ? billLaws : billLaws.filter(law => law.status === filter);
  const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="law-tab-content">
      <div className="law-registry-toolbar">
        <div className="law-filter-group">
          {FILTER_ORDER.map(item => {
            const count = item === 'all' ? billLaws.length : billLaws.filter(law => law.status === item).length;
            return (
              <button key={item} className={`law-filter-btn${filter === item ? ' active' : ''}`} onClick={() => setFilter(item)}>
                {item === 'all' ? 'ALL' : STATUS_LABELS[item]}
                {' '}<span className="badge">{count}</span>
              </button>
            );
          })}
        </div>
        {canEdit && <button className="primary small" onClick={onAdd}>+ New Bill</button>}
      </div>

      <GridSurface className="law-registry-list">
        {sorted.length === 0 && <EmptyState>No bills in this category.</EmptyState>}
        {sorted.map(law => (
          <LawCard
            key={law.id}
            law={law}
            canEdit={canEdit}
            onEdit={() => onEdit(law)}
            onStatusChange={status => onStatusChange(law.id, status)}
            onToggleConstitution={() => onToggleConstitution(law.id)}
            onDelete={() => onDelete(law.id)}
          />
        ))}
      </GridSurface>
    </div>
  );
}
