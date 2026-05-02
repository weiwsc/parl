import type { PointerEvent as ReactPointerEvent } from 'react';
import type { NodeGraphPortRef } from '../../game/nodes/types';
import type { PortDirection, RegisterPortAnchor } from './nodeCanvasTypes';
import { portKey } from './nodeCanvasUtils';

interface PortHandleProps {
  direction: PortDirection;
  port: NodeGraphPortRef;
  canEdit: boolean;
  registerPortAnchor: RegisterPortAnchor;
  onStartWire: (event: ReactPointerEvent<HTMLElement>, from: NodeGraphPortRef) => void;
  onCompleteWire: (event: ReactPointerEvent<HTMLElement>, to: NodeGraphPortRef) => void;
}

export function PortHandle({
  direction,
  port,
  canEdit,
  registerPortAnchor,
  onStartWire,
  onCompleteWire,
}: PortHandleProps) {
  const key = portKey(direction, port);
  return (
    <span
      ref={element => registerPortAnchor(key, element)}
      className={`ne-port-handle ne-port-handle-${direction}${canEdit ? '' : ' disabled'}`}
      data-ne-port-direction={direction}
      data-ne-port-node-id={port.nodeId}
      data-ne-port-path={port.path}
      data-ne-port-label={port.label}
      title={direction === 'output' ? 'Drag to an input port' : 'Release an output wire here'}
      onPointerDown={event => { if (direction === 'output') onStartWire(event, port); }}
      onPointerUp={event => { if (direction === 'input') onCompleteWire(event, port); }}
    />
  );
}
