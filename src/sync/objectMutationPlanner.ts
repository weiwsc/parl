import type { AppState } from '../models/types';
import { normalizeState } from '../store';
import { stripUi } from '../utils/merge';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = { [key: string]: JsonValue };

type ObjectArrayPath = {
  objectType: string;
  path: string[];
};

export type ObjectRevisionMap = Map<string, number>;

export type DocumentObjectSummary = {
  objectType: string;
  objectId: string;
  revision: number;
};

export type MutatedDocumentObject = {
  objectType: string;
  objectId: string;
  revision: number;
  deleted: boolean;
};

export type ObjectMutationOperation = {
  type: 'set' | 'unset' | 'insert' | 'remove' | 'replaceObject' | 'deleteObject' | 'restoreObject';
  objectType: string;
  objectId: string;
  path?: string[];
  value?: JsonValue;
  index?: number;
  baseObjectRevision?: number;
};

export type ObjectMutationPlan =
  | { kind: 'object'; operations: ObjectMutationOperation[] }
  | { kind: 'snapshot'; reason: string };

const OBJECT_ARRAY_PATHS: ObjectArrayPath[] = [
  { objectType: 'stratum', path: ['strata'] },
  { objectType: 'faction', path: ['factions'] },
  { objectType: 'alliance', path: ['alliances'] },
  { objectType: 'law', path: ['laws'] },
  { objectType: 'lawHistory', path: ['lawHistory'] },
  { objectType: 'event', path: ['events'] },
  { objectType: 'eventIssue', path: ['eventSettings', 'issues'] },
  { objectType: 'electionHistory', path: ['history'] },
  { objectType: 'region', path: ['map', 'regions'] },
  { objectType: 'nodeType', path: ['nodes', 'types'] },
  { objectType: 'nodeGraphNode', path: ['nodes', 'graph', 'nodes'] },
  { objectType: 'nodeGraphConnection', path: ['nodes', 'graph', 'connections'] },
  { objectType: 'nodeTransform', path: ['nodes', 'transforms'] },
  { objectType: 'senateHistory', path: ['senate', 'history'] },
  { objectType: 'trashStratum', path: ['trash', 'strata'] },
  { objectType: 'trashFaction', path: ['trash', 'factions'] },
  { objectType: 'trashAlliance', path: ['trash', 'alliances'] },
  { objectType: 'trashRegion', path: ['trash', 'regions'] },
  { objectType: 'trashElection', path: ['trash', 'elections'] },
];

const MAX_OBJECT_OPERATIONS = 160;
const MAX_FIELD_OPERATIONS_PER_OBJECT = 36;

export function objectRevisionKey(objectType: string, objectId: string): string {
  return `${objectType}\u001f${objectId}`;
}

export function createObjectRevisionMap(rows: readonly DocumentObjectSummary[]): ObjectRevisionMap {
  const revisions: ObjectRevisionMap = new Map();
  for (const row of rows) {
    if (Number.isFinite(row.revision)) {
      revisions.set(objectRevisionKey(row.objectType, row.objectId), row.revision);
    }
  }
  return revisions;
}

export function applyChangedObjectRevisions(
  revisions: ObjectRevisionMap,
  changedObjects: readonly MutatedDocumentObject[],
): ObjectRevisionMap {
  const next = new Map(revisions);
  for (const object of changedObjects) {
    if (Number.isFinite(object.revision)) {
      next.set(objectRevisionKey(object.objectType, object.objectId), object.revision);
    }
  }
  return next;
}

