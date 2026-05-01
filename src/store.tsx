import { useState, useEffect, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { AppState } from './models/types';

export const STORAGE_KEY = 'parliamentState_v3';
export const SCHEMA_VERSION = 3;
export const UNALIGNED_COLOR = '#6b7e9e';

export const THEMES = ['gold', 'green', 'cyan', 'crimson'];

export function uid(prefix: string): string { 
  return prefix + Math.random().toString(36).slice(2, 9); 
}

export function clone<T>(o: T): T { 
  return JSON.parse(JSON.stringify(o)); 
}

export function defaultState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    totalSeats: 200,
    unalignedMode: false,
    strata: [
      { id: 's1', name: 'Aristocracy',    population: 500000,   power: 4.0 },
      { id: 's2', name: 'Bourgeoisie',    population: 1500000,  power: 2.0 },
      { id: 's3', name: 'Intelligentsia', population: 1000000,  power: 1.6 },
      { id: 's4', name: 'Workers',        population: 4000000,  power: 0.8 },
      { id: 's5', name: 'Peasantry',      population: 3000000,  power: 0.5 }
    ],
    factions: [
      { id: 'f1', name: 'Reactionaries', color: '#7a2030',
        support: { s1: 350000, s2: 225000, s3: 50000,   s4: 200000,  s5: 750000 } },
      { id: 'f2', name: 'Liberals',      color: '#2c6fb1',
        support: { s1: 100000, s2: 825000, s3: 350000,  s4: 600000,  s5: 450000 } },
      { id: 'f3', name: 'Progressives',  color: '#d4a14a',
        support: { s1: 25000,  s2: 300000, s3: 450000,  s4: 800000,  s5: 450000 } },
      { id: 'f4', name: 'Socialists',    color: '#c44a2a',
        support: { s1: 25000,  s2: 150000, s3: 150000,  s4: 2400000, s5: 1350000 } }
    ],
    history: [],
    alliances: [],
    trash: { strata: [], factions: [], alliances: [] },
    ui: { tab: 'sim', language : 'cn', theme: 'gold', factionExpanded: {} }
  };
}

export function normalizeState(p: any): AppState {
  const d = defaultState();
  if (!p) return d;
  const oldFormat = !p.schemaVersion || p.schemaVersion < 3;
  const s: AppState = {
    schemaVersion: SCHEMA_VERSION,
    totalSeats: typeof p.totalSeats === 'number' ? p.totalSeats : d.totalSeats,
    unalignedMode: !!p.unalignedMode,
    strata: Array.isArray(p.strata) ? p.strata.map((x: any) => ({
      id: x.id || uid('s'),
      name: String(x.name || 'Stratum'),
      population: +x.population || 0,
      power: +x.power || 0
    })) : d.strata,
    factions: Array.isArray(p.factions) ? p.factions.map((x: any) => ({
      id: x.id || uid('f'),
      name: String(x.name || 'Faction'),
      color: x.color || '#888',
      support: x.support && typeof x.support === 'object' ? {...x.support} : {}
    })) : d.factions,
    history: Array.isArray(p.history) ? p.history : [],
    alliances: Array.isArray(p.alliances) ? p.alliances.map((x: any) => ({
      id: x.id || uid('a'),
      name: String(x.name || 'Alliance'),
      color: x.color || '#888',
      factionIds: Array.isArray(x.factionIds) ? x.factionIds : []
    })) : d.alliances,
    trash: {
      strata: p.trash && Array.isArray(p.trash.strata) ? p.trash.strata : [],
      factions: p.trash && Array.isArray(p.trash.factions) ? p.trash.factions : [],
      alliances: p.trash && Array.isArray(p.trash.alliances) ? p.trash.alliances : []
    },
    ui: {
      tab: (p.ui && p.ui.tab) || 'sim',
      language: (p.language && p.language || 'en'),
      theme: (p.ui && THEMES.includes(p.ui.theme)) ? p.ui.theme : 'gold',
      factionExpanded: (p.ui && p.ui.factionExpanded) || {}
    }
  };
  
  if (oldFormat) {
    s.factions.forEach(f => {
      const newSup: Record<string, number> = {};
      s.strata.forEach(st => {
        const pct = f.support[st.id];
        newSup[st.id] = (typeof pct === 'number')
          ? Math.round((pct / 100) * (st.population || 0))
          : 0;
      });
      f.support = newSup;
    });
  } else {
    s.factions.forEach(f => {
      s.strata.forEach(st => {
        if (typeof f.support[st.id] !== 'number') f.support[st.id] = 0;
      });
    });
  }
  return s;
}

export function loadFromStorage(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
    const v2 = localStorage.getItem('parliamentState_v2');
    if (v2) return normalizeState(JSON.parse(v2));
  } catch (e) {
    console.error('Load failed:', e);
  }
  return defaultState();
}

interface ToastMessage {
  message: string;
  type: string;
  id: number;
}

interface AppContextType {
  state: AppState;
  updateState: (updater: Partial<AppState> | ((prev: AppState) => AppState)) => void;
  toastMessage: ToastMessage | null;
  savedStatus: boolean;
  showToast: (message: string, type?: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadFromStorage());
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);
  const [savedStatus, setSavedStatus] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSavedStatus(true);
        setTimeout(() => setSavedStatus(false), 800);
      } catch (e) {
        console.error('Persist failed:', e);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    document.body.setAttribute('data-theme', state.ui.theme);
  }, [state.ui.theme]);

  const updateState = (updater: Partial<AppState> | ((prev: AppState) => AppState)) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? updater(clone(prev)) : { ...prev, ...updater };
      return next;
    });
  };

  const showToast = (message: string, type = 'good') => {
    setToastMessage({ message, type, id: Date.now() });
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <AppContext.Provider value={{ state, updateState, toastMessage, savedStatus, showToast }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextType {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
}
