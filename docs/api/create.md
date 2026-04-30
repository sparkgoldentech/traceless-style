# `tl.create`

The core API. Compiles a literal style-object map into atomic class names.

## Signature

```ts
function create<T extends StyleMap>(map: T): ResolvedStyleMap<T>;

type StyleMap = Record<string, StyleDef>;

type StyleDef = {
  [K in CSSPropertyName]?: string | number;
} & {
  [K in BuiltInVariantKey | CustomVariantKey]?: StyleDef;
} & {
  [K in `:${string}` | `&${string}` | `[${string}` | `.${string}` | `@${string}` | `>${string}`]?: StyleDef;
} & {
  _autoDark?: false;
  _autoRtl?: false;
  _skipContrast?: true;
  _layer?: string;
  _bundle?: string;
};

type ResolvedStyleMap<T> = { [K in keyof T]: string };
```

## Examples

### Single rule

```ts
const $ = tl.create({
  card: { padding: "1rem", background: "white" },
});
// → { card: "tla1b2c3d4 tle5f6g7h8" }
```

### Multiple groups

```ts
const $ = tl.create({
  card:  { padding: "1rem" },
  title: { fontSize: "1.25rem", fontWeight: 600 },
});
```

### Variants

```ts
const $ = tl.create({
  link: {
    color: "blue",
    _hover:    { textDecoration: "underline" },
    _focus:    { outline: "2px solid currentColor" },
    _disabled: { color: "gray", pointerEvents: "none" },
  },
});
```

### Breakpoints

```ts
tl.create({
  layout: {
    display: "grid",
    gridTemplateColumns: "1fr",
    md: { gridTemplateColumns: "1fr 1fr" },
    lg: { gridTemplateColumns: "1fr 1fr 1fr" },
  },
});
```

### Dark mode (manual override)

```ts
tl.create({
  surface: {
    background: "white",
    _dark: { background: "#0a0a0a" },
  },
});
```

(For most colors, the auto-dark compiler pass derives this for you. See [Dark mode](../learn/08-dark-mode.md).)

### Raw selectors

```ts
tl.create({
  list: {
    listStyle: "none",
    "& > li:not(:first-child)": { marginTop: "0.5rem" },
    "@supports (display: grid)": { display: "grid" },
  },
});
```

## Allowed values

| Type | Example |
|---|---|
| String literal | `"red"`, `"1rem"`, `"linear-gradient(...)"` |
| Number literal | `8` (px-coerced for length-typed properties; raw for unitless properties) |
| Token reference | `tokens.brand.primary`, `tl.cssVar("brand-primary")` |
| Nested object | `{ _hover: { ... } }`, `{ "@supports (...)": { ... } }` |

**Not allowed** (compile-time error):
- Variables: `{ color: myVar }`
- Function calls: `{ color: getColor() }`
- Template literals: `` { color: `${a}-${b}` } ``
- Spreads: `{ ...other }`
- Computed keys: `{ [k]: v }`

## Compile output

For `tl.create({ btn: { color: "white", padding: "8px" } })`:

1. The CSS file gains:
   ```css
   .tla1b2c3d4 { color: white; }
   .tle5f6g7h8 { padding: 8px; }
   ```
2. The call site is rewritten to:
   ```ts
   const $ = { btn: "tla1b2c3d4 tle5f6g7h8" };
   ```

## Runtime fallback

If the compiler transform didn't run (Server Components without bundler hook, Vitest without setup, raw Node), `tl.create` runs at runtime and produces **the same class names** via the duplicated FNV-1a hash. The CSS rules themselves still come from the static stylesheet — no rules are emitted at runtime.

This means: server-rendered HTML, client-rendered HTML, and statically-extracted HTML all reference the same atomic classes for the same input, regardless of which path runs.

## See also

- [Defining styles with `tl.create`](../learn/04-defining-styles.md)
- [Variants](../learn/05-variants.md)
- [`tl.merge`](./merge.md)
- [`tl.cx`](./cx.md)
