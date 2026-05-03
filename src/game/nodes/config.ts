import type { NodeEditorConfig } from './types';

export const NODE_EDITOR_FONT_SCALE_MIN = 0.9;
export const NODE_EDITOR_FONT_SCALE_MAX = 1.3;
export const NODE_EDITOR_FONT_SCALE_STEP = 0.05;

export const DEFAULT_NODE_EDITOR_CONFIG: NodeEditorConfig = {
  fontScale: 1,
};

export function normalizeNodeEditorConfig(value: Partial<NodeEditorConfig> | undefined): NodeEditorConfig {
  return {
    fontScale: clampFontScale(value?.fontScale),
  };
}

export function clampFontScale(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_NODE_EDITOR_CONFIG.fontScale;
  const clamped = Math.min(NODE_EDITOR_FONT_SCALE_MAX, Math.max(NODE_EDITOR_FONT_SCALE_MIN, numeric));
  return Math.round(clamped / NODE_EDITOR_FONT_SCALE_STEP) * NODE_EDITOR_FONT_SCALE_STEP;
}
