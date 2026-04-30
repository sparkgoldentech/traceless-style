# Next.js integration

```ts
// next.config.ts
import { withTracelessStyle } from "traceless-style/nextjs";

const nextConfig = {
  // your existing config
};

export default withTracelessStyle(nextConfig);
```

That's the integration. `withTracelessStyle()`:

1. Adds the `tracelessStyleLoader` to webpack's module rules (transforms `tl.create`/`tl.extend` calls in `.ts`/`.tsx`/`.js`/`.jsx`).
2. Adds `TracelessStyleWebpackPlugin` to webpack's plugins:
   - On `beforeCompile`: runs full extraction across `srcDir`.
   - On `thisCompilation`: injects `__TRACELESS_STYLE_META__` via `DefinePlugin`.
   - On `afterEmit`: re-emits `public/traceless-style.css`.
3. Configures Turbopack `resolveAlias` (Windows-safe forward slashes).
4. Auto-injects `traceless-style.css` into the client entry via a tiny shim.
5. Throws a clear error if `next` isn't resolvable in the consumer's project.

## Options

```ts
withTracelessStyle(nextConfig, {
  srcDir: "src",
  variants: {
    _tablet: "@media (min-width: 900px)",
  },
});
```

| Option | Type | Default |
|---|---|---|
| `srcDir` | `string` | union of `src/` and `app/` |
| `variants` | `Record<string, string>` | none (use `tl.extend` instead, recommended) |

## Root layout: anti-flash + style sheet

The integration auto-imports `public/traceless-style.css`, but you should still add `<TracelessRoot />` to prevent FOUC for dark/RTL users:

```tsx
// app/layout.tsx
import { TracelessRoot } from "traceless-style/dark";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <TracelessRoot />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

`<TracelessRoot />` renders an inline `<script>` that reads `localStorage` (saved theme + direction) and applies the matching classes/attributes to `<html>` *before* React hydrates. This eliminates the flash of light theme that single-page apps usually have on first load.

## App Router vs Pages Router

`withTracelessStyle` works with both. The integration auto-detects which you're using and configures the entry shim accordingly.

## Server Components

`tl.create` works in Server Components. The compiler transforms server-component files in the same pass as client-component files — both go through the same loader. The runtime fallback's hash is identical to the compiler's, so even if a particular path is uncompiled (e.g. third-party server module), the class names are the same.

## Turbopack

Turbopack is supported via `turbopack.resolveAlias`. The integration sets it up automatically:

```js
turbopack: {
  resolveAlias: {
    "traceless-style":        path.join(__dirname, "runtime", "index.js"),
    "traceless-style/dark":   path.join(__dirname, "dark.js"),
    "traceless-style/nextjs": path.join(__dirname, "nextjs.js"),
  },
}
```

(On Windows, the integration converts `\` → `/` because Turbopack rejects backslash paths.)

## Caveats

- The integration **does not** automatically inject `<TracelessRoot />`. Dark/RTL users will see a flash without it. The `init` command does this for you.
- Webpack 4 is not supported. Next.js ≥ 14 ships webpack 5 by default.
- If you customize the `entry` in your existing `webpack(config, ctx)` callback, the integration's auto-CSS-injection runs before yours; chain via `nextConfig.webpack` cleanly.
