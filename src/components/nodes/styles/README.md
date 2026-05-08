# Node Editor Theming

The node editor is themeable, but it is not a separate skinning system. It inherits the app theme through token layers:

1. `src/theme.ts`
   - Adds the theme to the Settings picker.
   - Edit `THEME_DEFINITIONS` with `id`, `label`, `swatch`, and `accent`.
   - `ThemeId` is inferred from this list, so adding an entry updates the app state type.

2. `src/styles/foundation.css`
   - Owns global theme palettes and the reusable app UI contract.
   - Add or edit `body[data-theme="<id>"]` blocks here.
   - Start with raw palette tokens:
     - `--bg-deep`, `--bg-deeper`, `--bg-panel`, `--bg-panel-alt`, `--bg-input`
     - `--line`, `--line-soft`, `--line-strong`
     - `--accent`, `--accent-hot`, `--accent-deep`
     - `--cyan`, `--cyan-soft`, `--cyan-deep`
     - `--text`, `--text-dim`, `--text-mute`, `--danger`, `--good`, `--neutral`
     - `--grid-line`, `--grid-glow-1`, `--grid-glow-2`, `--halo`, `--halo-cyan`
     - `--theme-accent-rgb`, `--theme-cyan-rgb`
   - The `body` semantic contract derives `--ui-*` tokens from those palette tokens.
   - Node-editor-like shared surfaces use the compact primitives:
     - `--ui-compact-bg`
     - `--ui-compact-head-bg`
     - `--ui-compact-border`
     - `--ui-compact-border-soft`
     - `--ui-compact-shadow`
     - `--ui-compact-section-bg`

3. `src/components/nodes/node-editor.css`
   - Import manifest for node editor CSS.
   - Keep `styles/node-theme.css` first so every other node stylesheet can consume `--ne-*` tokens.

4. `src/components/nodes/styles/node-theme.css`
   - The node editor theme bridge.
   - Default `--ne-*` tokens map to the app `--ui-*` tokens.
   - Put theme-specific node overrides at the bottom, scoped like:
     ```css
     body[data-theme="green"] .ne-page {
       --ne-code-keyword: var(--gold-hot);
       --ne-code-string: #89e99f;
     }
     ```
   - Prefer overriding tokens here over changing selectors in the other node CSS files.

5. Node editor implementation styles
   - `node-canvas.css`: graph canvas, graph nodes, handles, ports, CodeMirror/live code styling, computed values.
   - `node-shell.css`: topbar, tabs, floating palette, editor sidebars, workspace shell.
   - `node-schema.css`: schema/type editor rows, kind tags, nested schema structure.
   - `node-transforms.css`: transform library/editor panels and transform-specific forms.
   - `node-config.css`: node editor configuration UI.
   - `node-responsive.css`: node editor responsive behavior.

## Practical Rules

- For a theme like `green`, make the palette good first. Green works mostly because its `foundation.css` palette has a strong dark/value ladder; the node editor barely needs custom CSS.
- Avoid making every color a tint of the accent. Good node themes need contrast roles: background, surface, separator, text, muted text, accent, secondary accent, danger, success.
- Use `node-theme.css` for node-only token overrides. Avoid adding many `body[data-theme] .ne-page .some-selector` rules unless the theme is intentionally changing the UI language, not just the palette.
- Keep node geometry stable unless the theme explicitly calls for a different language. Changing radius, clipping, tab shape, or row fills can make the editor stop feeling like the compact FL Studio-like UI.
- If a theme starts to look like a color filter, reduce full-surface tint and push color into small signals: handles, focused borders, kind badges, selections, and syntax tokens.
- If a theme needs a native/macOS-like direction, do not just recolor the sci-fi node editor. Plan a separate UI-language pass: softer typography, fewer letter-spaced labels, less grid/glow, more semantic gray/material hierarchy, and sparse system colors.

## Verification

After theme edits, run:

```sh
npm run lint
npm run build
git diff --check
```

Also inspect the node canvas with at least one transform node and one entity/type node. Check:

- Node shells separate from the canvas.
- Text and disabled text are readable.
- Ports are visible but not noisy.
- Section rows do not become a single colored wash.
- Syntax colors remain distinct in the code editor.
