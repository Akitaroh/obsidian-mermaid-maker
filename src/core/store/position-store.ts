/**
 * Atom-PositionStore
 * 座標・エッジ形状・エッジ制御点 など、Mermaid テキストにコメントで埋め込むメタデータの相互変換
 * 設計: ../../../50_Mission/Mermaid Maker/Atom-PositionStore.md
 */

import type {
  EdgeControlMap,
  EdgeShape,
  EdgeShapeMap,
  PositionMap,
} from '../types/schema.js';

const META_PREFIXES = {
  position: 'mm-pos',
  edgeCtrl: 'mm-edge-ctrl',
  edgeShape: 'mm-edge-shape',
} as const;

const POSITION_ENTRY_RE = /([A-Za-z0-9_]+)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;
const SHAPE_ENTRY_RE = /([A-Za-z0-9_]+)=(default|straight|step|smoothstep)/g;
const ALL_META_LINE_RE = /^%%\s*(mm-pos|mm-edge-ctrl|mm-edge-shape):\s*(.+)$/;

function metaLineRegex(prefix: string): RegExp {
  // 安全なエスケープ（prefix は固定）
  return new RegExp(`^%%\\s*${prefix}:\\s*(.+)$`);
}

/** 座標形式の汎用 parser */
function parsePositionLike(prefix: string, line: string): Record<string, { x: number; y: number }> {
  const m = line.match(metaLineRegex(prefix));
  if (!m) return {};
  const result: Record<string, { x: number; y: number }> = {};
  for (const entry of m[1].matchAll(POSITION_ENTRY_RE)) {
    const id = entry[1];
    const x = Number(entry[2]);
    const y = Number(entry[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    result[id] = { x, y };
  }
  return result;
}

/** 座標形式の汎用 formatter */
function formatPositionLike(
  prefix: string,
  map: Record<string, { x: number; y: number }>,
): string {
  const entries = Object.entries(map);
  if (entries.length === 0) return '';
  const parts = entries.map(([id, p]) => `${id}=${p.x},${p.y}`);
  return `%% ${prefix}: ${parts.join(' ')}`;
}

// ===== Position =====

export function parsePositionComment(line: string): PositionMap {
  return parsePositionLike(META_PREFIXES.position, line);
}

export function formatPositionComment(positions: PositionMap): string {
  return formatPositionLike(META_PREFIXES.position, positions);
}

export function extractPositionComments(text: string): PositionMap {
  const merged: PositionMap = {};
  for (const line of text.split('\n')) {
    Object.assign(merged, parsePositionComment(line));
  }
  return merged;
}

// ===== Edge Control =====

export function parseEdgeCtrlComment(line: string): EdgeControlMap {
  return parsePositionLike(META_PREFIXES.edgeCtrl, line);
}

export function formatEdgeCtrlComment(controls: EdgeControlMap): string {
  return formatPositionLike(META_PREFIXES.edgeCtrl, controls);
}

export function extractEdgeCtrlComments(text: string): EdgeControlMap {
  const merged: EdgeControlMap = {};
  for (const line of text.split('\n')) {
    Object.assign(merged, parseEdgeCtrlComment(line));
  }
  return merged;
}

// ===== Edge Shape =====

export function parseEdgeShapeComment(line: string): EdgeShapeMap {
  const m = line.match(metaLineRegex(META_PREFIXES.edgeShape));
  if (!m) return {};
  const result: EdgeShapeMap = {};
  for (const entry of m[1].matchAll(SHAPE_ENTRY_RE)) {
    result[entry[1]] = entry[2] as EdgeShape;
  }
  return result;
}

export function formatEdgeShapeComment(shapes: EdgeShapeMap): string {
  const entries = Object.entries(shapes);
  if (entries.length === 0) return '';
  const parts = entries.map(([id, s]) => `${id}=${s}`);
  return `%% ${META_PREFIXES.edgeShape}: ${parts.join(' ')}`;
}

export function extractEdgeShapeComments(text: string): EdgeShapeMap {
  const merged: EdgeShapeMap = {};
  for (const line of text.split('\n')) {
    Object.assign(merged, parseEdgeShapeComment(line));
  }
  return merged;
}

// ===== 汎用: メタコメント全削除 =====

export function stripPositionComments(text: string): string {
  // 互換のため名前を維持。実装は全メタコメントを削除する
  return stripAllMetaComments(text);
}

export function stripAllMetaComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !ALL_META_LINE_RE.test(line))
    .join('\n');
}
