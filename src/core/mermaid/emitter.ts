/**
 * Atom-MermaidEmitter
 * 内部 AST + 各種メタデータ → Mermaid テキスト（コメント付き）
 * 設計: ../../../50_Mission/Mermaid Maker/Atom-MermaidEmitter.md
 */

import type {
  EdgeControlMap,
  EdgeShapeMap,
  Graph,
  Node,
  PositionMap,
} from '../types/schema.js';
import {
  formatPositionComment,
  formatEdgeCtrlComment,
  formatEdgeShapeComment,
} from '../store/position-store.js';

function formatNode(node: Node): string {
  switch (node.shape) {
    case 'circle':
      return `${node.id}((${node.label}))`;
    case 'doubleCircle':
      return `${node.id}(((${node.label})))`;
    case 'box':
      return `${node.id}[${node.label}]`;
    case 'rounded':
      return `${node.id}(${node.label})`;
  }
}

export function emitMermaid(
  graph: Graph,
  positions: PositionMap,
  options: {
    edgeControls?: EdgeControlMap;
    edgeShapes?: EdgeShapeMap;
  } = {},
): string {
  const lines: string[] = [];
  lines.push(`graph ${graph.direction}`);

  for (const node of graph.nodes) {
    if (node.shape === 'box' && node.label === node.id) {
      const isReferenced = graph.edges.some(
        (e) => e.source === node.id || e.target === node.id,
      );
      if (isReferenced) continue;
    }
    lines.push(`    ${formatNode(node)}`);
  }

  for (const edge of graph.edges) {
    const arrow = edge.label ? `-->|${edge.label}|` : `-->`;
    lines.push(`    ${edge.source} ${arrow} ${edge.target}`);
  }

  const posLine = formatPositionComment(positions);
  if (posLine) lines.push(posLine);

  // edge shapes を Edge.shape からも吸収（options.edgeShapes は明示指定の優先 override）
  const shapesFromEdges: EdgeShapeMap = {};
  for (const e of graph.edges) {
    if (e.shape && e.shape !== 'default') {
      shapesFromEdges[e.id] = e.shape;
    }
  }
  const mergedShapes: EdgeShapeMap = { ...shapesFromEdges, ...(options.edgeShapes ?? {}) };
  const shapeLine = formatEdgeShapeComment(mergedShapes);
  if (shapeLine) lines.push(shapeLine);

  if (options.edgeControls) {
    const ctrlLine = formatEdgeCtrlComment(options.edgeControls);
    if (ctrlLine) lines.push(ctrlLine);
  }

  return lines.join('\n');
}
