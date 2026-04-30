# Autocomplete

Type inside any `tl.create({...})` call and the extension surfaces:

- **CSS properties** — `padding`, `flexDirection`, all 280 of them
- **Property values** — `display: ` → `flex`, `grid`, `inline-block`, …
- **Variant keys** — `_dark`, `_hover`, `_focus`, `_autoRtl`, …

```ts
const $ = tl.create({
  btn: {
    p|         // ← cursor here. Press Ctrl+Space if needed.
  }
});
```

Smart sorting: typing `_` puts variants first; typing letters puts CSS properties first.
