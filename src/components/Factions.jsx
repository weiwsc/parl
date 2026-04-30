import { useAppContext, uid } from '../store';
import { escapeHtml, fmtCount, stratumTotalSupport } from '../utils/compute';

function FactionCard({ faction, index, isFirst, isLast }) {
  const { state, updateState, showToast } = useAppContext();
  const expanded = !!state.ui.factionExpanded[faction.id];

  const updateFaction = (field, value) => {
    updateState((s) => {
      const idx = s.factions.findIndex(x => x.id === faction.id);
      if (idx !== -1) s.factions[idx][field] = value;
      return s;
    });
  };

  const updateSupport = (sid, value) => {
    updateState((s) => {
      const idx = s.factions.findIndex(x => x.id === faction.id);
      if (idx !== -1) s.factions[idx].support[sid] = parseInt(value) || 0;
      return s;
    });
  };

  const toggleExpand = () => {
    updateState((s) => {
      s.ui.factionExpanded[faction.id] = !s.ui.factionExpanded[faction.id];
      return s;
    });
  };

  const deleteFaction = () => {
    updateState((s) => {
      const idx = s.factions.findIndex(x => x.id === faction.id);
      if (idx !== -1) {
        s.trash.factions.push({ id: faction.id, deletedAt: Date.now(), data: JSON.parse(JSON.stringify(faction)) });
        s.factions.splice(idx, 1);
      }
      return s;
    });
    showToast('Faction moved to bin');
  };

  const moveFaction = (dir) => {
    updateState((s) => {
      const idx = s.factions.findIndex(x => x.id === faction.id);
      if (idx !== -1) {
        const swapIdx = idx + dir;
        if (swapIdx >= 0 && swapIdx < s.factions.length) {
          [s.factions[idx], s.factions[swapIdx]] = [s.factions[swapIdx], s.factions[idx]];
        }
      }
      return s;
    });
  };

  const resetSupport = () => {
    updateState((s) => {
      const idx = s.factions.findIndex(x => x.id === faction.id);
      if (idx !== -1) {
        Object.keys(s.factions[idx].support).forEach(k => s.factions[idx].support[k] = 0);
      }
      return s;
    });
  };

  return (
    <div className="item">
      <div className="item-head">
        <span className="swatch" style={{ background: faction.color, color: faction.color }}>
          <input type="color" value={faction.color} onChange={(e) => updateFaction('color', e.target.value)} />
        </span>
        <input className="name" value={faction.name} onChange={(e) => updateFaction('name', e.target.value)} />
        <button className={`expand-btn ${expanded ? 'open' : ''}`} title="Edit per-stratum supporter counts" onClick={toggleExpand}>
          <span className="arrow">▸</span> Support
        </button>
        <button className="danger" onClick={deleteFaction}>DEL</button>
      </div>
      <div className="item-body" style={{ display: expanded ? 'block' : 'none' }}>
        {state.strata.length === 0 ? (
          <div className="empty" style={{ padding: '6px' }}>No strata yet.</div>
        ) : (
          state.strata.map((s) => {
            const v = faction.support[s.id] || 0;
            const over = stratumTotalSupport(state, s) > s.population;
            return (
              <div key={s.id} className={`stratum-support-row ${over ? 'over' : ''}`}>
                <label>
                  <span className="lbl-name">{escapeHtml(s.name)}</span>
                  <span className="popinfo">/{fmtCount(s.population)}</span>
                </label>
                <input type="number" min="0" step="1" value={v} onChange={(e) => updateSupport(s.id, e.target.value)} />
              </div>
            );
          })
        )}
        <div className="item-actions">
          <button className="small" onClick={() => moveFaction(-1)} disabled={isFirst}>← Left</button>
          <button className="small" onClick={() => moveFaction(1)} disabled={isLast}>Right →</button>
          <button className="small ghost" onClick={resetSupport}>Reset to 0</button>
        </div>
      </div>
    </div>
  );
}

export function FactionsList() {
  const { state, updateState } = useAppContext();

  const addFaction = () => {
    updateState((s) => {
      const newId = uid('f');
      const colors = ['#7a2030','#2c6fb1','#d4a14a','#c44a2a','#5fa863','#8a4cb1','#3aa39e','#b8862e','#aa5f8e','#4a8a3e'];
      const color = colors[s.factions.length % colors.length];
      const support = {};
      s.strata.forEach(st => support[st.id] = 0);
      s.factions.push({ id: newId, name: 'New Faction', color, support });
      return s;
    });
  };

  return (
    <div className="panel">
      <span className="corner tl"></span><span className="corner tr"></span>
      <span className="corner bl"></span><span className="corner br"></span>
      <div className="panel-header"><h2>Political Factions</h2></div>
      <div className="panel-body">
        {state.factions.length === 0 ? (
          <div className="empty">No factions defined.</div>
        ) : (
          state.factions.map((f, i) => (
            <FactionCard key={f.id} faction={f} index={i} isFirst={i === 0} isLast={i === state.factions.length - 1} />
          ))
        )}
        <button className="add-btn" onClick={addFaction}>+ Add Faction</button>
      </div>
    </div>
  );
}
