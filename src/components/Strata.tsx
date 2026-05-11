import { useMemo } from 'react';
import { useAppContext, uid } from '../store';
import {
  computeStratumElectionTotals,
  fmtCount,
  fmtFull,
  getComputedStratumPopulation,
  hasRegionalPopulationData,
  stratumTotalSupport,
} from '../utils/compute';
import type { Stratum } from '../models/types';
import { useLang } from '../utils/localization';
import { EmptyState } from './ui/EmptyState';
import { ListSurface } from './ui/ListSurface';
import { Panel } from './ui/Panel';

interface StratumCardProps {
  stratum: Stratum;
  electionTotals: ReturnType<typeof computeStratumElectionTotals>;
}

interface Segment {
  color?: string;
  name?: string;
  width: number;
  pct: number;
  v: number;
  isUnaligned?: boolean;
}

interface Legend {
  color?: string;
  name?: string;
  pct: number;
  isUnaligned?: boolean;
}

function StratumCard({ stratum, electionTotals }: StratumCardProps) {
  const { state, updateState, showToast } = useAppContext();

  const population = getComputedStratumPopulation(state, stratum);
  const usesRegionalPopulation = hasRegionalPopulationData(state);
  const totalSup = stratumTotalSupport(state, stratum);
  const overAllocated = totalSup > population;

  const updateStratum = (field: keyof Stratum, value: string) => {
    updateState((s) => {
      const idx = s.strata.findIndex(x => x.id === stratum.id);
      if (idx !== -1) {
        if (field === 'name' || field === 'color') (s.strata[idx] as any)[field] = value;
        else (s.strata[idx] as any)[field] = parseFloat(value) || 0;
      }
      return s;
    });
  };

  const deleteStratum = () => {
    if (!window.confirm(`Move stratum "${stratum.name || 'Untitled Stratum'}" to recycle bin?`)) return;

    updateState((s) => {
      const idx = s.strata.findIndex(x => x.id === stratum.id);
      if (idx !== -1) {
        const st = s.strata[idx];
        s.trash.strata.push({
          id: st.id,
          deletedAt: Date.now(),
          data: JSON.parse(JSON.stringify(st)),
        });
        s.strata.splice(idx, 1);
        s.map.regions.forEach(region => {
          if (region.strataWeights) delete region.strataWeights[st.id];
          Object.values(region.factionSupport ?? {}).forEach(byStratum => { delete byStratum[st.id]; });
          region.electionModifiers = (region.electionModifiers ?? []).map(modifier => ({
            ...modifier,
            stratumIds: (modifier.stratumIds ?? []).filter(id => id !== st.id),
          }));
        });
      }
      return s;
    });
    showToast('Stratum moved to bin');
  };

  const totalVote = electionTotals.totalVotesByStratum[stratum.id] || 0;
  const segments: Segment[] = [];
  const legends: Legend[] = [];

  state.factions.forEach(f => {
    const v = electionTotals.votesByFactionByStratum[f.id]?.[stratum.id] || 0;
    if (v > 0) {
      const votePct = totalVote > 0 ? (v / totalVote) * 100 : 0;
      segments.push({ color: f.color, name: f.name, width: votePct, pct: votePct, v });
      legends.push({ color: f.color, name: f.name, pct: votePct });
    }
  });

  return (
    <div className="item stratum-card">
      <div className="item-head">
        <span className="stratum-color-swatch" style={{ background: stratum.color || '#888888' }}>
          <input type="color" value={stratum.color || '#888888'} onChange={e => updateStratum('color', e.target.value)} />
        </span>
        <input
          className="name"
          value={stratum.name}
          onChange={(e) => updateStratum('name', e.target.value)}
        />
        <button className="danger" onClick={deleteStratum}>DEL</button>
      </div>
      <div className="stratum-fields">
        <div className="field">
          <label>POP</label>
          <input
            type="number"
            min="0"
            step="1"
            value={Math.round(population)}
            readOnly={usesRegionalPopulation}
            title={usesRegionalPopulation ? 'Computed from regional population and strata percentages' : undefined}
            onChange={(e) => {
              if (!usesRegionalPopulation) updateStratum('population', e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label>PWR</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={stratum.power}
            onChange={(e) => updateStratum('power', e.target.value)}
          />
        </div>
      </div>
      <div className={`stratum-support-bar ${overAllocated ? 'over' : ''}`}>
        {segments.map((seg, i) => (
          seg.isUnaligned ? (
            <span
              key="unaligned"
              className="seg seg-unaligned"
              style={{ width: `${seg.width.toFixed(2)}%` }}
              title={`Unaligned: ${fmtFull(seg.v)} (${seg.pct.toFixed(1)}%)`}
            ></span>
          ) : (
            <span
              key={i}
              className="seg"
              style={{ background: seg.color, color: seg.color, width: `${seg.width.toFixed(2)}%` }}
              title={`${seg.name}: ${fmtFull(seg.v)} votes (${seg.pct.toFixed(1)}% of ${fmtCount(totalVote)} stratum vote)`}
            ></span>
          )
        ))}
      </div>
      <div className="stratum-support-legend">
        {legends.length > 0 ? legends.map((leg, i) => (
          leg.isUnaligned ? (
            <span key="unaligned" className="l l-unaligned"><span className="d"></span>Unaligned {leg.pct.toFixed(0)}%</span>
          ) : (
            <span key={i} className="l" style={{ color: leg.color }}>
              <span className="d"></span>{leg.name} {leg.pct.toFixed(0)}%
            </span>
          )
        )) : (
          !overAllocated && <span className="empty-leg">No projected votes</span>
        )}
        {overAllocated && (
          <span className="over-warn" title="Sum of supporters exceeds population">⚠ over by {fmtCount(totalSup - population)}</span>
        )}
      </div>
    </div>
  );
}

export function StrataList() {
  const { state, updateState } = useAppContext();
  const t = useLang();
  const electionTotals = useMemo(() => computeStratumElectionTotals(state, { randomize: false }), [state]);

  const addStratum = () => {
    updateState((s) => {
      const newId = uid('s');
      const palette = ['#d4a14a','#2c6fb1','#8a4cb1','#c44a2a','#5fa863','#3aa39e','#b8862e','#aa5f8e'];
      s.strata.push({ id: newId, name: 'New Stratum', color: palette[s.strata.length % palette.length], population: 1000000, power: 1.0 });
      s.map.regions.forEach(region => { region.strataWeights[newId] = 0; });
      return s;
    });
  };

  return (
    <Panel title={t("social_strata")}>
      {state.strata.length === 0 ? (
        <EmptyState>No strata defined.</EmptyState>
      ) : (
        <ListSurface>
          {state.strata.map(stratum => (
            <StratumCard key={stratum.id} stratum={stratum} electionTotals={electionTotals} />
          ))}
        </ListSurface>
      )}
      <button className="add-btn" onClick={addStratum}>+ {t("add_strata")}</button>
    </Panel>
  );
}
