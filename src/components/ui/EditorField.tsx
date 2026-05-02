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
    <div className={`law-field${inline ? ' law-field--inline' : ''}`}>
      {actions ? (
        <div className="law-field-label-row">
          {hasLabel && (
            <label className="law-field-label">
              {label} {optional && <span className="law-field-opt">{optional}</span>}
            </label>
          )}
          {actions}
        </div>
      ) : hasLabel ? (
        <label className="law-field-label">
          {label} {optional && <span className="law-field-opt">{optional}</span>}
        </label>
      ) : null}
      {children}
    </div>
  );
}
