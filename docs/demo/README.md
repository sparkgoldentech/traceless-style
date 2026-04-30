# Runnable demo project

A self-contained demo that exercises every public feature of traceless-style. Files live in `docs/demo/`.

## What's included

| File | Demonstrates |
|---|---|
| `src/theme/tokens.ts` | `tl.defineTokens`, `tl.createTheme`, cross-file token export |
| `src/components/Button.tsx` | `tl.create`, `tl.merge`, variants, `_hover` / `_focusVisible` / `_disabled`, `TracelessClass` typing |
| `src/components/Card.tsx` | tokens, breakpoints, `_dark`, raw selectors |
| `src/components/ProgressBar.tsx` | dynamic CSS variables (the only use of `style={{}}`), keyframes |
| `src/components/Modal.tsx` | `tl.keyframes`, `motionReduce`, `_backdrop` |
| `src/components/Form.tsx` | `_invalid`, `_focusWithin`, `_placeholder`, contrast-validated colors |
| `src/components/Layout.tsx` | grid responsive layout, container queries, `_groupHover` |
| `src/components/ThemeBar.tsx` | `<ThemeToggle />`, `<RtlToggle />`, `useTracelessDark`, `useTracelessRtl` |
| `src/variants.ts` | `tl.extend({ variants: ... })` with custom breakpoints / selectors |
| `src/App.tsx` | Glue everything together |
| `src/main.tsx` | Vite entry |
| `index.html` | Mounts React |
| `vite.config.ts` | `tracelessStyle()` plugin wiring |
| `package.json` | Scripts: `dev`, `build`, `preview` |
| `traceless-style.config.js` | Lint, contrast, custom variants |

## Quick start

```bash
cd docs/demo
npm install
npm run dev
```

Open `http://localhost:5173` and you'll see:

1. A theme bar with **dark/light** and **LTR/RTL** toggles (top-right).
2. A grid of cards (1 column on mobile, 2 at md, 3 at lg).
3. A button gallery (primary / secondary / danger / ghost × sm / md / lg).
4. A form with focus-within, invalid, and placeholder states.
5. A modal with keyframe-driven entrance animation.
6. A progress bar driven by a CSS custom property.

Toggle dark mode and watch every color flip — auto-derived. Toggle RTL and watch the layout mirror — auto-rewritten.

## How the demo wires up

```
docs/demo/
├── index.html                    ← Vite entry
├── package.json
├── vite.config.ts                ← tracelessStyle() plugin
├── traceless-style.config.js     ← strict lint + WCAG AA
├── public/
│   └── traceless-style.css       ← generated at build
└── src/
    ├── main.tsx                  ← React mount
    ├── App.tsx                   ← Top-level layout
    ├── variants.ts               ← Custom variants via tl.extend
    ├── theme/
    │   └── tokens.ts             ← Tokens + dark theme + brand variants
    └── components/
        ├── Layout.tsx
        ├── Button.tsx
        ├── Card.tsx
        ├── Form.tsx
        ├── Modal.tsx
        ├── ProgressBar.tsx
        └── ThemeBar.tsx
```

Open the files in order — each has a header comment explaining which traceless-style features it demonstrates.

## Reading the generated CSS

After `npm run dev`, the file `public/traceless-style.css` contains every atomic rule the demo references. It's a flat list of `.tlxxxxxxxx { property: value; }` rules, with `@keyframes` and `:root { --tl-* }` blocks at the top.

In dev mode (`vite dev`), each rule is annotated with its source file and key:

```css
/* src/components/Button.tsx  base */
.tla1b2c3d4 { display: inline-flex; }
```

Toggle dark mode and watch the browser's element inspector — the same DOM elements have the same classes, but `:is(.dark *)` rules now win.

## Without React

A separate (TODO) `docs/demo-vanilla/` directory shows the same patterns without React, using just `tl.create` + DOM `className=`.

## See also

- [Defining styles with `tl.create`](../learn/04-defining-styles.md)
- [Cross-file design tokens recipe](../recipes/cross-file-tokens.md)
- [Building a Button component recipe](../recipes/button.md)