export function planObjectMutationSave(
  baseState: AppState,
  currentState: AppState,
  objectRevisions: ObjectRevisionMap,
): ObjectMutationPlan {
  const base = toJsonRecord(stripUi(baseState));
  const current = toJsonRecord(stripUi(currentState));

  if (!jsonEqual(withoutIndexedObjects(base), withoutIndexedObjects(current))) {
    return { kind: 'snapshot', reason: 'State contains root-level changes outside indexed objects.' };
  }

  const operations: ObjectMutationOperation[] = [];

  for (const arrayPath of OBJECT_ARRAY_PATHS) {
    const baseObjects = mapObjectsById(readObjectArray(base, arrayPath.path));
    const currentObjects = mapObjectsById(readObjectArray(current, arrayPath.path));

    for (const [objectId, baseObject] of baseObjects) {
      const currentObject = currentObjects.get(objectId);
      const baseObjectRevision = objectRevisions.get(objectRevisionKey(arrayPath.objectType, objectId));

      if (baseObjectRevision === undefined) {
        return { kind: 'snapshot', reason: `Missing object revision for ${arrayPath.objectType} "${objectId}".` };
      }

      if (!currentObject) {
        operations.push({
          type: 'deleteObject',
          objectType: arrayPath.objectType,
          objectId,
          baseObjectRevision,
        });
        continue;
      }

      if (jsonEqual(baseObject, currentObject)) continue;

      const fieldOperations: ObjectMutationOperation[] = [];
      diffObjectValue(baseObject, currentObject, [], fieldOperations, arrayPath.objectType, objectId, baseObjectRevision);

      if (fieldOperations.length > MAX_FIELD_OPERATIONS_PER_OBJECT) {
        operations.push({
          type: 'replaceObject',
          objectType: arrayPath.objectType,
          objectId,
          value: currentObject,
          baseObjectRevision,
        });
      } else {
        operations.push(...fieldOperations);
      }
    }

    for (const [objectId, currentObject] of currentObjects) {
      if (baseObjects.has(objectId)) continue;
      operations.push({
        type: 'restoreObject',
        objectType: arrayPath.objectType,
        objectId,
        value: currentObject,
        baseObjectRevision: 0,
      });
    }

    if (operations.length > MAX_OBJECT_OPERATIONS) {
      return { kind: 'snapshot', reason: 'Too many object mutations for one save batch.' };
    }
  }

  return { kind: 'object', operations };
}

export function applyObjectMutationOperations(
  state: AppState,
  operations: readonly ObjectMutationOperation[],
): AppState | null {
  const document = toJsonRecord(stripUi(state));
  for (const operation of operations) {
    if (!applyObjectMutationOperation(document, operation)) {
      return null;
    }
  }

  return normalizeState({ ...document, ui: state.ui });
}

function applyObjectMutationOperation(document: JsonRecord, operation: ObjectMutationOperation): boolean {
  const arrayPath = OBJECT_ARRAY_PATHS.find(item => item.objectType === operation.objectType);
  if (!arrayPath || !operation.objectId) return false;

  switch (operation.type) {
    case 'set':
      return applySet(document, arrayPath.path, operation);
    case 'unset':
      return applyUnset(document, arrayPath.path, operation);
    case 'insert':
      return applyInsert(document, arrayPath.path, operation);
    case 'remove':
      return applyRemove(document, arrayPath.path, operation);
    case 'replaceObject':
      return applyReplaceObject(document, arrayPath.path, operation);
    case 'deleteObject':
      return applyDeleteObject(document, arrayPath.path, operation);
    case 'restoreObject':
      return applyRestoreObject(document, arrayPath.path, operation);
    default:
      return false;
  }
}

function applySet(document: JsonRecord, arrayPath: string[], operation: ObjectMutationOperation): boolean {
  if (!operation.path?.length || operation.path[0] === 'id' || operation.value === undefined) return false;
  const target = findActiveObject(document, arrayPath, operation.objectId);
  return !!target && setAtPath(target, operation.path, cloneJson(operation.value));
}

function applyUnset(document: JsonRecord, arrayPath: string[], operation: ObjectMutationOperation): boolean {
  if (!operation.path?.length || operation.path[0] === 'id') return false;
  const target = findActiveObject(document, arrayPath, operation.objectId);
  return !!target && unsetAtPath(target, operation.path);
}

