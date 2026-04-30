# Defining styles with `tl.create`

`tl.create` is the entry point for almost everything in traceless-style.

```ts
import { tl } from "traceless-style";

const $ = tl.create({
  card: {
    display:        "flex",
    flexDirection:  "column",
    padding:        "1rem",
    background:     "#ffffff",
    borderRadius:   "8px",
    boxShadow:      "0 1px 3px rgba(0,0,0,0.1)",
    _hover: {
      boxShadow:    "0 4px 12px rgba(0,0,0,0.15)",
    },
  },
  title: {
    fontSize:       "1.25rem",
    fontWeight:     600,
    marginBottom:   "0.5rem",
  },
});
```

After compilation:

```ts
const $ = {
  card:  "tl12abcd34 tl56efgh78 tl9ab0c1d2 tl3e4f5g6h tl7i8j9k0l tlmnopqrst tluvwxyz12",
  title: "tl34567890 tlabcdefgh tlijklmnop",
};
```

## The shape of the input

`tl.create` accepts a single argument: an object whose **keys are arbitrary names you choose** (`btn`, `card`, `header`) and whose **values are style definitions**.

A style definition is an object whose:

- **String/number values** are CSS declarations: `{ color: "red", padding: 8 }` (numbers without units default to `px` for length-typed properties).
- **Object values keyed by a variant name** are conditional rules: `{ _hover: { color: "blue" } }`.
- **Object values keyed by a raw selector** are pass-throughs: `{ "&:nth-child(3)": { background: "yellow" } }`.

```ts
tl.create({
  myStyle: {
    /* literal declarations */
    color:        "white",
    padding:      "1rem",
    fontSize:     16,                              // → 16px

    /* variants (built-in or custom) */
    _hover:   { color: "lightblue" },
    sm:       { padding: "0.5rem" },               // breakpoint
    _dark:    { background: "black" },             // dark mode

    /* raw selector / @-rule pass-through */
    "&:nth-child(odd)": { background: "#f0f0f0" },
    "@supports (display: grid)": { display: "grid" },
  },
});
```

## What you cannot put inside

The argument to `tl.create` is parsed by a **strict literal-only AST parser** — variables, function calls, template literals, and array spreads are rejected:

```ts
const myColor = "red";

tl.create({
  bad: {
    color: myColor,                  // ✗ ParseError: Variable not supported — use a literal
    padding: `${baseSpacing}rem`,    // ✗ ParseError
    background: getColor(),          // ✗ ParseError
  },
});
```

The reason: traceless-style **needs to know every value at compile time** to emit the matching CSS rule. If you need dynamic values, the right tool is design tokens — see [Design tokens & themes](./06-tokens-and-themes.md):

```ts
const tokens = tl.defineTokens({
  brand: { primary: "#3b82f6" },
  spacing: { sm: "0.5rem" },
});

tl.create({
  good: {
    color:   tokens.brand.primary,        // ✓ resolved to "var(--tl-...)" at compile time
    padding: tl.cssVar("spacing-sm"),     // ✓ same
  },
});
```

There is also a small set of compile-time control keys that **do** accept literal `boolean` or arbitrary literals:

| Key | Type | Meaning |
|---|---|---|
| `_autoDark`  | `false`             | Disable auto dark-mode derivation for this group |
| `_autoRtl`   | `false`             | Disable auto RTL rewriting for this group |
| `_skipContrast` | `true`           | Skip WCAG contrast validation for this group |
| `_layer`     | `string`            | Wrap rules in `@layer <name>` |
| `_bundle`    | `string`            | Emit rules to a separate CSS bundle (e.g. `_bundle: "feed"` → `traceless-feed.css`) |

## Return type

`tl.create` returns a typed object with the same keys as the input, where each value is `string`:

```ts
const $ = tl.create({
  btn: { color: "red" },
});

type T = typeof $;          // { btn: string }
```

