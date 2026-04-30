# Dark mode

Dark mode in traceless-style is a one-line drop-in. The compiler **automatically derives a dark-mode variant of every color value** in your styles and emits a paired `:is(.dark *)` rule, and the runtime ships an engine + React components for toggling and persisting the user's choice.

```tsx
// app/layout.tsx
import { TracelessRoot } from "traceless-style/dark";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <TracelessRoot />          {/* anti-flash inline script */}
      </head>
      <body>{children}</body>
    </html>
  );
}

// app/page.tsx
import { ThemeToggle } from "traceless-style/dark";

export default function Home() {
  return (
    <main>
      <ThemeToggle />              {/* the entire dark-mode toggle */}
      <Card />
    </main>
  );
}

// app/Card.tsx
import { tl } from "traceless-style";

const $ = tl.create({
  card: {
    background: "white",          // → automatically gets a dark variant
    color:      "#0f172a",
    border:     "1px solid #e2e8f0",
  },
});
```

That's the whole integration. No `_dark: { ... }` blocks needed for routine color swaps.

## How auto-dark works

The compiler walks every `tl.create` style group and, for each color-typed property whose value parses as a color (hex, `rgb()`, `rgba()`, `hsl()`, `hsla()`, named color), it computes a dark-mode counterpart using an HSL-based curve:

```
L' = 0.92 - 0.84 * L      // Lightness inversion
H' = H                    // Hue preserved
S' = S                    // Saturation preserved
A' = A                    // Alpha preserved
```

The derived color then runs through a WCAG 2.1 AA contrast check (4.5:1 against the dark surface, default `#0a0a0a`). If the naive inversion fails, a binary search adjusts the lightness up/down until it passes. If no adjustment can satisfy the target, a build warning surfaces a suggested replacement.

The matching atomic rule is registered with the `:is(.dark *)` selector:

```css
.tl<color-light> { color: #0f172a; }
.tl<color-dark>:is(.dark *) { color: #f3f4f6; }
```

When `.dark` is added to `<html>`, the dark rule wins on specificity (it's a more specific selector path). Adding both classes to the element is invisible to users but lets the cascade resolve cleanly.

## Properties affected by auto-dark

`AUTO_DARK_PROPS` from `src/compiler/auto-dark.ts`:

- `color`, `background`, `backgroundColor`
- `borderColor`, `borderTopColor`, `borderRightColor`, `borderBottomColor`, `borderLeftColor`
- `borderInlineStartColor`, `borderInlineEndColor`, `borderBlockStartColor`, `borderBlockEndColor`
- `outlineColor`, `caretColor`, `accentColor`
- `textDecorationColor`, `columnRuleColor`
- `fill`, `stroke`

Other properties (sizes, layout, typography) are **not** auto-dark-converted — they have no concept of "dark variant."

## Opting out

Three escape hatches:

```ts
tl.create({
  brandLogo: {
    background: "#3b82f6",
    _autoDark: false,                   // disable for this group only
  },

  exactMatch: {
    color:  "white",
    _dark:  { color: "#f3f4f6" },       // explicit override — auto-derivation skipped for `color`
  },
});
```

Or globally in `traceless-style.config.js`:

```js
module.exports = {
  autoDarkMode: false,                  // disable auto-dark project-wide
};
```

When you write `_dark: { color: "..." }`, the auto-derivation for `color` is suppressed (you're saying "I'll handle this one"). Other properties in the same group still get auto-derived.

## The `dark` engine

```ts
import { dark } from "traceless-style/dark";

dark.toggle();        // flip between light and dark
dark.enable();        // force dark
dark.disable();       // force light
dark.system();        // follow OS preference (clear saved choice)

dark.set("dark");     // set explicitly
dark.set("light");

dark.isDark();        // → boolean
dark.getMode();       // → "dark" | "light" | "system"

const unsubscribe = dark.subscribe(mode => {
  console.log("Theme changed:", mode);
});
```

The engine:

- Persists the user's choice in `localStorage` under `traceless-dark`.
- Applies `.dark` to `<html>` when active.
- Watches `prefers-color-scheme: dark` when no preference is saved.
- Notifies subscribers of changes.

## React hook: `useTracelessDark()`

```tsx
import { useTracelessDark } from "traceless-style/dark";

function Header() {
  const { isDark, toggle, mode, set } = useTracelessDark();

  return (
    <button onClick={toggle} aria-label="Toggle theme">
      {isDark ? "🌙" : "☀️"}
    </button>
  );
}
```

Returns `{ isDark, mode, toggle, enable, disable, system, set }`. SSR-safe.

## Drop-in components

| Component | What it does |
|---|---|
| `<TracelessRoot />` | Inline script in `<head>` that applies the saved theme + direction **before first paint**. Prevents FOUC. |
| `<ThemeToggle />`   | A pre-built `<button>` that toggles dark/light. Accepts `className` and custom `labels`. |
| `<TracelessDarkScript />` | Backwards-compatible alias for `<TracelessRoot />`. |
| `<DarkModeScript />` | Hand-rolled VDOM element for non-React-18 setups. |

The anti-flash script reads `localStorage` synchronously before the page renders, so dark-mode users never see a "flash of light" on navigation.

## Strategies

`dark.init(strategy)` accepts:

| Strategy | Behavior |
|---|---|
| `"class"` (default) | Toggles `.dark` on `<html>`. The `_dark` variant is `:is(.dark *)`. |
| `"media"`           | Reads `@media (prefers-color-scheme: dark)` and applies the class to match. No JS toggle. |
| `"system"`          | Same as `"class"` but defaults to OS preference when no saved choice. |

## Server-side rendering

For SSR with Next.js, the integration auto-injects `<TracelessRoot />` into your root layout via `npx traceless-style init`. For other environments, render the inline script via `getDarkScriptTag()`:

```ts
import { getDarkScriptTag } from "traceless-style/dark";
res.write(`<head>${getDarkScriptTag()}</head>`);
```

## Common patterns

### Manual `_dark` override for branding-critical colors

```ts
tl.create({
  logo: {
    background: "#3b82f6",            // light: brand blue
    _dark: { background: "#1d4ed8" }, // dark: deeper blue (auto-derive would muddy it)
  },
});
```

### Skip auto-dark for product imagery

```ts
tl.create({
  productCard: {
    background: "url(/product.jpg)",
    _autoDark: false,                 // image stays as-is
  },
});
```

### Listen for theme changes outside React

```ts
import { dark } from "traceless-style/dark";

dark.subscribe(mode => {
  myThirdPartyChart.setTheme(mode === "dark" ? "dark" : "light");
});
```

Continue to [9. RTL / logical properties](./09-rtl.md).
