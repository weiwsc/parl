import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { APP_MODE, API_BASE } from '../config';

type AuthRole = 'admin' | 'player';

interface AuthSession {
  role: AuthRole;
  username: string;
  factionId: string | null;
}

interface AuthContextType {
  isAdmin: boolean;
  isPlayer: boolean;
  canEdit: boolean;
  mode: 'local' | 'hosted';
  token: string | null;
  username: string | null;
  factionId: string | null;
  login: (username: string, password: string) => Promise<AuthSession>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
}

function parseToken(token: string | null): AuthSession | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(token.split('.')[1] ?? '')) as {
      role?: string;
      username?: string;
      factionId?: string;
      exp?: number;
    };
    if (payload.exp && payload.exp * 1000 <= Date.now()) return null;
    if (payload.role !== 'admin' && payload.role !== 'player') return null;
    return {
      role: payload.role,
      username: payload.username ?? payload.role,
      factionId: payload.factionId ?? null,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('auth_token')
  );
  const session = parseToken(token);

  const isAdmin = APP_MODE === 'local' || session?.role === 'admin';
  const isPlayer = APP_MODE === 'hosted' && session?.role === 'player';
  const canEdit = isAdmin;

  const login = useCallback(async (username: string, password: string): Promise<AuthSession> => {
    if (APP_MODE === 'local') return { role: 'admin', username: 'local', factionId: null };
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error('Invalid credentials');
    const { token: t } = await res.json();
    const nextSession = parseToken(t);
    if (!nextSession) throw new Error('Invalid credentials');
    sessionStorage.setItem('auth_token', t);
    setToken(t);
    return nextSession;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('auth_token');
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      isAdmin,
      isPlayer,
      canEdit,
      mode: APP_MODE,
      token,
      username: APP_MODE === 'local' ? 'local' : session?.username ?? null,
      factionId: session?.factionId ?? null,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
