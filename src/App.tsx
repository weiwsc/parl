import { useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppContext, uid, clone, normalizeState, STORAGE_KEY } from './store';
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
import { EventsPage } from './components/EventsPage';
import { NodeEditorPage } from './components/nodes/NodeEditorPage';
import { SenatePage } from './components/SenatePage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { APP_MODE, API_BASE } from './config';
import './App.css';

// ─── Server sync (hosted mode — real-time collaborative) ─────────────────────
//
// Architecture:
//   • All clients (guests + admins) subscribe to GET /api/documents/main/events (SSE).
//     The server sends the full state immediately on connect, then pushes
//     every subsequent change made by any admin.
//   • Admins debounce-PUT their local changes to /api/documents/main/snapshot
//     with a clientId, mutationId, and baseRevision. A 409 means another admin
//     saved first; we rebase local changes onto the server version.
//   • We track whether a state update originated locally (needs upload) or
//     from SSE (already on the server, do not echo back).

const MAIN_DOCUMENT_ID = 'main';
const SYNC_CLIENT_ID_KEY = 'parlSyncClientId_v2';
const LOCAL_SYNC_CHANNEL = 'parlLocalStateSync_v1';

type SyncDocumentEnvelope = {
  documentId: string;
  revision: number;
  clientId?: string | null;
  mutationId?: string | null;
  duplicate?: boolean;
  document: unknown;
};

function parseRevision(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? '').replace(/"/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return uid(`${prefix}-`);
}

function getSyncClientId(): string {
  try {
    const existing = sessionStorage.getItem(SYNC_CLIENT_ID_KEY);
    if (existing) return existing;
    const next = createId('client');
    sessionStorage.setItem(SYNC_CLIENT_ID_KEY, next);
    return next;
  } catch {
    return createId('client');
  }
}

function snapshotToState(snapshot: string): AppState {
  return normalizeState(JSON.parse(snapshot));
}

function sharedStateSnapshot(state: AppState): string {
  return JSON.stringify(stripUi(state));
}

function useLocalWindowSync() {
  const { state, updateState } = useAppContext();
  const windowIdRef = useRef(createId('local-window'));
  const applyingRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const baseStateRef = useRef<AppState | null>(state);
  const lastSharedSnapshotRef = useRef(sharedStateSnapshot(state));

  const applyRemoteSnapshot = useCallback((snapshot: string) => {
    if (snapshot === lastSharedSnapshotRef.current) return;

    const remoteNorm = snapshotToState(snapshot);
    const base = baseStateRef.current ?? remoteNorm;
    baseStateRef.current = remoteNorm;
    lastSharedSnapshotRef.current = snapshot;
    applyingRef.current = true;
    updateState(local => mergeAppState(base, local, remoteNorm));
  }, [updateState]);

  useEffect(() => {
    if (APP_MODE !== 'local') return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        applyRemoteSnapshot(sharedStateSnapshot(normalizeState(JSON.parse(event.newValue))));
      } catch {
        // Ignore malformed external storage writes.
      }
    };

    window.addEventListener('storage', handleStorage);

    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(LOCAL_SYNC_CHANNEL);
      channelRef.current = channel;
      channel.onmessage = (event: MessageEvent<{ sourceId?: string; snapshot?: string }>) => {
        if (event.data?.sourceId === windowIdRef.current || !event.data?.snapshot) return;
        try {
          applyRemoteSnapshot(event.data.snapshot);
        } catch {
          // Ignore malformed cross-window messages.
        }
      };
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [applyRemoteSnapshot]);

  useEffect(() => {
    if (APP_MODE !== 'local') return;

    const snapshot = sharedStateSnapshot(state);
    if (applyingRef.current) {
      applyingRef.current = false;
      lastSharedSnapshotRef.current = snapshot;
      return;
    }

    if (snapshot === lastSharedSnapshotRef.current) return;

    lastSharedSnapshotRef.current = snapshot;
    baseStateRef.current = snapshotToState(snapshot);
    channelRef.current?.postMessage({ sourceId: windowIdRef.current, snapshot });
  }, [state]);
}

