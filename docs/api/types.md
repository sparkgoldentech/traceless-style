# Types

This page lists the TypeScript types exported by `traceless-style`.

## Core API types

### `TracelessClass`

Branded class-name string. Component props can declare `className?: TracelessClass` to communicate "this expects a `tl.create` / `tl.merge` / `tl.cx` output."

```ts
import type { TracelessClass } from "traceless-style";

function Button(props: { className?: TracelessClass; children: React.ReactNode }) {
  return <button className={props.className}>{props.children}</button>;
}

const $ = tl.create({ btn: { color: "blue" } });

<Button className={$.btn} />                          // ✓
<Button className={"foo" as TracelessClass} />        // ✓ (explicit cast)
<Button className="foo" />                            // ✗ TS error
```

The brand is structural and erased at runtime — no overhead.

### `TokenKeyOf<T>`

Recursive mapped type. Extracts every dash-joined leaf path from a `defineTokens` shape.

```ts
const tokens = tl.defineTokens({
  brand:   { primary: "#3b82f6", secondary: "#10b981" },
  spacing: { sm: "0.5rem", md: "1rem" },
});

type MyTokens = TokenKeyOf<typeof tokens>;
// → "brand-primary" | "brand-secondary" | "spacing-sm" | "spacing-md"

tl.cssVar<MyTokens>("brand-primary");      // ✓
tl.cssVar<MyTokens>("brand-typo");          // ✗ compile error
```

### `StyleDef<TVariants>`

The shape of a single style group inside `tl.create({ key: { ... } })`. CSS properties + variant objects + raw selectors + control keys.

### `StyleMap`

`Record<string, StyleDef>` — the argument shape of `tl.create`.

### `ResolvedStyleMap<T>`

`{ [K in keyof T]: string }` — the return shape of `tl.create`.

### `ExtendOptions`

```ts
interface ExtendOptions {
  variants: Record<string, string>;
  prefix?:  string;
}
```

### `TracelessStyleInstance`

What `tl.extend(...)` returns:

```ts
interface TracelessStyleInstance {
  create:   typeof create;
  merge:    typeof merge;
  cx:       typeof cx;
  variants: FlatVariants;
  errors:   VariantValidationError[];
}
```

### `VariantValidationError`

```ts
interface VariantValidationError {
  key:     string;
  message: string;
}
```

## Variant types

### `BuiltInVariantKey`

Union of every built-in variant name. ~50 entries — see [Built-in variants table](./variants-table.md).

### `FlatVariants`

`Record<string, string>` — flat selector map (variant key → selector).

### `VariantRegistry`

```ts
type VariantRegistry = Record<string, VariantDefinition>;

interface VariantDefinition {
  selector: string;
  type:     "pseudo" | "parent" | "media" | "custom";
  description?: string;
}
```

## CSS property type

### `CSSProperties`

Re-exported from `traceless-style` — the comprehensive CSS property interface used by `tl.create` style-group typing. ~250 properties covering layout, typography, color, transform, transition, animation, SVG, print, logical, container queries, etc.

```ts
import type { CSSProperties } from "traceless-style";

function applyStyle(props: CSSProperties) { /* ... */ }
```

## Lint types

### `LintError`

```ts
interface LintError {
  rule:     "no-inline-styles" | "no-class-string" | "no-css-modules" | "no-tailwind";
  message:  string;
  file:     string;
  line:     number;
  col:      number;
  snippet?: string;
}
```

### `LintOptions`

```ts
interface LintOptions {
  noInlineStyles?: boolean;
  noClassString?:  boolean;
  noCSSModules?:   boolean;
  noTailwind?:     boolean;
  ignore?:         string[];
}
```

## Source files

The above types are exported from these source modules:

| Type | Source |
|---|---|
| `TracelessClass`, `TokenKeyOf`, `LocalExtendOptions` | `src/runtime/index.ts` |
| `StyleDef`, `StyleMap`, `ResolvedStyleMap`, `ExtendOptions`, `TracelessStyleInstance` | `src/types/traceless.ts` |
| `BuiltInVariantKey`, `FlatVariants`, `VariantRegistry`, `VariantDefinition` | `src/compiler/variants.ts` + `src/types/variants.ts` |
| `CSSProperties` | `src/types/css.ts` |
| `LintError`, `LintOptions` | `src/compiler/lint.ts` |
