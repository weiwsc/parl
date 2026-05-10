import { clone, useAppContext, uid } from '../store';
import type { Alliance, Faction, MapRegion, Stratum, TrashItem } from '../models/types';
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
      s.map.regions.forEach(region => { region.strataWeights[data.id] = 0; });
      s.trash.strata.splice(idx, 1);
      return s;
    });
    showToast('Stratum restored');
  };

  const restoreFaction = (item: TrashItem<Faction>, idx: number) => {
    updateState(s => {
      const data = { ...item.data };
      if (s.factions.find(f => f.id === data.id)) data.id = uid('f');
      data.participatesInElections = data.participatesInElections === true;
      data.description = data.description ?? '';
      data.globalModifiers = data.globalModifiers ?? [];
      delete (data as { support?: Record<string, number> }).support;
      s.factions.push(data);
      s.trash.factions.splice(idx, 1);
      return s;
    });
    showToast('Faction restored');
  };

  const restoreAlliance = (item: TrashItem<Alliance>, idx: number) => {
    updateState(s => {
      const data = { ...item.data, factionIds: [...(item.data.factionIds ?? [])] };
      if (s.alliances.find(alliance => alliance.id === data.id)) data.id = uid('a');
      s.alliances.push(data);
      s.trash.alliances.splice(idx, 1);
      return s;
    });
    showToast('Alliance restored');
  };

  const restoreRegion = (item: TrashItem<MapRegion>, idx: number) => {
    updateState(s => {
      const data = clone(item.data);
      if (s.map.regions.find(region => region.id === data.id)) data.id = uid('r');
      s.map.regions.push(data);
      s.trash.regions.splice(idx, 1);
      return s;
    });
    showToast('Region restored');
  };

  const purgeTrash = () => {
    if (!window.confirm('Empty recycle bin permanently?')) return;
    updateState(s => {
      s.trash.strata = [];
      s.trash.factions = [];
      s.trash.alliances = [];
      s.trash.regions = [];
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
        <div>
          <h3>Deleted Alliances</h3>
          {state.trash.alliances.length === 0 ? (
            <EmptyState>Empty.</EmptyState>
          ) : (
            <ListSurface className="history-list">
              {state.trash.alliances.map((item, idx) => (
                <div key={item.id} className="trash-item">
                  <div className="swatch" style={{ background: item.data.color }}></div>
                  <div className="name">{item.data.name}</div>
                  <div className="stamp">{new Date(item.deletedAt).toLocaleTimeString()}</div>
                  <button className="small" onClick={() => restoreAlliance(item, idx)}>Restore</button>
                </div>
              ))}
            </ListSurface>
          )}
        </div>
        <div>
          <h3>Deleted Regions</h3>
          {state.trash.regions.length === 0 ? (
            <EmptyState>Empty.</EmptyState>
          ) : (
            <ListSurface className="history-list">
              {state.trash.regions.map((item, idx) => (
                <div key={item.id} className="trash-item">
                  <div className="swatch" style={{ background: 'var(--cyan)' }}></div>
                  <div className="name">{item.data.name}</div>
                  <div className="stamp">{new Date(item.deletedAt).toLocaleTimeString()}</div>
                  <button className="small" onClick={() => restoreRegion(item, idx)}>Restore</button>
                </div>
              ))}
            </ListSurface>
          )}
        </div>
      </div>
    </Panel>
  );
}
