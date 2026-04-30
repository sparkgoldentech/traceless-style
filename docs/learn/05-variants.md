# Variants

A *variant* is a name that maps to a CSS selector or `@-rule`. Inside a `tl.create` style group, an object keyed by a variant name represents conditional styles:

```ts
tl.create({
  btn: {
    background:    "blue",
    _hover:    { background: "darkblue" },     // variant: pseudo-class
    sm:        { padding: "0.5rem" },          // variant: breakpoint
    _dark:     { background: "white" },        // variant: parent selector
    _disabled: { opacity: 0.5 },
  },
});
```

Variants stack — combine them by nesting:

```ts
tl.create({
  btn: {
    color: "white",
    _hover: {
      color: "lightblue",
      _dark: { color: "yellow" },               // dark + hover
    },
    sm: {
      _hover: { color: "darkblue" },            // small-screen hover
    },
  },
});
```

## Built-in variants

There are 76 built-in variants in five categories. Source of truth: `src/compiler/variants.ts` `BUILT_IN_VARIANTS`.

### Pseudo-classes (23)

| Name | Selector | Description |
|---|---|---|
| `_hover`         | `:hover`         | Mouse hover |
| `_focus`         | `:focus`         | Focus (any source) |
| `_focusWithin`   | `:focus-within`  | Focus on a descendant |
| `_focusVisible`  | `:focus-visible` | Visible-focus indicator |
| `_active`        | `:active`        | Mouse pressed |
| `_visited`       | `:visited`       | Visited link |
| `_disabled`      | `:disabled`      | Disabled element |
| `_enabled`       | `:enabled`       | Enabled element |
| `_checked`       | `:checked`       | Checked checkbox/radio |
| `_indeterminate` | `:indeterminate` | Indeterminate state |
| `_required`      | `:required`      | Required form field |
| `_optional`      | `:optional`      | Optional form field |
| `_valid`         | `:valid`         | Valid input |
| `_invalid`       | `:invalid`       | Invalid input |
| `_readOnly`      | `:read-only`     | Read-only |
| `_first`         | `:first-child`   | First child |
| `_last`          | `:last-child`    | Last child |
| `_firstOfType`   | `:first-of-type` | First of its type |
| `_lastOfType`    | `:last-of-type`  | Last of its type |
| `_only`          | `:only-child`    | Only child |
| `_odd`           | `:nth-child(odd)`  | Odd children |
| `_even`          | `:nth-child(even)` | Even children |
| `_empty`         | `:empty`         | No children |

### Pseudo-elements (11)

| Name | Selector | Description |
|---|---|---|
| `_placeholder`        | `::placeholder`           | Input placeholder |
| `_before`             | `::before`                | `::before` pseudo-element |
| `_after`              | `::after`                 | `::after` pseudo-element |
| `_selection`          | `::selection`             | Highlighted selection |
| `_marker`             | `::marker`                | List marker |
| `_backdrop`           | `::backdrop`              | Dialog/fullscreen backdrop |
| `_fileSelectorButton` | `::file-selector-button`  | `<input type="file">` button |
| `_firstLetter`        | `::first-letter`          | First letter |
| `_firstLine`          | `::first-line`            | First line |
| `_targetText`         | `::target-text`           | URL-fragment-highlighted text |
| `_detailsContent`     | `::details-content`       | `<details>` content area |

### Parent / ancestor selectors (10)

| Name | Selector | Description |
|---|---|---|
| `_dark`         | `:is(.dark *)`        | Dark mode (class strategy) |
| `_light`        | `:not(.dark) &`       | Light mode |
| `_rtl`          | `[dir="rtl"] &`       | Right-to-left |
| `_ltr`          | `[dir="ltr"] &`       | Left-to-right |
| `_groupHover`   | `.group:hover &`      | Hover on a `.group` ancestor |
| `_groupFocus`   | `.group:focus &`      | Focus on a `.group` ancestor |
| `_groupActive`  | `.group:active &`     | Active on a `.group` ancestor |
| `_peerHover`    | `.peer:hover ~ &`     | Sibling `.peer` is hovered |
| `_peerFocus`    | `.peer:focus ~ &`     | Sibling `.peer` is focused |
| `_peerChecked`  | `.peer:checked ~ &`   | Sibling `.peer` is checked |
| `_peerDisabled` | `.peer:disabled ~ &`  | Sibling `.peer` is disabled |

