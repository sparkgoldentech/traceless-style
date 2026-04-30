# Introduction

`traceless-style` is a **zero-runtime, build-time, atomic CSS** library for modern web applications. It pairs a tiny client API (`tl.create`, `tl.merge`, `tl.cx`, `tl.extend`, `tl.defineTokens`, `tl.createTheme`, `tl.cssVar`, `tl.keyframes`) with a compiler that statically replaces every call to `tl.create` with the literal class string it produces. The atomic CSS rules behind those classes are emitted once to `public/traceless-style.css` and reused across every component that asks for them.

## What "zero-runtime" actually means

When a bundler runs the traceless-style transform:

```ts
const $ = tl.create({
  btn: {
    display: "inline-flex",
    color:   "white",
    background: "blue",
    _hover: { background: "darkblue" },
  },
});
```

…the call site becomes:

```ts
const $ = { btn: "tla1b2c3d4 tle5f6g7h8 tli9j0k1l2 tlm3n4o5p6" };
```

The library is no longer present in the runtime path for that file. There's no template-tag interpreter, no style-cache lookup, no DOM mutation — the bundle just contains four short class strings, and the corresponding CSS rules already exist in the static stylesheet. This is the same trade traditional `.module.css` makes, except the styles are co-located with the component and the property/value pairs are deduplicated globally.

## What "atomic" means

Each unique `property:value` (and optional `:selector`) combination produces exactly one CSS class:

```css
.tla1b2c3d4 { display: inline-flex; }
.tle5f6g7h8 { color: white; }
.tli9j0k1l2 { background: blue; }
.tlm3n4o5p6:hover { background: darkblue; }
```

Two components that both use `color: "white"` share `.tle5f6g7h8`. With ~250 supported CSS properties and the variant set, real-world projects converge to a small bounded number of classes — measured at <50 KB of total CSS for codebases of 5,000+ files. See `bench/RESULTS.md` for the full numbers.

## What problems this solves

| Problem in legacy CSS / CSS-in-JS | How traceless-style addresses it |
|---|---|
| Cascade conflicts: two components, two classes, one property "wins" by source-order luck | `tl.merge(...)` reads compile-time-injected metadata to deterministically pick the last input that sets each property. |
| Bundle size grows linearly with components | Atomic rules are deduplicated at the property/value level — `display:flex` is emitted once per project. |
| Runtime cost of CSS-in-JS (style cache, hash, insertRule) | None at runtime. The transform produces literal strings. |
| Theming requires a `ThemeProvider` and re-render on toggle | `tl.createTheme("dark", {...})` emits a class that overrides CSS custom properties — the toggle is a single `classList.add("dark")`. |
| Dark mode requires writing every color twice | The compiler derives a WCAG-AA-compliant dark variant of every color value automatically (see `learn/08-dark-mode.md`). |
| RTL requires writing every margin/padding twice | The compiler rewrites physical properties (`marginLeft`) to logical (`marginInlineStart`) automatically (see `learn/09-rtl.md`). |
| TypeScript can't validate token names | `tl.cssVar<TokenKeyOf<typeof tokens>>("brand-primary")` is checked at compile time — typos error at build, not at runtime. |
| Server Components break your CSS-in-JS library | The runtime fallback uses the same hash function as the compiler, so untransformed code paths produce byte-identical class names. |

## What this library is *not*

- **Not a Tailwind replacement.** Tailwind ships a fixed utility vocabulary; traceless-style accepts arbitrary CSS values as long as they pass the property allowlist. There is no `tl-bg-red-500` shorthand — you write `{ background: "red" }`.
- **Not a styled-components replacement.** There is no template-tag DSL, no `styled.button` API. Styles attach to elements via `className=` only.
- **Not a CSS-in-JS library in the traditional sense.** Nothing runs at render time except the runtime fallback, which is itself just a deterministic hash.

## Comparison at a glance

| Feature | traceless-style | StyleX | Tailwind | styled-components |
|---|---|---|---|---|
| Runtime cost | None (fallback hash only) | None | None | High (hash + insertRule per render) |
| Atomic CSS | Yes | Yes | Yes | No |
| Build-time deduplication | Yes | Yes | n/a (utilities hand-curated) | No |
| Babel plugin required | **No** | Yes | n/a | n/a |
| Dynamic property values | Yes (literal expressions) | Yes | No (config-only) | Yes |
| Built-in dark mode auto-derivation | **Yes** | No | Plugin-based | No |
| Built-in RTL | **Yes (compile-time)** | No | Plugin-based | No |
| WCAG contrast validation | **Yes (build-time)** | No | No | No |
| Server Components | **Yes** | Yes | Yes | Partially |
| Bundler support | Webpack/Turbopack/Vite/Rollup/esbuild | Webpack/Rollup/esbuild | Any | Any |

## Where to go next

- **Want to install it?** → [Installation](./02-installation.md)
- **Want to see code immediately?** → [Defining styles with `tl.create`](./04-defining-styles.md) or open the [demo project](../demo/README.md).
- **Coming from another library?** → see the [Migration recipes](../recipes/migrating-from-tailwind.md).
- **Want a single-page reference?** → [AI / LLM cheat sheet](../reference/ai-cheatsheet.md).
