/**
 * Atom-DagreLayout (Obsidian package 内部, packages/web の fillMissingPositions と同等)
 *
 * 座標未指定 (PositionMap が空) なら dagre で初期座標を計算する純関数。
 * 既に座標がある node はそのまま使う。
 *
 * 将来的には packages/web/src/canvas/layout.ts の fillMissingPositions を
 * packages/core に引き上げて共有するのが筋。今は packages/obsidian 内に独立実装。
 */

import dagre from 'dagre';
import type { Graph, PositionMap } from '../core/index.js';

const NODE_W = 140;
const NODE_H = 56;

export function fillMissingPositions(
  graph: Graph,
  existing: PositionMap,
  direction: 'LR' | 'TD' = 'LR',
): PositionMap {
  const missing = graph.nodes.filter((n) => !existing[n.id]);
  if (missing.length === 0) return { ...existing };

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  graph.nodes.forEach((n) => {
    g.setNode(n.id, { width: NODE_W, height: NODE_H });
  });
  graph.edges.forEach((e) => {
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  const filled: PositionMap = { ...existing };
  missing.forEach((n) => {
    const layoutNode = g.node(n.id);
    if (layoutNode) {
      filled[n.id] = { x: layoutNode.x, y: layoutNode.y };
    }
  });
  return filled;
}
