# Vite integration

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { tracelessStyle } from "traceless-style/vite";

export default defineConfig({
  plugins: [tracelessStyle()],
});
```

## Options

```ts
tracelessStyle({
  srcDir: "src",        // string or string[]
  dev:    true,         // pretty CSS in dev mode
});
```

| Option | Type | Default |
|---|---|---|
| `srcDir` | `string \| string[]` | union of `src/` and `app/` |
| `dev` | `boolean` | derived from Vite's `command === "serve"` |

## Hooks used

- `enforce: "pre"` — runs before other transforms.
- `configResolved` — captures Vite's command/mode.
- `buildStart` — full extraction (Pass 0/1/2) before any module loads.
- `transform` — per-file `tl.create` rewrites.
- `handleHotUpdate` — re-extract on source change.

The CSS output lands in `public/traceless-style.css` (mirroring Next.js) so existing CSS-import statements work unchanged.

## Importing the CSS

In your entry file:

```ts
// src/main.tsx
import "/traceless-style.css";   // served from `public/`
```

…or in your HTML:

```html
<link rel="stylesheet" href="/traceless-style.css" />
```

## Per-file transform parser

The Vite plugin's per-file transform uses the **legacy text-mode extractor** (no native deps required). The full extraction in `buildStart` honors `parser: "auto"` (defaults to legacy below 100 files, SWC at or above).

If you specifically want SWC for the per-file transform, set `TRACELESS_STYLE_PARSER=swc` in your environment.

## HMR

`handleHotUpdate` hooks into Vite's HMR. When a `.tsx`/`.jsx`/`.ts`/`.js` source file changes:

1. The file is re-transformed (per-file Pass 2).
2. The CSS file is regenerated incrementally (cached entries from `FileCache` are reused for unchanged files).
3. Vite pushes the updated CSS to the browser without a full reload.

Typical incremental rebuild: ≤ 50 ms.

## See also

- [Vite Plugin docs](https://vitejs.dev/guide/api-plugin)
- [`tracelessStyle()` for Rollup](./rollup.md) (similar API)
