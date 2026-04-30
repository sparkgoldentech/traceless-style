# `tl.createTheme`

Create a theme that overrides one or more design tokens. Returns a class name to apply to a wrapper element.

## Signature

```ts
function createTheme(
  name: string,
  overrides: Record<string, unknown>
): string;
```

## Example

```ts
const tokens = tl.defineTokens({
  brand: { primary: "#3b82f6" },
  text:  { default: "#0f172a", muted: "#64748b" },
});

const dark = tl.createTheme("dark", {
  brand: { primary: "#60a5fa" },
  text:  { default: "#f8fafc", muted: "#94a3b8" },
});

// Returns:
//   dark === "tlTheme<hash>"
//
// Emitted CSS:
//   .tlTheme<hash> {
//     --tl-<brand-primary>:  #60a5fa;
//     --tl-<text-default>:   #f8fafc;
//     --tl-<text-muted>:     #94a3b8;
//   }
```

Apply the class to a wrapper:

```tsx
<body className={dark}>
  {/* Inside, tokens.brand.primary === #60a5fa */}
  {children}
</body>
```

## Themes nest

Themes layer cleanly because they're CSS variable overrides:

```tsx
const compact = tl.createTheme("compact", { spacing: { md: "0.5rem" } });

<body className={dark}>
  <main className={compact}>
    {/* dark + compact */}
  </main>
</body>
```

## Combining themes

Use `tl.cx` (or just space-join) to apply multiple at once:

```tsx
<body className={tl.cx(dark, compact)}>...</body>
```

## Naming

The class name is `tlTheme<hash>` where `<hash>` is `fnv32a("theme:" + name)`. Identical names in different files produce identical class names — useful for cross-file theme references.

## Patterns

### Brand variants

```ts
const brandA = tl.createTheme("brand-a", { brand: { primary: "#3b82f6" } });
const brandB = tl.createTheme("brand-b", { brand: { primary: "#ec4899" } });
const brandC = tl.createTheme("brand-c", { brand: { primary: "#10b981" } });
```

### Density modes

```ts
const compact = tl.createTheme("compact", {
  spacing: { sm: "0.25rem", md: "0.5rem", lg: "1rem" },
});

const comfortable = tl.createTheme("comfortable", {
  spacing: { sm: "0.75rem", md: "1.5rem", lg: "3rem" },
});
```

### High-contrast accessibility theme

```ts
const highContrast = tl.createTheme("high-contrast", {
  text:    { default: "#000",    muted: "#333" },
  surface: { background: "#fff", border: "#000" },
});

// Apply when user toggles a11y preference:
<body className={prefersHighContrast ? highContrast : ""}>...</body>
```

## See also

- [Design tokens & themes](../learn/06-tokens-and-themes.md)
- [`tl.defineTokens`](./defineTokens.md)
- [`tl.cssVar`](./cssVar.md)
