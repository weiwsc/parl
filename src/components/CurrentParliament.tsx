import { useMemo } from 'react';
import { useAppContext } from '../store';
import { fmtFull, getLatestElectionEntry, getLatestElectionProjection } from '../utils/compute';
import { useLang } from '../utils/localization';
import { ProjectionChart } from './Projection';
import { EmptyState } from './ui/EmptyState';
import { Panel } from './ui/Panel';

export function CurrentParliamentPanel() {
  const { state } = useAppContext();
  const t = useLang();

  const latest = useMemo(() => getLatestElectionEntry(state), [state]);
  const projection = useMemo(() => getLatestElectionProjection(state), [state]);

  if (!latest || !projection) {
    return (
      <Panel title={t('current_parliament')}>
        <EmptyState>{t('no_current_parliament')}</EmptyState>
      </Panel>
    );
  }

  const entries = [...projection.entries]
    .filter(entry => !entry.isUnaligned)
    .sort((a, b) => b.seats - a.seats || b.power - a.power);
  const timestamp = new Date(latest.timestamp).toLocaleString();

  return (
    <div className="current-parliament-grid">
      <ProjectionChart projection={projection} title={t('current_parliament')} />

      <Panel
        title={latest.name || t('latest_election')}
        subtitle={timestamp}
        bodyClassName="current-parliament-body"
      >
        <div className="current-parliament-meta">
          <span>{latest.totalSeats} {t('seats')}</span>
          <span>{entries.length} {t('factions')}</span>
        </div>

        <div className="current-parliament-list">
          {entries.map(entry => (
            <div key={entry.faction.id} className="current-parliament-row">
              <span className="swatch" style={{ background: entry.faction.color, color: entry.faction.color }} />
              <span className="name">{entry.faction.name}</span>
              <span className="votes">{fmtFull(entry.power)}</span>
              <span className="seats">{entry.seats}</span>
              <span className="pct">{(entry.share * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
