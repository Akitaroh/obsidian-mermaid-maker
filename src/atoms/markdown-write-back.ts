/**
 * Atom-MarkdownWriteBack
 *
 * 新しい mermaid source 文字列を `mermaid-maker` code block の content 部分
 * （open/close fence の間）に書き戻す。
 *
 * 設計判断:
 * - debounce は呼出側 (Arrow) の責務、この Atom は同期的に 1 回書き戻すだけ
 * - %%editable%% フラグの prepend も呼出側責務
 * - 失敗 (Reading view, editor 無し等) は { ok: false, reason } で返す
 */

import { App, MarkdownPostProcessorContext, MarkdownView } from 'obsidian';

export type WriteBackResult =
  | { ok: true }
  | { ok: false; reason: string };

export function writeBackMmCodeBlock(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  newSource: string,
): WriteBackResult {
  const info = ctx.getSectionInfo(el);
  if (!info) {
    return { ok: false, reason: 'no-section-info' };
  }

  const view = app.workspace.activeLeaf?.view;
  if (!(view instanceof MarkdownView)) {
    return { ok: false, reason: 'not-markdown-view' };
  }

  const editor = view.editor;
  if (!editor) {
    return { ok: false, reason: 'no-editor' };
  }

  // active file と ctx.sourcePath が一致しないと、別ファイルを書き換えてしまう恐れ
  const activeFilePath = view.file?.path;
  if (activeFilePath && activeFilePath !== ctx.sourcePath) {
    return { ok: false, reason: 'active-file-mismatch' };
  }

  // 末尾改行を必ず確保
  const payload = newSource.endsWith('\n') ? newSource : newSource + '\n';

  // ctx が stale な場合、lineEnd がエディタの行数を超えていることがある
  // (前回の writeBack でファイルが縮んだ後、古い ctx を使うケース)
  // 範囲外なら writeBack を諦める（次の render で新 ctx が来るので問題ない）
  const lastLine = editor.lineCount() - 1;
  if (info.lineEnd > lastLine || info.lineStart > lastLine) {
    return { ok: false, reason: 'stale-section-info-out-of-range' };
  }

  // 範囲内の content が "mermaid-maker" code block か検証 (誤書換防止)
  if (info.lineStart >= 0) {
    const openLine = editor.getLine(info.lineStart);
    if (!openLine.includes('```mermaid-maker')) {
      return { ok: false, reason: 'section-fence-mismatch' };
    }
  }

  try {
    editor.replaceRange(
      payload,
      { line: info.lineStart + 1, ch: 0 },
      { line: info.lineEnd, ch: 0 },
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error)?.message ?? String(e) };
  }
}
