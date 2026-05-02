import { useCallback, useMemo, useState } from 'react';
import { LawVotingSession } from '../game/laws/voting';
import { computeProjection } from '../utils/compute';
import { computeSenateProjection } from '../game/senate';
import { useAuth } from '../context/AuthContext';
import { useAppContext, uid } from '../store';
import type { FactionStance, Law, LawStatus, ProjectionEntry } from '../models/types';
import { AppHeader } from './ui/AppHeader';
import { TabBar, type TabItem } from './ui/TabBar';
import { ConstitutionTab } from './laws/ConstitutionTab';
import { FloorTab } from './laws/FloorTab';
import { HistoryTab } from './laws/HistoryTab';
import { LawsTab } from './laws/LawsTab';

type LawTab = 'floor' | 'senate' | 'laws' | 'constitution' | 'history';

export function LawPage() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit } = useAuth();

  const [lawTab, setLawTab]                               = useState<LawTab>('floor');
  const [parlActiveLawId, setParlActiveLawId]             = useState<string | null>(null);
  const [senateActiveLawId, setSenateActiveLawId]         = useState<string | null>(null);
  const [editingLaw, setEditingLaw]                       = useState<Law | null>(null);
  const [isNewLaw, setIsNewLaw]                           = useState(false);

  const projection        = useMemo(() => computeProjection(state), [state]);
  const { entries }       = projection;
  const totalSeats        = state.totalSeats;
  const senateProjection  = useMemo(() => computeSenateProjection(state), [state]);
  const senateEntries     = senateProjection.projection.entries;
  const senateTotalSeats  = senateProjection.totalSeats;

  const parlActiveLaw   = useMemo(() => state.laws.find(l => l.id === parlActiveLawId)   ?? null, [state.laws, parlActiveLawId]);
  const senateActiveLaw = useMemo(() => state.laws.find(l => l.id === senateActiveLawId) ?? null, [state.laws, senateActiveLawId]);

  // Parliament stances
  const handleParlUpdateStance = useCallback((factionId: string, stance: FactionStance) => {
    if (!parlActiveLawId) return;
    updateState(s => {
      const law = s.laws.find(l => l.id === parlActiveLawId);
      if (law) law.factionStances[factionId] = stance;
      return s;
    });
  }, [parlActiveLawId, updateState]);

  // Senate stances stored separately
  const handleSenateUpdateStance = useCallback((factionId: string, stance: FactionStance) => {
    if (!senateActiveLawId) return;
    updateState(s => {
      const law = s.laws.find(l => l.id === senateActiveLawId);
      if (law) {
        if (!law.senateFactionStances) law.senateFactionStances = {};
        law.senateFactionStances[factionId] = stance;
      }
      return s;
    });
  }, [senateActiveLawId, updateState]);

  const makeConcludeHandler = useCallback(
    (
      activeLaw: Law | null,
      chamberEntries: ProjectionEntry[],
      chamberSeats: number,
      chamber: 'parliament' | 'senate',
    ) => (status: LawStatus) => {
      if (!activeLaw) return;

      // Use the chamber-specific stances when creating the vote record
      const effectiveLaw = {
        ...activeLaw,
        factionStances: chamber === 'senate'
          ? (activeLaw.senateFactionStances ?? {})
          : activeLaw.factionStances,
      };
      const session = new LawVotingSession(effectiveLaw, chamberEntries, chamberSeats);
      const record  = session.createRecord({ id: uid('lvr'), chamber });

      updateState(s => {
        const idx = s.laws.findIndex(l => l.id === activeLaw.id);
        if (idx >= 0) { s.laws[idx].status = status; s.laws[idx].votedAt = Date.now(); }
        s.lawHistory.unshift(record);
        return s;
      });

      if (chamber === 'senate') setSenateActiveLawId(null);
      else setParlActiveLawId(null);
      setLawTab('history');
      showToast(`Bill concluded: ${activeLaw.name}`);
    },
    [updateState, showToast],
  );

  const handleParlConclude   = useMemo(() => makeConcludeHandler(parlActiveLaw,   entries,       totalSeats,      'parliament'), [makeConcludeHandler, parlActiveLaw,   entries,       totalSeats]);
  const handleSenateConclude = useMemo(() => makeConcludeHandler(senateActiveLaw, senateEntries, senateTotalSeats,'senate'),     [makeConcludeHandler, senateActiveLaw, senateEntries, senateTotalSeats]);

  const handleSaveLaw = useCallback((law: Law) => {
    updateState(s => {
      const idx = s.laws.findIndex(l => l.id === law.id);
      if (idx >= 0) s.laws[idx] = law;
      else s.laws.push(law);
      return s;
    });
    setEditingLaw(null);
    setIsNewLaw(false);
    showToast(isNewLaw ? 'Bill created' : 'Bill updated');
  }, [updateState, showToast, isNewLaw]);

  const handleDeleteLaw = useCallback((id: string) => {
    if (!window.confirm('Delete this bill permanently?')) return;
    updateState(s => { s.laws = s.laws.filter(l => l.id !== id); return s; });
    if (parlActiveLawId   === id) setParlActiveLawId(null);
    if (senateActiveLawId === id) setSenateActiveLawId(null);
    showToast('Bill deleted');
  }, [updateState, parlActiveLawId, senateActiveLawId, showToast]);

  const handleStatusChange = useCallback((id: string, status: LawStatus) => {
    updateState(s => { const law = s.laws.find(l => l.id === id); if (law) law.status = status; return s; });
    showToast(`Status → ${status}`);
  }, [updateState, showToast]);

  const handleToggleConstitution = useCallback((id: string) => {
    updateState(s => { const law = s.laws.find(l => l.id === id); if (law) law.isConstitution = !law.isConstitution; return s; });
  }, [updateState]);

  const lawCount   = state.laws.filter(l => !l.isConstitution).length;
  const constCount = state.laws.filter(l => l.isConstitution).length;
  const histCount  = state.lawHistory.length;

  const lawTabs: TabItem<LawTab>[] = [
    { id: 'floor',        label: 'Parliament Floor' },
    { id: 'senate',       label: 'Senate Floor' },
    { id: 'laws',         label: 'Bills',          badge: lawCount  },
    { id: 'constitution', label: '⚖ Constitution', badge: constCount },
    { id: 'history',      label: 'Vote History',   badge: histCount },
  ];

  return (
    <div className="law-page">
      <AppHeader title="LEGISLATURE" subtitle="// LEGISLATIVE CHAMBER · v1.0 //" className="law-header">
        {(parlActiveLaw || senateActiveLaw) && (
          <div className="law-active-indicator">
            <span className="law-active-icon">⊟</span>
            <span className="law-active-name">{(parlActiveLaw ?? senateActiveLaw)!.name}</span>
            <span className="law-active-sub">ON FLOOR</span>
          </div>
        )}
        <div className="law-header-stats">
          <span>{totalSeats} parl</span>
          <span>{senateTotalSeats} senate</span>
          <span>{state.factions.length} factions</span>
        </div>
      </AppHeader>

      <TabBar active={lawTab} items={lawTabs} onChange={setLawTab} />

      {lawTab === 'floor' && (
        <FloorTab
          activeLaw={parlActiveLaw}
          laws={state.laws}
          entries={entries}
          totalSeats={totalSeats}
          canEdit={canEdit}
          chamber="parliament"
          onActivate={id => setParlActiveLawId(prev => prev === id ? null : id)}
          onConclude={handleParlConclude}
          onUpdateStance={handleParlUpdateStance}
          onEditLaw={law => { setEditingLaw(law); setIsNewLaw(false); setLawTab('laws'); }}
        />
      )}

      {lawTab === 'senate' && (
        <FloorTab
          activeLaw={senateActiveLaw}
          laws={state.laws}
          entries={senateEntries}
          totalSeats={senateTotalSeats}
          canEdit={canEdit}
          chamber="senate"
          onActivate={id => setSenateActiveLawId(prev => prev === id ? null : id)}
          onConclude={handleSenateConclude}
          onUpdateStance={handleSenateUpdateStance}
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
