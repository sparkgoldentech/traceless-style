# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run build` — multi-entry tsup build, then strips the shebang line from `dist/cli/extract.mjs` (the ESM CLI gets a duplicated shebang from the esbuild banner; the post-build node script removes it). Use this whenever publishing or testing consumer wiring.
- `npm run dev` — `tsup --watch` for all entries.
- `npm test` — runs `vitest run`. Tests live in `test/**/*.test.ts`. Current coverage: `test/hash.test.ts` (FNV-1a hash + kebab + classFor), `test/extractor-swc.test.ts` (SWC↔legacy equivalence + safety), `test/strict-defaults.test.ts` (lint defaults + injection guards + property allowlist), `test/tokens.test.ts` (defineTokens / createTheme / cssVar + Vite plugin smoke), `test/keyframes-and-devtools.test.ts` (tl.keyframes + source comments). 85 tests total. For watch mode, run `npx vitest` directly.
- `traceless-style audit` — repo-wide stats: file count, atomic rules, tokens/themes/keyframes, dedup ratio, top selectors, custom variants. Useful in CI to catch CSS-size regressions.
- `traceless-style inspect <file>` — describe one file's traceless-style usage: every atomic rule grouped by source key, plus tokens/themes/keyframes registered process-wide.
- `TRACELESS_STYLE_PARSER=swc npm run dev` — opt into the SWC-backed extractor for a build. Same effect as `--parser=swc` on the CLI, or `extract({ parser: "swc" })` programmatically.
- `node setup-traceless-style.mjs` — **destructive scaffolder**. It rewrites the entire `src/` tree from inline string literals. Treat it as a one-shot bootstrap: editing source files and then re-running this script overwrites your changes. Prefer editing `src/**` directly and leave the scaffolder alone unless intentionally regenerating.

There is no separate lint or typecheck script — `tsc` runs implicitly via tsup's `dts: true`. The "lint" inside this codebase (`src/compiler/lint.ts`) is the *consumer-facing* lint that runs against user JSX during `traceless-style extract`, not internal source linting.

## Architecture

traceless-style is a **zero-runtime, build-time atomic CSS** library. `tl.create({...})` calls in user code are statically transformed into plain class-name strings at compile time, and the corresponding atomic CSS is emitted to `public/traceless-style.css`. There is no styled-components-style runtime style injection.

### Two parsers behind the same interface

There are **two interchangeable extractors**, both exposing `transform(src, file, customVariants?)` and `extractCustomVariants(src, file)`. Default is `parser: "auto"` — file-count-based selection with SWC fallback:

| Parser | File | Used when |
|---|---|---|
| **legacy** | `src/compiler/extractor.ts` + `src/compiler/ast-parser.ts` | `auto` mode below `AUTO_SWC_THRESHOLD` (100) files; explicit `parser: "legacy"`; or fallback when SWC requested but `@swc/core` failed to install. Hand-rolled scanner. Zero native deps. |
| **swc** | `src/compiler/extractor-swc.ts` | `auto` mode at or above the threshold (and `@swc/core` resolves); explicit `parser: "swc"`. Uses `@swc/core` for a real JS/TS AST. Stricter validation. Reports real `line:col` on errors. |
| **auto** (default) | — | Counts files via `walkDir`, then routes. The decision deferred until after the file walk in `extract-fn.ts`. |

The SWC extractor is a **factory** (`createSwcExtractor(deps)`) that takes `processStyles`, `globalRegistry`, `mergeVariants`, and `DEFAULT_VARIANTS` from the caller. This is critical — it means `extractor-swc` has zero runtime imports of `./extractor` or `./variants`, and the singleton `globalRegistry` is *literally the same object* the rest of the pipeline reads from. Without this, the legacy and SWC paths would have separate registries and rules registered by SWC would be invisible to the rest of `extract-fn`.

Equivalence is verified by `test/extractor-swc.test.ts` (45 tests including a CRLF + non-ASCII regression fixture).

`@swc/core` is in `optionalDependencies`. The SWC extractor is loaded via an **indirect dynamic import** (`new Function("s","return import(s)")`) in `src/cli/extract-fn.ts` so esbuild/tsup can't follow it at build time, and so users on the legacy path never resolve `@swc/core` at all.

#### SWC span gotchas (load-bearing knowledge)

`extractor-swc.ts` had two real-world bugs in early versions that silently dropped half the rules. Both are now fixed and pinned by tests, but anyone touching span-handling needs to know:

1. **Spans are UTF-8 byte offsets, not char offsets.** Em-dashes/emojis in comments shift everything. We convert via `byteToChar()` before slicing.
2. **Spans index a CRLF-normalized buffer.** SWC silently rewrites `\r\n` → `\n` before parsing. We normalize on input and splice into the normalized source — `transform()` returns LF-only output even for CRLF input.
3. **`module.span.start` is the start of the first non-comment statement, not the start of the source.** The correct per-source baseline is `module.span.end - byteLength(src)` because `end` is always `globalBytesBefore + sourceBytes + 1`. Don't use `module.span.start` as a baseline; you'll be off by the size of any leading JSDoc.

#### Empirical perf (one workload)

Measured on the sibling `traceless-style-test` project with the bench at `traceless-style-test/bench-scale.mjs`:

| Files | legacy median | swc median | swc/legacy |
|---|---|---|---|
| 10 | 2.70ms | 3.04ms | 1.13× (legacy wins) |
| 50 | 8.52ms | 10.82ms | 1.27× (legacy wins) |
| 200 | 47.59ms | 39.61ms | 0.83× (SWC wins) |
| 500 | 177.74ms | 94.21ms | **0.53× (SWC 1.89× faster)** |

Crossover at ~100–200 files. Default stays `legacy` because most projects are below the crossover; opt into `swc` for large codebases.

### Compilation pipeline (single source file)

`src/compiler/ast-parser.ts` → `src/compiler/extractor.ts` → `src/compiler/css-gen.ts`

1. **`ast-parser.ts`** — hand-rolled lexer/parser for `tl.create({...})` argument objects. **Deliberately not** a full JS AST — it only understands literal style objects (string/number/nested-object). Variables in style objects are rejected with a parse error. This is the "Safe AST parser" the README markets.
2. **`extractor.ts`** — given source, finds `tl.create(...)` and `tl.extend(...)` calls via `findNamedCalls` (a custom scanner that skips strings, template literals, and comments — not regex), parses each argument with `parseStyleObject`, walks the style tree, and registers atomic rules into a **module-level singleton** `globalRegistry`. Then it textually replaces the original `tl.create(...)` call with the resolved `{ key: "tlXXXXXX tlYYYYYY" }` object literal.
3. **`css-gen.ts`** — turns registered rules into CSS. Also produces a `meta` map (`{ class → "prop" | "prop:selector" }`) used at runtime by `tl.merge()` for conflict resolution.

`globalRegistry` (in `extractor.ts`) is a process-wide singleton. **`extract-fn.ts` calls `globalRegistry.clear()` at the start of every full extraction run** to avoid stale rules accumulating across runs (notably during webpack rebuilds).

### Two-pass extraction

`src/cli/extract-fn.ts` runs:
- **Pass 1**: scan every file, collect `tl.extend({ variants: {...} })` definitions → merge into a single custom variant map.
- **Pass 2**: scan every file again with the full variant map; transform `tl.create(...)` calls.

This is why no config file is needed for custom variants — they're discovered from source. Built-in variants live in `src/compiler/variants.ts` (`BUILT_IN_VARIANTS`); `mergeVariants()` validates and merges custom ones on top.

### Hash duplication invariant (critical)

The FNV-1a → base36 → 6-char class-name hash (`tlXXXXXX`) is implemented **twice**:
- `src/compiler/hash.ts` — used by the build-time extractor.
- `src/runtime/index.ts` (`_fnv32a`, `_classFor`, `_BUILT_IN`) — used by `tl.create()` at runtime as a fallback when the webpack transform didn't run (Server Components, Jest, dev without bundler).

**These two implementations must stay byte-for-byte identical**, including the built-in variant selector strings. Any change to one requires the same change to the other, otherwise the runtime fallback produces different class names than the compiled CSS — broken styles, no error.

### Runtime helpers (`src/runtime/index.ts`)

- `tl.create(map)` — at build time, replaced inline by webpack/Next.js transform. At runtime (untransformed paths), computes the same classes using the duplicated hash.
- `tl.merge(...)` — last-wins conflict resolution. Reads the compile-time-injected `__TRACELESS_STYLE_META__` global to know which property each class controls. Without meta, falls back to deduping. Meta is injected by `TracelessStyleWebpackPlugin` via `webpack.DefinePlugin`.
- `tl.cx(...)` — clsx-style conditional class joining; no meta involved.
- `tl.extend({ variants })` — registers custom variants into a module-level `_customVariants` for the runtime fallback path, **and** is detected at build time by Pass 1 so the compiler picks them up too.

### Plugins / integrations

