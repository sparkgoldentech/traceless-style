# Glossary

Terms used throughout the docs.

**Atomic CSS** — A CSS architecture where each `(property, value, selector)` combination produces exactly one class. Traditional CSS produces one class per *component*; atomic CSS produces one class per *unique declaration*. See [Thinking in atomic CSS](../learn/03-thinking-in-atomic-css.md).

**Auto-dark mode** — Compiler pass that derives a dark-mode counterpart of every color value in your styles, using HSL inversion + WCAG-AA contrast adjustment. See [Dark mode](../learn/08-dark-mode.md).

**Auto-RTL** — Compiler pass that rewrites physical CSS properties (`marginLeft`, `paddingRight`, etc.) to their logical equivalents (`marginInlineStart`, `paddingInlineEnd`, etc.). See [RTL](../learn/09-rtl.md).

**Class meta** — The `__TRACELESS_STYLE_META__` constant injected via `DefinePlugin`. Maps each emitted class name to the property it controls; used by `tl.merge` for last-wins conflict resolution.

**Container query variant** — A variant whose selector uses `@container (...)` instead of `@media (...)`. Adapts to the parent's width, not the viewport's. See `_containerSm`/`_containerMd`/`_containerLg`.

**Custom variant** — A variant registered via `tl.extend({ variants: ... })`. Discovered by Pass 1 of the compiler.

**`defineTokens`** — `tl.defineTokens(map)`. Compiles to `:root { --tl-<hash>: value; }` for each leaf and returns a typed nested object whose leaves are `var(--tl-<hash>)` strings.

**Extractor** — The build-time component that scans source files, finds `tl.create`/`tl.extend`/`tl.defineTokens`/`tl.createTheme`/`tl.keyframes` calls, and registers atomic rules. Two implementations: `extractor.ts` (legacy, text-mode) and `extractor-swc.ts` (SWC AST). Both expose the same interface.

**FNV-1a** — The hash algorithm used to produce 8-char base36 class names. Two parallel 32-bit FNV-1a streams combined via BigInt. See [Hashing](./hashing.md).

**`globalRegistry`** — Module-level singleton in `src/compiler/extractor.ts` that accumulates atomic rules across an extraction run. Cleared at the start of each full run.

**Hash invariant** — The runtime↔compiler↔tokens module *must* produce byte-for-byte identical hashes for identical inputs. Pinned by `test/hash.test.ts` and `test/tokens.test.ts`.

**Lint rule** — Strict-by-default code rules: `no-inline-styles`, `no-class-string`, `no-css-modules`, `no-tailwind`. See [Linting](../learn/12-linting.md).

**Logical property** — CSS property whose meaning depends on the writing direction (`marginInlineStart` resolves to `marginLeft` in LTR and `marginRight` in RTL). The auto-RTL compiler pass rewrites physical properties to logical.

**Pass 0 / 1 / 2** — The three sweeps the extractor makes over source files. Pass 0 collects token exports; Pass 1 collects custom variants; Pass 2 transforms `tl.create` calls. See [Two-pass extraction](./two-pass-extraction.md).

**Property allowlist** — `~250` curated CSS properties accepted by `tl.create`. Anything else triggers a Levenshtein-suggested error. See `src/compiler/css-properties.ts` and [Property allowlist](../api/properties.md).

**`tlXXXXXXXX`** — 10-character class name pattern: literal `tl` prefix + 8-character base36 FNV-1a hash. See [Hashing](./hashing.md).

**`tlKfXXXXXXXX`** — 12-character keyframe-name pattern: literal `tlKf` prefix + 8-character hash of `"keyframes:" + name`.

**`tlThemeXXXXXXXX`** — 15-character theme-class pattern: literal `tlTheme` prefix + 8-character hash of `"theme:" + name`.

**Token export registry** — Per-file map populated by Pass 0 of the extractor. Maps export name → nested token shape, so cross-file token references resolve correctly. See [Cross-file resolution](./cross-file-resolution.md).

**`TracelessClass`** — Branded class-name string type. Component props typed as `className?: TracelessClass` reject bare strings unless explicitly cast.

**TracelessStyleWebpackPlugin** — The webpack plugin that runs full extraction on `beforeCompile`, injects `__TRACELESS_STYLE_META__` via `DefinePlugin`, and re-emits CSS on `afterEmit`.

**Variant** — A name (e.g. `_hover`, `sm`, `_dark`) that maps to a CSS selector or `@-rule`. Used to attach conditional styles inside `tl.create`. See [Variants](../learn/05-variants.md).

**WCAG contrast audit** — Build-time check that every `color`/`background` pair passes WCAG 2.1 AA (4.5:1 normal / 3:1 large) or AAA (7:1 / 4.5:1). See [WCAG contrast validation](../learn/13-wcag-contrast.md).

**Zero-runtime** — No client-side cost beyond a tiny pure helper module. The library does no DOM mutation, no style-element insertion, no cache lookup against an atomic registry. The runtime is functional code over strings.
