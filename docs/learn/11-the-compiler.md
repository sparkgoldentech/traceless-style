# The compiler

This page describes how the build-time transform works. You don't need to read it to use the library, but understanding the pipeline makes debugging easier and explains the surprising parts (why variables are rejected, why custom variants don't need a config file, why server components produce identical class names).

## High-level pipeline

```
                 ┌──────────────────────────────┐
   *.tsx files → │ Pass 0: scan defineTokens    │ — populates tokenExportRegistry
                 │           exports per file   │
                 ├──────────────────────────────┤
                 │ Pass 1: extract custom       │ — scans tl.extend({ variants: ... })
                 │           variants from src  │   merges into one registry
                 ├──────────────────────────────┤
                 │ Pass 2: transform tl.create  │ — for every file:
                 │           with full variant  │   • lint
                 │           map               │   • parse imports → resolve tokens
                 │                              │   • parse arg literal (strict AST)
                 │                              │   • walk style tree
                 │                              │   • emit atomic rules
                 │                              │   • rewrite call site
                 ├──────────────────────────────┤
                 │ generateCSS                  │ — render rules to a CSS file
                 ├──────────────────────────────┤
                 │ injectMeta                   │ — emit __TRACELESS_STYLE_META__
                 │           via DefinePlugin   │   for runtime tl.merge
                 └──────────────────────────────┘
```

## Two parsers behind the same interface

There are **two interchangeable extractors**:

| Parser | File | Used when |
|---|---|---|
| **legacy** | `src/compiler/extractor.ts` + `src/compiler/ast-parser.ts` | Auto mode below 100 files, explicit `parser: "legacy"`, or fallback when `@swc/core` failed to install. Hand-rolled scanner. Zero native deps. |
| **swc** | `src/compiler/extractor-swc.ts` | Auto mode at or above 100 files (and `@swc/core` resolves), or explicit `parser: "swc"`. Real JS/TS AST via `@swc/core`. Stricter validation. Reports real `line:col` on errors. |

Both expose the **same interface** (`transform(src, file, customVariants)` and `extractCustomVariants(src, file)`), so the rest of the pipeline doesn't care which one ran.

The SWC extractor is constructed by a factory (`createSwcExtractor(deps)`) that takes `processStyles`, `globalRegistry`, `mergeVariants`, and `DEFAULT_VARIANTS` from the legacy module — this guarantees that **both extractors register rules into the same singleton registry**, so the rest of the pipeline reads from one source of truth.

`@swc/core` is in `optionalDependencies`. The SWC extractor is loaded via an **indirect dynamic import** (`new Function("s","return import(s)")`) so esbuild/tsup can't follow it at build time, and so users on the legacy path never resolve `@swc/core` at all.

### Performance crossover

Measured on the sibling `traceless-style-test` workload:

| Files | legacy median | swc median | swc/legacy |
|---|---|---|---|
| 10 | 2.70ms | 3.04ms | 1.13× (legacy wins) |
| 50 | 8.52ms | 10.82ms | 1.27× (legacy wins) |
| 200 | 47.59ms | 39.61ms | 0.83× (SWC wins) |
| 500 | 177.74ms | 94.21ms | **0.53× (SWC 1.89× faster)** |

Crossover at ~100–200 files. The `auto` mode counts files via `walkDir` and routes accordingly. Set `TRACELESS_STYLE_PARSER=swc` to force SWC, or `--parser=swc` on the CLI.

## What gets compiled

Every `tl.create({...})`, `tl.extend({...})`, `tl.defineTokens({...})`, `tl.createTheme(...)`, and `tl.keyframes(...)` call is detected.

For `tl.create`:

1. **Locate** the call. Both extractors handle nested function calls and skip strings/comments.
2. **Preprocess**: replace `tl.cssVar("name")` with the literal `"var(--tl-<hash>)"` so the strict literal-only AST parser accepts the result.
3. **Token member access expansion**: rewrite `<localImportName>.<key>.<key>` to the literal `var(--tl-<hash>)` for the leaf — but only inside the `tl.create` argument body, never globally. This keeps locals named `tokens` (e.g. function parameters) safe.
4. **Parse** the argument with the strict literal-only AST parser. Variables/calls/templates → ParseError.
5. **Walk** the style tree. For each leaf (`property: value`):
   - Validate the property against the allowlist (`isKnownProperty`).
   - Validate the value (no `;`, `}`, `<`, `>`, `</`, `*/`, `\\`, no invisible/bidi Unicode, no ASCII control chars).
   - Apply auto-RTL rewriting (unless `_autoRtl: false`).
   - Hash with `fnv32a((property + ":" + value + (selector ? ":" + selector : ""))` → 8-char base36.
   - Register the rule: `tl<hash> { property: value; }` (with selector wrapping).
   - Apply auto-dark rewriting (derive a paired `:is(.dark *)` rule).
6. **Replace** the call site with the literal object.
7. **Validate** WCAG contrast for color/background pairs (warning by default; configurable to error).

## The hash duplication invariant

The 8-char base36 FNV-1a → class name hash is implemented in **three places**:

| File | Used by |
|---|---|
| `src/compiler/hash.ts` | Build-time extractor, `processStyles` |
| `src/runtime/index.ts` | Runtime fallback `tl.create` |
| `src/compiler/tokens.ts` | Token / theme / keyframe naming |

These three implementations **must stay byte-for-byte identical**, including the built-in variant selector strings. Any divergence means runtime fallback produces different class names than the compiled CSS — broken styles, no error.