- `src/plugins/webpack.ts` — `TracelessStyleWebpackPlugin` runs full extraction on `beforeCompile` (once), injects `__TRACELESS_STYLE_META__` via `DefinePlugin` on `thisCompilation`, and re-emits CSS on `afterEmit`. The `tracelessStyleLoader` is a per-file transformer that calls `extractor.transform`.
- `src/plugins/vite.ts` (`tracelessStyle()`) — Vite Plugin. `enforce: "pre"`, hooks into `configResolved` / `buildStart` / `transform` / `handleHotUpdate`. Per-file `transform` uses the legacy text-mode extractor (no native deps); `buildStart` runs the full extraction. CSS lands in `public/traceless-style.css` to mirror Next.
- `src/nextjs.ts` (`withTracelessStyle`) — wraps a `NextConfig`, configures the webpack rule + plugin, sets `turbopack.resolveAlias` (Windows: paths must use forward slashes — see `nextjs.ts:64-66`), writes a tiny shim entry that `require()`s `public/traceless-style.css` so users don't import it manually, and ensures `public/traceless-style.css` exists before Next starts. Throws a clear error if `next` isn't resolvable.
- `src/dark.ts` — separate entry, separate package export. Uses class strategy by default (toggles `.dark` on `<html>`); the `_dark` variant in `BUILT_IN_VARIANTS` is `:is(.dark *)`. `DARK_INIT_SCRIPT` is the inline anti-flash script for `<head>`.

### Design tokens & themes (`src/compiler/tokens.ts` + `tl.defineTokens` / `tl.createTheme` / `tl.cssVar`)

Three runtime helpers, all compile-time-aware:

```ts
const tokens = tl.defineTokens({                  // emits :root vars
  brand:   { primary: "#3b82f6", secondary: "#10b981" },
  spacing: { sm: "0.5rem", md: "1rem" },
});

const dark = tl.createTheme("dark", {             // emits .tlThemeXXX class
  brand: { primary: "#60a5fa" },
});

const $ = tl.create({
  btn: {
    color:   tl.cssVar("brand-primary"),          // expands to var(--tl-XXX)
    padding: tl.cssVar("spacing-md"),
  },
});

// <body className={dark}><button className={$.btn}/></body>
```

Implementation notes:
- All names hash through `fnv32a` and the runtime↔compiler invariant is pinned by `test/tokens.test.ts`. Three places now share the FNV invariant: `compiler/hash.ts`, `runtime/index.ts`, and `compiler/tokens.ts`.
- `tokenRegistry` is a process-singleton, parallel to `globalRegistry`. Cleared at the start of every `extract()` run.
- `processDefineTokens` and `processCreateThemes` in `extractor.ts` run BEFORE the `tl.create()` scan and rewrite their call sites in source. `expandCssVarCalls` then replaces `tl.cssVar("...")` with the literal `"var(--tl-XXX)"` so the strict literal-only AST parser accepts the result.
- The whole pipeline is exposed as `preprocessTokensAndCssVar(src, file, errors)` and injected into the SWC extractor via `SwcExtractorDeps.preprocess`. The SWC path runs the same text rewrites BEFORE its AST parse — no duplicate logic.

**Cross-file tokens work** — both `tl.cssVar("name")` and `tokens.brand.primary`-style member access resolve correctly across modules. Implementation:

- `tokenExportRegistry` (file path → exported binding name → `NestedTokenShape`) is populated by a read-only **PASS 0** in `extract-fn.ts` that scans every file for `(export )?const X = tl.defineTokens({...})`. This runs before any file's full transform, so file processing order is irrelevant.
- Per-file in `transform()`: `parseFileImports` walks the source's `import { tokens } from "./theme"` lines, resolves each relative path to an absolute file (tries `.ts`, `.tsx`, `.js`, `.jsx`, `index.*`), and looks up the export registry for matching shapes.
- Inside each `tl.create()` argument body (and ONLY there — never globally), `expandTokenMemberAccess` rewrites `<localName>.<key>.<key>...` to the literal `var(--tl-XXX)` string the leaf resolves to. Scoping the rewrite to the `tl.create` arg keeps shadowed locals (function parameters of the same name) safe.
- The same expansion runs in the SWC path's `preprocessTokensAndCssVar` so both extractors produce identical output.

**Import resolution is comprehensive.** The resolver in `src/compiler/extractor.ts` supports:

