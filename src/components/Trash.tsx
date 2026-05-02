import { useAppContext, uid } from '../store';
import type { Stratum, Faction, TrashItem } from '../models/types';
import { EmptyState } from './ui/EmptyState';
import { ListSurface } from './ui/ListSurface';
import { Panel } from './ui/Panel';

export function TrashPanel() {
  const { state, updateState, showToast } = useAppContext();

  const restoreStratum = (item: TrashItem<Stratum>, idx: number) => {
    updateState(s => {
      const data = { ...item.data };
      if (s.strata.find(x => x.id === data.id)) data.id = uid('s');
      s.strata.push(data);
      s.factions.forEach(f => {
        const restoredVal = item.supportSnapshot && item.supportSnapshot[f.id] != null ? item.supportSnapshot[f.id] : 0;
        f.support[data.id] = restoredVal;
      });
      s.trash.strata.splice(idx, 1);
      return s;
    });
    showToast('Stratum restored');
  };

  const restoreFaction = (item: TrashItem<Faction>, idx: number) => {
    updateState(s => {
      const data = { ...item.data };
      if (s.factions.find(f => f.id === data.id)) data.id = uid('f');
      s.strata.forEach(st => {
        if (typeof data.support[st.id] !== 'number') data.support[st.id] = 0;
      });
      s.factions.push(data);
      s.trash.factions.splice(idx, 1);
      return s;
    });
    showToast('Faction restored');
  };

  const purgeTrash = () => {
    if (!window.confirm('Empty recycle bin permanently?')) return;
    updateState(s => {
      s.trash.strata = [];
      s.trash.factions = [];
      return s;
    });
    showToast('Trash emptied');
  };

  return (
    <Panel
      title="Recycle Bin"
      actions={<button className="ghost small" onClick={purgeTrash}>Empty Bin</button>}
    >
      <div className="trash-grid">
        <div>
          <h3>Deleted Strata</h3>
          {state.trash.strata.length === 0 ? (
            <EmptyState>Empty.</EmptyState>
          ) : (
            <ListSurface className="history-list">
              {state.trash.strata.map((item, idx) => (
                <div key={item.id} className="trash-item">
                  <div className="swatch" style={{ background: 'var(--text-mute)' }}></div>
                  <div className="name">{item.data.name}</div>
                  <div className="stamp">{new Date(item.deletedAt).toLocaleTimeString()}</div>
                  <button className="small" onClick={() => restoreStratum(item, idx)}>Restore</button>
                </div>
              ))}
            </ListSurface>
          )}
        </div>
        <div>
          <h3>Deleted Factions</h3>
          {state.trash.factions.length === 0 ? (
            <EmptyState>Empty.</EmptyState>
          ) : (
            <ListSurface className="history-list">
              {state.trash.factions.map((item, idx) => (
                <div key={item.id} className="trash-item">
                  <div className="swatch" style={{ background: item.data.color }}></div>
                  <div className="name">{item.data.name}</div>
                  <div className="stamp">{new Date(item.deletedAt).toLocaleTimeString()}</div>
                  <button className="small" onClick={() => restoreFaction(item, idx)}>Restore</button>
                </div>
              ))}
            </ListSurface>
          )}
        </div>
      </div>
    </Panel>
  );
}
