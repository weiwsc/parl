import type { ThemeId } from '../theme';

export interface Stratum {
  id: string;
  name: string;
  color: string;
  population: number;
  power: number;
}

export interface Faction {
  id: string;
  name: string;
  description: string;
  color: string;
  globalModifiers: FactionElectionModifier[];
  participatesInElections: boolean;
}

export interface Alliance {
  id: string;
  name: string;
  color: string;
  factionIds: string[];
}

export interface ProjectionEntry {
  faction: { id: string; name: string; color: string };
  alliance?: Alliance;
  power: number;
  isUnaligned?: boolean;
  seats: number;
  share: number;
}

export interface ProjectionResult {
  entries: ProjectionEntry[];
  total: number;
  totalSeats?: number;
  unalignedMode?: boolean;
  strataCount?: number;
  factionsCount?: number;
  timestamp?: number;
}

export interface HistoryEntry {
  id: string;
  name?: string;
  timestamp: number;
  totalSeats: number;
  unalignedMode: boolean;
  strata: Stratum[];
  factions: Faction[];
  alliances: Alliance[];
  projection?: ProjectionResult;
  seatAdjustments?: Record<string, number>;
  results?: {
    factionId: string;
    name: string;
    color: string;
    power: number;
    seats: number;
    share: number;
    isUnaligned: boolean;
  }[];
  _open?: boolean;
}

export interface TrashItem<T> {
  id: string;
  deletedAt: number;
  data: T;
}
export interface MapVertex { x: number; y: number; }

export interface FactionControlEntry {
  factionId: string;
  percentage: number; // 0–100
}

export interface RegionElectionModifierEffect {
  support: number;
  randomness: number;
}

export interface FactionElectionModifier {
  id: string;
  title: string;
  description: string;
  stratumIds: string[];
  effect: RegionElectionModifierEffect;
}

export interface RegionElectionModifier extends FactionElectionModifier {
  factionId: string;
}

export interface MapRegion {
  id: string;
  name: string;
  name2?: string;
  description: string;
  vertices: MapVertex[];
  factionControl: FactionControlEntry[];
  seatings: number;
  strataWeights: Record<string, number>;
  population: number;
  factionSupport: Record<string, Record<string, number>>;
  electionModifiers: RegionElectionModifier[];
}

export type LawStatus = 'draft' | 'voting' | 'effect' | 'abolished' | 'failed';
export type FactionStance = 'support' | 'abstain' | 'against';

export interface LawClause {
  id: string;
  text: string;
  level: number; // 0–3 indentation depth
}

export interface Law {
  id: string;
  name: string;
  subtitle?: string;
  description: string;
  clauses: LawClause[];
  status: LawStatus;
  isConstitution?: boolean;
  factionStances: Record<string, FactionStance>;
  senateFactionStances: Record<string, FactionStance>;
  createdAt: number;
  votedAt?: number;
}

export interface LawVoteRecord {
  id: string;
  timestamp: number;
  lawSnapshot: Law;
  factionResults: { factionId: string; name: string; color: string; seats: number; stance: FactionStance }[];
  supportSeats: number;
  abstainSeats: number;
  againstSeats: number;
  totalSeats: number;
  outcome: 'passed' | 'failed';
  chamber?: 'parliament' | 'senate';
}

export type EventStoryRank = 'notice' | 'dispatch' | 'feature' | 'headline' | 'breaking';

export interface TimelineEvent {
  id: string;
  turn: number;
  rank: EventStoryRank;
  title: string;
  subtitle?: string;
  body: string;
  createdAt: number;
  updatedAt?: number;
}

export interface EventIssueArchive {
  id: string;
  turn: number;
  newspaperName: string;
  archivedAt: number;
}

export interface EventSettings {
  newspaperName: string;
  issues: EventIssueArchive[];
}

export interface ElectionSettings {
  baseRandomness: number;
}

export interface SenateHistoryEntry {
  id: string;
  name?: string;
  timestamp: number;
  totalSeats: number;
  autoAssign: boolean;
  factions: { id: string; name: string; color: string }[];
  alliances: Alliance[];
  projection: ProjectionResult;
}

export interface SenateState {
  autoAssign: boolean;
  strataAssign: boolean;
  hideUnassignedSeats: boolean;
  factionSeats: Record<string, number>;
  history: SenateHistoryEntry[];
}

export type Language = 'en' | 'cn';

// ── Node / Type Editor ────────────────────────────────────────────────────────

