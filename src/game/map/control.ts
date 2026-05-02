import type { Alliance, Faction, MapRegion } from '../../models/types';
import type { ControlEntry, ViewMode } from './types';

export interface ControlMember {
  faction: Faction;
  pct: number;
}

export interface AllianceControlGroup {
  alliance: Alliance | null;
  members: ControlMember[];
}

export interface MapLegendItem {
  id: string;
  name: string;
  color: string;
  full: number;
  partial: number;
}

export function getControlEntries(
  region: MapRegion,
  factions: Faction[],
  alliances: Alliance[],
  mode: ViewMode
): ControlEntry[] {
  if (mode === 'plain') return [];
  if (mode === 'faction') return getFactionControlEntries(region, factions);
  return getAllianceControlEntries(region, factions, alliances);
}

export function getFactionControlEntries(region: MapRegion, factions: Faction[]): ControlEntry[] {
  return region.factionControl
    .filter(control => control.percentage > 0)
    .flatMap(control => {
      const faction = factions.find(candidate => candidate.id === control.factionId);
      return faction
        ? [{ id: faction.id, color: faction.color, label: faction.name, pct: control.percentage }]
        : [];
    });
}

export function getAllianceControlEntries(
  region: MapRegion,
  factions: Faction[],
  alliances: Alliance[]
): ControlEntry[] {
  const entries = new Map<string, ControlEntry>();

  for (const control of region.factionControl) {
    if (control.percentage <= 0) continue;

    const faction = factions.find(candidate => candidate.id === control.factionId);
    if (!faction) continue;

    const alliance = alliances.find(candidate => candidate.factionIds.includes(faction.id));
    const key = alliance ? alliance.id : faction.id;
    const existing = entries.get(key);

    if (existing) {
      entries.set(key, { ...existing, pct: existing.pct + control.percentage });
    } else {
      entries.set(key, {
        id: key,
        color: alliance ? alliance.color : faction.color,
        label: alliance ? alliance.name : faction.name,
        pct: control.percentage,
      });
    }
  }

  return Array.from(entries.values());
}

export function getRegionPatternId(regionId: string, mode: string): string {
  return `pat_${regionId.replace(/[^a-z0-9]/gi, '_')}_${mode}`;
}

export function getRegionFill(
  region: MapRegion,
  factions: Faction[],
  alliances: Alliance[],
  mode: ViewMode
): string {
  if (mode === 'plain') return 'none';

  const entries = getControlEntries(region, factions, alliances, mode);
  if (!entries.length) return 'none';
  if (entries.length === 1) return entries[0].color;
  return `url(#${getRegionPatternId(region.id, mode)})`;
}

export function getMapLegendItems(
  regions: MapRegion[],
  factions: Faction[],
  alliances: Alliance[],
  viewMode: ViewMode
): MapLegendItem[] {
  if (viewMode === 'plain') return [];

  const legendMap = new Map<string, MapLegendItem>();

  if (viewMode === 'faction') {
    for (const faction of factions) {
      legendMap.set(faction.id, {
        id: faction.id,
        name: faction.name,
        color: faction.color,
        full: 0,
        partial: 0,
      });
    }
  } else {
    for (const alliance of alliances) {
      legendMap.set(alliance.id, {
        id: alliance.id,
        name: alliance.name,
        color: alliance.color,
        full: 0,
        partial: 0,
      });
    }

    for (const faction of factions) {
      if (!alliances.some(alliance => alliance.factionIds.includes(faction.id))) {
        legendMap.set(faction.id, {
          id: faction.id,
          name: faction.name,
          color: faction.color,
          full: 0,
          partial: 0,
        });
      }
    }
  }

  for (const region of regions) {
    const entries = getControlEntries(region, factions, alliances, viewMode);
    if (entries.length === 1) {
      const item = legendMap.get(entries[0].id);
      if (item) item.full += 1;
    } else if (entries.length > 1) {
      for (const entry of entries) {
        const item = legendMap.get(entry.id);
        if (item) item.partial += 1;
      }
    }
  }

  return Array.from(legendMap.values())
    .filter(item => item.full > 0 || item.partial > 0)
    .sort((a, b) => b.full + b.partial - (a.full + a.partial));
}

export function getAllianceControlGroups(
  region: MapRegion,
  factions: Faction[],
  alliances: Alliance[]
): AllianceControlGroup[] {
  const groups: AllianceControlGroup[] = [];
  const usedIds = new Set<string>();

  for (const alliance of alliances) {
    const members: ControlMember[] = [];
    for (const factionId of alliance.factionIds) {
      const faction = factions.find(candidate => candidate.id === factionId);
      if (!faction) continue;

      const control = region.factionControl.find(candidate => candidate.factionId === factionId);
      members.push({ faction, pct: control?.percentage ?? 0 });
      usedIds.add(factionId);
    }

    if (members.length) groups.push({ alliance, members });
  }

  const unallied: ControlMember[] = [];
  for (const faction of factions) {
    if (usedIds.has(faction.id)) continue;

    const control = region.factionControl.find(candidate => candidate.factionId === faction.id);
    unallied.push({ faction, pct: control?.percentage ?? 0 });
  }

  if (unallied.length) groups.push({ alliance: null, members: unallied });
  return groups;
}

export function getRegionControlTotal(region: MapRegion): number {
  return region.factionControl.reduce((sum, control) => sum + control.percentage, 0);
}

export function setRegionFactionControl(region: MapRegion, factionId: string, percentage: number): MapRegion {
  const factionControl = [...region.factionControl];
  const index = factionControl.findIndex(control => control.factionId === factionId);

  if (index >= 0) {
    factionControl[index] = { ...factionControl[index], percentage };
  } else {
    factionControl.push({ factionId, percentage });
  }

  return { ...region, factionControl };
}

export function shouldShowAlliancePie(factionPie: ControlEntry[], alliancePie: ControlEntry[]): boolean {
  return alliancePie.length > 1 || (alliancePie.length === 1 && alliancePie[0].id !== factionPie[0]?.id);
}
