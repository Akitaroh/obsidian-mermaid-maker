/**
 * Atom-MermaidParser
 * Mermaid テキスト → 内部 AST (Graph) + 座標 (PositionMap)
 * 設計: ../../../50_Mission/Mermaid Maker/Atom-MermaidParser.md
 */

import type {
  Direction,
  Edge,
  Graph,
  Node,
  NodeShape,
  ParseResult,
} from '../types/schema.js';
import {
  extractPositionComments,
  extractEdgeCtrlComments,
  extractEdgeShapeComments,
} from '../store/position-store.js';

const HEADER_RE = /^\s*graph\s+(LR|TD)\s*$/;

// ノード形状の検出（順序重要: 三重括弧から先にマッチさせる）
// 形式: ID + 形状 + (label) + 形状終わり
// 例: q0(((label)))  q1((label))  q2[label]  q3(label)
const NODE_PATTERNS: Array<{ shape: NodeShape; re: RegExp }> = [
  { shape: 'doubleCircle', re: /^([A-Za-z0-9_]+)\(\(\((.+?)\)\)\)$/ },
  { shape: 'circle', re: /^([A-Za-z0-9_]+)\(\((.+?)\)\)$/ },
  { shape: 'box', re: /^([A-Za-z0-9_]+)\[(.+?)\]$/ },
  { shape: 'rounded', re: /^([A-Za-z0-9_]+)\((.+?)\)$/ },
];

// エッジ行の正規表現
// "A --> B" / "A -->|label| B" / "A((q0)) -->|a| B(((q1)))"
const EDGE_RE =
  /^(.+?)\s*-->\s*(?:\|([^|]*)\|\s*)?(.+?)\s*$/;

type NodeAccumulator = Map<string, Node>;

function ensureNode(map: NodeAccumulator, token: string): Node {
  // token は "A" or "A((label))" 形式
  for (const { shape, re } of NODE_PATTERNS) {
    const m = token.match(re);
    if (m) {
      const id = m[1];
      const label = m[2];
      const node: Node = { id, label, shape };
      map.set(id, node);
      return node;
    }
  }
  // 形状未指定: ID のみ。既存があればそれを返す、なければ box ノードとして登録
  const idMatch = token.match(/^([A-Za-z0-9_]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    const existing = map.get(id);
    if (existing) return existing;
    const node: Node = { id, label: id, shape: 'box' };
    map.set(id, node);
    return node;
  }
  throw new Error(`Invalid node token: ${token}`);
}

export function parseMermaid(text: string): ParseResult {
  const lines = text.split('\n');
  let direction: Direction | null = null;
  const nodes: NodeAccumulator = new Map();
  const edges: Edge[] = [];
  let edgeIdCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line === '') continue;
    if (line.startsWith('%%')) continue; // コメント行（mm-pos も含む）

    if (direction === null) {
      const h = line.match(HEADER_RE);
      if (h) {
        direction = h[1] as Direction;
        continue;
      }
      return {
        ok: false,
        error: {
          line: i + 1,
          message: `Expected 'graph LR' or 'graph TD' header, got: ${line}`,
        },
      };
    }

    // エッジ行
    const e = line.match(EDGE_RE);
    if (e) {
      try {
        const sourceTok = e[1].trim();
        const label = e[2]?.trim();
        const targetTok = e[3].trim();
        const source = ensureNode(nodes, sourceTok);
        const target = ensureNode(nodes, targetTok);
        edges.push({
          id: `e${edgeIdCounter++}`,
          source: source.id,
          target: target.id,
          ...(label ? { label } : {}),
        });
      } catch (err) {
        return {
          ok: false,
          error: {
            line: i + 1,
            message: (err as Error).message,
          },
        };
      }
      continue;
    }

    // ノード単独行
    try {
      ensureNode(nodes, line);
    } catch (err) {
      return {
        ok: false,
        error: {
          line: i + 1,
          message: `Invalid line: ${line}`,
        },
      };
    }
  }

  if (direction === null) {
    return {
      ok: false,
      error: { line: 1, message: 'Empty input or missing header' },
    };
  }

  const edgeShapes = extractEdgeShapeComments(text);

  // edge.shape をコメントから読み戻す
  const edgesWithShape = edges.map((e) =>
    edgeShapes[e.id] ? { ...e, shape: edgeShapes[e.id] } : e,
  );

  const graph: Graph = {
    direction,
    nodes: Array.from(nodes.values()),
    edges: edgesWithShape,
  };

  const positions = extractPositionComments(text);
  const edgeControls = extractEdgeCtrlComments(text);

  return { ok: true, graph, positions, edgeControls, edgeShapes };
}
