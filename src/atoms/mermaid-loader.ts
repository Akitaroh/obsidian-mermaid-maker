/**
 * Atom-MermaidLoader
 *
 * Obsidian 同梱の mermaid を loadMermaid() で取得し、テーマに合わせた
 * 初期設定を施した状態で返す。
 *
 * htmlLabels: true を有効化することで Mermaid に HTML ラベルを許可する
 * （これが Mehrmaid 式の核）。
 *
 * テーマ判定は document.body.classList の `theme-dark` の有無で行う。
 */

import { loadMermaid } from 'obsidian';

const COMMON_CONFIG = {
  startOnLoad: false,
  flowchart: { htmlLabels: true },
  securityLevel: 'loose' as const,
};

const THEME_LIGHT = {
  ...COMMON_CONFIG,
  theme: 'default' as const,
};

const THEME_DARK = {
  ...COMMON_CONFIG,
  theme: 'dark' as const,
};

export type MermaidInstance = {
  render: (id: string, source: string) => Promise<{ svg: string }>;
};

export async function loadMermaidConfigured(): Promise<MermaidInstance> {
  const mermaid = await loadMermaid();
  const config = document.body.classList.contains('theme-dark')
    ? THEME_DARK
    : THEME_LIGHT;
  mermaid.initialize(config);
  // 古い API との互換（Mehrmaid もこの 2 段呼びをやっている）
  if (mermaid.mermaidAPI?.setConfig) {
    mermaid.mermaidAPI.setConfig(config);
  }
  return mermaid as MermaidInstance;
}
