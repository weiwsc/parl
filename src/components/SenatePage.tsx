import { useMemo, useState } from 'react';
import { useAppContext, uid, clone } from '../store';
import { useAuth } from '../context/AuthContext';
import { computeSenateProjection } from '../game/senate';
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
  const [tab, setTab] = useState<SenateTab>('sim');

  const { projection, autoSeats, totalSeats } = useMemo(
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

  const recordElection = () => {
    const snap = computeSenateProjection(state);
    updateState(s => {
      s.senate.history.unshift({
        id: uid('se'),
        timestamp: Date.now(),
        totalSeats: snap.totalSeats,
        autoAssign: s.senate.autoAssign,
        factions: clone(state.factions.map(f => ({ id: f.id, name: f.name, color: f.color }))),
        alliances: clone(state.alliances),
        projection: snap.projection,
      });
      return s;
    });
    setTab('hist');
    showToast('Senate election recorded!');
  };

  return (
    <div className="senate-page">
      <AppHeader title="SENATE" subtitle="// UPPER CHAMBER · v0.1 //">
        <label className="toggle senate-auto-toggle" title="Auto-assign seats from 100%-controlled regions">
          <input type="checkbox" checked={autoAssign} onChange={toggleAutoAssign} />
          <span className="switch" />
          <span className="toggle-label">AUTO-ASSIGN</span>
        </label>
        <label className="toggle senate-auto-toggle" title="Assign seats for uncontrolled regions by strata composition">
          <input type="checkbox" checked={strataAssign} onChange={toggleStrataAssign} />
          <span className="switch" />
          <span className="toggle-label">STRATA-ASSIGN</span>
        </label>
        {canEdit && (
          <button className="primary small" onClick={recordElection}>⬡ Record Election</button>
        )}
      </AppHeader>

      <TabBar
        active={tab}
        items={[
          { id: 'sim', label: 'Simulation' },
          { id: 'hist', label: 'History', badge: histCount || undefined },
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
            <Panel title="MAP" bodyClassName="no-scroll senate-map-body">
              <StaticMapView
                regions={state.map.regions}
                factions={state.factions}
                alliances={state.alliances}
              />
            </Panel>
          </div>

          <SenateFactionsList
            totalSeats={totalSeats}
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
