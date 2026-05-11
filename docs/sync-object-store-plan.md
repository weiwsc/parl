# JSON Object Store Sync Plan

## Goal

Move Parliament Simulator from one giant collaborative snapshot toward a production-safe JSON object store with object-level revision tracking, mutation history, and clearer multi-user conflict handling, without freezing the domain model too early.

The current snapshot sync must keep working during the migration.

## Current State

- The backend stores one JSON document in `sync_documents`.
- Full-document saves use `PUT /api/documents/{documentId}/snapshot`.
- The backend checks `baseRevision` and returns `409` for stale snapshots.
- The frontend rebases stale snapshots with a 3-way merge in `src/utils/merge.ts`.
- `sync_mutations` already logs accepted snapshot writes.
- This is reliable enough for coarse edits, but the conflict unit is currently the whole document.

## Target Architecture

Use a hybrid model:

- `sync_documents` remains the canonical document snapshot during migration.
- `sync_document_objects` stores stable domain objects as JSON blobs with per-object revisions.
- `sync_mutations` remains the mutation ledger.
- Future mutation endpoints update object/path JSON and then regenerate or update the document snapshot.

This preserves schema flexibility while making conflict detection smaller than a whole document.

## Stable Object Types

Start with object types whose names and identities are likely stable:

- `stratum`
- `faction`
- `alliance`
- `region`
- `law`
- `lawHistory`
- `event`
- `eventIssue`
- `electionHistory`
- `senateHistory`
- `nodeType`
- `nodeGraphNode`
- `nodeGraphConnection`
- `nodeTransform`
- trash records by deleted object category

The JSON shape inside each object can continue to evolve under `schemaVersion` and normalizers.

## Conflict Model

Use layered conflict handling:

- **Document revision**: protects the existing snapshot endpoint.
- **Object revision**: future mutation endpoint can reject or merge stale edits per object.
- **Path-level merge**: different paths in the same object can merge automatically.
- **Same-path conflict**: object mutations return structured conflict details so the client can rebase, retry, or show a targeted resolution UI.
- **Reference integrity**: object/path mutations must check whether active references become dangling.
- **Collaborative text/code**: only add CRDT/Yjs-style editing if same-field simultaneous text editing becomes common.

## Reference Integrity Model

Reference integrity is intentionally separate from history/trash preservation.

- Active objects should not keep references to deleted active objects unless the reference type is explicitly nullable.
- History records and trash records can preserve old embedded JSON and should not be auto-rewritten by default.
- Deletion behavior should be explicit per object type:
  - **cascade cleanup** for references that are easy and expected to disappear, such as alliance faction IDs.
  - **block delete** when deletion would destroy important active graph structure without user confirmation.
  - **allow dangling historical reference** only for historical/archive/trash records.
- The backend should expose reference issues before mutation endpoints become authoritative.
- Future mutation endpoints should use the same validator before accepting writes that delete or retarget objects.
- Keep generic JSON reference mechanics separate from document-shape rules:
  - `JsonReferenceValidationContext` owns structure-agnostic checks such as string IDs, string arrays, and object-key references.
  - `JsonElementReader` owns structure-agnostic JSON traversal and ID collection helpers.
  - `DocumentReferenceValidator` owns Parliament-specific paths, object meanings, and the reference index built from the current frontend document shape.
- When the frontend document shape changes, update `DocumentReferenceValidator.BuildIndex` and the relevant `Check*References` method first. Only change the generic helpers when the validation primitive itself changes.

## Migration Strategy

1. Keep full snapshot read/write and SSE unchanged.
2. Backfill `sync_document_objects` from each accepted snapshot.
3. Add read/debug tooling for object rows if needed.
4. Add object/path mutation endpoint.
5. Teach the frontend to send mutation ops while keeping snapshot fallback.
6. Later, make object rows canonical and generate document snapshots for legacy clients/export.

## Agent-Sized Implementation Tasks

### Phase 1: Object Index Groundwork

- Add `sync_document_objects`.
- Extract stable objects from document JSON.
- Upsert object rows after accepted snapshot saves.
- Mark missing previously indexed objects as deleted.
- Keep public API unchanged.
- Verify existing snapshot save, duplicate save, conflict handling, and SSE still work.

