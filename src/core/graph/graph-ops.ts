/**
 * Atom-GraphOps
 * Graph 構造への純関数 CRUD
 * 設計: ../../../50_Mission/Mermaid Maker/Atom-GraphOps.md
 */

import type { Edge, Graph, Node, NodeShape } from '../types/schema.js';

export function generateNodeId(graph: Graph): string {
  const used = new Set(graph.nodes.map((n) => n.id));
  let i = 0;
  while (used.has(`n${i}`)) i++;
  return `n${i}`;
}

export function generateEdgeId(graph: Graph): string {
  const used = new Set(graph.edges.map((e) => e.id));
  let i = 0;
  while (used.has(`e${i}`)) i++;
  return `e${i}`;
}

export function addNode(
  graph: Graph,
  partial: { id?: string; label?: string; shape?: NodeShape },
): { graph: Graph; node: Node } {
  const id = partial.id ?? generateNodeId(graph);
  if (graph.nodes.some((n) => n.id === id)) {
    // ID 重複なら自動採番に切り替え
    const auto = generateNodeId(graph);
    return addNode(graph, { ...partial, id: auto });
  }
  const node: Node = {
    id,
    label: partial.label ?? id,
    shape: partial.shape ?? 'circle',
  };
  return {
    graph: { ...graph, nodes: [...graph.nodes, node] },
    node,
  };
}

export function addEdge(
  graph: Graph,
  partial: {
    id?: string;
    source: string;
    target: string;
    label?: string;
    sourceHandle?: string;
    targetHandle?: string;
  },
): { graph: Graph; edge: Edge } {
  const id = partial.id ?? generateEdgeId(graph);
  const edge: Edge = {
    id,
    source: partial.source,
    target: partial.target,
    ...(partial.label ? { label: partial.label } : {}),
    ...(partial.sourceHandle ? { sourceHandle: partial.sourceHandle } : {}),
    ...(partial.targetHandle ? { targetHandle: partial.targetHandle } : {}),
  };
  return {
    graph: { ...graph, edges: [...graph.edges, edge] },
    edge,
  };
}

export function updateNode(
  graph: Graph,
  id: string,
  patch: Partial<Omit<Node, 'id'>>,
): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
  };
}

export function updateEdge(
  graph: Graph,
  id: string,
  patch: Partial<Omit<Edge, 'id'>>,
): Graph {
  return {
    ...graph,
    edges: graph.edges.map((e) =>
      e.id === id
        ? // label が undefined の patch は label を消す扱い
          patch.label === undefined && 'label' in patch
          ? (() => {
              const { label, ...rest } = e;
              void label;
              return { ...rest, ...patch };
            })()
          : { ...e, ...patch }
        : e,
    ),
  };
}

export function removeNode(graph: Graph, id: string): Graph {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.source !== id && e.target !== id),
  };
}

export function removeEdge(graph: Graph, id: string): Graph {
  return {
    ...graph,
    edges: graph.edges.filter((e) => e.id !== id),
  };
}

export function toggleAcceptState(graph: Graph, id: string): Graph {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) return graph;
  let nextShape: NodeShape;
  if (node.shape === 'circle') nextShape = 'doubleCircle';
  else if (node.shape === 'doubleCircle') nextShape = 'circle';
  else return graph; // box / rounded には作用しない
  return updateNode(graph, id, { shape: nextShape });
}
