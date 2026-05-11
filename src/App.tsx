import { useMemo, useEffect, useReducer } from 'react';
import { useAppContext, uid, clone } from './store';
import { computeElectionProjection } from './utils/compute';
import { Header, Sidebar, Tabs, Toast } from './components/Layout';
import { StrataList } from './components/Strata';
import { FactionsList } from './components/Factions';
import { ProjectionChart, SupportMatrix } from './components/Projection';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useDocumentSync } from './sync/useDocumentSync';
import {
  getLoadedDeferredTab,
  isDeferredTabId,
  preloadDeferredTab,
  warmDeferredTabs,
} from './deferredTabs';
import './App.css';

// ─── Main app content ─────────────────────────────────────────────────────────

function AppContent() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit } = useAuth();
  const { tab } = state.ui;
  const [, rerenderDeferredTab] = useReducer((value: number) => value + 1, 0);

  useDocumentSync();

  useEffect(() => warmDeferredTabs(tab), [tab]);
  useEffect(() => {
    if (!isDeferredTabId(tab) || getLoadedDeferredTab(tab)) return;

    let active = true;
    void preloadDeferredTab(tab)?.finally(() => {
      if (active) rerenderDeferredTab();
    });

    return () => {
      active = false;
    };
  }, [tab]);

  const showParliamentHeader =
    tab !== 'trash'
    && tab !== 'map'
    && tab !== 'factions'
    && tab !== 'law'
    && tab !== 'events'
    && tab !== 'nodes'
    && tab !== 'senate';
  const showParliamentTabs = showParliamentHeader && tab !== 'settings';

  const projection = useMemo(() => {
    const proj = computeElectionProjection(state, { randomize: false });
    return {
      ...proj,
      totalSeats: state.totalSeats,
      unalignedMode: state.unalignedMode,
      strataCount: state.strata.length,
      factionsCount: state.factions.length,
      timestamp: Date.now(),
    };
  }, [
    state.totalSeats,
    state.unalignedMode,
    state.strata,
    state.factions,
    state.alliances,
    state.map,
    state.election,
  ]);

  const handleElection = () => {
    updateState(s => {
      const electionProjection = computeElectionProjection(s, { randomize: true });
      s.history.unshift({
        id: uid('e'),
        timestamp: Date.now(),
        totalSeats: s.totalSeats,
        unalignedMode: s.unalignedMode,
        strata: clone(s.strata),
        factions: clone(s.factions),
        alliances: clone(s.alliances),
        projection: JSON.parse(JSON.stringify({
          ...electionProjection,
          totalSeats: s.totalSeats,
          unalignedMode: s.unalignedMode,
          strataCount: s.strata.length,
          factionsCount: s.factions.length,
          timestamp: Date.now(),
        })),
      });
      s.ui.tab = 'current';
      return s;
    });
    showToast('Election recorded!');
  };

  return (
    // data-readonly disables all editing controls via CSS when user cannot edit
    <div className={`app${tab === 'map' ? ' app--map' : ''}${tab === 'nodes' ? ' app--nodes' : ''}`} {...(!canEdit ? { 'data-readonly': '' } : {})}>
      <div className="app-body">
        <Sidebar />

        <main className={`app-main${tab === 'map' ? ' app-main--map' : ''}${tab === 'nodes' ? ' app-main--nodes' : ''}`}>
          {showParliamentHeader && <Header onElection={handleElection} />}
          {showParliamentTabs && <Tabs />}

          {tab === 'sim' && (
            <div className="grid">
              <StrataList />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <ProjectionChart projection={projection} />
                <SupportMatrix projection={projection} />
              </div>
              <FactionsList projection={projection} />
            </div>
          )}
          <DeferredTabContent tab={tab} />
        </main>
      </div>

      <Toast />
    </div>
  );
}

function DeferredTabContent({ tab }: { tab: string }) {
  if (!isDeferredTabId(tab)) return null;

  const module = getLoadedDeferredTab(tab);
  if (!module) return <DeferredTabFallback />;

  switch (tab) {
    case 'current': {
      const { CurrentParliamentPanel: Component } = module as typeof import('./components/CurrentParliament');
      return <Component />;
    }
    case 'hist': {
      const { HistoryPanel: Component } = module as typeof import('./components/History');
      return <Component />;
    }
    case 'trash': {
      const { TrashPanel: Component } = module as typeof import('./components/Trash');
      return <Component />;
    }
    case 'settings': {
      const { SettingsPanel: Component } = module as typeof import('./components/Settings');
      return <Component />;
    }
    case 'map': {
      const { MapPage: Component } = module as typeof import('./components/MapPage');
      return <Component />;
    }
    case 'factions': {
      const { FactionsPage: Component } = module as typeof import('./components/FactionsPage');
      return <Component />;
    }
    case 'law': {
      const { LawPage: Component } = module as typeof import('./components/LawPage');
      return <Component />;
    }
    case 'events': {
      const { EventsPage: Component } = module as typeof import('./components/EventsPage');
      return <Component />;
    }
    case 'senate': {
      const { SenatePage: Component } = module as typeof import('./components/SenatePage');
      return <Component />;
    }
    case 'nodes': {
      const { NodeEditorPage: Component } = module as typeof import('./components/nodes/NodeEditorPage');
      return <Component />;
    }
    default:
      return null;
  }
}

function DeferredTabFallback() {
  return <div className="deferred-tab-fallback" role="status">Loading...</div>;
}

// ─── Root with providers ──────────────────────────────────────────────────────

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
