import type { AppState, NodeGraph } from '../models/types';

type Rec = Record<string, unknown>;
type Identified = { id: string };

function hasId(value: unknown): value is Identified {
  return !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string';
}

function isIdArray(value: unknown): value is Identified[] {
  return Array.isArray(value) && value.every(hasId);
}

// One level of field-by-field merge for plain objects (e.g. faction.support, law.factionStances).
// Returns remote as base, overrides any field that only the local side changed.
function mergeRecord(base: Rec, local: Rec, remote: Rec): Rec {
  const result: Rec = { ...remote };
  for (const key of Object.keys(local)) {
    const lChanged = JSON.stringify(local[key]) !== JSON.stringify(base[key]);
    const rChanged = JSON.stringify(remote[key]) !== JSON.stringify(base[key]);
    if (lChanged && !rChanged) result[key] = local[key];
    // both changed → remote wins; only remote changed → already in result
  }
  return result;
}

// Entity-level 3-way merge for any typed object.
// Fields changed only by local   → local wins
// Fields changed only by remote  → remote wins
// Fields changed by both         → for plain-object sub-fields (Record types like `support`,
//                                   `factionStances`) we recurse one level; otherwise remote wins
function mergeEntity<T extends Rec>(base: T, local: T, remote: T): T {
  const result: Rec = { ...remote };
  for (const key of Object.keys(local)) {
    const b = base[key]; const l = local[key]; const r = remote[key];
    const lChanged = JSON.stringify(l) !== JSON.stringify(b);
    const rChanged = JSON.stringify(r) !== JSON.stringify(b);
    if (lChanged && !rChanged) {
      result[key] = l;
    } else if (lChanged && rChanged) {
      // Both changed: merge nested id arrays such as schema children/ports,
      // otherwise recurse into plain-object sub-fields (e.g. support, factionStances).
      if (isIdArray(l) && isIdArray(r) && (Array.isArray(b) || b === undefined)) {
        result[key] = mergeById(
          (Array.isArray(b) ? b.filter(hasId) : []),
          l,
          r,
        );
      } else if (l && r && b && typeof l === 'object' && !Array.isArray(l)) {
        result[key] = mergeRecord(b as Rec, l as Rec, r as Rec);
      }
      // else: remote wins (already in result)
    }
  }
  return result as T;
}

function byId<T extends { id: string }>(arr: T[]): Map<string, T> {
  return new Map(arr.map(x => [x.id, x]));
}

// Array merge by id.
// Item added only on remote              → keep
// Item deleted locally but kept remotely → skip (local deletion wins)
// Item added only locally                → keep
// Item in both                           → mergeEntity
function mergeById<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
  const bMap = byId(base); const lMap = byId(local); const rMap = byId(remote);
  const result: T[] = [];
  const seen = new Set<string>();

  for (const [id, r] of rMap) {
    seen.add(id);
    const b = bMap.get(id); const l = lMap.get(id);
    if (!l) {
      if (b) continue;                         // deleted locally
      result.push(r);                          // new on remote
      continue;
    }
    if (!b) { result.push(r); continue; }      // new on both sides; remote wins on id collision
    result.push(mergeEntity(b as Rec, l as Rec, r as Rec) as T);
  }

  // Locally-added items that haven't reached the server yet
  for (const [id, l] of lMap) {
    if (!seen.has(id) && !bMap.has(id)) result.push(l);
  }

  return result;
}

function mergeGraph(base: NodeGraph | undefined, local: NodeGraph | undefined, remote: NodeGraph | undefined): NodeGraph {
  const empty: NodeGraph = { nodes: [], connections: [] };
  const b = base ?? empty;
  const l = local ?? empty;
  const r = remote ?? empty;
  const nodes = mergeById(b.nodes, l.nodes, r.nodes);
  const nodeIds = new Set(nodes.map(node => node.id));
  const connections = mergeById(b.connections, l.connections, r.connections)
    .filter(connection => nodeIds.has(connection.from.nodeId) && nodeIds.has(connection.to.nodeId));

  return { nodes, connections };
}

// Strip ui before sending to the server — ui state is per-client and should not be shared.
export function stripUi(state: AppState): Omit<AppState, 'ui'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ui: _ui, ...rest } = state;
  return rest;
}

// 3-way merge: local changes win over remote unless both sides changed the same leaf.
// ui is always taken from local (never from the server).
export function mergeAppState(base: AppState, local: AppState, remote: AppState): AppState {
  const sc = (l: unknown, b: unknown, r: unknown) =>
    JSON.stringify(l) !== JSON.stringify(b) ? l : r;

  return {
    schemaVersion: remote.schemaVersion,
    totalSeats:    sc(local.totalSeats,    base.totalSeats,    remote.totalSeats)    as number,
    unalignedMode: sc(local.unalignedMode, base.unalignedMode, remote.unalignedMode) as boolean,
    strata:     mergeById(base.strata,     local.strata,     remote.strata),
    factions:   mergeById(base.factions,   local.factions,   remote.factions),
    alliances:  mergeById(base.alliances,  local.alliances,  remote.alliances),
    laws:       mergeById(base.laws,       local.laws,       remote.laws),
    lawHistory: mergeById(base.lawHistory, local.lawHistory, remote.lawHistory),
    history:    mergeById(base.history,    local.history,    remote.history),
    trash: {
      strata:    mergeById(base.trash.strata,    local.trash.strata,    remote.trash.strata),
      factions:  mergeById(base.trash.factions,  local.trash.factions,  remote.trash.factions),
      alliances: mergeById(base.trash.alliances, local.trash.alliances, remote.trash.alliances),
    },
    map: { regions: mergeById(base.map.regions, local.map.regions, remote.map.regions) },
    nodes: {
      types: mergeById(
        base.nodes?.types  ?? [],
        local.nodes?.types ?? [],
        remote.nodes?.types ?? [],
      ),
      graph: mergeGraph(base.nodes?.graph, local.nodes?.graph, remote.nodes?.graph),
      transforms: mergeById(
        base.nodes?.transforms ?? [],
        local.nodes?.transforms ?? [],
        remote.nodes?.transforms ?? [],
      ),
    },
    senate: {
      autoAssign:    sc(local.senate?.autoAssign,    base.senate?.autoAssign,    remote.senate?.autoAssign)    as boolean,
      strataAssign:  sc(local.senate?.strataAssign,  base.senate?.strataAssign,  remote.senate?.strataAssign)  as boolean,
      factionSeats: mergeRecord(
        (base.senate?.factionSeats  ?? {}) as Rec,
        (local.senate?.factionSeats ?? {}) as Rec,
        (remote.senate?.factionSeats ?? {}) as Rec,
      ) as Record<string, number>,
      history: mergeById(
        base.senate?.history  ?? [],
        local.senate?.history ?? [],
        remote.senate?.history ?? [],
      ),
    },
    ui: local.ui,
  };
}
