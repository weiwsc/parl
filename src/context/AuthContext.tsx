import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { APP_MODE, API_BASE } from '../config';

interface AuthContextType {
  isAdmin: boolean;
  canEdit: boolean;
  mode: 'local' | 'hosted';
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem('auth_token')
  );

  const isAdmin = APP_MODE === 'local' || token !== null;
  const canEdit = isAdmin;

  const login = async (username: string, password: string) => {
    if (APP_MODE === 'local') return;
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error('Invalid credentials');
    const { token: t } = await res.json();
    sessionStorage.setItem('auth_token', t);
    setToken(t);
  };

  const logout = () => {
    sessionStorage.removeItem('auth_token');
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ isAdmin, canEdit, mode: APP_MODE, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
