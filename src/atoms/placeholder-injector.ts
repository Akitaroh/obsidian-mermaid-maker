/**
 * Atom-PlaceholderInjector
 *
 * 抽出済みのクォート群と各々の測定済みサイズから、Mermaid source 内の
 * `"..."` をプレースホルダ div に置換した新 source を返す純関数。
 *
 * プレースホルダ div は `class="mm-slot-N"` の一意なクラスを持ち、後段で
 * 本物の Obsidian DOM と swap される際の識別子になる。
 *
 * 注意: クォート文字列は重複する可能性がある（"普通" が 2 個出てくる等）。
 *       String.replace の最初の 1 件だけ置換、を逐次やる必要がある。
 *       事前に source 全体を一度コピーし、各 quote について順番に
 *       replace(literal, placeholder) を呼ぶ。
 */

import { Quote } from './quote-extractor.js';
import { Size } from './label-measurer.js';

export type Placeholder = {
  /** swap 時に getElementsByClassName で引き当てるための識別 class 名 */
  className: string;
  /** 中身（後で挿入する DOM の参照に使う） */
  inner: string;
};

export type InjectionResult = {
  source: string;
  placeholders: Placeholder[];
};

export function injectPlaceholders(
  source: string,
  quotes: Quote[],
  sizes: Size[],
): InjectionResult {
  const placeholders: Placeholder[] = [];
  let next = source;

  quotes.forEach((q, i) => {
    const size = sizes[i];
    const className = `mm-slot-${i}`;
    const div = `<div class="${className} mm-slot" style="width:${size.width}px;height:${size.height}px;display:inline-block;"></div>`;

    // 順次置換: 同じ literal が複数あっても 1 個ずつ消費する
    next = next.replace(q.literal, div);
    placeholders.push({ className, inner: q.inner });
  });

  return { source: next, placeholders };
}
