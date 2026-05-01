import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAppContext, uid } from '../store';
import { useAuth } from '../context/AuthContext';
import type { MapRegion, MapVertex, Faction, Alliance } from '../models/types';

// ── Types ─────────────────────────────────────────────────────────────────────
type ViewMode = 'plain' | 'faction' | 'alliance';
type EditorTool = 'select' | 'add';
interface DragState { regionId: string; vIdx: number; }
interface HoverEdge { regionId: string; eIdx: number; pos: MapVertex; }
interface CtrlEntry { id: string; color: string; label: string; pct: number; }

// ── Constants ─────────────────────────────────────────────────────────────────
const VBW = 1000, VBH = 750, SNAP_D = 18, PAT_SZ = 15, GRID_SZ = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────
function svgPt(el: SVGSVGElement, cx: number, cy: number): MapVertex {
  const pt = el.createSVGPoint();
  pt.x = cx; pt.y = cy;
  const ctm = el.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const t = pt.matrixTransform(ctm.inverse());
  return { x: t.x, y: t.y };
}

function d2(a: MapVertex, b: MapVertex) { return Math.hypot(a.x - b.x, a.y - b.y); }

function snapGrid(p: MapVertex): MapVertex {
  return {
    x: Math.round(p.x / GRID_SZ) * GRID_SZ,
    y: Math.round(p.y / GRID_SZ) * GRID_SZ
  };
}

function getClosestPointOnSegment(p: MapVertex, v: MapVertex, w: MapVertex) {
  const l2 = d2(v, w) ** 2;
  if (l2 === 0) return { dist: d2(p, v), pt: { ...v } };
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const pt = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
  return { dist: d2(p, pt), pt };
}

function snapTo(
    pos: MapVertex,
    regions: MapRegion[],
    extras: MapVertex[] = [],
    excR?: string,
    excV?: number
): MapVertex | null {
  let best: MapVertex | null = null, bd = SNAP_D;
  const check = (v: MapVertex) => { const dd = d2(pos, v); if (dd < bd) { bd = dd; best = { ...v }; } };
  for (const r of regions) {
    for (let i = 0; i < r.vertices.length; i++) {
      if (r.id === excR && i === excV) continue;
      check(r.vertices[i]);
    }
  }
  for (const v of extras) check(v);
  return best;
}

function pts(v: MapVertex[]): string {
  return v.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

function ctr(v: MapVertex[]): MapVertex {
  if (!v.length) return { x: VBW / 2, y: VBH / 2 };
  return { x: v.reduce((s, p) => s + p.x, 0) / v.length, y: v.reduce((s, p) => s + p.y, 0) / v.length };
}

// ── Control entry helpers ──────────────────────────────────────────────────────
function getCtrlEntries(
    region: MapRegion,
    factions: Faction[],
    alliances: Alliance[],
    mode: ViewMode
): CtrlEntry[] {
  if (mode === 'plain') return [];

  if (mode === 'faction') {
    return region.factionControl
        .filter(fc => fc.percentage > 0)
        .flatMap(fc => {
          const f = factions.find(f => f.id === fc.factionId);
          return f ? [{ id: f.id, color: f.color, label: f.name, pct: fc.percentage }] : [];
        });
  }

  const map = new Map<string, CtrlEntry>();
  for (const fc of region.factionControl) {
    if (fc.percentage <= 0) continue;
    const f = factions.find(f => f.id === fc.factionId);
    if (!f) continue;
    const al = alliances.find(a => a.factionIds.includes(f.id));
    const key = al ? al.id : f.id;
    const ex = map.get(key);
    if (ex) ex.pct += fc.percentage;
    else map.set(key, { id: key, color: al ? al.color : f.color, label: al ? al.name : f.name, pct: fc.percentage });
  }
  return Array.from(map.values());
}

function getPatId(rId: string, mode: string) { return `pat_${rId.replace(/[^a-z0-9]/gi, '_')}_${mode}`; }

function getFill(region: MapRegion, factions: Faction[], alliances: Alliance[], mode: ViewMode): string {
  if (mode === 'plain') return 'none';
  const e = getCtrlEntries(region, factions, alliances, mode);
  if (!e.length) return 'none';
  if (e.length === 1) return e[0].color;
  return `url(#${getPatId(region.id, mode)})`;
}

// ── PieChart ──────────────────────────────────────────────────────────────────
function PieChart({ entries, size = 120 }: { entries: CtrlEntry[]; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 6;
  const currentTotal = entries.reduce((s, e) => s + e.pct, 0);
  const displayEntries = [...entries];

  if (currentTotal < 99.9) {
    displayEntries.push({
      id: 'neutral',
      color: '#444',
      label: 'Neutral',
      pct: 100 - currentTotal
    });
  }

  if (displayEntries.length === 1) {
    return (
        <svg className="map-pie-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={r} fill={displayEntries[0].color} stroke="var(--bg-deeper)" strokeWidth={1.2} />
        </svg>
    );
  }

  let angle = -Math.PI / 2;
  const slices = displayEntries.map(e => {
    const sweep = (e.pct / 100) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    return { ...e, d: `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r},0,${large},1,${x2.toFixed(2)},${y2.toFixed(2)} Z` };
  });

  return (
      <svg className="map-pie-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => (
            <path key={i} d={s.d} fill={s.color} fillOpacity={0.85} stroke="var(--bg-deeper)" strokeWidth={1.2} />
        ))}
      </svg>
  );
}
// ── MapLegend ─────────────────────────────────────────────────────────────────
interface LegendProps {
  regions: MapRegion[];
  factions: Faction[];
  alliances: Alliance[];
  viewMode: ViewMode;
}

