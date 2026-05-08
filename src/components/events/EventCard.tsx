import type { KeyboardEvent } from 'react';
import type { TimelineEvent } from '../../models/types';
import { useLang } from '../../utils/localization';
import { renderMarkdown } from '../../utils/markdown';
import { eventRankValue, normalizeEventRank } from './eventUtils';

interface EventCardProps {
  event: TimelineEvent;
  mode: 'news' | 'timeline';
  selected: boolean;
  onOpen: () => void;
}

export function EventCard({ event, mode, selected, onOpen }: EventCardProps) {
  const t = useLang();
  const rank = normalizeEventRank(eventRankValue(event));
  const bodyPreview = createBodyPreview(event.body, t('no_event_body'), rank);
  const className = [
    'event-card',
    `event-card--${mode}`,
    `event-card--rank-${rank}`,
    selected ? 'selected' : '',
  ].filter(Boolean).join(' ');

  const handleKeyDown = (keyboardEvent: KeyboardEvent<HTMLElement>) => {
    if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return;
    keyboardEvent.preventDefault();
    onOpen();
  };

  return (
    <article
      className={className}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      aria-pressed={selected}
    >
      <div className="event-card-top">
        <span className="event-card-turn">{t('turn')} {event.turn}</span>
        <span className="event-card-rank">{rankLabel(t, rank)}</span>
      </div>

      <div className="event-card-title-row">
        <h3>{event.title}</h3>
        {mode === 'timeline' && <span className="event-card-dot" />}
      </div>

      {event.subtitle && <div className="event-card-subtitle">{event.subtitle}</div>}

      {mode === 'news' && (
        <div className="event-card-body-wrap">
          <div
            className="event-card-body law-md-body"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(bodyPreview.markdown, t('no_event_body')) }}
          />
        </div>
      )}
    </article>
  );
}

function createBodyPreview(
  markdown: string,
  emptyText: string,
  rank: ReturnType<typeof normalizeEventRank>,
): { markdown: string; clipped: boolean } {
  const source = markdown.trim();
  if (!source) return { markdown: emptyText, clipped: false };

  const limit = previewLimitForRank(rank);
  let used = 0;
  let clipped = false;
  const lines: string[] = [];

  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line) {
      if (lines.length > 0 && lines.at(-1) !== '') lines.push('');
      continue;
    }

    const remaining = limit - used;
    if (remaining <= 0) {
      appendContinuation(lines);
      clipped = true;
      break;
    }

    const length = Array.from(line).length;
    if (length <= remaining) {
      lines.push(line);
      used += length + 1;
      continue;
    }

    lines.push(`${trimMarkdownLine(line, remaining)} [...]`);
    clipped = true;
    break;
  }

  const preview = lines.join('\n').trim();
  return { markdown: preview || emptyText, clipped };
}

function appendContinuation(lines: string[]) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].trim()) continue;
    lines[index] = `${lines[index].trimEnd()} [...]`;
    return;
  }
}

function trimMarkdownLine(line: string, maxChars: number): string {
  if (maxChars <= 0) return '';
  const chars = Array.from(line);
  let trimmed = chars.slice(0, maxChars).join('').trimEnd();
  trimmed = trimmed.replace(/[*_`]+$/g, '').trimEnd();
  return trimmed;
}

function previewLimitForRank(rank: ReturnType<typeof normalizeEventRank>): number {
  switch (rank) {
    case 'breaking': return 380;
    case 'headline': return 240;
    case 'feature': return 145;
    case 'dispatch': return 92;
    case 'notice': return 70;
  }
}

function rankLabel(t: ReturnType<typeof useLang>, rank: ReturnType<typeof normalizeEventRank>): string {
  switch (rank) {
    case 'notice': return t('event_rank_notice');
    case 'dispatch': return t('event_rank_dispatch');
    case 'feature': return t('event_rank_feature');
    case 'headline': return t('event_rank_headline');
    case 'breaking': return t('event_rank_breaking');
  }
}
