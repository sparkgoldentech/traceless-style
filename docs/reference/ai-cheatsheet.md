# AI / LLM cheat sheet

Single-page reference designed for AI assistants and humans-in-a-hurry. Everything you need to write correct traceless-style code is here.

## Imports

```ts
import { tl } from "traceless-style";
import type { TracelessClass, TokenKeyOf, CSSProperties } from "traceless-style";
import { TracelessRoot, ThemeToggle, useTracelessDark, dark }      from "traceless-style/dark";
import { RtlToggle, useTracelessRtl, direction }                   from "traceless-style/rtl";
import { withTracelessStyle }                                      from "traceless-style/nextjs";
import { tracelessStyle }                                          from "traceless-style/vite";
import { tracelessStyle }                                          from "traceless-style/rollup";
import { tracelessStyle }                                          from "traceless-style/esbuild";
import { TracelessStyleWebpackPlugin, tracelessStyleLoader }       from "traceless-style/webpack";
```

## The 4 core APIs

### `tl.create(map)`

Compile a literal style object into atomic class names. Returns `{ key: "tla1b2c3d4 …" }`.

```ts
const $ = tl.create({
  btn: {
    padding:   "0.5rem 1rem",
    color:     "white",
    background: "blue",
    _hover:     { background: "darkblue" },     // pseudo-class
    _focusVisible: { outline: "2px solid" },
    sm:         { padding: "0.25rem 0.5rem" },  // breakpoint variant
    _dark:      { background: "navy" },         // optional manual dark override
    _rtl:       { textAlign: "right" },         // RTL override
    "@supports (backdrop-filter: blur(4px))": { backdropFilter: "blur(4px)" },
  },
});
// → $.btn === "tla1b2c3d4 tle5f6g7h8 …"
```

**Allowed values inside**: string literals, number literals, token member access (`tokens.x.y`), `tl.cssVar("...")`. **Not allowed**: variables, function calls, template literals, spreads, computed keys.

### `tl.merge(...inputs)`

Last-wins conflict-aware class joining. For each property, the latest input setting it wins. Falsy inputs ignored.

```ts
tl.merge($.base, isError && $.error, props.className);
```

### `tl.cx(...inputs)`

clsx-style conditional joining. No conflict resolution. Object-form supported.

```ts
tl.cx($.btn, isHover && $.hovered, { [$.disabled]: !canClick });
```

### `tl.extend({ variants })`

Register custom variants. Discoverable by both compiler (Pass 1) and runtime.

```ts
tl.extend({
  variants: {
    _tablet: "@media (min-width: 900px)",
    _brand:  ".my-brand &",
  },
});
```

## The 4 design-token APIs

```ts
// Define a token tree:
const tokens = tl.defineTokens({
  brand:   { primary: "#3b82f6", secondary: "#10b981" },
  spacing: { sm: "0.5rem", md: "1rem" },
});
// tokens.brand.primary === "var(--tl-aaaaaaaa)"

// Override tokens for a theme:
const dark = tl.createTheme("dark", {
  brand: { primary: "#60a5fa" },
});
// dark === "tlTheme<hash>"

// Reference a token by string path:
tl.cssVar("brand-primary");                 // → "var(--tl-aaaaaaaa)"
tl.cssVar<TokenKeyOf<typeof tokens>>("brand-primary"); // ✓ type-checked

// Declare a keyframe:
const fadeIn = tl.keyframes("fadeIn", {
  from: { opacity: 0 },
  to:   { opacity: 1 },
});
// fadeIn === "tlKf<hash>"
```

## All built-in variants (62)

**Pseudo-classes**: `_hover` `_focus` `_focusWithin` `_focusVisible` `_active` `_visited` `_disabled` `_enabled` `_checked` `_indeterminate` `_required` `_optional` `_valid` `_invalid` `_readOnly` `_first` `_last` `_firstOfType` `_lastOfType` `_only` `_odd` `_even` `_empty`

**Pseudo-elements**: `_placeholder` `_before` `_after` `_selection` `_marker` `_backdrop` `_fileSelectorButton` `_firstLetter` `_firstLine` `_targetText` `_detailsContent`

**Parent/ancestor**: `_dark` `_light` `_rtl` `_ltr` `_groupHover` `_groupFocus` `_groupActive` `_peerHover` `_peerFocus` `_peerChecked` `_peerDisabled`

**Breakpoints**: `sm` (640) `md` (768) `lg` (1024) `xl` (1280) `2xl` (1536)

**Container queries**: `_containerSm` (480) `_containerMd` (768) `_containerLg` (1024)

**Special media**: `print` `portrait` `landscape` `motionSafe` `motionReduce` `contrastMore` `darkOS` `lightOS` `hover` `touch`

## Control keys (set inside style groups)

| Key | Value | Effect |
|---|---|---|
| `_autoDark`    | `false` | Disable auto dark-mode for this group |
| `_autoRtl`     | `false` | Disable auto RTL for this group |
| `_skipContrast`| `true`  | Skip WCAG contrast audit for this group |
| `_layer`       | `string` | Wrap rules in `@layer <name>` |
| `_bundle`      | `string` | Emit rules to a separate CSS bundle |

## Lint rules (strict by default)

| Rule | Default | Purpose |
|---|---|---|
| `noInlineStyles` | ON (cannot be disabled) | Reject `style={{...}}` and `style="..."` |
| `noClassString`  | ON | Reject `className="literal-classes"` |
| `noCSSModules`   | ON | Reject `.module.css` imports |
| `noTailwind`     | ON | Reject Tailwind utility class names |

