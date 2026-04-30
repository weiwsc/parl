import { useState } from 'react';
import { useAppContext } from '../store';
import { ProjectionChart } from './Projection';
import { fmtFull } from '../utils/compute';

export function HistoryPanel() {
  const { state, updateState, showToast } = useAppContext();
  const [openItems, setOpenItems] = useState({});

  const toggleItem = (idx) => {
    setOpenItems(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const deleteItem = (idx, e) => {
    e.stopPropagation();
    updateState(s => {
      s.history.splice(idx, 1);
      return s;
    });
    showToast('Record deleted');
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
    <div className="panel">
      <span className="corner tl"></span><span className="corner tr"></span>
      <span className="corner bl"></span><span className="corner br"></span>
      <div className="panel-header">
        <h2>Election Archive</h2>
        <button className="ghost small" onClick={clearAll}>Clear All</button>
      </div>
      <div className="panel-body no-scroll">
        <div className="history-list">
          {state.history.length === 0 ? (
            <div className="empty">No past elections recorded.</div>
          ) : (
            state.history.map((h, i) => (
              <div key={h.timestamp} className={`history-item ${openItems[i] ? 'open' : ''}`}>
                <div className="h-head" onClick={() => toggleItem(i)}>
                  <span className="stamp">{new Date(h.timestamp).toLocaleTimeString()}</span>
                  <span className="seq">SEQ-{h.timestamp.toString().slice(-4)}</span>
                  <div className="h-summary">
                    {h.projection.entries.filter(e => e.seats > 0).slice(0, 4).map((e, j) => (
                      <span key={j} className="pill" style={{ color: e.faction.color }}>
                        <span className="dot"></span> {e.faction.name} {e.seats}
                      </span>
                    ))}
                    {h.projection.entries.length > 4 && <span className="pill" style={{ color: '#8a9bb8' }}>...</span>}
                  </div>
                  <div className="h-actions">
                    <button className="danger" onClick={(e) => deleteItem(i, e)}>DEL</button>
                  </div>
                </div>
                <div className="h-body" style={{ display: openItems[i] ? 'grid' : 'none' }}>
                  <ProjectionChart projection={h.projection} />
                  <div className="h-meta">
                    {h.projection.entries.map((e, j) => (
                      <div key={j} className="h-faction">
                        <span className="swatch" style={{ background: e.faction.color, color: e.faction.color }}></span>
                        <span className="nm">{e.faction.name}</span>
                        <span className="v">{fmtFull(e.power)} PWR</span>
                        <span className="s">{e.seats}</span>
                        <span className="p">{(e.share * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
