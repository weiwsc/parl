import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { API_BASE, APP_MODE } from '../config';
import { useAuth } from '../context/AuthContext';
import type { AppState } from '../models/types';
import { normalizeState, STORAGE_KEY, uid, useAppContext } from '../store';
import { mergeAppState, stripUi } from '../utils/merge';
import {
  applyObjectMutationOperations,
  applyChangedObjectRevisions,
  createObjectRevisionMap,
  planObjectMutationSave,
  type DocumentObjectSummary,
  type MutatedDocumentObject,
  type ObjectMutationOperation,
  type ObjectRevisionMap,
} from './objectMutationPlanner';

const MAIN_DOCUMENT_ID = 'main';
const SYNC_CLIENT_ID_KEY = 'parlSyncClientId_v2';
const LOCAL_SYNC_CHANNEL = 'parlLocalStateSync_v1';
const HOSTED_SERVER_SNAPSHOT_KEY = 'parlHostedServerSnapshot_v1';
const HOSTED_SERVER_REVISION_KEY = 'parlHostedServerRevision_v1';

type SyncDocumentEnvelope = {
  eventType?: string | null;
  documentId: string;
  revision: number;
  clientId?: string | null;
  mutationId?: string | null;
  duplicate?: boolean;
  document: unknown;
};

type ObjectMutationEnvelope = SyncDocumentEnvelope & {
  objects?: MutatedDocumentObject[];
};

type ObjectMutationEventEnvelope = {
  eventType: 'object.mutate';
  documentId: string;
  revision: number;
  clientId?: string | null;
  mutationId?: string | null;
  duplicate?: boolean;
  objects?: MutatedDocumentObject[];
  operations?: ObjectMutationOperation[];
};

type SyncEventEnvelope = SyncDocumentEnvelope | ObjectMutationEventEnvelope;

type ObjectMutationErrorEnvelope = {
  code?: string;
  message?: string;
  currentDocument?: SyncDocumentEnvelope | null;
};

type QueuedObjectSave = {
  id: string;
  kind: 'object';
  localSnapshot: string;
  baseRevision: number;
  operations: ObjectMutationOperation[];
};

type QueuedSnapshotSave = {
  id: string;
  kind: 'snapshot';
  localSnapshot: string;
  baseRevision: number;
  reason: string;
};

type QueuedSave = QueuedObjectSave | QueuedSnapshotSave;

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

function loadHostedServerSnapshot(): string | null {
  try {
    return localStorage.getItem(HOSTED_SERVER_SNAPSHOT_KEY);
  } catch {
    return null;
  }
}

function persistHostedServerSnapshot(state: AppState, revision: number): string {
  const snapshot = sharedStateSnapshot(state);
  try {
    localStorage.setItem(HOSTED_SERVER_SNAPSHOT_KEY, snapshot);
    localStorage.setItem(HOSTED_SERVER_REVISION_KEY, String(revision));
  } catch {
    // This is only used to protect local unsaved edits across refresh.
  }
  return snapshot;
}

function useSharedStateSnapshot(state: AppState): string {
  return useMemo(() => sharedStateSnapshot(state), [
    state.schemaVersion,
    state.totalSeats,
    state.unalignedMode,
    state.strata,
    state.factions,
    state.alliances,
    state.history,
    state.trash,
    state.map,
    state.laws,
    state.lawHistory,
    state.events,
    state.eventSettings,
    state.election,
    state.nodes,
    state.senate,
  ]);
}

function isObjectMutationEvent(message: SyncEventEnvelope): message is ObjectMutationEventEnvelope {
  return message.eventType === 'object.mutate' && Array.isArray((message as ObjectMutationEventEnvelope).operations);
}

function hasDocumentSnapshot(message: SyncEventEnvelope): message is SyncDocumentEnvelope {
  return 'document' in message && message.document !== undefined && message.document !== null;
}

export function useDocumentSync() {
  useLocalWindowSync();
  useServerSync();
}

