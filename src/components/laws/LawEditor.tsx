import { useState } from 'react';
import { uid } from '../../store';
import { lawStatusLabel, useLang } from '../../utils/localization';
import type { Law, LawClause, LawStatus } from '../../models/types';
import { renderMarkdown } from './markdown';
import { EditorField } from '../ui/EditorField';
import { EditorShell } from '../ui/EditorShell';

const LAW_STATUS_OPTIONS: LawStatus[] = ['draft', 'voting', 'effect', 'failed', 'abolished'];

interface ClauseEditorProps {
  clauses: LawClause[];
  onChange: (clauses: LawClause[]) => void;
}

function ClauseEditor({ clauses, onChange }: ClauseEditorProps) {
  const t = useLang();
  const update = (index: number, clause: LawClause) => {
    const next = [...clauses];
    next[index] = clause;
    onChange(next);
  };
  const addClause = () => onChange([...clauses, { id: uid('c'), text: '', level: 0 }]);
  const del = (index: number) => onChange(clauses.filter((_, itemIndex) => itemIndex !== index));
  const move = (index: number, dir: number) => {
    const next = [...clauses], target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const indent = (index: number, delta: number) => {
    const clause = { ...clauses[index], level: Math.max(0, Math.min(3, clauses[index].level + delta)) };
    update(index, clause);
  };

  return (
    <div className="clause-editor">
      {clauses.map((clause, index) => (
        <div key={clause.id} className="clause-row" style={{ paddingLeft: `${clause.level * 18 + 4}px` }}>
          <button className="clause-btn" onClick={() => indent(index,-1)} title={t('outdent')} disabled={clause.level === 0}>←</button>
          <button className="clause-btn" onClick={() => indent(index,+1)} title={t('indent')} disabled={clause.level === 3}>→</button>
          <span className="clause-bullet">{'◦●◈◆'[clause.level]}</span>
          <input
            className="clause-input"
            value={clause.text}
            onChange={event => update(index, { ...clause, text: event.target.value })}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onChange([...clauses.slice(0,index+1), { id:uid('c'), text:'', level:clause.level }, ...clauses.slice(index+1)]);
              }
              if (event.key === 'Tab') {
                event.preventDefault();
                indent(index, event.shiftKey ? -1 : 1);
              }
              if (event.key === 'Backspace' && clause.text === '') {
                event.preventDefault();
                del(index);
              }
            }}
            placeholder={t('clause_text_placeholder')}
          />
          <button className="clause-btn" onClick={() => move(index,-1)} disabled={index === 0}>↑</button>
          <button className="clause-btn" onClick={() => move(index,+1)} disabled={index === clauses.length - 1}>↓</button>
          <button className="clause-btn clause-del" onClick={() => del(index)}>✕</button>
        </div>
      ))}
      <button className="clause-add-btn" onClick={addClause}>+ {t('add_clause')}</button>
    </div>
  );
}

interface LawEditorProps {
  initial: Partial<Law>;
  onSave: (law: Law) => void;
  onCancel: () => void;
}

export function LawEditor({ initial, onSave, onCancel }: LawEditorProps) {
  const t = useLang();
  const [name, setName] = useState(initial.name ?? '');
  const [subtitle, setSubtitle] = useState(initial.subtitle ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [clauses, setClauses] = useState<LawClause[]>(initial.clauses ?? []);
  const [preview, setPreview] = useState(false);
  const [isConstitution, setIsConstitution] = useState(initial.isConstitution ?? false);
  const [status, setStatus] = useState<LawStatus>(initial.status ?? 'draft');

  const save = () => {
    if (!name.trim()) return;
    onSave({
      id: initial.id ?? uid('law'),
      name: name.trim(),
      subtitle: subtitle.trim() || undefined,
      description,
      clauses,
      status,
      isConstitution,
      factionStances: initial.factionStances ?? {},
      senateFactionStances: initial.senateFactionStances ?? {},
      createdAt: initial.createdAt ?? Date.now(),
      votedAt: initial.votedAt,
    });
  };

  return (
    <EditorShell
      className="law-editor"
      title={initial.id ? t('edit_bill').toUpperCase() : t('new_bill').toUpperCase()}
      footer={(
        <>
          <button className="btn ghost small" onClick={onCancel}>{t('cancel')}</button>
          <button className="btn primary small" onClick={save} disabled={!name.trim()}>
            {initial.id ? t('save_changes') : t('create_bill')}
          </button>
        </>
      )}
    >
        <EditorField label={t('title').toUpperCase()}>
          <input className="ui-input" value={name} onChange={event => setName(event.target.value)} placeholder={t('bill_title_placeholder')} autoFocus />
        </EditorField>
        <EditorField label={t('subtitle').toUpperCase()} optional={t('optional')}>
          <input className="ui-input" value={subtitle} onChange={event => setSubtitle(event.target.value)} placeholder={t('short_description_placeholder')} />
        </EditorField>
        <EditorField label={t('status').toUpperCase()}>
          <select
            className={`ui-select law-field-select--${status}`}
            value={status}
            onChange={event => setStatus(event.target.value as LawStatus)}
          >
            {LAW_STATUS_OPTIONS.map(option => (
              <option key={option} value={option}>{lawStatusLabel(t, option)}</option>
            ))}
          </select>
        </EditorField>
        <EditorField
          label={t('description').toUpperCase()}
          optional={t('markdown')}
          actions={<button className="law-preview-btn" onClick={() => setPreview(current => !current)}>{preview ? `✎ ${t('edit').toUpperCase()}` : `◉ ${t('preview').toUpperCase()}`}</button>}
        >
          {preview
            ? <div className="law-md-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(description, t('no_description')) }} />
            : <textarea className="ui-textarea" value={description} onChange={event => setDescription(event.target.value)} rows={6} placeholder={t('markdown_placeholder')} />
          }
        </EditorField>
        <EditorField label={t('clauses').toUpperCase()}>
          <ClauseEditor clauses={clauses} onChange={setClauses} />
        </EditorField>
        <EditorField inline>
          <label className="toggle law-constitution-toggle" title={t('constitutional_law_hint')}>
            <input type="checkbox" checked={isConstitution} onChange={event => setIsConstitution(event.target.checked)} />
            <span className="switch" />
            <span className="toggle-label">⚖ {t('constitutional_law')}</span>
          </label>
        </EditorField>
    </EditorShell>
  );
}
