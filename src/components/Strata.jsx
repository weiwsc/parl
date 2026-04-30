import { useAppContext, uid } from '../store';
import { escapeHtml, fmtCount, fmtFull, stratumTotalSupport } from '../utils/compute';

function StratumCard({ stratum }) {
  const { state, updateState, showToast } = useAppContext();

  const totalSup = stratumTotalSupport(state, stratum);
  const denom = Math.max(stratum.population, totalSup, 1);
  const overAllocated = totalSup > stratum.population;

  const updateStratum = (field, value) => {
    updateState((s) => {
      const idx = s.strata.findIndex(x => x.id === stratum.id);
      if (idx !== -1) {
        if (field === 'name') s.strata[idx][field] = value;
        else s.strata[idx][field] = parseFloat(value) || 0;
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
  const segments = [];
  const legends = [];

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

  const addStratum = () => {
    updateState((s) => {
      const newId = uid('s');
      s.strata.push({ id: newId, name: 'New Stratum', population: 1000000, power: 1.0 });
      s.factions.forEach(f => { f.support[newId] = 0; });
      return s;
    });
  };

  return (
    <div className="panel">
      <span className="corner tl"></span><span className="corner tr"></span>
      <span className="corner bl"></span><span className="corner br"></span>
      <div className="panel-header"><h2>Social Strata</h2></div>
      <div className="panel-body">
        {state.strata.length === 0 ? (
          <div className="empty">No strata defined.</div>
        ) : (
          state.strata.map(s => <StratumCard key={s.id} stratum={s} />)
        )}
        <button className="add-btn" onClick={addStratum}>+ Add Stratum</button>
      </div>
    </div>
  );
}
