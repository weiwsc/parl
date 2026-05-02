# Stylesheet Map

`src/index.css` is an import manifest. Keep broad cascade order stable there and place new rules in the smallest owning file.

| File | Owns |
|---|---|
| `foundation.css` | Theme tokens, global base, app shell, sidebar, tabs, shared buttons, panels, and item cards |
| `parliament.css` | Parliament projection, faction/alliance editing, chart, result matrix, history, trash, toast, and save indicator |
| `settings.css` | Read-only mode, auth badge, settings panel, and language selector |
| `map.css` | Map toolbar, canvas workspace, region list, inspector, pie chart, and map-specific utility classes |
| `laws.css` | Law floor, stance editor, law registry, constitution cards, clause editor, and law history |
| `senate.css` | Senate page, seat assignment controls, and static region map reuse hooks |
| `responsive.css` | Cross-page responsive overrides for app shell, parliament, map, and laws |
| `auth.css` | Login form |

Node editor styles are loaded by `src/components/nodes/node-editor.css` and live beside the node components.

## Rules

- Prefer page or feature prefixes for new selectors: `map-`, `law-`, `senate-`, `ne-`.
- Put shared primitives in `foundation.css` only when at least two pages use them.
- Keep responsive overrides in `responsive.css` unless the feature already has its own local responsive stylesheet.
- Do not add large new rule blocks directly to `src/index.css`; add an import-backed file instead.
