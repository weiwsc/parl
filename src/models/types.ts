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
}
