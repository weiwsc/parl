import { MarkdownValueView } from './MarkdownValueView';

interface NodeInfoFieldProps {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}

export function NodeInfoField({
  label,
  value,
  editing,
  onChange,
  placeholder = 'markdown...',
  emptyLabel = 'No info.',
  className = '',
}: NodeInfoFieldProps) {
  const summary = value.trim().replace(/\s+/g, ' ');
  const rootClassName = ['ui-node-info-field', 'ne-node', 'ne-markdown', className].filter(Boolean).join(' ');

  return (
    <div className={rootClassName}>
      <div className="ne-node-head ne-instance-field-row ne-instance-visual-row">
        <span className="ne-port-spacer" />
        <span className="ne-kind-tag ne-kind-info">i</span>
        <span className="ne-instance-field-name">{label}</span>
        <span className="ne-type-pill">markdown</span>
        <span className="ne-value-readout">{summary || 'info'}</span>
        <span className="ne-port-spacer" />
      </div>
      <div className="ui-node-info-field-body">
        {editing ? (
          <textarea
            className="ne-markdown-editor ui-node-info-editor"
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder={placeholder}
          />
        ) : (
          <MarkdownValueView
            value={value}
            emptyLabel={emptyLabel}
            className="ne-computed-chart ne-computed-markdown ne-info-markdown"
          />
        )}
      </div>
    </div>
  );
}
