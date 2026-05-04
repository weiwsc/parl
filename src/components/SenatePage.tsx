import { useMemo, useState } from 'react';
import { useAppContext, uid, clone } from '../store';
import { useAuth } from '../context/AuthContext';
import { computeSenateProjection } from '../game/senate';
import { useLang } from '../utils/localization';
import { AppHeader } from './ui/AppHeader';
import { TabBar } from './ui/TabBar';
import { Panel } from './ui/Panel';
import { ProjectionChart } from './Projection';
import { SenateRegionList } from './senate/SenateRegionList';
import { SenateFactionsList } from './senate/SenateFactionsList';
import { StaticMapView } from './map/StaticMapView';
import { SenateHistoryPanel } from './senate/SenateHistoryPanel';

type SenateTab = 'sim' | 'hist';

export function SenatePage() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit } = useAuth();
  const t = useLang();
  const [tab, setTab] = useState<SenateTab>('sim');

  const hideUnassignedSeats = state.senate.hideUnassignedSeats;
  const { projection, autoSeats, displayTotalSeats } = useMemo(
    () => computeSenateProjection(state),
    [state],
  );

  const autoAssign = state.senate.autoAssign;
  const strataAssign = state.senate.strataAssign;
  const histCount = state.senate.history.length;

  const toggleAutoAssign = () => {
    updateState(s => { s.senate.autoAssign = !s.senate.autoAssign; return s; });
  };

  const toggleStrataAssign = () => {
    updateState(s => { s.senate.strataAssign = !s.senate.strataAssign; return s; });
  };

  const toggleHideUnassignedSeats = () => {
    updateState(s => {
      s.senate.hideUnassignedSeats = !s.senate.hideUnassignedSeats;
      return s;
    });
  };

  const recordElection = () => {
    const snap = computeSenateProjection(state);
    updateState(s => {
      s.senate.history.unshift({
        id: uid('se'),
        timestamp: Date.now(),
        totalSeats: snap.displayTotalSeats,
        autoAssign: s.senate.autoAssign,
        factions: clone(state.factions.map(f => ({ id: f.id, name: f.name, color: f.color }))),
        alliances: clone(state.alliances),
        projection: snap.projection,
      });
      return s;
    });
    setTab('hist');
    showToast(t('senate_election_recorded'));
  };

  return (
    <div className="senate-page">
      <AppHeader title={t('senate')} subtitle={`// ${t('upper_chamber')} · v0.1 //`}>
        <label className="toggle senate-auto-toggle" title={t('auto_assign_title')}>
          <input type="checkbox" checked={autoAssign} onChange={toggleAutoAssign} />
          <span className="switch" />
          <span className="toggle-label">{t('auto_assign').toUpperCase()}</span>
        </label>
        <label className="toggle senate-auto-toggle" title={t('strata_assign_title')}>
          <input type="checkbox" checked={strataAssign} onChange={toggleStrataAssign} />
          <span className="switch" />
          <span className="toggle-label">{t('strata_assign').toUpperCase()}</span>
        </label>
        <label className="toggle senate-auto-toggle" title={t('assigned_only_title')}>
          <input data-ro-allow type="checkbox" checked={hideUnassignedSeats} onChange={toggleHideUnassignedSeats} />
          <span className="switch" />
          <span className="toggle-label">{t('assigned_only').toUpperCase()}</span>
        </label>
        {canEdit && (
          <button className="primary small" onClick={recordElection}>⬡ {t('record_election')}</button>
        )}
      </AppHeader>

      <TabBar
        active={tab}
        items={[
          { id: 'sim', label: t('simulation') },
          { id: 'hist', label: t('history'), badge: histCount || undefined },
        ]}
        onChange={setTab}
      />

      {tab === 'sim' && (
        <div className="grid">
          <SenateRegionList
            regions={state.map.regions}
            factions={state.factions}
            autoSeats={autoSeats}
            autoAssign={autoAssign}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <ProjectionChart projection={projection} />
            <Panel title={t('map').toUpperCase()} bodyClassName="no-scroll senate-map-body">
              <StaticMapView
                regions={state.map.regions}
                factions={state.factions}
                alliances={state.alliances}
              />
            </Panel>
          </div>

          <SenateFactionsList
            totalSeats={displayTotalSeats}
            autoSeats={autoSeats}
            showAuto={autoAssign}
            entries={projection.entries}
          />
        </div>
      )}

      {tab === 'hist' && <SenateHistoryPanel />}
    </div>
  );
}
