import { lazy, Suspense, useMemo } from 'react';
import type { CSSProperties } from 'react';

export interface JsCodeCompletionItem {
  name: string;
  detail?: string;
  computed?: boolean;
}

export interface JsCodeCompletionContext {
  inputs?: JsCodeCompletionItem[];
  outputs?: JsCodeCompletionItem[];
  fields?: JsCodeCompletionItem[];
}

interface JsCodeEditorProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  minLines?: number;
  className?: string;
  ariaLabel?: string;
  completionContext?: JsCodeCompletionContext;
}

const CodeMirrorLiveEditor = lazy(() => import('./CodeMirrorLiveEditor').then(module => ({ default: module.CodeMirrorLiveEditor })));

export function JsCodeEditor({
  value,
  disabled,
  onChange,
  minLines = 8,
  className = '',
  ariaLabel = 'JavaScript editor',
  completionContext,
}: JsCodeEditorProps) {
  return (
    <Suspense fallback={<StaticHighlightedCode value={value} minLines={minLines} className={className} />}>
      <CodeMirrorLiveEditor
        value={value}
        onChange={onChange}
        minLines={minLines}
        className={className}
        ariaLabel={ariaLabel}
        completionContext={completionContext}
        readOnly={disabled}
      />
    </Suspense>
  );
}

function StaticHighlightedCode({
  value,
  minLines,
  className,
}: {
  value: string;
  minLines: number;
  className: string;
}) {
  const lineNumbers = useMemo(() => {
    const lineCount = Math.max(minLines, value.split('\n').length);
    return Array.from({ length: lineCount }, (_, index) => String(index + 1)).join('\n');
  }, [minLines, value]);

  return (
    <div
      className={`ne-js-code-editor ne-js-code-static${className ? ` ${className}` : ''}`}
      style={{ '--ne-code-min-lines': minLines } as CSSProperties}
    >
      <pre className="ne-js-code-static-gutter" aria-hidden="true">{lineNumbers}</pre>
      <code className="ne-js-code-static-body">{value || ''}</code>
    </div>
  );
}
