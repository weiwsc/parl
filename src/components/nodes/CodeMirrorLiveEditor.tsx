import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { acceptCompletion, autocompletion } from '@codemirror/autocomplete';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { indentMore } from '@codemirror/commands';
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, tooltips } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import type { JsCodeCompletionContext, JsCodeCompletionItem } from './JsCodeEditor';

interface CodeMirrorLiveEditorProps {
  value: string;
  onChange: (value: string) => void;
  minLines: number;
  className: string;
  ariaLabel: string;
  completionContext?: JsCodeCompletionContext;
}

export function CodeMirrorLiveEditor({
  value,
  onChange,
  minLines,
  className,
  ariaLabel,
  completionContext,
}: CodeMirrorLiveEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const completionContextRef = useRef(completionContext);
  const initialValueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    completionContextRef.current = completionContext;
  }, [completionContext]);

  useEffect(() => {
    if (!hostRef.current) return;

    const structuralCompletionSource = (context: CompletionContext) => (
      completeStructuralScope(context, completionContextRef.current)
    );

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          Prec.highest(keymap.of([
            { key: 'Tab', run: acceptCompletion },
            { key: 'Tab', run: indentMore },
          ])),
          basicSetup,
          javascript(),
          javascriptLanguage.data.of({ autocomplete: structuralCompletionSource }),
          syntaxHighlighting(nodeEditorHighlightStyle),
          tooltips({ parent: document.body }),
          autocompletion({ activateOnTyping: true }),
          indentUnit.of('  '),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [ariaLabel]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === value) return;

    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return (
    <div
      ref={hostRef}
      className={`ne-js-code-editor ne-js-code-editor-live${className ? ` ${className}` : ''}`}
      style={{ '--ne-code-min-lines': minLines } as CSSProperties}
    />
  );
}

const nodeEditorHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--ne-code-keyword, var(--accent-hot))', fontWeight: '600' },
  { tag: [tags.string, tags.character], color: 'var(--ne-code-string, var(--good))' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--ne-code-literal, var(--cyan))' },
  { tag: tags.comment, color: 'var(--ne-code-comment, var(--text-mute))', fontStyle: 'italic' },
  { tag: tags.propertyName, color: 'var(--ne-code-property, var(--accent))' },
  { tag: tags.definition(tags.variableName), color: 'var(--ne-code-definition, var(--text))' },
  { tag: [tags.variableName, tags.name], color: 'var(--ne-code-variable, var(--text-dim))' },
  { tag: tags.function(tags.variableName), color: 'var(--ne-code-function, var(--cyan))' },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: 'var(--ne-code-punctuation, var(--text-mute))' },
  { tag: tags.invalid, color: 'var(--danger)' },
]);

