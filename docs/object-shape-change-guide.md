# Object Shape Change Guide

This app intentionally keeps the domain object bodies flexible JSON, but a few places still need to know where stable objects live and which IDs reference other IDs. Use this guide when the frontend document shape changes.

## Rule of Thumb

- If you add, remove, or rename a field inside an existing object, the object store usually keeps working automatically.
- If you add, remove, rename, or move an object collection, update the object catalogs on both the frontend and backend.
- If you add, remove, rename, or move an ID reference, update the backend reference validator.
- If you add root-level state that should sync efficiently, decide whether it should be an indexed object collection. Otherwise it will use snapshot fallback.
- UI components should not call sync endpoints directly. They should keep using `updateState`; sync behavior belongs in `src/sync/useDocumentSync.ts` and `src/sync/objectMutationPlanner.ts`.

## Common Change Types

### Add a Field to an Existing Object

Examples: add `faction.ideology`, `region.weather`, or `nodeType.displayGroup`.

Update:

- `src/models/types.ts`: add the TypeScript field.
- `src/store.tsx`: update `defaultState` or `normalizeState` if the field needs a default or migration from old saves/imports.
- Relevant UI/editor component: read/write the field through normal `updateState`.
- `backend/Sync/DocumentReferenceValidator.cs`: only if the new field stores IDs that reference other objects.
- Tests/smokes: add coverage when the field affects object references, imports, or merge behavior.

Usually no change needed:

- `backend/Sync/DocumentObjectIndexer.cs`: it stores the whole object JSON.
- `backend/Sync/DocumentObjectMutation.cs`: path mutations already support arbitrary nested JSON fields inside known objects.
- `src/sync/objectMutationPlanner.ts`: the diff planner already emits field/path ops inside known objects.

### Add a New Object Collection

Examples: add `parties`, `map.layers`, `nodes.resources`.

Update:

- `src/models/types.ts`: add the collection and item type.
- `src/store.tsx`: add defaults and normalization. Include migration behavior for older saved JSON.
- `src/utils/merge.ts`: add merge behavior if the collection must 3-way merge by object ID.
- `src/sync/useDocumentSync.ts`: add the new collection to `useSharedStateSnapshot` dependencies if it is part of shared state.
- `src/sync/objectMutationPlanner.ts`: add the collection to `OBJECT_ARRAY_PATHS`.
- `backend/Sync/DocumentObjectMutation.cs`: add the same `objectType` and JSON path to `DocumentObjectCatalog`.
- `backend/Sync/DocumentReferenceValidator.cs`: add IDs to `BuildIndex` if other fields can reference these objects, and add `Check*References` rules if these objects reference others.
- `backend.Tests/Program.cs`: add or extend object indexing/reference tests.
- Run `POST /api/documents/main/objects/reindex` after deploying if existing production documents should get object rows for the new collection immediately.

Keep the `objectType` string stable once it ships. It becomes part of sync operations, conflict responses, object-index rows, and mutation history.

### Move or Rename an Existing Object Collection

Examples: move `map.regions` to `regions`, rename `factions` to `politicalGroups`.

Update everything from “Add a New Object Collection”, plus:

- `src/store.tsx`: normalize old and new shapes during migration so imported/production JSON still loads.
- `backend/Sync/DocumentObjectMutation.cs`: update `DocumentObjectCatalog` path.
- `src/sync/objectMutationPlanner.ts`: update the matching `OBJECT_ARRAY_PATHS` path.
- `backend/Sync/DocumentReferenceValidator.cs`: update `BuildIndex` and affected checks.
- `src/utils/merge.ts`: update merge paths.
- Production: deploy with compatibility normalization first, then reindex. Avoid shipping a version that can only read the new path if production still contains the old path.

Prefer keeping the same `objectType` if the conceptual object is the same. Change the `objectType` only when old rows should be treated as a different kind of object.

### Add or Change References Between Objects

Examples: `law.sponsorFactionId`, `region.ownerFactionId`, `node.connectionTransformId`.

