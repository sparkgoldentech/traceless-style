# Recipe: Theme switcher with persistence

A persistent dark-mode toggle using the built-in dark engine.

## Drop-in (one line)

```tsx
import { ThemeToggle } from "traceless-style/dark";

<header>
  <ThemeToggle />
</header>
```

That's it — `<ThemeToggle />` toggles `.dark` on `<html>`, persists in `localStorage`, and re-renders other `useTracelessDark()` consumers. Combined with auto-dark-mode on every color value in your styles, this is the entire integration.

Add the anti-flash script to your root layout:

```tsx
// app/layout.tsx
import { TracelessRoot } from "traceless-style/dark";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><TracelessRoot /></head>
      <body>{children}</body>
    </html>
  );
}
```

## Custom toggle button

```tsx
import { useTracelessDark } from "traceless-style/dark";
import { tl } from "traceless-style";

const $ = tl.create({
  btn: {
    padding:      "0.5rem 1rem",
    borderRadius: "999px",
    border:       "1px solid currentColor",
    background:   "transparent",
    color:        "inherit",
    cursor:       "pointer",
    fontSize:     "0.875rem",

    _hover:        { background: "rgba(0,0,0,0.05)" },
    _focusVisible: { outline: "2px solid currentColor", outlineOffset: "2px" },
  },
});

export function MyToggle() {
  const { isDark, toggle, mode } = useTracelessDark();

  return (
    <button className={$.btn} onClick={toggle} aria-pressed={isDark}>
      {isDark ? "🌙 Dark" : "☀️ Light"}
      <span aria-hidden style={{ opacity: 0.6 }}>({mode})</span>
    </button>
  );
}
```

## Three-way switch (dark / light / system)

```tsx
import { useTracelessDark } from "traceless-style/dark";

export function ThemeRadios() {
  const { mode, set, system } = useTracelessDark();

  return (
    <fieldset>
      <legend>Theme</legend>
      <label><input type="radio" checked={mode === "light"}  onChange={() => set("light")} /> Light</label>
      <label><input type="radio" checked={mode === "dark"}   onChange={() => set("dark")}  /> Dark</label>
      <label><input type="radio" checked={mode === "system"} onChange={system}             /> System</label>
    </fieldset>
  );
}
```

## Listening from outside React

```ts
import { dark } from "traceless-style/dark";

dark.subscribe(mode => {
  // notify a third-party chart, tracking pixel, etc.
  window.dataLayer?.push({ event: "theme_change", theme: mode });
});
```

## Multiple themes (dark + brand A/B + density)

```ts
const dark    = tl.createTheme("dark",    { /* color overrides */ });
const brandB  = tl.createTheme("brand-b", { brand: { primary: "#ec4899" } });
const compact = tl.createTheme("compact", { spacing: { md: "0.5rem" } });

<body className={tl.cx(dark, brandB, compact)}>...</body>
```

## See also

- [Dark mode (full guide)](../learn/08-dark-mode.md)
- [Design tokens & themes](../learn/06-tokens-and-themes.md)
