import type { EntityType, TransformDefinition } from '../../game/nodes/types';
import { countSchemaFields } from './nodeEditorUtils';

interface CanvasPaletteProps {
  types: EntityType[];
  transforms: TransformDefinition[];
  canEdit: boolean;
}

export function CanvasPalette({ types, transforms, canEdit }: CanvasPaletteProps) {
  return (
    <div className="ne-canvas-palette">
      <div className="ne-canvas-sidebar-section">
        <div className="ne-canvas-sidebar-head">
          TYPES <span className="ne-sidebar-drag-item-meta">{types.length}</span>
        </div>
        {types.map(type => (
          <div
            key={type.id}
            className="ne-sidebar-drag-item"
            draggable={canEdit}
            onDragStart={event => {
              event.dataTransfer.setData('application/x-node-type', type.id);
              event.dataTransfer.setData('text/plain', `node-type:${type.id}`);
              event.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className="ne-kind-tag ne-kind-ref">T</span>
            <span className="ne-sidebar-drag-item-name">{type.name}</span>
            <span className="ne-sidebar-drag-item-meta">{countSchemaFields(type.children)}</span>
          </div>
        ))}
        {types.length === 0 && (
          <div className="ne-sidebar-empty">No types defined.</div>
        )}
      </div>

      <div className="ne-canvas-sidebar-section">
        <div className="ne-canvas-sidebar-head">
          TRANSFORMS <span className="ne-sidebar-drag-item-meta">{transforms.length}</span>
        </div>
        {transforms.map(transform => (
          <div
            key={transform.id}
            className="ne-sidebar-drag-item"
            draggable={canEdit}
            onDragStart={event => {
              event.dataTransfer.setData('application/x-transform-def', transform.id);
              event.dataTransfer.setData('text/plain', `transform-def:${transform.id}`);
              event.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className="ne-kind-tag ne-kind-arr">JS</span>
            <span className="ne-sidebar-drag-item-name">{transform.name}</span>
            <span className="ne-sidebar-drag-item-meta">
              {transform.inputs.length}↓{transform.outputs.length}↑
            </span>
          </div>
        ))}
        {transforms.length === 0 && (
          <div className="ne-sidebar-empty">No transforms.</div>
        )}
      </div>
    </div>
  );
}
