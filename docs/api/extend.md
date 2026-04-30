# `tl.extend`

Register custom variants. Both runtime and compiler discover them — at build time, Pass 1 scans every file for `tl.extend({ variants: {...} })` calls, merges them into a single map, and Pass 2 uses that map when transforming `tl.create` calls. No central config required.

## Signature

```ts
function extend(options: ExtendOptions): TracelessStyleInstance;

interface ExtendOptions {
  variants: Record<string, string>;
  prefix?:  string;
}

interface TracelessStyleInstance {
  create:   typeof create;
  merge:    typeof merge;
  cx:       typeof cx;
  variants: FlatVariants;
  errors:   VariantValidationError[];
}
```

## Examples

### Simple custom variants

```ts
import { tl } from "traceless-style";

tl.extend({
  variants: {
    _tablet:    "@media (min-width: 900px)",
    _retina:    "@media (-webkit-min-device-pixel-ratio: 2)",
    _brand:     ".my-brand &",
    _hoverDark: ":is(.dark *):hover",
  },
});

// Use anywhere:
const $ = tl.create({
  card: {
    padding: "1rem",
    _tablet: { padding: "2rem" },
    _brand:  { color: "gold" },
  },
});
```

### Using the returned instance

`tl.extend` returns an instance whose `create`/`merge`/`cx` are bound with the custom variants. You can use it instead of the global `tl`:

```ts
const $$ = tl.extend({ variants: { _tablet: "@media (min-width: 900px)" } });

// Both global and returned forms work — variants are registered in one place.
$$.create({ card: { _tablet: { padding: "2rem" } } });
tl.create({ card: { _tablet: { padding: "2rem" } } });    // also works
```

### Validation errors

If a variant key or selector is invalid, the error is in the returned `.errors` array:

```ts
const result = tl.extend({
  variants: {
    "1bad": "...",       // invalid identifier
    foo:    "color: red; }", // CSS-injection
  },
});
console.log(result.errors);
// [
//   { key: "1bad", message: "Variant key must be a valid identifier" },
//   { key: "foo",  message: "Invalid selector: contains '}' or ';'" },
// ]
```

These errors are also surfaced as `console.warn` at runtime.

## Selector forms

| Form | Example | Compiled to |
|---|---|---|
| Pseudo-class | `_xyz: ":xyz"` | `.tl<hash>:xyz { … }` |
| Pseudo-element | `_xyz: "::xyz"` | `.tl<hash>::xyz { … }` |
| `&`-anchored ancestor | `_xyz: ".parent &"` | `.parent .tl<hash> { … }` |
| `&`-anchored sibling | `_xyz: ".peer ~ &"` | `.peer ~ .tl<hash> { … }` |
| Media query | `_xyz: "@media …"` | `@media … { .tl<hash> { … } }` |
| Container query | `_xyz: "@container …"` | `@container … { .tl<hash> { … } }` |
| Supports query | `_xyz: "@supports …"` | `@supports … { .tl<hash> { … } }` |

If your selector uses a multi-step selector with `&`, the `&` is replaced by the unique class. If it uses a parent-style selector with no `&` (like `:is(.dark *)`), it's used as-is.

## Validation rules

Custom variant selectors are validated by `validateVariant()` (`src/compiler/variants.ts`):

- Selector must be a non-empty string.
- Variant key must be a valid JS identifier (or quoted with `"`).
- Selector cannot contain raw `;`, `}`, or other CSS-injection chars.
- `@media` / `@container` / `@supports` rules are recognized as at-rules.

## See also

- [Variants (concepts)](../learn/05-variants.md)
- [Built-in variants table](./variants-table.md)
