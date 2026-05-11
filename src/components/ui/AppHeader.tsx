import type { ReactNode } from 'react';

interface AppHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function AppHeader({ title, subtitle, className = '', children }: AppHeaderProps) {
  return (
    <header className={['ui-app-header', 'app-header', className].filter(Boolean).join(' ')}>
      <span className="ui-app-crest crest" />
      <div className="ui-app-title-block title-block">
        <h1 className="ui-app-title">{title}</h1>
        {subtitle && <span className="ui-app-sub sub">{subtitle}</span>}
      </div>
      <div className="ui-app-header-spacer header-spacer" />
      {children}
    </header>
  );
}
