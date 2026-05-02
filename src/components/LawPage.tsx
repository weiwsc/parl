import { useCallback, useMemo, useState } from 'react';
import { LawVotingSession } from '../game/laws/voting';
import { computeProjection } from '../utils/compute';
import { useAuth } from '../context/AuthContext';
import { useAppContext, uid } from '../store';
import type { FactionStance, Law, LawStatus } from '../models/types';
import { AppHeader } from './ui/AppHeader';
import { TabBar, type TabItem } from './ui/TabBar';
import { ConstitutionTab } from './laws/ConstitutionTab';
import { FloorTab } from './laws/FloorTab';
import { HistoryTab } from './laws/HistoryTab';
import { LawsTab } from './laws/LawsTab';

type LawTab = 'floor' | 'laws' | 'constitution' | 'history';

export function LawPage() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit } = useAuth();

  const [lawTab, setLawTab] = useState<LawTab>('floor');
  const [activeLawId, setActiveLawId] = useState<string | null>(null);
  const [editingLaw, setEditingLaw] = useState<Law | null>(null);
  const [isNewLaw, setIsNewLaw] = useState(false);

  const projection = useMemo(() => computeProjection(state), [state]);
  const { entries } = projection;
  const totalSeats = state.totalSeats;

  const activeLaw = useMemo(
    () => state.laws.find(law => law.id === activeLawId) ?? null,
    [state.laws, activeLawId]
  );

  const handleActivate = useCallback((id: string) => {
    setActiveLawId(previous => previous === id ? null : id);
  }, []);

  const handleUpdateStance = useCallback((factionId: string, stance: FactionStance) => {
    if (!activeLawId) return;
    updateState(state => {
      const law = state.laws.find(item => item.id === activeLawId);
      if (law) law.factionStances[factionId] = stance;
      return state;
    });
  }, [activeLawId, updateState]);

  const handleConclude = useCallback(() => {
    if (!activeLaw) return;

    const session = new LawVotingSession(activeLaw, entries, totalSeats);
    const { outcome } = session.evaluate();
    const record = session.createRecord({ id: uid('lvr') });

    updateState(state => {
      const index = state.laws.findIndex(law => law.id === activeLaw.id);
      if (index >= 0) {
        state.laws[index].status = outcome === 'passed' ? 'effect' : 'failed';
        state.laws[index].votedAt = Date.now();
      }
      state.lawHistory.unshift(record);
      return state;
    });

    setActiveLawId(null);
    setLawTab('history');
    showToast(`Bill ${outcome === 'passed' ? 'passed' : 'failed'}: ${activeLaw.name}`);
  }, [activeLaw, entries, totalSeats, updateState, showToast]);

  const handleSaveLaw = useCallback((law: Law) => {
    updateState(state => {
      const index = state.laws.findIndex(item => item.id === law.id);
      if (index >= 0) state.laws[index] = law;
      else state.laws.push(law);
      return state;
    });
    setEditingLaw(null);
    setIsNewLaw(false);
    showToast(isNewLaw ? 'Bill created' : 'Bill updated');
  }, [updateState, showToast, isNewLaw]);

  const handleDeleteLaw = useCallback((id: string) => {
    if (!window.confirm('Delete this bill permanently?')) return;
    updateState(state => {
      state.laws = state.laws.filter(law => law.id !== id);
      return state;
    });
    if (activeLawId === id) setActiveLawId(null);
    showToast('Bill deleted');
  }, [updateState, activeLawId, showToast]);

  const handleStatusChange = useCallback((id: string, status: LawStatus) => {
    updateState(state => {
      const law = state.laws.find(item => item.id === id);
      if (law) law.status = status;
      return state;
    });
    showToast(`Status → ${status}`);
  }, [updateState, showToast]);

  const handleToggleConstitution = useCallback((id: string) => {
    updateState(state => {
      const law = state.laws.find(item => item.id === id);
      if (law) law.isConstitution = !law.isConstitution;
      return state;
    });
  }, [updateState]);

  const lawCount = state.laws.filter(law => !law.isConstitution).length;
  const constCount = state.laws.filter(law => law.isConstitution).length;
  const histCount = state.lawHistory.length;
  const lawTabs: TabItem<LawTab>[] = [
    { id: 'floor', label: 'Senate Floor' },
    { id: 'laws', label: 'Bills', badge: lawCount },
    { id: 'constitution', label: '⚖ Constitution', badge: constCount },
    { id: 'history', label: 'Vote History', badge: histCount },
  ];

  return (
    <div className="law-page">
      <AppHeader title="SENATE" subtitle="// LEGISLATIVE CHAMBER · v1.0 //" className="law-header">
        {activeLaw && (
          <div className="law-active-indicator">
            <span className="law-active-icon">⊟</span>
            <span className="law-active-name">{activeLaw.name}</span>
            <span className="law-active-sub">ON FLOOR</span>
          </div>
        )}
        <div className="law-header-stats">
          <span>{totalSeats} seats</span>
          <span>{state.factions.length} factions</span>
        </div>
      </AppHeader>

      <TabBar active={lawTab} items={lawTabs} onChange={setLawTab} />

      {lawTab === 'floor' && (
        <FloorTab
          activeLaw={activeLaw}
          laws={state.laws}
          entries={entries}
          totalSeats={totalSeats}
          canEdit={canEdit}
          onActivate={handleActivate}
          onConclude={handleConclude}
          onUpdateStance={handleUpdateStance}
          onEditLaw={law => { setEditingLaw(law); setIsNewLaw(false); setLawTab('laws'); }}
        />
      )}

      {lawTab === 'laws' && (
        <LawsTab
          laws={state.laws}
          editingLaw={editingLaw}
          isNew={isNewLaw}
          canEdit={canEdit}
          onAdd={() => { setEditingLaw(null); setIsNewLaw(true); }}
          onEdit={law => { setEditingLaw(law); setIsNewLaw(false); }}
          onSave={handleSaveLaw}
          onCancelEdit={() => { setEditingLaw(null); setIsNewLaw(false); }}
          onDelete={handleDeleteLaw}
          onStatusChange={handleStatusChange}
          onToggleConstitution={handleToggleConstitution}
        />
      )}

      {lawTab === 'constitution' && (
        <ConstitutionTab
          laws={state.laws}
          canEdit={canEdit}
          onEdit={law => { setEditingLaw(law); setIsNewLaw(false); setLawTab('laws'); }}
          onUnmark={handleToggleConstitution}
          onStatusChange={handleStatusChange}
        />
      )}

      {lawTab === 'history' && <HistoryTab history={state.lawHistory} />}
    </div>
  );
}
