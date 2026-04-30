# Recipe: Responsive layout

Use breakpoint variants for viewport-relative sizing, container queries for element-relative sizing.

## Viewport breakpoints

```ts
const $ = tl.create({
  layout: {
    display:             "grid",
    gridTemplateColumns: "1fr",            // mobile-first: 1 column
    gap:                 "1rem",

    md: { gridTemplateColumns: "1fr 1fr"      },   // ≥ 768 px → 2
    lg: { gridTemplateColumns: "1fr 1fr 1fr"  },   // ≥ 1024 px → 3
    xl: { gridTemplateColumns: "repeat(4, 1fr)" }, // ≥ 1280 px → 4
  },
});
```

Built-in breakpoints: `sm` (640), `md` (768), `lg` (1024), `xl` (1280), `2xl` (1536).

For non-standard breakpoints, define a custom variant:

```ts
tl.extend({
  variants: {
    _tablet: "@media (min-width: 900px)",
    _wide:   "@media (min-width: 1440px)",
  },
});
```

## Container queries

When a component should adapt to **its parent's width** (not the viewport), use container queries:

```ts
const $ = tl.create({
  container: {
    containerType: "inline-size",         // declare the parent
    containerName: "card",                // optional, named queries
  },

  card: {
    display:     "block",
    padding:     "1rem",

    _containerSm: { display: "flex", gap: "1rem" },     // parent ≥ 480px
    _containerMd: { padding: "2rem"                  }, // parent ≥ 768px
  },
});
```

```tsx
<aside className={$.container}>
  <article className={$.card}>…</article>
</aside>
```

The card adapts to the `<aside>` width regardless of viewport size.

## Mobile-first vs desktop-first

traceless-style is mobile-first by default (breakpoints are `min-width`). To go desktop-first, use a custom variant:

```ts
tl.extend({
  variants: {
    _maxMd: "@media (max-width: 767px)",
  },
});

tl.create({
  card: {
    display: "block",
    _maxMd: { display: "none" },
  },
});
```

## Showing/hiding by viewport

```ts
const $ = tl.create({
  mobileOnly:   { display: "block",  md: { display: "none"  } },
  desktopOnly:  { display: "none",   md: { display: "block" } },
});
```

## Stacking variants

Combine breakpoints with state:

```ts
tl.create({
  btn: {
    background: "blue",
    _hover: { background: "darkblue" },

    md: {
      background: "navy",                    // different default at md
      _hover: { background: "midnightblue" },// different hover at md
    },
  },
});
```

## See also

- [Variants](../learn/05-variants.md)
- [Built-in variants table](../api/variants-table.md)
