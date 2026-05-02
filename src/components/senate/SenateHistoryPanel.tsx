import { useState } from 'react';
import { useAppContext } from '../../store';
import { ProjectionChart } from '../Projection';
import type { SenateHistoryEntry } from '../../models/types';
import { EmptyState } from '../ui/EmptyState';
import { ListSurface } from '../ui/ListSurface';
import { Panel } from '../ui/Panel';

export function SenateHistoryPanel() {
  const { state, updateState, showToast } = useAppContext();
  const history: SenateHistoryEntry[] = state.senate.history;
  const [openItems, setOpenItems] = useState<Record<number, boolean>>({});

  const toggle = (i: number) => setOpenItems(p => ({ ...p, [i]: !p[i] }));

  const deleteItem = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    updateState(s => { s.senate.history.splice(i, 1); return s; });
    showToast('Record deleted');
  };

  const clearAll = () => {
    if (!window.confirm('Clear entire senate history?')) return;
    updateState(s => { s.senate.history = []; return s; });
    showToast('History cleared');
  };

  const setName = (i: number, name: string) => {
    updateState(s => { s.senate.history[i].name = name; return s; });
  };

  return (
    <Panel
      title="Senate Election Archive"
      bodyClassName="no-scroll"
      actions={<button className="ghost small" onClick={clearAll}>Clear All</button>}
    >
      <ListSurface className="history-list">
        {history.length === 0 ? (
          <EmptyState>No senate elections recorded.</EmptyState>
        ) : history.map((h, i) => {
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
            <div key={h.timestamp} className={`history-item ${openItems[i] ? 'open' : ''}`}>
              <div className="h-head" onClick={() => toggle(i)}>
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
                  <button className="danger" onClick={(e) => deleteItem(i, e)}>DEL</button>
                </div>
              </div>
              <div className="h-body" style={{ display: openItems[i] ? 'grid' : 'none' }}>
                <div className="history-name-row">
                  <input
                    className="history-name-input"
                    value={h.name ?? ''}
                    onChange={e => setName(i, e.target.value)}
                    placeholder="Name this election…"
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
