export interface SidebarNavItem {
  id: string;
  tab: string;
  icon: string;
  label: string;
  title: string;
  disabled?: boolean;
  activeTabs?: string[];
}

export const PARLIAMENT_TABS = ['sim', 'hist', 'trash', 'alliances'];

export const APP_NAV_ITEMS: SidebarNavItem[] = [
  {
    id: 'parliament',
    tab: 'sim',
    icon: '◈',
    label: 'PARL',
    title: 'Parliament',
    activeTabs: PARLIAMENT_TABS,
  },
  { id: 'map', tab: 'map', icon: '◎', label: 'MAP', title: 'Map' },
  { id: 'law', tab: 'law', icon: '⚖', label: 'LAW', title: 'Senate Floor' },
  { id: 'events', tab: 'events', icon: '▤', label: 'EVNT', title: 'Events' },
  { id: 'senate', tab: 'senate', icon: '⬡', label: 'SEN', title: 'Senate' },
  { id: 'nodes', tab: 'nodes', icon: '◇', label: 'NODE', title: 'Type Editor' },
  { id: 'economy', tab: 'economy', icon: '◆', label: 'ECON', title: 'Economy (coming soon)', disabled: true },
  { id: 'intel', tab: 'intel', icon: '◌', label: 'INTEL', title: 'Intelligence (coming soon)', disabled: true },
];

export const SETTINGS_NAV_ITEM: SidebarNavItem = {
  id: 'settings',
  tab: 'settings',
  icon: '⚙',
  label: 'CONF',
  title: 'Settings',
};

export function isNavItemActive(item: SidebarNavItem, currentTab: string): boolean {
  return item.activeTabs ? item.activeTabs.includes(currentTab) : item.tab === currentTab;
}
