# Node Editor UI Refactor Plan

## Goals

- Make node editor UI code easy to scan by humans and AI agents.
- Keep canvas, schema, transform library, and page-shell responsibilities separated.
- Prefer small reusable components over page-level render blocks.
- Keep domain operations outside React components when they are not visual concerns.
- Preserve behavior during refactors with small, checkable slices.

## Target Shape

```text
src/components/nodes/
  NodeEditorPage.tsx          page mode/state orchestration only
  CanvasPalette.tsx           floating drag-source palette
  NodeCanvas.tsx              canvas orchestration, eventually split further
  SchemaEditor.tsx            schema tree orchestration, eventually split further
  TransformLibraryEditor.tsx  reusable transform definitions editor
  NodeValueTypeEditor.tsx     reusable value type selector
  nodeEditorUtils.ts          normalization and structural helpers
  node-editor.css             style import manifest only
  styles/
    node-shell.css            page, topbar, workspaces, sidebars, type list
    node-schema.css           schema tree editor
    node-canvas.css           canvas, graph nodes, ports, connection drawer
    node-transforms.css       transform library editor
    node-responsive.css       node-editor responsive overrides
```

## Refactor Slices

1. CSS ownership split
   Move the monolithic node stylesheet into focused files and keep `node-editor.css` as an import manifest.

2. Page decomposition
   Move floating palette rendering out of `NodeEditorPage.tsx`. Move node-state normalization and structural helpers into `nodeEditorUtils.ts`.

3. Canvas decomposition
   Split `NodeCanvas.tsx` into canvas state/hooks, toolbar, connection drawer, connection layer, entity node, transform node, port primitives, and binding helpers.

4. Schema decomposition
   Split `SchemaEditor.tsx` into tree container, node shell, node-kind editors, primitive controls, drag/drop helpers, and metadata/actions.

5. Shared node UI primitives
   Promote recurring controls to reusable components: kind tag, icon button, compact select, drag handle, port handle, floating panel, and drawer.

6. Stabilize layout contracts
   Document expected container behavior for full-viewport editors: page shell fills viewport, menus float, canvas owns panning/zooming, side panels avoid resizing the canvas.

7. Tests and visual checks
   Add focused unit coverage for helper functions and runtime-safe graph mutations. Use browser screenshots for canvas layout regressions once the browser test stack is available.

## Working Rules

- Each slice should leave `npm run build`, `npm run lint`, and `git diff --check` green.
- Avoid moving logic and changing behavior in the same patch unless the change is tiny and obvious.
- Name files by responsibility, not by implementation detail.
- Keep imports flowing inward: page shell imports feature modules; feature modules avoid importing page shell.
