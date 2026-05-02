import type { ReactNode } from 'react';

interface EmptyStateProps {
  children: ReactNode;
  className?: string;
}

export function EmptyState({ children, className = '' }: EmptyStateProps) {
  return (
    <div className={['empty', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
