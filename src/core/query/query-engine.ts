/**
 * Atom-QueryEngine
 *
 * Graph に対する構造クエリ群。
 * AI が「視覚認識ではなく構造で」図を読むためのAPI。
 *
 * 設計: ../../../../50_Mission/MermaidMaker/Atom-QueryEngine.md
 */

import type { Edge, Graph, Node, NodeShape } from '../types/schema.js';

// ─────────────────────────────────────────────────────────────────
// listNodes / listEdges
// ─────────────────────────────────────────────────────────────────

export type NodeInfo = { id: string; label: string; shape: NodeShape };
export type EdgeInfo = {
  from: string;
  to: string;
  label?: string;
};

export function listNodes(graph: Graph): NodeInfo[] {
  return graph.nodes.map((n: Node) => ({
    id: n.id,
    label: n.label,
    shape: n.shape,
  }));
}

export function listEdges(graph: Graph): EdgeInfo[] {
  return graph.edges.map((e: Edge) => {
    const info: EdgeInfo = { from: e.source, to: e.target };
    if (e.label !== undefined) info.label = e.label;
    return info;
  });
}

// ─────────────────────────────────────────────────────────────────
// findPath
// ─────────────────────────────────────────────────────────────────

export type FindPathOptions = {
  /** Cap on number of paths to enumerate (default 1000). */
  maxPaths?: number;
};

export type FindPathResult = {
  paths: string[][];
  truncated: boolean;
};

export function findPath(
  graph: Graph,
  from: string,
  to: string,
  opts: FindPathOptions = {}
): FindPathResult {
  const cap = opts.maxPaths ?? 1000;
  const adj = buildAdjOut(graph);
  const result: string[][] = [];
  let truncated = false;

  function dfs(node: string, path: string[], visited: Set<string>) {
    if (truncated) return;
    if (node === to) {
      result.push([...path, node]);
      if (result.length >= cap) truncated = true;
      return;
    }
    const next = adj.get(node);
    if (!next) return;
    visited.add(node);
    path.push(node);
    for (const nb of next) {
      if (visited.has(nb)) continue;
      dfs(nb, path, visited);
      if (truncated) break;
    }
    path.pop();
    visited.delete(node);
  }

  // Confirm `from` exists; if not, return empty.
  if (!graph.nodes.some((n) => n.id === from)) {
    return { paths: [], truncated: false };
  }
  if (!graph.nodes.some((n) => n.id === to)) {
    return { paths: [], truncated: false };
  }
  dfs(from, [], new Set());
  return { paths: result, truncated };
}

// ─────────────────────────────────────────────────────────────────
// neighbors
// ─────────────────────────────────────────────────────────────────

export type Neighbors = { in: string[]; out: string[] };

export function neighbors(graph: Graph, nodeId: string): Neighbors {
  const incoming = new Set<string>();
  const outgoing = new Set<string>();
  for (const e of graph.edges) {
    if (e.source === nodeId) outgoing.add(e.target);
    if (e.target === nodeId) incoming.add(e.source);
  }
  return { in: [...incoming], out: [...outgoing] };
}

// ─────────────────────────────────────────────────────────────────
// validate
// ─────────────────────────────────────────────────────────────────

export type ValidationIssue = {
  kind: 'duplicate_node' | 'unknown_node' | 'isolated_node';
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

export function validate(graph: Graph): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. duplicate node ids
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const n of graph.nodes) {
    if (seen.has(n.id)) dups.add(n.id);
    else seen.add(n.id);
  }
  for (const id of dups) {
    errors.push({
      kind: 'duplicate_node',
      message: `Duplicate node id: ${id}`,
      nodeId: id,
    });
  }

  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  // 2. edges referencing unknown nodes
  for (const e of graph.edges) {
    if (!nodeIds.has(e.source)) {
      errors.push({
        kind: 'unknown_node',
        message: `Edge ${e.id} references unknown source node: ${e.source}`,
        edgeId: e.id,
        nodeId: e.source,
      });
    }
    if (!nodeIds.has(e.target)) {
      errors.push({
        kind: 'unknown_node',
        message: `Edge ${e.id} references unknown target node: ${e.target}`,
        edgeId: e.id,
        nodeId: e.target,
      });
    }
  }

  // 3. isolated nodes (no incoming and no outgoing) → warning only
  const hasEdge = new Set<string>();
  for (const e of graph.edges) {
    hasEdge.add(e.source);
    hasEdge.add(e.target);
  }
  for (const n of graph.nodes) {
    if (!hasEdge.has(n.id)) {
      warnings.push({
        kind: 'isolated_node',
        message: `Isolated node: ${n.id}`,
        nodeId: n.id,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─────────────────────────────────────────────────────────────────
// graphStats
// ─────────────────────────────────────────────────────────────────

export type GraphStats = {
  nodeCount: number;
  edgeCount: number;
  isConnected: boolean;
};

export function graphStats(graph: Graph): GraphStats {
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;
  if (nodeCount === 0) {
    return { nodeCount: 0, edgeCount, isConnected: true };
  }
  // Treat as undirected for connectivity check.
  const adj = new Map<string, Set<string>>();
  for (const n of graph.nodes) adj.set(n.id, new Set());
  for (const e of graph.edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  const start = graph.nodes[0]!.id;
  const visited = new Set<string>([start]);
  const queue: string[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  return {
    nodeCount,
    edgeCount,
    isConnected: visited.size === nodeCount,
  };
}

// ─────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────

function buildAdjOut(graph: Graph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    const list = adj.get(e.source);
    if (list) list.push(e.target);
  }
  return adj;
}