### Responsive breakpoints (5)

| Name  | Min width | Tailwind equivalent |
|---|---|---|
| `sm`   | 640 px  | `sm:` |
| `md`   | 768 px  | `md:` |
| `lg`   | 1024 px | `lg:` |
| `xl`   | 1280 px | `xl:` |
| `2xl`  | 1536 px | `2xl:` |

### Container queries (3)

| Name           | Selector |
|---|---|
| `_containerSm` | `@container (min-width: 480px)` |
| `_containerMd` | `@container (min-width: 768px)` |
| `_containerLg` | `@container (min-width: 1024px)` |

### Special media queries (10)

| Name | Selector |
|---|---|
| `print`         | `@media print` |
| `portrait`      | `@media (orientation: portrait)` |
| `landscape`     | `@media (orientation: landscape)` |
| `motionSafe`    | `@media (prefers-reduced-motion: no-preference)` |
| `motionReduce`  | `@media (prefers-reduced-motion: reduce)` |
| `contrastMore`  | `@media (prefers-contrast: more)` |
| `darkOS`        | `@media (prefers-color-scheme: dark)` |
| `lightOS`       | `@media (prefers-color-scheme: light)` |
| `hover`         | `@media (hover: hover)` |
| `touch`         | `@media (hover: none) and (pointer: coarse)` |

## Custom variants

Add your own variants with `tl.extend({ variants: ... })`. Both runtime and compiler discover them — at build time, **Pass 1** scans every file for `tl.extend({ variants: {...} })` calls, merges them into a single map, and **Pass 2** uses that map when transforming `tl.create` calls. No central config required.

```ts
// app/variants.ts
import { tl } from "traceless-style";

export const $$ = tl.extend({
  variants: {
    _tablet:        "@media (min-width: 900px)",
    _retina:        "@media (-webkit-min-device-pixel-ratio: 2)",
    _brand:         ".my-brand &",
    _hoverDark:     ":is(.dark *):hover",
  },
});

// app/Card.tsx
const $ = tl.create({
  card: {
    padding: "1rem",
    _tablet: { padding: "2rem" },     // ✓ resolves to @media (min-width: 900px)
    _brand:  { color: "gold" },       // ✓ resolves to .my-brand & { color: gold }
  },
});
```

If your variant uses a multi-step selector with `&`, the `&` is replaced by a unique class. If it uses a parent-style selector with no `&` (like `:is(.dark *)`), it's used as-is.

## Validation rules for custom variants

Custom variant selectors are validated by `validateVariant()` (`src/compiler/variants.ts`):

- Selector must be a non-empty string.
- Variant key must be a valid JS identifier (or quoted with `"`).
- Selector cannot contain raw `;`, `}`, or other CSS-injection chars.
- `@media` / `@container` / `@supports` rules are recognized as at-rules and emitted at the top level.

Any validation failure becomes a build error pointing at the `tl.extend` call site.

## Stacking variants

Variants can be nested inside one another. Each level extends the selector of the parent:

```ts
tl.create({
  btn: {
    background: "blue",
    _hover:  { background: "darkblue",
      _dark: { background: "black"  },     // → :is(.dark *):hover
    },
    sm: {                                  // → @media (min-width: 640px) { … }
      _hover: { background: "navy" },      // → @media (min-width: 640px) { :hover { … } }
    },
  },
});
```

Order doesn't matter for the compiled CSS — each unique `(property, value, selector)` combination becomes one rule, regardless of where it appeared in the source tree.

## Variants vs. raw selectors

Sometimes you need a one-off selector that isn't worth defining as a custom variant. Any object key starting with `:`, `&`, `[`, `.`, `@`, or `>` is treated as a **raw selector pass-through**:

```ts
tl.create({
  list: {
    listStyle: "none",
    "& > li:not(:first-child)": { borderTop: "1px solid #eee" },
    "@media (min-resolution: 2dppx)": { borderWidth: "0.5px" },
  },
});
```

Raw selectors are still validated for injection-safety, but they are not stored in the variant registry.

Continue to [6. Design tokens & themes](./06-tokens-and-themes.md).