function MapLegend({ regions, factions, alliances, viewMode }: LegendProps) {
  const items = useMemo(() => {
    if (viewMode === 'plain') return [];

    const legendMap = new Map<string, { id: string, name: string, color: string, full: number, partial: number }>();

    if (viewMode === 'faction') {
      factions.forEach(f => legendMap.set(f.id, { id: f.id, name: f.name, color: f.color, full: 0, partial: 0 }));
    } else if (viewMode === 'alliance') {
      alliances.forEach(a => legendMap.set(a.id, { id: a.id, name: a.name, color: a.color, full: 0, partial: 0 }));
      factions.forEach(f => {
        if (!alliances.some(a => a.factionIds.includes(f.id))) {
          legendMap.set(f.id, { id: f.id, name: f.name, color: f.color, full: 0, partial: 0 });
        }
      });
    }

    regions.forEach(r => {
      const entries = getCtrlEntries(r, factions, alliances, viewMode);
      if (entries.length === 1) {
        const item = legendMap.get(entries[0].id);
        if (item) item.full += 1;
      } else if (entries.length > 1) {
        entries.forEach(e => {
          const item = legendMap.get(e.id);
          if (item) item.partial += 1;
        });
      }
    });

    return Array.from(legendMap.values())
        .filter(i => i.full > 0 || i.partial > 0)
        .sort((a, b) => (b.full + b.partial) - (a.full + a.partial));
  }, [regions, factions, alliances, viewMode]);

  if (viewMode === 'plain' || items.length === 0) return null;

  return (
      <div
          className="map-legend-floating"
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '24px',
            width: '280px',
            maxHeight: '40vh',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--line-strong)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            zIndex: 10,
            pointerEvents: 'auto',
          }}
          onWheel={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
      >
        <div className="insp-section" style={{ margin: 0, padding: '16px', overflowY: 'auto', borderBottom: 'none' }}>
          <div className="insp-section-label" style={{ marginBottom: '16px' }}>
            {viewMode === 'faction' ? 'FACTION' : 'ALLIANCE'} DOMINANCE
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map(item => (
                <div key={item.id} className="insp-ctrl-row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <span className="ctrl-swatch" style={{ background: item.color }} />

                  <span
                      className="ctrl-name"
                      title={item.name}
                      style={{ flex: 1, minWidth: 170, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                {item.name}
              </span>

                  <div className="ctrl-pct-val" style={{ display: 'flex', gap: '8px', minWidth: '45px', justifyContent: 'flex-end', fontSize: '11px' }}>
                    <span title="Full Control">{item.full}F</span>
                    <span style={{ color: 'var(--line-strong)' }}>|</span>
                    <span title="Partial Control" style={{ color: 'var(--text-mute)' }}>{item.partial}P</span>
                  </div>
                </div>
            ))}
          </div>
        </div>
      </div>
  );
}
// ── RegionInspector ────────────────────────────────────────────────────────────
interface InspectorProps {
  region: MapRegion | null;
  factions: Faction[];
  alliances: Alliance[];
  canEdit: boolean;
  onUpdateRegion: (r: MapRegion) => void;
  onDeleteRegion: (id: string) => void;
}

