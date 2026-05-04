import { stanceLabel, useLang } from '../../utils/localization';

export function LawSupportBar({ sup, abs, ag, total }: { sup: number; abs: number; ag: number; total: number }) {
  const t = useLang();

  if (total === 0) return <div className="law-sup-bar" />;
  const pct = (n: number) => `${(n / total * 100).toFixed(1)}%`;

  return (
    <div className="law-sup-bar" title={`${stanceLabel(t, 'support')}: ${sup}  ${stanceLabel(t, 'abstain')}: ${abs}  ${stanceLabel(t, 'against')}: ${ag}`}>
      {sup > 0 && <div className="lsb-seg lsb-sup" style={{ width: pct(sup) }} />}
      {abs > 0 && <div className="lsb-seg lsb-abs" style={{ width: pct(abs) }} />}
      {ag > 0 && <div className="lsb-seg lsb-ag" style={{ width: pct(ag) }} />}
    </div>
  );
}
