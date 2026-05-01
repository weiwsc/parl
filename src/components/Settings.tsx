import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useAppContext, THEMES } from '../store';
import { normalizeState } from '../store';
import { useAuth } from '../context/AuthContext';
import { useLang, LANGUAGES } from '../utils/localization';

export function SettingsPanel() {
  const { state, updateState, showToast } = useAppContext();
  const { isAdmin, canEdit, mode, login, logout } = useAuth();
  const t = useLang();

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const themeColors: Record<string, string> = {
    gold: '#d4a14a', green: '#5dee7b', cyan: '#5fc8ff', crimson: '#ff5b5b',
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      await login(loginUser, loginPass);
      setLoginUser('');
      setLoginPass('');
      showToast('Logged in as admin');
    } catch {
      setLoginError('Invalid credentials');
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="settings-panel">
      <div className="panel">
        <span className="corner tl" /><span className="corner tr" />
        <span className="corner bl" /><span className="corner br" />
        <div className="panel-header"><h2>{t("settings")}</h2></div>
        <div className="panel-body no-scroll">

          {/* ── Appearance ─────────────────────────────── */}
          <div className="settings-section">
            <div className="settings-section-title">{t("appearance")}</div>

            <div className="settings-row">
              <span className="settings-label">{t("theme")}</span>
              <div className="theme-switch" data-ro-allow>
                {THEMES.map(theme => (
                  <button key={theme} data-ro-allow
                    className={state.ui.theme === theme ? 'active' : ''}
                    onClick={() => updateState({ ui: { ...state.ui, theme } })}
                    title={theme}>
                    <span className="swatch" style={{ background: themeColors[theme], color: themeColors[theme] }} />
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
                <div className="settings-row">
                  <span className="auth-badge auth-badge--admin">◈ {t("admin")}</span>
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

        </div>
      </div>
    </div>
  );
}
