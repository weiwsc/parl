import { useAppContext, uid } from '../store';
import { fmtCount, fmtFull, stratumTotalSupport } from '../utils/compute';
import type { Stratum } from '../models/types';
import { useLang } from '../utils/localization';
import { EmptyState } from './ui/EmptyState';
import { ListSurface } from './ui/ListSurface';
import { Panel } from './ui/Panel';

interface StratumCardProps {
  stratum: Stratum;
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

function StratumCard({ stratum }: StratumCardProps) {
  const { state, updateState, showToast } = useAppContext();

  const totalSup = stratumTotalSupport(state, stratum);
  const denom = Math.max(stratum.population, totalSup, 1);
  const overAllocated = totalSup > stratum.population;

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
    updateState((s) => {
      const idx = s.strata.findIndex(x => x.id === stratum.id);
      if (idx !== -1) {
        const st = s.strata[idx];
        s.trash.strata.push({
          id: st.id,
          deletedAt: Date.now(),
          data: JSON.parse(JSON.stringify(st)),
          supportSnapshot: Object.fromEntries(s.factions.map(f => [f.id, f.support[st.id] || 0]))
        });
        s.strata.splice(idx, 1);
        s.factions.forEach(f => delete f.support[st.id]);
      }
      return s;
    });
    showToast('Stratum moved to bin');
  };

  const unaligned = Math.max(0, stratum.population - totalSup);
  const segments: Segment[] = [];
  const legends: Legend[] = [];

  state.factions.forEach(f => {
    const v = f.support[stratum.id] || 0;
    if (v > 0) {
      const segPct = (v / denom) * 100;
      const popPct = stratum.population > 0 ? (v / stratum.population) * 100 : 0;
      segments.push({ color: f.color, name: f.name, width: segPct, pct: popPct, v });
      legends.push({ color: f.color, name: f.name, pct: popPct });
    }
  });

  if (!overAllocated && unaligned > 0) {
    const segPct = (unaligned / denom) * 100;
    const popPct = stratum.population > 0 ? (unaligned / stratum.population) * 100 : 0;
    segments.push({ isUnaligned: true, width: segPct, pct: popPct, v: unaligned });
    legends.push({ isUnaligned: true, pct: popPct });
  }

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
            value={stratum.population}
            onChange={(e) => updateStratum('population', e.target.value)}
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
              title={`${seg.name}: ${fmtFull(seg.v)} (${seg.pct.toFixed(1)}% of ${fmtCount(stratum.population)})`}
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
          !overAllocated && <span className="empty-leg">No support assigned</span>
        )}
        {overAllocated && (
          <span className="over-warn" title="Sum of supporters exceeds population">⚠ over by {fmtCount(totalSup - stratum.population)}</span>
        )}
      </div>
    </div>
  );
}

export function StrataList() {
  const { state, updateState } = useAppContext();
  const t = useLang();

  const addStratum = () => {
    updateState((s) => {
      const newId = uid('s');
      const palette = ['#d4a14a','#2c6fb1','#8a4cb1','#c44a2a','#5fa863','#3aa39e','#b8862e','#aa5f8e'];
      s.strata.push({ id: newId, name: 'New Stratum', color: palette[s.strata.length % palette.length], population: 1000000, power: 1.0 });
      s.factions.forEach(f => { f.support[newId] = 0; });
      return s;
    });
  };

  return (
    <Panel title={t("social_strata")}>
      {state.strata.length === 0 ? (
        <EmptyState>No strata defined.</EmptyState>
      ) : (
        <ListSurface>
          {state.strata.map(stratum => <StratumCard key={stratum.id} stratum={stratum} />)}
        </ListSurface>
      )}
      <button className="add-btn" onClick={addStratum}>+ {t("add_strata")}</button>
    </Panel>
  );
}