The hash combines two 32-bit FNV-1a runs (different primes) into a 64-bit number via BigInt, then takes mod 36^8 and pads to exactly 8 chars. This gives a collision rate <50% at 1.5M rules (birthday paradox).

The runtime↔compiler invariant is pinned by `test/hash.test.ts`, `test/tokens.test.ts`, and `test/extractor-swc.test.ts`.

## SWC span gotchas

When working on `extractor-swc.ts`:

1. **Spans are UTF-8 byte offsets, not char offsets.** Em-dashes/emojis in comments shift everything. Convert via `byteToChar()` before slicing.
2. **Spans index a CRLF-normalized buffer.** SWC silently rewrites `\r\n` → `\n` before parsing. Normalize on input and splice into the normalized source — `transform()` returns LF-only output even for CRLF input.
3. **`module.span.start` is the start of the first non-comment statement, not the start of the source.** The correct per-source baseline is `module.span.end - byteLength(src)`. Don't use `module.span.start` as a baseline; you'll be off by the size of any leading JSDoc.

## Singleton registry

`globalRegistry` (in `extractor.ts`) is a module-level singleton that accumulates atomic rules across an extraction run. It is **shared by both extractors** (via the SWC factory pattern).

`extract-fn.ts` calls `globalRegistry.clear()` at the start of every full extraction run to avoid stale rules accumulating across runs (notably during webpack rebuilds).

If you write a new entrypoint that bypasses `extract-fn`, clear the registry yourself.

## File-level caching

`src/cli/file-cache.ts` (`FileCache`) caches per-file extraction results keyed by a SHA-256 of the source text. The cache stores:

- `inputHash` — content hash (cache key)
- `rules` — atomic rules emitted by this file
- `customVars` — custom variants discovered (Pass 1)
- `exportedTokens` — token shapes exported by this file

Files that use **side-effecting APIs** (`tl.keyframes`, `tl.defineTokens`, `tl.createTheme`) are excluded from the cache because their effects depend on registry state.

The cache version is bumped (`v3-keyframe-bindings`) when the cache shape changes, invalidating all entries.

## Defense-in-depth value validation

`isValidRule()` in `src/compiler/css-gen.ts` rejects:

- **CSS-injection sequences**: `;`, `}`, `<`, `>`, `</`, `*/`, `\\`. Even though the AST parser already rejects non-literal expressions, this is defense-in-depth — a future parser bug becomes a contained failure rather than a CSS-rule-escape exfil.
- **Invisible / bidi Unicode**: ZWSP, ZWNJ, ZWJ, LRM, RLM, LRE/RLE/PDF/LRO/RLO, LRI/RLI/FSI/PDI, BOM. Standard homoglyph/exfil mitigations.
- **ASCII control chars**: 0x00–0x1F (except `\t`/`\n`/`\r`), plus DEL.

These checks run on every value before the rule is registered. See [Defense-in-depth value validation](../reference/value-validation.md).

## Property allowlist

`isKnownProperty(prop)` from `src/compiler/css-properties.ts`. Curated from `src/types/css.ts` (~250 standard properties) plus:

- CSS variables: `--foo`, `--my-var-2`
- Vendor prefixes (camelCase or kebab): `webkitTransform`, `-moz-appearance`, `mozAppearance`, `-ms-overflow-style`

Anything else triggers a build error with a Levenshtein-suggested replacement.

## Source-comment annotations (dev mode)

When `dev: true` (or `--dev` on the CLI), every atomic rule is annotated with its origin file + source key:

```css
/* app/Button.tsx  display */
.tlxxxxxxxx {
  display: flex;
}
```

The origin string is sanitized (`*/` → `*​/` with a zero-width space) so a malicious or careless source path can't break out of the surrounding block comment. Origin tracking is in `src/compiler/css-gen.ts` `AtomicRule.origin`.

## Source maps

`src/compiler/sourcemap.ts` builds a v3 source map for the generated CSS, mapping every rule back to its source file (and line, if available). The `.map` sidecar is emitted alongside `traceless-style.css` and a `sourceMappingURL=` comment is appended to the CSS.

DevTools can then highlight the exact source line that produced a given style. Synthesized rules without origin (baseline, keyframes from string literals) are skipped.

## Strict literal-only AST parser

The legacy parser (`src/compiler/ast-parser.ts`) is a hand-rolled lexer/parser specifically for `tl.create({...})` argument literals. It accepts:

- Object literals: `{ key: ... }`
- String literals: `"value"` or `'value'`
- Number literals: `42`, `1.5`
- Boolean literals (only for `_auto*` control keys)
- Nested objects: `{ a: { b: ... } }`

It **rejects**:

- Variables: `{ color: myColor }`
- Function calls: `{ color: getColor() }`
- Template literals: `` { color: `${a}${b}` } ``
- Array spreads: `{ ...rest }`
- Computed keys: `{ [k]: v }`

The reason: deterministic compilation requires every value to be statically knowable. If you need dynamic values, use [tokens](./06-tokens-and-themes.md).

The SWC extractor enforces the same restrictions but reports proper `line:col` errors via the SWC AST.

## Why no Babel plugin

A Babel plugin would add ~80 ms per file at typical project sizes. The hand-rolled scanner skips strings/comments via a small state machine; the SWC extractor uses a real AST when projects are large enough that the SWC startup cost amortizes. Both avoid the Babel pipeline entirely — and avoid forcing every consumer to wire up `@babel/core`.

The trade-off: Babel-style transforms (e.g. JSX inside `tl.create` arguments) aren't supported. But `tl.create` arguments are *meant* to be plain literal style objects, so this isn't a real limitation.

Continue to [12. Linting](./12-linting.md).
