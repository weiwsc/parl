# Parliament UI Guide

This app uses a compact industrial sci-fi UI system. New pages should be built from the shared primitives in `src/components/ui` instead of copying raw panel/header/tab markup.

## Core Files

| File | Purpose |
|---|---|
| `src/navigation.ts` | Left sidebar page registry |
| `src/components/ui/AppHeader.tsx` | Shared top header bar |
| `src/components/ui/Panel.tsx` | Shared panel shell with corner brackets |
| `src/components/ui/TabBar.tsx` | Shared tab navigation |
| `src/components/ui/EmptyState.tsx` | Shared empty state text |
| `src/components/ui/ListSurface.tsx` | Shared list/grid wrappers |
| `src/components/ui/TableSurface.tsx` | Shared horizontal table scroll wrapper |
| `src/components/map` | Map-specific toolbar, canvas, legend, and inspector components |
| `src/game/map` | Pure map geometry, viewport, control, and import/export helpers |
| `src/index.css` | Stylesheet import manifest |
| `src/styles` | Global, shared, and page-owned stylesheets |

## Adding A New Sidebar Page

1. Add a nav item in `src/navigation.ts`:

```ts
export const APP_NAV_ITEMS: SidebarNavItem[] = [
  // existing items...
  {
    id: 'diplomacy',
    tab: 'diplomacy',
    icon: '◇',
    label: 'DIPL',
    title: 'Diplomacy',
  },
];
```

Use `disabled: true` for placeholders. If one sidebar button represents several internal tabs, add `activeTabs`.

```ts
{
  id: 'parliament',
  tab: 'sim',
  icon: '◈',
  label: 'PARL',
  title: 'Parliament',
  activeTabs: ['sim', 'hist', 'trash'],
}
```

2. Render the page in `src/App.tsx`:

```tsx
{tab === 'diplomacy' && <DiplomacyPage />}
```

3. Create `src/components/DiplomacyPage.tsx` using the page pattern below.

## Page Pattern

Use `AppHeader` for the top bar. It renders the crest, title block, spacer, and any children you place after it.

```tsx
import { AppHeader } from './ui/AppHeader';
import { Panel } from './ui/Panel';

export function DiplomacyPage() {
  return (
    <div className="diplomacy-page">
      <AppHeader title="DIPLOMACY" subtitle="// FOREIGN OFFICE · v1.0 //">
        <div className="control-group">
          <label>TREATIES</label>
          <input type="number" value={4} readOnly />
        </div>
        <button className="primary">New Pact</button>
      </AppHeader>

      <Panel title="Foreign Powers">
        {/* content */}
      </Panel>
    </div>
  );
}
```

Header children can be badges, controls, toggles, stats, buttons, or page-specific indicators. Keep them as direct children of `AppHeader`.

## Panel

Use `Panel` instead of writing `.panel`, `.panel-header`, corner spans, and `.panel-body` by hand.

```tsx
<Panel
  title="Election Archive"
  subtitle="12 records"
  actions={<button className="ghost small">Clear All</button>}
>
  Content
</Panel>
```

Use `bodyClassName="no-scroll"` when the panel body should not use the default internal scroll behavior.

```tsx
<Panel title="Support Matrix" bodyClassName="matrix-wrap no-scroll">
  <TableSurface>
    <table className="matrix">{/* rows */}</table>
  </TableSurface>
</Panel>
```

## Tabs

Use `TabBar` for tabbed pages.

```tsx
type MyTab = 'overview' | 'history';

const tabs: TabItem<MyTab>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'History', badge: history.length },
];

<TabBar active={tab} items={tabs} onChange={setTab} />
```

Tabs automatically match existing desktop/mobile styling and horizontal mobile scrolling.

## Lists, Grids, Tables

Use these wrappers so spacing and overflow behavior stay consistent:

```tsx
<ListSurface className="history-list">
  {items.map(item => <HistoryItem key={item.id} item={item} />)}
</ListSurface>

<GridSurface className="law-registry-list">
  {laws.map(law => <LawCard key={law.id} law={law} />)}
</GridSurface>

<TableSurface>
  <table className="matrix">{/* rows */}</table>
</TableSurface>
```

