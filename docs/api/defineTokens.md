# `tl.defineTokens`

Declare design tokens. Compiles to CSS custom properties at `:root` and returns a typed nested object whose leaves are `var(--tl-<hash>)` references.

## Signature

```ts
function defineTokens<T extends Record<string, unknown>>(map: T): FlatTokens<T>;

type FlatTokens<T> = T extends Record<string, infer V>
  ? V extends string | number
    ? { [K in keyof T]: string }
    : V extends Record<string, unknown>
      ? { [K in keyof T]: FlatTokens<V> }
      : never
  : never;
```

## Example

```ts
const tokens = tl.defineTokens({
  brand: {
    primary:   "#3b82f6",
    secondary: "#10b981",
  },
  spacing: {
    sm: "0.5rem",
    md: "1rem",
    lg: "2rem",
  },
});

// Type:
//   typeof tokens === {
//     brand:   { primary: string; secondary: string };
//     spacing: { sm: string; md: string; lg: string };
//   }
//
// Runtime values:
//   tokens.brand.primary === "var(--tl-aaaaaaaa)"
//   tokens.spacing.md    === "var(--tl-bbbbbbbb)"
//
// Emitted CSS:
//   :root {
//     --tl-aaaaaaaa: #3b82f6;
//     --tl-bbbbbbbb: 1rem;
//     ...
//   }
```

Use the returned tokens in `tl.create`:

```ts
const $ = tl.create({
  btn: {
    color:   tokens.brand.primary,
    padding: tokens.spacing.md,
  },
});
```

## Cross-file resolution

You can `defineTokens` in one file and use them in another — see [Cross-file token resolution](../reference/cross-file-resolution.md). Supported import forms include named, namespace, default, path-aliased, bare specifier, and re-export.

## Hashing

Each leaf path is hashed with `fnv32a("token:" + dashedPath)` and prefixed with `--tl-`. Identical paths in different files produce identical hashes — the `:root` rule is emitted once.

## See also

- [Design tokens & themes](../learn/06-tokens-and-themes.md)
- [`tl.cssVar`](./cssVar.md)
- [`tl.createTheme`](./createTheme.md)
- [Cross-file token resolution](../reference/cross-file-resolution.md)
