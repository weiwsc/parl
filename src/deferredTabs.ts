export const DEFERRED_TAB_IDS = [
  'current',
  'hist',
  'trash',
  'settings',
  'map',
  'factions',
  'law',
  'events',
  'senate',
  'nodes',
] as const;

export type DeferredTabId = typeof DEFERRED_TAB_IDS[number];

type DeferredTabModule = Record<string, unknown>;
type DeferredTabLoader = () => Promise<DeferredTabModule>;

const deferredTabLoaders: Record<DeferredTabId, DeferredTabLoader> = {
  current: () => import('./components/CurrentParliament'),
  hist: () => import('./components/History'),
  trash: () => import('./components/Trash'),
  settings: () => import('./components/Settings'),
  map: () => import('./components/MapPage'),
  factions: () => import('./components/FactionsPage'),
  law: () => import('./components/LawPage'),
  events: () => import('./components/EventsPage'),
  senate: () => import('./components/SenatePage'),
  nodes: () => import('./components/nodes/NodeEditorPage'),
};

const warmupOrder: DeferredTabId[] = [
  'map',
  'factions',
  'law',
  'events',
  'nodes',
  'senate',
  'current',
  'hist',
  'trash',
  'settings',
];

const eagerWarmupCount = 4;
const pendingLoads: Partial<Record<DeferredTabId, Promise<DeferredTabModule>>> = {};
const loadedModules: Partial<Record<DeferredTabId, DeferredTabModule>> = {};

export function isDeferredTabId(tab: string | undefined): tab is DeferredTabId {
  return !!tab && DEFERRED_TAB_IDS.includes(tab as DeferredTabId);
}

export function preloadDeferredTab(tab: string | undefined): Promise<DeferredTabModule> | undefined {
  if (!isDeferredTabId(tab)) return undefined;
  if (loadedModules[tab]) return Promise.resolve(loadedModules[tab]);
  pendingLoads[tab] ??= deferredTabLoaders[tab]().then(module => {
    loadedModules[tab] = module;
    return module;
  }).catch(error => {
    delete pendingLoads[tab];
    throw error;
  });
  return pendingLoads[tab];
}

export function getLoadedDeferredTab(tab: string | undefined): DeferredTabModule | undefined {
  if (!isDeferredTabId(tab)) return undefined;
  return loadedModules[tab];
}

export function warmDeferredTabs(activeTab: string | undefined): () => void {
  if (typeof window === 'undefined') return () => {};

  let cancelled = false;
  let index = 0;

  const scheduleNext = () => {
    if (cancelled) return;

    const run = () => {
      if (cancelled) return;

      while (index < warmupOrder.length) {
        const tab = warmupOrder[index++];
        if (tab === activeTab) continue;
        void preloadDeferredTab(tab);
        break;
      }

      if (index < warmupOrder.length) scheduleNext();
    };

    if (index < eagerWarmupCount) {
      window.setTimeout(run, index === 0 ? 150 : 350);
    } else if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 2_500 });
    } else {
      window.setTimeout(run, 750);
    }
  };

  scheduleNext();
  return () => {
    cancelled = true;
  };
}

export function loadCurrentParliamentPanel() {
  return preloadDeferredTab('current') as Promise<typeof import('./components/CurrentParliament')>;
}

export function loadHistoryPanel() {
  return preloadDeferredTab('hist') as Promise<typeof import('./components/History')>;
}

export function loadTrashPanel() {
  return preloadDeferredTab('trash') as Promise<typeof import('./components/Trash')>;
}

export function loadSettingsPanel() {
  return preloadDeferredTab('settings') as Promise<typeof import('./components/Settings')>;
}

export function loadMapPage() {
  return preloadDeferredTab('map') as Promise<typeof import('./components/MapPage')>;
}

export function loadFactionsPage() {
  return preloadDeferredTab('factions') as Promise<typeof import('./components/FactionsPage')>;
}

export function loadLawPage() {
  return preloadDeferredTab('law') as Promise<typeof import('./components/LawPage')>;
}

export function loadEventsPage() {
  return preloadDeferredTab('events') as Promise<typeof import('./components/EventsPage')>;
}

export function loadSenatePage() {
  return preloadDeferredTab('senate') as Promise<typeof import('./components/SenatePage')>;
}

export function loadNodeEditorPage() {
  return preloadDeferredTab('nodes') as Promise<typeof import('./components/nodes/NodeEditorPage')>;
}
