import {
  formatSupportWeight,
  multiplierToSupportModifier,
  normalizeSupportModifier,
  supportModifierToMultiplier,
} from '../../game/parliament/modifiers';

const SUPPORT_WEIGHT_PRESETS = [
  { label: '0x', value: -100 },
  { label: '0.5x', value: -50 },
  { label: '1x', value: 0 },
  { label: '2x', value: 100 },
  { label: '4x', value: 300 },
];

interface SupportWeightControlProps {
  value: number;
  onChange: (value: number) => void;
}

export function SupportWeightControl({ value, onChange }: SupportWeightControlProps) {
  const modifier = normalizeSupportModifier(value);
  const multiplier = supportModifierToMultiplier(modifier);

  return (
    <div className="support-weight-control">
      <div className="support-weight-head">
        <span>Weight</span>
        <strong>{formatSupportWeight(modifier)}</strong>
      </div>
      <div className="support-weight-inputs">
        <label>
          x
          <input
            type="number"
            min="0"
            step="0.1"
            value={formatInputNumber(multiplier)}
            onChange={event => onChange(multiplierToSupportModifier(parseFloat(event.target.value)))}
          />
        </label>
        <label>
          %
          <input
            type="number"
            min="-100"
            step="1"
            value={formatInputNumber(modifier)}
            onChange={event => onChange(normalizeSupportModifier(parseFloat(event.target.value)))}
          />
        </label>
      </div>
      <div className="support-weight-presets">
        {SUPPORT_WEIGHT_PRESETS.map(preset => (
          <button
            key={preset.value}
            type="button"
            className={Math.abs(modifier - preset.value) < 0.001 ? 'active' : ''}
            onClick={() => onChange(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatInputNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}
