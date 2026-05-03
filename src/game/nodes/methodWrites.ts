import type { EntityType, TypeMethodDefinition } from './types';

const PROP_ASSIGNMENT_PATTERN = /(?:^|[^\w$.])((?:scope\.)?props|target\.props)((?:\.[A-Za-z_$][\w$]*)+)\s*(?:\*\*|[-+*/%&|^])?=(?!=|>)/g;

export function collectPropWritePaths(expression: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const match of expression.matchAll(PROP_ASSIGNMENT_PATTERN)) {
    const path = normalizePropWritePath(match[2]);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }

  return paths;
}

export function methodAssignedPropPaths(method: TypeMethodDefinition): string[] {
  return collectPropWritePaths(method.expression);
}

export function typeAssignedPropPaths(type: EntityType): Set<string> {
  const paths = new Set<string>();

  for (const method of type.methods ?? []) {
    for (const path of methodAssignedPropPaths(method)) {
      paths.add(path);
    }
  }

  return paths;
}

export function isMethodAssignedPropPath(type: EntityType, schemaPath: string): boolean {
  return typeAssignedPropPaths(type).has(schemaPathToPropPath(schemaPath));
}

export function methodsAssigningProp(type: EntityType, schemaPathOrPropPath: string): TypeMethodDefinition[] {
  const propPath = schemaPathToPropPath(schemaPathOrPropPath);
  return (type.methods ?? []).filter(method => methodAssignedPropPaths(method).includes(propPath));
}

export function schemaPathToPropPath(path: string): string {
  return path.replace(/^props\./, '');
}

function normalizePropWritePath(dottedPath: string): string {
  return dottedPath.split('.').filter(Boolean).join('.');
}
