/**
 * Atom-QuoteExtractor
 *
 * Mermaid source 中の `"..."` クォート文字列を全て抽出する純関数。
 * Mermaid のノードラベルはクォートで囲まれ、HTML label として扱われる前提。
 *
 * 例: `A["[[X]]"] --> B["普通"]`
 *   → [`"[[X]]"`, `"普通"`]
 *
 * クォート内のエスケープは扱わない（Mermaid の文法上、" のエスケープは無い）。
 */

export type Quote = {
  /** クォート込みの literal（例: `"[[X]]"`） */
  literal: string;
  /** クォートを除いた中身（例: `[[X]]`） */
  inner: string;
};

export function extractQuotes(source: string): Quote[] {
  const matches = source.match(/"([^"]*?)"/g);
  if (!matches) return [];
  return matches.map((literal) => ({
    literal,
    inner: literal.slice(1, -1),
  }));
}
