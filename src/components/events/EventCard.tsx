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
        <div
          className="event-card-body law-md-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(event.body, t('no_event_body')) }}
        />
      )}
    </article>
  );
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
