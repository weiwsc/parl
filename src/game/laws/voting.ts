import type { FactionStance, Law, LawVoteRecord, ProjectionEntry } from '../../models/types';

export interface VoteGroup {
  factionId: string;
  seats: number;
  color: string;
  name: string;
}

export interface VoteBreakdown {
  support: VoteGroup[];
  abstain: VoteGroup[];
  against: VoteGroup[];
  supportSeats: number;
  abstainSeats: number;
  againstSeats: number;
  votingSeats: number;
  netSeats: number;
  totalSeats: number;
}

export interface LawVotingRules {
  quorumRatio: number;
  tiePasses: boolean;
}

export interface LawVoteEvaluation {
  outcome: LawVoteRecord['outcome'];
  quorumMet: boolean;
  votingRate: number;
  votingRateLabel: string;
  statusLabel: string;
  statusTone: FactionStance | 'neutral';
  conclusionLabel: string;
  netSeats: number;
}

export interface LawVoteRecordInput {
  id: string;
  timestamp?: number;
  chamber?: 'parliament' | 'senate';
}

export interface FloorLawEntry {
  law: Law;
  net: number;
}

export const DEFAULT_LAW_VOTING_RULES: LawVotingRules = {
  quorumRatio: 0.51,
  tiePasses: false,
};

export class LawVotingSession {
  private readonly law: Law;
  private readonly entries: ProjectionEntry[];
  private readonly totalSeats: number;
  private readonly rules: LawVotingRules;

  constructor(law: Law, entries: ProjectionEntry[], totalSeats: number, rules: LawVotingRules = DEFAULT_LAW_VOTING_RULES) {
    this.law = law;
    this.entries = entries;
    this.totalSeats = totalSeats;
    this.rules = rules;
  }

  breakdown(): VoteBreakdown {
    return computeVoteBreakdown(this.law, this.entries, this.totalSeats);
  }

  evaluate(): LawVoteEvaluation {
    return evaluateLawVote(this.breakdown(), this.rules);
  }

  createRecord({ id, timestamp = Date.now(), chamber }: LawVoteRecordInput): LawVoteRecord {
    const breakdown = this.breakdown();
    const evaluation = evaluateLawVote(breakdown, this.rules);

    return {
      id,
      timestamp,
      chamber,
      lawSnapshot: cloneLaw(this.law),
      factionResults: this.entries
        .filter(entry => !entry.isUnaligned)
        .map(entry => ({
          factionId: entry.faction.id,
          name: entry.faction.name,
          color: entry.faction.color,
          seats: entry.seats,
          stance: this.law.factionStances[entry.faction.id] ?? 'abstain',
        })),
      supportSeats: breakdown.supportSeats,
      abstainSeats: breakdown.abstainSeats,
      againstSeats: breakdown.againstSeats,
      totalSeats: this.totalSeats,
      outcome: evaluation.outcome,
    };
  }
}

export function computeVoteBreakdown(
  law: Law | null,
  entries: ProjectionEntry[],
  totalSeats: number
): VoteBreakdown {
  const support: VoteGroup[] = [];
  const abstain: VoteGroup[] = [];
  const against: VoteGroup[] = [];

  for (const entry of entries) {
    if (entry.isUnaligned) continue;

    const stance = law?.factionStances[entry.faction.id] ?? 'abstain';
    const item: VoteGroup = {
      factionId: entry.faction.id,
      seats: entry.seats,
      color: entry.faction.color,
      name: entry.faction.name,
    };

    if (stance === 'support') support.push(item);
    else if (stance === 'against') against.push(item);
    else abstain.push(item);
  }

  const supportSeats = countSeats(support);
  const againstSeats = countSeats(against);
  const abstainSeats = Math.max(0, totalSeats - supportSeats - againstSeats);
  const votingSeats = supportSeats + againstSeats;

  return {
    support,
    abstain,
    against,
    supportSeats,
    abstainSeats,
    againstSeats,
    votingSeats,
    netSeats: supportSeats - againstSeats,
    totalSeats,
  };
}

export function evaluateLawVote(
  breakdown: VoteBreakdown,
  rules: LawVotingRules = DEFAULT_LAW_VOTING_RULES
): LawVoteEvaluation {
  const votingRate = breakdown.totalSeats > 0 ? breakdown.votingSeats / breakdown.totalSeats : 0;
  const quorumMet = votingRate >= rules.quorumRatio;
  const hasMajority = rules.tiePasses
    ? breakdown.supportSeats >= breakdown.againstSeats
    : breakdown.supportSeats > breakdown.againstSeats;
  const passed = quorumMet && hasMajority;
  const statusTone = breakdown.netSeats > 0
    ? 'support'
    : breakdown.netSeats < 0
      ? 'against'
      : 'neutral';

  return {
    outcome: passed ? 'passed' : 'failed',
    quorumMet,
    votingRate,
    votingRateLabel: `${(votingRate * 100).toFixed(0)}%`,
    statusLabel: voteStatusLabel(breakdown, quorumMet),
    statusTone,
    conclusionLabel: conclusionLabel(passed, breakdown),
    netSeats: breakdown.netSeats,
  };
}

export function computeLawNetSupport(law: Law, entries: ProjectionEntry[]): number {
  return computeVoteBreakdown(law, entries, entries.reduce((sum, entry) => sum + entry.seats, 0)).netSeats;
}

export function getFloorLawEntries(laws: Law[], entries: ProjectionEntry[]): FloorLawEntry[] {
  return [...laws]
    .filter(law => (law.status === 'draft' || law.status === 'voting' || law.status === 'failed') && !law.isConstitution)
    .map(law => ({ law, net: computeLawNetSupport(law, entries) }))
    .sort((a, b) => b.net - a.net);
}

export function recordToBreakdown(record: LawVoteRecord): VoteBreakdown {
  const support: VoteGroup[] = [];
  const abstain: VoteGroup[] = [];
  const against: VoteGroup[] = [];

  for (const factionResult of record.factionResults) {
    const item: VoteGroup = {
      factionId: factionResult.factionId,
      seats: factionResult.seats,
      color: factionResult.color,
      name: factionResult.name,
    };

    if (factionResult.stance === 'support') support.push(item);
    else if (factionResult.stance === 'against') against.push(item);
    else abstain.push(item);
  }

  return {
    support,
    abstain,
    against,
    supportSeats: record.supportSeats,
    abstainSeats: record.abstainSeats,
    againstSeats: record.againstSeats,
    votingSeats: record.supportSeats + record.againstSeats,
    netSeats: record.supportSeats - record.againstSeats,
    totalSeats: record.totalSeats,
  };
}

function countSeats(groups: VoteGroup[]): number {
  return groups.reduce((sum, group) => sum + group.seats, 0);
}

function voteStatusLabel(breakdown: VoteBreakdown, quorumMet: boolean): string {
  if (!quorumMet) return 'FAILING (NOT ENOUGH VOTE)';
  if (breakdown.netSeats > 0) return 'PASSING';
  if (breakdown.netSeats < 0) return 'FAILING';
  if (breakdown.votingSeats > 0) return 'TIED';
  return 'NO VOTE';
}

function conclusionLabel(passed: boolean, breakdown: VoteBreakdown): string {
  if (passed) return 'PASS';
  if (breakdown.netSeats === 0 && breakdown.votingSeats > 0) return 'TIE -> FAIL';
  return 'FAIL';
}

function cloneLaw(law: Law): Law {
  return JSON.parse(JSON.stringify(law));
}