function RegionInspector({ region, factions, alliances, canEdit, onUpdateRegion, onDeleteRegion }: InspectorProps) {
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => { setDescExpanded(false); }, [region?.id]);

  if (!region) {
    return (
        <aside className="map-inspector">
          <div className="map-inspector-empty">
            <span className="insp-empty-icon">◎</span>
            <span className="insp-empty-label">SELECT A REGION</span>
            <span className="insp-empty-sub">Click any polygon on the map to inspect</span>
          </div>
        </aside>
    );
  }

  const totalCtrl = region.factionControl.reduce((s, fc) => s + fc.percentage, 0);
  const ctrlOver = totalCtrl > 100.5;
  const ctrlUnder = totalCtrl < 99.5 && totalCtrl > 0.5;

  const allianceGroups: { alliance: Alliance | null; members: { f: Faction; pct: number }[] }[] = [];
  const usedIds = new Set<string>();

  for (const al of alliances) {
    const members: { f: Faction; pct: number }[] = [];
    for (const fid of al.factionIds) {
      const f = factions.find(f => f.id === fid);
      if (f) {
        const fc = region.factionControl.find(x => x.factionId === fid);
        members.push({ f, pct: fc?.percentage ?? 0 });
        usedIds.add(fid);
      }
    }
    if (members.length) allianceGroups.push({ alliance: al, members });
  }

  const unallied: { f: Faction; pct: number }[] = [];
  for (const f of factions) {
    if (!usedIds.has(f.id)) {
      const fc = region.factionControl.find(x => x.factionId === f.id);
      unallied.push({ f, pct: fc?.percentage ?? 0 });
    }
  }
  if (unallied.length) allianceGroups.push({ alliance: null, members: unallied });

  const setPct = (fid: string, pct: number) => {
    const fc = [...region.factionControl];
    const idx = fc.findIndex(x => x.factionId === fid);
    if (idx >= 0) fc[idx] = { ...fc[idx], percentage: pct };
    else fc.push({ factionId: fid, percentage: pct });
    onUpdateRegion({ ...region, factionControl: fc });
  };

  const factionPie: CtrlEntry[] = region.factionControl
      .filter(fc => fc.percentage > 0)
      .flatMap(fc => {
        const f = factions.find(f => f.id === fc.factionId);
        return f ? [{ id: f.id, color: f.color, label: f.name, pct: fc.percentage }] : [];
      });

  const alliancePieMap = new Map<string, CtrlEntry>();
  for (const fc of region.factionControl) {
    if (fc.percentage <= 0) continue;
    const f = factions.find(f => f.id === fc.factionId);
    if (!f) continue;
    const al = alliances.find(a => a.factionIds.includes(f.id));
    const key = al ? al.id : f.id;
    const ex = alliancePieMap.get(key);
    if (ex) ex.pct += fc.percentage;
    else alliancePieMap.set(key, { id: key, color: al ? al.color : f.color, label: al ? al.name : f.name, pct: fc.percentage });
  }
  const alliancePie = Array.from(alliancePieMap.values());
  const showAlliancePie = alliancePie.length > 1 || (alliancePie.length === 1 && alliancePie[0].id !== factionPie[0]?.id);

  const descText = region.description || '';
  const descLong = descText.length > 160;

  return (
      <aside className="map-inspector">
        <div className="insp-header">
          <div className="insp-name-block">
            {canEdit
                ? <input className="insp-name-input" value={region.name} onChange={e => onUpdateRegion({ ...region, name: e.target.value })} placeholder="Region Name" />
                : <h2 className="insp-name">{region.name || '—'}</h2>}
            {canEdit
                ? <input className="insp-name2-input" value={region.name2 ?? ''} onChange={e => onUpdateRegion({ ...region, name2: e.target.value || undefined })} placeholder="Subtitle (optional)" />
                : region.name2 && <p className="insp-name2">{region.name2}</p>}
          </div>
          {canEdit && (
              <button className="insp-delete-btn" title="Delete region" onClick={() => onDeleteRegion(region.id)}>✕</button>
          )}
        </div>

        <div className="insp-body">
          <div className="insp-section">
            <div className="insp-section-label">DESCRIPTION</div>
            {canEdit ? (
                <textarea
                    className="insp-desc-input"
                    value={descText}
                    onChange={e => onUpdateRegion({ ...region, description: e.target.value })}
                    rows={3}
                    placeholder="Region description..."
                />
            ) : (
                <>
                  <div className={`insp-desc-text ${descExpanded ? 'expanded' : ''}`}>
                    {descText || <em className="text-mute">No description.</em>}
                  </div>
                  {descLong && (
                      <button className="insp-expand-btn" onClick={() => setDescExpanded(x => !x)}>
                        {descExpanded ? '▲ Collapse' : '▼ Expand'}
                      </button>
                  )}
                </>
            )}
          </div>

          <div className="insp-section">
            <div className="insp-section-label">
              FACTION CONTROL
              {(ctrlOver || ctrlUnder) && (
                  <span className={`insp-ctrl-warn ${ctrlOver ? 'over' : 'under'}`}>
                {totalCtrl.toFixed(0)}%
              </span>
              )}
              {!ctrlOver && !ctrlUnder && totalCtrl > 0 && (
                  <span className="insp-ctrl-ok">{totalCtrl.toFixed(0)}%</span>
              )}
            </div>

            {allianceGroups.map((group, gi) => (
                <div key={gi} className="insp-ctrl-group">
                  {group.alliance ? (
                      <div className="insp-ctrl-group-hd">
                        <span className="ctrl-swatch" style={{ background: group.alliance.color }} />
                        <span className="ctrl-alliance-name">{group.alliance.name}</span>
                      </div>
                  ) : allianceGroups.some(g => g.alliance) ? (
                      <div className="insp-ctrl-group-hd">
                        <span className="ctrl-alliance-name ctrl-unaligned">Unaligned</span>
                      </div>
                  ) : null}

                  {group.members
                      .filter(({ pct }) => canEdit || pct > 0)
                      .map(({ f, pct }) => (
                          <div key={f.id} className="insp-ctrl-row">
                            <span className="ctrl-swatch" style={{ background: f.color }} />
                            <span className="ctrl-name">{f.name}</span>
                            {canEdit ? (
                                <input
                                    type="number" min="0" max="100" step="1"
                                    className="ctrl-pct-input"
                                    value={pct || ''}
                                    placeholder="0"
                                    onChange={e => setPct(f.id, Math.max(0, Math.min(100, +e.target.value || 0)))}
                                />
                            ) : (
                                <span className="ctrl-pct-val">{pct.toFixed(0)}%</span>
                            )}
                            <div className="ctrl-bar-wrap">
                              <div className="ctrl-bar-fill" style={{ width: `${pct}%`, background: f.color }} />
                            </div>
                          </div>
                      ))}
                </div>
            ))}

            {!canEdit && factionPie.length === 0 && (
                <p className="insp-no-ctrl">No faction control assigned.</p>
            )}
          </div>

          {factionPie.length > 0 && (
              <div className="insp-section">
                <div className="insp-charts">
                  <div className="insp-chart-block">
                    <div className="insp-chart-label">FACTION</div>
                    <PieChart entries={factionPie} size={108} />
                    <div className="pie-legend">
                      {factionPie.map(e => (
                          <div key={e.id} className="pie-legend-row">
                            <span className="pie-legend-dot" style={{ background: e.color }} />
                            <span className="pie-legend-name">{e.label}</span>
                            <span className="pie-legend-pct">{e.pct.toFixed(0)}%</span>
                          </div>
                      ))}
                    </div>
                  </div>

                  {showAlliancePie && (
                      <div className="insp-chart-block">
                        <div className="insp-chart-label">ALLIANCE</div>
                        <PieChart entries={alliancePie} size={108} />
                        <div className="pie-legend">
                          {alliancePie.map(e => (
                              <div key={e.id} className="pie-legend-row">
                                <span className="pie-legend-dot" style={{ background: e.color }} />
                                <span className="pie-legend-name">{e.label}</span>
                                <span className="pie-legend-pct">{e.pct.toFixed(0)}%</span>
                              </div>
                          ))}
                        </div>
                      </div>
                  )}
                </div>
              </div>
          )}
        </div>
      </aside>
  );
}

