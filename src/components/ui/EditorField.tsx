import type { ReactNode } from 'react';

interface EditorFieldProps {
  label?: ReactNode;
  optional?: ReactNode;
  actions?: ReactNode;
  inline?: boolean;
  children: ReactNode;
}

export function EditorField({ label, optional, actions, inline = false, children }: EditorFieldProps) {
  const hasLabel = label || optional;

  return (
    <div className={`ui-field${inline ? ' ui-field--inline' : ''}`}>
      {actions ? (
        <div className="ui-field-label-row">
          {hasLabel && (
            <label className="ui-field-label">
              {label} {optional && <span className="ui-field-opt">{optional}</span>}
            </label>
          )}
          {actions}
        </div>
      ) : hasLabel ? (
        <label className="ui-field-label">
          {label} {optional && <span className="ui-field-opt">{optional}</span>}
        </label>
      ) : null}
      {children}
    </div>
  );
}
