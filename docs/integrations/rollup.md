# Rollup integration

```js
// rollup.config.js
import { tracelessStyle } from "traceless-style/rollup";

export default {
  input: "src/index.ts",
  output: { dir: "dist", format: "esm" },
  plugins: [tracelessStyle()],
};
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

- `buildStart` — full extraction (Pass 0/1/2).
- `transform` — per-file `tl.create` rewrites.

CSS output lands in `public/traceless-style.css`.

## Importing the CSS

The Rollup plugin does not auto-inject the stylesheet. Add an import:

```ts
// src/index.ts
import "../public/traceless-style.css";
```

…or use a CSS-handling Rollup plugin (e.g. `@rollup/plugin-postcss`) that picks it up.

## When to use Rollup vs Vite

Vite uses Rollup under the hood, so the Vite plugin already covers most use cases. Use the raw Rollup plugin when:

- You're building a library and need fine-grained Rollup control.
- You're using Rollup directly (no Vite dev-server layer).
- You need the plugin in a tool that wraps Rollup (e.g. Astro's component island bundler).

## See also

- [Vite integration](./vite.md)
- [esbuild integration](./esbuild.md)
