# Hash function & determinism guarantee

Class names produced by `tl.create` come from a hash function with three properties:

1. **Deterministic** — same input string produces the same 8-character base36 output, byte for byte, on every Node version, every OS, and at runtime.
2. **Identical between compiler and runtime** — `src/compiler/hash.ts` and `src/runtime/index.ts` (`_fnv32a`) implement the same function. Token / theme / keyframe hashing in `src/compiler/tokens.ts` is the third copy.
3. **Low collision rate** — <50% probability of any collision at 1.5M rules (birthday-paradox bound).

## Definition

```ts
// src/compiler/hash.ts and src/runtime/index.ts (must match byte-for-byte)
const _H8_SPACE = 36n ** 8n;

function fnv32a(str: string): string {
  let a = 0x811c9dc5 >>> 0;
  let b = 0x84222325 >>> 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x05f5e101) >>> 0;
  }
  const combined = ((BigInt(a) << 32n) | BigInt(b)) % _H8_SPACE;
  return combined.toString(36).padStart(8, "0");
}
```

Two parallel 32-bit FNV-1a streams (different primes: `0x01000193` and `0x05f5e101`), combined to 64 bits via `BigInt`, reduced mod 36⁸, padded to exactly 8 chars.

## Class-name composition

```ts
function classFor(prop: string, value: string, selector?: string): string {
  return `tl${fnv32a(selector ? `${prop}:${value}:${selector}` : `${prop}:${value}`)}`;
}
```

So `classFor("color", "red")` = `tl<hash("color:red")>`, and `classFor("color", "red", ":hover")` = `tl<hash("color:red::hover")>`. The selector string includes the **exact** selector as written in the variant registry — `_hover` always means `":hover"`, both at compile time and runtime.

## Why two parallel hashes?

A single 32-bit FNV-1a produces ~4.3B values. The birthday-paradox 50% collision threshold is at √(2 × 4.3B) ≈ 65,500 keys — uncomfortably close to a large project's CSS scale.

Combining two 32-bit hashes with different primes into a 64-bit value gives 1.8 × 10¹⁹ values, with 50% threshold at √(2 × 1.8 × 10¹⁹) ≈ 6 × 10⁹ keys. After mod 36⁸ ≈ 2.8 × 10¹², the threshold drops to ~2.4 × 10⁶ — well above any realistic project. The benchmark in `bench/hash-collision.mjs` empirically confirms <50% collision rate at 1.5M unique inputs.

## Why `Math.imul`?

JavaScript multiplication is double-precision float. `0x811c9dc5 * 0x01000193` overflows 53-bit precision and produces wrong results. `Math.imul(a, b)` is "32-bit signed multiplication, low 32 bits" — defined exactly. Without it, the hash diverges between V8 and JavaScriptCore.

## Why base36?

- Case-insensitive (CSS class names are case-sensitive in HTML, but we don't want collisions on `tlA0` vs `tla0` if a future CSS feature flag normalizes case).
- Compact: 36⁸ = 2.8 × 10¹² possible values in 8 chars (vs 16⁸ = 4.3 × 10⁹ for hex).
- All characters are valid CSS identifier characters.

## Why padStart to 8?

Without padding, `(combined % 36⁸).toString(36)` produces a variable-length string (1–8 chars). Two distinct inputs that differ only in leading zeros would collide. `padStart(8, "0")` makes every output exactly 8 chars.

## Test invariants

Pinned by:

- `test/hash.test.ts` — basic determinism and length.
- `test/tokens.test.ts` — token name parity between compiler and runtime.
- `test/extractor-swc.test.ts` — SWC ↔ legacy parity (both produce identical class names for identical input).

If any of these fail, the runtime fallback will produce different class names than the compiler emitted — broken styles, no error. **Do not modify the hash or any built-in variant selector string without updating all three locations and re-running these tests.**

## Practical implications

- **Stable across builds** — the same source file produces the same class names today, tomorrow, and after a clean install.
- **Stable across runtimes** — Node 18 / 20 / 22, browser V8 / SpiderMonkey / JavaScriptCore all produce identical hashes.
- **Stable across server/client** — server-rendered HTML and client-rendered HTML use the same class names. No hydration mismatch from CSS.

## Hash visualization (for debugging)

```ts
import { fnv32a } from "traceless-style/compiler/hash";

console.log(fnv32a("color:red"));               // "<8-char string>"
console.log(`tl${fnv32a("color:red")}`);        // → tl<...>
console.log(`tl${fnv32a("color:red::hover")}`); // → tl<...>  (different)
```

If you want to confirm a class name corresponds to an expected `(prop, value, selector)` triplet without grepping the CSS file, this is the recipe.
