import { useAppContext } from '../store';
import { useLang } from '../utils/localization';
import { useAuth } from '../context/AuthContext';
import { APP_NAV_ITEMS, SETTINGS_NAV_ITEM, isNavItemActive } from '../navigation';
import { AppHeader } from './ui/AppHeader';
import { TabBar, type TabItem } from './ui/TabBar';
//import { APP_MODE } from '../config';

interface HeaderProps {
  onElection: () => void;
}

export function Header({ onElection }: Pick<HeaderProps, 'onElection'>) {
  const { state, updateState } = useAppContext();
  const { isAdmin, isPlayer, mode, username } = useAuth();
  const t = useLang();
  const authKind = isAdmin ? 'admin' : isPlayer ? 'player' : 'guest';
  const authLabel = isAdmin ? t("admin") : isPlayer ? (username ?? 'Player') : t("guest");

  return (
    <AppHeader title={t("parliament")} subtitle="// LEGISLATIVE PROJECTION SYSTEM · v3.0 //">
      {mode === 'hosted' && (
        <span className={`auth-badge auth-badge--${authKind}`}>
          {isAdmin ? '◈' : isPlayer ? '◇' : '◌'} {authLabel}
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

      <div className="control-group">
        <label>{t("base_randomness")}</label>
        <input
          type="number"
          min="0"
          step="1"
          value={state.election.baseRandomness}
          onChange={(e) => updateState(s => {
            s.election.baseRandomness = Math.max(0, parseFloat(e.target.value) || 0);
            return s;
          })}
        />
      </div>

      <button className="primary" onClick={onElection}>⚙ {t("hold_election")}</button>
    </AppHeader>
  );
}

// ─── Tabs (within parliament module) ─────────────────────────────────────────

export function Tabs() {
  const { state, updateState } = useAppContext();
  const { tab } = state.ui;
  const t = useLang();
  const histCount  = state.history.length;

  type ParliamentTab = 'sim' | 'current' | 'hist';
  const setTab = (nextTab: ParliamentTab) => {
    if (tab === nextTab) return;
    updateState({ ui: { ...state.ui, tab: nextTab } });
  };
  const items: TabItem<ParliamentTab>[] = [
    { id: 'sim', label: t("election") },
    { id: 'current', label: t("current_parliament") },
    { id: 'hist', label: t("election_history"), badge: histCount },
  ];

  return <TabBar active={tab as ParliamentTab} items={items} onChange={setTab} />;
}

export function Sidebar() {
  const { state, updateState } = useAppContext();
  const { tab } = state.ui;
  const trashCount =
    state.trash.strata.length
    + state.trash.factions.length
    + state.trash.alliances.length
    + state.trash.regions.length
    + state.trash.elections.length;

  const setModule = (id: string) => {
    if (tab === id) return;
    updateState({ ui: { ...state.ui, tab: id } });
  };

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {APP_NAV_ITEMS.map(item => (
          <button key={item.id} data-ro-allow
            className={`sidebar-item${isNavItemActive(item, tab) ? ' active' : ''}`}
            title={item.title}
            disabled={item.disabled}
            onClick={() => setModule(item.tab)}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
            {item.tab === 'trash' && trashCount > 0 && <span className="sidebar-badge">{trashCount}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button data-ro-allow
          className={`sidebar-item${isNavItemActive(SETTINGS_NAV_ITEM, tab) ? ' active' : ''}`}
          title={SETTINGS_NAV_ITEM.title}
          onClick={() => setModule(SETTINGS_NAV_ITEM.tab)}
        >
          <span className="sidebar-icon">{SETTINGS_NAV_ITEM.icon}</span>
          <span className="sidebar-label">{SETTINGS_NAV_ITEM.label}</span>
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
