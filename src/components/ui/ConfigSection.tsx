import type { ReactNode } from 'react';
import { CollapsibleSection } from './CollapsibleSection';

interface ConfigSectionProps {
  title: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
}

export function ConfigSection({
  title,
  badge,
  children,
  defaultOpen = true,
  className = '',
  bodyClassName = '',
}: ConfigSectionProps) {
  return (
    <CollapsibleSection
      title={title}
      badge={badge}
      defaultOpen={defaultOpen}
      className={`ui-config-section${className ? ` ${className}` : ''}`}
      headClassName="ui-config-section-head"
      chevronClassName="ui-config-section-chevron"
      titleClassName="ui-config-section-title"
      badgeClassName="ui-config-section-badge"
      bodyClassName={`ui-config-section-body${bodyClassName ? ` ${bodyClassName}` : ''}`}
    >
      {children}
    </CollapsibleSection>
  );
}
