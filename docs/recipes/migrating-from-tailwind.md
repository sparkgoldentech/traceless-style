# Recipe: Migrating from Tailwind

A side-by-side comparison + concrete migration steps.

## Mental model

| Tailwind | traceless-style |
|---|---|
| `className="px-4 py-2 bg-blue-500"` | `className={$.btn}` where `$ = tl.create({ btn: { padding: "0.5rem 1rem", background: "#3b82f6" } })` |
| `tailwind.config.js` `theme.colors.brand` | `tl.defineTokens({ brand: { primary: "#3b82f6" } })` |
| `bg-brand-500` | `tokens.brand.primary` (member access) |
| `dark:bg-slate-900` | Auto-derived (no manual override needed) |
| `hover:bg-blue-700` | `_hover: { background: "#1d4ed8" }` |
| `md:px-8` | `md: { padding: "0 2rem" }` |
| `@apply` in `.css` | inline literal styles in `tl.create` |
| `cn(...)` / `clsx` | `tl.cx(...)` (or `tl.merge` for last-wins) |
| `prettier-plugin-tailwindcss` | VS Code extension's "Sort tl.create keys" command |

## Mapping the most common utilities

```ts
// Tailwind                           // traceless-style
flex                                  display: "flex"
inline-flex                           display: "inline-flex"
grid                                  display: "grid"
hidden                                display: "none"
w-full                                width: "100%"
h-screen                              height: "100vh"
m-4                                   margin: "1rem"
mt-2                                  marginTop: "0.5rem"
px-4                                  paddingInline: "1rem"
py-2                                  paddingBlock: "0.5rem"
gap-4                                 gap: "1rem"
text-lg                               fontSize: "1.125rem"
font-bold                             fontWeight: 700
text-white                            color: "white"
bg-blue-500                           background: "#3b82f6"   /* or token */
border                                border: "1px solid"
border-gray-200                       borderColor: "#e5e7eb"
rounded                               borderRadius: "4px"
rounded-md                            borderRadius: "6px"
rounded-full                          borderRadius: "999px"
shadow                                boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
overflow-hidden                       overflow: "hidden"
transition                            transition: "all 150ms ease"
hover:bg-blue-700                     _hover: { background: "#1d4ed8" }
focus:outline-none                    _focus: { outline: "none" }
focus-visible:ring                    _focusVisible: { boxShadow: "0 0 0 3px ..." }
disabled:opacity-50                   _disabled: { opacity: 0.5 }
md:px-8                               md: { paddingInline: "2rem" }
dark:bg-slate-900                     /* often unnecessary — auto-dark handles it */
```

## Migration steps

### 1. Install traceless-style alongside Tailwind

You can run both temporarily. Disable the `noTailwind` lint rule during migration:

```js
// traceless-style.config.js
module.exports = {
  lint: { noTailwind: false },
};
```

### 2. Move your tailwind theme to `defineTokens`

```ts
// Before: tailwind.config.js
theme: {
  colors:  { brand: { 500: "#3b82f6", 600: "#2563eb" } },
  spacing: { 1: "0.25rem", 2: "0.5rem", 4: "1rem" },
}

// After: theme/tokens.ts
export const tokens = tl.defineTokens({
  brand:   { 500: "#3b82f6", 600: "#2563eb" },
  spacing: { 1: "0.25rem", 2: "0.5rem", 4: "1rem" },
});
```

### 3. Convert components one at a time

Start with leaf components (Button, Card, Avatar). Each conversion is local — caller code doesn't change because both produce a `className` string.

```tsx
// Before
<button className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-700">
  Save
</button>

// After
const $ = tl.create({
  btn: {
    paddingInline: "1rem",
    paddingBlock:  "0.5rem",
    background:    tokens.brand[500],
    color:         "white",
    borderRadius:  "6px",
    _hover:        { background: tokens.brand[600] },
  },
});

<button className={$.btn}>Save</button>
```

### 4. Replace `clsx` / `cn` with `tl.cx`

```ts
// Before
clsx("base-class", isActive && "active-class", { "disabled-class": isDisabled });

// After
tl.cx("base-class", isActive && "active-class", { "disabled-class": isDisabled });
```

For conflict-resolving merges (often what `cn` is used for in shadcn/ui):

```ts
// Before
cn("default-padding", className)

// After (last-wins)
tl.merge($.defaultStyles, className)
```

### 5. Drop Tailwind once converted

When no `className="utility-strings"` remains:

1. Re-enable `lint: { noTailwind: true }`.
2. Remove `tailwindcss` and its plugins from `package.json`.
3. Remove `tailwind.config.js` and `@tailwind base; @tailwind components; @tailwind utilities;` from your CSS.

## What you gain

- **No utility-class-string concatenation.** Your styles are JS objects with TS autocomplete.
- **Auto dark mode** without writing `dark:` 200 times.
- **Auto RTL** without writing `rtl:` either.
- **WCAG contrast validation** at build time.
- **Smaller CSS bundle** in most cases — atomic deduplication scales better than Tailwind's pre-emptive utility generation.
- **No JIT compiler step.** No `content` glob to maintain.

## What you give up

- **The `bg-red-500` shorthand.** You write the literal value or a token.
- **Apply directives.** Composing utilities in CSS is replaced by composing object literals in JS.
- **Plugins.** Tailwind plugins (typography, forms, etc.) don't have direct equivalents — write the styles yourself or use a CSS reset.

## See also

- [Defining styles with `tl.create`](../learn/04-defining-styles.md)
- [Composition: `tl.merge` and `tl.cx`](../learn/10-merge-and-cx.md)