| Form | Example | How it resolves |
|---|---|---|
| Named relative | `import { tokens } from "./theme"` | direct lookup against the file's exports |
| Named with rename | `import { tokens as t } from "./theme"` | `t` becomes the local name |
| Namespace | `import * as M from "./theme"` | synthesizes `{ exportName: shape }` from every named export of the file (recursively across `export *`) |
| Default identifier | `import T from "./theme"` (where the file has `export default tokens`) | resolves the `default` export — registered when `export default tokens;` is detected |
| Default object | `import M from "./theme"` (where the file has `export default { tokens }`) | synthesizes a default shape with `tokens` as a key, recursing into the local binding |
| Path-aliased | `import { tokens } from "@/theme"` | applies `tsconfig.json compilerOptions.paths` rules (wildcards + exact) before file-system lookup |
| Bare specifier | `import { tokens } from "@my-org/design-tokens"` | falls back to `require.resolve()` against the project's `node_modules` |
| Re-export named | `export { tokens } from "./theme"` | recursive `resolve()` follows the chain |
| Re-export renamed | `export { tokens as themeTokens } from "./theme"` | chain follows the original name `tokens` |
| Re-export star | `export * from "./theme"` | every export from the source becomes a virtual export of the re-exporter (cycle-safe) |
| Deferred export | `const tokens = ...; export { tokens };` | second-pass scan promotes the local binding |
| Default from binding | `const tokens = ...; export default tokens;` | registered as the `default` export |

Key implementation knobs:
- **`tokenExportRegistry.setResolver(...)`** — the registry's recursive `resolve()` and `listExportNames()` defer specifier resolution to a callback installed by `installRegistryResolver()`. That callback is the alias-aware `resolveImport()` from `extractor.ts`. Without this indirection, the registry would only handle relative paths.
- **`stripJsonComments`** — string-aware tsconfig parser. Critical: a regex-only stripper miscounts strings whenever a glob like `"**/*.ts"` appears, because the `*/` substring inside a string literal looks like a block-comment closer.
- **PASS 0 prepass** in `extract-fn.ts` runs `tlanDefineTokens` over every file before any `transform()`. This builds the export registry so file processing order doesn't matter for cross-file resolution.

**Diagnostic for adopters debugging resolution issues:**
```bash
TRACELESS_STYLE_DEBUG_RESOLVE=1 npx traceless-style
```
prints the export registry contents after PASS 0 — useful when "my `import { tokens } from \"@/theme\"` isn't expanding" turns out to be a misconfigured tsconfig path or a typo in the export name.

### `tl.keyframes` — animation primitive

```ts
const fadeIn = tl.keyframes("fadeIn", {
  from: { opacity: 0 },
  to:   { opacity: 1 },
});
// → "tlKfXXXXXX" (string)

const $ = tl.create({
  modal: { animation: `${fadeIn} 0.2s ease-in` },
});
```

The compiler emits `@keyframes tlKfXXXXXX { from {...} to {...} }`. Per-step declarations go through the **same property allowlist** and **value-injection guards** as `tl.create()` — unknown properties get a "did you mean?" error, and `;`/`}`/control chars in values are rejected. Step names (`from`, `to`, `<digit>%`) are also validated by the CSS emitter as a final defense layer.

### Dev-mode source comments

In dev mode (`extract --dev` or webpack/vite plugin built with `dev: true`), `generateCSSPretty` annotates every atomic rule with its origin:

```css
/* app/Button.tsx  display */
.tlm92pvu {
  display: flex;
}
```

The origin string is sanitized (`*/` → `*​/` with a zero-width space) so a malicious or careless source path can't break out of the surrounding block comment. Only file path + camelCase source key are surfaced today; line numbers are tracked in the type but not yet populated by either extractor (single-call granularity is sufficient for grep-based debugging).

### Type-system depth

Three exports from `runtime/index.ts` for design-system authors:

- **`TracelessClass`** — branded class-name string. Component props can declare `className?: TracelessClass` to communicate "this expects a tl.create / tl.merge / tl.cx output." Erased at runtime.
- **`TokenKeyOf<T>`** — extract every dash-joined leaf path from a `defineTokens` result. `TokenKeyOf<{ brand: { primary: string } }>` = `"brand-primary"`.
- **`cssVar<T>("...")`** — generic argument for compile-time-checked token references. `tl.cssVar<TokenKeyOf<typeof tokens>>("brand-typo")` errors at compile time.

### CLI lint (`src/compiler/lint.ts`)

**Strict-by-default.** All four rules — `no-inline-styles`, `no-class-string`, `no-css-modules`, `no-tailwind` — are ON by default. `traceless-style.config.js` is the only escape hatch:

```js
// traceless-style.config.js — opt out of individual rules
module.exports = {
  lint: { noTailwind: false }   // keep the others, allow Tailwind
};
```

