import type { NodeConnectionMode } from '../../game/nodes/types';

interface CanvasToolbarProps {
  mode: NodeConnectionMode;
  amount: number;
  zoom: number;
  canEdit: boolean;
  onModeChange: (mode: NodeConnectionMode) => void;
  onAmountChange: (amount: number) => void;
  onAddLocalTransform: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitToView: () => void;
  connectionMessage?: string | null;
}

export function CanvasToolbar({
  mode,
  amount,
  zoom,
  canEdit,
  onModeChange,
  onAmountChange,
  onAddLocalTransform,
  onZoomOut,
  onZoomIn,
  onFitToView,
  connectionMessage,
}: CanvasToolbarProps) {
  return (
    <div className="ne-canvas-overlay-toolbar">
      <label className="ne-conn-mini-field">
        MODE
        <select value={mode} onChange={event => onModeChange(event.target.value as NodeConnectionMode)}>
          <option value="read">read</option>
          <option value="take">take</option>
        </select>
      </label>
      {mode === 'take' && (
        <label className="ne-conn-mini-field">
          AMT
          <input type="number" min="0" value={amount} onChange={event => onAmountChange(Number(event.target.value) || 0)} />
        </label>
      )}
      {canEdit && (
        <button className="small ghost ne-local-transform-btn" onClick={onAddLocalTransform}>+ local transform</button>
      )}
      <div className="ne-zoom-controls">
        <button className="ne-zoom-btn" onClick={onZoomOut}>−</button>
        <span className="ne-zoom-level">{Math.round(zoom * 100)}%</span>
        <button className="ne-zoom-btn" onClick={onZoomIn}>+</button>
        <button className="ne-zoom-btn" title="Fit to view" onClick={onFitToView}>⊡</button>
      </div>
      {connectionMessage && <span className="ne-connection-warning">{connectionMessage}</span>}
    </div>
  );
}
