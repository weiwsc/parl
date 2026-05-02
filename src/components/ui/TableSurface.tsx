import type { ReactNode } from 'react';

interface TableSurfaceProps {
  children: ReactNode;
  className?: string;
}

export function TableSurface({ children, className = '' }: TableSurfaceProps) {
  return (
    <div className={['ui-table-surface', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