For component design-system authors who want to discriminate "this is a traceless-style class string" from arbitrary user input, the `TracelessClass` branded type lets you tighten the contract:

```ts
import type { TracelessClass } from "traceless-style";

function Button(props: { className?: TracelessClass }) { /* ... */ }

<Button className={$.btn} />                   // ✓
<Button className={"foo bar" as TracelessClass} /> // ✓ explicit cast — visible
<Button className="foo bar" />                 // ✗ type error
```

## Property allowlist

Every key must be a known CSS property, a CSS variable (`--my-var`), or a vendor-prefixed property. The full allowlist is in `src/compiler/css-properties.ts` (~250 entries). Unknown keys raise a build error with a Levenshtein-suggested replacement:

```
✗ Unknown CSS property 'colour' — did you mean 'color'?
  app/Button.tsx:4:5
    colour: "red",
    ~~~~~~
```

See [Property allowlist](../api/properties.md) for the full list.

## Numeric values & unit handling

Numbers are *not* automatically suffixed with `px`. The CSS spec requires units on length-typed properties; traceless-style passes the literal value through:

```ts
{ padding: 8 }     // → "padding: 8px;"   (length-typed property — special-cased)
{ flexGrow: 1 }    // → "flex-grow: 1;"   (unitless — works)
{ lineHeight: 1.5 }// → "line-height: 1.5;" (unitless — works)
{ width: "100%" }  // → "width: 100%;"
```

The list of length-typed properties that get `px`-coerced is curated alongside the allowlist. Other numeric properties pass through unchanged. The general rule: **prefer string units for unambiguous CSS** (`"8px"`, not `8`).

## Composition

Multiple `tl.create` calls compose freely:

```ts
const layout  = tl.create({ row: { display: "flex" } });
const spacing = tl.create({ tight: { gap: "0.5rem" } });
const colors  = tl.create({ primary: { color: "blue" } });

<div className={`${layout.row} ${spacing.tight} ${colors.primary}`} />
```

For conflict resolution between groups, use [`tl.merge`](./10-merge-and-cx.md):

```ts
const base    = tl.create({ btn: { color: "white" } });
const danger  = tl.create({ d:   { color: "red"   } });

<button className={tl.merge(base.btn, danger.d)} />
// → tl<color-red>     (color:white dropped — last wins)
```

## What happens at build time

The compiler:

1. Locates every `tl.create(...)` call (skipping calls inside strings/comments).
2. Parses the argument with the strict literal-only AST parser.
3. Walks the style tree:
   - Validates each property against the allowlist.
   - Validates each value against injection / Unicode / control-char rules.
   - Auto-rewrites physical properties to logical (RTL) unless `_autoRtl: false`.
   - Auto-derives a dark variant of color values unless `_autoDark: false`.
4. Hashes each `(property, value, selector?)` triplet to an 8-char base36 class name.
5. Registers the rule into the global atomic registry.
6. Rewrites the call site to `{ key: "tla1b2c3d4 tlb5c6d7e8 …" }`.

See [The compiler](./11-the-compiler.md) for full pipeline details.

## Quick reference

| Capability | Syntax |
|---|---|
| Set a property | `{ color: "red" }` |
| Pseudo-class | `{ _hover: { color: "blue" } }` |
| Breakpoint | `{ sm: { padding: "1rem" } }` |
| Dark mode override | `{ _dark: { background: "black" } }` |
| RTL override | `{ _rtl: { textAlign: "right" } }` |
| Raw selector | `{ "&:nth-child(3)": { ... } }` |
| Container query | `{ _containerMd: { ... } }` |
| Media query | `{ print: { ... } }` |
| Disable auto-dark | `{ _autoDark: false }` |
| Disable auto-rtl | `{ _autoRtl: false }` |
| Skip contrast check | `{ _skipContrast: true }` |
| CSS variable | `{ "--brand-primary": "#3b82f6" }` |

Continue to [5. Variants](./05-variants.md).
