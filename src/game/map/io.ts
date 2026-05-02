import type { FactionControlEntry, MapRegion, MapVertex } from '../../models/types';

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
