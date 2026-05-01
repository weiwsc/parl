import { UNALIGNED_COLOR } from '../store';
import type { AppState, Faction, Stratum, ProjectionResult, ProjectionEntry } from '../models/types';

export function factionPower(state: AppState, f: Faction): number {
  let p = 0;
  for (const s of state.strata) {
    p += (f.support[s.id] || 0) * s.power;
  }
  return p;
}

export function stratumTotalSupport(state: AppState, s: Stratum): number {
  return state.factions.reduce((a, f) => a + (f.support[s.id] || 0), 0);
}

export function computeProjection(state: AppState): ProjectionResult {
  const totalSeats = state.totalSeats;
  const factionPowers = state.factions.map(f => factionPower(state, f));

  let unalignedPower = 0;
  if (state.unalignedMode) {
    state.strata.forEach(s => {
      const totalSup = stratumTotalSupport(state, s);
      const gap = Math.max(0, s.population - totalSup);
      if (gap > 0) unalignedPower += gap * s.power;
    });
  }

  const allEntries: ProjectionEntry[] = state.factions.map((f, i) => {
    const alliance = state.alliances?.find(a => a.factionIds.includes(f.id));
    return {
      faction: f, power: factionPowers[i], seats: 0, share: 0, alliance
    };
  });
  if (state.unalignedMode && unalignedPower > 0) {
    allEntries.push({
      faction: { id: '__unaligned__', name: 'Unaligned', color: UNALIGNED_COLOR },
      power: unalignedPower,
      isUnaligned: true,
      seats: 0,
      share: 0
    });
  }

  const total = allEntries.reduce((a, e) => a + e.power, 0);
  if (total <= 0 || totalSeats <= 0) {
    return { entries: allEntries.map(e => ({...e, seats: 0, share: 0})), total };
  }

  const exact = allEntries.map(e => e.power / total * totalSeats);
  const floor = exact.map(Math.floor);
  let remaining = totalSeats - floor.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ rem: e - floor[i], i }))
                     .sort((a, b) => b.rem - a.rem);
  for (let k = 0; k < remaining && k < order.length; k++) floor[order[k].i]++;

  const finalEntries = allEntries.map((e, i) => ({
    ...e,
    seats: floor[i],
    share: total > 0 ? e.power / total : 0
  })).sort((a, b) => {
    if (a.isUnaligned) return 1;
    if (b.isUnaligned) return -1;
    const getOrder = (e: ProjectionEntry) => {
      if (e.alliance) {
        const aIdx = state.alliances.findIndex(al => al.id === e.alliance!.id);
        const fIdx = e.alliance.factionIds.indexOf(e.faction.id);
        return aIdx * 1000 + (fIdx >= 0 ? fIdx : 999);
      } else {
        const fIdx = state.factions.findIndex(f => f.id === e.faction.id);
        return 1000000 + fIdx;
      }
    };
    return getOrder(a) - getOrder(b);
  });

  return {
    entries: finalEntries,
    total
  };
}

export function arrangeSeats(N: number): Array<{x: number, y: number, r: number, angle: number, ring: number}> {
  if (N <= 0) return [];
  let rows = Math.max(2, Math.round(Math.sqrt(N / 4) + 0.5));
  if (N <= 30) rows = Math.max(2, Math.round(N / 12));
  if (N >= 600) rows = Math.max(rows, 12);

  const seatR = 1.2;
  const ringGap = 0.6;
  const innerR = rows * (seatR * 2 + ringGap) * 0.55 + 4;

  const radii = [];
  for (let i = 0; i < rows; i++) radii.push(innerR + i * (seatR * 2 + ringGap));
  const minSpacing = seatR * 2 + 0.25;
  const capacities = radii.map(r => Math.max(1, Math.floor(Math.PI * r / minSpacing)));
  const totalCap = capacities.reduce((a, b) => a + b, 0);
  const seatsPerRow = capacities.map(c => Math.floor(c / totalCap * N));
  let diff = N - seatsPerRow.reduce((a, b) => a + b, 0);
  let i = seatsPerRow.length - 1;
  while (diff > 0) {
    if (seatsPerRow[i] < capacities[i]) { seatsPerRow[i]++; diff--; }
    i--; if (i < 0) i = seatsPerRow.length - 1;
  }
  i = 0;
  while (diff < 0) {
    if (seatsPerRow[i] > 0) { seatsPerRow[i]--; diff++; }
    i++; if (i >= seatsPerRow.length) i = 0;
  }

  const positions = [];
  for (let row = 0; row < rows; row++) {
    const r = radii[row];
    const n = seatsPerRow[row];
    if (n <= 0) continue;
    for (let s = 0; s < n; s++) {
      const t = n === 1 ? 0.5 : s / (n - 1);
      const angle = Math.PI - t * Math.PI;
      positions.push({
        x: Math.cos(angle) * r,
        y: -Math.sin(angle) * r,
        r: seatR, angle, ring: row
      });
    }
  }
  positions.sort((a, b) => (b.angle - a.angle) || (b.ring - a.ring));
  return positions;
}

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
