import type { FactionControlEntry, MapRegion, MapVertex } from '../../models/types';
import { normalizeRandomnessModifier, normalizeSupportModifier } from '../parliament/modifiers';

export function serializeMapRegions(regions: MapRegion[]): string {
  return JSON.stringify({ regions }, null, 2);
}

export function normalizeImportedMapRegions(
  parsed: unknown,
  makeRegionId: () => string
): MapRegion[] | null {
  if (!isRecord(parsed) || !Array.isArray(parsed.regions)) return null;

  return parsed.regions
    .filter(isRecord)
    .map(region => ({
      id: readString(region.id) || makeRegionId(),
      name: readString(region.name) || 'Region',
      name2: readOptionalString(region.name2),
      description: readString(region.description),
      vertices: readVertices(region.vertices),
      factionControl: readFactionControl(region.factionControl),
      seatings: readFiniteNumber(region.seatings) ?? 0,
      strataWeights: isRecord(region.strataWeights) ? readNumberRecord(region.strataWeights) : {},
      population: readFiniteNumber(region.population) ?? 0,
      factionSupport: isRecord(region.factionSupport) ? readNestedNumberRecord(region.factionSupport) : {},
      electionModifiers: readRegionElectionModifiers(region.electionModifiers),
    }));
}

function readVertices(value: unknown): MapVertex[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .flatMap(vertex => {
      const x = readFiniteNumber(vertex.x);
      const y = readFiniteNumber(vertex.y);
      return x === null || y === null ? [] : [{ x, y }];
    });
}

function readFactionControl(value: unknown): FactionControlEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .flatMap(control => {
      const factionId = readString(control.factionId);
      const percentage = readFiniteNumber(control.percentage);
      return factionId && percentage !== null ? [{ factionId, percentage }] : [];
    });
}

function readNumberRecord(value: Record<string, unknown>): Record<string, number> {
  const record: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const numberValue = readFiniteNumber(raw);
    if (numberValue !== null) record[key] = numberValue;
  }
  return record;
}

function readNestedNumberRecord(value: Record<string, unknown>): Record<string, Record<string, number>> {
  const record: Record<string, Record<string, number>> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const nested = readNumberRecord(raw);
    if (Object.keys(nested).length > 0) record[key] = nested;
  }
  return record;
}

function readRegionElectionModifiers(value: unknown): MapRegion['electionModifiers'] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map(modifier => ({
      id: readString(modifier.id) || `rem_${Math.random().toString(36).slice(2, 9)}`,
      title: readString(modifier.title) || 'Election Modifier',
      description: readString(modifier.description),
      factionId: readString(modifier.factionId),
      stratumIds: Array.isArray(modifier.stratumIds)
        ? modifier.stratumIds.filter((id): id is string => typeof id === 'string')
        : [],
      effect: {
        support: normalizeSupportModifier(isRecord(modifier.effect) ? readFiniteNumber(modifier.effect.support) ?? 0 : 0),
        randomness: normalizeRandomnessModifier(isRecord(modifier.effect) ? readFiniteNumber(modifier.effect.randomness) ?? 0 : 0),
      },
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readOptionalString(value: unknown): string | undefined {
  const stringValue = readString(value);
  return stringValue || undefined;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
