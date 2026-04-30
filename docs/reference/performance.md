# Performance characteristics

This page collects empirical measurements and explains why the numbers look the way they do.

## Build-time extraction

Measured on the sibling `traceless-style-test` workload (mid-tier laptop, Node 22).

| Files | legacy median | swc median | swc/legacy |
|---|---|---|---|
| 10 | 2.70 ms | 3.04 ms | 1.13× (legacy wins) |
| 50 | 8.52 ms | 10.82 ms | 1.27× (legacy wins) |
| 200 | 47.59 ms | 39.61 ms | 0.83× (SWC wins) |
| 500 | 177.74 ms | 94.21 ms | **0.53× (SWC 1.89× faster)** |

**Crossover at ~100–200 files.** Below 100 files, the SWC startup cost (loading `@swc/core`, parsing the file into a real AST) dominates. Above 200 files, the SWC AST traversal is significantly faster than the hand-rolled scanner.

Default mode is `auto` — the file count is checked at runtime and the appropriate extractor is selected. Override with `--parser=swc` or `--parser=legacy` to force one.

## CSS bundle size

| Files (each with 5 styles) | Atomic rules emitted | CSS size |
|---|---|---|
| 100 | 412 | 28 KB |
| 1,000 | 1,247 | 72 KB |
| 5,000 | 1,681 | 95 KB |
| 50,000 | 1,894 | 105 KB |

The CSS file grows logarithmically. Real apps converge on a small vocabulary of CSS values (6–10 colors, 6–10 spacing units, 4–5 font sizes, etc.), so a 50,000-file project produces only marginally more CSS than a 5,000-file one.

## HTML payload

Atomic CSS trades CSS size for HTML size. A button with 10 styled properties has 10 classes (≈ 100 bytes of HTML). For 1,000 styled elements: ~100 KB of additional HTML.

But:

- HTML compresses extremely well (gzip on a 10-class list ≈ 30 bytes per element).
- You're trading HTML size (paid once per request) for CSS size (paid once per session, cached).
- Total transfer for a typical SSR'd page is **smaller** with atomic CSS than with per-component stylesheets.

## Runtime cost

The runtime bundle is ~2 KB minified+gzipped. At runtime, the entire library does these things:

- `tl.create(map)`: hash strings if the compiler didn't transform; otherwise it's already a literal object — zero work.
- `tl.merge(...)`: split inputs by whitespace, look up each class in `__TRACELESS_STYLE_META__`, dedupe by property key.
- `tl.cx(...)`: filter falsy, join with space.
- `tl.extend({...})`: register variants in a module-level map.

There is **no DOM mutation**, **no style-element insertion**, **no cache lookup against the server's atomic registry**. The runtime is functional code over strings.

## Memory

`globalRegistry` and `tokenRegistry` together use ~50 KB of heap for a 5,000-file project (one entry per atomic rule). They're cleared at the start of every full extraction run.

The webpack/Next.js plugin keeps the registries in memory during dev-server sessions for incremental rebuilds; this scales linearly with the number of unique rules.

## Caching

The file-level cache (`.traceless-style/cache.json`) is keyed by SHA-256 of the source. On a clean `npm run build`:

- First run: full extraction (~95 ms for 5,000 files with SWC).
- Subsequent runs with no changes: ~5 ms (just SHA-256 + cache hit).
- Subsequent runs with one file changed: ~1 ms per cached file + full Pass 2 on the changed one (~5 ms).

Files that use side-effecting APIs (`tl.keyframes`, `tl.defineTokens`, `tl.createTheme`) are excluded from caching — they always re-run.

## Hash collision rate

The 8-char base36 FNV-1a hash space is 36⁸ ≈ 2.8 × 10¹². Empirical results from `bench/hash-collision.mjs`:

| Inputs | Collisions observed |
|---|---|
| 100,000 | 0 |
| 1,000,000 | 0 |
| 1,500,000 | <50% probability |

For projects with fewer than 1M unique `(property, value, selector)` triplets (i.e. essentially every project), collisions are vanishingly rare.

## See also

- [Hash function](./hashing.md)
- `bench/RESULTS.md` for raw benchmark numbers.
- [The compiler](../learn/11-the-compiler.md)
