import type { Faction, MapRegion, Stratum } from '../../models/types';

export function hasNoControl(region: MapRegion): boolean {
  return region.factionControl.every(c => c.percentage <= 0);
}

/**
 * Distribute region seats among factions based on strata composition and support shares.
 *
 * Formula per faction F, per stratum S:
 *   share += (F.support[S] / totalFactionSupport[S]) * (strataWeights[S] / 100)
 * Final seats = share * region.seatings, rounded via Largest Remainder.
 *
 * Only considers factions with any support in the relevant strata.
 * Returns empty object if region has faction control or no strata weights.
 */
export function computeStrataSeats(
  region: MapRegion,
  factions: Faction[],
  strata: Stratum[],
): Record<string, number> {
  if (!hasNoControl(region)) return {};
  if ((region.seatings || 0) === 0) return {};

  const weights = region.strataWeights ?? {};
  const totalWeight = strata.reduce((s, st) => s + (weights[st.id] || 0), 0);
  if (totalWeight <= 0) return {};

  const exactSeats: Record<string, number> = {};

  for (const faction of factions) {
    let share = 0;
    for (const stratum of strata) {
      const w = (weights[stratum.id] || 0) / 100;
      if (w <= 0) continue;
      // Total support across all factions for this stratum
      const totalSupport = factions.reduce((s, f) => s + (f.support[stratum.id] || 0), 0);
      if (totalSupport <= 0) continue;
      const factionSupport = faction.support[stratum.id] || 0;
      share += (factionSupport / totalSupport) * w;
    }
    exactSeats[faction.id] = share * (region.seatings || 0);
  }

  return largestRemainder(exactSeats, region.seatings || 0);
}

function largestRemainder(exact: Record<string, number>, total: number): Record<string, number> {
  const keys = Object.keys(exact);
  const floored: Record<string, number> = {};
  let assigned = 0;

  for (const k of keys) {
    floored[k] = Math.floor(exact[k]);
    assigned += floored[k];
  }

  const remainder = total - assigned;
  // Sort by fractional part descending, break ties by key for determinism
  const sorted = keys
    .map(k => ({ k, frac: exact[k] - Math.floor(exact[k]) }))
    .sort((a, b) => b.frac - a.frac || a.k.localeCompare(b.k));

  for (let i = 0; i < remainder; i++) {
    floored[sorted[i].k] = (floored[sorted[i].k] || 0) + 1;
  }

  return floored;
}
