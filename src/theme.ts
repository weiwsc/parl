export const THEME_DEFINITIONS = [
  {
    id: 'gold',
    label: 'Imperial Gold',
    swatch: 'linear-gradient(135deg, #d4a14a 0 48%, #5fd8ff 52% 100%)',
    accent: '#d4a14a',
  },
  {
    id: 'green',
    label: 'Sci-Fi Green',
    swatch: 'linear-gradient(135deg, #5dee7b 0 48%, #50e3a4 52% 100%)',
    accent: '#5dee7b',
  },
  {
    id: 'pine',
    label: 'Native Graphite',
    swatch: 'linear-gradient(135deg, #2c2c2e 0 42%, #0a84ff 45% 70%, #00c7be 73% 100%)',
    accent: '#0a84ff',
  },
  {
    id: 'marine',
    label: 'Marine Signal',
    swatch: 'linear-gradient(135deg, #4bdcff 0 48%, #39ffd1 52% 100%)',
    accent: '#4bdcff',
  },
  {
    id: 'amber',
    label: 'Amber Moss',
    swatch: 'linear-gradient(135deg, #ffd34d 0 48%, #b6ff5a 52% 100%)',
    accent: '#ffd34d',
  },
  {
    id: 'violet',
    label: 'Violet Signal',
    swatch: 'linear-gradient(135deg, #d59aff 0 48%, #62e6ff 52% 100%)',
    accent: '#d59aff',
  },
  {
    id: 'aqua',
    label: 'Graphite Aqua',
    swatch: 'linear-gradient(135deg, #2c657a 0 42%, #64d2ff 45% 70%, #00f5d4 73% 100%)',
    accent: '#64d2ff',
  },
  {
    id: 'cyan',
    label: 'Holo Blue',
    swatch: 'linear-gradient(135deg, #5fc8ff 0 48%, #d4a14a 52% 100%)',
    accent: '#5fc8ff',
  },
  {
    id: 'crimson',
    label: 'Crimson',
    swatch: 'linear-gradient(135deg, #ff5b5b 0 48%, #ffae6e 52% 100%)',
    accent: '#ff5b5b',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    swatch: 'linear-gradient(135deg, #1e1e1e 0 28%, #0a84ff 31% 65%, #32ade6 68% 100%)',
    accent: '#0a84ff',
  },
  {
    id: 'grove',
    label: 'Sequoia Grove',
    swatch: 'linear-gradient(135deg, #30d158 0 42%, #32ade6 45% 70%, #1d2520 73% 100%)',
    accent: '#30d158',
  },
] as const;

export type ThemeId = typeof THEME_DEFINITIONS[number]['id'];

export const THEMES = THEME_DEFINITIONS.map(theme => theme.id) as ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.includes(value as ThemeId);
}
