export function normalizeSupportModifier(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Math.max(-100, Number.isFinite(numeric) ? numeric : 0);
}

export function supportModifierToMultiplier(value: unknown): number {
  return (100 + normalizeSupportModifier(value)) / 100;
}

export function multiplierToSupportModifier(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return normalizeSupportModifier((Number.isFinite(numeric) ? numeric : 1) * 100 - 100);
}

export function formatSupportWeight(value: unknown): string {
  const modifier = normalizeSupportModifier(value);
  const signed = modifier > 0 ? `+${formatEffectNumber(modifier)}` : formatEffectNumber(modifier);
  return `${formatEffectNumber(supportModifierToMultiplier(modifier))}x / ${signed}%`;
}

export function formatModifierStrataSummary(
  stratumIds: string[] | undefined,
  strata: { id: string; name: string }[],
  limit = 2,
): string {
  const selected = new Set((stratumIds ?? []).filter(Boolean));
  if (strata.length > 0 && selected.size === strata.length && strata.every(stratum => selected.has(stratum.id))) {
    return 'All';
  }
  if (selected.size === 0) return 'No strata';

  const names = strata
    .filter(stratum => selected.has(stratum.id))
    .map(stratum => stratum.name);
  const unknownNames = [...selected]
    .filter(id => !strata.some(stratum => stratum.id === id));
  const allNames = [...names, ...unknownNames];
  const shown = allNames.slice(0, Math.max(1, limit));
  const remaining = allNames.length - shown.length;
  return remaining > 0 ? `${shown.join(', ')} +${remaining}` : shown.join(', ');
}

function formatEffectNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
}
