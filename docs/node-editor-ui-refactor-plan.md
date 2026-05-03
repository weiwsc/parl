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

## Function And Method Model

Transforms should become a broader function system with two scopes:

- Global pure functions: reusable graph nodes with explicit inputs and outputs.
- Type methods: functions owned by an `EntityType`, allowed to read that type instance and write computed fields on that instance.

### Script API

Use shader-style names for the script surface:

- `this` has special JavaScript binding semantics and is easy to misuse.
- `in` is a JavaScript keyword, so it cannot be a top-level parameter name.
- `const` is also reserved, so user-edited values should be documented as const-like fields, not exposed through a variable literally named `const`.

Use one structured context object plus ergonomic aliases. Scripts are always JavaScript function bodies and must include a `return` statement:

```js
scope.inputs.amount
scope.outputs.total = scope.inputs.amount * 2
scope.props.support.byStratum

outputs.total = inputs.amount * 2
const total = props.support.byStratum.reduce((sum, value) => sum + value, 0)
return { total }
```

Implementation target:

```ts
interface FunctionScriptContext {
  inputs: Record<string, NodeRuntimeValue>;
  outputs: Record<string, NodeRuntimeValue>;
  props: Record<string, NodeRuntimeValue>;
  target?: TypeMethodTarget;
}

interface TypeMethodTarget {
  typeId: string;
  nodeId?: string;
  props: Record<string, NodeRuntimeValue>;
}
```

The runtime should call scripts with `scope`, `inputs`, `outputs`, `props`, and `target` parameters. `inputs` and `outputs` are the port API. Type methods additionally get `props.fieldName` and `target.props.fieldName` access for attached type fields.

Return rules:

- Every transform/method script must include `return`.
- A single-output function may return the output value directly.
- A multi-output function must return an object keyed by output name, or return the `outputs` object after assigning into it.

### Field Modes

Type fields should be understood as one of two modes:

- `const`: user-editable value stored on the node instance or bound game entity. It can be read by methods.
- `computed`: derived value. It is read-only in the UI and can be assigned by a function/method or by a graph connection.

The existing `computed: boolean` schema flag can remain as the storage primitive for now:

- `computed: false` means `const`.
- `computed: true` means `computed`.

The UI should present this as a mode selector or clear label instead of a vague checkbox.

### Type Method Writes

Type methods can read attached fields through `props`. Port outputs remain separate in `outputs`:

```js
const total = props.support.byStratum.reduce((sum, value) => sum + value, 0)
outputs.totalSupport = total
return outputs
```

Runtime rules:

- Method writes can only target fields on the owning type.
- Writes to `computed` fields are accepted.
- Writes to `const` fields are rejected with diagnostics.
- Missing nested objects on `props` should be created before execution so field access is ergonomic.

### Data Shape

Prefer adding methods to `EntityType` while preserving global functions separately:

```ts
interface EntityType {
  id: string;
  name: string;
  children: SchemaChild[];
  methods?: TypeMethodDefinition[];
}

interface TypeMethodDefinition {
  id: string;
  name: string;
  description?: string;
  inputs: TransformPort[];
  outputs: TransformPort[];
  expression: string;
}
```

The current `TransformDefinition` can migrate toward `FunctionDefinition`, but that rename should be a separate compatibility-safe step.

### Canvas Semantics

- Pure function node: same role as current transform node, with grouped `$in`/`$out` execution.
- Type method node: function node with an owning type and optional receiver/self input.
- Later: allow computed fields in a type schema to choose a type method as their implementation.

## Working Rules

- Each slice should leave `npm run build`, `npm run lint`, and `git diff --check` green.
- Avoid moving logic and changing behavior in the same patch unless the change is tiny and obvious.
- Name files by responsibility, not by implementation detail.
- Keep imports flowing inward: page shell imports feature modules; feature modules avoid importing page shell.
