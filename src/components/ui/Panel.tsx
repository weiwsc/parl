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
  const panelClass = ['ui-panel', 'panel', className].filter(Boolean).join(' ');
  const bodyClass = ['ui-panel-body', 'panel-body', bodyClassName].filter(Boolean).join(' ');

  return (
    <div className={panelClass}>
      <PanelCorners />
      {(title || subtitle || actions) && (
        <div className="ui-panel-header panel-header">
          <div className="ui-panel-heading">
            {title && <h2 className="ui-panel-title">{title}</h2>}
            {subtitle && <div className="ui-panel-sub panel-sub">{subtitle}</div>}
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
      <span className="ui-corner corner tl" />
      <span className="ui-corner corner tr" />
      <span className="ui-corner corner bl" />
      <span className="ui-corner corner br" />
    </>
  );
}
