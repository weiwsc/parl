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
] as const;

export type ThemeId = typeof THEME_DEFINITIONS[number]['id'];

export const THEMES = THEME_DEFINITIONS.map(theme => theme.id) as ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.includes(value as ThemeId);
}
