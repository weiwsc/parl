import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import type { AppState, EventSettings, EventStoryRank, TimelineEvent } from '../models/types';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_NEWSPAPER_NAME, useAppContext, uid } from '../store';
import { useLang } from '../utils/localization';
import { renderMarkdown } from '../utils/markdown';
import { AppHeader } from './ui/AppHeader';
import { EmptyState } from './ui/EmptyState';
import { TabBar, type TabItem } from './ui/TabBar';
import { EditorField } from './ui/EditorField';
import { EditorShell } from './ui/EditorShell';
import { EventCard } from './events/EventCard';
import { EventEditor } from './events/EventEditor';
import {
  eventRankValue,
  groupEventsByTurn,
  groupIssuesByTurn,
  issueNameForTurn,
  normalizeEventRank,
  type EventTurnGroup,
} from './events/eventUtils';

type EventView = 'news' | 'timeline' | 'editor' | 'archive';

const NEWSPAPER_EXPORT_WIDTH = 1180;

const fallbackEventSettings: EventSettings = {
  newspaperName: DEFAULT_NEWSPAPER_NAME,
  issues: [],
};

function createDefaultEvent(existing: TimelineEvent[], turn?: number): TimelineEvent {
  const latestTurn = existing.length > 0 ? Math.max(...existing.map(item => item.turn)) : 0;
  const now = Date.now();
  return {
    id: uid('event'),
    turn: typeof turn === 'number' ? Math.max(0, Math.round(turn)) : latestTurn + 1,
    rank: 'feature',
    title: 'Untitled Event',
    subtitle: undefined,
    body: '',
    createdAt: now,
    updatedAt: now,
  };
}

function toRoman(num: number): string {
  if (!Number.isFinite(num) || num < 1) return '0';
  const pairs: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let n = Math.floor(num);
  let result = '';
  for (const [v, s] of pairs) {
    while (n >= v) { result += s; n -= v; }
  }
  return result;
}

function ensureEventSettings(state: AppState): EventSettings {
  if (!state.eventSettings) {
    state.eventSettings = { newspaperName: DEFAULT_NEWSPAPER_NAME, issues: [] };
  }
  if (!state.eventSettings.newspaperName?.trim()) {
    state.eventSettings.newspaperName = DEFAULT_NEWSPAPER_NAME;
  }
  if (!Array.isArray(state.eventSettings.issues)) {
    state.eventSettings.issues = [];
  }
  return state.eventSettings;
}

function ensureIssueForTurn(state: AppState, turn: number) {
  const settings = ensureEventSettings(state);
  const normalizedTurn = Math.max(0, Math.round(turn));
  if (settings.issues.some(issue => issue.turn === normalizedTurn)) return;
  settings.issues.push({
    id: uid('issue'),
    turn: normalizedTurn,
    newspaperName: settings.newspaperName,
    archivedAt: Date.now(),
  });
}

function nextTurnNumber(events: TimelineEvent[], settings: EventSettings): number {
  const turns = [
    ...events.map(item => item.turn),
    ...settings.issues.map(issue => issue.turn),
    0,
  ];
  return Math.max(...turns) + 1;
}

function safeFilePart(value: string): string {
  return value.trim().replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'newspaper';
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function cdata(value: string): string {
  return value.replace(/]]>/g, ']]]]><![CDATA[>');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function collectDocumentCss(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      chunks.push(Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n'));
    } catch {
      // Ignore browser-protected stylesheets. App CSS is same-origin in Vite.
    }
  }
  return chunks.join('\n');
}

function createNewspaperExportClone(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.classList.remove('selected');
  clone.classList.add('event-newspaper--export');
  clone.querySelectorAll('.selected').forEach(node => node.classList.remove('selected'));
  return clone;
}

function measureNewspaperExportHeight(element: HTMLElement): number {
  const rectHeight = element.getBoundingClientRect().height;
  const footer = element.querySelector<HTMLElement>('.event-newspaper-footer');
  const footerBottom = footer ? footer.offsetTop + footer.offsetHeight : 0;
  return Math.max(1, Math.ceil(Math.max(element.scrollHeight, element.offsetHeight, rectHeight, footerBottom) + 24));
}

