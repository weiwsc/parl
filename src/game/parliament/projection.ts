import type { AppState, Faction, HistoryEntry, MapRegion, ProjectionEntry, ProjectionResult, Stratum } from '../../models/types';
import { normalizeSupportModifier } from './modifiers';

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

export interface ElectionProjectionOptions {
  randomize?: boolean;
  rng?: () => number;
  baseRandomness?: number;
}

export interface RegionElectionWeight {
  factionId: string;
  stratumId: string;
  directSupport: number;
  supportModifier: number;
  randomness: number;
  weight: number;
  distributedVote: number;
  totalVote: number;
}

export interface RegionElectionStratumBreakdown {
  stratumId: string;
  stratumName: string;
  population: number;
  assignedSupport: number;
  unalignedPopulation: number;
  weights: RegionElectionWeight[];
  votes: Record<string, number>;
}

export interface RegionElectionBreakdown {
  regionId: string;
  regionName: string;
  population: number;
  assignedSupport: number;
  unalignedPopulation: number;
  strata: RegionElectionStratumBreakdown[];
  votes: Record<string, number>;
}

export class StrataSupportPowerModel implements PoliticalPowerModel {
  readonly id = 'strata-support-power';

  factionPower(state: AppState, faction: Faction): number {
    const support = computeFactionStratumSupport(state);
    let power = 0;
    for (const stratum of state.strata) {
      power += (support[faction.id]?.[stratum.id] || 0) * stratum.power;
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
  const support = computeFactionStratumSupport(state);
  return state.factions.reduce((sum, faction) => sum + (support[faction.id]?.[stratum.id] || 0), 0);
}

export function getComputedFactionStratumSupport(state: AppState, factionId: string, stratumId: string): number {
  return computeFactionStratumSupport(state)[factionId]?.[stratumId] || 0;
}

export function computeFactionStratumSupport(state: AppState): Record<string, Record<string, number>> {
  const support = Object.fromEntries(
    state.factions.map(faction => [
      faction.id,
      Object.fromEntries(state.strata.map(stratum => [stratum.id, 0])),
    ])
  ) as Record<string, Record<string, number>>;

  for (const region of state.map?.regions ?? []) {
    for (const faction of state.factions) {
      for (const stratum of state.strata) {
        support[faction.id][stratum.id] += getRegionFactionStratumSupport(region, faction.id, stratum.id);
      }
    }
  }

  return support;
}

export function getParticipatingFactions(state: AppState): Faction[] {
  return state.factions.filter(faction => faction.participatesInElections === true);
}

export function hasRegionalElectionData(state: AppState): boolean {
  return (state.map?.regions ?? []).some(region => {
    if (finiteNumber(region.population, 0) > 0) return true;
    return Object.values(region.factionSupport ?? {})
      .some(byStratum => Object.values(byStratum ?? {}).some(value => finiteNumber(value, 0) > 0));
  });
}

export function computeRegionElectionBreakdowns(
  state: AppState,
  options: ElectionProjectionOptions = {}
): RegionElectionBreakdown[] {
  const participating = getParticipatingFactions(state);
  if (participating.length === 0) return [];

  const rng = options.rng ?? Math.random;
  const baseRandomness = Math.max(0, finiteNumber(options.baseRandomness, state.election?.baseRandomness ?? 10));

  return (state.map?.regions ?? []).map(region => {
    const population = Math.max(0, finiteNumber(region.population, 0));
    const votes: Record<string, number> = {};
    const strataBreakdowns: RegionElectionStratumBreakdown[] = [];

    for (const stratum of state.strata) {
      const stratumPopulation = regionStratumPopulation(region, stratum.id);
      const assignedSupport = state.factions.reduce(
        (sum, faction) => sum + getRegionFactionStratumSupport(region, faction.id, stratum.id),
        0
      );
      const unalignedPopulation = Math.max(0, stratumPopulation - assignedSupport);

      const weightRows = participating.map(faction => {
        const supportModifier =
          totalFactionGlobalSupportModifier(faction, stratum.id)
          + totalRegionSupportModifier(region, faction.id, stratum.id);
        const randomness = Math.max(
          0,
          baseRandomness
          + totalFactionGlobalRandomness(faction, stratum.id)
          + totalRegionRandomness(region, faction.id, stratum.id)
        );
        const directSupport = getRegionFactionStratumSupport(region, faction.id, stratum.id);
        const baseWeight = Math.max(0, 100 + supportModifier);
        const randomDelta = options.randomize && randomness > 0
          ? lerp(-randomness, randomness, rng())
          : 0;
        const randomFactor = Math.max(0, (100 + randomDelta) / 100);
        const weight = baseWeight * randomFactor;

        return {
          factionId: faction.id,
          stratumId: stratum.id,
          directSupport,
          supportModifier,
          randomness,
          weight,
          distributedVote: 0,
          totalVote: 0,
        };
      });

      const totalWeight = weightRows.reduce((sum, row) => sum + row.weight, 0);
      const stratumVotes: Record<string, number> = {};

      for (const row of weightRows) {
        row.distributedVote = totalWeight > 0 ? unalignedPopulation * (row.weight / totalWeight) : 0;
        row.totalVote = row.directSupport + row.distributedVote;
        stratumVotes[row.factionId] = row.totalVote;
        votes[row.factionId] = (votes[row.factionId] || 0) + row.totalVote;
      }

      strataBreakdowns.push({
        stratumId: stratum.id,
        stratumName: stratum.name,
        population: stratumPopulation,
        assignedSupport,
        unalignedPopulation,
        weights: weightRows,
        votes: stratumVotes,
      });
    }

    const assignedSupport = strataBreakdowns.reduce((sum, stratum) => sum + stratum.assignedSupport, 0);
    const unalignedPopulation = strataBreakdowns.reduce((sum, stratum) => sum + stratum.unalignedPopulation, 0);

    return {
      regionId: region.id,
      regionName: region.name,
      population,
      assignedSupport,
      unalignedPopulation,
      strata: strataBreakdowns,
      votes,
    };
  });
}

export function computeElectionProjection(
  state: AppState,
  options: ElectionProjectionOptions = {}
): ProjectionResult {
  if (!hasRegionalElectionData(state)) return defaultParliamentSystem.project(state);

  const participating = getParticipatingFactions(state);
  const regionBreakdowns = computeRegionElectionBreakdowns(state, options);
  const votesByFactionByStratum = Object.fromEntries(
    participating.map(faction => [
      faction.id,
      Object.fromEntries(state.strata.map(stratum => [stratum.id, 0])),
    ])
  ) as Record<string, Record<string, number>>;

  for (const breakdown of regionBreakdowns) {
    for (const stratumBreakdown of breakdown.strata) {
      for (const [factionId, votes] of Object.entries(stratumBreakdown.votes)) {
        if (!votesByFactionByStratum[factionId]) continue;
        votesByFactionByStratum[factionId][stratumBreakdown.stratumId] =
          (votesByFactionByStratum[factionId][stratumBreakdown.stratumId] || 0) + votes;
      }
    }
  }

  const entries: ProjectionEntry[] = participating.map(faction => {
    const alliance = state.alliances?.find(a => a.factionIds.includes(faction.id));
    const power = state.strata.reduce((sum, stratum) => {
      const votes = votesByFactionByStratum[faction.id]?.[stratum.id] || 0;
      return sum + votes * Math.max(0, finiteNumber(stratum.power, 0));
    }, 0);

    return {
      faction,
      alliance,
      power,
      seats: 0,
      share: 0,
    };
  });

  const total = entries.reduce((sum, entry) => sum + entry.power, 0);
  const seats = new LargestRemainderSeatAllocator().allocate(entries, state.totalSeats);
  const finalEntries = entries.map((entry, i) => ({
    ...entry,
    seats: seats[i],
    share: total > 0 ? entry.power / total : 0,
  }));

  return {
    entries: sortProjectionEntries(finalEntries, state),
    total,
  };
}

export function getLatestElectionEntry(state: AppState): HistoryEntry | null {
  return [...state.history]
    .filter(entry => !!entry.projection)
    .sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
}

export function getLatestElectionProjection(state: AppState): ProjectionResult | null {
  const latest = getLatestElectionEntry(state);
  if (!latest?.projection) return null;

  return {
    ...latest.projection,
    totalSeats: latest.projection.totalSeats ?? latest.totalSeats,
    unalignedMode: latest.projection.unalignedMode ?? latest.unalignedMode,
    strataCount: latest.projection.strataCount ?? latest.strata.length,
    factionsCount: latest.projection.factionsCount ?? latest.factions.length,
    timestamp: latest.projection.timestamp ?? latest.timestamp,
  };
}

export function getCurrentParliamentProjection(state: AppState): ProjectionResult {
  return getLatestElectionProjection(state) ?? {
    ...computeProjection(state),
    totalSeats: state.totalSeats,
    unalignedMode: state.unalignedMode,
    strataCount: state.strata.length,
    factionsCount: state.factions.length,
    timestamp: Date.now(),
  };
}

export function computeProjection(
  state: AppState,
  parliament?: ParliamentSystem
): ProjectionResult {
  if (parliament) return parliament.project(state);
  return computeElectionProjection(state);
}

function getRegionFactionStratumSupport(region: MapRegion, factionId: string, stratumId: string): number {
  return Math.max(0, finiteNumber(region.factionSupport?.[factionId]?.[stratumId], 0));
}

function regionStratumPopulation(region: MapRegion, stratumId: string): number {
  const population = Math.max(0, finiteNumber(region.population, 0));
  const pct = Math.max(0, finiteNumber(region.strataWeights?.[stratumId], 0));
  return population * pct / 100;
}

function totalRegionSupportModifier(region: MapRegion, factionId: string, stratumId: string): number {
  return (region.electionModifiers ?? [])
    .filter(modifier => modifier.factionId === factionId && modifierAppliesToStratum(modifier.stratumIds, stratumId))
    .reduce((sum, modifier) => sum + normalizeSupportModifier(modifier.effect?.support), 0);
}

function totalRegionRandomness(region: MapRegion, factionId: string, stratumId: string): number {
  return (region.electionModifiers ?? [])
    .filter(modifier => modifier.factionId === factionId && modifierAppliesToStratum(modifier.stratumIds, stratumId))
    .reduce((sum, modifier) => sum + finiteNumber(modifier.effect?.randomness, 0), 0);
}

function totalFactionGlobalSupportModifier(faction: Faction, stratumId: string): number {
  return (faction.globalModifiers ?? [])
    .filter(modifier => modifierAppliesToStratum(modifier.stratumIds, stratumId))
    .reduce((sum, modifier) => sum + normalizeSupportModifier(modifier.effect?.support), 0);
}

function totalFactionGlobalRandomness(faction: Faction, stratumId: string): number {
  return (faction.globalModifiers ?? [])
    .filter(modifier => modifierAppliesToStratum(modifier.stratumIds, stratumId))
    .reduce((sum, modifier) => sum + finiteNumber(modifier.effect?.randomness, 0), 0);
}

function modifierAppliesToStratum(stratumIds: string[] | undefined, stratumId: string): boolean {
  return !stratumIds || stratumIds.includes(stratumId);
}

function finiteNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * Math.min(1, Math.max(0, t));
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
