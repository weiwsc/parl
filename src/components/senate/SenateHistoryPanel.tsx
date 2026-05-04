import { useState } from 'react';
import { useAppContext } from '../../store';
import { useLang } from '../../utils/localization';
import { ProjectionChart } from '../Projection';
import type { SenateHistoryEntry } from '../../models/types';
import { EmptyState } from '../ui/EmptyState';
import { ListSurface } from '../ui/ListSurface';
import { Panel } from '../ui/Panel';

export function SenateHistoryPanel() {
  const { state, updateState, showToast } = useAppContext();
  const t = useLang();
  const history: SenateHistoryEntry[] = state.senate.history;
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setOpenItems(p => ({ ...p, [id]: !p[id] }));

  const deleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateState(s => { s.senate.history = s.senate.history.filter(record => record.id !== id); return s; });
    showToast(t('record_deleted'));
  };

  const clearAll = () => {
    if (!window.confirm(t('clear_senate_history_confirm'))) return;
    updateState(s => { s.senate.history = []; return s; });
    showToast(t('history_cleared'));
  };

  const setName = (id: string, name: string) => {
    updateState(s => {
      const record = s.senate.history.find(item => item.id === id);
      if (record) record.name = name;
      return s;
    });
  };

  return (
    <Panel
      title={t('senate_archive')}
      bodyClassName="no-scroll"
      actions={<button className="ghost small" onClick={clearAll}>{t('clear_all')}</button>}
    >
      <ListSurface className="history-list">
        {history.length === 0 ? (
          <EmptyState>{t('no_senate_elections')}</EmptyState>
        ) : history.map((h) => {
          const groupsMap = new Map<string, { id: string; name: string; color: string; seats: number; share: number }>();
          h.projection.entries.forEach(e => {
            const key = e.alliance ? `a_${e.alliance.id}` : `f_${e.faction.id}`;
            if (!groupsMap.has(key)) groupsMap.set(key, {
              id: key, name: e.alliance ? e.alliance.name : e.faction.name,
              color: e.alliance ? e.alliance.color : e.faction.color, seats: 0, share: 0,
            });
            const g = groupsMap.get(key)!;
            g.seats += e.seats; g.share += e.share;
          });
          const groups = Array.from(groupsMap.values()).sort((a, b) => b.seats - a.seats);

          return (
            <div key={h.id} className={`history-item ${openItems[h.id] ? 'open' : ''}`}>
              <div className="h-head" onClick={() => toggle(h.id)}>
                <span className="stamp">{new Date(h.timestamp).toLocaleTimeString()}</span>
                <span className="seq">SEQ-{h.timestamp.toString().slice(-4)}</span>
                <div className="h-summary">
                  {groups.filter(g => g.seats > 0).slice(0, 4).map((g, j) => (
                    <span key={j} className="pill" style={{ color: g.color }}>
                      <span className="dot" /> {g.name} {g.seats}
                    </span>
                  ))}
                  {groups.length > 4 && <span className="pill" style={{ color: '#8a9bb8' }}>...</span>}
                </div>
                <div className="h-actions">
                  <button className="danger" onClick={(e) => deleteItem(h.id, e)}>{t('delete_short')}</button>
                </div>
              </div>
              <div className="h-body" style={{ display: openItems[h.id] ? 'grid' : 'none' }}>
                <div className="history-name-row">
                  <input
                    className="history-name-input"
                    value={h.name ?? ''}
                    onChange={e => setName(h.id, e.target.value)}
                    placeholder={t('name_this_election')}
                    onClick={e => e.stopPropagation()}
                  />
                </div>
                <ProjectionChart projection={h.projection} />
                <div className="h-meta">
                  {groups.map((g, j) => (
                    <div key={j} className="h-faction">
                      <span className="swatch" style={{ background: g.color }} />
                      <span className="nm">{g.name}</span>
                      <span className="s">{g.seats}</span>
                      <span className="p">{(g.share * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </ListSurface>
    </Panel>
  );
}
