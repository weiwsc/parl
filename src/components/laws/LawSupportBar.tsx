export function LawSupportBar({ sup, abs, ag, total }: { sup: number; abs: number; ag: number; total: number }) {
  if (total === 0) return <div className="law-sup-bar" />;
  const pct = (n: number) => `${(n / total * 100).toFixed(1)}%`;

  return (
    <div className="law-sup-bar" title={`Support: ${sup}  Abstain: ${abs}  Against: ${ag}`}>
      {sup > 0 && <div className="lsb-seg lsb-sup" style={{ width: pct(sup) }} />}
      {abs > 0 && <div className="lsb-seg lsb-abs" style={{ width: pct(abs) }} />}
      {ag > 0 && <div className="lsb-seg lsb-ag" style={{ width: pct(ag) }} />}
    </div>
  );
}