function createNewspaperSvg(element: HTMLElement, _issueName: string, _turn: number): Blob {
  const css = collectDocumentCss();
  const clone = createNewspaperExportClone(element);

  const theme = escapeAttribute(document.body.getAttribute('data-theme') ?? '');
  const exportCss = `
    html, body, .event-export-root { margin: 0; padding: 0; width: ${NEWSPAPER_EXPORT_WIDTH}px; background: transparent; }
    .event-newspaper--export {
      width: ${NEWSPAPER_EXPORT_WIDTH}px !important;
      max-width: none !important;
      margin: 0 !important;
      box-shadow: none !important;
    }
  `;

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = `${NEWSPAPER_EXPORT_WIDTH}px`;
  host.style.pointerEvents = 'none';
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    const height = measureNewspaperExportHeight(clone);
    const html = clone.outerHTML;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${NEWSPAPER_EXPORT_WIDTH}" height="${height}" viewBox="0 0 ${NEWSPAPER_EXPORT_WIDTH} ${height}">
  <foreignObject x="0" y="0" width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" class="event-export-root" data-theme="${theme}">
      <style><![CDATA[${cdata(css)}]]></style>
      <style><![CDATA[${cdata(exportCss)}]]></style>
      ${html}
    </div>
  </foreignObject>
</svg>`;
    return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  } finally {
    host.remove();
  }
}

async function exportNewspaperElement(element: HTMLElement, issueName: string, turn: number): Promise<'png' | 'svg'> {
  const clone = createNewspaperExportClone(element);

  const fileBase = `${safeFilePart(issueName)}_turn_${turn}`;
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = `${NEWSPAPER_EXPORT_WIDTH}px`;
  host.style.pointerEvents = 'none';
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await document.fonts?.ready;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);

    const height = measureNewspaperExportHeight(clone);
    const maxCanvasSide = 16384;
    const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1, maxCanvasSide / Math.max(NEWSPAPER_EXPORT_WIDTH, height)));
    const canvas = await html2canvas(clone, {
      backgroundColor: null,
      logging: false,
      scale,
      useCORS: true,
      width: NEWSPAPER_EXPORT_WIDTH,
      height,
      windowWidth: NEWSPAPER_EXPORT_WIDTH,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
    });

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not encode newspaper image')), 'image/png');
    });
    downloadBlob(pngBlob, `${fileBase}.png`);
    return 'png';
  } catch (error) {
    console.warn('PNG newspaper export failed; downloading SVG image instead.', error);
    downloadBlob(createNewspaperSvg(element, issueName, turn), `${fileBase}.svg`);
    return 'svg';
  } finally {
    host.remove();
  }
}

interface EventNewsViewProps {
  group: EventTurnGroup | null;
  groups: EventTurnGroup[];
  settings: EventSettings;
  selectedId: string | null;
  onTurnChange: (turn: number) => void;
  onOpenEvent: (id: string) => void;
}

function EventNewsView({ group, groups, settings, selectedId, onTurnChange, onOpenEvent }: EventNewsViewProps) {
  const t = useLang();
  const { showToast } = useAppContext();
  const newspaperRef = useRef<HTMLElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  if (!group) {
    return <EmptyState className="events-empty event-newspaper-empty">{t('no_events')}</EmptyState>;
  }

  const issueName = issueNameForTurn(settings, group.turn);

  const handleExport = async () => {
    if (!newspaperRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const format = await exportNewspaperElement(newspaperRef.current, issueName, group.turn);
      showToast(format === 'svg' ? t('newspaper_exported_svg') : t('newspaper_exported'));
    } catch (error) {
      console.error('Newspaper export failed:', error);
      const detail = error instanceof Error ? `: ${error.message}` : '';
      showToast(`${t('newspaper_export_failed')}${detail}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="event-news">
      <div className="event-news-toolbar">
        {groups.length > 1 && (
          <div className="event-issue-switcher">
            <span>{t('archive')}</span>
            <select data-ro-allow value={group.turn} onChange={event => onTurnChange(Number(event.target.value))}>
              {groups.map(item => (
                <option key={item.turn} value={item.turn}>{t('turn')} {item.turn} · {issueNameForTurn(settings, item.turn)}</option>
              ))}
            </select>
          </div>
        )}
        <button className="event-newspaper-export" data-ro-allow onClick={handleExport} disabled={isExporting}>
          {isExporting ? t('exporting') : t('export_newspaper')}
        </button>
      </div>

      <section className="event-newspaper" ref={newspaperRef}>
        <header className="event-newspaper-masthead">
          <div className="event-newspaper-volume-bar">
            <span>{t('turn')} <strong>{toRoman(group.turn)}</strong></span>
            <span>№ <strong>{String(group.turn).padStart(3, '0')}</strong></span>
            <span><strong>{group.events.length}</strong> {t('stories')}</span>
          </div>
          <div className="event-newspaper-masthead-main">
            <div className="event-newspaper-masthead-text">
              <h1>{issueName}</h1>
              <div className="event-newspaper-tagline">{t('chronicle_archive')}</div>
            </div>
            <div className="event-newspaper-stamp" aria-hidden="true">
              <span className="event-newspaper-stamp-num">{toRoman(group.turn)}</span>
              <span className="event-newspaper-stamp-label">{t('turn')}</span>
            </div>
          </div>
        </header>

        <div className="event-news-grid">
          {group.events.length === 0 && <EmptyState className="events-empty event-newspaper-empty">{t('no_events_turn')}</EmptyState>}
          {group.events.map(item => (
            <EventCard
              key={item.id}
              event={item}
              mode="news"
              selected={selectedId === item.id}
              onOpen={() => onOpenEvent(item.id)}
            />
          ))}
        </div>

        <footer className="event-newspaper-footer" aria-hidden="true">
          <span><strong>№ {String(group.turn).padStart(3, '0')}</strong> · {issueName}</span>
          <span className="event-newspaper-footer-mark" />
          <span>{t('chronicle_archive')} · <strong>{group.events.length}</strong> {t('stories')}</span>
        </footer>
      </section>
    </div>
  );
}

