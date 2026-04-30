import { useAppContext } from '../store';

export function TrashPanel() {
  const { state, updateState, showToast } = useAppContext();

  const restoreStratum = (item, idx) => {
    updateState(s => {
      const restored = item.data;
      // Also restore support snapshot
      s.factions.forEach(f => {
        f.support[restored.id] = item.supportSnapshot[f.id] || 0;
      });
      s.strata.push(restored);
      s.trash.strata.splice(idx, 1);
      return s;
    });
    showToast('Stratum restored');
  };

  const restoreFaction = (item, idx) => {
    updateState(s => {
      s.factions.push(item.data);
      s.trash.factions.splice(idx, 1);
      return s;
    });
    showToast('Faction restored');
  };

  const emptyTrash = () => {
    if (!window.confirm('Empty recycle bin permanently?')) return;
    updateState(s => {
      s.trash = { strata: [], factions: [] };
      return s;
    });
    showToast('Bin emptied');
  };

  return (
    <div className="panel">
      <span className="corner tl"></span><span className="corner tr"></span>
      <span className="corner bl"></span><span className="corner br"></span>
      <div className="panel-header">
        <h2>Recycle Bin</h2>
        <button className="ghost small" onClick={emptyTrash}>Empty Bin</button>
      </div>
      <div className="panel-body no-scroll">
        {state.trash.strata.length === 0 && state.trash.factions.length === 0 ? (
          <div className="empty">Bin is empty.</div>
        ) : (
          <div className="trash-grid">
            <div>
              <div className="deco-divider">DELETED STRATA</div>
              <div>
                {state.trash.strata.map((item, idx) => (
                  <div key={item.id} className="trash-item">
                    <span className="swatch" style={{ background: '#555' }}></span>
                    <span className="name">{item.data.name}</span>
                    <span className="stamp">{new Date(item.deletedAt).toLocaleString()}</span>
                    <button className="small" onClick={() => restoreStratum(item, idx)}>Restore</button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="deco-divider">DELETED FACTIONS</div>
              <div>
                {state.trash.factions.map((item, idx) => (
                  <div key={item.id} className="trash-item">
                    <span className="swatch" style={{ background: item.data.color, color: item.data.color }}></span>
                    <span className="name">{item.data.name}</span>
                    <span className="stamp">{new Date(item.deletedAt).toLocaleString()}</span>
                    <button className="small" onClick={() => restoreFaction(item, idx)}>Restore</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
