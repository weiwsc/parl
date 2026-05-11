import type { ReactNode } from 'react';

interface EditorShellProps {
  title?: ReactNode;
  kicker?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  headClassName?: string;
  bodyClassName?: string;
  footClassName?: string;
  children?: ReactNode;
}

export function EditorShell({
  title,
  kicker,
  actions,
  footer,
  className = '',
  headClassName = '',
  bodyClassName = '',
  footClassName = '',
  children,
}: EditorShellProps) {
  const shellClass = ['ui-editor', className].filter(Boolean).join(' ');
  const headClass = ['ui-editor-head', headClassName].filter(Boolean).join(' ');
  const bodyClass = ['ui-editor-body', bodyClassName].filter(Boolean).join(' ');
  const footClass = ['ui-editor-foot', footClassName].filter(Boolean).join(' ');

  return (
    <section className={shellClass}>
      {(title || kicker || actions) && (
        <div className={headClass}>
          <div className="ui-editor-heading">
            {title && <span className="ui-editor-title">{title}</span>}
            {kicker && <span className="ui-editor-kicker">{kicker}</span>}
          </div>
          {actions}
        </div>
      )}
      {children && <div className={bodyClass}>{children}</div>}
      {footer && <div className={footClass}>{footer}</div>}
    </section>
  );
}
