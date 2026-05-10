import { useCallback, useMemo, useState } from 'react';
import { LawVotingSession } from '../game/laws/voting';
import { getCurrentParliamentProjection } from '../utils/compute';
import { computeSenateProjection } from '../game/senate';
import { useAuth } from '../context/AuthContext';
import { useAppContext, uid } from '../store';
import { API_BASE } from '../config';
import { lawStatusLabel, useLang } from '../utils/localization';
import type { FactionStance, Law, LawStatus, ProjectionEntry } from '../models/types';
import { AppHeader } from './ui/AppHeader';
import { TabBar, type TabItem } from './ui/TabBar';
import { ConstitutionTab } from './laws/ConstitutionTab';
import { FloorTab } from './laws/FloorTab';
import { HistoryTab } from './laws/HistoryTab';
import { LawsTab } from './laws/LawsTab';

type LawTab = 'floor' | 'senate' | 'laws' | 'constitution' | 'history';

function isVotingBill(law: Law | undefined): law is Law {
  return !!law && law.status === 'voting' && !law.isConstitution;
}

export function LawPage() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit, factionId: playerFactionId, token } = useAuth();
  const t = useLang();

  const [lawTab, setLawTab]                               = useState<LawTab>('floor');
  const [parlActiveLawId, setParlActiveLawId]             = useState<string | null>(null);
  const [senateActiveLawId, setSenateActiveLawId]         = useState<string | null>(null);
  const [editingLaw, setEditingLaw]                       = useState<Law | null>(null);
  const [isNewLaw, setIsNewLaw]                           = useState(false);

  const projection        = useMemo(() => getCurrentParliamentProjection(state), [state]);
  const { entries }       = projection;
  const totalSeats        = projection.totalSeats ?? state.totalSeats;
  const senateProjection  = useMemo(() => computeSenateProjection(state), [state]);
  const senateEntries     = senateProjection.projection.entries;
  const senateTotalSeats  = senateProjection.displayTotalSeats;

  const parlActiveLaw   = useMemo(() => state.laws.find(l => l.id === parlActiveLawId && isVotingBill(l))   ?? null, [state.laws, parlActiveLawId]);
  const senateActiveLaw = useMemo(() => state.laws.find(l => l.id === senateActiveLawId && isVotingBill(l)) ?? null, [state.laws, senateActiveLawId]);

  const submitPlayerStance = useCallback(async (
    lawId: string,
    chamber: 'parliament' | 'senate',
    factionId: string,
    stance: FactionStance,
  ) => {
    if (!token || factionId !== playerFactionId) return;
    try {
      const res = await fetch(`${API_BASE}/law-stance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lawId,
          chamber,
          stance,
          mutationId: uid('stance'),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast(t('vote_submitted'));
    } catch {
      showToast(t('vote_failed'), 'error');
    }
  }, [playerFactionId, showToast, t, token]);

  // Parliament stances
  const handleParlUpdateStance = useCallback((factionId: string, stance: FactionStance) => {
    if (!parlActiveLawId) return;
    if (!canEdit) {
      void submitPlayerStance(parlActiveLawId, 'parliament', factionId, stance);
      return;
    }
    updateState(s => {
      const law = s.laws.find(l => l.id === parlActiveLawId);
      if (law) law.factionStances[factionId] = stance;
      return s;
    });
  }, [canEdit, parlActiveLawId, submitPlayerStance, updateState]);

  // Senate stances stored separately
  const handleSenateUpdateStance = useCallback((factionId: string, stance: FactionStance) => {
    if (!senateActiveLawId) return;
    if (!canEdit) {
      void submitPlayerStance(senateActiveLawId, 'senate', factionId, stance);
      return;
    }
    updateState(s => {
      const law = s.laws.find(l => l.id === senateActiveLawId);
      if (law) {
        if (!law.senateFactionStances) law.senateFactionStances = {};
        law.senateFactionStances[factionId] = stance;
      }
      return s;
    });
  }, [canEdit, senateActiveLawId, submitPlayerStance, updateState]);

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
      showToast(`${t('bill_concluded')}: ${activeLaw.name}`);
    },
    [updateState, showToast, t],
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
    showToast(isNewLaw ? t('bill_created') : t('bill_updated'));
  }, [updateState, showToast, isNewLaw, t]);

  const handleDeleteLaw = useCallback((id: string) => {
    if (!window.confirm(t('delete_bill_confirm'))) return;
    updateState(s => { s.laws = s.laws.filter(l => l.id !== id); return s; });
    if (parlActiveLawId   === id) setParlActiveLawId(null);
    if (senateActiveLawId === id) setSenateActiveLawId(null);
    showToast(t('bill_deleted'));
  }, [updateState, parlActiveLawId, senateActiveLawId, showToast, t]);

  const handleStatusChange = useCallback((id: string, status: LawStatus) => {
    updateState(s => { const law = s.laws.find(l => l.id === id); if (law) law.status = status; return s; });
    showToast(`${t('status_changed')} → ${lawStatusLabel(t, status)}`);
  }, [updateState, showToast, t]);

  const handleToggleConstitution = useCallback((id: string) => {
    updateState(s => { const law = s.laws.find(l => l.id === id); if (law) law.isConstitution = !law.isConstitution; return s; });
  }, [updateState]);

  const lawCount   = state.laws.filter(l => !l.isConstitution).length;
  const constCount = state.laws.filter(l => l.isConstitution).length;
  const histCount  = state.lawHistory.length;

  const lawTabs: TabItem<LawTab>[] = [
    { id: 'floor',        label: t('parliament_floor') },
    { id: 'senate',       label: t('senate_floor') },
    { id: 'laws',         label: t('bills'),        badge: lawCount  },
    { id: 'constitution', label: `⚖ ${t('constitution')}`, badge: constCount },
    { id: 'history',      label: t('vote_history'), badge: histCount },
  ];

  return (
    <div className="law-page">
      <AppHeader title={t('legislature')} subtitle={`// ${t('legislative_chamber')} · v1.0 //`} className="law-header">
        {(parlActiveLaw || senateActiveLaw) && (
          <div className="law-active-indicator">
            <span className="law-active-icon">⊟</span>
            <span className="law-active-name">{(parlActiveLaw ?? senateActiveLaw)!.name}</span>
            <span className="law-active-sub">{t('on_floor')}</span>
          </div>
        )}
        <div className="law-header-stats">
          <span>{totalSeats} {t('parliament_short')}</span>
          <span>{senateTotalSeats} {t('senate_short')}</span>
          <span>{state.factions.length} {t('factions')}</span>
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
          editableFactionId={playerFactionId}
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
          editableFactionId={playerFactionId}
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
