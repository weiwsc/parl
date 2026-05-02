import { useState } from 'react';
import { uid } from '../../store';
import type { Law, LawClause } from '../../models/types';
import { renderMarkdown } from './markdown';

interface ClauseEditorProps {
  clauses: LawClause[];
  onChange: (clauses: LawClause[]) => void;
}

function ClauseEditor({ clauses, onChange }: ClauseEditorProps) {
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
          <button className="clause-btn" onClick={() => indent(index,-1)} title="Outdent" disabled={clause.level === 0}>←</button>
          <button className="clause-btn" onClick={() => indent(index,+1)} title="Indent" disabled={clause.level === 3}>→</button>
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
            placeholder="Clause text…"
          />
          <button className="clause-btn" onClick={() => move(index,-1)} disabled={index === 0}>↑</button>
          <button className="clause-btn" onClick={() => move(index,+1)} disabled={index === clauses.length - 1}>↓</button>
          <button className="clause-btn clause-del" onClick={() => del(index)}>✕</button>
        </div>
      ))}
      <button className="clause-add-btn" onClick={addClause}>+ Add Clause</button>
    </div>
  );
}

interface LawEditorProps {
  initial: Partial<Law>;
  onSave: (law: Law) => void;
  onCancel: () => void;
}

export function LawEditor({ initial, onSave, onCancel }: LawEditorProps) {
  const [name, setName] = useState(initial.name ?? '');
  const [subtitle, setSubtitle] = useState(initial.subtitle ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [clauses, setClauses] = useState<LawClause[]>(initial.clauses ?? []);
  const [preview, setPreview] = useState(false);
  const [isConstitution, setIsConstitution] = useState(initial.isConstitution ?? false);

  const save = () => {
    if (!name.trim()) return;
    onSave({
      id: initial.id ?? uid('law'),
      name: name.trim(),
      subtitle: subtitle.trim() || undefined,
      description,
      clauses,
      status: initial.status ?? 'draft',
      isConstitution,
      factionStances: initial.factionStances ?? {},
      createdAt: initial.createdAt ?? Date.now(),
      votedAt: initial.votedAt,
    });
  };

  return (
    <div className="law-editor">
      <div className="law-editor-hd">
        <span className="law-editor-title">{initial.id ? 'EDIT BILL' : 'NEW BILL'}</span>
      </div>
      <div className="law-editor-body">
        <div className="law-field">
          <label className="law-field-label">TITLE</label>
          <input className="law-field-input" value={name} onChange={event => setName(event.target.value)} placeholder="Bill title…" autoFocus />
        </div>
        <div className="law-field">
          <label className="law-field-label">SUBTITLE <span className="law-field-opt">(optional)</span></label>
          <input className="law-field-input" value={subtitle} onChange={event => setSubtitle(event.target.value)} placeholder="Short description…" />
        </div>
        <div className="law-field">
          <div className="law-field-label-row">
            <label className="law-field-label">DESCRIPTION <span className="law-field-opt">(markdown)</span></label>
            <button className="law-preview-btn" onClick={() => setPreview(current => !current)}>{preview ? '✎ EDIT' : '◉ PREVIEW'}</button>
          </div>
          {preview
            ? <div className="law-md-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(description) }} />
            : <textarea className="law-field-textarea" value={description} onChange={event => setDescription(event.target.value)} rows={6} placeholder={"Use **bold**, *italic*, # Heading, - list item…"} />
          }
        </div>
        <div className="law-field">
          <label className="law-field-label">CLAUSES</label>
          <ClauseEditor clauses={clauses} onChange={setClauses} />
        </div>
        <div className="law-field law-field--inline">
          <label className="toggle law-constitution-toggle" title="Constitutional laws are displayed separately in the Constitution tab">
            <input type="checkbox" checked={isConstitution} onChange={event => setIsConstitution(event.target.checked)} />
            <span className="switch" />
            <span className="toggle-label">⚖ Constitutional Law</span>
          </label>
        </div>
      </div>
      <div className="law-editor-foot">
        <button className="btn ghost small" onClick={onCancel}>Cancel</button>
        <button className="btn primary small" onClick={save} disabled={!name.trim()}>
          {initial.id ? 'Save Changes' : 'Create Bill'}
        </button>
      </div>
    </div>
  );
}
