import { useAppContext } from '../store';
import type { ChangeEvent } from 'react';
import { useLang } from '../utils/localization';
import { useAuth } from '../context/AuthContext';
//import { APP_MODE } from '../config';

interface HeaderProps {
  onElection: () => void;
  onImport: (e: ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
}

export function Header({ onElection }: Pick<HeaderProps, 'onElection'>) {
  const { state, updateState } = useAppContext();
  const { isAdmin, mode } = useAuth();
  const t = useLang();

  return (
    <header className="app-header">
      <span className="crest"></span>
      <div className="title-block">
        <h1>{t("parliament")}</h1>
        <span className="sub">// LEGISLATIVE PROJECTION SYSTEM &middot; v3.0 //</span>
      </div>
      <div className="header-spacer"></div>

      {mode === 'hosted' && (
        <span className={`auth-badge auth-badge--${isAdmin ? 'admin' : 'guest'}`}>
          {isAdmin ? `◈ ${t("admin")}` : `◌ ${t("guest")}`}
        </span>
      )}

      <label className="toggle" title={t("unaligned_seats")}>
        <input type="checkbox" checked={state.unalignedMode}
          onChange={(e) => updateState({ unalignedMode: e.target.checked })} />
        <span className="switch"></span>
        <span className="toggle-label">{t("unaligned_seats")}</span>
      </label>

      <div className="control-group">
        <label>{t("total_seats")}</label>
        <input type="number" min="10" max="2000" step="1" value={state.totalSeats}
          onChange={(e) => updateState({ totalSeats: parseInt(e.target.value) || 200 })} />
      </div>

      <button className="primary" onClick={onElection}>⚙ {t("hold_election")}</button>
    </header>
  );
}

// ─── Tabs (within parliament module) ─────────────────────────────────────────

export function Tabs() {
  const { state, updateState } = useAppContext();
  const { tab } = state.ui;
  const t = useLang();
  const histCount  = state.history.length;
  const trashCount = state.trash.strata.length + state.trash.factions.length;

  const setTab = (t: string) => updateState(s => { s.ui.tab = t; return s; });

  return (
    <nav className="tab-bar">
      <button data-ro-allow className={`tab ${tab === 'sim'   ? 'active' : ''}`} onClick={() => setTab('sim')}>
        {t("election")}
      </button>
      <button data-ro-allow className={`tab ${tab === 'hist'  ? 'active' : ''}`} onClick={() => setTab('hist')}>
        {t("election_history")} <span className="badge">{histCount}</span>
      </button>
      <button data-ro-allow className={`tab ${tab === 'trash' ? 'active' : ''}`} onClick={() => setTab('trash')}>
        Recycle Bin <span className="badge">{trashCount}</span>
      </button>
    </nav>
  );
}

// ─── Sidebar (app-level navigation) ──────────────────────────────────────────

const TOP_ITEMS = [
  { id: 'parliament', icon: '◈', label: 'PARL', title: 'Parliament' },
  { id: 'map',        icon: '◎', label: 'MAP',  title: 'Map' },
  { id: 'law',        icon: '⚖', label: 'LAW',  title: 'Senate Floor' },
  { id: 'economy',    icon: '◆', label: 'ECON', title: 'Economy (coming soon)',       disabled: true },
  { id: 'intel',      icon: '◌', label: 'INTEL',title: 'Intelligence (coming soon)', disabled: true },
] as const;

export function Sidebar() {
  const { state, updateState } = useAppContext();
  const { tab } = state.ui;

  const PARL_TABS = new Set(['sim', 'hist', 'trash', 'alliances']);
  const isParliamentActive = PARL_TABS.has(tab);
  const isMapActive = tab === 'map';
  const isLawActive = tab === 'law';
  const setModule = (id: string) =>
    updateState(s => { s.ui.tab = id === 'parliament' ? 'sim' : id; return s; });

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {TOP_ITEMS.map(item => (
          <button key={item.id} data-ro-allow
            className={`sidebar-item${item.id === 'parliament' ? (isParliamentActive ? ' active' : '') : item.id === 'map' ? (isMapActive ? ' active' : '') : item.id === 'law' ? (isLawActive ? ' active' : '') : ''}`}
            title={item.title}
            disabled={'disabled' in item && item.disabled}
            onClick={() => setModule(item.id)}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button data-ro-allow
          className={`sidebar-item${tab === 'settings' ? ' active' : ''}`}
          title="Settings"
          onClick={() => updateState(s => { s.ui.tab = 'settings'; return s; })}
        >
          <span className="sidebar-icon">⚙</span>
          <span className="sidebar-label">CONF</span>
        </button>
        <span className="sidebar-ver">v3</span>
      </div>
    </aside>
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
