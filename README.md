# traceless-style

> Zero-runtime atomic CSS for React, Next.js, Vite, Remix, Astro, SvelteKit, Qwik, and Solid. Build-time extraction. Strict-by-default WCAG 2.1 AA contrast validation. Auto dark mode, auto RTL. No Tailwind, no Babel plugin, no CSS-in-JS engine at runtime.

```bash
npm install traceless-style
npx traceless-style init
```

That's it. `init` detects your framework, wires the bundler plugin, generates the CSS entry, and you're ready.

---

## What it looks like

```tsx
import { tl } from "traceless-style";

const $ = tl.create({
  card: {
    padding:         "1.5rem",
    backgroundColor: "#ffffff",
    color:           "#0f172a",
    borderRadius:    "12px",
    boxShadow:       "0 8px 24px rgba(0,0,0,0.06)",

    _hover: { transform: "translateY(-2px)" },
    _dark:  { backgroundColor: "#13131a", color: "#e8e8ed" },
  },
});

export function Card({ children }: { children: React.ReactNode }) {
  return <div className={$.card}>{children}</div>;
}
```

At build time the call is statically replaced with a class-string literal:

```ts
const $ = { card: "tlm92pvu tla7dffa tlb1c4lk tlc883bz tld5e2f1" };
```

…and the atomic CSS lands in `public/traceless-style.css`. Your component file ships zero runtime CSS-in-JS code. Same `property: value` pair across 1,000 components compiles to one class — bundles plateau around 30 KB even at Facebook scale.

## Why it's different

| | Tailwind | styled-components | CSS Modules | **traceless-style** |
|---|:---:|:---:|:---:|:---:|
| Zero runtime | ✓ | ✗ | ✓ | **✓** |
| Type-safe styles | ✗ | partial | partial | **✓** |
| Atomic dedup | ✓ | ✗ | ✗ | **✓** |
| WCAG contrast at build time | ✗ | ✗ | ✗ | **✓** |
| Auto dark mode | ✗ | manual | manual | **✓** |
| Auto RTL (logical properties) | ✗ | manual | manual | **✓** |
| No bundler plugin to install | ✗ | ✓ | ✓ | **✓** (zero-config init) |

## Headline features

- **WCAG 2.1 + 2.2 contrast on every build.** AA 4.5:1 / AAA 7:1 / UI 3:1 / focus 3:1 enforced before CSS hits disk. APCA Lc readout in every diagnostic. Interactive `--fix-contrast` prompt suggests AAA-grade replacements that preserve your hue via OKLCH search.
- **Auto dark mode.** Every color you write gets a derived dark variant via `<TracelessRoot />`. Pair-aware so contrast survives the inversion. Override per-block via `_dark` when you want.
- **Auto RTL.** Physical properties (`marginLeft`, `paddingRight`) rewrite to logical equivalents (`marginInlineStart`, `paddingInlineEnd`) at build time. One stylesheet, every script direction.
- **Strict-by-default lint.** Blocks inline styles, string classNames, CSS modules, and Tailwind utilities. Property allowlist + value-injection guards (`;`, `}`, control chars, bidi Unicode all rejected).
- **Diagnostic codes.** Every error and warning carries a stable `TLS####` identifier. Grep, link, document.
- **Two parsers.** A hand-rolled scanner (zero native deps) for projects under ~100 files; an SWC-backed AST extractor that's nearly 2× faster on 500-file codebases. `auto` picks for you.

## Quick install

```bash
# Any framework — npx detects it and configures everything.
npm install traceless-style
npx traceless-style init
npm run dev
```

Supported frameworks: Next.js · Vite · Remix · Astro · SvelteKit · Qwik · Solid · Webpack · Rollup · esbuild · plain HTML.

## Tooling

- **VS Code extension** — autocomplete (280+ properties + per-property values), inline color swatches, hover docs, diagnostics with quick-fixes, rename support.
- **DevTools browser extension** — live `tl*` class inspector, cascade view with conflict warnings, token live-edit, `@keyframes` preview, bundle stats.
- **CLI subcommands** — `extract`, `dev`, `build`, `init`, `audit`, `inspect`, `--fix-contrast`.

## Documentation

Full docs at **[traceless-style.dev](https://traceless-style.dev)** — Learn track for concepts, API reference for every public function, Integrations for per-framework setup, Recipes for focused how-tos, Reference for architecture, diagnostics, and FAQ.

Quick links:
- [Defining styles](https://traceless-style.dev/docs/learn/04-defining-styles) — `tl.create` syntax, allowed values, conflict semantics
- [WCAG contrast](https://traceless-style.dev/docs/learn/13-wcag-contrast) — strict validator, APCA, auto-fix
- [Diagnostic codes](https://traceless-style.dev/docs/reference/diagnostic-codes) — every `TLS####` error explained
- [Architecture](https://traceless-style.dev/docs/reference/architecture) — two parsers, the registry, the runtime fallback

## License

MIT © Spark Golden Tech. See [LICENSE](./LICENSE).
