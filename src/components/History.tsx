import { useState } from 'react';
import { useAppContext } from '../store';
import { ProjectionChart } from './Projection';
import { fmtFull } from '../utils/compute';
import type { HistoryEntry } from '../models/types';
import { EmptyState } from './ui/EmptyState';
import { ListSurface } from './ui/ListSurface';
import { Panel } from './ui/Panel';

export function HistoryPanel() {
  const { state, updateState, showToast } = useAppContext();
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const toggleItem = (id: string) => {
    setOpenItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const deleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateState(s => { s.history = s.history.filter(record => record.id !== id); return s; });
    showToast('Record deleted');
  };

  const setName = (id: string, name: string) => {
    updateState(s => {
      const record = s.history.find(item => item.id === id);
      if (record) record.name = name;
      return s;
    });
  };

  const clearAll = () => {
    if (!window.confirm('Clear entire history?')) return;
    updateState(s => {
      s.history = [];
      return s;
    });
    showToast('History cleared');
  };

  return (
    <Panel
      title="Election Archive"
      bodyClassName="no-scroll"
      actions={<button className="ghost small" onClick={clearAll}>Clear All</button>}
    >
      <ListSurface className="history-list">
        {state.history.length === 0 ? (
          <EmptyState>No past elections recorded.</EmptyState>
        ) : (
          state.history.map((h: HistoryEntry) => {
              // Group and sort logic for history
              const groupsMap = new Map<string, {
                isAlliance: boolean,
                id: string,
                name: string,
                color: string,
                power: number,
                seats: number,
                share: number,
                entries: any[]
              }>();

              if (h.projection) {
                h.projection.entries.forEach(e => {
                  const key = e.alliance ? `a_${e.alliance.id}` : `f_${e.faction.id}`;
                  if (!groupsMap.has(key)) {
                    groupsMap.set(key, {
                      isAlliance: !!e.alliance,
                      id: e.alliance ? e.alliance.id : e.faction.id,
                      name: e.alliance ? e.alliance.name : e.faction.name,
                      color: e.alliance ? e.alliance.color : e.faction.color,
                      power: 0,
                      seats: 0,
                      share: 0,
                      entries: []
                    });
                  }
                  const group = groupsMap.get(key)!;
                  group.power += e.power;
                  group.seats += e.seats;
                  group.share += e.share;
                  group.entries.push(e);
                });
              }

              const sortedGroups = Array.from(groupsMap.values()).sort((a, b) => b.seats - a.seats);

              return (
                <div key={h.id} className={`history-item ${openItems[h.id] ? 'open' : ''}`}>
                  <div className="h-head" onClick={() => toggleItem(h.id)}>
                    <span className="stamp">{new Date(h.timestamp).toLocaleTimeString()}</span>
                    <span className="seq">{h.name ? h.name : `SEQ-${h.timestamp.toString().slice(-4)}`}</span>
                    <div className="h-summary">
                      {sortedGroups.filter(g => g.seats > 0).slice(0, 4).map((g, j) => (
                        <span key={j} className="pill" style={{ color: g.color }}>
                          <span className="dot"></span> {g.name} {g.seats}
                        </span>
                      ))}
                      {sortedGroups.length > 4 && <span className="pill" style={{ color: '#8a9bb8' }}>...</span>}
                    </div>
                    <div className="h-actions">
                      <button className="danger" onClick={(e) => deleteItem(h.id, e)}>DEL</button>
                    </div>
                  </div>
                  <div className="h-body" style={{ display: openItems[h.id] ? 'grid' : 'none' }}>
                    <div className="history-name-row">
                      <input
                        className="history-name-input"
                        value={h.name ?? ''}
                        onChange={e => setName(h.id, e.target.value)}
                        placeholder="Name this election…"
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                    {h.projection && <ProjectionChart projection={h.projection} />}
                    <div className="h-meta">
                      {sortedGroups.map((g, j) => (
                        <div key={j} style={{ marginBottom: g.isAlliance ? '8px' : '0' }}>
                          <div className="h-faction" style={{ fontWeight: g.isAlliance ? 'bold' : 'normal', background: g.isAlliance ? 'var(--bg-panel-alt)' : 'transparent', padding: g.isAlliance ? '4px' : '0' }}>
                            <span className="swatch" style={{ background: g.color, color: g.color }}></span>
                            <span className="nm">{g.name}{g.isAlliance ? ' (Alliance)' : ''}</span>
                            <span className="v">{fmtFull(g.power)} PWR</span>
                            <span className="s">{g.seats}</span>
                            <span className="p">{(g.share * 100).toFixed(1)}%</span>
                          </div>
                          {g.isAlliance && g.entries.map((e, k) => (
                            <div key={`sub-${k}`} className="h-faction" style={{ paddingLeft: '24px', opacity: 0.8 }}>
                              <span className="swatch" style={{ background: e.faction.color, color: e.faction.color }}></span>
                              <span className="nm">{e.faction.name}</span>
                              <span className="v">{fmtFull(e.power)} PWR</span>
                              <span className="s">{e.seats}</span>
                              <span className="p">{(e.share * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
          })
        )}
      </ListSurface>
    </Panel>
  );
}
