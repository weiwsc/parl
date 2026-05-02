import type { AppState, ProjectionEntry, ProjectionResult } from '../../models/types';
import { computeStrataSeats } from './strataAssign';

export interface SenateProjection {
  projection: ProjectionResult;
  autoSeats: Record<string, number>;
  totalSeats: number;
  assignedSeats: number;
}

export function computeSenateProjection(state: AppState): SenateProjection {
  const { factions, alliances, strata, map: { regions }, senate } = state;

  const totalSeats = regions.reduce((s, r) => s + (r.seatings || 0), 0);

  // Auto-assign seats from 100%-controlled regions
  const autoSeats: Record<string, number> = {};
  if (senate.autoAssign) {
    for (const region of regions) {
      const seats = region.seatings || 0;
      if (seats === 0) continue;
      const dominant = region.factionControl.find(c => c.percentage >= 99.5);
      if (dominant && dominant.percentage >= 99.5) {
        autoSeats[dominant.factionId] = (autoSeats[dominant.factionId] || 0) + seats;
      }
    }
  }

  // Strata-assign seats for regions with no faction control
  if (senate.strataAssign) {
    for (const region of regions) {
      const regionSeats = computeStrataSeats(region, factions, strata);
      for (const [fid, seats] of Object.entries(regionSeats)) {
        autoSeats[fid] = (autoSeats[fid] || 0) + seats;
      }
    }
  }

  const entries: ProjectionEntry[] = factions.map(f => {
    const auto = autoSeats[f.id] || 0;
    const manual = senate.factionSeats[f.id] || 0;
    const seats = auto + manual;
    const alliance = alliances.find(a => a.factionIds.includes(f.id));
    return {
      faction: { id: f.id, name: f.name, color: f.color },
      alliance,
      power: seats,
      seats,
      share: totalSeats > 0 ? seats / totalSeats : 0,
    };
  });

  // Sort consistent with how ProjectionChart expects: alliances grouped, by seats
  const sorted = [...entries].sort((a, b) => {
    const aGroup = a.alliance?.id ?? a.faction.id;
    const bGroup = b.alliance?.id ?? b.faction.id;
    if (aGroup !== bGroup) {
      const aSeats = entries.filter(e => (e.alliance?.id ?? e.faction.id) === aGroup).reduce((s, e) => s + e.seats, 0);
      const bSeats = entries.filter(e => (e.alliance?.id ?? e.faction.id) === bGroup).reduce((s, e) => s + e.seats, 0);
      return bSeats - aSeats;
    }
    return b.seats - a.seats;
  });

  const assignedSeats = sorted.reduce((s, e) => s + e.seats, 0);

  return {
    projection: {
      entries: sorted,
      total: totalSeats,
      totalSeats,
      factionsCount: factions.length,
      timestamp: Date.now(),
    },
    autoSeats,
    totalSeats,
    assignedSeats,
  };
}
