/**
 * traceless-style — compiler/hash.ts
 *
 * 8-character base36 hash for atomic class names. The output namespace
 * is 36^8 ≈ 2.8 trillion — large enough that a project with 1.5 million
 * unique atomic rules has a < 50% chance of any collision (birthday
 * paradox). The previous 6-character version saturated at ~45,000 rules,
 * which became real risk at FB/X scale.
 *
 * Algorithm: two parallel 32-bit FNV-1a hashes with different seeds and
 * different prime multipliers, then combined via BigInt into a single
 * 64-bit value reduced modulo 36^8 and base36-encoded with leading-zero
 * padding so output is ALWAYS exactly 8 characters.
 *
 * Why two parallel hashes instead of one 64-bit FNV: JavaScript's
 * `Math.imul` is 32-bit and ~10x faster than BigInt arithmetic. Two
 * 32-bit hashes give 64 bits of entropy at near-32-bit cost. The runtime
 * mirror (src/runtime/index.ts) uses the same algorithm so compile-time
 * and runtime class names agree byte-for-byte.
 *
 * Stability: the algorithm is deterministic across Node versions and
 * platforms — `Math.imul` and `BigInt % BigInt` are spec-defined to
 * produce the same value everywhere.
 */

const HASH_BITS    = 8;
const HASH_SPACE   = 36n ** BigInt(HASH_BITS);   // 36^8

const SEED_A       = 0x811c9dc5; // FNV-1a 32-bit standard offset basis
const SEED_B       = 0x84222325; // upper half of the FNV-1a 64-bit basis
const PRIME_A      = 0x01000193; // FNV-1a 32-bit prime
const PRIME_B      = 0x05f5e101; // a different odd prime for hash B's mixing

export function fnv32a(str: string): string {
  let a = SEED_A >>> 0;
  let b = SEED_B >>> 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    a = Math.imul(a ^ c, PRIME_A) >>> 0;
    b = Math.imul(b ^ c, PRIME_B) >>> 0;
  }
  // Combine both 32-bit halves into one 64-bit number, reduce to the
  // 8-char namespace, encode base36 with leading-zero padding.
  const combined = ((BigInt(a) << 32n) | BigInt(b)) % HASH_SPACE;
  return combined.toString(36).padStart(HASH_BITS, "0");
}

export function toKebab(prop: string): string {
  return prop
    .replace(/([A-Z])/g, m => `-${m.toLowerCase()}`)
    .replace(/^(webkit|moz|ms)/, "-$1");
}

export function classFor(prop: string, value: string, selector?: string): string {
  const key = selector ? `${prop}:${value}:${selector}` : `${prop}:${value}`;
  return `tl${fnv32a(key)}`;
}