function completeStructuralScope(
  context: CompletionContext,
  completionContext?: JsCodeCompletionContext
): CompletionResult | null {
  const match = context.matchBefore(/(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*\.?/);
  if (!match) {
    if (!context.explicit) return null;
    return {
      from: context.pos,
      options: topLevelCompletions(completionContext),
      validFor: /^[\w$]*$/,
    };
  }

  if (!context.explicit && match.from === match.to) return null;

  const parsed = parseCompletionToken(match.text, context.pos);
  const options = completionsForPath(parsed.objectPath, completionContext);
  if (options.length === 0) return null;

  return {
    from: parsed.from,
    options,
    validFor: /^[\w$]*$/,
  };
}

function parseCompletionToken(text: string, position: number): { objectPath: string[]; from: number } {
  const isMemberAccess = text.endsWith('.');
  const searchable = isMemberAccess ? text.slice(0, -1) : text;
  const segments = searchable ? searchable.split('.') : [];
  const current = isMemberAccess ? '' : segments.at(-1) ?? '';
  const objectPath = isMemberAccess ? segments : segments.slice(0, -1);

  return {
    objectPath,
    from: position - current.length,
  };
}

function completionsForPath(
  objectPath: string[],
  completionContext?: JsCodeCompletionContext
): Completion[] {
  if (objectPath.length === 0) return topLevelCompletions(completionContext);

  const [root, ...rest] = objectPath;
  if (root === 'scope') return completionsForPath(rest, completionContext);

  if (root === 'inputs' && rest.length === 0) {
    return memberCompletions(completionContext?.inputs, 'inputs');
  }

  if (root === 'outputs' && rest.length === 0) {
    return memberCompletions(completionContext?.outputs, 'outputs');
  }

  if (root === 'props') {
    return fieldCompletions(completionContext?.fields, rest, 'props');
  }

  if (root === 'target' && rest.length === 0) {
    return [
      { label: 'typeId', type: 'property', detail: 'attached type id', boost: 90 },
      { label: 'nodeId', type: 'property', detail: 'node instance id', boost: 89 },
      { label: 'props', type: 'property', detail: 'attached field values', boost: 88 },
    ];
  }

  if (root === 'target' && rest.length >= 1 && rest[0] === 'props') {
    return fieldCompletions(completionContext?.fields, rest.slice(1), 'target.props');
  }

  if (root === 'chart' && rest.length === 0) {
    return chartCompletions();
  }

  return [];
}

function topLevelCompletions(completionContext?: JsCodeCompletionContext): Completion[] {
  return [
    { label: 'inputs', type: 'namespace', detail: 'input ports', boost: 100 },
    { label: 'outputs', type: 'namespace', detail: 'mutable output record', boost: 99 },
    { label: 'chart', type: 'namespace', detail: 'chart data helpers', boost: 98 },
    ...(completionContext?.fields?.length ? [{ label: 'props', type: 'namespace', detail: 'attached field values', boost: 97 }] : []),
    ...(completionContext?.fields?.length ? [{ label: 'target', type: 'namespace', detail: 'attached type context', boost: 87 }] : []),
    { label: 'scope', type: 'namespace', detail: 'full script context', boost: 86 },
    { label: 'return', type: 'keyword', apply: 'return ', detail: 'required output return', boost: 80 },
  ];
}

function chartCompletions(): Completion[] {
  return [
    { label: 'pie', type: 'function', apply: 'pie("Title", )', detail: 'canonical pie chart block', boost: 95 },
    { label: 'pies', type: 'function', apply: 'pies()', detail: 'multiple canonical pie chart blocks', boost: 94 },
    { label: 'bar', type: 'function', apply: 'bar("Title", )', detail: 'canonical bar chart block', boost: 93 },
    { label: 'item', type: 'function', apply: 'item("Label", 0)', detail: 'canonical chart item', boost: 92 },
  ];
}

function memberCompletions(items: JsCodeCompletionItem[] = [], section: string): Completion[] {
  return items
    .filter(item => isSafeIdentifier(item.name))
    .map(item => ({
      label: item.name,
      type: 'property',
      detail: item.detail,
      section,
      boost: 90,
    }));
}

function fieldCompletions(
  items: JsCodeCompletionItem[] = [],
  path: string[],
  section: string
): Completion[] {
  const completions = new Map<string, Completion>();

  for (const item of items) {
    const segments = item.name.split('.').filter(Boolean);
    if (!pathMatches(segments, path)) continue;

    const label = segments[path.length];
    if (!label || !isSafeIdentifier(label)) continue;

    const isLeaf = segments.length === path.length + 1;
    const existing = completions.get(label);
    if (existing && existing.detail !== 'field group') continue;

    completions.set(label, {
      label,
      type: isLeaf ? 'property' : 'namespace',
      detail: isLeaf ? item.detail : 'field group',
      section,
      boost: isLeaf ? 90 : 85,
    });
  }

  return [...completions.values()];
}

function pathMatches(segments: string[], path: string[]): boolean {
  if (segments.length <= path.length) return false;
  return path.every((segment, index) => segments[index] === segment);
}

function isSafeIdentifier(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}
