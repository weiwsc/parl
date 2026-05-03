import { useState, useEffect, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type {
  AppState,
  EntityType,
  NodeEditorState,
  NodeEntityBinding,
  NodeGraph,
  NodeGraphConnection,
  NodeGraphNode,
  NodeInstanceValue,
  SchemaArrayItem,
  SchemaChild,
  SchemaValueType,
  TransformDefinition,
  TransformPort,
  TransformValueType,
  TypeMethodDefinition,
} from './models/types';
import { DEFAULT_NODE_EDITOR_CONFIG, normalizeNodeEditorConfig } from './game/nodes/config';
import { defaultEntityTypes } from './game/nodes/schema';

export const STORAGE_KEY = 'parliamentState_v3';
export const SCHEMA_VERSION = 3;
export const UNALIGNED_COLOR = '#6b7e9e';

export const THEMES = ['gold', 'green', 'cyan', 'crimson'];

export function uid(prefix: string): string { 
  return prefix + Math.random().toString(36).slice(2, 9); 
}

export function clone<T>(o: T): T { 
  return JSON.parse(JSON.stringify(o)); 
}

export function defaultState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    totalSeats: 200,
    unalignedMode: false,
    strata: [
      { id: 's1', name: 'Aristocracy',    color: '#d4a14a', population: 500000,   power: 4.0 },
      { id: 's2', name: 'Bourgeoisie',    color: '#2c6fb1', population: 1500000,  power: 2.0 },
      { id: 's3', name: 'Intelligentsia', color: '#8a4cb1', population: 1000000,  power: 1.6 },
      { id: 's4', name: 'Workers',        color: '#c44a2a', population: 4000000,  power: 0.8 },
      { id: 's5', name: 'Peasantry',      color: '#5fa863', population: 3000000,  power: 0.5 }
    ],
    factions: [
      { id: 'f1', name: 'Reactionaries', color: '#7a2030',
        support: { s1: 350000, s2: 225000, s3: 50000,   s4: 200000,  s5: 750000 } },
      { id: 'f2', name: 'Liberals',      color: '#2c6fb1',
        support: { s1: 100000, s2: 825000, s3: 350000,  s4: 600000,  s5: 450000 } },
      { id: 'f3', name: 'Progressives',  color: '#d4a14a',
        support: { s1: 25000,  s2: 300000, s3: 450000,  s4: 800000,  s5: 450000 } },
      { id: 'f4', name: 'Socialists',    color: '#c44a2a',
        support: { s1: 25000,  s2: 150000, s3: 150000,  s4: 2400000, s5: 1350000 } }
    ],
    history: [],
    alliances: [],
    trash: { strata: [], factions: [], alliances: [] },
    ui: {
      tab: 'sim',
      language : 'cn',
      theme: 'gold',
      factionExpanded: {},
      nodeEditor: DEFAULT_NODE_EDITOR_CONFIG,
    },
    map: { regions: [] },
    laws: [],
    lawHistory: [],
    nodes: {
      types: defaultEntityTypes(),
      graph: { nodes: [], connections: [] },
      transforms: defaultTransformDefinitions(),
    },
    senate: { autoAssign: false, strataAssign: false, factionSeats: {}, history: [] },
  };
}

