export interface DominanceBarSegment {
  id: string;
  name: string;
  color: string;
  value: number;
}

interface DominanceBarProps {
  segments: DominanceBarSegment[];
  total?: number;
  className?: string;
  remainderLabel?: string;
}

export function DominanceBar({
  segments,
  total = 100,
  className = '',
  remainderLabel = 'Uncontrolled',
}: DominanceBarProps) {
  const assigned = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const overAllocated = assigned > total + 0.001;
  const denominator = overAllocated ? assigned : total;
  const safeDenominator = denominator > 0 ? denominator : 1;
  const visibleSegments = segments.filter(segment => segment.value > 0);
  const remainder = Math.max(0, total - assigned);

  return (
    <div className={['stratum-support-bar', 'dominance-bar', overAllocated ? 'over' : '', className].filter(Boolean).join(' ')}>
      {visibleSegments.map(segment => (
        <span
          key={segment.id}
          className="seg"
          style={{
            background: segment.color,
            color: segment.color,
            width: `${(segment.value / safeDenominator * 100).toFixed(2)}%`,
          }}
          title={`${segment.name}: ${segment.value.toFixed(1)}%`}
        />
      ))}
      {!overAllocated && remainder > 0 && (
        <span
          className="seg seg-unaligned"
          style={{ width: `${(remainder / safeDenominator * 100).toFixed(2)}%` }}
          title={`${remainderLabel}: ${remainder.toFixed(1)}%`}
        />
      )}
    </div>
  );
}
