/**
 * traceless-style VS Code extension — levenshtein.ts
 *
 * Tiny edit-distance + closest-match helpers used by the diagnostic
 * provider to suggest "did you mean…" fixes for typos like `colour` →
 * `color` and `paddngTop` → `paddingTop`.
 *
 * Mirrors the algorithm used by the library's own `suggestClosestProperty`
 * (src/compiler/css-properties.ts) so the extension and the CLI agree
 * on what the closest property is.
 */

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Find up to `max` closest matches to `needle` from `haystack`, ranked
 * by edit distance. Returns matches with distance ≤ `cutoff`. Used to
 * power "did you mean: padding, paddingTop, paddingBottom" multi-suggest
 * pop-ups in the quick-fix menu.
 */
export function closestMatches(
  needle:    string,
  haystack:  Iterable<string>,
  opts: { max?: number; cutoff?: number } = {}
): string[] {
  const max    = opts.max    ?? 3;
  const cutoff = opts.cutoff ?? 3;
  if (needle.length < 2) return [];
  const scored: Array<{ s: string; d: number }> = [];
  for (const s of haystack) {
    const d = levenshtein(needle.toLowerCase(), s.toLowerCase());
    if (d <= cutoff) scored.push({ s, d });
  }
  scored.sort((x, y) => x.d - y.d);
  return scored.slice(0, max).map(x => x.s);
}