export function normalizeState(p: any): AppState {
  const d = defaultState();
  if (!p) return d;
  const oldFormat = !p.schemaVersion || p.schemaVersion < 3;
  const s: AppState = {
    schemaVersion: SCHEMA_VERSION,
    totalSeats: typeof p.totalSeats === 'number' ? p.totalSeats : d.totalSeats,
    unalignedMode: !!p.unalignedMode,
    strata: Array.isArray(p.strata) ? p.strata.map((x: any) => ({
      id: x.id || uid('s'),
      name: String(x.name || 'Stratum'),
      color: x.color || '#888888',
      population: +x.population || 0,
      power: +x.power || 0
    })) : d.strata,
    factions: Array.isArray(p.factions) ? p.factions.map((x: any) => ({
      id: x.id || uid('f'),
      name: String(x.name || 'Faction'),
      color: x.color || '#888',
      support: x.support && typeof x.support === 'object' ? {...x.support} : {}
    })) : d.factions,
    history: Array.isArray(p.history) ? p.history : [],
    alliances: Array.isArray(p.alliances) ? p.alliances.map((x: any) => ({
      id: x.id || uid('a'),
      name: String(x.name || 'Alliance'),
      color: x.color || '#888',
      factionIds: Array.isArray(x.factionIds) ? x.factionIds : []
    })) : d.alliances,
    trash: {
      strata: p.trash && Array.isArray(p.trash.strata) ? p.trash.strata : [],
      factions: p.trash && Array.isArray(p.trash.factions) ? p.trash.factions : [],
      alliances: p.trash && Array.isArray(p.trash.alliances) ? p.trash.alliances : []
    },
    ui: {
      tab: (p.ui && p.ui.tab) || 'sim',
      language: (p.language && p.language || 'en'),
      theme: (p.ui && THEMES.includes(p.ui.theme)) ? p.ui.theme : 'gold',
      factionExpanded: (p.ui && p.ui.factionExpanded) || {},
      nodeEditor: normalizeNodeEditorConfig(p.ui?.nodeEditor ?? p.nodes?.config),
    },
    laws: Array.isArray(p.laws) ? p.laws.map((x: any) => ({
      ...x,
      factionStances:       (x.factionStances       && typeof x.factionStances       === 'object') ? x.factionStances       : {},
      senateFactionStances: (x.senateFactionStances && typeof x.senateFactionStances === 'object') ? x.senateFactionStances : {},
    })) : [],
    lawHistory: Array.isArray(p.lawHistory) ? p.lawHistory : [],
    map: {
      regions: (p.map && Array.isArray(p.map.regions))
        ? p.map.regions.map((r: any) => ({
            id: r.id || uid('r'),
            name: String(r.name || 'Region'),
            name2: r.name2 || undefined,
            description: String(r.description || ''),
            vertices: Array.isArray(r.vertices) ? r.vertices : [],
            factionControl: Array.isArray(r.factionControl) ? r.factionControl : [],
            seatings: typeof r.seatings === 'number' ? r.seatings : 0,
            strataWeights: (r.strataWeights && typeof r.strataWeights === 'object') ? r.strataWeights : {},
          }))
        : []
    },
    nodes: normalizeNodeEditorState(p.nodes, d.nodes),
    senate: {
      autoAssign: !!(p.senate && p.senate.autoAssign),
      strataAssign: !!(p.senate && p.senate.strataAssign),
      factionSeats: (p.senate && typeof p.senate.factionSeats === 'object')
        ? p.senate.factionSeats
        : {},
      history: (p.senate && Array.isArray(p.senate.history))
        ? p.senate.history
        : [],
    },
  };
  
  if (oldFormat) {
    s.factions.forEach(f => {
      const newSup: Record<string, number> = {};
      s.strata.forEach(st => {
        const pct = f.support[st.id];
        newSup[st.id] = (typeof pct === 'number')
          ? Math.round((pct / 100) * (st.population || 0))
          : 0;
      });
      f.support = newSup;
    });
  } else {
    s.factions.forEach(f => {
      s.strata.forEach(st => {
        if (typeof f.support[st.id] !== 'number') f.support[st.id] = 0;
      });
    });
  }
  return s;
}

function normalizeNodeEditorState(value: any, fallback: NodeEditorState): NodeEditorState {
  const incomingTypes = value && Array.isArray(value.types)
    ? value.types.map(normalizeEntityType)
    : fallback.types;
  const types = ensureBuiltinTypes(incomingTypes, fallback.types);

  return {
    types,
    graph: normalizeNodeGraph(value?.graph),
    transforms: normalizeTransformDefinitions(value?.transforms, fallback.transforms),
  };
}

function defaultTransformDefinitions(): TransformDefinition[] {
  return [{
    id: 'builtin-transform-pass',
    name: 'Pass Through',
    description: 'Return the input value unchanged.',
    inputs: [{ id: 'builtin-pass-input', name: 'input', valueType: { kind: 'any' } }],
    outputs: [{ id: 'builtin-pass-output', name: 'output', valueType: { kind: 'any' } }],
    expression: 'return inputs.input;',
  }];
}

function ensureBuiltinTypes(types: EntityType[], defaults: EntityType[]): EntityType[] {
  const next = [...types];

  for (const builtin of defaults.filter(type => type.builtIn)) {
    const index = next.findIndex(type => type.id === builtin.id || type.entityClass === builtin.entityClass);
    if (index < 0) {
      next.unshift(builtin);
      continue;
    }

    const existing = next[index];
    next[index] = {
      ...builtin,
      ...existing,
      id: builtin.id,
      builtIn: true,
      entityClass: builtin.entityClass,
      children: mergeBuiltinChildren(builtin.children, existing.children),
      methods: mergeBuiltinMethods(builtin.methods, existing.methods),
    };
  }

  return next;
}