function applyInsert(document: JsonRecord, arrayPath: string[], operation: ObjectMutationOperation): boolean {
  if (!operation.path?.length || operation.path[0] === 'id' || operation.value === undefined) return false;
  const target = findActiveObject(document, arrayPath, operation.objectId);
  if (!target) return false;
  const array = resolvePath(target, operation.path);
  if (!Array.isArray(array)) return false;
  const index = operation.index ?? array.length;
  if (index < 0 || index > array.length) return false;
  array.splice(index, 0, cloneJson(operation.value));
  return true;
}

function applyRemove(document: JsonRecord, arrayPath: string[], operation: ObjectMutationOperation): boolean {
  if (!operation.path?.length || operation.path[0] === 'id') return false;
  const target = findActiveObject(document, arrayPath, operation.objectId);
  if (!target) return false;

  if (operation.index === undefined) {
    return unsetAtPath(target, operation.path);
  }

  const array = resolvePath(target, operation.path);
  if (!Array.isArray(array) || operation.index < 0 || operation.index >= array.length) return false;
  array.splice(operation.index, 1);
  return true;
}

function applyReplaceObject(document: JsonRecord, arrayPath: string[], operation: ObjectMutationOperation): boolean {
  if (!isJsonRecord(operation.value) || operation.value.id !== operation.objectId) return false;
  const array = readOrCreateJsonArray(document, arrayPath, false);
  if (!array) return false;
  const index = findObjectIndex(array, operation.objectId);
  if (index < 0) return false;
  array[index] = cloneJson(operation.value);
  return true;
}

function applyDeleteObject(document: JsonRecord, arrayPath: string[], operation: ObjectMutationOperation): boolean {
  const array = readOrCreateJsonArray(document, arrayPath, false);
  if (!array) return false;
  const index = findObjectIndex(array, operation.objectId);
  if (index < 0) return false;
  array.splice(index, 1);
  return true;
}

function applyRestoreObject(document: JsonRecord, arrayPath: string[], operation: ObjectMutationOperation): boolean {
  if (!isJsonRecord(operation.value) || operation.value.id !== operation.objectId) return false;
  const array = readOrCreateJsonArray(document, arrayPath, true);
  if (!array || findObjectIndex(array, operation.objectId) >= 0) return false;
  array.push(cloneJson(operation.value));
  return true;
}

function diffObjectValue(
  base: JsonValue | undefined,
  current: JsonValue | undefined,
  path: string[],
  operations: ObjectMutationOperation[],
  objectType: string,
  objectId: string,
  baseObjectRevision: number,
) {
  if (jsonEqual(base, current)) return;

  if (path.length === 1 && path[0] === 'id') return;

  if (isJsonRecord(base) && isJsonRecord(current) && !Array.isArray(base) && !Array.isArray(current)) {
    const keys = new Set([...Object.keys(base), ...Object.keys(current)]);
    for (const key of keys) {
      const hasCurrent = Object.prototype.hasOwnProperty.call(current, key);
      const hasBase = Object.prototype.hasOwnProperty.call(base, key);
      if (!hasCurrent && hasBase) {
        operations.push({
          type: 'unset',
          objectType,
          objectId,
          path: [...path, key],
          baseObjectRevision,
        });
        continue;
      }

      diffObjectValue(base[key], current[key], [...path, key], operations, objectType, objectId, baseObjectRevision);
    }
    return;
  }

  if (current === undefined) {
    operations.push({
      type: 'unset',
      objectType,
      objectId,
      path,
      baseObjectRevision,
    });
    return;
  }

  operations.push({
    type: 'set',
    objectType,
    objectId,
    path,
    value: current,
    baseObjectRevision,
  });
}

function withoutIndexedObjects(value: JsonRecord): JsonRecord {
  const clone = toJsonRecord(value);
  for (const item of OBJECT_ARRAY_PATHS) {
    setAtPathIfPresent(clone, item.path, []);
  }
  return clone;
}