function useServerSync() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit, token } = useAuth();

  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const syncTimer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const revRef       = useRef(0);
  const needsSaveRef = useRef(false);
  const applyingRef  = useRef(false);  // true while applying an SSE/merge update (skip dirty-track)
  const esRef        = useRef<EventSource | null>(null);
  const initialLocalStateRef = useRef<AppState | null>(state);
  const hasSeenStateRef = useRef(false);
  const saveSeqRef = useRef(0);
  const lastSharedSnapshotRef = useRef<string | null>(null);
  const clientIdRef = useRef(getSyncClientId());
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
      const es = new EventSource(`${API_BASE}/documents/${MAIN_DOCUMENT_ID}/events`);
      esRef.current = es;

      es.onmessage = (evt) => {
        try {
          const message = JSON.parse(evt.data) as SyncDocumentEnvelope;
          if (message.documentId !== MAIN_DOCUMENT_ID) return;
          const remoteNorm = normalizeState(message.document);
          const remoteRev = parseRevision(message.revision);
          if (remoteRev === null) return;
          if (initializedRef.current && remoteRev < revRef.current) return;
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
          } else if (message.clientId === clientIdRef.current) {
            // The server broadcasts our own accepted snapshots back over SSE.
            // If the user kept typing after that snapshot was sent, applying the
            // echo as a 3-way merge can make the older text win the same-field
            // conflict and briefly rewind controlled inputs/code editors.
            baseStateRef.current = remoteNorm;
            lastSharedSnapshotRef.current = sharedStateSnapshot(remoteNorm);
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
    const sharedSnapshot = sharedStateSnapshot(state);
    if (!hasSeenStateRef.current) {
      hasSeenStateRef.current = true;
      lastSharedSnapshotRef.current = sharedSnapshot;
      return;
    }
    if (applyingRef.current) {
      applyingRef.current = false;
      lastSharedSnapshotRef.current = sharedSnapshot;
      return;
    }
    if (sharedSnapshot !== lastSharedSnapshotRef.current) {
      lastSharedSnapshotRef.current = sharedSnapshot;
      needsSaveRef.current = true;
    }
  }, [state]);

  // ── 3. Debounced PUT — upload local changes (admins only) ───────────────
  const save = useCallback(async (body: string, rev: number, tok: string, seq: number, mutationId: string) => {
    if (!initializedRef.current || !needsSaveRef.current || seq !== saveSeqRef.current) return;
    needsSaveRef.current = false;

    try {
      const payload = `{"clientId":${JSON.stringify(clientIdRef.current)},"mutationId":${JSON.stringify(mutationId)},"baseRevision":${rev},"document":${body}}`;
      const res = await fetch(`${API_BASE}/documents/${MAIN_DOCUMENT_ID}/snapshot`, {
        method:  'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${tok}`,
        },
        body: payload,
      });

      if (seq !== saveSeqRef.current) return;

      if (res.ok) {
        const envelope = await res.json() as SyncDocumentEnvelope;
        const responseRev = parseRevision(envelope.revision ?? res.headers.get('ETag'));
        if (responseRev !== null) revRef.current = responseRev;
        try {
          const remoteNorm = normalizeState(envelope.document);
          baseStateRef.current = remoteNorm;
          lastSharedSnapshotRef.current = sharedStateSnapshot(remoteNorm);
        } catch {
          // Base will still be updated when the server's SSE echo arrives.
        }

      } else if (res.status === 409) {
        if (seq !== saveSeqRef.current) return;
        // Another admin saved first — 3-way merge our changes on top of theirs.
        const envelope = await res.json() as SyncDocumentEnvelope;
        const remoteNorm = normalizeState(envelope.document);
        const base       = baseStateRef.current ?? remoteNorm;
        const parsedServerRev = parseRevision(envelope.revision);
        if (parsedServerRev !== null) revRef.current = parsedServerRev;
        baseStateRef.current = remoteNorm;
        // Apply merge without setting applyingRef so the dirty-tracker will mark
        // the merged result for upload on the next debounce cycle.
        updateState(local => mergeAppState(base, local, remoteNorm));
        showToastRef.current('Merged with changes from another editor', 'bad');

      } else {
        console.warn('PUT /api/documents/main/snapshot', res.status);
        needsSaveRef.current = true;
        if (seq === saveSeqRef.current) {
          syncTimer.current = setTimeout(() => save(body, revRef.current, tok, seq, mutationId), 1_500);
        }
      }
    } catch (e) {
      console.error('Sync failed:', e);
      needsSaveRef.current = true;
      if (seq === saveSeqRef.current) {
        syncTimer.current = setTimeout(() => save(body, revRef.current, tok, seq, mutationId), 1_500);
      }
    }
  }, [updateState]);

  useEffect(() => {
    if (APP_MODE !== 'hosted' || !canEdit || !token || !initializedRef.current || !needsSaveRef.current) return;
    // Strip ui so each client keeps its own tab/theme/expansion state.
    const snapshot = sharedStateSnapshot(state);
    const tok      = token;
    const seq      = ++saveSeqRef.current;
    const mutationId = createId('mutation');
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => save(snapshot, revRef.current, tok, seq, mutationId), 600);
    return () => clearTimeout(syncTimer.current);
  }, [state, canEdit, token, save]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ─── Main app content ─────────────────────────────────────────────────────────

function AppContent() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit } = useAuth();
  const { tab } = state.ui;

  useLocalWindowSync();
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
    <div className={`app${tab === 'nodes' ? ' app--nodes' : ''}`} {...(!canEdit ? { 'data-readonly': '' } : {})}>
      <div className="app-body">
        <Sidebar />

        <main className={`app-main${tab === 'map' ? ' app-main--map' : ''}${tab === 'nodes' ? ' app-main--nodes' : ''}`}>
          {tab !== 'map' && tab !== 'law' && tab !== 'events' && tab !== 'nodes' && tab !== 'senate' && <Header onElection={handleElection} />}
          {tab !== 'settings' && tab !== 'map' && tab !== 'law' && tab !== 'events' && tab !== 'nodes' && tab !== 'senate' && <Tabs />}

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
          {tab === 'events'   && <EventsPage />}
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