function mergeBuiltinMethods(
  defaults: TypeMethodDefinition[] = [],
  existing: TypeMethodDefinition[] = [],
): TypeMethodDefinition[] | undefined {
  if (defaults.length === 0) return existing.length > 0 ? existing : undefined;

  const next = [...existing];
  for (const defaultMethod of defaults) {
    const index = next.findIndex(method => method.id === defaultMethod.id);
    if (index < 0) {
      next.push(defaultMethod);
      continue;
    }

    next[index] = { ...defaultMethod, ...next[index] };
  }

  return next;
}

function mergeBuiltinChildren(defaults: SchemaChild[], existing: SchemaChild[]): SchemaChild[] {
  if (existing.length === 0) return defaults;

  const next = [...existing];
  for (const defaultChild of defaults) {
    const index = next.findIndex(child => child.id === defaultChild.id);
    if (index < 0) {
      next.push(defaultChild);
      continue;
    }

    const existingChild = next[index];
    if (defaultChild.kind === 'section' && existingChild.kind === 'section') {
      next[index] = {
        ...defaultChild,
        ...existingChild,
        children: mergeBuiltinChildren(defaultChild.children, existingChild.children),
      };
    }
  }

  return next;
}

function normalizeEntityType(value: any): EntityType {
  const methods = normalizeTypeMethodDefinitions(value?.methods);

  return {
    id: stringOr(value?.id, uid('type')),
    name: stringOr(value?.name, 'Type'),
    description: optionalString(value?.description),
    builtIn: !!value?.builtIn,
    entityClass: optionalString(value?.entityClass),
    children: Array.isArray(value?.children) ? normalizeSchemaChildren(value.children) : [],
    ...(methods.length > 0 ? { methods } : {}),
  };
}

function normalizeTypeMethodDefinitions(value: any): TypeMethodDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeTransformDefinition);
}

function normalizeSchemaChildren(value: any[]): SchemaChild[] {
  return value.flatMap(normalizeSchemaChild);
}

function normalizeSchemaChild(value: any): SchemaChild[] {
  const kind = value?.kind;
  const common = {
    id: stringOr(value?.id, uid('field')),
    name: stringOr(value?.name, kind === 'section' ? 'section' : 'value'),
    description: optionalString(value?.description),
  };

  if (kind === 'section') {
    return [{
      kind: 'section',
      ...common,
      children: Array.isArray(value?.children) ? normalizeSchemaChildren(value.children) : [],
    }];
  }

  if (kind === 'reference') {
    return [{
      kind: 'reference',
      ...common,
      typeId: stringOr(value?.typeId, ''),
      computed: !!value?.computed,
    }];
  }

  if (kind === 'array') {
    return [{
      kind: 'array',
      ...common,
      item: normalizeArrayItem(value?.item),
      computed: !!value?.computed,
    }];
  }

  if (kind === 'primitive') {
    return [{
      kind: 'primitive',
      ...common,
      valueType: normalizeSchemaValueType(value?.valueType),
      defaultValue: value?.defaultValue,
      computed: !!value?.computed,
    }];
  }

  return [];
}

function normalizeArrayItem(value: any): SchemaArrayItem {
  if (value?.kind === 'reference') {
    return { kind: 'reference', typeId: stringOr(value.typeId, '') };
  }
  return { kind: 'primitive', valueType: normalizeSchemaValueType(value?.valueType) };
}

function normalizeNodeGraph(value: any): NodeGraph {
  const graphNodes: NodeGraphNode[] = Array.isArray(value?.nodes) ? value.nodes.flatMap(normalizeGraphNode) : [];
  const nodeIds = new Set(graphNodes.map(node => node.id));
  const connections = Array.isArray(value?.connections)
    ? value.connections.flatMap((connection: any) => normalizeConnection(connection, nodeIds))
    : [];

  return { nodes: graphNodes, connections };
}

function normalizeGraphNode(value: any): NodeGraphNode[] {
  const common = {
    id: stringOr(value?.id, uid('node')),
    title: stringOr(value?.title, value?.kind === 'transform' ? 'Transform' : 'Node'),
    x: finiteNumber(value?.x, 80),
    y: finiteNumber(value?.y, 80),
  };

  if (value?.kind === 'transform') {
    return [{
      kind: 'transform',
      ...common,
      transformId: optionalString(value?.transformId),
      inputs: normalizeTransformPorts(value?.inputs, 'input'),
      outputs: normalizeTransformPorts(value?.outputs, 'output'),
      expression: normalizeTransformExpression(value?.expression, 'return {};'),
    }];
  }

  if (value?.kind === 'entity') {
    return [{
      kind: 'entity',
      ...common,
      typeId: stringOr(value?.typeId, ''),
      binding: normalizeEntityBinding(value?.binding),
      values: normalizeInstanceValues(value?.values),
    }];
  }

  return [];
}