function setAtPathIfPresent(root: JsonRecord, path: string[], value: JsonValue) {
  let current: JsonValue = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    if (!isJsonRecord(current)) return;
    const next = current[path[index]];
    if (!isJsonRecord(next)) return;
    current = next;
  }

  if (isJsonRecord(current)) {
    current[path[path.length - 1]] = value;
  }
}

function readObjectArray(root: JsonRecord, path: string[]): JsonRecord[] {
  let current: JsonValue = root;
  for (const segment of path) {
    if (!isJsonRecord(current)) return [];
    current = current[segment];
  }

  return Array.isArray(current) ? current.filter(hasStringId) : [];
}

function readOrCreateJsonArray(root: JsonRecord, path: string[], create: boolean): JsonValue[] | null {
  let current: JsonValue = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    if (!isJsonRecord(current)) return null;
    const segment = path[index];
    if (current[segment] === undefined && create) current[segment] = {};
    current = current[segment];
  }

  if (!isJsonRecord(current)) return null;
  const arrayName = path[path.length - 1];
  if (current[arrayName] === undefined && create) current[arrayName] = [];
  return Array.isArray(current[arrayName]) ? current[arrayName] : null;
}

function mapObjectsById(objects: JsonRecord[]): Map<string, JsonRecord> {
  return new Map(objects.map(object => [String(object.id), object]));
}

function findActiveObject(root: JsonRecord, path: string[], objectId: string): JsonRecord | null {
  const array = readOrCreateJsonArray(root, path, false);
  if (!array) return null;
  const found = array.find(item => isJsonRecord(item) && item.id === objectId);
  return isJsonRecord(found) ? found : null;
}

function findObjectIndex(array: JsonValue[], objectId: string): number {
  return array.findIndex(item => isJsonRecord(item) && item.id === objectId);
}

function setAtPath(root: JsonRecord, path: string[], value: JsonValue): boolean {
  const parent = resolveParent(root, path);
  if (!parent) return false;

  const [container, lastSegment] = parent;
  if (isJsonRecord(container)) {
    container[lastSegment] = value;
    return true;
  }

  if (Array.isArray(container)) {
    const index = parseArrayIndex(lastSegment, container.length);
    if (index === null) return false;
    container[index] = value;
    return true;
  }

  return false;
}

function unsetAtPath(root: JsonRecord, path: string[]): boolean {
  const parent = resolveParent(root, path);
  if (!parent) return false;

  const [container, lastSegment] = parent;
  if (isJsonRecord(container)) {
    delete container[lastSegment];
    return true;
  }

  if (Array.isArray(container)) {
    const index = parseArrayIndex(lastSegment, container.length);
    if (index === null) return false;
    container.splice(index, 1);
    return true;
  }

  return false;
}

function resolveParent(root: JsonRecord, path: string[]): [JsonValue, string] | null {
  if (path.length === 0) return null;
  const parent = path.length === 1 ? root : resolvePath(root, path.slice(0, -1));
  return parent === undefined ? null : [parent, path[path.length - 1]];
}

function resolvePath(root: JsonValue, path: string[]): JsonValue | undefined {
  let current: JsonValue | undefined = root;
  for (const segment of path) {
    if (isJsonRecord(current)) {
      current = current[segment];
      continue;
    }

    if (Array.isArray(current)) {
      const index = parseArrayIndex(segment, current.length);
      if (index === null) return undefined;
      current = current[index];
      continue;
    }

    return undefined;
  }

  return current;
}

function parseArrayIndex(segment: string, count: number): number | null {
  const index = Number.parseInt(segment, 10);
  return Number.isInteger(index) && index >= 0 && index < count ? index : null;
}

function hasStringId(value: JsonValue): value is JsonRecord & { id: string } {
  return isJsonRecord(value) && typeof value.id === 'string' && value.id.length > 0;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toJsonRecord(value: unknown): JsonRecord {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonRecord;
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
