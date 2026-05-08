import type { EventSettings, EventStoryRank, TimelineEvent } from '../../models/types';

export interface EventTurnGroup {
  turn: number;
  events: TimelineEvent[];
}

export const EVENT_RANK_ORDER: EventStoryRank[] = ['notice', 'dispatch', 'feature', 'headline', 'breaking'];

export function normalizeEventRank(value: unknown): EventStoryRank {
  if (EVENT_RANK_ORDER.includes(value as EventStoryRank)) return value as EventStoryRank;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric <= 1) return 'notice';
    if (numeric <= 2) return 'dispatch';
    if (numeric <= 3) return 'feature';
    if (numeric <= 4) return 'headline';
    return 'breaking';
  }
  return 'feature';
}

export function rankWeight(rank: unknown): number {
  const normalized = normalizeEventRank(rank);
  return EVENT_RANK_ORDER.indexOf(normalized) + 1;
}

export function sortEventsForIssue(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) =>
    rankWeight(eventRankValue(b)) - rankWeight(eventRankValue(a))
      || b.createdAt - a.createdAt
      || a.title.localeCompare(b.title)
  );
}

export function groupEventsByTurn(events: TimelineEvent[], order: 'asc' | 'desc'): EventTurnGroup[] {
  const groups = new Map<number, TimelineEvent[]>();
  for (const item of events) {
    const turn = Number.isFinite(item.turn) ? item.turn : 0;
    groups.set(turn, [...(groups.get(turn) ?? []), item]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => order === 'asc' ? a - b : b - a)
    .map(([turn, items]) => ({ turn, events: sortEventsForIssue(items) }));
}

export function groupIssuesByTurn(events: TimelineEvent[], settings: EventSettings, order: 'asc' | 'desc'): EventTurnGroup[] {
  const turns = new Set<number>();
  for (const item of events) turns.add(Number.isFinite(item.turn) ? item.turn : 0);
  for (const issue of settings.issues) turns.add(Number.isFinite(issue.turn) ? issue.turn : 0);

  return [...turns]
    .sort((a, b) => order === 'asc' ? a - b : b - a)
    .map(turn => ({
      turn,
      events: sortEventsForIssue(events.filter(item => item.turn === turn)),
    }));
}

export function issueNameForTurn(settings: EventSettings, turn: number): string {
  return settings.issues.find(issue => issue.turn === turn)?.newspaperName ?? settings.newspaperName;
}

export function eventRankValue(event: TimelineEvent): unknown {
  return event.rank ?? (event as unknown as { importance?: unknown }).importance;
}
