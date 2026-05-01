# Parliament UI Guide

Industrial sci-fi design system. This document covers how to build new pages that match the existing aesthetic.

---

## Design Tokens (CSS Variables)

All colors and surface values are defined in `:root` in `src/index.css` and overridden per theme.

| Variable | Role |
|---|---|
| `--bg-deep` | Page background (darkest) |
| `--bg-deeper` | Sidebar / inset backgrounds |
| `--bg-panel` | Panel surface |
| `--bg-panel-alt` | Secondary panel surface (item cards) |
| `--bg-input` | Input / data cell background |
| `--line` | Default border |
| `--line-soft` | Subtle divider |
| `--line-strong` | Emphasized border |
| `--accent` | Primary accent (gold / green / cyan / crimson by theme) |
| `--accent-hot` | Bright variant of accent |
| `--accent-deep` | Dark variant of accent |
| `--cyan` | Secondary accent |
| `--text` | Body text |
| `--text-dim` | Muted label text |
| `--text-mute` | Very muted / placeholder |
| `--danger` | Error / delete red |
| `--good` | Success green |
| `--halo` | Glow color (matches accent) |
| `--halo-cyan` | Glow color (matches cyan) |
| `--grid-line` | Background grid lines |
| `--grid-glow-1` / `--grid-glow-2` | Background radial glows |

---

## Typography

Three font families are used throughout:

| Family | Use |
|---|---|
| `'Cinzel', serif` | Panel headings, tab labels, display titles |
| `'Rajdhani', sans-serif` | Body text, buttons, general UI |
| `'JetBrains Mono', monospace` | Numbers, codes, status labels, monospace data |

Rules:
- All headings and labels are `text-transform: uppercase`
- Use `letter-spacing` to open up mono labels (1–3px typical)
- `font-size` for panel headers: 12px. For data labels: 9–11px.

---

## Layout

The app uses a three-level structure:

```
.app
  .app-header        ← top bar with title + controls
  .app-body          ← flex row
    .sidebar         ← left icon rail (54px wide)
    .app-main        ← flex:1 content area
      .grid          ← 3-column grid for the sim view
        .panel       ← left column
        ...          ← center column (chart + matrix)
        .panel       ← right column
```

### Adding a new sidebar page

1. Add an entry to `NAV_ITEMS` in `src/components/Layout.tsx`:

```tsx
{ id: 'mypage', icon: '◆', label: 'PAGE', title: 'My Page' }
```

2. Render it conditionally in `App.tsx`:

```tsx
{tab === 'mypage' && <MyPage />}
```

3. Create `src/components/MyPage.tsx` — see Panel pattern below.

---

## Panel

The primary container for any view section.

```tsx
<div className="panel">
  <span className="corner tl" /><span className="corner tr" />
  <span className="corner bl" /><span className="corner br" />

  <div className="panel-header">
    <h2>Panel Title</h2>
    {/* optional extra controls */}
  </div>

  <div className="panel-body">
    {/* content */}
  </div>
</div>
```

- `corner` spans render the four accent-colored corner brackets
- `panel-header h2` automatically gets a `◆` prefix and `Cinzel` font
- `panel-body` scrolls vertically up to `calc(100vh - 280px)`; add `.no-scroll` to disable

---

## Item Card

Used inside panels to display a data record.

```tsx
<div className="item">
  <div className="item-head">
    <span className="swatch" style={{ background: color, color }}>
      <input type="color" value={color} onChange={...} />
    </span>
    <input className="name" value={name} onChange={...} />
    <div className="item-actions">
      <button className="small">Edit</button>
      <button className="small danger ghost">Delete</button>
    </div>
  </div>
  <div className="item-body">
    {/* expanded detail */}
  </div>
</div>
```

- `.item` has accent corner triangles via `::before`/`::after`
- `.swatch` wraps a hidden `<input type="color">` — the swatch div is the visible color square
- `.item-body` is the collapsible detail area

---

## Buttons

```tsx
<button>Default</button>
<button className="primary">Primary Action</button>
<button className="small">Compact</button>
<button className="small ghost">Subtle</button>
<button className="small danger ghost">Destructive</button>
<button disabled>Disabled</button>
```

- Default: dark fill, `--line-strong` border, hover glows cyan
- `primary`: accent-bordered, accent-hot text, hover glows gold
- `danger`: red text/border, used for delete actions
- `ghost`: transparent background — combine with `small` or `danger`
- All buttons use `Rajdhani` font, `text-transform: uppercase`, `letter-spacing: 2px`

---

## Inputs & Fields

Standard text inputs inside panels inherit base reset styles. Use `.control-group` for inline label + input pairs (as seen in the header):

```tsx
<div className="control-group">
  <label>Label</label>
  <input type="number" value={...} onChange={...} />
</div>
```

For inline editable names in items, use `className="name"` on the input (borderless, only underline on focus).

Number inputs inside form rows:
```tsx
<div className="stratum-support-row">
  <label>
    <span className="lbl-name">Field Name</span>
    <span className="popinfo">/ 1,000,000</span>
  </label>
  <input type="number" value={...} onChange={...} />
</div>
```

---

## Status Bar / Register Rows

The faction list uses a compact register pattern (`.fr-*` classes):

```
.fr-wrap
  .fr                 ← flex row: dot · swatch · name · bar-track · seats · pct · toggle
  .fr-detail          ← expanded detail, hidden by default
    .fr-detail-actions
```

Alliance blocks use `.ag-*` classes with a colored left border.

---

## Empty State

```tsx
<div className="empty">No items found.</div>
```

Renders centered italic monospace text in `--text-mute`. Always use this instead of blank space.

---

## Add Button

```tsx
<div className="factions-add-row">
  <button className="add-btn" onClick={...}>+ Add Item</button>
</div>
```

`.add-btn` is full-width, dashed border, transparent — clearly secondary.

---

## Toasts & Indicators

Call `showToast(message, type?)` from `useAppContext()`. `type` is `'good'` (default) or `'error'`.

```tsx
const { showToast } = useAppContext();
showToast('Saved successfully');
showToast('Something failed', 'error');
```

---

## Full page example

```tsx
// src/components/MyPage.tsx
import { useAppContext } from '../store';

export function MyPage() {
  const { state } = useAppContext();

  return (
    <div className="panel">
      <span className="corner tl" /><span className="corner tr" />
      <span className="corner bl" /><span className="corner br" />

      <div className="panel-header">
        <h2>My Page</h2>
      </div>

      <div className="panel-body">
        {state.factions.length === 0 ? (
          <div className="empty">No factions yet.</div>
        ) : (
          state.factions.map(f => (
            <div key={f.id} className="item">
              <div className="item-head">
                <span className="swatch" style={{ background: f.color, color: f.color }} />
                <span style={{ flex: 1 }}>{f.name}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

Then in `Layout.tsx` NAV_ITEMS:
```tsx
{ id: 'mypage', icon: '◆', label: 'PAGE', title: 'My Page' }
```

And in `App.tsx`:
```tsx
import { MyPage } from './components/MyPage';
// ...
{tab === 'mypage' && <MyPage />}
```
