import { lazy, Suspense, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { javascriptLanguage } from '@codemirror/lang-javascript';
import { classHighlighter, highlightCode } from '@lezer/highlight';

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
  if (disabled) {
    return <StaticHighlightedCode value={value} minLines={minLines} className={className} />;
  }

  return (
    <Suspense fallback={<StaticHighlightedCode value={value} minLines={minLines} className={className} />}>
      <CodeMirrorLiveEditor
        value={value}
        onChange={onChange}
        minLines={minLines}
        className={className}
        ariaLabel={ariaLabel}
        completionContext={completionContext}
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

  const highlighted = useMemo(() => highlightJavascript(value), [value]);

  return (
    <div
      className={`ne-js-code-editor ne-js-code-static${className ? ` ${className}` : ''}`}
      style={{ '--ne-code-min-lines': minLines } as CSSProperties}
    >
      <pre className="ne-js-code-static-gutter" aria-hidden="true">{lineNumbers}</pre>
      <code className="ne-js-code-static-body">{highlighted}</code>
    </div>
  );
}

function highlightJavascript(value: string): ReactNode[] {
  const pieces: ReactNode[] = [];
  let index = 0;

  highlightCode(
    value,
    javascriptLanguage.parser.parse(value),
    classHighlighter,
    (text, classes) => {
      pieces.push(classes
        ? <span key={index++} className={classes}>{text}</span>
        : <span key={index++}>{text}</span>
      );
    },
    () => {
      pieces.push('\n');
    },
  );

  return pieces.length > 0 ? pieces : [''];
}
