import { Notice, Plugin } from 'obsidian';
import { renderMmCodeBlock } from './arrows/mm-codeblock-render.js';
import { renderMmEditableFlow } from './arrows/mm-editable-flow.js';

/**
 * source の先頭行に `%% editable %%` または `%%editable%%` があれば editable mode。
 * mermaid のコメント構文に乗るので mermaid との互換も保てる。
 */
function isEditable(source: string): boolean {
  const firstFew = source.split('\n').slice(0, 3).join('\n');
  return /%%\s*editable\s*%%/.test(firstFew);
}

/**
 * MermaidMaker Obsidian plugin — Stage 2b: HTML-label-injection (Mehrmaid-style).
 *
 * `mermaid-maker` という独自 code block を提供。中身は Mermaid 互換構文。
 * ノードラベル内の `[[X]]` 等は Obsidian の MarkdownRenderer.render を通して
 * 本物の Obsidian DOM (`<a class="internal-link">`) として埋め込まれる。
 *
 *   ```mermaid-maker
 *   graph LR
 *     A["[[ZDD]]"] --> B["[[再結晶]]"]
 *   ```
 *
 * クリック / hover preview / 右クリックメニュー / unresolved 表示 / tag / math
 * など Obsidian の機能は全て自動で動く（標準リンク要素なので）。
 *
 * 標準 `mermaid` block は触らず opt-in にする。
 */
export default class MermaidMakerPlugin extends Plugin {
  async onload() {
    console.log('[mermaid-maker] onload');

    this.app.workspace.onLayoutReady(() => {
      this.registerMarkdownCodeBlockProcessor('mermaid-maker', async (source, el, ctx) => {
        try {
          if (isEditable(source)) {
            await renderMmEditableFlow(this.app, source, el, ctx);
          } else {
            await renderMmCodeBlock(this.app, source, el, ctx);
          }
        } catch (e) {
          console.error('[mermaid-maker] render error', e);
          new Notice('MermaidMaker: failed to render diagram');
          el.empty();
          const pre = el.createEl('pre', {
            cls: 'mm-error',
            text: `MermaidMaker render error: ${(e as Error)?.message ?? e}`,
          });
          pre.style.color = 'var(--text-error)';
          pre.style.whiteSpace = 'pre-wrap';
        }
      });
    });
  }

  onunload() {
    console.log('[mermaid-maker] onunload');
  }
}
