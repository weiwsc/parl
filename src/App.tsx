import { useMemo, useEffect, useRef } from 'react';
import { useAppContext, uid, clone, normalizeState } from './store';
import { computeProjection } from './utils/compute';
import { Header, Sidebar, Tabs, Toast } from './components/Layout';
import { StrataList } from './components/Strata';
import { FactionsList } from './components/Factions';
import { ProjectionChart, SupportMatrix } from './components/Projection';
import { HistoryPanel } from './components/History';
import { TrashPanel } from './components/Trash';
import { SettingsPanel } from './components/Settings';
import { AuthProvider, useAuth } from './context/AuthContext';
import { APP_MODE, API_BASE } from './config';
import './App.css';

// ─── Server sync (hosted mode only) ──────────────────────────────────────────

function useServerSync() {
  const { state, updateState } = useAppContext();
  const { canEdit, token } = useAuth();
  const syncTimer = useRef<ReturnType<typeof setTimeout>>();

  // Load from server on mount
  useEffect(() => {
    if (APP_MODE !== 'hosted') return;
    fetch(`${API_BASE}/state`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) updateState(() => normalizeState(data)); })
      .catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save to server when state changes (admin only)
  useEffect(() => {
    if (APP_MODE !== 'hosted' || !canEdit || !token) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      fetch(`${API_BASE}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(state),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(syncTimer.current);
  }, [state, canEdit, token]);
}

// ─── Main app content ─────────────────────────────────────────────────────────

function AppContent() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit } = useAuth();
  const { tab } = state.ui;

  useServerSync();

  const projection = useMemo(() => {
    const proj = computeProjection(state);
    return {
      ...proj,
      totalSeats: state.totalSeats,
      unalignedMode: state.unalignedMode,
      strataCount: state.strata.length,
      factionsCount: state.factions.length,
      timestamp: Date.now(),
    };
  }, [state]);

  const handleElection = () => {
    updateState(s => {
      s.history.unshift({
        id: uid('e'),
        timestamp: Date.now(),
        totalSeats: state.totalSeats,
        unalignedMode: state.unalignedMode,
        strata: clone(state.strata),
        factions: clone(state.factions),
        alliances: clone(state.alliances),
        projection: JSON.parse(JSON.stringify(projection)),
      });
      s.ui.tab = 'hist';
      return s;
    });
    showToast('Election recorded!');
  };

  return (
    // data-readonly disables all editing controls via CSS when user cannot edit
    <div className="app" {...(!canEdit ? { 'data-readonly': '' } : {})}>
      <div className="app-body">
        <Sidebar />

        <main className="app-main">
          <Header onElection={handleElection} />
          {tab !== 'settings' && <Tabs />}

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
          {tab === 'hist'     && <HistoryPanel />}
          {tab === 'trash'    && <TrashPanel />}
          {tab === 'settings' && <SettingsPanel />}
        </main>
      </div>

      <Toast />
    </div>
  );
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
