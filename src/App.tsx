import { useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppContext, uid, clone, normalizeState } from './store';
import { computeProjection } from './utils/compute';
import { stripUi, mergeAppState } from './utils/merge';
import type { AppState } from './models/types';
import { Header, Sidebar, Tabs, Toast } from './components/Layout';
import { StrataList } from './components/Strata';
import { FactionsList } from './components/Factions';
import { ProjectionChart, SupportMatrix } from './components/Projection';
import { HistoryPanel } from './components/History';
import { TrashPanel } from './components/Trash';
import { SettingsPanel } from './components/Settings';
import { MapPage } from './components/MapPage';
import { LawPage } from './components/LawPage';
import { NodeEditorPage } from './components/nodes/NodeEditorPage';
import { SenatePage } from './components/SenatePage';
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
//     saved first; we rebase local changes onto the server version.
//   • We track whether a state update originated locally (needs upload) or
//     from SSE (already on the server, do not echo back).

function parseRevision(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? '').replace(/"/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function useServerSync() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit, token } = useAuth();

  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const syncTimer    = useRef<ReturnType<typeof setTimeout>>();
  const revRef       = useRef(0);
  const needsSaveRef = useRef(false);
  const applyingRef  = useRef(false);  // true while applying an SSE/merge update (skip dirty-track)
  const esRef        = useRef<EventSource | null>(null);
  const initialLocalStateRef = useRef<AppState | null>(state);
  const hasSeenStateRef = useRef(false);
  const saveSeqRef = useRef(0);
  // Last state the server acknowledged — used as the 3-way merge base.
  const baseStateRef = useRef<AppState | null>(null);
  // After the first SSE message we know the server baseline; subsequent messages can be merged.
  const initializedRef = useRef(false);

  // ── 1. SSE subscription ─────────────────────────────────────────────────
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
          const remoteNorm = normalizeState(remote);
          const remoteRev = parseRevision(rev);
          if (remoteRev === null) return;
          revRef.current = remoteRev;

          if (!initializedRef.current) {
            // First message: accept server state but keep our own ui. If the
            // user managed to edit before the baseline arrived, replay only
            // those edits on top of the server state.
            const localBase = initialLocalStateRef.current ?? remoteNorm;
            const hasLocalChanges = needsSaveRef.current;
            initializedRef.current  = true;
            baseStateRef.current    = remoteNorm;
            applyingRef.current     = true;
            updateState(local => (
              hasLocalChanges
                ? mergeAppState(localBase, local, remoteNorm)
                : { ...remoteNorm, ui: local.ui }
            ));
          } else {
            // Subsequent messages: 3-way merge so local unsaved edits are not discarded.
            const base = baseStateRef.current ?? remoteNorm;
            baseStateRef.current = remoteNorm;
            applyingRef.current  = true;
            updateState(local => mergeAppState(base, local, remoteNorm));
          }
        } catch { /* malformed event — ignore */ }
      };

      es.onerror = () => {
        es.close();
        if (active) setTimeout(connect, 4_000);
      };
    };

    connect();
    return () => { active = false; esRef.current?.close(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Dirty tracker — marks only user-originated state changes ──────────
  useEffect(() => {
    if (APP_MODE !== 'hosted') return;
    if (!hasSeenStateRef.current) {
      hasSeenStateRef.current = true;
      return;
    }
    if (applyingRef.current) {
      applyingRef.current = false;
      return;
    }
    needsSaveRef.current = true;
  }, [state]);

  // ── 3. Debounced PUT — upload local changes (admins only) ───────────────
  const save = useCallback(async (body: string, rev: number, tok: string, seq: number) => {
    if (!initializedRef.current || !needsSaveRef.current || seq !== saveSeqRef.current) return;
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
        const etagRev = parseRevision(res.headers.get('ETag'));
        if (etagRev !== null) revRef.current = etagRev;
        try {
          baseStateRef.current = normalizeState(JSON.parse(body));
        } catch {
          // Base will still be updated when the server's SSE echo arrives.
        }

      } else if (res.status === 409) {
        // Another admin saved first — 3-way merge our changes on top of theirs.
        const { rev: serverRev, state: serverState } = await res.json() as
          { rev: number; state: unknown };
        const remoteNorm = normalizeState(serverState);
        const base       = baseStateRef.current ?? remoteNorm;
        const parsedServerRev = parseRevision(serverRev);
        if (parsedServerRev !== null) revRef.current = parsedServerRev;
        baseStateRef.current = remoteNorm;
        // Apply merge without setting applyingRef so the dirty-tracker will mark
        // the merged result for upload on the next debounce cycle.
        updateState(local => mergeAppState(base, local, remoteNorm));
        showToastRef.current('Merged with changes from another editor', 'bad');

      } else {
        console.warn('PUT /api/state', res.status);
        needsSaveRef.current = true;
        if (seq === saveSeqRef.current) {
          syncTimer.current = setTimeout(() => save(body, revRef.current, tok, seq), 1_500);
        }
      }
    } catch (e) {
      console.error('Sync failed:', e);
      needsSaveRef.current = true;
      if (seq === saveSeqRef.current) {
        syncTimer.current = setTimeout(() => save(body, revRef.current, tok, seq), 1_500);
      }
    }
  }, [updateState]);

  useEffect(() => {
    if (APP_MODE !== 'hosted' || !canEdit || !token || !initializedRef.current || !needsSaveRef.current) return;
    // Strip ui so each client keeps its own tab/theme/expansion state.
    const snapshot = JSON.stringify(stripUi(state));
    const tok      = token;
    const seq      = ++saveSeqRef.current;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => save(snapshot, revRef.current, tok, seq), 600);
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
          {tab !== 'map' && tab !== 'law' && tab !== 'nodes' && tab !== 'senate' && <Header onElection={handleElection} />}
          {tab !== 'settings' && tab !== 'map' && tab !== 'law' && tab !== 'nodes' && tab !== 'senate' && <Tabs />}

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
          {tab === 'senate'   && <SenatePage />}
          {tab === 'nodes'    && <NodeEditorPage />}
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
