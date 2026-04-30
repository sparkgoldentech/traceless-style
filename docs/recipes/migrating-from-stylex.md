# Recipe: Migrating from StyleX

StyleX (Meta) and traceless-style share a lot of design DNA — both are zero-runtime atomic CSS for React. The main differences:

| | StyleX | traceless-style |
|---|---|---|
| Babel plugin required | **Yes** | No |
| Bundler integrations | Webpack, Rollup, esbuild | + Vite, raw esbuild, Next.js Turbopack |
| Variable interpolation | Allowed via `stylex.create({ x: { color: token } })` (token vars only) | Same — token vars / `tl.cssVar` only |
| Conditional styles | `stylex.props(a, b)` returns merged | `tl.merge(a, b)` returns merged |
| Dark mode | manual `@media (prefers-color-scheme)` | **Auto-derived per color value** (compiler-built) |
| RTL | manual logical properties | **Auto compiler rewrite** |
| Contrast validation | None | **Build-time WCAG audit** |
| Lint | External | Built-in (no inline styles, no class strings, no Tailwind, no CSS modules) |
| Server Components | Supported | Supported |

## Direct API mapping

| StyleX | traceless-style |
|---|---|
| `stylex.create({ btn: { color: "red" } })` | `tl.create({ btn: { color: "red" } })` |
| `stylex.props($.btn, $.primary)` | `tl.merge($.btn, $.primary)` *(returns string, not `{className,style}`)* |
| `stylex.defineVars({ brand: "#3b82f6" })` | `tl.defineTokens({ brand: { primary: "#3b82f6" } })` |
| `stylex.createTheme(vars, { brand: "#60a5fa" })` | `tl.createTheme("dark", { brand: { primary: "#60a5fa" } })` |
| `stylex.keyframes({ from, to })` | `tl.keyframes("name", { from, to })` |
| `stylex.firstThatWorks("backdrop-filter", "filter")` | not built-in — use the standard property |

## Side-by-side example

### StyleX

```tsx
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  base:    { padding: 8, color: "white" },
  primary: { background: "blue" },
  danger:  { background: "red" },
});

function Button({ variant, ...props }) {
  return (
    <button {...stylex.props(styles.base, styles[variant])} {...props} />
  );
}
```

### traceless-style

```tsx
import { tl } from "traceless-style";

const $ = tl.create({
  base:    { padding: "8px", color: "white" },
  primary: { background: "blue" },
  danger:  { background: "red" },
});

function Button({ variant, ...props }: { variant: "primary" | "danger" }) {
  return (
    <button className={tl.merge($.base, $[variant])} {...props} />
  );
}
```

The main code-shape difference: `stylex.props(...)` returns `{ className, style }` because StyleX uses inline `style` for CSS-variable theming. traceless-style returns a single class string (theming is done via `createTheme` overrides, not inline `style`).

## Migration steps

### 1. Replace the import

```diff
- import * as stylex from "@stylexjs/stylex";
+ import { tl } from "traceless-style";
```

### 2. Rewrite `stylex.create` calls

```diff
- const styles = stylex.create({
-   btn: { padding: 8 }
- });
+ const $ = tl.create({
+   btn: { padding: "8px" }
+ });
```

### 3. Rewrite `stylex.props` calls

```diff
- <button {...stylex.props(styles.btn)} />
+ <button className={tl.merge($.btn)} />
```

(`tl.merge` is sufficient when there's only one input. For composition, pass multiple.)

### 4. Rewrite `defineVars` / `createTheme`

```diff
- export const colors = stylex.defineVars({
-   brand: "#3b82f6",
- });
- export const dark = stylex.createTheme(colors, {
-   brand: "#60a5fa",
- });
+ export const tokens = tl.defineTokens({
+   brand: { primary: "#3b82f6" },
+ });
+ export const dark = tl.createTheme("dark", {
+   brand: { primary: "#60a5fa" },
+ });
```

Token references at use sites:

```diff
- color: colors.brand
+ color: tokens.brand.primary
```

### 5. Drop the Babel plugin

Remove `@stylexjs/babel-plugin` and StyleX's webpack plugin. Add the traceless-style integration instead — see [Next.js](../integrations/nextjs.md) / [Webpack](../integrations/webpack.md) / [Vite](../integrations/vite.md).

### 6. Take advantage of features StyleX doesn't have

- **Auto-dark-mode**: Most `_dark: {...}` blocks become unnecessary.
- **Auto-RTL**: Logical properties get derived from physical ones automatically.
- **WCAG contrast**: Surface color/background pairs that fail accessibility at build time.

## What's similar

- Atomic CSS semantics (one class per `property:value`).
- Zero runtime style injection.
- Server Components support.
- Build-time class-name hashing.
- Theme-via-CSS-variables architecture.

## What's different

- **No Babel plugin**, period. The hand-rolled scanner + optional SWC AST cover the same ground in less code and with no consumer-side Babel config.
- Built-in dark-mode derivation, RTL rewriting, WCAG contrast — these are out-of-scope for StyleX core.
- A single `className` string return value (instead of StyleX's `{className, style}` pair).

## See also

- [Defining styles with `tl.create`](../learn/04-defining-styles.md)
- [Architecture](../reference/architecture.md)