// ── MapCanvas ─────────────────────────────────────────────────────────────────
interface CanvasProps {
  regions: MapRegion[];
  factions: Faction[];
  alliances: Alliance[];
  viewMode: ViewMode;
  editorMode: boolean;
  tool: EditorTool;
  selectedId: string | null;
  drawVerts: MapVertex[];
  dragging: DragState | null;
  dragPos: MapVertex | null;
  dragRegion: { id: string, startX: number, startY: number, verts: MapVertex[] } | null;
  hoverEdge: HoverEdge | null;
  snapPos: MapVertex | null;
  cursor: MapVertex;
  zoom: number;
  panX: number;
  panY: number;
  svgRef: React.RefObject<SVGSVGElement>;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onSvgPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
  onSelectRegion: (id: string, e: React.PointerEvent) => void;
  onVertexPointerDown: (e: React.PointerEvent, regionId: string, vIdx: number) => void;
  onEdgePointerDown: (e: React.PointerEvent, regionId: string, eIdx: number, pos: MapVertex) => void;
  onContextMenuVertex: (e: React.MouseEvent, regionId: string, vIdx: number) => void;
  onContextMenuSvg: (e: React.MouseEvent) => void;
  onWheel: (e: React.WheelEvent<SVGSVGElement>) => void;
}

