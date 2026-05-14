/**
 * Arrow-MmEditableFlow (Stage 3a〜3d)
 *
 * `mermaid-maker %%editable%%` block を xyflow キャンバスとして描画。
 * - Stage 3a: read-only マウント
 * - Stage 3b: drag → write-back
 * - Stage 3c: ノード CRUD (追加/削除/ラベル編集/エッジ追加削除) → write-back
 * - Stage 3d: xyflow ノード内ラベルを Obsidian MarkdownRenderer で描画
 *
 * 設計判断:
 * - xyflow を編集セッションの source of truth とする
 * - 変更は単一 onChange callback で集約、Arrow が rfToGraph 変換 + writeback
 * - Live Preview (CodeMirror widget) では mount せず、Reading view 専用
 */

import {
  App,
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  MarkdownRenderer,
  Notice,
} from 'obsidian';
import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import {
  parseMermaid,
  extractPositionComments,
  emitMermaid,
  type Direction,
  type Graph,
  type Node as MmNode,
  type Edge as MmEdge,
  type NodeShape,
  type PositionMap,
} from '../core/index.js';
import { fillMissingPositions } from '../atoms/dagre-layout.js';
import { mountXyflow } from '../atoms/xyflow-mounter.js';
import { writeBackMmCodeBlock } from '../atoms/markdown-write-back.js';
import { openLabelEdit } from '../atoms/label-edit-modal.js';

const WRITE_BACK_DEBOUNCE_MS = 500;
const EDITABLE_FLAG_LINE = '%%editable%%';

/**
 * Mermaid syntax は box ノードを `A[label]` で表現する。label に `[`, `]`,
 * `(`, `)`, `{`, `}`, `|` 等を含むとパーサが破綻するため、これらを含む場合は
 * ダブルクォートで囲み、内部の `"` は HTML エンティティに置換する。
 *
 * 例: `[[X]]` → `"[[X]]"`
 *     `a"b`   → `"a&quot;b"`
 */
function quoteLabelIfNeeded(label: string): string {
  if (/[\[\](){}|"]/.test(label)) {
    return `"${label.replace(/"/g, '&quot;')}"`;
  }
  return label;
}

/** xyflow の現状から Graph + PositionMap を再構築 */
function rfToGraph(
  direction: Direction,
  rfNodes: RFNode[],
  rfEdges: RFEdge[],
): { graph: Graph; positions: PositionMap } {
  return {
    graph: {
      direction,
      nodes: rfNodes.map((n) => {
        const data = n.data as { label?: string; shape?: NodeShape };
        const raw = String(data?.label ?? n.id);
        const shape: NodeShape = data?.shape ?? 'box';
        return {
          id: n.id,
          label: quoteLabelIfNeeded(raw),
          shape,
        };
      }),
      edges: rfEdges.map((e, i) => ({
        id: e.id ?? `e${i}`,
        source: e.source,
        target: e.target,
        label: (e.label as string | undefined) ?? undefined,
      })),
    },
    positions: Object.fromEntries(rfNodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }])),
  };
}

