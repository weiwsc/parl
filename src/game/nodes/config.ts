import type { NodeEditorConfig, NodeEditorTheme, NodeEditorUiStyle } from './types';

export const NODE_EDITOR_FONT_SCALE_MIN = 0.9;
export const NODE_EDITOR_FONT_SCALE_MAX = 1.3;
export const NODE_EDITOR_FONT_SCALE_STEP = 0.05;
export const NODE_EDITOR_THEMES = ['studio'] as const satisfies readonly NodeEditorTheme[];
export const NODE_EDITOR_UI_STYLES = ['studio', 'native'] as const satisfies readonly NodeEditorUiStyle[];

export const DEFAULT_NODE_EDITOR_CONFIG: NodeEditorConfig = {
  fontScale: 1,
  theme: 'studio',
  uiStyle: 'studio',
};

export function normalizeNodeEditorConfig(value: Partial<NodeEditorConfig> | undefined): NodeEditorConfig {
  return {
    fontScale: clampFontScale(value?.fontScale),
    theme: normalizeNodeEditorTheme(value?.theme),
    uiStyle: normalizeNodeEditorUiStyle(value?.uiStyle),
  };
}

export function clampFontScale(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_NODE_EDITOR_CONFIG.fontScale;
  const clamped = Math.min(NODE_EDITOR_FONT_SCALE_MAX, Math.max(NODE_EDITOR_FONT_SCALE_MIN, numeric));
  return Math.round(clamped / NODE_EDITOR_FONT_SCALE_STEP) * NODE_EDITOR_FONT_SCALE_STEP;
}

export function normalizeNodeEditorTheme(value: unknown): NodeEditorTheme {
  return NODE_EDITOR_THEMES.includes(value as NodeEditorTheme) ? value as NodeEditorTheme : DEFAULT_NODE_EDITOR_CONFIG.theme;
}

export function normalizeNodeEditorUiStyle(value: unknown): NodeEditorUiStyle {
  return NODE_EDITOR_UI_STYLES.includes(value as NodeEditorUiStyle) ? value as NodeEditorUiStyle : DEFAULT_NODE_EDITOR_CONFIG.uiStyle;
}