function normalizeEntityBinding(value: any): NodeEntityBinding | undefined {
  const entityClass = optionalString(value?.entityClass);
  const entityId = optionalString(value?.entityId);
  return entityClass && entityId ? { entityClass, entityId } : undefined;
}

function normalizeInstanceValues(value: any): Record<string, NodeInstanceValue> | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const next: Record<string, NodeInstanceValue> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string' || typeof raw === 'number') next[key] = raw;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function normalizeTransformDefinitions(value: any, fallback: TransformDefinition[]): TransformDefinition[] {
  if (!Array.isArray(value)) return fallback;

  const transforms = value.map(normalizeTransformDefinition);
  return transforms.length > 0 ? transforms : fallback;
}

function normalizeTransformDefinition(value: any): TransformDefinition {
  return {
    id: stringOr(value?.id, uid('transform')),
    name: stringOr(value?.name, 'Transform'),
    description: optionalString(value?.description),
    inputs: normalizeTransformPorts(value?.inputs, 'input'),
    outputs: normalizeTransformPorts(value?.outputs, 'output'),
    expression: normalizeTransformExpression(value?.expression, 'return {};'),
  };
}

function normalizeTransformExpression(value: any, fallback: string): string {
  const expression = stringOr(value, fallback);
  if (expression.trim() === 'return { output: input };') return 'return inputs.input;';
  return expression;
}

function normalizeTransformPorts(value: any, fallbackName: string): TransformPort[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ id: uid(fallbackName), name: fallbackName, valueType: { kind: 'any' } }];
  }

  return value.map((port: any) => ({
    id: stringOr(port?.id, uid('port')),
    name: stringOr(port?.name, fallbackName),
    valueType: normalizeTransformValueType(port?.valueType),
  }));
}

function normalizeConnection(value: any, nodeIds: Set<string>): NodeGraphConnection[] {
  const fromNodeId = stringOr(value?.from?.nodeId, '');
  const toNodeId = stringOr(value?.to?.nodeId, '');
  if (!nodeIds.has(fromNodeId) || !nodeIds.has(toNodeId)) return [];

  return [{
    id: stringOr(value?.id, uid('conn')),
    from: {
      nodeId: fromNodeId,
      path: stringOr(value?.from?.path, ''),
      label: stringOr(value?.from?.label, value?.from?.path || ''),
    },
    to: {
      nodeId: toNodeId,
      path: stringOr(value?.to?.path, ''),
      label: stringOr(value?.to?.label, value?.to?.path || ''),
    },
    mode: value?.mode === 'take' ? 'take' : 'read',
    amount: typeof value?.amount === 'number' ? value.amount : undefined,
  }];
}

function normalizeSchemaValueType(value: unknown): SchemaValueType {
  return value === 'string' ? 'string' : 'number';
}

function normalizeTransformValueType(value: any): TransformValueType {
  if (value === 'number' || value === 'string') return { kind: 'primitive', valueType: value };
  if (value === 'any') return { kind: 'any' };

  if (value?.kind === 'primitive') return { kind: 'primitive', valueType: normalizeSchemaValueType(value.valueType) };
  if (value?.kind === 'reference') return { kind: 'reference', typeId: stringOr(value.typeId, '') };
  if (value?.kind === 'array') return { kind: 'array', item: normalizeArrayItem(value.item) };
  return { kind: 'any' };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function loadFromStorage(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
    const v2 = localStorage.getItem('parliamentState_v2');
    if (v2) return normalizeState(JSON.parse(v2));
  } catch (e) {
    console.error('Load failed:', e);
  }
  return defaultState();
}

interface ToastMessage {
  message: string;
  type: string;
  id: number;
}

interface AppContextType {
  state: AppState;
  updateState: (updater: Partial<AppState> | ((prev: AppState) => AppState)) => void;
  toastMessage: ToastMessage | null;
  savedStatus: boolean;
  showToast: (message: string, type?: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadFromStorage());
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);
  const [savedStatus, setSavedStatus] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSavedStatus(true);
        setTimeout(() => setSavedStatus(false), 800);
      } catch (e) {
        console.error('Persist failed:', e);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    document.body.setAttribute('data-theme', state.ui.theme);
  }, [state.ui.theme]);

  const updateState = (updater: Partial<AppState> | ((prev: AppState) => AppState)) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? updater(clone(prev)) : { ...prev, ...updater };
      return next;
    });
  };

  const showToast = (message: string, type = 'good') => {
    setToastMessage({ message, type, id: Date.now() });
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <AppContext.Provider value={{ state, updateState, toastMessage, savedStatus, showToast }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextType {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
}
