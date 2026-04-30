# Design tokens & themes

Design tokens are *named, themable values* — a single source of truth for colors, spacing, type scales, etc. They compile to CSS custom properties and can be overridden per-theme.

```ts
import { tl } from "traceless-style";

const tokens = tl.defineTokens({
  brand:   { primary: "#3b82f6", secondary: "#10b981" },
  text:    { default: "#0f172a", muted: "#64748b" },
  spacing: { sm: "0.5rem", md: "1rem", lg: "2rem" },
  radius:  { sm: "4px", md: "8px", lg: "16px" },
});

const dark = tl.createTheme("dark", {
  brand: { primary: "#60a5fa" },
  text:  { default: "#f8fafc", muted: "#94a3b8" },
});

const $ = tl.create({
  card: {
    color:        tokens.text.default,
    background:   "white",
    padding:      tokens.spacing.md,
    borderRadius: tokens.radius.md,
  },
});

// Apply the dark theme by adding its class to a parent:
<body className={dark}>
  <article className={$.card}>…</article>
</body>;
```

What this compiles to:

```css
:root {
  --tl-aaaaaaaa: #3b82f6;     /* tokens.brand.primary */
  --tl-bbbbbbbb: #10b981;     /* tokens.brand.secondary */
  --tl-cccccccc: #0f172a;     /* tokens.text.default */
  --tl-dddddddd: #64748b;     /* tokens.text.muted */
  --tl-eeeeeeee: 0.5rem;
  --tl-ffffffff: 1rem;
  --tl-gggggggg: 2rem;
  --tl-hhhhhhhh: 4px;
  --tl-iiiiiiii: 8px;
  --tl-jjjjjjjj: 16px;
}
.tlTheme<hash> {
  --tl-aaaaaaaa: #60a5fa;
  --tl-cccccccc: #f8fafc;
  --tl-dddddddd: #94a3b8;
}
.tl<hashed-card-color>      { color: var(--tl-cccccccc); }
.tl<hashed-card-background> { background: white; }
.tl<hashed-card-padding>    { padding: var(--tl-ffffffff); }
.tl<hashed-card-radius>     { border-radius: var(--tl-iiiiiiii); }
```

## `tl.defineTokens(map)`

Takes a nested object of leaf string/number values, returns a *typed* nested object where every leaf is a `var(--tl-<hash>)` reference.

```ts
const tokens = tl.defineTokens({
  brand: { primary: "#3b82f6" },
});

tokens.brand.primary; // → "var(--tl-aaaaaaaa)"
```

The returned object preserves the input shape, so you can use member access in `tl.create`:

```ts
tl.create({ btn: { color: tokens.brand.primary } });
```

The compiler:

1. Detects `tl.defineTokens({...})` at module top level.
2. Hashes each leaf path (e.g. `"token:brand-primary"` → `--tl-aaaaaaaa`).
3. Emits a `:root { --tl-…: …; }` block.
4. Replaces the call site with the typed nested-object literal.

## `tl.createTheme(name, overrides)`

Returns a class name you apply to a wrapper element. Inside that wrapper, the listed token vars are overridden.

```ts
const dark    = tl.createTheme("dark",    { brand: { primary: "#60a5fa" } });
const compact = tl.createTheme("compact", { spacing: { md: "0.5rem" } });

<body className={dark}>
  <main className={compact}>
    {/* tokens.brand.primary → "#60a5fa" here */}
    {/* tokens.spacing.md   → "0.5rem" here */}
  </main>
</body>;
```

Themes nest naturally because they're just CSS variable overrides on the parent — child themes layer on top. The class name is `tlTheme<hash>` where `<hash>` is `fnv32a("theme:" + name)`.

## `tl.cssVar(name)`

Lower-level helper: takes a dash-joined leaf path (the same string `defineTokens` would have hashed) and returns the `var(...)` reference.

```ts
tl.cssVar("brand-primary"); // → "var(--tl-aaaaaaaa)"
```

When typed against a token map, it gives you compile-time autocomplete and validation:

```ts
import type { TokenKeyOf } from "traceless-style";

tl.cssVar<TokenKeyOf<typeof tokens>>("brand-primary");  // ✓
tl.cssVar<TokenKeyOf<typeof tokens>>("brand-typo");     // ✗ TS2322
```

`TokenKeyOf<T>` is a recursive mapped type that produces all dash-joined leaf paths from a `defineTokens` shape — `TokenKeyOf<{ brand: { primary: string } }>` → `"brand-primary"`.

## Cross-file tokens

Tokens defined in one file work in another:

```ts
// theme/tokens.ts
import { tl } from "traceless-style";
export const tokens = tl.defineTokens({
  brand: { primary: "#3b82f6" },
});

// app/Button.tsx
import { tokens } from "../theme/tokens";

const $ = tl.create({
  btn: { color: tokens.brand.primary },        // ✓ resolves
});

// or via tl.cssVar
const $$ = tl.create({
  btn: { color: tl.cssVar("brand-primary") },  // ✓ resolves to the same var
});
```

The compiler runs **Pass 0** before any file's full transform — it scans every source file for `tl.defineTokens` exports and registers their shapes in a per-file export registry. Then `parseFileImports()` resolves each `import { tokens } from "./theme/tokens"` to the registered shape and rewrites token member access inside `tl.create` arg bodies to `var(--tl-<hash>)` literals.

Supported import forms (full table in [Cross-file resolution](../reference/cross-file-resolution.md)):

| Form | Example |
|---|---|
| Named relative | `import { tokens } from "./theme"` |
| Named with rename | `import { tokens as t } from "./theme"` |
| Namespace | `import * as M from "./theme"` |
| Default identifier | `import T from "./theme"` |
| Path-aliased | `import { tokens } from "@/theme"` (uses `tsconfig.json compilerOptions.paths`) |
| Bare specifier | `import { tokens } from "@my-org/design-tokens"` |
| Re-export named | `export { tokens } from "./theme"` |
| Re-export star | `export * from "./theme"` |
| Default re-export | `const t = ...; export default t;` |

## Debugging resolution

If a token import isn't expanding, run the CLI with the resolution-debug env var:

```bash
TRACELESS_STYLE_DEBUG_RESOLVE=1 npx traceless-style
```

This prints the export registry contents after Pass 0. Common causes of "my token doesn't expand": misconfigured `tsconfig.json paths`, typo in the export name, or the file isn't being scanned (check `srcDir` in your config).

## Themes outside of dark/light

Tokens + themes aren't limited to dark mode. You can build any kind of contextual override — high-contrast, compact density, brand-A vs. brand-B:

```ts
const compact   = tl.createTheme("compact",   { spacing: { md: "0.5rem", lg: "1rem" } });
const brandB    = tl.createTheme("brand-b",   { brand: { primary: "#ec4899" } });
const highContr = tl.createTheme("high-contr",{ text: { default: "#000", muted: "#333" } });

// Compose:
<body className={tl.cx(brandB, highContr, compact)}>...</body>
```

## Where the compiled CSS shows up

By default, all token / theme rules are appended to `public/traceless-style.css` along with regular atomic rules:

```css
/* tokens (always emitted at :root) */
:root { --tl-aaaaaaaa: #3b82f6; ... }
/* themes */
.tlTheme<hash> { --tl-aaaaaaaa: #60a5fa; ... }
/* atomic rules (referencing the vars) */
.tl<rule-hash> { color: var(--tl-aaaaaaaa); }
```

You can split themes / tokens into a separate bundle with `_bundle: "theme"` if you want to load them independently, but for most apps a single file is fine.

Continue to [7. Keyframes & animation](./07-keyframes.md).