function useLocalWindowSync() {
  const { state, updateState } = useAppContext();
  const sharedSnapshot = useSharedStateSnapshot(state);
  const windowIdRef = useRef(createId('local-window'));
  const applyingRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const baseStateRef = useRef<AppState | null>(state);
  const lastSharedSnapshotRef = useRef(sharedSnapshot);

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

    const snapshot = sharedSnapshot;
    if (applyingRef.current) {
      applyingRef.current = false;
      lastSharedSnapshotRef.current = snapshot;
      return;
    }

    if (snapshot === lastSharedSnapshotRef.current) return;

    lastSharedSnapshotRef.current = snapshot;
    baseStateRef.current = snapshotToState(snapshot);
    channelRef.current?.postMessage({ sourceId: windowIdRef.current, snapshot });
  }, [sharedSnapshot]);
}

function useServerSync() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit, token } = useAuth();
  const sharedSnapshot = useSharedStateSnapshot(state);
  const [saveKick, requestSaveKick] = useReducer((value: number) => value + 1, 0);

  const updateStateRef = useRef(updateState);
  const showToastRef = useRef(showToast);
  const tokenRef = useRef(token);
  const canEditRef = useRef(canEdit);
  useEffect(() => { updateStateRef.current = updateState; }, [updateState]);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);
  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { canEditRef.current = canEdit; }, [canEdit]);

  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const objectRevisionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const revRef = useRef(0);
  const needsSaveRef = useRef(false);
  const latestSharedSnapshotRef = useRef(sharedSnapshot);
  const pendingSaveQueueRef = useRef<QueuedSave[]>([]);
  const applyingRef = useRef(false);
  const esRef = useRef<EventSource | null>(null);
  const initialLocalStateRef = useRef<AppState | null>(state);
  const hostedServerSnapshotRef = useRef(loadHostedServerSnapshot());
  const hasSeenStateRef = useRef(false);
  const saveSeqRef = useRef(0);
  const lastSharedSnapshotRef = useRef<string | null>(null);
  const clientIdRef = useRef(getSyncClientId());
  const baseStateRef = useRef<AppState | null>(null);
  const initializedRef = useRef(false);
  const objectRevisionsRef = useRef<ObjectRevisionMap>(new Map());
  const objectRevisionsLoadedRef = useRef(false);

  useEffect(() => { latestSharedSnapshotRef.current = sharedSnapshot; }, [sharedSnapshot]);

  const refreshObjectRevisions = useCallback(async (tok: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/documents/${MAIN_DOCUMENT_ID}/objects?includeDeleted=true`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) return false;
      const rows = await res.json() as DocumentObjectSummary[];
      objectRevisionsRef.current = createObjectRevisionMap(rows);
      objectRevisionsLoadedRef.current = true;
      return true;
    } catch (error) {
      console.warn('Object revision refresh failed:', error);
      return false;
    }
  }, []);

  const scheduleObjectRevisionRefresh = useCallback((tok: string) => {
    clearTimeout(objectRevisionTimer.current);
    objectRevisionTimer.current = setTimeout(() => {
      void refreshObjectRevisions(tok);
    }, 250);
  }, [refreshObjectRevisions]);

  useEffect(() => () => clearTimeout(objectRevisionTimer.current), []);

  useEffect(() => {
    if (APP_MODE !== 'hosted' || !canEdit || !token) return;
    void refreshObjectRevisions(token);
  }, [canEdit, refreshObjectRevisions, token]);

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
          const message = JSON.parse(evt.data) as SyncEventEnvelope;
          if (message.documentId !== MAIN_DOCUMENT_ID) return;
          const remoteRev = parseRevision(message.revision);
          if (remoteRev === null) return;
          if (initializedRef.current && remoteRev < revRef.current) return;
          revRef.current = remoteRev;

          if (isObjectMutationEvent(message)) {
            if (objectRevisionsLoadedRef.current) {
              objectRevisionsRef.current = applyChangedObjectRevisions(objectRevisionsRef.current, message.objects ?? []);
            } else if (canEditRef.current && tokenRef.current) {
              scheduleObjectRevisionRefresh(tokenRef.current);
            }

            if (message.clientId === clientIdRef.current) return;

            const base = baseStateRef.current;
            if (!base) return;

            const remoteNorm = applyObjectMutationOperations(base, message.operations ?? []);
            if (!remoteNorm) {
              es.close();
              if (active) setTimeout(connect, 0);
              return;
            }

            baseStateRef.current = remoteNorm;
            hostedServerSnapshotRef.current = persistHostedServerSnapshot(remoteNorm, remoteRev);
            pendingSaveQueueRef.current = [];
            applyingRef.current = true;
            updateStateRef.current(local => mergeAppState(base, local, remoteNorm));
            return;
          }

          if (!hasDocumentSnapshot(message)) return;

          const remoteNorm = normalizeState(message.document);
          const previousAckedSnapshot = hostedServerSnapshotRef.current;

          if (canEditRef.current && tokenRef.current) {
            scheduleObjectRevisionRefresh(tokenRef.current);
          }

          if (!initializedRef.current) {
            const localBase = initialLocalStateRef.current ?? remoteNorm;
            const currentLocalSnapshot = latestSharedSnapshotRef.current;
            const hasRefreshLocalChanges = !!previousAckedSnapshot
              && currentLocalSnapshot !== previousAckedSnapshot;
            const hasLocalChanges = needsSaveRef.current
              || (canEditRef.current && !!tokenRef.current && hasRefreshLocalChanges);
            if (hasLocalChanges) {
              needsSaveRef.current = true;
              requestSaveKick();
            }
            initializedRef.current = true;
            baseStateRef.current = remoteNorm;
            hostedServerSnapshotRef.current = persistHostedServerSnapshot(remoteNorm, remoteRev);
            applyingRef.current = true;
            updateStateRef.current(local => (
              hasLocalChanges
                ? mergeAppState(localBase, local, remoteNorm)
                : { ...remoteNorm, ui: local.ui }
            ));
          } else if (message.clientId === clientIdRef.current) {
            baseStateRef.current = remoteNorm;
            lastSharedSnapshotRef.current = sharedStateSnapshot(remoteNorm);
            hostedServerSnapshotRef.current = persistHostedServerSnapshot(remoteNorm, remoteRev);
          } else {
            const base = baseStateRef.current ?? remoteNorm;
            baseStateRef.current = remoteNorm;
            hostedServerSnapshotRef.current = persistHostedServerSnapshot(remoteNorm, remoteRev);
            pendingSaveQueueRef.current = [];
            applyingRef.current = true;
            updateStateRef.current(local => mergeAppState(base, local, remoteNorm));
          }
        } catch {
          // Ignore malformed events.
        }
      };

      es.onerror = () => {
        es.close();
        if (active) setTimeout(connect, 4_000);
      };
    };

    connect();
    return () => { active = false; esRef.current?.close(); };
  }, [scheduleObjectRevisionRefresh]);

  // ── 2. Dirty tracker — marks only user-originated state changes ──────────
  useEffect(() => {
    if (APP_MODE !== 'hosted') return;
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
      pendingSaveQueueRef.current = [];
    }
  }, [sharedSnapshot]);

  const clearQueuedSave = useCallback((batch: QueuedSave) => {
    pendingSaveQueueRef.current = pendingSaveQueueRef.current.filter(item => item.id !== batch.id);
  }, []);

  const queuePendingSave = useCallback(async (snapshot: string, tok: string): Promise<QueuedSave | null> => {
    const queued = pendingSaveQueueRef.current[0];
    if (queued?.localSnapshot === snapshot) return queued;

    const baseRevision = revRef.current;
    const baseState = baseStateRef.current;
    if (!baseState) {
      const fallback: QueuedSnapshotSave = {
        id: createId('queued-snapshot'),
        kind: 'snapshot',
        localSnapshot: snapshot,
        baseRevision,
        reason: 'Server baseline is not ready.',
      };
      pendingSaveQueueRef.current = [fallback];
      return fallback;
    }

    if (!objectRevisionsLoadedRef.current) {
      await refreshObjectRevisions(tok);
    }

    if (objectRevisionsLoadedRef.current) {
      const currentState = snapshotToState(snapshot);
      const plan = planObjectMutationSave(baseState, currentState, objectRevisionsRef.current);
      if (plan.kind === 'object') {
        if (plan.operations.length === 0) {
          pendingSaveQueueRef.current = [];
          return null;
        }

        const batch: QueuedObjectSave = {
          id: createId('queued-object'),
          kind: 'object',
          localSnapshot: snapshot,
          baseRevision,
          operations: plan.operations,
        };
        pendingSaveQueueRef.current = [batch];
        return batch;
      }

      const fallback: QueuedSnapshotSave = {
        id: createId('queued-snapshot'),
        kind: 'snapshot',
        localSnapshot: snapshot,
        baseRevision,
        reason: plan.reason,
      };
      pendingSaveQueueRef.current = [fallback];
      return fallback;
    }

    const fallback: QueuedSnapshotSave = {
      id: createId('queued-snapshot'),
      kind: 'snapshot',
      localSnapshot: snapshot,
      baseRevision,
      reason: 'Object revisions are not available.',
    };
    pendingSaveQueueRef.current = [fallback];
    return fallback;
  }, [refreshObjectRevisions]);

  const applyAcceptedDocument = useCallback((envelope: SyncDocumentEnvelope, fallbackRevision: number | null) => {
    const responseRev = parseRevision(envelope.revision ?? fallbackRevision);
    if (responseRev !== null) revRef.current = responseRev;
    try {
      const remoteNorm = normalizeState(envelope.document);
      baseStateRef.current = remoteNorm;
      lastSharedSnapshotRef.current = sharedStateSnapshot(remoteNorm);
      hostedServerSnapshotRef.current = persistHostedServerSnapshot(remoteNorm, responseRev ?? 0);
      pendingSaveQueueRef.current = [];
    } catch {
      // Base will still be updated when the server's SSE echo arrives.
    }
  }, []);

  const applyRemoteConflictDocument = useCallback((envelope: SyncDocumentEnvelope) => {
    const remoteNorm = normalizeState(envelope.document);
    const base = baseStateRef.current ?? remoteNorm;
    const parsedServerRev = parseRevision(envelope.revision);
    if (parsedServerRev !== null) revRef.current = parsedServerRev;
    baseStateRef.current = remoteNorm;
    hostedServerSnapshotRef.current = persistHostedServerSnapshot(remoteNorm, parsedServerRev ?? 0);
    pendingSaveQueueRef.current = [];
    updateState(local => mergeAppState(base, local, remoteNorm));
  }, [updateState]);

  const rollbackToServerDocument = useCallback((envelope: SyncDocumentEnvelope) => {
    const remoteNorm = normalizeState(envelope.document);
    const parsedServerRev = parseRevision(envelope.revision);
    if (parsedServerRev !== null) revRef.current = parsedServerRev;
    baseStateRef.current = remoteNorm;
    lastSharedSnapshotRef.current = sharedStateSnapshot(remoteNorm);
    hostedServerSnapshotRef.current = persistHostedServerSnapshot(remoteNorm, parsedServerRev ?? 0);
    pendingSaveQueueRef.current = [];
    applyingRef.current = true;
    needsSaveRef.current = false;
    updateState(local => ({ ...remoteNorm, ui: local.ui }));
  }, [updateState]);

  const saveSnapshot = useCallback(async (batch: QueuedSnapshotSave, tok: string, seq: number, mutationId: string) => {
    const payload = `{"clientId":${JSON.stringify(clientIdRef.current)},"mutationId":${JSON.stringify(mutationId)},"baseRevision":${batch.baseRevision},"document":${batch.localSnapshot}}`;
    const res = await fetch(`${API_BASE}/documents/${MAIN_DOCUMENT_ID}/snapshot`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok}`,
      },
      body: payload,
    });

    if (seq !== saveSeqRef.current) return true;

    if (res.ok) {
      const envelope = await res.json() as SyncDocumentEnvelope;
      applyAcceptedDocument(envelope, parseRevision(res.headers.get('ETag')));
      clearQueuedSave(batch);
      scheduleObjectRevisionRefresh(tok);
      return true;
    }

    if (res.status === 409) {
      const envelope = await res.json() as SyncDocumentEnvelope;
      applyRemoteConflictDocument(envelope);
      clearQueuedSave(batch);
      scheduleObjectRevisionRefresh(tok);
      showToastRef.current('Merged with changes from another editor', 'bad');
      return true;
    }

    console.warn('PUT /api/documents/main/snapshot', res.status);
    return false;
  }, [applyAcceptedDocument, applyRemoteConflictDocument, clearQueuedSave, scheduleObjectRevisionRefresh]);

  const saveObjectMutations = useCallback(async (
    batch: QueuedObjectSave,
    tok: string,
    seq: number,
    mutationId: string,
  ): Promise<'handled' | 'fallback' | 'retry'> => {
    const res = await fetch(`${API_BASE}/documents/${MAIN_DOCUMENT_ID}/objects/mutations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok}`,
      },
      body: JSON.stringify({
        clientId: clientIdRef.current,
        mutationId,
        baseRevision: batch.baseRevision,
        operations: batch.operations,
      }),
    });

    if (seq !== saveSeqRef.current) return 'handled';

    if (res.ok) {
      const envelope = await res.json() as ObjectMutationEnvelope;
      applyAcceptedDocument(envelope, parseRevision(res.headers.get('ETag')));
      objectRevisionsRef.current = applyChangedObjectRevisions(objectRevisionsRef.current, envelope.objects ?? []);
      objectRevisionsLoadedRef.current = true;
      clearQueuedSave(batch);
      return 'handled';
    }

    if (res.status === 400 || res.status === 404) {
      console.warn('Object mutation save fell back to snapshot:', res.status);
      return 'fallback';
    }

    if (res.status === 409) {
      const error = await res.json() as ObjectMutationErrorEnvelope;
      if (error.currentDocument) {
        if (error.code === 'reference-conflict' || error.code === 'invalid-mutation') {
          rollbackToServerDocument(error.currentDocument);
          clearQueuedSave(batch);
          scheduleObjectRevisionRefresh(tok);
          showToastRef.current(error.message ?? 'Change was rejected by document validation', 'bad');
          return 'handled';
        }

        applyRemoteConflictDocument(error.currentDocument);
        clearQueuedSave(batch);
        scheduleObjectRevisionRefresh(tok);
        showToastRef.current('Merged with changes from another editor', 'bad');
        return 'handled';
      }
    }

    console.warn('POST /api/documents/main/objects/mutations', res.status);
    return 'retry';
  }, [applyAcceptedDocument, applyRemoteConflictDocument, clearQueuedSave, rollbackToServerDocument, scheduleObjectRevisionRefresh]);

  // ── 3. Debounced save — queue object mutations first, snapshot fallback ──
  const save = useCallback(async (tok: string, seq: number, mutationId: string) => {
    if (!initializedRef.current || !needsSaveRef.current || seq !== saveSeqRef.current) return;
    needsSaveRef.current = false;

    try {
      const batch = await queuePendingSave(latestSharedSnapshotRef.current, tok);
      if (!batch) return;

      if (batch.kind === 'object') {
        const result = await saveObjectMutations(batch, tok, seq, mutationId);
        if (result === 'handled') return;
        if (result === 'retry') {
          needsSaveRef.current = true;
          if (seq === saveSeqRef.current) {
            syncTimer.current = setTimeout(() => save(tok, seq, mutationId), 1_500);
          }
          return;
        }
      }

      const snapshotBatch: QueuedSnapshotSave = batch.kind === 'snapshot'
        ? batch
        : {
            id: createId('queued-snapshot'),
            kind: 'snapshot',
            localSnapshot: latestSharedSnapshotRef.current,
            baseRevision: revRef.current,
            reason: 'Object mutation endpoint requested fallback.',
          };
      const saved = await saveSnapshot(snapshotBatch, tok, seq, mutationId);
      if (!saved) {
        needsSaveRef.current = true;
        if (seq === saveSeqRef.current) {
          syncTimer.current = setTimeout(() => save(tok, seq, mutationId), 1_500);
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
      needsSaveRef.current = true;
      if (seq === saveSeqRef.current) {
        syncTimer.current = setTimeout(() => save(tok, seq, mutationId), 1_500);
      }
    }
  }, [queuePendingSave, saveObjectMutations, saveSnapshot]);

  useEffect(() => {
    if (APP_MODE !== 'hosted' || !canEdit || !token || !initializedRef.current || !needsSaveRef.current) return;
    const tok = token;
    const seq = ++saveSeqRef.current;
    const mutationId = createId('mutation');
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => save(tok, seq, mutationId), 600);
    return () => clearTimeout(syncTimer.current);
  }, [sharedSnapshot, saveKick, canEdit, token, save]);
}
