/**
 * Atom-LabelMeasurer
 *
 * 描画済み HTMLElement の表示サイズを取得する純関数。
 * Mermaid の HTML label は事前にサイズを指定する必要があるため、
 * MarkdownRenderer.render で生まれた要素を一度実 DOM に置いて測定する。
 *
 * 注意: registerMarkdownCodeBlockProcessor のコールバック時点では `el` が
 *       document tree に attach されていない（Reading view を除く）。
 *       その状態だと offsetWidth/Height が 0 になり、レイアウトが崩れる。
 *       → 計測用の hidden な temp container を `document.body` 配下に作って、
 *         そこに引っ越して測ったら元に戻す。
 *
 * 最小値 (10px) でクランプするのは空ラベル等で Mermaid が描画を諦めないため。
 */

const MIN_DIMENSION = 10;

let measurerEl: HTMLDivElement | null = null;

function ensureMeasurer(): HTMLDivElement {
  if (measurerEl && measurerEl.isConnected) return measurerEl;
  const div = document.createElement('div');
  div.style.cssText = [
    'position: absolute',
    'visibility: hidden',
    'pointer-events: none',
    'top: 0',
    'left: -9999px',
    // インラインで折り返し無しの「自然な 1 行サイズ」を取る。
    // mermaid 側で box padding が足されるので、ここでは text 領域のみを返す。
    'max-width: none',
    'white-space: nowrap',
    'display: inline-block',
    'font-size: var(--font-text-size, 16px)',
    'line-height: 1.5',
  ].join(';');
  document.body.appendChild(div);
  measurerEl = div;
  return div;
}

export type Size = {
  width: number;
  height: number;
};

/**
 * 渡された要素を一時的に measurerEl に引っ越してサイズを取り、元の親に戻す。
 * inline-block + nowrap で「最も自然な 1 行サイズ」を取得する。
 */
export function measureLabel(el: HTMLElement): Size {
  const measurer = ensureMeasurer();
  const originalParent = el.parentElement;
  const nextSibling = el.nextSibling;

  measurer.appendChild(el);
  const width = el.offsetWidth;
  const height = el.offsetHeight;

  // 元の親へ戻す（無ければ measurer 上に残す）
  if (originalParent) {
    if (nextSibling) {
      originalParent.insertBefore(el, nextSibling);
    } else {
      originalParent.appendChild(el);
    }
  }

  // mermaid 側で内部 padding を補ってくれないケースに備え、padding 相当を盛る
  const PAD_X = 16;
  const PAD_Y = 12;
  return {
    width: Math.max(width + PAD_X, MIN_DIMENSION),
    height: Math.max(height + PAD_Y, MIN_DIMENSION),
  };
}
