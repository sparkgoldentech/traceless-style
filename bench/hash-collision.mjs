/**
 * Hash collision benchmark.
 *
 * Generates N unique (prop, value, selector) tuples, hashes each via the
 * same algorithm the compiler uses (FNV-1a parallel + BigInt mod 36^8),
 * and counts collisions. Birthday-paradox math: at N rules in a namespace
 * of size 36^8 ≈ 2.82 × 10^12, the expected pairwise collision count is
 * N²/(2 × 36^8). We measure observed vs. expected to validate the hash
 * function actually distributes uniformly across the namespace.
 *
 * Standalone (no library deps) so we can reproduce the exact compile-time
 * hash without bundling traceless-style itself. The algorithm is the
 * same one in src/compiler/hash.ts — keep them byte-identical or this
 * benchmark stops measuring reality.
 */

const HASH_SPACE = 36n ** 8n;

function fnv32a(str) {
  let a = 0x811c9dc5 >>> 0;
  let b = 0x84222325 >>> 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x05f5e101) >>> 0;
  }
  const combined = ((BigInt(a) << 32n) | BigInt(b)) % HASH_SPACE;
  return combined.toString(36).padStart(8, "0");
}

const SCALES = [
  { N: 100_000,    label: "100K" },
  { N: 1_000_000,  label: "1M"   },
  { N: 5_000_000,  label: "5M"   },
];

const PROPS = [
  "color", "background-color", "padding", "margin", "font-size", "border-radius",
  "display", "position", "opacity", "z-index", "width", "height",
];
const SELECTORS = [
  null, ":hover", ":focus", ":is(.dark *)", "@media (min-width:640px)",
];

export function runHashCollisionBenchmark() {
  const results = [];
  for (const { N, label } of SCALES) {
    const seen = new Set();
    let collisions = 0;

    const t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      // Build a unique input every iteration.
      const prop = PROPS[i % PROPS.length];
      const value = `${i}px`;          // unique per i
      const sel = SELECTORS[i % SELECTORS.length];
      const key = sel ? `${prop}:${value}:${sel}` : `${prop}:${value}`;
      const hash = fnv32a(key);
      if (seen.has(hash)) collisions++;
      else seen.add(hash);
    }
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

    const expected = (N * N) / (2 * Number(HASH_SPACE));
    results.push({
      scale:        label,
      n:            N,
      uniqueHashes: seen.size,
      collisions,
      expected:     expected.toFixed(4),
      collisionRatePct: ((collisions / N) * 100).toFixed(6),
      elapsedMs:    elapsedMs.toFixed(0),
      hashRate:     `${(N / (elapsedMs / 1000) / 1e6).toFixed(2)}M hashes/sec`,
    });
  }
  return results;
}

// Always run when invoked directly (cross-platform path comparison is
// unreliable across `file:///` URL forms on Windows).
const invokedDirectly =
  process.argv[1] && process.argv[1].endsWith("hash-collision.mjs");
if (invokedDirectly) {
  console.log("Hash collision benchmark (8-char base36)\n");
  const results = runHashCollisionBenchmark();
  console.table(results);
}