Update:

- `backend/Sync/DocumentReferenceValidator.cs`: update document-specific reference rules.
  - `BuildIndex` should collect IDs for referenced object types.
  - Add or update the relevant `Check*References` method.
- `backend/Sync/JsonReferenceValidation.cs`: only if you need a new generic validation primitive. Do not put Parliament-specific paths here.
- `backend.Tests/Program.cs`: add a dangling-reference test for the new reference shape.
- UI deletion behavior: decide whether deletion should be blocked, cleaned up, or allowed only for historical/trash data.

Reference validation is what prevents object mutations from accepting writes that create dangling active references.

### Add Root-Level Shared State

Examples: add `economy`, `diplomacy`, or `worldSettings`.

Update:

- `src/models/types.ts`
- `src/store.tsx`
- `src/sync/useDocumentSync.ts`: add it to `useSharedStateSnapshot` dependencies.
- `src/utils/merge.ts`: add merge behavior.

Then choose:

- If it is a stable collection of objects with IDs, add it to the object catalogs so it can use object/path sync.
- If it is a small scalar/settings blob, snapshot fallback may be fine.

If root-level state is not represented in `OBJECT_ARRAY_PATHS`, the planner will fall back to full snapshot saves whenever that state changes.

### Change Object IDs

Avoid this if at all possible. Object IDs are the sync identity.

If an ID must change:

- Treat it as creating a new object and deleting/restoring the old object.
- Update all references in the same user action, or the backend validator may reject the mutation.
- Do not use path mutation to edit an `id`; both frontend and backend reject ID path changes.

## File Map

- `src/models/types.ts`: frontend domain types.
- `src/store.tsx`: defaults, import/load normalization, local persistence.
- `src/utils/merge.ts`: frontend 3-way merge rules for local vs remote edits.
- `src/sync/useDocumentSync.ts`: hosted/local sync hook, SSE handling, save queue, snapshot dependency list.
- `src/sync/objectMutationPlanner.ts`: frontend object path catalog, diff-to-operation planner, local application of incoming object mutation events.
- `backend/Sync/DocumentObjectMutation.cs`: backend object path catalog and mutation application.
- `backend/Sync/DocumentObjectIndexer.cs`: backend extraction of object rows from the canonical document JSON.
- `backend/Sync/DocumentReferenceValidator.cs`: Parliament-specific reference rules.
- `backend/Sync/JsonReferenceValidation.cs`: generic JSON reference helper primitives.
- `backend/Sync/SyncDocumentStore.cs`: object conflict detection, validation, snapshot/object writes.
- `backend/Program.cs`: HTTP endpoints, startup compatibility SQL, reindex endpoint.
- `backend.Tests/Program.cs`: dependency-light backend regression coverage.
- `docs/sync-object-store-plan.md`: implementation status and remaining work.

## Checklist Before Merging a Shape Change

- The old saved JSON still normalizes correctly.
- New shared state is included in `useSharedStateSnapshot`.
- New object collections are listed in both frontend and backend object catalogs.
- New reference paths are covered by `DocumentReferenceValidator`.
- Delete/restore behavior is intentional for active, history, and trash data.
- Object IDs stay stable and are not edited by path ops.
- Backend regression tests cover new object or reference behavior when relevant.
- `npm run lint`
- `npm run build`
- `dotnet build backend/ParliamentApi.csproj`
- `dotnet run --project backend.Tests/ParliamentApi.Tests.csproj`
- For production data, run `POST /api/documents/main/objects/reindex` after deploy when object paths changed.

## Production Migration Notes

- Keep compatibility normalization in `src/store.tsx` long enough for old imports and old server snapshots to load.
- The backend stores the canonical document JSON in `sync_documents`; object rows can be rebuilt from it.
- `sync_document_objects` is a derived index during the current migration phase.
- Use the admin reindex endpoint after deploying object path/catalog changes.
- If a change cannot be normalized safely, plan an explicit migration before deploying to a production server.
