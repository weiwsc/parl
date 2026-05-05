import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, FormEvent } from 'react';
import { normalizeState, useAppContext } from '../store';
import { useAuth } from '../context/AuthContext';
import { useLang, LANGUAGES } from '../utils/localization';
import { API_BASE } from '../config';
import { Panel } from './ui/Panel';
import { THEME_DEFINITIONS } from '../theme';

interface PlayerAccount {
  id: string;
  username: string;
  factionId: string;
  createdAt: string;
  updatedAt: string;
}

export function SettingsPanel() {
  const { state, updateState, showToast } = useAppContext();
  const { isAdmin, isPlayer, canEdit, mode, token, username, factionId, login, logout } = useAuth();
  const t = useLang();

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [accounts, setAccounts] = useState<PlayerAccount[]>([]);
  const [accountsVersion, setAccountsVersion] = useState(0);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState('');
  const [playerUser, setPlayerUser] = useState('');
  const [playerPass, setPlayerPass] = useState('');
  const [playerFactionId, setPlayerFactionId] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode !== 'hosted' || !isAdmin || !token) return;
    let active = true;
    setAccountsLoading(true);
    setAccountsError('');

    fetch(`${API_BASE}/player-accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async res => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<PlayerAccount[]>;
      })
      .then(nextAccounts => {
        if (active) setAccounts(nextAccounts);
      })
      .catch(() => {
        if (active) setAccountsError('Could not load player accounts');
      })
      .finally(() => {
        if (active) setAccountsLoading(false);
      });

    return () => { active = false; };
  }, [accountsVersion, isAdmin, mode, token]);

  const handleCreatePlayer = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const selectedFactionId = playerFactionId || state.factions[0]?.id || '';
    setAccountsError('');
    try {
      const res = await fetch(`${API_BASE}/player-accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: playerUser,
          password: playerPass,
          factionId: selectedFactionId,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setPlayerUser('');
      setPlayerPass('');
      setPlayerFactionId('');
      setAccountsVersion(v => v + 1);
      showToast('Player account created');
    } catch (err) {
      setAccountsError(err instanceof Error && err.message ? err.message : 'Could not create account');
    }
  };

  const handleDeletePlayer = async (accountId: string) => {
    if (!token) return;
    if (!window.confirm('Delete this player account?')) return;
    setAccountsError('');
    try {
      const res = await fetch(`${API_BASE}/player-accounts/${accountId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setAccountsVersion(v => v + 1);
      showToast('Player account deleted');
    } catch {
      setAccountsError('Could not delete account');
    }
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `parliament_state_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = evt.target?.result;
        if (typeof raw !== 'string') return;
        updateState(() => { showToast('Data imported'); return normalizeState(JSON.parse(raw)); });
      } catch {
        showToast('Import failed: invalid JSON', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const session = await login(loginUser, loginPass);
      setLoginUser('');
      setLoginPass('');
      showToast(session.role === 'admin' ? 'Logged in as admin' : 'Logged in as player');
    } catch {
      setLoginError('Invalid credentials');
    } finally {
      setLoginLoading(false);
    }
  };

  const factionName = (id: string | null | undefined) =>
    state.factions.find(faction => faction.id === id)?.name ?? 'Unknown faction';

  return (
    <div className="settings-panel">
      <Panel title={t("settings")} bodyClassName="no-scroll">

          {/* ── Appearance ─────────────────────────────── */}
          <div className="settings-section">
            <div className="settings-section-title">{t("appearance")}</div>

            <div className="settings-row">
              <span className="settings-label">{t("theme")}</span>
              <div className="theme-switch" data-ro-allow>
                {THEME_DEFINITIONS.map(theme => (
                  <button key={theme.id} data-ro-allow
                    className={state.ui.theme === theme.id ? 'active' : ''}
                    onClick={() => updateState({ ui: { ...state.ui, theme: theme.id } })}
                    title={theme.label}
                    aria-label={theme.label}>
                    <span
                      className="swatch"
                      style={{
                        '--theme-swatch': theme.swatch,
                        '--theme-swatch-glow': theme.accent,
                      } as CSSProperties}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-row">
              <span className="settings-label">{t("language")}</span>
              <div className="lang-selector">
                {LANGUAGES.map(({ code, native }) => (
                  <button key={code} data-ro-allow
                    className={`lang-btn${state.ui.language === code ? ' active' : ''}`}
                    onClick={() => updateState({ ui: { ...state.ui, language: code } })}>
                    {native}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Data ───────────────────────────────────── */}
          <div className="settings-section">
            <div className="settings-section-title">{t("data")}</div>
            <div className="settings-row settings-row--buttons">
              <button onClick={handleExport} disabled={!canEdit}>{t("export")}</button>
              <button onClick={() => importRef.current?.click()} disabled={!canEdit}>{t("import")}</button>
              <input ref={importRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImport} />
            </div>
          </div>

          {/* ── Account (hosted mode only) ──────────────── */}
          {mode === 'hosted' && (
            <div className="settings-section">
              <div className="settings-section-title">{t("account")}</div>
              {isAdmin ? (
                <>
                  <div className="settings-row">
                    <span className="auth-badge auth-badge--admin">◈ {t("admin")}</span>
                    <button data-ro-allow className="small ghost" onClick={logout}>{t("logout")}</button>
                  </div>

                  <div className="player-account-admin">
                    <div className="settings-section-title">Player Accounts</div>
                    <form className="player-account-form" onSubmit={handleCreatePlayer}>
                      <input
                        type="text"
                        placeholder="Username"
                        value={playerUser}
                        onChange={e => setPlayerUser(e.target.value)}
                        autoComplete="off"
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={playerPass}
                        onChange={e => setPlayerPass(e.target.value)}
                        autoComplete="new-password"
                      />
                      <select
                        value={playerFactionId || state.factions[0]?.id || ''}
                        onChange={e => setPlayerFactionId(e.target.value)}
                        disabled={state.factions.length === 0}
                      >
                        {state.factions.map(faction => (
                          <option key={faction.id} value={faction.id}>{faction.name}</option>
                        ))}
                      </select>
                      <button type="submit" className="primary small" disabled={state.factions.length === 0}>Create</button>
                    </form>

                    {accountsError && <div className="login-error">{accountsError}</div>}

                    <div className="player-account-list">
                      {accountsLoading && <div className="player-account-empty">Loading accounts...</div>}
                      {!accountsLoading && accounts.length === 0 && (
                        <div className="player-account-empty">No player accounts.</div>
                      )}
                      {!accountsLoading && accounts.map(account => (
                        <div className="player-account-row" key={account.id}>
                          <span className="player-account-name">{account.username}</span>
                          <span className="player-account-faction">{factionName(account.factionId)}</span>
                          <button className="small ghost" onClick={() => handleDeletePlayer(account.id)}>Delete</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : isPlayer ? (
                <div className="settings-row settings-row--account">
                  <span className="auth-badge auth-badge--player">◇ {username}</span>
                  <span className="settings-account-faction">{factionName(factionId)}</span>
                  <button data-ro-allow className="small ghost" onClick={logout}>{t("logout")}</button>
                </div>
              ) : (
                <form className="login-form" onSubmit={handleLogin}>
                  <input type="text" placeholder={t("username")} value={loginUser}
                    onChange={e => setLoginUser(e.target.value)} autoComplete="username" data-ro-allow />
                  <input type="password" placeholder={t("password")} value={loginPass}
                    onChange={e => setLoginPass(e.target.value)} autoComplete="current-password" data-ro-allow />
                  {loginError && <div className="login-error">{loginError}</div>}
                  <button type="submit" className="primary" disabled={loginLoading} data-ro-allow>
                    {loginLoading ? '…' : t("login")}
                  </button>
                </form>
              )}
            </div>
          )}

      </Panel>
    </div>
  );
}
