# Architecture

A bird's-eye view of how the pieces fit together.

```
                  ┌────────────────────────────────────┐
                  │ User code                          │
                  │  - tl.create({ … })                │
                  │  - tl.extend({ variants: … })      │
                  │  - tl.defineTokens({ … })          │
                  │  - tl.createTheme(name, { … })     │
                  │  - tl.keyframes(name, { … })       │
                  │  - tl.merge(...) / tl.cx(...)      │
                  └────────────┬───────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
   ┌──────────▼────────────┐         ┌──────────▼─────────────┐
   │ Build-time            │         │ Run-time fallback      │
   │ extractor             │         │ (src/runtime/index.ts) │
   │ src/compiler/*        │         │                        │
   │ src/cli/extract-fn.ts │         │  Same hash function    │
   │                       │         │  Same selector strings │
   │ Two-pass extraction   │         │  Same return shape     │
   └─────────┬─────────────┘         └────────────────────────┘
             │
             ▼
   ┌──────────────────────────────────────────────┐
   │ Atomic registry (singleton)                  │
   │ globalRegistry  — all atomic rules           │
   │ tokenRegistry   — tokens / themes / kfs      │
   │ tokenExportRegistry — per-file exports       │
   └─────────┬────────────────────────────────────┘
             │
             ▼
   ┌──────────────────────────────────────────────┐
   │ generateCSS  → public/traceless-style.css    │
   │ injectMeta   → __TRACELESS_STYLE_META__      │
   │                via DefinePlugin              │
   └──────────────────────────────────────────────┘
```

## Components

### `src/runtime/index.ts`

The runtime bundle (~2 kB minified). Exports:

- `tl.create(map)` — at build time, replaced inline by webpack/Next.js transform. At runtime, computes the same classes via the duplicated FNV-1a hash.
- `tl.merge(...)` — last-wins conflict resolution. Reads `__TRACELESS_STYLE_META__` (injected by the bundler plugin via `DefinePlugin`).
- `tl.cx(...)` — clsx-style conditional class joining.
- `tl.extend({ variants })` — registers custom variants for the runtime fallback path; build time discovers them via Pass 1.
- `tl.defineTokens(map)` / `tl.createTheme(name, overrides)` / `tl.cssVar(name)` / `tl.keyframes(name, frames)` — all use the same hashing as the compiler.

### `src/compiler/`

The build-time half. 15 files, ~80 KB of TS source:

- `ast-parser.ts` — strict literal-only AST parser for `tl.create` arguments.
- `extractor.ts` — legacy text-mode extractor + `globalRegistry` singleton.
- `extractor-swc.ts` — SWC-AST-based extractor (factory pattern).
- `variants.ts` — `BUILT_IN_VARIANTS` + custom-variant validation.
- `tokens.ts` — `tokenRegistry`, theme handling, keyframes.
- `hash.ts` — `fnv32a` 8-char base36 hash.
- `css-gen.ts` — value injection guard, atomic-rule emission, dev source-comment annotations.
- `css-properties.ts` — property allowlist + Levenshtein "did you mean".
- `lint.ts` — strict-by-default lint rules.
- `auto-dark.ts` — color parser + HSL-based dark inversion + WCAG-AA fixup.
- `auto-rtl.ts` — physical → logical property mapping.
- `wcag.ts` — WCAG 2.1 contrast formula + binary-search adjustment.
- `contrast-validator.ts` — group-level contrast audit.
- `codeframe.ts` — Babel-style error formatter.
- `sourcemap.ts` — v3 source map generator.

### `src/cli/`

- `extract.ts` — main CLI binary; loads config, runs lint, runs extract.
- `extract-fn.ts` — programmatic `extract({...})` API + Pass 0/1/2 orchestration.
- `commands.ts` — `inspect`, `audit`, `dev`, `build` subcommands.
- `init.ts` — zero-config scaffolder.
- `file-cache.ts` — SHA-256-keyed per-file cache (`v3-keyframe-bindings`).

### `src/plugins/`

- `webpack.ts` — `TracelessStyleWebpackPlugin` + `tracelessStyleLoader`.
- `vite.ts` — Vite `tracelessStyle()` plugin (`enforce: "pre"`).
- `rollup.ts` — Rollup `tracelessStyle()` plugin.
- `esbuild.ts` — esbuild `tracelessStyle()` plugin.

### `src/nextjs.ts`

`withTracelessStyle()` — Next.js wrapper that:
- Adds the loader + plugin to webpack.
- Configures Turbopack `resolveAlias`.
- Auto-injects `traceless-style.css` into the client entry via a tiny shim.

### `src/dark.ts` and `src/rtl.ts`

User-facing helpers for runtime theme/direction switching. Both export an engine, a hook, a toggle button component, and the inline anti-flash script (combined into `<TracelessRoot />`).

## Data flow

When `npx traceless-style` runs:

1. **Lint** sweeps every `.tsx` / `.jsx` file. Hard fail on any error.
2. **Pass 0**: scan every file for `tl.defineTokens({...})` exports → populate `tokenExportRegistry`.
3. **Pass 1**: scan every file for `tl.extend({ variants: {...} })` → merge into a single `customVariants` map.
4. **Pass 2**: for each file:
   - Resolve imports → look up tokens in `tokenExportRegistry`.
   - Preprocess: rewrite `tl.cssVar("name")` to literal `"var(--tl-...)"`; rewrite `tokens.x.y` member access to literals (only inside `tl.create` arg bodies).
   - Parse argument with the strict AST parser.
   - Walk the style tree, register atomic rules into `globalRegistry`.
   - Apply auto-RTL + auto-dark transformations.
   - Run WCAG contrast audit per group.
   - Rewrite the call site.
5. **CSS generation**: render `globalRegistry` to `public/traceless-style.css` (with `:root { --tl-* }` from `tokenRegistry` and `@keyframes` rules at the top).
6. **Source map**: emit v3 `.map` sidecar.
7. **Meta**: emit `.traceless-style/class-meta.json` for the bundler's `DefinePlugin` to inject as `__TRACELESS_STYLE_META__`.

When the bundler (webpack, Vite, etc.) builds:

- The plugin's `beforeCompile`/`buildStart` hook runs steps 1–7 above.
- The loader/`transform` rewrites individual files as the bundler walks the dep graph.
- `DefinePlugin` (or its Vite analog) injects the meta map.

## Singletons

| Singleton | Lives in | Cleared by |
|---|---|---|
| `globalRegistry` | `src/compiler/extractor.ts` | `extract-fn.ts` at start of each run |
| `tokenRegistry` | `src/compiler/tokens.ts` | same |
| `tokenExportRegistry` | `src/compiler/tokens.ts` | same |

These are process-wide. If you write a new entrypoint that bypasses `extract-fn.ts`, clear them yourself.

## Two parsers, one registry

Both `extractor.ts` and `extractor-swc.ts` register rules into the **same** `globalRegistry`. The SWC extractor is constructed by a factory that takes `processStyles`, `globalRegistry`, `mergeVariants`, and `DEFAULT_VARIANTS` from the caller — this guarantees the singleton is shared across both code paths.

`@swc/core` is in `optionalDependencies` and loaded via an indirect dynamic import (`new Function("s", "return import(s)")`) so esbuild/tsup can't follow it at build time. This keeps the legacy path's bundle free of SWC.

## See also

- [The compiler (deeper dive)](../learn/11-the-compiler.md)
- [Hash function & determinism](./hashing.md)
- [Two-pass extraction](./two-pass-extraction.md)
