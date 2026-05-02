import { uid } from '../../store';
import type { SchemaChild, SchemaSection, SchemaPrimitive } from './types';

export function newSection(): SchemaSection {
  return { kind: 'section', id: uid('sec'), name: 'section', children: [] };
}

export function newPrimitive(): SchemaPrimitive {
  return { kind: 'primitive', id: uid('prim'), name: 'value', valueType: 'number', computed: false };
}

export function addChild(children: SchemaChild[], child: SchemaChild): SchemaChild[] {
  return [...children, child];
}

export function removeChild(children: SchemaChild[], id: string): SchemaChild[] {
  return children.filter(c => c.id !== id);
}

export function updateChild(children: SchemaChild[], updated: SchemaChild): SchemaChild[] {
  return children.map(c => c.id === updated.id ? updated : c);
}

export function moveChild(children: SchemaChild[], id: string, dir: -1 | 1): SchemaChild[] {
  const idx = children.findIndex(c => c.id === id);
  if (idx < 0) return children;
  const target = idx + dir;
  if (target < 0 || target >= children.length) return children;
  const next = [...children];
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}
