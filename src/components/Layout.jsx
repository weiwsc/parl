import { useState } from 'react';
import { useAppContext, THEMES } from '../store';

export function Header({ onElection, onImport, onExport }) {
  const { state, updateState } = useAppContext();

  return (
    <header className="app-header">
      <span className="crest"></span>
      <div className="title-block">
        <h1>Parliament Simulator</h1>
        <span className="sub">// LEGISLATIVE PROJECTION SYSTEM &middot; v3.0 //</span>
      </div>
      <div className="header-spacer"></div>

      <div className="theme-switch" title="Theme">
        {THEMES.map((theme) => {
          const colors = {
            gold: '#d4a14a',
            green: '#5dee7b',
            cyan: '#5fc8ff',
            crimson: '#ff5b5b',
          };
          return (
            <button
              key={theme}
              className={state.ui.theme === theme ? 'active' : ''}
              onClick={() => updateState({ ui: { ...state.ui, theme } })}
              title={`Theme: ${theme}`}
            >
              <span className="swatch" style={{ background: colors[theme], color: colors[theme] }}></span>
            </button>
          );
        })}
      </div>

      <label className="toggle" title="Unaligned Seats Mode">
        <input
          type="checkbox"
          checked={state.unalignedMode}
          onChange={(e) => updateState({ unalignedMode: e.target.checked })}
        />
        <span className="switch"></span>
        <span className="toggle-label">Unaligned Seats</span>
      </label>

      <div className="control-group">
        <label>Total Seats</label>
        <input
          type="number"
          min="10"
          max="2000"
          step="1"
          value={state.totalSeats}
          onChange={(e) => updateState({ totalSeats: parseInt(e.target.value) || 200 })}
        />
      </div>
      <button className="primary" onClick={onElection}>⚙ Hold Election</button>
      <button onClick={onExport}>Export</button>
      <button onClick={() => document.getElementById('importFile').click()}>Import</button>
      <input type="file" id="importFile" accept="application/json" style={{ display: 'none' }} onChange={onImport} />
    </header>
  );
}

export function Tabs() {
  const { state, updateState } = useAppContext();
  const { tab } = state.ui;
  const histCount = state.history.length;
  const trashCount = state.trash.strata.length + state.trash.factions.length;

  const setTab = (t) => updateState((s) => { s.ui.tab = t; return s; });

  return (
    <nav className="tab-bar">
      <button className={`tab ${tab === 'sim' ? 'active' : ''}`} onClick={() => setTab('sim')}>
        Simulator
      </button>
      <button className={`tab ${tab === 'hist' ? 'active' : ''}`} onClick={() => setTab('hist')}>
        History <span className="badge">{histCount}</span>
      </button>
      <button className={`tab ${tab === 'trash' ? 'active' : ''}`} onClick={() => setTab('trash')}>
        Recycle Bin <span className="badge">{trashCount}</span>
      </button>
    </nav>
  );
}

export function Toast() {
  const { toastMessage, savedStatus } = useAppContext();

  return (
    <>
      <div id="toast" className={`${toastMessage ? 'show' : ''} ${toastMessage?.type || ''}`}>
        {toastMessage?.message}
      </div>
      <div className={`save-indicator ${savedStatus ? 'show' : ''}`}>SAVED</div>
    </>
  );
}
