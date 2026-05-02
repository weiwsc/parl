import type { ReactNode } from 'react';

interface ListSurfaceProps {
  children: ReactNode;
  className?: string;
}

export function ListSurface({ children, className = '' }: ListSurfaceProps) {
  return (
    <div className={['ui-list-surface', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

interface GridSurfaceProps {
  children: ReactNode;
  className?: string;
}

export function GridSurface({ children, className = '' }: GridSurfaceProps) {
  return (
    <div className={['ui-grid-surface', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
