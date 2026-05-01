import { useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppContext, uid, clone, normalizeState } from './store';
import { computeProjection } from './utils/compute';
import { Header, Sidebar, Tabs, Toast } from './components/Layout';
import { StrataList } from './components/Strata';
import { FactionsList } from './components/Factions';
import { ProjectionChart, SupportMatrix } from './components/Projection';
import { HistoryPanel } from './components/History';
import { TrashPanel } from './components/Trash';
import { SettingsPanel } from './components/Settings';
import { MapPage } from './components/MapPage';
import { LawPage } from './components/LawPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { APP_MODE, API_BASE } from './config';
import './App.css';

// ─── Server sync (hosted mode — real-time collaborative) ─────────────────────
//
// Architecture:
//   • All clients (guests + admins) subscribe to GET /api/state/events (SSE).
//     The server sends the full state immediately on connect, then pushes
//     every subsequent change made by any admin.
//   • Admins debounce-PUT their local changes to /api/state with an If-Match
//     revision header for optimistic concurrency.  A 409 means another admin
//     saved first; we accept the server's version and show a toast.
//   • We track whether a state update originated locally (needs upload) or
//     from SSE (already on the server, do not echo back).

function useServerSync() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit, token } = useAuth();

  // Stable ref to showToast so we can call it inside async callbacks without
  // adding it to every effect's dependency array.
  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const syncTimer    = useRef<ReturnType<typeof setTimeout>>();
  const revRef       = useRef(0);      // last known server revision
  const needsSaveRef = useRef(false);  // true when local changes await upload
  const applyingRef  = useRef(false);  // true while we apply an incoming SSE update
  const esRef        = useRef<EventSource | null>(null);

  // ── 1. SSE subscription — receives live state from the server ───────────
  useEffect(() => {
    if (APP_MODE !== 'hosted') return;

    let active = true;

    const connect = () => {
      if (!active) return;
      const es = new EventSource(`${API_BASE}/state/events`);
      esRef.current = es;

      es.onmessage = (evt) => {
        try {
          const { rev, state: remote } = JSON.parse(evt.data) as { rev: number; state: unknown };
          revRef.current    = rev;
          applyingRef.current = true;           // tell dirty-tracker this is not a local edit
          updateState(() => normalizeState(remote));
        } catch { /* malformed event — ignore */ }
      };

      es.onerror = () => {
        es.close();
        if (active) setTimeout(connect, 4_000);  // reconnect with back-off
      };
    };

    connect();
    return () => { active = false; esRef.current?.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Dirty tracker — marks only user-originated changes for upload ─────
  useEffect(() => {
    if (APP_MODE !== 'hosted') return;
    if (applyingRef.current) {
      applyingRef.current = false;   // this change came from SSE — do not re-upload
      return;
    }
    needsSaveRef.current = true;
  }, [state]);

  // ── 3. Debounced PUT — upload local changes (admins only) ───────────────
  const save = useCallback(async (body: string, rev: number, tok: string) => {
    if (!needsSaveRef.current) return;
    needsSaveRef.current = false;

    try {
      const res = await fetch(`${API_BASE}/state`, {
        method:  'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${tok}`,
          'If-Match':     String(rev),
        },
        body,
      });

      if (res.ok) {
        const etag = res.headers.get('ETag');
        if (etag) revRef.current = parseInt(etag, 10);

      } else if (res.status === 409) {
        // Another admin saved a newer revision — accept their state.
        const { rev: serverRev, state: serverState } = await res.json() as
          { rev: number; state: unknown };
        revRef.current      = serverRev;
        applyingRef.current = true;
        updateState(() => normalizeState(serverState));
        showToastRef.current('State updated by another editor', 'bad');

      } else {
        console.warn('PUT /api/state', res.status);
        needsSaveRef.current = true;  // allow retry on next state change
      }
    } catch (e) {
      console.error('Sync failed:', e);
      needsSaveRef.current = true;
    }
  }, [updateState]);

  useEffect(() => {
    if (APP_MODE !== 'hosted' || !canEdit || !token) return;
    const snapshot = JSON.stringify(state);
    const rev      = revRef.current;
    const tok      = token;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => save(snapshot, rev, tok), 600);
    return () => clearTimeout(syncTimer.current);
  }, [state, canEdit, token, save]); // eslint-disable-line react-hooks/exhaustive-deps
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

        <main className={`app-main${tab === 'map' ? ' app-main--map' : ''}`}>
          {tab !== 'map' && tab !== 'law' && <Header onElection={handleElection} />}
          {tab !== 'settings' && tab !== 'map' && tab !== 'law' && <Tabs />}

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
          {tab === 'map'      && <MapPage />}
          {tab === 'law'      && <LawPage />}
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
