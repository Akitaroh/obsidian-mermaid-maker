/**
 * Atom-EdgeRouter
 * 平行エッジ・自己ループの分離計算（純関数）
 *
 * 同じ unordered ペア (A,B) を共有する複数エッジに対し、
 * 「画面上で重ならないように」screen lane を割り当てる。
 * 対向エッジ（B→A）は edges.tsx 側で perpendicular の符号が反転するため、
 * canonical direction か否かで offset 値の符号を補正する。
 */

import type { Edge } from '../types/schema.js';

export type EdgeOffsets = Record<string, number>;

const groupKey = (e: Edge): string => {
  if (e.source === e.target) return `self:${e.source}`;
  const [a, b] = [e.source, e.target].sort();
  return `${a}|${b}`;
};

const isCanonical = (e: Edge): boolean => {
  if (e.source === e.target) return true;
  return e.source < e.target;
};

/**
 * lane 番号: 0, +1, -1, +2, -2, ...
 * 2 本だけの特例: ±1
 */
function laneAt(index: number, total: number): number {
  if (total === 2) {
    return index === 0 ? 1 : -1;
  }
  if (index === 0) return 0;
  const half = Math.ceil(index / 2);
  return index % 2 === 1 ? half : -half;
}

export function computeEdgeOffsets(edges: Edge[]): EdgeOffsets {
  const groups = new Map<string, Edge[]>();
  for (const e of edges) {
    const k = groupKey(e);
    const arr = groups.get(k) ?? [];
    arr.push(e);
    groups.set(k, arr);
  }

  const offsets: EdgeOffsets = {};
  for (const [, group] of groups) {
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const isSelfLoop = sorted.length > 0 && sorted[0].source === sorted[0].target;

    if (isSelfLoop) {
      sorted.forEach((e, i) => {
        offsets[e.id] = i;
      });
    } else {
      sorted.forEach((e, i) => {
        const lane = laneAt(i, sorted.length);
        // 対向エッジは perpendicular 符号が反転するので offset を反転して相殺
        offsets[e.id] = isCanonical(e) ? lane : -lane;
      });
    }
  }

  return offsets;
}