export async function renderMmEditableFlow(
  app: App,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
): Promise<void> {
  // Live Preview (CodeMirror widget) では xyflow を mount しない
  if (el.closest('.markdown-source-view')) {
    el.empty();
    const note = el.createDiv({ cls: 'mm-edit-hint' });
    note.textContent = '✏️ GUI 編集は読み取りビュー (cmd+e) で利用できます';
    note.style.cssText = 'padding:8px;color:var(--text-muted);font-size:12px;';
    return;
  }

  const parseResult = parseMermaid(source);
  if (!parseResult.ok) {
    el.empty();
    const err = el.createEl('pre', {
      text: `MermaidMaker parse error: ${parseResult.errors.map((e) => e.message).join('\n')}`,
    });
    err.style.color = 'var(--text-error)';
    return;
  }

  const graph: Graph = parseResult.graph;
  const initialDirection: Direction = graph.direction;
  const stored: PositionMap = extractPositionComments(source);
  const initialPositions = fillMissingPositions(graph, stored, graph.direction);

  const rfNodes: RFNode[] = graph.nodes.map((n: MmNode) => {
    // circle 系は正方形に寄せる、それ以外は横長 rect
    const isCircular = n.shape === 'circle' || n.shape === 'doubleCircle';
    const size = isCircular ? { width: 96, height: 96 } : { width: 160, height: 56 };
    return {
      id: n.id,
      type: 'mm',
      position: initialPositions[n.id] ?? { x: 0, y: 0 },
      data: {
        label: (n.label ?? n.id).replace(/^"|"$/g, ''),
        shape: n.shape,
      },
      style: size,
      measured: size,
    };
  });
  const rfEdges: RFEdge[] = graph.edges.map((e: MmEdge) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label ?? undefined,
  }));

  const theme: 'light' | 'dark' = document.body.classList.contains('theme-dark') ? 'dark' : 'light';

  // ---- write-back ----------------------------------------------------------
  let pendingTimer: number | null = null;
  let latestGraph: Graph = graph;
  let latestPositions: PositionMap = initialPositions;

  const flush = () => {
    pendingTimer = null;
    try {
      // 安全網: 元のグラフが空でないのに突如空になっていたら、データ破壊の兆候
      // （前回 writeback で壊れた mermaid を parse → 空 graph → このまま書くと
      // ユーザの作業が全消失する）。書戻しを諦めて警告を出すだけにする
      if (
        graph.nodes.length > 0 &&
        latestGraph.nodes.length === 0 &&
        latestGraph.edges.length === 0
      ) {
        console.warn('[mermaid-maker] aborted writeback: latest graph is empty');
        return;
      }
      const newSource = emitMermaid(latestGraph, latestPositions);
      const withFlag = `${EDITABLE_FLAG_LINE}\n${newSource}`;
      const result = writeBackMmCodeBlock(app, ctx, el, withFlag);
      if (!result.ok) {
        if (result.reason !== 'active-file-mismatch' && result.reason !== 'not-markdown-view') {
          console.warn('[mermaid-maker] write-back failed:', result.reason);
        }
      }
    } catch (e) {
      console.error('[mermaid-maker] flush error', e);
      new Notice(`MermaidMaker error: ${(e as Error)?.message ?? e}`);
    }
  };

  const scheduleWriteBack = () => {
    if (pendingTimer !== null) window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(flush, WRITE_BACK_DEBOUNCE_MS);
  };

  const onChange = (nodes: RFNode[], edges: RFEdge[]) => {
    const { graph: g, positions: p } = rfToGraph(initialDirection, nodes, edges);
    latestGraph = g;
    latestPositions = p;
    scheduleWriteBack();
  };

  // ---- renderLabel (Stage 3d) ---------------------------------------------
  const renderLabel = (label: string, target: HTMLElement): (() => void) => {
    const child = new MarkdownRenderChild(target);
    void MarkdownRenderer.render(app, label, target, ctx.sourcePath, child);
    return () => {
      child.unload();
    };
  };

  // --------------------------------------------------------------------------
  const handle = mountXyflow(el, {
    nodes: rfNodes,
    edges: rfEdges,
    theme,
    onChange,
    renderLabel,
    onEditLabel: (current, onSubmit) => openLabelEdit(app, current, onSubmit),
  });

  const child = new MarkdownRenderChild(el);
  child.onunload = () => {
    // 重要: unload 時に flush() を呼ばない。
    // unload は Obsidian の re-render で起きるが、その時点で ctx は stale で
    // 書戻すと範囲外エラーで editor 状態が壊れる（debounce 中の編集は破棄して
    // OK、次の mount で新しい ctx から再開する）
    if (pendingTimer !== null) {
      window.clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    handle.unmount();
  };
  ctx.addChild(child);
}
