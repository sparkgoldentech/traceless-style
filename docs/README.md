# traceless-style — Documentation

Zero-runtime atomic CSS for React, Next.js, Vite, Rollup, and esbuild. `tl.create({...})` calls are statically transformed into plain class-name strings at build time, and the matching atomic CSS is emitted to a single file. There is no runtime style injection, no Babel plugin requirement, and no client-side dependency on the library beyond a tiny pure helper module (~2 kB).

These docs follow the same shape as the StyleX documentation so engineers (and AI assistants) can map between them. Every page below is intended to be self-contained — the headings, examples, and "why this exists" sections are written so a code-completion model can answer questions about the library without loading the source.

---

## Table of contents

### Learn the basics
- [1. Introduction](./learn/01-introduction.md) — what traceless-style is, what problem it solves, how it differs from CSS-in-JS and Tailwind.
- [2. Installation](./learn/02-installation.md) — installing the package and choosing a bundler integration.
- [3. Thinking in atomic CSS](./learn/03-thinking-in-atomic-css.md) — what atomic CSS is, why it deduplicates well, and how `tl.create` produces it.
- [4. Defining styles with `tl.create`](./learn/04-defining-styles.md) — the core API, return type, allowed values, conflict semantics.
- [5. Variants](./learn/05-variants.md) — pseudo-classes, breakpoints, dark mode, container queries, custom variants.
- [6. Design tokens & themes](./learn/06-tokens-and-themes.md) — `tl.defineTokens`, `tl.createTheme`, `tl.cssVar`.
- [7. Keyframes & animation](./learn/07-keyframes.md) — `tl.keyframes`.
- [8. Dark mode](./learn/08-dark-mode.md) — automatic dark inversion, the dark engine, anti-flash script.
- [9. RTL / logical properties](./learn/09-rtl.md) — automatic physical → logical rewriting.
- [10. Composition: `tl.merge` and `tl.cx`](./learn/10-merge-and-cx.md) — last-wins conflict resolution and conditional class joining.
- [11. The compiler](./learn/11-the-compiler.md) — how the build-time transform works, two-pass extraction.
- [12. Linting](./learn/12-linting.md) — strict-by-default rules (no inline styles, no class strings, no Tailwind, no CSS modules).
- [13. WCAG contrast validation](./learn/13-wcag-contrast.md) — building accessibility into the build.

### API reference
- [`tl.create`](./api/create.md)
- [`tl.merge`](./api/merge.md)
- [`tl.cx`](./api/cx.md)
- [`tl.extend`](./api/extend.md)
- [`tl.defineTokens`](./api/defineTokens.md)
- [`tl.createTheme`](./api/createTheme.md)
- [`tl.cssVar`](./api/cssVar.md)
- [`tl.keyframes`](./api/keyframes.md)
- [Types: `TracelessClass`, `TokenKeyOf<T>`, `StyleDef`, `StyleMap`](./api/types.md)
- [Built-in variants table](./api/variants-table.md)
- [Property allowlist](./api/properties.md)
- [Configuration file `traceless-style.config.js`](./api/config.md)
- [CLI](./api/cli.md)

### Integrations
- [Next.js](./integrations/nextjs.md)
- [Webpack (raw)](./integrations/webpack.md)
- [Vite](./integrations/vite.md)
- [Rollup](./integrations/rollup.md)
- [esbuild](./integrations/esbuild.md)
- [DevTools browser extension](./integrations/devtools.md)
- [VS Code extension](./integrations/vscode.md)

### Recipes
- [Building a Button component](./recipes/button.md)
- [Responsive layout](./recipes/responsive.md)
- [Cross-file design tokens](./recipes/cross-file-tokens.md)
- [Theme switcher with persistence](./recipes/theme-switcher.md)
- [Server Components](./recipes/server-components.md)
- [Migrating from Tailwind](./recipes/migrating-from-tailwind.md)
- [Migrating from styled-components](./recipes/migrating-from-styled-components.md)
- [Migrating from StyleX](./recipes/migrating-from-stylex.md)

### Reference
- [Architecture: how the pieces fit](./reference/architecture.md)
- [Diagnostic codes (every TLS####)](./reference/diagnostic-codes.md) — every error / warning code, what triggers it, how to fix.
- [Hash function & determinism guarantee](./reference/hashing.md)
- [Two-pass extraction](./reference/two-pass-extraction.md)
- [Cross-file token resolution](./reference/cross-file-resolution.md)
- [Defense-in-depth value validation](./reference/value-validation.md)
- [Performance characteristics](./reference/performance.md)
- [AI / LLM reference (single-page cheat sheet)](./reference/ai-cheatsheet.md)
- [FAQ](./reference/faq.md)
- [Glossary](./reference/glossary.md)

### Demo
- [Runnable demo project](./demo/README.md)

---

## What this library is, in one paragraph

`tl.create({ btn: { color: "white", _hover: { color: "blue" } } })` — at build time, every literal-style object is hashed by property+value+selector with FNV-1a (8-char base36 → `tl12abcd34`), each atomic rule is registered exactly once into a single CSS file, and the call site is rewritten to `{ btn: "tl12abcd34 tl56efgh78" }`. There is **no runtime style injection** — your bundle contains only the resulting class strings. The runtime fallback exists for environments where the transform didn't run (Server Components, tests, dev without a bundler) and produces byte-identical class names from the same hash function so styles never break. The compiler is "traceless": no source location, no JSX boilerplate, no styled-component wrapper — just hashed atoms emitted once per property/value combination.

## Source map: docs to source

| Doc | Source | What it documents |
|---|---|---|
| `learn/04-defining-styles.md` | `src/runtime/index.ts` `create` + `src/compiler/extractor.ts` `processStyles` | The `tl.create` API and what gets compiled |
| `learn/05-variants.md` | `src/compiler/variants.ts` `BUILT_IN_VARIANTS` | All 76 variants and how custom ones plug in |
| `learn/06-tokens-and-themes.md` | `src/compiler/tokens.ts` + `src/runtime/index.ts` (token helpers) | Tokens, themes, `cssVar` |
| `learn/08-dark-mode.md` | `src/dark.ts` + `src/compiler/auto-dark.ts` | Auto-dark inversion + `<TracelessRoot />` |
| `learn/09-rtl.md` | `src/rtl.ts` + `src/compiler/auto-rtl.ts` | Physical → logical rewriting |
| `learn/12-linting.md` | `src/compiler/lint.ts` | All 4 lint rules |
| `learn/13-wcag-contrast.md` | `src/compiler/contrast-validator.ts` + `src/compiler/wcag.ts` | WCAG 2.1 AA/AAA validation |
| `api/cli.md` | `src/cli/extract.ts` + `src/cli/commands.ts` | Every subcommand, every flag |
| `api/config.md` | `src/cli/extract.ts` (config loader) | Every config key |
| `integrations/nextjs.md` | `src/nextjs.ts` | `withTracelessStyle()` |
| `integrations/{webpack,vite,rollup,esbuild}.md` | `src/plugins/*` | Per-bundler plugin |

If something is documented here that doesn't match the code, the code is correct. Open an issue.
