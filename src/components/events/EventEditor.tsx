import { useState } from 'react';
import type { EventStoryRank, TimelineEvent } from '../../models/types';
import { useLang } from '../../utils/localization';
import { renderMarkdown } from '../../utils/markdown';
import { EmptyState } from '../ui/EmptyState';
import { EditorField } from '../ui/EditorField';
import { EditorShell } from '../ui/EditorShell';
import { EVENT_RANK_ORDER, eventRankValue, normalizeEventRank } from './eventUtils';

interface EventEditorProps {
  event: TimelineEvent | null;
  canEdit: boolean;
  onChange: (event: TimelineEvent) => void;
  onDuplicate: (event: TimelineEvent) => void;
  onDelete: (id: string) => void;
}

export function EventEditor({ event, canEdit, onChange, onDuplicate, onDelete }: EventEditorProps) {
  const t = useLang();
  const [preview, setPreview] = useState(false);

  if (!event) {
    return (
      <EditorShell className="event-editor event-editor--empty" title={t('event_editor').toUpperCase()} bodyClassName="event-editor-empty-body">
        <EmptyState className="event-editor-empty">{t('select_event_to_open')}</EmptyState>
      </EditorShell>
    );
  }

  const rank = normalizeEventRank(eventRankValue(event));

  const update = (patch: Partial<TimelineEvent>) => {
    onChange({ ...event, rank, ...patch, updatedAt: Date.now() });
  };

  const updateTurn = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    update({ turn: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 });
  };

  const updateRank = (value: string) => {
    update({ rank: normalizeEventRank(value) });
  };

  return (
    <EditorShell
      className="event-editor"
      headClassName="event-editor-hd"
      title={t('event_editor').toUpperCase()}
      kicker={`${t('turn')} ${event.turn} · ${rankLabel(t, rank)}`}
      footClassName="event-editor-foot"
      footer={canEdit && (
        <>
          <button className="btn ghost small" onClick={() => onDuplicate(event)}>{t('duplicate')}</button>
          <button className="btn ghost small danger" onClick={() => onDelete(event.id)}>{t('delete_short')}</button>
        </>
      )}
    >
        <div className="event-editor-grid">
          <EditorField label={t('turn_number').toUpperCase()}>
            <input
              className="ui-input"
              type="number"
              min="0"
              step="1"
              value={event.turn}
              disabled={!canEdit}
              onChange={inputEvent => updateTurn(inputEvent.target.value)}
            />
          </EditorField>

          <EditorField label={t('story_rank').toUpperCase()}>
            <select
              className="ui-select"
              value={rank}
              disabled={!canEdit}
              onChange={inputEvent => updateRank(inputEvent.target.value)}
            >
              {EVENT_RANK_ORDER.map(item => (
                <option key={item} value={item}>{rankLabel(t, item)}</option>
              ))}
            </select>
          </EditorField>
        </div>

        <EditorField label={t('title').toUpperCase()}>
          <input
            className="ui-input"
            value={event.title}
            disabled={!canEdit}
            onChange={inputEvent => update({ title: inputEvent.target.value })}
            placeholder={t('event_title_placeholder')}
          />
        </EditorField>

        <EditorField label={t('subtitle').toUpperCase()} optional={t('optional')}>
          <input
            className="ui-input"
            value={event.subtitle ?? ''}
            disabled={!canEdit}
            onChange={inputEvent => update({ subtitle: inputEvent.target.value.trim() ? inputEvent.target.value : undefined })}
            placeholder={t('short_description_placeholder')}
          />
        </EditorField>

        <EditorField
          label={t('body').toUpperCase()}
          optional={t('markdown')}
          actions={<button data-ro-allow className="law-preview-btn" onClick={() => setPreview(current => !current)}>{preview ? `✎ ${t('edit').toUpperCase()}` : `◉ ${t('preview').toUpperCase()}`}</button>}
        >
          {preview
            ? <div className="law-md-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(event.body, t('no_event_body')) }} />
            : (
              <textarea
                className="ui-textarea event-body-textarea"
                value={event.body}
                disabled={!canEdit}
                onChange={inputEvent => update({ body: inputEvent.target.value })}
                rows={12}
                placeholder={t('event_body_placeholder')}
              />
            )
          }
        </EditorField>
    </EditorShell>
  );
}

function rankLabel(t: ReturnType<typeof useLang>, rank: EventStoryRank): string {
  switch (rank) {
    case 'notice': return t('event_rank_notice');
    case 'dispatch': return t('event_rank_dispatch');
    case 'feature': return t('event_rank_feature');
    case 'headline': return t('event_rank_headline');
    case 'breaking': return t('event_rank_breaking');
  }
}
