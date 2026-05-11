import type { ReactNode } from 'react';
import { CollapsibleSection } from './CollapsibleSection';

interface NodeSectionProps {
  title: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headClassName?: string;
  titleClassName?: string;
  badgeClassName?: string;
  bodyClassName?: string;
  kind?: ReactNode;
  kindClassName?: string;
}

export function NodeSection({
  title,
  badge,
  children,
  defaultOpen = true,
  className = '',
  headClassName = '',
  titleClassName = '',
  badgeClassName = '',
  bodyClassName = '',
  kind = '§',
  kindClassName = 'ne-kind-sec',
}: NodeSectionProps) {
  return (
    <CollapsibleSection
      title={title}
      badge={badge}
      defaultOpen={defaultOpen}
      leading={kind ? <span className={`ne-kind-tag ${kindClassName}`}>{kind}</span> : undefined}
      className={`ui-node-surface ui-node-section ne-node ne-section${className ? ` ${className}` : ''}`}
      headClassName={`ui-node-section-head ne-node-head${headClassName ? ` ${headClassName}` : ''}`}
      chevronClassName="ne-expand-btn"
      titleClassName={`ui-node-section-title ne-instance-section-name${titleClassName ? ` ${titleClassName}` : ''}`}
      badgeClassName={`ui-node-section-badge${badgeClassName ? ` ${badgeClassName}` : ''}`}
      bodyClassName={`ui-node-section-body ne-node-body${bodyClassName ? ` ${bodyClassName}` : ''}`}
    >
      {children}
    </CollapsibleSection>
  );
}
