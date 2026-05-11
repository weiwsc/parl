export {
  ParliamentSystem,
  StrataSupportPowerModel,
  LargestRemainderSeatAllocator,
  computeProjection,
  computeElectionProjection,
  computeStratumElectionTotals,
  factionPower,
  stratumTotalSupport,
  getComputedFactionStratumSupport,
  getComputedStratumPopulation,
  getCurrentParliamentProjection,
  getLatestElectionEntry,
  getLatestElectionProjection,
  getParticipatingFactions,
  getRegionStratumPopulation,
  hasRegionalPopulationData,
  hasRegionalElectionData,
} from '../game/parliament/projection';
export { arrangeSeats } from '../game/parliament/seating';

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c as keyof typeof map] || c));
}

const map = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' };

export function fmtCount(n: number): string {
  if (!isFinite(n)) return '0';
  const abs = Math.abs(n);
  const fix = (x: number) => x.toFixed(abs >= 100 ? 0 : abs >= 10 ? 1 : 2).replace(/\.?0+$/, '');
  if (abs >= 1e9) return fix(n/1e9) + 'B';
  if (abs >= 1e6) return fix(n/1e6) + 'M';
  if (abs >= 1e3) return fix(n/1e3) + 'K';
  return String(Math.round(n));
}

export function fmtFull(n: number): string {
  return Math.round(n).toLocaleString();
}
