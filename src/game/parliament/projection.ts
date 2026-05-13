import type { Alliance, AppState, Faction, HistoryEntry, MapRegion, ProjectionEntry, ProjectionResult, Stratum } from '../../models/types';
import { normalizeRandomnessModifier, normalizeSupportModifier, randomnessModifierToMultiplier } from './modifiers';

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

export interface CurrentParliamentSnapshot {
  election: HistoryEntry | null;
  projection: ProjectionResult | null;
  factions: Faction[];
  alliances: Alliance[];
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

export interface StratumElectionTotals {
  votesByFactionByStratum: Record<string, Record<string, number>>;
  supportByFactionByStratum: Record<string, Record<string, number>>;
  totalVotesByStratum: Record<string, number>;
  totalSupportByStratum: Record<string, number>;
  populationByStratum: Record<string, number>;
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
      const unassignedPopulation = Math.max(0, getComputedStratumPopulation(state, stratum) - assignedSupport);
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

export function getComputedStratumPopulation(state: AppState, stratum: Stratum | string): number {
  const stratumId = typeof stratum === 'string' ? stratum : stratum.id;
  const regionalPopulation = (state.map?.regions ?? [])
    .reduce((sum, region) => sum + getRegionStratumPopulation(region, stratumId), 0);

  if (hasRegionalPopulationData(state)) return regionalPopulation;

  if (typeof stratum === 'string') {
    return Math.max(0, finiteNumber(state.strata.find(item => item.id === stratum)?.population, 0));
  }

  return Math.max(0, finiteNumber(stratum.population, 0));
}

export function hasRegionalPopulationData(state: AppState): boolean {
  return (state.map?.regions ?? []).some(region => finiteNumber(region.population, 0) > 0);
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
  const electionRandomRolls = new Map<string, number>();
  const getElectionRandomRoll = (factionId: string) => {
    if (!options.randomize) return 0;
    const existing = electionRandomRolls.get(factionId);
    if (typeof existing === 'number') return existing;
    const next = lerp(-1, 1, rng());
    electionRandomRolls.set(factionId, next);
    return next;
  };

  return (state.map?.regions ?? []).map(region => {
    const population = Math.max(0, finiteNumber(region.population, 0));
    const votes: Record<string, number> = {};
    const strataBreakdowns: RegionElectionStratumBreakdown[] = [];

    for (const stratum of state.strata) {
      const stratumPopulation = getRegionStratumPopulation(region, stratum.id);
      const assignedSupport = state.factions.reduce(
        (sum, faction) => sum + getRegionFactionStratumSupport(region, faction.id, stratum.id),
        0
      );
      const unalignedPopulation = Math.max(0, stratumPopulation - assignedSupport);

      const weightRows = participating.map(faction => {
        const supportModifier =
          totalFactionGlobalSupportModifier(faction, stratum.id)
          + totalRegionSupportModifier(region, faction.id, stratum.id);
        const randomnessModifier = normalizeRandomnessModifier(
          totalFactionGlobalRandomness(faction, stratum.id)
          + totalRegionRandomness(region, faction.id, stratum.id)
        );
        const randomness = baseRandomness * randomnessModifierToMultiplier(randomnessModifier);
        const directSupport = getRegionFactionStratumSupport(region, faction.id, stratum.id);
        const baseWeight = Math.max(0, 100 + supportModifier);
        const randomDelta = options.randomize && randomness > 0
          ? getElectionRandomRoll(faction.id) * randomness
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
      const totalFallbackWeight = weightRows.reduce((sum, row) => sum + Math.max(0, 100 + row.supportModifier), 0);
      const stratumVotes: Record<string, number> = {};

      for (const row of weightRows) {
        const fallbackWeight = Math.max(0, 100 + row.supportModifier);
        row.distributedVote = totalWeight > 0
          ? unalignedPopulation * (row.weight / totalWeight)
          : totalFallbackWeight > 0
            ? unalignedPopulation * (fallbackWeight / totalFallbackWeight)
            : unalignedPopulation / Math.max(1, weightRows.length);
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

export function computeStratumElectionTotals(
  state: AppState,
  options: ElectionProjectionOptions = {}
): StratumElectionTotals {
  const supportByFactionByStratum = computeFactionStratumSupport(state);
  const votesByFactionByStratum = Object.fromEntries(
    state.factions.map(faction => [
      faction.id,
      Object.fromEntries(state.strata.map(stratum => [stratum.id, 0])),
    ])
  ) as Record<string, Record<string, number>>;
  const totalVotesByStratum = Object.fromEntries(
    state.strata.map(stratum => [stratum.id, 0])
  ) as Record<string, number>;
  const totalSupportByStratum = Object.fromEntries(
    state.strata.map(stratum => [
      stratum.id,
      state.factions.reduce((sum, faction) => sum + (supportByFactionByStratum[faction.id]?.[stratum.id] || 0), 0),
    ])
  ) as Record<string, number>;
  const populationByStratum = Object.fromEntries(
    state.strata.map(stratum => [stratum.id, getComputedStratumPopulation(state, stratum)])
  ) as Record<string, number>;

  if (!hasRegionalElectionData(state)) {
    return {
      votesByFactionByStratum,
      supportByFactionByStratum,
      totalVotesByStratum,
      totalSupportByStratum,
      populationByStratum,
    };
  }

  const regionBreakdowns = computeRegionElectionBreakdowns(state, options);
  for (const breakdown of regionBreakdowns) {
    for (const stratumBreakdown of breakdown.strata) {
      for (const [factionId, votes] of Object.entries(stratumBreakdown.votes)) {
        if (!votesByFactionByStratum[factionId]) continue;
        votesByFactionByStratum[factionId][stratumBreakdown.stratumId] =
          (votesByFactionByStratum[factionId][stratumBreakdown.stratumId] || 0) + votes;
        totalVotesByStratum[stratumBreakdown.stratumId] =
          (totalVotesByStratum[stratumBreakdown.stratumId] || 0) + votes;
      }
    }
  }

  return {
    votesByFactionByStratum,
    supportByFactionByStratum,
    totalVotesByStratum,
    totalSupportByStratum,
    populationByStratum,
  };
}

export function computeElectionProjection(
  state: AppState,
  options: ElectionProjectionOptions = {}
): ProjectionResult {
  if (!hasRegionalElectionData(state)) return defaultParliamentSystem.project(state);

  const participating = getParticipatingFactions(state);
  const stratumTotals = computeStratumElectionTotals(state, options);

  const entries: ProjectionEntry[] = participating.map(faction => {
    const alliance = state.alliances?.find(a => a.factionIds.includes(faction.id));
    const power = state.strata.reduce((sum, stratum) => {
      const votes = stratumTotals.votesByFactionByStratum[faction.id]?.[stratum.id] || 0;
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
  return latest ? getElectionSnapshotProjection(latest) : null;
}

export function getElectionSnapshotProjection(entry: HistoryEntry): ProjectionResult | null {
  return getElectionSnapshotProjectionInternal(entry, { applySeatAdjustments: true });
}

function getElectionSnapshotProjectionInternal(
  entry: HistoryEntry,
  { applySeatAdjustments }: { applySeatAdjustments: boolean }
): ProjectionResult | null {
  if (!entry.projection) return null;
  const alliances = entry.alliances.map(cloneSnapshotAlliance);
  let entries = entry.projection.entries
    .map(projectionEntry => rebindSnapshotProjectionEntry(projectionEntry, entry.factions, alliances))
    .sort((a, b) => snapshotProjectionOrder(a, entry.factions, alliances) - snapshotProjectionOrder(b, entry.factions, alliances));
  const totalSeats = entry.projection.totalSeats ?? entry.totalSeats;

  if (applySeatAdjustments) {
    entries = applySnapshotSeatAdjustments(entries, entry.seatAdjustments, totalSeats);
  }

  return {
    ...entry.projection,
    entries,
    totalSeats,
    unalignedMode: entry.projection.unalignedMode ?? entry.unalignedMode,
    strataCount: entry.projection.strataCount ?? entry.strata.length,
    factionsCount: entry.projection.factionsCount ?? entry.factions.length,
    timestamp: entry.projection.timestamp ?? entry.timestamp,
  };
}

export function rebuildElectionSnapshotProjection(entry: HistoryEntry): void {
  const projection = getElectionSnapshotProjectionInternal(entry, { applySeatAdjustments: false });
  if (projection) entry.projection = projection;
}

export function getProjectionFactionIds(projection: ProjectionResult): Set<string> {
  return new Set(projection.entries.filter(entry => !entry.isUnaligned).map(entry => entry.faction.id));
}

export function getProjectionUnassignedSeats(projection: ProjectionResult): number {
  const totalSeats = projection.totalSeats ?? projection.entries.reduce((sum, entry) => sum + entry.seats, 0);
  const assignedSeats = projection.entries.reduce((sum, entry) => sum + Math.max(0, entry.seats), 0);
  return Math.max(0, totalSeats - assignedSeats);
}

export function getCurrentParliamentSnapshot(state: AppState): CurrentParliamentSnapshot {
  const election = getLatestElectionEntry(state);
  const projection = election ? getElectionSnapshotProjection(election) : null;

  if (!election || !projection) {
    return {
      election: null,
      projection: null,
      factions: state.factions,
      alliances: state.alliances,
    };
  }

  return {
    election,
    projection,
    factions: mergeCurrentFactionList(election.factions, projection, state.factions),
    alliances: election.alliances.map(cloneSnapshotAlliance),
  };
}

function cloneSnapshotAlliance(alliance: Alliance): Alliance {
  return { ...alliance, factionIds: [...alliance.factionIds] };
}

function snapshotProjectionFaction(entry: ProjectionEntry, factions: Faction[]): ProjectionEntry['faction'] {
  const faction = factions.find(candidate => candidate.id === entry.faction.id);
  return faction ? { id: faction.id, name: faction.name, color: faction.color } : entry.faction;
}

function rebindSnapshotProjectionEntry(entry: ProjectionEntry, factions: Faction[], alliances: Alliance[]): ProjectionEntry {
  if (entry.isUnaligned) {
    return { ...entry, faction: snapshotProjectionFaction(entry, factions), alliance: undefined };
  }

  const alliance = alliances.find(candidate => candidate.factionIds.includes(entry.faction.id));
  return {
    ...entry,
    faction: snapshotProjectionFaction(entry, factions),
    alliance: alliance ? cloneSnapshotAlliance(alliance) : undefined,
  };
}

function snapshotProjectionOrder(entry: ProjectionEntry, factions: Faction[], alliances: Alliance[]): number {
  const factionIndex = factions.findIndex(faction => faction.id === entry.faction.id);
  const factionOrder = factionIndex >= 0 ? factionIndex : 9999;

  if (entry.isUnaligned) return 2_000_000 + factionOrder;
  if (!entry.alliance) return 1_000_000 + factionOrder;

  const allianceIndex = alliances.findIndex(alliance => alliance.id === entry.alliance?.id);
  const allianceOrder = allianceIndex >= 0 ? allianceIndex : 999;
  const memberIndex = entry.alliance.factionIds.indexOf(entry.faction.id);
  return allianceOrder * 1000 + (memberIndex >= 0 ? memberIndex : 999);
}

function applySnapshotSeatAdjustments(
  entries: ProjectionEntry[],
  seatAdjustments: Record<string, number> | undefined,
  totalSeats: number | undefined
): ProjectionEntry[] {
  if (!seatAdjustments || totalSeats === undefined) return entries;

  const baseEntries = entries.map(entry => ({ entry, delta: normalizedInteger(seatAdjustments[entry.faction.id]) }));
  const releasedSeats = baseEntries.reduce((sum, { entry, delta }) => (
    sum + Math.max(0, -Math.max(delta, -entry.seats))
  ), 0);
  let spentSeats = 0;

  return baseEntries.map(({ entry, delta }) => {
    const lowerBoundedDelta = Math.max(delta, -entry.seats);
    let appliedDelta = lowerBoundedDelta;

    if (lowerBoundedDelta > 0) {
      const remaining = Math.max(0, releasedSeats - spentSeats);
      appliedDelta = Math.min(lowerBoundedDelta, remaining);
      spentSeats += appliedDelta;
    }

    const seats = Math.max(0, entry.seats + appliedDelta);
    return {
      ...entry,
      seats,
      share: totalSeats > 0 ? seats / totalSeats : 0,
    };
  });
}

function normalizedInteger(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.trunc(numeric);
}

function mergeCurrentFactionList(snapshotFactions: Faction[], projection: ProjectionResult, liveFactions: Faction[]): Faction[] {
  const merged = new Map<string, Faction>();

  for (const faction of snapshotFactions) merged.set(faction.id, faction);
  for (const entry of projection.entries) {
    if (entry.isUnaligned || merged.has(entry.faction.id)) continue;
    merged.set(entry.faction.id, {
      id: entry.faction.id,
      name: entry.faction.name,
      description: '',
      color: entry.faction.color,
      globalModifiers: [],
      participatesInElections: false,
    });
  }
  for (const faction of liveFactions) {
    if (!merged.has(faction.id)) merged.set(faction.id, faction);
  }

  return Array.from(merged.values());
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

export function getRegionStratumPopulation(region: MapRegion, stratumId: string): number {
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
