import type { ReactNode } from 'react';

interface AppHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function AppHeader({ title, subtitle, className = '', children }: AppHeaderProps) {
  return (
    <header className={['app-header', className].filter(Boolean).join(' ')}>
      <span className="crest" />
      <div className="title-block">
        <h1>{title}</h1>
        {subtitle && <span className="sub">{subtitle}</span>}
      </div>
      <div className="header-spacer" />
      {children}
    </header>
  );
}
