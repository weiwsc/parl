import type { NodeEditorState, SchemaChild } from '../../game/nodes/types';

export function ensureNodeState(nodes: Partial<NodeEditorState> | undefined): NodeEditorState {
  return {
    types: Array.isArray(nodes?.types) ? nodes.types : [],
    graph: {
      nodes: Array.isArray(nodes?.graph?.nodes) ? nodes.graph.nodes : [],
      connections: Array.isArray(nodes?.graph?.connections) ? nodes.graph.connections : [],
    },
    transforms: Array.isArray(nodes?.transforms) ? nodes.transforms : [],
  };
}

export function removeTypeFromNodeState(nodes: NodeEditorState, id: string): NodeEditorState {
  const removedNodeIds = new Set(
    nodes.graph.nodes
      .filter(node => node.kind === 'entity' && node.typeId === id)
      .map(node => node.id)
  );

  return {
    types: nodes.types.filter(t => t.id !== id),
    graph: {
      nodes: nodes.graph.nodes.filter(node => !removedNodeIds.has(node.id)),
      connections: nodes.graph.connections.filter(connection => (
        !removedNodeIds.has(connection.from.nodeId) && !removedNodeIds.has(connection.to.nodeId)
      )),
    },
    transforms: nodes.transforms,
  };
}

export function countSchemaFields(children: SchemaChild[]): number {
  let count = 0;
  for (const child of children) {
    if (child.kind === 'section') count += countSchemaFields(child.children);
    else count++;
  }
  return count;
}
