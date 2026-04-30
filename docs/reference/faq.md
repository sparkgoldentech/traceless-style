# FAQ

## General

### Why doesn't traceless-style use a Babel plugin?

A Babel plugin would add ~80 ms per file at typical project sizes and force every consumer to wire up `@babel/core`. The hand-rolled scanner skips strings/comments via a small state machine; the SWC extractor uses a real AST when projects are large enough that the SWC startup cost amortizes. Both avoid the Babel pipeline entirely.

The trade-off: Babel-style transforms (e.g. JSX inside `tl.create` arguments) aren't supported. But `tl.create` arguments are *meant* to be plain literal style objects, so this isn't a real limitation.

### Why are variables rejected in `tl.create`?

The compiler needs to know every value at build time to emit the matching CSS rule. A variable's value is only known at runtime. If you need dynamic values, use design tokens — they compile to CSS custom properties and can be overridden by themes or per-element styles.

For values that genuinely change at runtime (e.g. progress bar width), set a CSS custom property and reference it:

```tsx
const $ = tl.create({ bar: { width: "var(--progress)" } });
<div className={$.bar} style={{ "--progress": `${pct}%` }} />
```

### Can I use it with React Server Components?

Yes. The compiler transforms server-component files in the same pass as client-component files, and the runtime fallback uses the same hash function so untransformed paths produce identical class names. See [Server Components recipe](../recipes/server-components.md).

### Does it work without React?

The runtime helpers (`tl.create`, `tl.merge`, `tl.cx`, `tl.extend`, `tl.defineTokens`, etc.) have **no React dependency**. Only the React components in `traceless-style/dark` and `traceless-style/rtl` need React.

### What about Vue / Svelte / Solid?

The runtime is framework-agnostic — `tl.create` returns plain class strings. The bundler integrations (Webpack, Vite, Rollup, esbuild) work for any framework. The React components are optional.

For a framework-specific theme toggle, write your own using the `dark` engine:

```ts
import { dark } from "traceless-style/dark";
dark.toggle();        // works in any framework
dark.subscribe(mode => /* ... */);
```

## Build

### How big is the runtime?

~2 KB minified+gzipped. The `dist/runtime/index.mjs` is the only file shipped to the browser.

### How big is the CSS bundle?

It scales logarithmically. Real-world projects converge to <100 KB for codebases of 5,000+ files. See [Performance](./performance.md) for measurements.

### Why is my build slow?

Three causes:

1. You have >100 files but the SWC parser isn't installed. Solution: `npm install @swc/core` (it's in `optionalDependencies`).
2. Watch mode isn't using the cache. Solution: ensure `cache: true` in your config (default).
3. Your `srcDir` includes `node_modules` or other huge directories. Check `srcDir` in your config.

### Can I exclude files from extraction?

Yes:

```js
// traceless-style.config.js
module.exports = {
  srcDir: "src",          // single, narrowed scan root
  lint: { ignore: ["**/legacy/**"] },
};
```

To skip a file from style extraction entirely, move it outside `srcDir` or use a directory pattern that doesn't match.

## Styling

### How do I style child elements I don't control?

Two options:

**Raw selector** inside `tl.create`:

```ts
tl.create({
  list: {
    "& > li": { listStyle: "none", padding: "0.5rem" },
    "& a":    { color: "inherit", textDecoration: "none" },
  },
});
```

**Custom variant** if you'll reuse the pattern:

```ts
tl.extend({
  variants: { _allChildren: "& > *" },
});

tl.create({
  list: {
    _allChildren: { padding: "0.5rem" },
  },
});
```

### How do I style based on a parent's state?

Use the `_groupHover` / `_groupFocus` / `_groupActive` variants and tag the parent with `className="group"`:

```tsx
<article className="group">
  <button className={$.icon} />
</article>

const $ = tl.create({
  icon: {
    opacity: 0.6,
    _groupHover: { opacity: 1 },
  },
});
```

### Can I use `!important`?

`!important` in a value triggers the value-injection guard (it contains `!`, which historically the guard rejected). The current allowlist permits `!important` at the END of a value:

```ts
tl.create({ x: { color: "red !important" } });
```

…but use it sparingly — atomic CSS already gives you predictable specificity, so `!important` is rarely needed. If you find yourself reaching for it, prefer `tl.merge` to control which class wins.

## Tokens

### Why aren't my cross-file tokens expanding?

Run with the resolution debug flag:

```bash
TRACELESS_STYLE_DEBUG_RESOLVE=1 npx traceless-style
```

Common causes: `srcDir` doesn't include the file with the `defineTokens` call; missing `export` keyword; tsconfig path-alias misconfigured. See [Cross-file resolution](./cross-file-resolution.md).

### Can I override tokens per-component?

Yes — themes can be applied to any element:

```tsx
const accent = tl.createTheme("accent", { brand: { primary: "#ec4899" } });

<section className={accent}>
  {/* tokens.brand.primary === "#ec4899" inside this section */}
</section>
```

### Can I read a token value at runtime?

Tokens compile to CSS custom properties, so:

```ts
getComputedStyle(document.documentElement).getPropertyValue("--tl-aaaaaaaa")
```

…will return the literal value. There's no JS-side `getToken("brand.primary")` API because the values are statically known at compile time and JS-readable via `getComputedStyle`.

## Dark mode / RTL

### How do I disable auto-dark mode for one component?

Per-group: `_autoDark: false` inside the style group.

```ts
tl.create({
  brandLogo: {
    background: "#3b82f6",
    _autoDark: false,
  },
});
```

Globally: `autoDarkMode: false` in `traceless-style.config.js`.

### How do I write per-property dark overrides?

Use the `_dark` variant. When `_dark` is set for a property, auto-derivation for THAT property is suppressed; other properties in the same group still get auto-derived.

```ts
tl.create({
  card: {
    background: "white",                   // auto-derives dark variant
    color:      "#0f172a",                 // auto-derives
    boxShadow:  "0 1px 3px rgba(0,0,0,0.1)",
    _dark: {
      boxShadow: "0 1px 3px rgba(255,255,255,0.05)",  // explicit override for shadow
    },
  },
});
```

### Why does my page flash light theme on first load?

Add `<TracelessRoot />` to your root layout's `<head>`:

```tsx
import { TracelessRoot } from "traceless-style/dark";

<html lang="en" suppressHydrationWarning>
  <head><TracelessRoot /></head>
  <body>{children}</body>
</html>
```

It's an inline `<script>` that reads `localStorage` and applies `.dark` to `<html>` synchronously, before React hydrates.

### Does auto-RTL break my layouts?

It shouldn't. Logical properties resolve to physical properties in LTR contexts identically to the originals. If you find a layout that does break, opt out per-group with `_autoRtl: false` and file an issue with a minimal repro.

## Lint

### How do I disable lint for legacy code?

Set `lint: { ignore: ["**/legacy/**"] }` in `traceless-style.config.js`.

To disable the optional rules entirely (keep `noInlineStyles` on):

```js
module.exports = { lint: false };
```

`noInlineStyles` is the only rule that cannot be fully disabled — inline styles bypass the compiler entirely and there's no legitimate use in a traceless-style project.

### Can I disable lint for one line?

There's a planned `// traceless-disable-next-line` directive. Check `src/compiler/lint.ts` for the current set.

## Editor / DevTools

### Where are the IntelliSense / autocomplete?

Install the [VS Code extension](../integrations/vscode.md). It scopes its features to `tl.create` / `tl.keyframes` / `tl.extend` / `tl.defineTokens` / `tl.createTheme` calls, so it doesn't interfere with non-traceless code.

### How do I inspect a class at runtime?

Install the [DevTools extension](../integrations/devtools.md). It surfaces atomic rules, tokens, themes, and animations in a dedicated panel.

## Migration

- [Migrating from Tailwind](../recipes/migrating-from-tailwind.md)
- [Migrating from styled-components](../recipes/migrating-from-styled-components.md)
- [Migrating from StyleX](../recipes/migrating-from-stylex.md)
