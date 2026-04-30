# Recipe: Migrating from styled-components

The biggest change: there is no `styled.button` template tag. You author plain object literals and apply class names yourself.

## Side-by-side

### Basic styled component

```tsx
// styled-components
import styled from "styled-components";

const Button = styled.button`
  padding: 0.5rem 1rem;
  background: ${props => props.primary ? "#3b82f6" : "white"};
  color: ${props => props.primary ? "white" : "#3b82f6"};
  &:hover { background: ${props => props.primary ? "#2563eb" : "#eff6ff"}; }
`;

<Button primary>Save</Button>
```

```tsx
// traceless-style
import { tl } from "traceless-style";

const $ = tl.create({
  base: {
    padding:    "0.5rem 1rem",
  },
  primary: {
    background: "#3b82f6",
    color:      "white",
    _hover:     { background: "#2563eb" },
  },
  secondary: {
    background: "white",
    color:      "#3b82f6",
    _hover:     { background: "#eff6ff" },
  },
});

function Button({ primary, children }: { primary?: boolean; children: React.ReactNode }) {
  return (
    <button className={tl.merge($.base, primary ? $.primary : $.secondary)}>
      {children}
    </button>
  );
}

<Button primary>Save</Button>
```

## Mapping concepts

| styled-components | traceless-style |
|---|---|
| `styled.button\`…\`` | `<button className={$.btn} />` |
| `${props => …}` interpolation | Branch on prop, pick a variant: `tl.merge(base, primary ? a : b)` |
| `&:hover` | `_hover: { … }` |
| `@media (min-width: 768px)` | `md: { … }` |
| `theme.colors.brand` (ThemeProvider) | `tokens.brand` (`tl.defineTokens`) |
| `ThemeProvider` | `<div className={dark}>…</div>` (CSS-variable-based; no React context) |
| `css` helper | inline literal style object |
| `keyframes` | `tl.keyframes` |
| `createGlobalStyle` | put rules outside `tl.create`; or use `_layer` in your config |
| Template-tag DSL | strict literal-only object DSL |

## Dynamic values

styled-components lets you interpolate any prop into a CSS rule. traceless-style requires literal values — for runtime-dynamic styles, set CSS custom properties:

```tsx
// styled-components
const Bar = styled.div`
  width: ${props => props.progress * 100}%;
`;

// traceless-style: pass the dynamic value as a CSS custom property
const $ = tl.create({
  bar: {
    width: "var(--progress)",
  },
});

<div className={$.bar} style={{ "--progress": `${progress * 100}%` }} />
```

Yes — `style={{}}` for setting a CSS variable is one of the few accepted uses. The `noInlineStyles` lint rule recognizes `--*` keys as setting custom properties (allowed) vs setting concrete CSS properties (rejected). If your version of the lint doesn't allow this yet, set the variable via JS:

```tsx
const ref = useRef<HTMLDivElement>(null);
useEffect(() => { ref.current?.style.setProperty("--progress", `${progress * 100}%`); }, [progress]);
<div ref={ref} className={$.bar} />
```

## Themes

```ts
// styled-components
<ThemeProvider theme={{ brand: { primary: "#3b82f6" } }}>
  <App />
</ThemeProvider>

// traceless-style — no provider
const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
const dark   = tl.createTheme("dark", { brand: { primary: "#60a5fa" } });

<body className={dark}>
  <App />        {/* tokens.brand.primary resolves to #60a5fa here */}
</body>
```

Switching themes: `dark.toggle()` adds/removes `.dark` on `<html>`. No re-render of the React tree.

## Server-side rendering

styled-components in SSR requires a `ServerStyleSheet` wrapper that collects rendered styles into a `<style>` tag. traceless-style needs none of this — the CSS is a static file emitted by the build, and `tl.create` produces literal class strings without runtime style injection.

## What you gain

- **Zero runtime cost** — no style cache, no `insertRule` per render.
- **Atomic deduplication** — `padding: 8px` is one rule across the whole app.
- **Auto dark mode + auto RTL** built into the compiler.
- **Smaller bundle** — the runtime is ~2 kB vs styled-components' ~12 kB minified.

## What you give up

- **Template-tag ergonomics** for components — you write a `function Button` instead of `const Button = styled.button`.
- **Prop interpolation** — replaced with explicit branching + `tl.merge`.
- **Some advanced features** — e.g. styled-components' `css` helper for one-off conditional rules. Express the same with a literal object + `tl.cx`.

## See also

- [`tl.create`](../api/create.md)
- [Composition: `tl.merge` and `tl.cx`](../learn/10-merge-and-cx.md)
- [Design tokens & themes](../learn/06-tokens-and-themes.md)
