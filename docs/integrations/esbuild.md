# esbuild integration

```js
// build.js
import esbuild from "esbuild";
import { tracelessStyle } from "traceless-style/esbuild";

esbuild.build({
  entryPoints: ["src/index.tsx"],
  bundle:      true,
  outfile:     "dist/bundle.js",
  plugins:     [tracelessStyle()],
});
```

## Options

```ts
tracelessStyle({
  srcDir: "src",
  dev:    false,
});
```

| Option | Type | Default |
|---|---|---|
| `srcDir` | `string \| string[]` | union of `src/` and `app/` |
| `dev` | `boolean` | `false` |

## Hooks used

- `onStart` — full extraction (Pass 0/1/2).
- `onLoad` — per-file `tl.create` rewrites for `.ts`/`.tsx`/`.js`/`.jsx` matches.

CSS output lands in `public/traceless-style.css`.

## Importing the CSS

esbuild does not auto-inject the stylesheet. Two options:

**Option 1 — import in your entry:**

```ts
// src/index.tsx
import "../public/traceless-style.css";
```

esbuild's CSS handling will copy / inline it according to your build config.

**Option 2 — link from HTML:**

```html
<link rel="stylesheet" href="/traceless-style.css" />
```

## Watch mode

esbuild's `context.watch()` triggers `onStart` again on each rebuild, so the full extraction re-runs. The file-level cache (`.traceless-style/cache.json`) keeps unchanged files fast.

## When to use esbuild

esbuild is the fastest of the four bundlers traceless-style supports. Use it when:

- You're building a small/medium app that doesn't need Vite's dev-server features.
- You're building a library and want a thin esbuild wrapper.
- You're optimizing CI build time over DX.

## See also

- [Webpack integration](./webpack.md)
- [Vite integration](./vite.md)
