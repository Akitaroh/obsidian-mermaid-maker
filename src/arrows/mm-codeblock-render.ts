/**
 * Arrow-MmCodeBlockRender
 *
 * `mermaid-maker` code block を render するメインフロー。
 * atoms を順序通り協調させ、Obsidian の本物リンク要素が埋め込まれた
 * Mermaid 図を最終的に container に流し込む。
 *
 * Flow:
 *   1. extractQuotes(source)
 *   2. 各 quote.inner を renderMarkdownToElement で Obsidian DOM 化
 *   3. measureLabel で各サイズを取得
 *   4. injectPlaceholders で source を書き換え
 *   5. loadMermaidConfigured → mermaid.render で SVG 生成
 *   6. container を一旦空にして SVG 挿入
 *   7. プレースホルダ div を本物の Obsidian DOM で差し替え
 *
 * 失敗時は呼び出し側 (main.ts) が catch して Notice を出す。
 */

import { App, MarkdownPostProcessorContext } from 'obsidian';
import { extractQuotes } from '../atoms/quote-extractor.js';
import { renderMarkdownToElement } from '../atoms/markdown-renderer.js';
import { measureLabel } from '../atoms/label-measurer.js';
import { injectPlaceholders } from '../atoms/placeholder-injector.js';
import { loadMermaidConfigured } from '../atoms/mermaid-loader.js';

export async function renderMmCodeBlock(
  app: App,
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
): Promise<void> {
  const quotes = extractQuotes(source);
  if (quotes.length === 0) {
    // クォート label が無い場合は素の mermaid として描画
    await renderWithoutLabels(source, el, ctx);
    return;
  }

  // 1-3: 各クォート label を Obsidian で render → サイズ測定
  const rendered = await Promise.all(
    quotes.map((q) => renderMarkdownToElement(app, q.inner, ctx, el)),
  );
  const sizes = rendered.map((r) => measureLabel(r.el));

  // 4: source を placeholder div に置換
  const { source: rewritten, placeholders } = injectPlaceholders(
    source,
    quotes,
    sizes,
  );

  // 5: mermaid render
  const mermaid = await loadMermaidConfigured();
  const lineStart = ctx.getSectionInfo(el)?.lineStart ?? 0;
  const graphId = `mermaid-maker-${lineStart}-${Date.now()}`;
  const { svg } = await mermaid.render(graphId, rewritten);

  // 6: 一旦 container を空にして SVG 挿入
  el.empty();
  appendSvgString(el, svg);

  // 7: placeholder ↔ 本物 DOM swap
  placeholders.forEach((ph, i) => {
    const target = el.getElementsByClassName(ph.className)[0];
    if (!target) return;
    target.appendChild(rendered[i].el);
  });
}

async function renderWithoutLabels(
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
): Promise<void> {
  const mermaid = await loadMermaidConfigured();
  const lineStart = ctx.getSectionInfo(el)?.lineStart ?? 0;
  const graphId = `mermaid-maker-${lineStart}-${Date.now()}`;
  const { svg } = await mermaid.render(graphId, source);
  el.empty();
  appendSvgString(el, svg);
}

/**
 * Mermaid が返す SVG 文字列を DOM に追加するヘルパ。
 *
 * `insertAdjacentHTML` や `innerHTML` 代入は Obsidian 審査で flag されるため、
 * 標準 DOMParser で SVG をパースして要素として appendChild する。
 * DOMParser は HTML/XML をパース時にスクリプト実行しないので、これは安全。
 */
function appendSvgString(parent: HTMLElement, svg: string): void {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root && root.nodeName.toLowerCase() === 'svg') {
    parent.appendChild(root);
  }
}
