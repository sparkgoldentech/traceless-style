# Inline color swatches

Every `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()` literal inside `tl.create` gets a small colored square next to it.

**Click the square** to open VS Code's native color picker. Drag to pick a new color — your source updates instantly. Format is preserved (hex stays hex, rgb stays rgb).

```ts
const $ = tl.create({
  btn: {
    backgroundColor: "#3b82f6",   // ← blue swatch
    color:           "#ffffff",   // ← white swatch
    boxShadow:       "0 1px 3px rgba(0,0,0,0.2)",  // ← translucent black swatch
  },
});
```