interface EventGroupsProps {
  groups: EventTurnGroup[];
  selectedId: string | null;
  onOpenEvent: (id: string) => void;
}

function EventTimelineView({ groups, selectedId, onOpenEvent }: EventGroupsProps) {
  const t = useLang();
  if (groups.length === 0) {
    return <EmptyState className="events-empty">{t('no_events')}</EmptyState>;
  }

  return (
    <div className="event-timeline">
      {groups.map(group => (
        <section key={group.turn} className="event-timeline-row">
          <div className="event-timeline-axis">
            <span className="event-timeline-node" />
          </div>
          <div className="event-timeline-content">
            <div className="event-timeline-turn">{t('turn')} {group.turn}</div>
            <div className="event-timeline-stack">
              {group.events.map(item => (
                <EventCard
                  key={item.id}
                  event={item}
                  mode="timeline"
                  selected={selectedId === item.id}
                  onOpen={() => onOpenEvent(item.id)}
                />
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

interface EventArchiveViewProps {
  groups: EventTurnGroup[];
  settings: EventSettings;
  onOpenTurn: (turn: number) => void;
}

function EventArchiveView({ groups, settings, onOpenTurn }: EventArchiveViewProps) {
  const t = useLang();
  if (groups.length === 0) {
    return <EmptyState className="events-empty">{t('no_events')}</EmptyState>;
  }

  return (
    <div className="event-archive-grid">
      {groups.map(group => (
        <button key={group.turn} data-ro-allow className="event-archive-issue" onClick={() => onOpenTurn(group.turn)}>
          <span className="event-archive-label">{t('turn')} {group.turn}</span>
          <span className="event-archive-name">{issueNameForTurn(settings, group.turn)}</span>
          <span className="event-archive-meta">{group.events.length} {t('stories')}</span>
          {group.events[0] && <span className="event-archive-lead">{group.events[0].title}</span>}
        </button>
      ))}
    </div>
  );
}

interface EventsEditorViewProps {
  events: TimelineEvent[];
  settings: EventSettings;
  selectedEvent: TimelineEvent | null;
  selectedId: string | null;
  currentTurn: number;
  turnOptions: number[];
  canEdit: boolean;
  onTurnChange: (turn: number) => void;
  onAddTurn: () => void;
  onSelect: (id: string) => void;
  onCreate: (turn?: number) => void;
  onChange: (event: TimelineEvent) => void;
  onDuplicate: (event: TimelineEvent) => void;
  onDelete: (id: string) => void;
  onPaperNameChange: (name: string) => void;
  onIssueNameChange: (turn: number, name: string) => void;
}

function EventsEditorView({
  events,
  settings,
  selectedEvent,
  selectedId,
  currentTurn,
  turnOptions,
  canEdit,
  onTurnChange,
  onAddTurn,
  onSelect,
  onCreate,
  onChange,
  onDuplicate,
  onDelete,
  onPaperNameChange,
  onIssueNameChange,
}: EventsEditorViewProps) {
  const t = useLang();
  const sorted = useMemo(
    () => [...events]
      .filter(item => item.turn === currentTurn)
      .sort((a, b) => b.createdAt - a.createdAt),
    [currentTurn, events],
  );
  const visibleSelectedEvent = selectedEvent?.turn === currentTurn ? selectedEvent : null;
  const issueTitle = issueNameForTurn(settings, currentTurn);

  return (
    <div className="events-editor-page">
      <section className="events-editor-left">
        <EditorShell className="event-paper-settings" title={t('turn_newspaper').toUpperCase()}>
            <EditorField label={t('turn_filter').toUpperCase()}>
              <div className="event-turn-filter">
                <input
                  data-ro-allow
                  className="ui-input"
                  type="number"
                  min="0"
                  step="1"
                  value={currentTurn}
                  onChange={event => onTurnChange(Number(event.target.value))}
                />
                {turnOptions.length > 0 && (
                  <select
                    data-ro-allow
                    className="ui-select"
                    value={currentTurn}
                    onChange={event => onTurnChange(Number(event.target.value))}
                  >
                    {turnOptions.map(turn => (
                      <option key={turn} value={turn}>{t('turn')} {turn}</option>
                    ))}
                  </select>
                )}
                {canEdit && <button className="btn ghost small event-turn-add" onClick={onAddTurn}>+ {t('add_turn')}</button>}
              </div>
            </EditorField>
            <EditorField label={t('turn_newspaper_name').toUpperCase()}>
              <input
                className="ui-input"
                value={issueTitle}
                disabled={!canEdit}
                onChange={event => onIssueNameChange(currentTurn, event.target.value)}
                placeholder={settings.newspaperName}
              />
            </EditorField>
            <EditorField label={t('default_newspaper_name').toUpperCase()} optional={t('new_turns')}>
              <input
                className="ui-input"
                value={settings.newspaperName}
                disabled={!canEdit}
                onChange={event => onPaperNameChange(event.target.value)}
                placeholder={t('newspaper_name_placeholder')}
              />
            </EditorField>
        </EditorShell>

        <EditorShell
          className="event-editor-index"
          headClassName="event-editor-index-hd"
          title={`${t('turn')} ${currentTurn}`}
          actions={canEdit && <button className="primary small" onClick={() => onCreate(currentTurn)}>+ {t('new_event')}</button>}
          bodyClassName="event-editor-index-body"
        >
          <div className="event-editor-list">
            {sorted.length === 0 && <EmptyState className="event-editor-list-empty">{t('no_events_turn')}</EmptyState>}
            {sorted.map(item => (
              <button
                key={item.id}
                data-ro-allow
                className={`event-editor-list-item${selectedId === item.id ? ' active' : ''}`}
                onClick={() => onSelect(item.id)}
              >
                <span>{t('turn')} {item.turn}</span>
                <strong>{item.title}</strong>
                {item.subtitle && <em>{item.subtitle}</em>}
              </button>
            ))}
          </div>
        </EditorShell>
      </section>

      <EventEditor
        event={visibleSelectedEvent}
        canEdit={canEdit}
        onChange={onChange}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    </div>
  );
}

interface EventArticleDialogProps {
  event: TimelineEvent;
  issueName: string;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}

function EventArticleDialog({ event, issueName, canEdit, onClose, onEdit }: EventArticleDialogProps) {
  const t = useLang();
  const rank = normalizeEventRank(eventRankValue(event));

  return (
    <div className="event-article-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="event-article-frame"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-article-title"
        onMouseDown={eventMouse => eventMouse.stopPropagation()}
      >
        <article className="event-newspaper event-article-paper">
          <div className="event-article-actions">
            {canEdit && <button className="event-article-edit" onClick={onEdit}>{t('edit')}</button>}
            <button className="event-article-close" data-ro-allow onClick={onClose}>{t('close')}</button>
          </div>

          <header className="event-newspaper-masthead event-article-masthead">
            <div className="event-newspaper-volume-bar">
              <span>{t('turn')} <strong>{toRoman(event.turn)}</strong></span>
              <span>№ <strong>{String(event.turn).padStart(3, '0')}</strong></span>
              <span>{t('chronicle_archive')}</span>
            </div>
            <h1>{issueName}</h1>
          </header>

          <section className="event-article-content">
            <div className="event-article-issue-stamp" aria-hidden="true">
              <span>{toRoman(event.turn)}</span>
              <small>{t('turn')}</small>
            </div>
            <div className="event-article-rank">{rankLabel(t, rank)}</div>
            <h2 id="event-article-title">{event.title}</h2>
            {event.subtitle && <p className="event-article-subtitle">{event.subtitle}</p>}
            <div
              className="event-article-body law-md-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(event.body, t('no_event_body'), { leadDropCap: true }) }}
            />
          </section>
        </article>
      </div>
    </div>
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

export function EventsPage() {
  const { state, updateState, showToast } = useAppContext();
  const { canEdit } = useAuth();
  const t = useLang();
  const [view, setView] = useState<EventView>('news');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [newsTurn, setNewsTurn] = useState<number | null>(null);
  const [editorTurn, setEditorTurn] = useState<number | null>(null);
  const events = state.events ?? [];
  const eventSettings = state.eventSettings ?? fallbackEventSettings;

  useEffect(() => {
    if (selectedId && !events.some(item => item.id === selectedId)) {
      setSelectedId(null);
    }
    if (readingId && !events.some(item => item.id === readingId)) {
      setReadingId(null);
    }
  }, [events, readingId, selectedId]);

  const newsGroups = useMemo(() => groupIssuesByTurn(events, eventSettings, 'desc'), [events, eventSettings]);
  const timelineGroups = useMemo(() => groupEventsByTurn(events, 'asc'), [events]);
  const latestTurn = newsGroups[0]?.turn ?? null;

  useEffect(() => {
    if (latestTurn === null) {
      if (newsTurn !== null) setNewsTurn(null);
      return;
    }
    if (newsTurn === null || !newsGroups.some(group => group.turn === newsTurn)) {
      setNewsTurn(latestTurn);
    }
  }, [latestTurn, newsGroups, newsTurn]);

  useEffect(() => {
    if (latestTurn === null) {
      if (editorTurn !== null) setEditorTurn(null);
      return;
    }
    if (editorTurn === null) setEditorTurn(latestTurn);
  }, [editorTurn, latestTurn]);

  const selectedEvent = useMemo(
    () => events.find(item => item.id === selectedId) ?? null,
    [events, selectedId],
  );
  const readingEvent = useMemo(
    () => events.find(item => item.id === readingId) ?? null,
    [events, readingId],
  );
  const activeNewsGroup = useMemo(
    () => newsGroups.find(group => group.turn === newsTurn) ?? newsGroups[0] ?? null,
    [newsGroups, newsTurn],
  );
  const turnCount = newsGroups.length;
  const turnOptions = useMemo(
    () => {
      const turns = new Set<number>(newsGroups.map(group => group.turn));
      if (editorTurn !== null) turns.add(editorTurn);
      return [...turns].sort((a, b) => b - a);
    },
    [editorTurn, newsGroups],
  );
  const effectiveEditorTurn = editorTurn ?? latestTurn ?? 1;

  const tabs: TabItem<EventView>[] = [
    { id: 'news', label: t('news'), badge: events.length },
    { id: 'timeline', label: t('timeline'), badge: turnCount },
    { id: 'archive', label: t('archive'), badge: turnCount },
    { id: 'editor', label: t('editor'), badge: events.length },
  ];

  const openEventArticle = useCallback((id: string) => {
    setReadingId(id);
  }, []);

  const editEvent = useCallback((event: TimelineEvent) => {
    setSelectedId(event.id);
    setEditorTurn(event.turn);
    setReadingId(null);
    setView('editor');
  }, []);

  const openTurnInNews = useCallback((turn: number) => {
    setNewsTurn(turn);
    setView('news');
  }, []);

  const handleViewChange = useCallback((nextView: EventView) => {
    if (nextView === 'news' && latestTurn !== null) {
      setNewsTurn(latestTurn);
    }
    setView(nextView);
  }, [latestTurn]);

  const handleCreate = useCallback((turn?: number) => {
    const event = createDefaultEvent(events, turn);
    updateState(s => {
      if (!Array.isArray(s.events)) s.events = [];
      ensureIssueForTurn(s, event.turn);
      s.events.push(event);
      return s;
    });
    setSelectedId(event.id);
    setEditorTurn(event.turn);
    setView('editor');
    showToast(t('event_created'));
  }, [events, showToast, t, updateState]);

  const handleChange = useCallback((updated: TimelineEvent) => {
    updateState(s => {
      if (!Array.isArray(s.events)) s.events = [];
      ensureIssueForTurn(s, updated.turn);
      const index = s.events.findIndex(item => item.id === updated.id);
      if (index >= 0) s.events[index] = updated;
      return s;
    });
    if (updated.id === selectedId) {
      setEditorTurn(updated.turn);
    }
  }, [selectedId, updateState]);

  const handleDuplicate = useCallback((event: TimelineEvent) => {
    const now = Date.now();
    const copy: TimelineEvent = {
      ...event,
      id: uid('event'),
      title: `${event.title} Copy`,
      createdAt: now,
      updatedAt: now,
    };
    updateState(s => {
      if (!Array.isArray(s.events)) s.events = [];
      ensureIssueForTurn(s, copy.turn);
      s.events.push(copy);
      return s;
    });
    setSelectedId(copy.id);
    setEditorTurn(copy.turn);
    showToast(t('event_created'));
  }, [showToast, t, updateState]);

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm(t('delete_event_confirm'))) return;
    updateState(s => {
      if (!Array.isArray(s.events)) s.events = [];
      s.events = s.events.filter(item => item.id !== id);
      return s;
    });
    setSelectedId(current => current === id ? null : current);
    showToast(t('event_deleted'));
  }, [showToast, t, updateState]);

  const handlePaperNameChange = useCallback((name: string) => {
    updateState(s => {
      if (Array.isArray(s.events)) {
        for (const event of s.events) ensureIssueForTurn(s, event.turn);
      }
      const settings = ensureEventSettings(s);
      settings.newspaperName = name;
      return s;
    });
  }, [updateState]);

  const handleIssueNameChange = useCallback((turn: number, name: string) => {
    updateState(s => {
      ensureIssueForTurn(s, turn);
      const settings = ensureEventSettings(s);
      const issue = settings.issues.find(item => item.turn === turn);
      if (issue) issue.newspaperName = name;
      return s;
    });
  }, [updateState]);

  const handleAddTurn = useCallback(() => {
    const turn = nextTurnNumber(events, eventSettings);
    updateState(s => {
      ensureIssueForTurn(s, turn);
      return s;
    });
    setEditorTurn(turn);
    setSelectedId(null);
    showToast(t('turn_created'));
  }, [eventSettings, events, showToast, t, updateState]);

  const handleEditorTurnChange = useCallback((turn: number) => {
    const nextTurn = Number.isFinite(turn) ? Math.max(0, Math.round(turn)) : 0;
    setEditorTurn(nextTurn);
    setSelectedId(current => {
      const selected = events.find(item => item.id === current);
      return selected?.turn === nextTurn ? current : null;
    });
  }, [events]);

  return (
    <div className={`events-page events-page--${view}`}>
      {view !== 'news' && (
        <AppHeader title={t('events')} subtitle={`// ${t('chronicle_archive')} · v1.0 //`} className="events-header">
          <div className="events-header-stats">
            <span>{events.length} {t('event_count')}</span>
            <span>{turnCount} {t('turns')}</span>
          </div>
          {canEdit && <button className="primary small" onClick={() => handleCreate()}>+ {t('new_event')}</button>}
        </AppHeader>
      )}

      <TabBar active={view} items={tabs} onChange={handleViewChange} />

      <section className="events-feed">
        {view === 'news' && (
          <EventNewsView
            group={activeNewsGroup}
            groups={newsGroups}
            settings={eventSettings}
            selectedId={readingId}
            onTurnChange={setNewsTurn}
            onOpenEvent={openEventArticle}
          />
        )}

        {view === 'timeline' && (
          <EventTimelineView
            groups={timelineGroups}
            selectedId={readingId}
            onOpenEvent={openEventArticle}
          />
        )}

        {view === 'archive' && (
          <EventArchiveView
            groups={newsGroups}
            settings={eventSettings}
            onOpenTurn={openTurnInNews}
          />
        )}

        {view === 'editor' && (
          <EventsEditorView
            events={events}
            settings={eventSettings}
            selectedEvent={selectedEvent}
            selectedId={selectedId}
            currentTurn={effectiveEditorTurn}
            turnOptions={turnOptions}
            canEdit={canEdit}
            onTurnChange={handleEditorTurnChange}
            onAddTurn={handleAddTurn}
            onSelect={setSelectedId}
            onCreate={handleCreate}
            onChange={handleChange}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onPaperNameChange={handlePaperNameChange}
            onIssueNameChange={handleIssueNameChange}
          />
        )}
      </section>

      {readingEvent && (
        <EventArticleDialog
          event={readingEvent}
          issueName={issueNameForTurn(eventSettings, readingEvent.turn)}
          canEdit={canEdit}
          onClose={() => setReadingId(null)}
          onEdit={() => editEvent(readingEvent)}
        />
      )}
    </div>
  );
}
