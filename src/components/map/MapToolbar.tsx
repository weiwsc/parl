import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import type { MapVertex } from '../../models/types';
import type { EditorTool, ViewMode } from '../../game/map/types';

interface MapToolbarProps {
  viewMode: ViewMode;
  editorMode: boolean;
  tool: EditorTool;
  canEdit: boolean;
  drawVerts: MapVertex[];
  snapToGrid: boolean;
  onViewMode: (mode: ViewMode) => void;
  onEditorMode: (on: boolean) => void;
  onTool: (tool: EditorTool) => void;
  onToggleSnap: () => void;
  onCenterMap: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCompleteRegion: () => void;
  onCancelDraw: () => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function MapToolbar({
  viewMode,
  editorMode,
  tool,
  canEdit,
  drawVerts,
  snapToGrid,
  onViewMode,
  onEditorMode,
  onTool,
  onToggleSnap,
  onCenterMap,
  onZoomIn,
  onZoomOut,
  onCompleteRegion,
  onCancelDraw,
  onExport,
  onImport,
}: MapToolbarProps) {
  const importRef = useRef<HTMLInputElement>(null);
  const isDrawing = tool === 'add' && drawVerts.length > 0;
  const isRegionList = viewMode === 'regions';

  return (
    <div className="map-toolbar">
      <div className="map-tb-left">
        <span className="map-title-icon">◎</span>
        <h1 className="map-title">MAP</h1>
        <span className="map-title-sub">// TERRITORIAL OVERVIEW //</span>
      </div>

      <div className="map-tb-center">
        <div className="map-mode-group">
          {(['plain', 'faction', 'alliance', 'regions'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              data-ro-allow
              className={`map-mode-btn ${viewMode === mode ? 'active' : ''}`}
              onClick={() => onViewMode(mode)}
            >
              {mode === 'plain'
                ? '◌ PLAIN'
                : mode === 'faction'
                  ? '◈ FACTION'
                  : mode === 'alliance'
                    ? '◆ ALLIANCE'
                    : '▤ REGIONS'}
            </button>
          ))}
        </div>
        {!isRegionList && (
          <div className="map-tool-group" style={{ marginLeft: '12px' }}>
            <button className="map-tool-btn" onClick={onZoomOut} title="Zoom Out">−</button>
            <button className="map-tool-btn" onClick={onCenterMap} title="Center Map">⌖</button>
            <button className="map-tool-btn" onClick={onZoomIn} title="Zoom In">+</button>
          </div>
        )}
      </div>

      <div className="map-tb-right">
        {canEdit && !isDrawing && !isRegionList && (
          <button
            className={`map-edit-btn ${editorMode ? 'active' : ''}`}
            onClick={() => onEditorMode(!editorMode)}
          >
            {editorMode ? '⊠ EXIT EDIT' : '⊡ EDIT MAP'}
          </button>
        )}

        {editorMode && !isDrawing && !isRegionList && (
          <div className="map-tool-group">
            <button
              className={`map-tool-btn ${snapToGrid ? 'active' : ''}`}
              title="Snap to Grid"
              onClick={onToggleSnap}
            >
              # SNAP
            </button>
            <button
              className={`map-tool-btn ${tool === 'select' ? 'active' : ''}`}
              title="Select & edit vertices [S]"
              onClick={() => onTool('select')}
            >
              ↖ SELECT
            </button>
            <button
              className={`map-tool-btn ${tool === 'add' ? 'active' : ''}`}
              title="Draw new region [A]"
              onClick={() => onTool('add')}
            >
              ⬡ ADD REGION
            </button>
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
            >
              ✓ COMPLETE
            </button>
            <button
              className="map-tool-btn"
              onClick={onCancelDraw}
              title="Cancel [Escape]"
            >
              ✕ CANCEL
            </button>
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