Override in `traceless-style.config.js`:

```js
module.exports = { lint: { noTailwind: false } };
```

## Common patterns

### Component with variants

```tsx
const $ = tl.create({
  base:    { padding: "0.5rem 1rem" },
  primary: { background: "blue", color: "white" },
  danger:  { background: "red",  color: "white" },
});

function Button({ variant = "primary", className }: { variant?: "primary"|"danger"; className?: TracelessClass }) {
  return <button className={tl.merge($.base, $[variant], className)} />;
}
```

### Dark mode (one line)

```tsx
import { TracelessRoot, ThemeToggle } from "traceless-style/dark";

// Root layout:
<html lang="en" suppressHydrationWarning>
  <head><TracelessRoot /></head>
  <body>{children}</body>
</html>

// Anywhere:
<ThemeToggle />
```

Auto-dark derives `_dark` variants of every color value automatically.

### RTL (one line)

```tsx
import { RtlToggle } from "traceless-style/rtl";
<RtlToggle />
```

Auto-RTL rewrites physical properties (`marginLeft`, `paddingRight`, `borderTopLeftRadius`, `left`, `textAlign: "left"`) to logical.

### Conditional state

```tsx
const cls = tl.cx(
  $.base,
  isActive   && $.active,
  isDisabled && $.disabled,
);
```

### Animation

```tsx
const fadeIn = tl.keyframes("fadeIn", { from: { opacity: 0 }, to: { opacity: 1 } });
const $ = tl.create({
  modal: {
    animation: `${fadeIn} 0.2s ease-in`,
    motionReduce: { animation: "none" },
  },
});
```

### Tokens

```ts
// theme/tokens.ts
export const tokens = tl.defineTokens({
  brand:   { primary: "#3b82f6" },
  spacing: { md: "1rem" },
});

// app/Card.tsx
import { tokens } from "@/theme/tokens";

const $ = tl.create({
  card: {
    color:   tokens.brand.primary,
    padding: tokens.spacing.md,
  },
});
```

## CLI

```bash
npx traceless-style                # extract once
npx traceless-style --watch        # extract + watch
npx traceless-style --dev          # pretty CSS, source comments
npx traceless-style init           # zero-config scaffolder
npx traceless-style audit          # repo-wide stats
npx traceless-style inspect <file> # describe one file's usage
```

Env vars:

- `TRACELESS_STYLE_PARSER=swc` — force SWC parser
- `TRACELESS_STYLE_DEBUG_RESOLVE=1` — print token export registry

## Outputs

- `public/traceless-style.css` — atomic CSS bundle.
- `public/traceless-style.css.map` — source map.
- `.traceless-style/class-meta.json` — `tl.merge` metadata (gitignored).
- `.traceless-style/cache.json` — file-level extraction cache (gitignored).

## DON'T

```ts
// ✗ variables
const c = "red"; tl.create({ x: { color: c } });

// ✗ template literals
tl.create({ x: { padding: `${size}px` } });

// ✗ inline styles (lint error)
<div style={{ padding: 16 }} />

// ✗ bare className strings (lint error)
<div className="px-4" />

// ✗ unknown CSS property
tl.create({ x: { colour: "red" } });   // → suggests "color"

// ✗ injection chars in values
tl.create({ x: { color: "red; }" } });  // → rejected
```

## DO

```ts
// ✓ token references
import { tokens } from "@/theme";
tl.create({ x: { color: tokens.brand.primary } });

// ✓ dynamic values via CSS custom properties
const $ = tl.create({ bar: { width: "var(--progress)" } });
ref.current.style.setProperty("--progress", `${pct}%`);

// ✓ tl.create with proper class application
<button className={$.btn} />
<button className={tl.merge($.btn, props.className)} />
<button className={tl.cx($.btn, isActive && $.active)} />

// ✓ component prop typing
function Btn(props: { className?: TracelessClass }) {...}

// ✓ keyframe in animation shorthand
const f = tl.keyframes("f", { from: {...}, to: {...} });
tl.create({ x: { animation: `${f} 0.2s` } });
```

## Mental model

1. `tl.create({...})` → atomic CSS classes are emitted; call site rewritten to `{ key: "tlxxx tlyyy" }`.
2. Each unique `(property, value, selector)` is **one** CSS class. Two components both using `padding: 8px` share the class.
3. `tl.merge(...)` resolves cross-class conflicts using compiler-injected metadata.
4. Tokens compile to CSS custom properties (`--tl-<hash>`); themes are class-name overrides.
5. Variables are not allowed in style values — use tokens or CSS custom properties for dynamism.
6. Dark mode and RTL are *automatic*; manual overrides only when needed.
7. The runtime fallback uses the same hash function as the compiler — Server Components, tests, and untransformed paths all produce identical class names.

## Source map

| Need to know | Read |
|---|---|
| Why this exists | `docs/learn/01-introduction.md` |
| How to get started | `docs/learn/02-installation.md` |
| Full `tl.create` reference | `docs/api/create.md` |
| All variants | `docs/api/variants-table.md` |
| All CSS properties accepted | `docs/api/properties.md` |
| Config file | `docs/api/config.md` |
| CLI | `docs/api/cli.md` |
| Architecture | `docs/reference/architecture.md` |
| Hash function | `docs/reference/hashing.md` |
| Demo project | `docs/demo/README.md` |
