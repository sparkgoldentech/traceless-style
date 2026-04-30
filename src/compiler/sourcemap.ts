/**
 * traceless-style — compiler/sourcemap.ts
 *
 * Generates a v3 source map for the emitted atomic CSS file. DevTools
 * (Chromium-based browsers + Firefox) reads this map and shows the source
 * file/line for each `.tlXXXXXX` rule when you inspect an element —
 * instead of the cryptic generated class, you see `app/Button.tsx:14`.
 *
 * Implementation notes:
 *   - We emit a separate sidecar file `traceless-style.css.map` and append
 *     `/*# sourceMappingURL=... *​/` to the CSS, which is the format
 *     DevTools expects for split source maps.
 *   - VLQ encoding follows the canonical source-map spec
 *     (https://tc39.es/source-map/) using a hand-rolled base64-VLQ encoder
 *     to avoid pulling in the `source-map` runtime dependency.
 *   - Mappings are per-rule, not per-declaration. A minified one-line CSS
 *     output gets one mapping per `.tlXXXXXX{...}` segment, pointing back
 *     to the originating file/line tracked in `AtomicRule.origin`.
 *   - Rules without an `origin` (theme/keyframe/baseline rules synthesized
 *     internally) are skipped — they have no sensible source location.
 */

import type { AtomicRule } from "./css-gen";

/* ── base64-VLQ encoder ─────────────────────────────────────────── */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const VLQ_BASE_SHIFT       = 5;
const VLQ_BASE             = 1 << VLQ_BASE_SHIFT;        // 32
const VLQ_BASE_MASK        = VLQ_BASE - 1;               // 31
const VLQ_CONTINUATION_BIT = VLQ_BASE;                   // 32

/** Encode a signed integer as a base64-VLQ string. */
function encodeVlq(n: number): string {
  // Sign bit: low bit of the absolute value.
  let vlq = n < 0 ? ((-n) << 1) | 1 : (n << 1);
  let out = "";
  do {
    let digit = vlq & VLQ_BASE_MASK;
    vlq >>>= VLQ_BASE_SHIFT;
    if (vlq > 0) digit |= VLQ_CONTINUATION_BIT;
    out += B64[digit];
  } while (vlq > 0);
  return out;
}

/* ── public API ─────────────────────────────────────────────────── */

export interface SourceMapResult {
  /** The serialized JSON source map (string). Write to `<outCSS>.map`. */
  map: string;
  /** Comment to append to the CSS file pointing at the map. */
  comment: string;
}

/**
 * Build a source map for a minified CSS output produced by `generateCSS()`.
 *
 * `rules` MUST be the same array (same order) that `generateCSS` consumed.
 * We re-walk it, computing each segment's start column in the generated
 * line, and emit one mapping per rule. `cssOutput` is the minified CSS
 * string so we can size each segment correctly.
 *
 * The map is anchored to the segment's source position via `origin.file`
 * (relative to `rootDir`) and `origin.line` (1-based). When a rule lacks
 * `origin`, no mapping is emitted for it — DevTools will simply not link
 * that fragment, which is the correct fallback.
 */
export function buildCssSourceMap(
  rules:    AtomicRule[],
  cssOutput: string,
  opts: {
    rootDir:       string;
    /** Output filename (basename only) used in the `file` field. */
    fileName?:     string;
    /** sourceRoot to prepend to every source path. Default: empty. */
    sourceRoot?:   string;
  }
): SourceMapResult {
  const { rootDir, fileName = "traceless-style.css", sourceRoot = "" } = opts;

  // Sort rules the same way generateCSS does (stable by order field) so
  // our walk lines up with the actual byte layout of `cssOutput`.
  const sorted = [...rules].sort((a, b) => a.order - b.order);

  // Build the mappings string. We re-derive each rule's serialized form so
  // we know where in `cssOutput` it starts. We don't trust string-search
  // alone (rule text can repeat) — instead we walk forward and consume.
  const sources:    string[] = [];
  const sourceIdx = new Map<string, number>();
  const segments:   string[] = [];

  // VLQ deltas — these accumulate across segments as required by the spec.
  let prevGenCol = 0;
  let prevSrc    = 0;
  let prevSrcLn  = 0;
  let prevSrcCol = 0;

  // Walk pointer in cssOutput; we advance it by the length of each rule's
  // serialized form so the mapping columns line up.
  let cursor = 0;

  // Skip past the prefix written by extract-fn (BASELINE_CSS + tokens +
  // themes + keyframes). That prefix has no `origin`, so no mappings; we
  // need to advance the cursor over it. We detect the prefix length by
  // searching for the first `.tl` class token followed by `{`.
  const firstAtomicMatch = cssOutput.search(/\.tl[a-z0-9]+\{/);
  if (firstAtomicMatch > 0) cursor = firstAtomicMatch;

  for (const r of sorted) {
    const ruleCss = serializeRule(r);
    if (!ruleCss) continue;

    // Sync cursor to the start of this rule in cssOutput. Most of the
    // time the cursor is already at the correct position; we re-find
    // defensively to stay resilient to whitespace or filtering surprises.
    const at = cssOutput.indexOf(ruleCss, cursor);
    if (at < 0) {
      // Rule wasn't actually emitted (likely filtered by isValidRule).
      continue;
    }
    cursor = at + ruleCss.length;

    if (!r.origin) continue;
    const file = relPath(rootDir, r.origin.file);
    let   sIdx = sourceIdx.get(file);
    if (sIdx === undefined) {
      sIdx = sources.length;
      sourceIdx.set(file, sIdx);
      sources.push(file);
    }

    const genCol = at;                        // generated column
    const srcLn  = Math.max(0, (r.origin.line ?? 1) - 1);  // 0-based source line
    const srcCol = 0;                         // we don't track within-line column

    // VLQ-encoded segment: 4 fields (genCol, srcIdx, srcLn, srcCol),
    // each as a delta from the previous segment.
    const seg = encodeVlq(genCol - prevGenCol)
              + encodeVlq(sIdx   - prevSrc)
              + encodeVlq(srcLn  - prevSrcLn)
              + encodeVlq(srcCol - prevSrcCol);
    segments.push(seg);

    prevGenCol = genCol;
    prevSrc    = sIdx;
    prevSrcLn  = srcLn;
    prevSrcCol = srcCol;
  }

  // generateCSS produces a single line, so all segments live on line 0.
  const mappings = segments.join(",");

  const map = JSON.stringify({
    version:    3,
    file:       fileName,
    sourceRoot,
    sources,
    names:      [],
    mappings,
  });

  const comment = `\n/*# sourceMappingURL=${fileName}.map */`;
  return { map, comment };
}

/* ── helpers ───────────────────────────────────────────────────── */

function serializeRule(r: AtomicRule): string {
  const d = `${r.prop}:${r.value}`;
  if (!r.selector)                return `.${r.cls}{${d}}`;
  if (r.selector.startsWith("@")) return `${r.selector}{.${r.cls}{${d}}}`;
  if (r.selector.includes("&"))   return `${r.selector.replace(/&/g, `.${r.cls}`)}{${d}}`;
  return `.${r.cls}${r.selector}{${d}}`;
}

function relPath(rootDir: string, file: string): string {
  // Use forward slashes for cross-platform map portability. DevTools
  // compares these against requested URLs, which always use `/`.
  let rel = file;
  if (file.startsWith(rootDir)) rel = file.slice(rootDir.length);
  rel = rel.replace(/\\/g, "/");
  if (rel.startsWith("/")) rel = rel.slice(1);
  return rel;
}
