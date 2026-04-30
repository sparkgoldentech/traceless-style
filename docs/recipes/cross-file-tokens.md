# Recipe: Cross-file design tokens

Define tokens in one file, consume them anywhere.

## 1. Declare tokens

```ts
// theme/tokens.ts
import { tl } from "traceless-style";

export const tokens = tl.defineTokens({
  brand: {
    primary:   "#3b82f6",
    secondary: "#10b981",
    danger:    "#dc2626",
  },
  text: {
    default: "#0f172a",
    muted:   "#64748b",
    inverse: "#f8fafc",
  },
  surface: {
    default: "#ffffff",
    muted:   "#f1f5f9",
    border:  "#e2e8f0",
  },
  spacing: {
    xs: "0.25rem", sm: "0.5rem", md: "1rem", lg: "2rem", xl: "4rem",
  },
  radius:  { sm: "4px", md: "8px", lg: "16px", round: "999px" },
  shadow:  {
    sm: "0 1px 3px rgba(0,0,0,0.1)",
    md: "0 4px 12px rgba(0,0,0,0.1)",
    lg: "0 10px 30px rgba(0,0,0,0.15)",
  },
  font: {
    sans: "system-ui, -apple-system, sans-serif",
    mono: "ui-monospace, SFMono-Regular, monospace",
  },
});

export const dark = tl.createTheme("dark", {
  brand:   { primary: "#60a5fa" },
  text:    { default: "#f8fafc", muted: "#94a3b8", inverse: "#0f172a" },
  surface: { default: "#0f172a", muted: "#1e293b", border: "#334155" },
});
```

## 2. Apply the dark theme at the root

```tsx
// app/layout.tsx
import { TracelessRoot } from "traceless-style/dark";
import { dark } from "../theme/tokens";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><TracelessRoot /></head>
      {/* The body always has the dark class — TracelessRoot toggles `.dark` on <html>. */}
      <body className={dark}>{children}</body>
    </html>
  );
}
```

## 3. Consume tokens

Member access:

```tsx
// components/Card.tsx
import { tl } from "traceless-style";
import { tokens } from "../theme/tokens";

const $ = tl.create({
  card: {
    background:    tokens.surface.default,
    color:         tokens.text.default,
    border:        `1px solid ${"" /* see below */}`,        // ← can't compose
    borderColor:   tokens.surface.border,
    padding:       tokens.spacing.md,
    borderRadius:  tokens.radius.md,
    boxShadow:     tokens.shadow.sm,
    fontFamily:    tokens.font.sans,
  },
});
```

> **Note**: traceless-style's strict literal-only AST parser doesn't allow template literals, so you can't compose strings (e.g. `` `1px solid ${tokens.x}` ``). Use a separate `borderColor: tokens.x` declaration.

`tl.cssVar` (no import needed):

```ts
tl.create({
  card: {
    background: tl.cssVar("surface-default"),
    color:      tl.cssVar("text-default"),
    padding:    tl.cssVar("spacing-md"),
  },
});
```

## 4. Type-safe token names

```ts
import type { TokenKeyOf } from "traceless-style";
import { tokens } from "../theme/tokens";

type AppToken = TokenKeyOf<typeof tokens>;
//   = "brand-primary" | "brand-secondary" | "brand-danger"
//   | "text-default"  | "text-muted"  | "text-inverse"
//   | "surface-default" | "surface-muted" | "surface-border"
//   | "spacing-xs" | "spacing-sm" | … | "shadow-lg"
//   | "font-sans" | "font-mono"

tl.cssVar<AppToken>("brand-primary");   // ✓
tl.cssVar<AppToken>("brand-typo");       // ✗ TS error at compile time
```

## 5. Debug if a token isn't expanding

```bash
TRACELESS_STYLE_DEBUG_RESOLVE=1 npx traceless-style
```

Prints the per-file token export registry. Common causes:

- Missing `export` keyword on the `defineTokens` call.
- Path-alias misconfigured in `tsconfig.json compilerOptions.paths`.
- Typo in the leaf path passed to `tl.cssVar`.

## See also

- [Design tokens & themes](../learn/06-tokens-and-themes.md)
- [Cross-file token resolution (full table)](../reference/cross-file-resolution.md)