export type SchemaValueType = 'number' | 'string' | 'boolean';
export type NodeChartKind = 'pie' | 'bar';
export type NodeComputedViewKind = NodeChartKind | 'markdown';
export interface NodeChartValueType {
  kind: 'chart';
  chart: NodeChartKind;
}
export interface NodeMarkdownValueType {
  kind: 'markdown';
}
export type NodeComputedViewValueType = NodeChartValueType | NodeMarkdownValueType;
export type NodeValueType =
  | { kind: 'any' }
  | { kind: 'primitive'; valueType: SchemaValueType }
  | { kind: 'reference'; typeId: string }
  | { kind: 'array'; item: SchemaArrayItem }
  | NodeChartValueType
  | NodeMarkdownValueType;
export type TransformValueType = NodeValueType;

export interface SchemaPrimitive {
  kind: 'primitive';
  id: string;
  name: string;
  description?: string;
  valueType: SchemaValueType;
  defaultValue?: number | string | boolean;
  computed: boolean;
}

export interface SchemaReference {
  kind: 'reference';
  id: string;
  name: string;
  description?: string;
  typeId: string;
  computed: boolean;
}

export type SchemaArrayItem =
  | { kind: 'primitive'; valueType: SchemaValueType }
  | { kind: 'reference'; typeId: string };

export interface SchemaArray {
  kind: 'array';
  id: string;
  name: string;
  description?: string;
  item: SchemaArrayItem;
  computed: boolean;
}

export interface SchemaMarkdown {
  kind: 'markdown';
  id: string;
  name: string;
  description?: string;
  defaultValue?: string;
  computed: boolean;
}

export interface SchemaComputedView {
  kind: 'computedView';
  id: string;
  name: string;
  description?: string;
  valueType: NodeComputedViewValueType;
  computed: true;
}

export interface SchemaSection {
  kind: 'section';
  id: string;
  name: string;
  description?: string;
  children: SchemaChild[];
}

export type SchemaFieldChild = SchemaPrimitive | SchemaReference | SchemaArray | SchemaMarkdown | SchemaComputedView;
export type SchemaChild = SchemaSection | SchemaFieldChild;

export interface EntityType {
  id: string;
  name: string;
  description?: string;
  builtIn: boolean;
  entityClass?: string;
  children: SchemaChild[];
  methods?: TypeMethodDefinition[];
}

export interface NodeGraphPortRef {
  nodeId: string;
  path: string;
  label: string;
}

export type NodeConnectionMode = 'read' | 'take';

export interface NodeGraphConnection {
  id: string;
  from: NodeGraphPortRef;
  to: NodeGraphPortRef;
  mode: NodeConnectionMode;
  amount?: number;
}

export interface NodeEntityBinding {
  entityClass: string;
  entityId: string;
}

export type NodeInstanceValue = string | number | boolean;

export interface EntityGraphNode {
  kind: 'entity';
  id: string;
  typeId: string;
  title: string;
  x: number;
  y: number;
  binding?: NodeEntityBinding;
  values?: Record<string, NodeInstanceValue>;
}

export interface TransformPort {
  id: string;
  name: string;
  valueType: TransformValueType;
}

export interface TransformDefinition {
  id: string;
  name: string;
  description?: string;
  inputs: TransformPort[];
  outputs: TransformPort[];
  expression: string;
}

export type TypeMethodDefinition = TransformDefinition;

export interface TransformGraphNode {
  kind: 'transform';
  id: string;
  title: string;
  x: number;
  y: number;
  transformId?: string;
  inputs: TransformPort[];
  outputs: TransformPort[];
  expression: string;
}

export type NodeGraphNode = EntityGraphNode | TransformGraphNode;

export interface NodeGraph {
  nodes: NodeGraphNode[];
  connections: NodeGraphConnection[];
}

export type NodeEditorTheme = 'studio';
export type NodeEditorUiStyle = 'studio' | 'native';

export interface NodeEditorConfig {
  fontScale: number;
  theme: NodeEditorTheme;
  uiStyle: NodeEditorUiStyle;
}

export interface NodeEditorState {
  types: EntityType[];
  graph: NodeGraph;
  transforms: TransformDefinition[];
}

export interface AppState {
  schemaVersion: number;
  totalSeats: number;
  unalignedMode: boolean;
  strata: Stratum[];
  factions: Faction[];
  alliances: Alliance[];
  history: HistoryEntry[];
  trash: {
    strata: TrashItem<Stratum>[];
    factions: TrashItem<Faction>[];
    alliances: TrashItem<Alliance>[];
    regions: TrashItem<MapRegion>[];
    elections: TrashItem<HistoryEntry>[];
  };
  ui: {
    tab: 'sim' | 'hist' | 'trash' | 'alliances' | string;
    language : Language;
    theme: ThemeId;
    factionExpanded: Record<string, boolean>;
    nodeEditor: NodeEditorConfig;
  };
  map: { regions: MapRegion[] };
  laws: Law[];
  lawHistory: LawVoteRecord[];
  events: TimelineEvent[];
  eventSettings: EventSettings;
  election: ElectionSettings;
  nodes: NodeEditorState;
  senate: SenateState;
}