function MapCanvas(props: CanvasProps) {
  const { regions, factions, alliances, viewMode, editorMode, tool, selectedId, drawVerts, dragging, dragPos, dragRegion, hoverEdge, snapPos, cursor, zoom, panX, panY, svgRef, onPointerMove, onSvgPointerDown, onPointerUp, onSelectRegion, onVertexPointerDown, onEdgePointerDown, onContextMenuVertex, onContextMenuSvg, onWheel } = props;

  const displayRegions = useMemo(() => {
    return regions.map(r => {
      if (dragging && dragging.regionId === r.id) {
        const verts = [...r.vertices];
        verts[dragging.vIdx] = dragPos || verts[dragging.vIdx];
        return { ...r, vertices: verts };
      }
      if (dragRegion && dragRegion.id === r.id) {
        const dx = cursor.x - dragRegion.startX;
        const dy = cursor.y - dragRegion.startY;
        const verts = dragRegion.verts.map(v => ({ x: v.x + dx, y: v.y + dy }));
        return { ...r, vertices: verts };
      }
      return r;
    });
  }, [regions, dragging, dragPos, dragRegion, cursor]);

  const closingSnap = drawVerts.length >= 3 && snapPos && d2(snapPos, drawVerts[0]) < 1;

  return (
      <svg
          ref={svgRef}
          className="map-canvas"
          viewBox={`${panX} ${panY} ${VBW / zoom} ${VBH / zoom}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ cursor: tool === 'add' ? 'crosshair' : 'default' }}
          onPointerMove={onPointerMove}
          onPointerDown={onSvgPointerDown}
          onPointerUp={onPointerUp}
          onContextMenu={onContextMenuSvg}
          onWheel={onWheel}
      >
        <defs>
          <filter id="map-glow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="map-sel-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {viewMode !== 'plain' && displayRegions.map(region => {
            const entries = getCtrlEntries(region, factions, alliances, viewMode);
            if (entries.length < 2) return null;
            const id = getPatId(region.id, viewMode);
            const total = entries.reduce((s, e) => s + e.pct, 0) || 1;
            let cumY = 0;
            return (
                <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={PAT_SZ} height={PAT_SZ} patternTransform="rotate(45 0 0)">
                  {entries.map((e, i) => {
                    const h = (e.pct / total) * PAT_SZ;
                    const el = <rect key={i} x="0" y={cumY.toFixed(2)} width={PAT_SZ} height={h.toFixed(2)} fill={e.color} />;
                    cumY += h;
                    return el;
                  })}
                </pattern>
            );
          })}
        </defs>

        {[0, 200, 400, 600, 800, 1000].map(x => (
            <line key={`vg${x}`} x1={x} y1={-1000} x2={x} y2={2000} stroke="var(--line-soft)" strokeWidth="0.5" opacity="0.35" />
        ))}
        {[0, 150, 300, 450, 600, 750].map(y => (
            <line key={`hg${y}`} x1={-1000} y1={y} x2={2000} y2={y} stroke="var(--line-soft)" strokeWidth="0.5" opacity="0.35" />
        ))}

        {displayRegions.map(region => {
          const v = region.vertices;
          if (v.length < 3) return null;
          const isSelected = region.id === selectedId;
          const fill_1 = getFill(region, factions, alliances, viewMode);
          const fill = fill_1 === 'none' ? 'transparent' : fill_1;
          const fillOpacity = viewMode === 'plain' ? 0 : 0.9;

          return (
              <g key={region.id}>
                <polygon
                    points={pts(v)}
                    fill={fill}
                    fillOpacity={fillOpacity}
                    stroke="var(--bg-deeper)"
                    strokeWidth={isSelected ? 10 : 7}
                    pointerEvents="all"
                    style={{ cursor: tool === 'add' ? 'crosshair' : (isSelected && editorMode ? 'move' : 'pointer') }}
                    onPointerDown={e => { if (tool === 'select') { e.stopPropagation(); onSelectRegion(region.id, e); } }}
                />
                <polygon
                    points={pts(v)}
                    fill="none"
                    stroke={isSelected ? 'var(--accent-hot)' : 'var(--accent)'}
                    strokeWidth={isSelected ? 1.8 : 1.1}
                    strokeOpacity={isSelected ? 1 : 0.7}
                    filter={isSelected ? 'url(#map-sel-glow)' : 'url(#map-glow)'}
                    pointerEvents="none"
                />
                {(() => {
                  const c = ctr(v);
                  return (
                      <text
                          x={c.x} y={c.y}
                          textAnchor="middle"
                          fontSize="14" fontFamily="'JetBrains Mono', monospace"
                          fill={isSelected ? 'var(--accent-hot)' : 'var(--text)'}
                          pointerEvents="none"
                          style={{ userSelect: 'none' }}
                      >
                        <tspan x={c.x} dy={region.name2 ? "-0.4em" : "0.3em"}>{region.name || '?'}</tspan>
                        {region.name2 && (
                            <tspan x={c.x} dy="1.2em" fontSize="8" opacity="0.6" fontStyle="italic">
                              {region.name2}
                            </tspan>
                        )}
                      </text>
                  );
                })()}
              </g>
          );
        })}

        {tool === 'add' && drawVerts.length > 0 && (() => {
          const previewPos = snapPos ?? cursor;
          const allPts = [...drawVerts, previewPos];
          return (
              <g pointerEvents="none">
                {drawVerts.length >= 2 && (
                    <polygon
                        points={pts(allPts)}
                        fill="var(--accent)"
                        fillOpacity={0.07}
                        stroke="var(--accent)"
                        strokeWidth={1}
                        strokeDasharray="6 4"
                        strokeOpacity={0.65}
                    />
                )}
                <line
                    x1={drawVerts[drawVerts.length - 1].x} y1={drawVerts[drawVerts.length - 1].y}
                    x2={previewPos.x} y2={previewPos.y}
                    stroke="var(--accent)" strokeWidth={1.5}
                    strokeDasharray="5 4" strokeOpacity={0.85}
                />
                {drawVerts.map((v, i) => (
                    <circle
                        key={i} cx={v.x} cy={v.y}
                        r={i === 0 ? 7 : 5}
                        fill={closingSnap && i === 0 ? 'var(--good)' : 'var(--bg-panel)'}
                        stroke={i === 0 ? (closingSnap ? 'var(--good)' : 'var(--accent-hot)') : 'var(--accent)'}
                        strokeWidth={i === 0 ? 2.5 : 1.5}
                    />
                ))}
                {snapPos && (
                    <circle
                        cx={snapPos.x} cy={snapPos.y} r={13}
                        fill="none"
                        stroke={closingSnap ? 'var(--good)' : 'var(--cyan)'}
                        strokeWidth={1.5} strokeDasharray="3 3" opacity={0.85}
                    />
                )}
              </g>
          );
        })()}

        {dragging && snapPos && (
            <circle cx={snapPos.x} cy={snapPos.y} r={13}
                    fill="none" stroke="var(--cyan)" strokeWidth={1.5}
                    strokeDasharray="3 3" opacity={0.8} pointerEvents="none"
            />
        )}

        {tool === 'add' && drawVerts.length === 0 && (
            <g pointerEvents="none" opacity={0.45}>
              <line x1={cursor.x - 12} y1={cursor.y} x2={cursor.x + 12} y2={cursor.y} stroke="var(--accent)" strokeWidth={1} />
              <line x1={cursor.x} y1={cursor.y - 12} x2={cursor.x} y2={cursor.y + 12} stroke="var(--accent)" strokeWidth={1} />
              <circle cx={cursor.x} cy={cursor.y} r={4} fill="none" stroke="var(--accent)" strokeWidth={1} />
            </g>
        )}

        {editorMode && tool === 'select' && selectedId && !dragging && !dragRegion && (() => {
          const region = displayRegions.find(r => r.id === selectedId);
          if (!region) return null;
          return (
              <g>
                {hoverEdge && hoverEdge.regionId === selectedId && (
                    <circle
                        cx={hoverEdge.pos.x} cy={hoverEdge.pos.y}
                        r={6}
                        fill="var(--cyan)"
                        stroke="var(--bg-panel)"
                        strokeWidth={1.5}
                        style={{ cursor: 'copy' }}
                        onPointerDown={e => onEdgePointerDown(e, selectedId, hoverEdge.eIdx, hoverEdge.pos)}
                    />
                )}
                {region.vertices.map((v, i) => {
                  const isDrag = dragging?.regionId === selectedId && dragging.vIdx === i;
                  return (
                      <circle
                          key={`vtx${i}`}
                          cx={v.x} cy={v.y}
                          r={isDrag ? 9 : 6}
                          fill={isDrag ? 'var(--accent-hot)' : 'var(--bg-panel)'}
                          stroke={isDrag ? 'var(--accent-hot)' : 'var(--cyan)'}
                          strokeWidth={2}
                          style={{ cursor: isDrag ? 'grabbing' : 'grab' }}
                          onPointerDown={e => { e.stopPropagation(); onVertexPointerDown(e, selectedId, i); }}
                          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenuVertex(e, selectedId, i); }}
                      />
                  );
                })}
              </g>
          );
        })()}
      </svg>
  );
}

// ── MapToolbar ────────────────────────────────────────────────────────────────
interface ToolbarProps {
  viewMode: ViewMode;
  editorMode: boolean;
  tool: EditorTool;
  canEdit: boolean;
  drawVerts: MapVertex[];
  snapToGrid: boolean;
  onViewMode: (m: ViewMode) => void;
  onEditorMode: (on: boolean) => void;
  onTool: (t: EditorTool) => void;
  onToggleSnap: () => void;
  onCenterMap: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCompleteRegion: () => void;
  onCancelDraw: () => void;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function MapToolbar({ viewMode, editorMode, tool, canEdit, drawVerts, snapToGrid, onViewMode, onEditorMode, onTool, onToggleSnap, onCenterMap, onZoomIn, onZoomOut, onCompleteRegion, onCancelDraw, onExport, onImport }: ToolbarProps) {
  const importRef = useRef<HTMLInputElement>(null);
  const isDrawing = tool === 'add' && drawVerts.length > 0;

  return (
      <div className="map-toolbar">
        <div className="map-tb-left">
          <span className="map-title-icon">◎</span>
          <h1 className="map-title">MAP</h1>
          <span className="map-title-sub">// TERRITORIAL OVERVIEW //</span>
        </div>

        <div className="map-tb-center">
          <div className="map-mode-group">
            {(['plain', 'faction', 'alliance'] as ViewMode[]).map(m => (
                <button
                    key={m}
                    data-ro-allow
                    className={`map-mode-btn ${viewMode === m ? 'active' : ''}`}
                    onClick={() => onViewMode(m)}
                >
                  {m === 'plain' ? '◌ PLAIN' : m === 'faction' ? '◈ FACTION' : '◆ ALLIANCE'}
                </button>
            ))}
          </div>
          <div className="map-tool-group" style={{ marginLeft: '12px' }}>
            <button className="map-tool-btn" onClick={onZoomOut} title="Zoom Out">−</button>
            <button className="map-tool-btn" onClick={onCenterMap} title="Center Map">⌖</button>
            <button className="map-tool-btn" onClick={onZoomIn} title="Zoom In">+</button>
          </div>
        </div>

        <div className="map-tb-right">
          {canEdit && !isDrawing && (
              <button
                  className={`map-edit-btn ${editorMode ? 'active' : ''}`}
                  onClick={() => onEditorMode(!editorMode)}
              >
                {editorMode ? '⊠ EXIT EDIT' : '⊡ EDIT MAP'}
              </button>
          )}

          {editorMode && !isDrawing && (
              <div className="map-tool-group">
                <button
                    className={`map-tool-btn ${snapToGrid ? 'active' : ''}`}
                    title="Snap to Grid"
                    onClick={onToggleSnap}
                ># SNAP</button>
                <button
                    className={`map-tool-btn ${tool === 'select' ? 'active' : ''}`}
                    title="Select & edit vertices [S]"
                    onClick={() => onTool('select')}
                >↖ SELECT</button>
                <button
                    className={`map-tool-btn ${tool === 'add' ? 'active' : ''}`}
                    title="Draw new region [A]"
                    onClick={() => onTool('add')}
                >⬡ ADD REGION</button>
              </div>
          )}

          {isDrawing && (
              <div className="map-tool-group">
                <span className="map-draw-hint">{drawVerts.length} pts</span>
                <button
                    className="map-tool-btn map-tool-btn--complete"
                    onClick={onCompleteRegion}
                    disabled={drawVerts.length < 3}
                    title="Complete polygon [Enter] or [Right Click]"
                >✓ COMPLETE</button>
                <button
                    className="map-tool-btn"
                    onClick={onCancelDraw}
                    title="Cancel [Escape]"
                >✕ CANCEL</button>
              </div>
          )}

          <div className="map-io-group">
            <button data-ro-allow className="map-io-btn" onClick={onExport} title="Export map as JSON">↑ EXPORT</button>
            {canEdit && (
                <>
                  <button className="map-io-btn" onClick={() => importRef.current?.click()} title="Import map from JSON">↓ IMPORT</button>
                  <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={onImport} />
                </>
            )}
          </div>
        </div>
      </div>
  );
}

// ── MapPage ───────────────────────────────────────────────────────────────────
export function MapPage() {
  const { state, updateState } = useAppContext();
  const { canEdit } = useAuth();

  const [viewMode, setViewMode] = useState<ViewMode>('faction');
  const [editorMode, setEditorMode] = useState(false);
  const [tool, setTool] = useState<EditorTool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawVerts, setDrawVerts] = useState<MapVertex[]>([]);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [dragPos, setDragPos] = useState<MapVertex | null>(null);
  const [dragRegion, setDragRegion] = useState<{ id: string, startX: number, startY: number, verts: MapVertex[] } | null>(null);
  const [hoverEdge, setHoverEdge] = useState<HoverEdge | null>(null);
  const [snapPos, setSnapPos] = useState<MapVertex | null>(null);
  const [cursor, setCursor] = useState<MapVertex>({ x: 500, y: 375 });
  const [snapToGrid, setSnapToGrid] = useState(false);

  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [middlePanStart, setMiddlePanStart] = useState<{ x: number, y: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const regions = useMemo(() => state.map?.regions ?? [], [state.map]);

  const updateRegions = useCallback(
      (updater: (prev: MapRegion[]) => MapRegion[]) => {
        updateState(s => {
          if (!s.map) s.map = { regions: [] };
          s.map.regions = updater(s.map.regions);
          return s;
        });
      },
      [updateState]
  );

  const completeRegion = useCallback(() => {
    if (drawVerts.length < 3) return;
    const newRegion: MapRegion = {
      id: uid('r'), name: 'New Region', description: '',
      vertices: [...drawVerts], factionControl: [],
    };
    updateRegions(prev => [...prev, newRegion]);
    setSelectedId(newRegion.id);
    setDrawVerts([]);
    setTool('select');
  }, [drawVerts, updateRegions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        if (tool === 'add' && drawVerts.length > 0) { setDrawVerts([]); return; }
        if (tool === 'add') { setTool('select'); return; }
        setSelectedId(null);
      }

      if (e.key === 'Enter' && tool === 'add' && drawVerts.length >= 3) {
        completeRegion();
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && editorMode && selectedId && tool === 'select') {
        const id = selectedId;
        updateRegions(prev => prev.filter(r => r.id !== id));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, drawVerts, selectedId, editorMode, updateRegions, completeRegion]);

  const handleCenterMap = useCallback(() => {
    if (!regions || regions.length === 0) {
      setZoom(1);
      setPanX(0);
      setPanY(0);
      return;
    }

    // 1. Find the bounding box of all vertices
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    regions.forEach(r => {
      r.vertices.forEach(v => {
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
      });
    });

    // Handle edge case if there's only a single point or flat line somehow
    let bw = maxX - minX;
    let bh = maxY - minY;
    if (bw === 0) bw = 100;
    if (bh === 0) bh = 100;

    // 2. Calculate the center point
    const cx = minX + bw / 2;
    const cy = minY + bh / 2;

    // 3. Calculate zoom to fit with a 15% padding margin
    const padding = 1.15;
    const zoomX = VBW / (bw * padding);
    const zoomY = VBH / (bh * padding);

    // Clamp zoom between our existing bounds (0.2x to 10x)
    const newZoom = Math.max(0.2, Math.min(10, Math.min(zoomX, zoomY)));

    // 4. Apply new view
    setZoom(newZoom);
    setPanX(cx - (VBW / newZoom) / 2);
    setPanY(cy - (VBH / newZoom) / 2);
  }, [regions]);

  // 1. Unified zoom math handler
  const performZoom = useCallback((zoomMultiplier: number, pointerSvg?: MapVertex) => {
    // Calculate the new zoom bounded between 0.2 and 10
    const newZoom = Math.max(0.2, Math.min(10, zoom * zoomMultiplier));
    if (newZoom === zoom) return; // Do nothing if we hit the limit

    const ratio = zoom / newZoom;

    // Use the pointer location if provided, otherwise default to screen center
    const focusX = pointerSvg ? pointerSvg.x : panX + (VBW / zoom) / 2;
    const focusY = pointerSvg ? pointerSvg.y : panY + (VBH / zoom) / 2;

    // Apply the exact offset math atomically
    setPanX(focusX - (focusX - panX) * ratio);
    setPanY(focusY - (focusY - panY) * ratio);
    setZoom(newZoom);
  }, [zoom, panX, panY]); // <-- We rely explicitly on the current frame's state

  // 2. Mouse wheel handler
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const pt = svgPt(svgRef.current, e.clientX, e.clientY);
    performZoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, pt);
  }, [performZoom]);

  // 3. Toolbar button handlers
  const handleZoomIn = useCallback(() => performZoom(1.2), [performZoom]);
  const handleZoomOut = useCallback(() => performZoom(1 / 1.2), [performZoom]);

  const hasCenteredOnce = useRef(false);
  useEffect(() => {
    // Wait until there are actually regions to center on, then do it once and lock it
    if (!hasCenteredOnce.current && regions.length > 0) {
      handleCenterMap();
      hasCenteredOnce.current = true;
    }
  }, [handleCenterMap, regions.length]);


  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    if (middlePanStart) {
      const dx = e.clientX - middlePanStart.x;
      const dy = e.clientY - middlePanStart.y;
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = (VBW / zoom) / rect.width;
      const scaleY = (VBH / zoom) / rect.height;
      setPanX(px => px - dx * scaleX);
      setPanY(py => py - dy * scaleY);
      setMiddlePanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    let raw = svgPt(svgRef.current, e.clientX, e.clientY);
    if (snapToGrid) raw = snapGrid(raw);
    setCursor(raw);

    if (dragging) {
      const snapped = snapTo(raw, regions, [], dragging.regionId, dragging.vIdx);
      setDragPos(snapped ?? raw);
      setSnapPos(snapped);
      return;
    }

    if (dragRegion) {
      return;
    }

    if (tool === 'add') {
      const extras = drawVerts.length > 0 ? [drawVerts[0]] : [];
      setSnapPos(snapTo(raw, regions, extras));
      return;
    }

    if (editorMode && tool === 'select' && selectedId) {
      const region = regions.find(r => r.id === selectedId);
      if (region) {
        let found: HoverEdge | null = null;
        let minDist = 15;
        for (let i = 0; i < region.vertices.length; i++) {
          const a = region.vertices[i];
          const b = region.vertices[(i + 1) % region.vertices.length];
          const { dist, pt } = getClosestPointOnSegment(raw, a, b);
          if (dist < minDist) {
            minDist = dist;
            found = { regionId: selectedId, eIdx: i, pos: pt };
          }
        }
        setHoverEdge(found);
      }
    }
  }, [dragging, dragRegion, tool, drawVerts, editorMode, selectedId, regions, middlePanStart, zoom, snapToGrid]);

  const handleSvgPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 1) {
      e.preventDefault();
      setMiddlePanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (e.button === 2) return;

    let raw = svgPt(svgRef.current!, e.clientX, e.clientY);
    if (snapToGrid) raw = snapGrid(raw);

    if (tool === 'select') {
      setSelectedId(null);
    }

    if (tool === 'add') {
      if (!svgRef.current) return;
      const extras = drawVerts.length > 0 ? [drawVerts[0]] : [];
      const snapped = snapTo(raw, regions, extras);
      const pos = snapped ?? raw;

      if (drawVerts.length >= 3 && snapped && d2(snapped, drawVerts[0]) < 1) {
        completeRegion();
        return;
      }

      setDrawVerts(prev => [...prev, pos]);
    }
  }, [tool, drawVerts, regions, completeRegion, snapToGrid]);

  const handleSelectRegion = useCallback((id: string, e: React.PointerEvent) => {
    if (tool !== 'select') return;
    setSelectedId(id);

    if (editorMode && svgRef.current && e.button === 0) {
      try { (e.target as Element).setPointerCapture(e.pointerId); } catch {}
      const hit = regions.find(r => r.id === id);
      if (hit) {
        let raw = svgPt(svgRef.current, e.clientX, e.clientY);
        if (snapToGrid) raw = snapGrid(raw);
        setDragRegion({ id: hit.id, startX: raw.x, startY: raw.y, verts: [...hit.vertices] });
      }
    }
  }, [tool, editorMode, regions, snapToGrid]);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging) {
      if (dragPos) {
        updateRegions(prev => prev.map(r => {
          if (r.id !== dragging.regionId) return r;
          const verts = [...r.vertices];
          verts[dragging.vIdx] = dragPos;
          return { ...r, vertices: verts };
        }));
      }
      setDragging(null);
      setDragPos(null);
    }

    if (dragRegion) {
      const dx = cursor.x - dragRegion.startX;
      const dy = cursor.y - dragRegion.startY;
      updateRegions(prev => prev.map(r => {
        if (r.id !== dragRegion.id) return r;
        return { ...r, vertices: dragRegion.verts.map(v => ({ x: v.x + dx, y: v.y + dy })) };
      }));
      setDragRegion(null);
      try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
    }

    setMiddlePanStart(null);
    setSnapPos(null);
  }, [dragging, dragPos, dragRegion, cursor, updateRegions]);

  const handleVertexPointerDown = useCallback((e: React.PointerEvent, regionId: string, vIdx: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch {}
    setDragging({ regionId, vIdx });
    const region = regions.find(r => r.id === regionId);
    if (region) setDragPos({ ...region.vertices[vIdx] });
  }, [regions]);

  const handleEdgePointerDown = useCallback((e: React.PointerEvent, regionId: string, eIdx: number, pos: MapVertex) => {
    e.stopPropagation();
    updateRegions(prev => prev.map(r => {
      if (r.id !== regionId) return r;
      const verts = [...r.vertices];
      verts.splice(eIdx + 1, 0, { ...pos });
      return { ...r, vertices: verts };
    }));
    setHoverEdge(null);
  }, [updateRegions]);

  const handleContextMenuVertex = useCallback((_e: React.MouseEvent, regionId: string, vIdx: number) => {
    updateRegions(prev => prev.map(r => {
      if (r.id !== regionId) return r;
      if (r.vertices.length <= 3) return r;
      const verts = [...r.vertices];
      verts.splice(vIdx, 1);
      return { ...r, vertices: verts };
    }));
  }, [updateRegions]);

  const handleContextMenuSvg = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (tool === 'add' && drawVerts.length >= 3) {
      completeRegion();
    }
  }, [tool, drawVerts, completeRegion]);

  const handleUpdateRegion = useCallback((updated: MapRegion) => {
    updateRegions(prev => prev.map(r => r.id === updated.id ? updated : r));
  }, [updateRegions]);

  const handleDeleteRegion = useCallback((id: string) => {
    updateRegions(prev => prev.filter(r => r.id !== id));
    setSelectedId(null);
  }, [updateRegions]);

  const handleExport = () => {
    const data = JSON.stringify({ regions }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `map_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (Array.isArray(parsed.regions)) {
          const imported: MapRegion[] = parsed.regions.map((r: any) => ({
            id: r.id || uid('r'),
            name: String(r.name || 'Region'),
            name2: r.name2 || undefined,
            description: String(r.description || ''),
            vertices: Array.isArray(r.vertices) ? r.vertices : [],
            factionControl: Array.isArray(r.factionControl) ? r.factionControl : [],
          }));
          updateRegions(() => imported);
        }
      } catch {  }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const selectedRegion = useMemo(
      () => regions.find(r => r.id === selectedId) ?? null,
      [regions, selectedId]
  );

  return (
      <div className="map-page">
        <MapToolbar
            viewMode={viewMode}
            editorMode={editorMode}
            tool={tool}
            canEdit={canEdit}
            drawVerts={drawVerts}
            snapToGrid={snapToGrid}
            onToggleSnap={() => setSnapToGrid(!snapToGrid)}
            onCenterMap={handleCenterMap}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onViewMode={setViewMode}
            onEditorMode={on => {
              setEditorMode(on);
              if (!on) { setTool('select'); setDrawVerts([]); }
            }}
            onTool={t => { setTool(t); setDrawVerts([]); if (t === 'add') setSelectedId(null); }}
            onCompleteRegion={completeRegion}
            onCancelDraw={() => setDrawVerts([])}
            onExport={handleExport}
            onImport={handleImport}
        />

        <div className="map-workspace">
          <div className="map-canvas-wrap">
            <MapCanvas
                regions={regions}
                factions={state.factions}
                alliances={state.alliances}
                viewMode={viewMode}
                editorMode={editorMode}
                tool={tool}
                selectedId={selectedId}
                drawVerts={drawVerts}
                dragging={dragging}
                dragPos={dragPos}
                dragRegion={dragRegion}
                hoverEdge={hoverEdge}
                snapPos={snapPos}
                cursor={cursor}
                zoom={zoom}
                panX={panX}
                panY={panY}
                svgRef={svgRef}
                onPointerMove={handlePointerMove}
                onSvgPointerDown={handleSvgPointerDown}
                onPointerUp={handlePointerUp}
                onSelectRegion={handleSelectRegion}
                onVertexPointerDown={handleVertexPointerDown}
                onEdgePointerDown={handleEdgePointerDown}
                onContextMenuVertex={handleContextMenuVertex}
                onContextMenuSvg={handleContextMenuSvg}
                onWheel={handleWheel}
            />
            <MapLegend
                regions={regions}
                factions={state.factions}
                alliances={state.alliances}
                viewMode={viewMode}
            />
            {regions.length === 0 && (
                <div className="map-empty-hint">
                  {canEdit
                      ? <>Enable <strong>EDIT MAP</strong> and use <strong>ADD REGION</strong> to draw polygons</>
                      : 'No regions defined yet.'}
                </div>
            )}
          </div>

          <RegionInspector
              region={selectedRegion}
              factions={state.factions}
              alliances={state.alliances}
              canEdit={canEdit && editorMode}
              onUpdateRegion={handleUpdateRegion}
              onDeleteRegion={handleDeleteRegion}
          />
        </div>
      </div>
  );
}