### Phase 2: Object Mutation Contract

- [x] Add request/response DTOs for object/path mutations.
- [x] Define operation types: `set`, `unset`, `insert`, `remove`, `replaceObject`, `deleteObject`, `restoreObject`.
- [x] Store operation JSON in `sync_mutations`.
- [x] Validate `clientId`, `mutationId`, and object identity.
- [x] Run reference-integrity validation before accepting object/path mutations.
- [x] Return accepted document/object revisions.
- [x] Add object-level base revision checks and same-object path conflict details in Phase 3.

### Phase 3: Conflict Resolution

- [x] Add object-level base revision checks.
- [x] Merge non-overlapping JSON paths.
- [x] Return structured same-path conflicts.
- [x] Keep snapshot fallback available.

### Phase 4: Frontend Mutation Emission

- [x] Keep UI components unaware of sync transport details.
- [x] Track local edits as object/path ops in a sync-layer diff planner.
- [x] Send debounced mutation batches when edits only touch indexed objects.
- [x] Keep local optimistic updates.
- [x] Consume structured object conflict responses and retry non-conflicting local ops through the existing merge path.
- [x] Rebase incoming SSE mutations against pending local edits through baseline object-op application plus existing state merge.
- [x] Switch SSE payloads from full snapshot-only broadcasts to mutation-shaped updates with snapshot fallback.
- [x] Keep an explicit pending save queue in the sync layer so retry/ack/rebase behavior does not depend on a stale debounce closure.
- [x] Fall back to full snapshot when the client cannot express an edit as ops.

### Phase 5: Production Migration and Maintenance

- [x] Add a backfill command or endpoint for existing production databases.
- Add lazy read migration for old object schema versions.
- Add background migration job for large production upgrades.
- Add export/import compatibility tests.

## Status

- [x] Plan created.
- [x] Phase 1 object index groundwork implemented.
- [x] Admin object-index read API implemented.
- [x] Admin reference-integrity read API implemented.
- [x] Reference validator split into generic JSON helpers and Parliament document rules.
- [x] Phase 2 object/path mutation endpoint implemented.
- [x] Phase 3 object/path conflict handling implemented.
- [x] Phase 4 frontend object mutation emission started behind a UI-agnostic sync hook.
- [x] Backend compile checked with `dotnet build backend/ParliamentApi.csproj`.
- [x] Endpoint-level snapshot sync regression checked.
- [x] Frontend lint/build checked after backend work.
- [x] Backend object-index regression harness added.
- [x] Admin object-index reindex/backfill endpoint implemented.
- [x] Plan updated with completed implementation details.

## Completed This Pass

- Added `sync_document_objects` as a JSON-backed object index table.
- Added the `SyncDocumentObject` EF model with a composite key of `document_id`, `object_type`, and `object_id`.
- Added startup SQL to create `sync_document_objects` and its document/type index for existing SQLite databases where `EnsureCreated` will not add new tables.
- Added `DocumentObjectIndexer`, which extracts stable objects from the current document JSON and stores them as per-object JSON rows.
- Indexed object rows are updated only when their JSON changes, restored from deletion, or disappear from the snapshot.
- Missing previously indexed objects are soft-deleted with `deleted_at`.
- Accepted snapshot saves now refresh the object index in the same write transaction.
- Existing documents lazily backfill their object index on first `GetOrCreateAsync` read if no object rows exist yet.
- Added admin-only object index inspection endpoints:
  - `GET /api/documents/{documentId}/objects`
  - `GET /api/documents/{documentId}/objects/{objectType}/{objectId}`
- Made `includeDeleted` optional on the object inspection endpoints.
- Added backend reference-integrity detection for active document JSON.
- Added admin-only reference issue endpoint:
  - `GET /api/documents/{documentId}/references/issues`
- Refactored reference validation so document-shape knowledge is isolated in `DocumentReferenceValidator`, with generic JSON traversal/reference checks in `JsonReferenceValidation.cs`.
- Added admin-only object/path mutation endpoint:
  - `POST /api/documents/{documentId}/objects/mutations`
