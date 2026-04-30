# Webpack integration

For raw webpack setups (CRA, Rspack, custom configs).

```js
// webpack.config.js
const { TracelessStyleWebpackPlugin } = require("traceless-style/webpack");

module.exports = {
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx)$/,
        exclude: [/node_modules/, /\.traceless-style/],
        use: [{ loader: require.resolve("traceless-style/webpack") }],
      },
    ],
  },
  plugins: [
    new TracelessStyleWebpackPlugin(),
  ],
};
```

What this does:

1. **Loader** transforms `tl.create(...)` / `tl.extend(...)` per file.
2. **Plugin** runs full extraction on `beforeCompile`, injects `__TRACELESS_STYLE_META__` via `DefinePlugin` on `thisCompilation`, and re-emits `public/traceless-style.css` on `afterEmit`.

Make sure to import the generated CSS yourself:

```js
// src/index.tsx
import "../public/traceless-style.css";
```

## Plugin options

```js
new TracelessStyleWebpackPlugin({
  srcDir: "src",
  outCSS: "public/traceless-style.css",
  dev:    process.env.NODE_ENV !== "production",
});
```

| Option | Type | Default |
|---|---|---|
| `srcDir` | `string \| string[]` | `"src"` |
| `outCSS` | `string` | `"public/traceless-style.css"` |
| `dev` | `boolean` | `process.env.NODE_ENV !== "production"` |

## Loader options

The loader has no required options. If you need to override `srcDir` or `dev` per-loader (rare), pass them via `use[].options`.

## Why both a loader AND a plugin?

- The **loader** handles per-file `tl.create` rewrites — fast, runs in webpack's per-file pipeline.
- The **plugin** handles cross-file concerns: full extraction (Pass 0/1/2 across the whole srcDir), `__TRACELESS_STYLE_META__` injection, CSS file emission.

Both are needed for full functionality. Without the plugin, `tl.merge` falls back to set-deduplication.

## See also

- [`withTracelessStyle()` for Next.js](./nextjs.md)
- [Vite integration](./vite.md)
