/**
 * Atom-MarkdownRenderer
 *
 * 任意の markdown 文字列を Obsidian の MarkdownRenderer.render で
 * 「本物の Obsidian DOM」に変換する。
 *
 * これにより `[[X]]` → `<a class="internal-link" data-href="X">X</a>` のように
 * 標準リンク要素が生まれる。生まれた DOM は Obsidian の click handler /
 * hover preview / context menu / unresolved 表示などにそのまま乗る。
 *
 * 寿命管理: MarkdownRenderChild は呼び出し側が ctx.addChild に登録すること。
 *           ここでは Render と要素返却のみ責任を持つ。
 */

import {
  App,
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  MarkdownRenderer,
} from 'obsidian';

export type RenderedMarkdown = {
  /** 描画された Obsidian の DOM container */
  el: HTMLElement;
  /** ライフサイクル管理オブジェクト（ctx.addChild に渡す） */
  child: MarkdownRenderChild;
};

export async function renderMarkdownToElement(
  app: App,
  markdown: string,
  ctx: MarkdownPostProcessorContext,
  parent: HTMLElement,
): Promise<RenderedMarkdown> {
  const el = parent.createDiv({ cls: 'mm-rendered-label' });
  const child = new MarkdownRenderChild(el);
  ctx.addChild(child);

  await MarkdownRenderer.render(app, markdown, el, ctx.sourcePath, child);

  return { el, child };
}
