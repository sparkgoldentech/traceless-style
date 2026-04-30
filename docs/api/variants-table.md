# Built-in variants table

Every variant key built into traceless-style. Source of truth: `src/compiler/variants.ts` `BUILT_IN_VARIANTS`.

## Pseudo-classes (23)

| Key | Selector | Description |
|---|---|---|
| `_hover` | `:hover` | Mouse hover |
| `_focus` | `:focus` | Focus (any source) |
| `_focusWithin` | `:focus-within` | Focus on a descendant |
| `_focusVisible` | `:focus-visible` | Visible-focus indicator |
| `_active` | `:active` | Mouse pressed |
| `_visited` | `:visited` | Visited link |
| `_disabled` | `:disabled` | Disabled element |
| `_enabled` | `:enabled` | Enabled element |
| `_checked` | `:checked` | Checked checkbox/radio |
| `_indeterminate` | `:indeterminate` | Indeterminate state |
| `_required` | `:required` | Required form field |
| `_optional` | `:optional` | Optional form field |
| `_valid` | `:valid` | Valid input |
| `_invalid` | `:invalid` | Invalid input |
| `_readOnly` | `:read-only` | Read-only |
| `_first` | `:first-child` | First child |
| `_last` | `:last-child` | Last child |
| `_firstOfType` | `:first-of-type` | First of its type |
| `_lastOfType` | `:last-of-type` | Last of its type |
| `_only` | `:only-child` | Only child |
| `_odd` | `:nth-child(odd)` | Odd children |
| `_even` | `:nth-child(even)` | Even children |
| `_empty` | `:empty` | Empty element |

## Pseudo-elements (11)

| Key | Selector | Description |
|---|---|---|
| `_placeholder` | `::placeholder` | Input placeholder |
| `_before` | `::before` | `::before` |
| `_after` | `::after` | `::after` |
| `_selection` | `::selection` | Highlighted selection |
| `_marker` | `::marker` | List marker |
| `_backdrop` | `::backdrop` | Dialog/fullscreen backdrop |
| `_fileSelectorButton` | `::file-selector-button` | `<input type="file">` button |
| `_firstLetter` | `::first-letter` | First letter |
| `_firstLine` | `::first-line` | First line |
| `_targetText` | `::target-text` | URL-fragment-highlighted text |
| `_detailsContent` | `::details-content` | `<details>` content area |

## Parent / ancestor selectors (10)

| Key | Selector | Description |
|---|---|---|
| `_dark` | `:is(.dark *)` | Dark mode (class strategy) |
| `_light` | `:not(.dark) &` | Light mode |
| `_rtl` | `[dir="rtl"] &` | Right-to-left |
| `_ltr` | `[dir="ltr"] &` | Left-to-right |
| `_groupHover` | `.group:hover &` | Hover on a `.group` ancestor |
| `_groupFocus` | `.group:focus &` | Focus on a `.group` ancestor |
| `_groupActive` | `.group:active &` | Active on a `.group` ancestor |
| `_peerHover` | `.peer:hover ~ &` | Sibling `.peer` is hovered |
| `_peerFocus` | `.peer:focus ~ &` | Sibling `.peer` is focused |
| `_peerChecked` | `.peer:checked ~ &` | Sibling `.peer` is checked |
| `_peerDisabled` | `.peer:disabled ~ &` | Sibling `.peer` is disabled |

## Responsive breakpoints (5)

| Key | Min width | Tailwind equivalent |
|---|---|---|
| `sm` | 640 px | `sm:` |
| `md` | 768 px | `md:` |
| `lg` | 1024 px | `lg:` |
| `xl` | 1280 px | `xl:` |
| `2xl` | 1536 px | `2xl:` |

## Container queries (3)

| Key | Selector |
|---|---|
| `_containerSm` | `@container (min-width: 480px)` |
| `_containerMd` | `@container (min-width: 768px)` |
| `_containerLg` | `@container (min-width: 1024px)` |

## Special media queries (10)

| Key | Selector |
|---|---|
| `print` | `@media print` |
| `portrait` | `@media (orientation: portrait)` |
| `landscape` | `@media (orientation: landscape)` |
| `motionSafe` | `@media (prefers-reduced-motion: no-preference)` |
| `motionReduce` | `@media (prefers-reduced-motion: reduce)` |
| `contrastMore` | `@media (prefers-contrast: more)` |
| `darkOS` | `@media (prefers-color-scheme: dark)` |
| `lightOS` | `@media (prefers-color-scheme: light)` |
| `hover` | `@media (hover: hover)` |
| `touch` | `@media (hover: none) and (pointer: coarse)` |

## Total: 62 built-in variants

Add custom variants with [`tl.extend`](./extend.md).
