export interface SeatPosition {
  x: number;
  y: number;
  r: number;
  angle: number;
  ring: number;
}

export function arrangeSeats(N: number): SeatPosition[] {
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