`GridSurface` is intentionally plain; pass the domain-specific class for columns, such as `law-registry-list`, `constitution-list`, or a new page-specific class.

## Empty States

Use `EmptyState` instead of raw `.empty` divs.

```tsx
{items.length === 0 ? (
  <EmptyState>No records yet.</EmptyState>
) : (
  <ListSurface>{items.map(...)}</ListSurface>
)}
```

For compact nested states:

```tsx
<EmptyState className="compact-empty">No strata defined.</EmptyState>
```

## Cards And Rows

Record cards still use `.item` and `.item-head`.

```tsx
<div className="item">
  <div className="item-head">
    <span className="swatch" style={{ background: color, color }}>
      <input type="color" value={color} onChange={...} />
    </span>
    <input className="name" value={name} onChange={...} />
    <button className="small danger ghost">Delete</button>
  </div>
  <div className="item-body">Details</div>
</div>
```

Use `.fr-*` for compact faction register rows and `.ag-*` for alliance groups.

## Buttons

```tsx
<button>Default</button>
<button className="primary">Primary</button>
<button className="small">Small</button>
<button className="small ghost">Ghost</button>
<button className="small danger ghost">Delete</button>
```

Buttons are uppercase by default. Prefer `primary` for the main page action, `ghost small` for secondary actions, and `danger ghost` for destructive actions.

## Forms

Use `.control-group` for compact header controls:

```tsx
<div className="control-group">
  <label>Total Seats</label>
  <input type="number" value={totalSeats} onChange={...} />
</div>
```

Use page-specific field classes when an editor needs denser layout, like the law editor’s `.law-field` and `.law-field-input`.

## Theme Tokens

Use CSS variables from `src/styles/foundation.css`; do not hardcode page palettes. See `src/styles/README.md` before adding new stylesheet rules.

| Token | Use |
|---|---|
| `--bg-panel` | Main panel surface |
| `--bg-panel-alt` | Item/card surface |
| `--bg-input` | Inputs and inset controls |
| `--line`, `--line-soft`, `--line-strong` | Borders |
| `--accent`, `--accent-hot`, `--accent-deep` | Primary accent |
| `--cyan` | Secondary accent |
| `--text`, `--text-dim`, `--text-mute` | Text |
| `--danger`, `--good`, `--neutral` | Status colors |

## Map And Node Editor Foundations

The map page is split into two layers:

| Layer | Files | Rule |
|---|---|---|
| UI | `src/components/map/*` | Render SVG, controls, inspector, and user events |
| Game/map logic | `src/game/map/*` | Hold geometry, viewport math, control aggregation, and map serialization |

Keep reusable logic in `src/game/map` before adding it to `MapPage`. For example:

- Put point, snapping, bounds, panning, and zoom math in `src/game/map/geometry.ts`.
- Put faction/alliance control calculations in `src/game/map/control.ts`.
- Put import/export normalization in `src/game/map/io.ts`.
- Keep `src/components/MapPage.tsx` as the page coordinator that wires app state to reusable UI pieces.

For a future blueprint-style node editor, follow the same split:

- Put node data models and evaluators under `src/game/nodes`.
- Use plain objects for `section`, `primitive`, `computedPrimitive`, `transform`, ports, and connections.
- Let UI components render nodes and wires, but keep evaluation, type checks, connection validation, and JavaScript transform execution outside React components.
- Reuse map geometry helpers for viewport, panning, zooming, hit testing, snapping, and SVG point conversion.

## Checklist For New UI

- Add sidebar navigation in `src/navigation.ts`.
- Render the route in `src/App.tsx`.
- Use `AppHeader` for the page header.
- Use `Panel` for framed sections.
- Use `TabBar` for local tabs.
- Use `EmptyState`, `ListSurface`, `GridSurface`, and `TableSurface` where applicable.
- Keep domain/game calculations outside UI components under `src/game`.
- Verify with `npm run build` and `npm run lint`.
