import { renderMarkdown } from '../../utils/markdown';

interface MarkdownValueViewProps {
  value: unknown;
  emptyLabel?: string;
  className?: string;
}

export function MarkdownValueView({ value, emptyLabel = 'No description.', className = '' }: MarkdownValueViewProps) {
  const text = markdownText(value);
  const rootClassName = ['ne-markdown-view', 'law-md-body', className].filter(Boolean).join(' ');

  return (
    <div
      className={rootClassName}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text, emptyLabel) }}
    />
  );
}

function markdownText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(markdownText).join(', ');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string') return record.name;
    if (typeof record.id === 'string') return record.id;
    return JSON.stringify(value);
  }
  return String(value);
}
