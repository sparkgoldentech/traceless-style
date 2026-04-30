# RTL / logical properties

traceless-style ships with **automatic right-to-left support** built into the compiler. Physical CSS properties (`marginLeft`, `paddingRight`, `borderTopLeftRadius`, `left`) are rewritten to their logical equivalents (`marginInlineStart`, `paddingInlineEnd`, `borderStartStartRadius`, `insetInlineStart`) at build time.

The browser then resolves logical properties against the `dir` attribute of the closest ancestor — no extra CSS rules, no extra runtime cost.

## One-line integration

```tsx
// app/layout.tsx
import { TracelessRoot } from "traceless-style/dark";    // also handles RTL anti-flash

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><TracelessRoot /></head>
      <body>{children}</body>
    </html>
  );
}

// Anywhere in your UI:
import { RtlToggle } from "traceless-style/rtl";
<RtlToggle />
```

`<TracelessRoot />` reads the saved direction from `localStorage` and applies it to `<html dir>` before first paint, preventing flash of LTR layout for RTL users.

## How auto-RTL works

The compiler walks every style group and rewrites physical → logical. For example:

```ts
tl.create({
  card: {
    marginLeft:           "1rem",
    paddingRight:         "0.5rem",
    borderTopLeftRadius:  "8px",
    textAlign:            "left",
  },
});
```

…becomes (logically):

```css
.tl<...> { margin-inline-start: 1rem; }
.tl<...> { padding-inline-end:   0.5rem; }
.tl<...> { border-start-start-radius: 8px; }
.tl<...> { text-align: start; }
```

In an LTR context, those resolve to the original meanings (margin-left, padding-right, top-left, left). In an RTL context (`<html dir="rtl">` or `<section dir="rtl">`), they automatically mirror — without you writing `_rtl: { marginLeft: 0, marginRight: "1rem" }`.

## Property mapping table

The full map lives in `src/compiler/auto-rtl.ts`. Highlights:

| Physical | Logical |
|---|---|
| `marginLeft` | `marginInlineStart` |
| `marginRight` | `marginInlineEnd` |
| `paddingLeft` | `paddingInlineStart` |
| `paddingRight` | `paddingInlineEnd` |
| `borderLeft*` | `borderInlineStart*` |
| `borderRight*` | `borderInlineEnd*` |
| `borderTopLeftRadius` | `borderStartStartRadius` |
| `borderTopRightRadius` | `borderStartEndRadius` |
| `borderBottomLeftRadius` | `borderEndStartRadius` |
| `borderBottomRightRadius` | `borderEndEndRadius` |
| `left` | `insetInlineStart` |
| `right` | `insetInlineEnd` |
| `textAlign: left` | `textAlign: start` |
| `textAlign: right` | `textAlign: end` |
| `float: left` | `float: inline-start` |
| `float: right` | `float: inline-end` |

`top`/`bottom` and `marginTop`/`marginBottom` etc. are **not** rewritten — they're block-axis and not affected by direction.

## Opting out

Per-group:

```ts
tl.create({
  draggableSlider: {
    marginLeft: "var(--drag-x)",
    _autoRtl: false,                     // keep physical, don't rewrite
  },
});
```

Globally in `traceless-style.config.js`:

```js
module.exports = {
  autoRtl: false,
};
```

You'd disable auto-RTL when:

- Position is calculated by JS that assumes physical pixels.
- The element is not in flow (e.g. fixed-position element with absolute coordinates that shouldn't flip).
- A third-party library expects specific physical property names.

## The `direction` engine

```ts
import { direction } from "traceless-style/rtl";

direction.toggle();         // flip ltr ↔ rtl
direction.enableRtl();
direction.enableLtr();
direction.set("rtl");
direction.get();            // → "ltr" | "rtl"

const unsubscribe = direction.subscribe(dir => {
  console.log("Direction changed:", dir);
});
```

Persists the choice in `localStorage` under `traceless-dir`.

## React hook: `useTracelessRtl()`

```tsx
import { useTracelessRtl } from "traceless-style/rtl";

function Header() {
  const { isRtl, toggle, dir, set } = useTracelessRtl();

  return (
    <button onClick={toggle} aria-label="Toggle direction">
      {isRtl ? "← LTR" : "→ RTL"}
    </button>
  );
}
```

## Drop-in components

| Component | What it does |
|---|---|
| `<RtlToggle />` | Pre-built button that toggles direction; accepts `className` and custom `labels`. |

## Manual `_rtl` and `_ltr` variants

For overrides that auto-RTL can't handle (text, content, icons), use the explicit variants:

```ts
tl.create({
  arrow: {
    _ltr: { content: '"→"' },
    _rtl: { content: '"←"' },
  },

  pullQuote: {
    borderInlineStart: "4px solid #3b82f6",
    paddingInlineStart: "1rem",

    _rtl: {
      fontStyle: "italic",        // Arabic / Hebrew may want different emphasis
    },
  },
});
```

`_rtl` selector: `[dir="rtl"] &`. `_ltr` selector: `[dir="ltr"] &`. They scope to the closest ancestor with the matching `dir` attribute, so per-section overrides via `<section dir="rtl">` work correctly.

## Caveats

- **Browser support.** Logical properties are supported in all evergreen browsers (Chrome ≥ 87, Safari ≥ 14, Firefox ≥ 66). Older browsers fall back gracefully (rules are ignored).
- **Mixed-content layouts.** If your page has both LTR and RTL content (e.g. an English article with an Arabic block-quote), wrap the inner block in `<section dir="rtl">` — the compiled logical properties resolve against the closest ancestor `dir`, so per-section flipping works without extra CSS.

Continue to [10. Composition: `tl.merge` and `tl.cx`](./10-merge-and-cx.md).