`lint: false` in the config disables the optional three but **keeps `noInlineStyles` on** — inline styles bypass the compiler entirely and there's no legitimate reason for them in a traceless-style project.

Lint runs **before** extraction. Targets `.tsx`/`.jsx` only.

### Defense-in-depth value validation (`src/compiler/css-gen.ts`)

`isValidRule()` rejects, in addition to JSX-leak artifacts:

- **CSS-injection sequences** in values: `;` `}` `<` `>` `</` `*/` `\\\\`. traceless-style today only accepts literal values (the AST parser rejects everything else), so this is defense-in-depth — but it turns a future parser bug into a contained failure rather than a CSS-rule-escape exfil.
- **Invisible / bidi Unicode**: ZWSP, ZWNJ, ZWJ, LRM, RLM, LRE/RLE/PDF/LRO/RLO, LRI/RLI/FSI/PDI, BOM. Standard homoglyph/exfil mitigations.
- **ASCII control chars** (0x00–0x1F except `\t`/`\n`/`\r`, plus DEL).

### Property-name allowlist (`src/compiler/css-properties.ts`)

`processStyles` calls `isKnownProperty(key)` before registering a rule. The allowlist is curated from `src/types/css.ts` (~250 standard properties) and accepts in addition:

- CSS variables: `--foo`, `--my-var-2`
- Vendor prefixes (camelCase or kebab): `webkitTransform`, `-moz-appearance`, `mozAppearance`, `-ms-overflow-style`

Anything else triggers a build error with a Levenshtein-suggested replacement: `Unknown CSS property 'colour' — did you mean 'color'?`

### tsup multi-entry layout

Each entry in `tsup.config.ts` maps to one `exports` field in `package.json`:

| Entry | Output | Package export |
|---|---|---|
| `runtime/index` | `dist/runtime/index.{js,mjs,d.ts}` | `.` (main) — minified |
| `nextjs` | `dist/nextjs.{js,mjs,d.ts}` | `./nextjs` |
| `plugins/webpack` | `dist/plugins/webpack.{js,mjs,d.ts}` | `./webpack` |
| `cli/extract-fn` | `dist/cli/extract-fn.{js,mjs,d.ts}` | (internal — used by nextjs/webpack) |
| `cli/extract` | `dist/cli/extract.{js,mjs}` | `bin: traceless-style` — ESM only, has `#!/usr/bin/env node` banner |
| `compiler/extractor-swc` | `dist/compiler/extractor-swc.{js,mjs,d.ts}` | (internal — lazy-loaded by extract-fn when `parser="swc"`) |
| `plugins/vite` | `dist/plugins/vite.{js,mjs,d.ts}` | `./vite` |
| `plugins/rollup` | `dist/plugins/rollup.{js,mjs,d.ts}` | `./rollup` |
| `plugins/esbuild` | `dist/plugins/esbuild.{js,mjs,d.ts}` | `./esbuild` |
| `dark` | `dist/dark.{js,mjs,d.ts}` | `./dark` — minified |

The `external` arrays matter: cross-entry imports like `./compiler/extractor` are externalized so each entry resolves to its own dist file rather than inlining duplicates.

## Things to watch for

- **Don't run `setup-traceless-style.mjs`** as part of normal development — it overwrites every source file from scaffolder string literals. Only use it when explicitly bootstrapping a fresh checkout.
- **Keep the runtime hash and compiler hash in sync** (see "Hash duplication invariant" above).
- **The `globalRegistry` is shared module state** — long-running processes (webpack dev server) rely on `extract-fn.ts` calling `clear()` before each run. If you add a new entrypoint that bypasses `extract-fn`, clear the registry yourself.
- **Test coverage gaps** — the legacy extractor (`compiler/extractor.ts`) has no direct unit tests; it's only exercised indirectly through the SWC equivalence suite. The runtime↔compiler hash-equivalence invariant is also untested and would catch the most dangerous class of bug.
- **Don't statically import `compiler/extractor-swc`** anywhere. It must stay reachable only through the indirect `Function("s","return import(s)")` loader in `extract-fn.ts`. A static import would (a) make tsup try to bundle `@swc/core` into every consumer, and (b) break installs where `@swc/core` failed to install as an optional dependency.
- **`tsconfig.json` excludes `test/`**, so test files are not type-checked by `tsc`. Vitest compiles them via vite/esbuild, which is more lenient. If you want strict TS checking on tests, add a `tsconfig.test.json` or include `test` in the main tsconfig.
