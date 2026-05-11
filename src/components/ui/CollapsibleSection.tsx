import { useState, type ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  leading?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headClassName?: string;
  chevronClassName?: string;
  titleClassName?: string;
  badgeClassName?: string;
  bodyClassName?: string;
}

export function CollapsibleSection({
  title,
  badge,
  children,
  leading,
  defaultOpen = true,
  className = '',
  headClassName = '',
  chevronClassName = '',
  titleClassName = '',
  badgeClassName = '',
  bodyClassName = '',
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionClass = [
    'ui-collapse',
    open ? 'is-open open' : 'is-collapsed collapsed',
    className,
  ].filter(Boolean).join(' ');
  const headClass = ['ui-collapse-head', headClassName].filter(Boolean).join(' ');
  const chevronClass = ['ui-collapse-chevron', chevronClassName].filter(Boolean).join(' ');
  const titleClass = ['ui-collapse-title', titleClassName].filter(Boolean).join(' ');
  const badgeClass = ['ui-collapse-badge', badgeClassName].filter(Boolean).join(' ');
  const bodyClass = ['ui-collapse-body', bodyClassName].filter(Boolean).join(' ');
  const hasBody = children !== undefined && children !== null;

  return (
    <section className={sectionClass}>
      <button
        className={headClass}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span className={chevronClass}>{open ? '▾' : '▸'}</span>
        <span className={titleClass}>
          {leading}
          <span className="ui-collapse-title-text">{title}</span>
        </span>
        {badge && <span className={badgeClass}>{badge}</span>}
      </button>
      {open && hasBody && <div className={bodyClass}>{children}</div>}
    </section>
  );
}