- Added object mutation operations: `set`, `unset`, `insert`, `remove`, `replaceObject`, `deleteObject`, and `restoreObject`.
- Added `DocumentObjectCatalog` so object array paths are shared by indexing and mutation application.
- Added `DocumentObjectMutator` to apply operations to the canonical document JSON before the object index is refreshed.
- Accepted object mutations now write `object.mutate` entries to `sync_mutations`, update the canonical snapshot, refresh `sync_document_objects`, broadcast the legacy snapshot SSE payload, and return changed object revisions.
- Reference validation rejects mutations that would introduce new active dangling references, while allowing documents with unrelated pre-existing reference issues to keep being repaired.
- Object mutations now accept stale document revisions when each touched object includes `baseObjectRevision` and the server can prove there is no overlapping object/path change.
- Non-overlapping stale edits to different objects or different JSON paths in the same object are accepted and merged into the canonical snapshot.
- Same-path, whole-object, missing-object, deleted-object, mixed-base-revision, future-base-revision, and unknown-change cases return structured `objectConflicts` details.
- Snapshot writes between an object's base revision and current revision are treated conservatively as `unknown-object-change`, because the server cannot infer path-level intent from a full-document replacement.
- Moved frontend sync behavior out of `App.tsx` into `useDocumentSync`, so UI pages and editors continue to call `updateState` with normal domain edits.
- Added a generic object mutation planner that diffs the last acknowledged server state against the current local state, maps stable arrays to backend object types, and emits `set`, `unset`, `replaceObject`, `deleteObject`, or `restoreObject` operations.
- The sync hook now refreshes admin object revisions from `GET /api/documents/{documentId}/objects?includeDeleted=true` and attaches `baseObjectRevision` automatically.
- Hosted-mode saves try object/path mutations first, keep the optimistic local state, and fall back to the full snapshot endpoint for root-level changes, missing object revisions, oversized mutation batches, or unsupported mutation responses.
- Structured object conflicts flow through the same server-merge retry path as snapshot conflicts, while validation conflicts roll the client back to the current server document and show a toast.
- Object mutations now broadcast compact SSE events with `eventType: "object.mutate"`, the accepted operations, and changed object revisions instead of embedding the full document.
- Snapshot writes, initial SSE connection state, and reconnect fallback still use full document envelopes.
- The frontend sync hook applies incoming object mutation SSE events to the last acknowledged server baseline, then merges that derived remote state with local unsaved edits.
- If a mutation event cannot be applied locally, the sync hook reconnects to recover through the full snapshot event.
- The sync hook now queues pending object or snapshot saves with their own base revision and local snapshot. Successful acknowledgements, validation rollbacks, and server conflicts clear the queue; remote events clear and rebuild it against the updated baseline before retrying.
- The hosted SSE subscription now keeps a stable `updateState` ref so normal state renders do not tear down and recreate the event stream.
- Hosted mode now persists the last server-acknowledged snapshot separately from browser-local state, so a refresh with unsaved imported/edited local data can preserve and save that local work instead of being overwritten by the initial SSE snapshot.
- Added `backend.Tests`, a dependency-light console regression harness that exercises the real EF document store against in-memory SQLite.
- Added backend regression coverage for indexing stable document objects, soft-deleting removed objects, re-indexing changed object JSON, and rejecting object deletion that would create dangling references.
- Added admin-only object-index reindex endpoint:
  - `POST /api/documents/{documentId}/objects/reindex`
- The reindex endpoint rebuilds/refreshes the JSON object index from the canonical document snapshot and returns active/deleted object counts for operator feedback.

## Verification Completed

- `dotnet build backend/ParliamentApi.csproj`
- `npm run lint`
- `npm run build`
- Local backend smoke against a throwaway SQLite database and throwaway document:
  - Read initial document.
  - Logged in as admin.
  - Saved a full snapshot.
  - Repeated the same mutation ID and confirmed duplicate handling.
  - Saved from a stale base revision and confirmed `409`.
  - Listed object index rows through the admin object API.
  - Read one indexed faction object through the admin object API.
  - Removed the faction in a later snapshot and confirmed the indexed object row was soft-deleted with `deletedAt`.
