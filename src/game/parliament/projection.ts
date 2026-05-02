import type { AppState, Faction, ProjectionEntry, ProjectionResult, Stratum } from '../../models/types';

export const UNALIGNED_FACTION_ID = '__unaligned__';
export const UNALIGNED_COLOR = '#6b7e9e';

export interface PoliticalPowerModel {
  id: string;
  factionPower(state: AppState, faction: Faction): number;
  unalignedPower(state: AppState): number;
}

export interface SeatAllocator {
  id: string;
  allocate(entries: ProjectionEntry[], totalSeats: number): number[];
}

export interface ParliamentSystemConfig {
  powerModel?: PoliticalPowerModel;
  seatAllocator?: SeatAllocator;
}

export class StrataSupportPowerModel implements PoliticalPowerModel {
  readonly id = 'strata-support-power';

  factionPower(state: AppState, faction: Faction): number {
    let power = 0;
    for (const stratum of state.strata) {
      power += (faction.support[stratum.id] || 0) * stratum.power;
    }
    return power;
  }

  unalignedPower(state: AppState): number {
    if (!state.unalignedMode) return 0;

    let power = 0;
    for (const stratum of state.strata) {
      const assignedSupport = stratumTotalSupport(state, stratum);
      const unassignedPopulation = Math.max(0, stratum.population - assignedSupport);
      power += unassignedPopulation * stratum.power;
    }
    return power;
  }
}

export class LargestRemainderSeatAllocator implements SeatAllocator {
  readonly id = 'largest-remainder';

  allocate(entries: ProjectionEntry[], totalSeats: number): number[] {
    const totalPower = entries.reduce((sum, entry) => sum + entry.power, 0);
    if (totalPower <= 0 || totalSeats <= 0) return entries.map(() => 0);

    const exactSeats = entries.map(entry => entry.power / totalPower * totalSeats);
    const seatCounts = exactSeats.map(Math.floor);
    let remaining = totalSeats - seatCounts.reduce((sum, seats) => sum + seats, 0);
    const remainderOrder = exactSeats
      .map((exact, i) => ({ remainder: exact - seatCounts[i], i }))
      .sort((a, b) => b.remainder - a.remainder);

    for (let k = 0; k < remaining && k < remainderOrder.length; k++) {
      seatCounts[remainderOrder[k].i]++;
    }

    return seatCounts;
  }
}

export class ParliamentSystem {
  private readonly powerModel: PoliticalPowerModel;
  private readonly seatAllocator: SeatAllocator;

  constructor(config: ParliamentSystemConfig = {}) {
    this.powerModel = config.powerModel ?? new StrataSupportPowerModel();
    this.seatAllocator = config.seatAllocator ?? new LargestRemainderSeatAllocator();
  }

  project(state: AppState): ProjectionResult {
    const entries = this.buildEntries(state);
    const total = entries.reduce((sum, entry) => sum + entry.power, 0);
    const seats = this.seatAllocator.allocate(entries, state.totalSeats);

    const finalEntries = entries.map((entry, i) => ({
      ...entry,
      seats: seats[i],
      share: total > 0 ? entry.power / total : 0
    }));

    return {
      entries: sortProjectionEntries(finalEntries, state),
      total
    };
  }

  private buildEntries(state: AppState): ProjectionEntry[] {
    const entries: ProjectionEntry[] = state.factions.map(faction => {
      const alliance = state.alliances?.find(a => a.factionIds.includes(faction.id));
      return {
        faction,
        alliance,
        power: this.powerModel.factionPower(state, faction),
        seats: 0,
        share: 0
      };
    });

    const unalignedPower = this.powerModel.unalignedPower(state);
    if (state.unalignedMode && unalignedPower > 0) {
      entries.push({
        faction: { id: UNALIGNED_FACTION_ID, name: 'Unaligned', color: UNALIGNED_COLOR },
        power: unalignedPower,
        isUnaligned: true,
        seats: 0,
        share: 0
      });
    }

    return entries;
  }
}

export const defaultParliamentSystem = new ParliamentSystem();

export function factionPower(state: AppState, faction: Faction): number {
  return new StrataSupportPowerModel().factionPower(state, faction);
}

export function stratumTotalSupport(state: AppState, stratum: Stratum): number {
  return state.factions.reduce((sum, faction) => sum + (faction.support[stratum.id] || 0), 0);
}

export function computeProjection(
  state: AppState,
  parliament: ParliamentSystem = defaultParliamentSystem
): ProjectionResult {
  return parliament.project(state);
}

function sortProjectionEntries(entries: ProjectionEntry[], state: AppState): ProjectionEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isUnaligned) return 1;
    if (b.isUnaligned) return -1;

    return projectionOrder(a, state) - projectionOrder(b, state);
  });
}

function projectionOrder(entry: ProjectionEntry, state: AppState): number {
  if (entry.alliance) {
    const allianceIndex = state.alliances.findIndex(alliance => alliance.id === entry.alliance!.id);
    const factionIndex = entry.alliance.factionIds.indexOf(entry.faction.id);
    return allianceIndex * 1000 + (factionIndex >= 0 ? factionIndex : 999);
  }

  const factionIndex = state.factions.findIndex(faction => faction.id === entry.faction.id);
  return 1000000 + factionIndex;
}
