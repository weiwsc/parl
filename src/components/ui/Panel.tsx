import type { ReactNode } from 'react';

interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function Panel({ title, subtitle, actions, className = '', bodyClassName = '', children }: PanelProps) {
  const panelClass = ['panel', className].filter(Boolean).join(' ');
  const bodyClass = ['panel-body', bodyClassName].filter(Boolean).join(' ');

  return (
    <div className={panelClass}>
      <PanelCorners />
      {(title || subtitle || actions) && (
        <div className="panel-header">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <div className="panel-sub">{subtitle}</div>}
          </div>
          {actions}
        </div>
      )}
      <div className={bodyClass}>
        {children}
      </div>
    </div>
  );
}

export function PanelCorners() {
  return (
    <>
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />
    </>
  );
}