- Local backend reference-integrity smoke against a throwaway SQLite database and throwaway document:
  - Saved active JSON with intentional dangling references across factions, strata, regions, event issue IDs, node types, graph nodes, transforms, and region bindings.
  - Called `GET /api/documents/{documentId}/references/issues`.
  - Confirmed the endpoint returned warnings for all expected referenced object types.
- Post-refactor local backend reference-integrity smoke:
  - Re-ran the same endpoint flow against a throwaway document.
  - Confirmed 21 warnings across `event`, `faction`, `nodeGraphNode`, `nodeTransform`, `nodeType`, `region`, and `stratum`.
- Local backend object mutation smoke against a throwaway SQLite database and throwaway document:
  - Seeded a clean document through the snapshot endpoint.
  - Renamed a faction through `set` and confirmed the document and changed object revision response.
  - Set a JSON property to `null` and confirmed null is distinct from omitted `value`.
  - Repeated a mutation ID and confirmed duplicate handling.
  - Saved from a stale base revision and confirmed `409 revision-conflict`.
  - Tried deleting a referenced faction and confirmed `409 reference-conflict`.
  - Removed the alliance reference, deleted the faction, and confirmed the indexed faction row was soft-deleted.
- Local backend object mutation conflict smoke against a throwaway SQLite database and throwaway document:
  - Seeded faction and alliance objects through the snapshot endpoint.
  - Saved a stale faction name edit with `baseObjectRevision`.
  - Saved a second stale faction color edit against the same object revision and confirmed the non-overlapping paths merged.
  - Saved a stale alliance name edit and confirmed different-object stale edits merged.
  - Saved a stale faction name edit after the first name edit and confirmed `409 same-path-conflict`.
  - Saved a stale object edit without `baseObjectRevision` and confirmed `409 base-object-revision-required`.
- Frontend verification after moving sync behind `useDocumentSync`:
  - `npm run lint`
  - `npm run build`
  - Confirmed the production build still code-splits deferred tab pages and leaves UI components free of object mutation API calls.
- Local backend SSE mutation smoke against a throwaway SQLite database and throwaway document:
  - Seeded a faction through the snapshot endpoint.
  - Opened the document SSE stream.
  - Saved a faction rename through the object mutation endpoint.
  - Confirmed the next SSE event had `eventType: "object.mutate"`, included the accepted operation and changed object revision, and did not include a full `document` payload.
- Frontend verification after adding the pending save queue:
  - `npm run lint`
  - `npm run build`
  - `dotnet build backend/ParliamentApi.csproj`
- Frontend verification after stabilizing the hosted SSE subscription:
  - `npm run lint`
  - `npm run build`
- Frontend verification after hosted refresh-safety hardening:
  - `npm run lint`
  - `npm run build`
  - Browser smoke: toggled a hosted-mode document field, refreshed before the normal debounced save window completed, confirmed the refreshed client still pushed the local change to the backend, then restored the field.
  - Browser smoke: wrote a remote snapshot through the backend API and confirmed the open hosted client applied the SSE update, then restored the field.
- Backend regression harness:
  - `dotnet run --project backend.Tests/ParliamentApi.Tests.csproj`
- Backend verification after adding the reindex endpoint:
  - `dotnet build backend/ParliamentApi.csproj`
  - `dotnet run --project backend.Tests/ParliamentApi.Tests.csproj`
  - Live hosted smoke: `POST /api/documents/main/objects/reindex` returned `200` with object counts.

## Remaining Phase 4 Follow-Up

- Replace the diff-derived pending queue with first-class domain operation capture if editing workflows later need operation history before debounce time.
- Add browser-level regression coverage for hosted refresh-before-save and cross-browser SSE propagation once the repo has an end-to-end test harness.
- Add focused unit coverage for the object mutation planner once a frontend test harness exists.
- Decide how validation conflicts should surface in editing workflows that currently create temporary dangling references during multi-step edits.

## Remaining Phase 1 Follow-Up

- Decide whether to keep the raw startup SQL compatibility patch or move the backend to EF Core migrations before production.
- Extend the reference validator as new active object/reference types are added.
