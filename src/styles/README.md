# Stylesheet Map

`src/index.css` is an import manifest. Keep broad cascade order stable there and place new rules in the smallest owning file.

| File | Owns |
|---|---|
| `foundation.css` | Palette tokens, semantic `--ui-*` theme contract, global base, app shell, sidebar, tabs, shared buttons, panels, compact primitives, and item cards |
| `parliament.css` | Parliament projection, faction/alliance editing, chart, result matrix, history, trash, toast, and save indicator |
| `settings.css` | Read-only mode, auth badge, settings panel, and language selector |
| `map.css` | Map toolbar, canvas workspace, region list, inspector, pie chart, and map-specific utility classes |
| `laws.css` | Law floor, stance editor, law registry, constitution cards, clause editor, and law history |
| `events.css` | Event editor, newspaper issue view, turn archive, timeline cards, and story-rank sizing |
| `senate.css` | Senate page, seat assignment controls, and static region map reuse hooks |
| `responsive.css` | Cross-page responsive overrides for app shell, parliament, map, and laws |
| `auth.css` | Login form |

Node editor styles are loaded by `src/components/nodes/node-editor.css` and live beside the node components.
For node-editor-specific theming notes, see `src/components/nodes/styles/README.md`.

Theme metadata for UI pickers lives in `src/theme.ts`. CSS theme behavior is still driven by `body[data-theme]` and the semantic `--ui-*` tokens in `foundation.css`.

## Theme Token Layers

- Palette tokens such as `--accent`, `--bg-panel`, and `--line-soft` are the raw colors. Define or override them only in `:root` and `body[data-theme="..."]`.
- Semantic app tokens such as `--ui-panel-bg`, `--ui-control-border`, and `--ui-compact-bg` are the reusable UI contract. Palette-derived semantic tokens belong on `body`, so they recompute when `data-theme` changes.
- Feature tokens such as `--ne-node-bg` should bridge to `--ui-*` tokens unless the feature has a genuine local styling need.
- New shared surfaces should prefer `--ui-*` tokens; direct palette-token use is still acceptable for legacy CSS and highly specific effects.

## Rules

- Prefer page or feature prefixes for new selectors: `map-`, `law-`, `event-`, `senate-`, `ne-`.
- Put shared primitives in `foundation.css` only when at least two pages use them.
- Keep responsive overrides in `responsive.css` unless the feature already has its own local responsive stylesheet.
- Do not add large new rule blocks directly to `src/index.css`; add an import-backed file instead.
