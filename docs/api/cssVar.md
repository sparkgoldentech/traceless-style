# `tl.cssVar`

Reference a token's CSS variable by its dash-joined leaf path.

## Signature

```ts
function cssVar<T extends string = string>(name: T): string;
```

## Examples

### Basic usage

```ts
const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });

tl.cssVar("brand-primary");
// → "var(--tl-aaaaaaaa)"
```

The hash for `cssVar("brand-primary")` is identical to the hash `defineTokens` computed for `tokens.brand.primary`, so they produce the same CSS variable reference.

### With type checking

Constrain the argument to leaf keys of a known token map:

```ts
import type { TokenKeyOf } from "traceless-style";

const tokens = tl.defineTokens({
  brand:   { primary: "#3b82f6", secondary: "#10b981" },
  spacing: { sm: "0.5rem", md: "1rem" },
});

type MyTokens = TokenKeyOf<typeof tokens>;
//  → "brand-primary" | "brand-secondary" | "spacing-sm" | "spacing-md"

tl.cssVar<MyTokens>("brand-primary");      // ✓
tl.cssVar<MyTokens>("brand-typo");          // ✗ TS2322: Argument of type '"brand-typo"' is not assignable
```

### Without the generic

The plain form accepts any string (back-compat):

```ts
tl.cssVar("any-name");      // → "var(--tl-<hash-of-any-name>)"
```

This works at runtime but won't validate against a token shape.

## When to use `tl.cssVar` vs member access

| | `tokens.brand.primary` | `tl.cssVar("brand-primary")` |
|---|---|---|
| Source of truth | a `defineTokens` call | a string |
| Compile-time validation | always (member must exist) | with `<TokenKeyOf<typeof tokens>>` generic |
| Cross-file imports | requires `import { tokens }` | works without import |
| Refactor-safety (rename) | TS errors at use site | breaks silently unless typed |

For most code, prefer member access (`tokens.x.y`). Use `tl.cssVar` when you don't have a reference to the token map (e.g. in a shared utility module that doesn't import the design system file).

## See also

- [Design tokens & themes](../learn/06-tokens-and-themes.md)
- [`tl.defineTokens`](./defineTokens.md)
- [Types: `TokenKeyOf<T>`](./types.md)
