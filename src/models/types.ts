export interface Stratum {
  id: string;
  name: string;
  population: number;
  power: number;
}

export interface Faction {
  id: string;
  name: string;
  color: string;
  support: Record<string, number>;
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
  timestamp: number;
  totalSeats: number;
  unalignedMode: boolean;
  strata: Stratum[];
  factions: Faction[];
  alliances: Alliance[];
  projection?: ProjectionResult;
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
  supportSnapshot?: Record<string, number>;
}
export interface MapVertex { x: number; y: number; }

export interface FactionControlEntry {
  factionId: string;
  percentage: number; // 0–100
}

export interface MapRegion {
  id: string;
  name: string;
  name2?: string;
  description: string;
  vertices: MapVertex[];
  factionControl: FactionControlEntry[];
}

export type LawStatus = 'draft' | 'effect' | 'abolished' | 'failed';
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
}

export type Language = 'en' | 'cn';
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
  };
  ui: {
    tab: 'sim' | 'hist' | 'trash' | 'alliances' | string;
    language : Language;
    theme: string;
    factionExpanded: Record<string, boolean>;
  };
  map: { regions: MapRegion[] };
  laws: Law[];
  lawHistory: LawVoteRecord[];
}
