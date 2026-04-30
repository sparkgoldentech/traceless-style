# Installation

`traceless-style` is published to npm. It has **no required dependencies** at runtime and one optional dependency (`@swc/core`) that the SWC-backed extractor uses for large codebases.

## 1. Install the package

```bash
npm install traceless-style
# or
pnpm add traceless-style
# or
yarn add traceless-style
```

The package ships pre-built. There is no postinstall step.

| Peer dependency | Required? | What for |
|---|---|---|
| `react ≥ 18` | Optional | Only needed for the React components in `traceless-style/dark` and `traceless-style/rtl` (`<TracelessRoot />`, `<ThemeToggle />`, `<RtlToggle />`). |
| `next ≥ 14` | Optional | Only needed if you use `traceless-style/nextjs`. |
| `webpack ≥ 5` | Optional | Only needed if you wire up the raw webpack plugin. |
| `vite` | Optional | Only needed for `traceless-style/vite`. |
| `@swc/core` | Optional | Auto-loaded for projects ≥ 100 source files. Falls back to the legacy parser if installation failed. |

## 2. Pick an integration

| You're using… | Install one of |
|---|---|
| Next.js (App Router or Pages) | [`traceless-style/nextjs`](../integrations/nextjs.md) |
| Webpack directly (CRA-style or Rspack) | [`traceless-style/webpack`](../integrations/webpack.md) |
| Vite | [`traceless-style/vite`](../integrations/vite.md) |
| Rollup | [`traceless-style/rollup`](../integrations/rollup.md) |
| esbuild | [`traceless-style/esbuild`](../integrations/esbuild.md) |
| Just Node + a build script | The CLI: `npx traceless-style` |

Each integration page contains a copy-paste config snippet.

## 3. Run `init` (recommended)

```bash
npx traceless-style init
```

This zero-config scaffolder:

1. Detects your framework (Next, Vite, Remix, Astro).
2. Adds the bundler plugin to your config file.
3. Adds `<TracelessRoot />` to your root layout (anti-flash dark + RTL script).
4. Creates `traceless-style.config.js` if missing.
5. Adds `dev` / `build` scripts to `package.json` if missing.
6. Suggests installing the [VS Code extension](../integrations/vscode.md) via `.vscode/extensions.json`.

The scaffolder is **idempotent** — re-running it will not duplicate edits.

## 4. Verify the install

Create a tiny component:

```tsx
// app/test-install.tsx
import { tl } from "traceless-style";

const $ = tl.create({
  hello: { color: "tomato", padding: "1rem", fontSize: "1.25rem" },
});

export default function Test() {
  return <div className={$.hello}>traceless-style is working!</div>;
}
```

Run your dev server (`npm run dev` for Next, `vite` for Vite, etc.) and visit the page. The first request triggers a full extraction; subsequent saves trigger incremental rebuilds (≤ 50 ms typical).

You should see `public/traceless-style.css` appear with three rules.

## 5. Add the anti-flash script (only if you use dark mode or RTL)

In your root layout (`app/layout.tsx` for Next App Router):

```tsx
import { TracelessRoot } from "traceless-style/dark";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <TracelessRoot />
        <link rel="stylesheet" href="/traceless-style.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

The Next.js integration (`withTracelessStyle`) will inject the stylesheet automatically — you do **not** need the `<link>` tag if you used the integration. For non-Next users, add the `<link>` tag pointing at `/traceless-style.css` (or wherever your `outCSS` config writes to).

## 6. Choose strict-by-default lint behavior

Lint is on by default. Inline styles (`style={{...}}`) and bare class strings (`className="px-4"`) are rejected at extraction time — see [Linting](./12-linting.md). To opt out of an individual rule, add `traceless-style.config.js`:

```js
module.exports = {
  lint: { noTailwind: false },   // keep the others; allow Tailwind
};
```

`lint: false` disables the three opt-in rules but leaves `noInlineStyles` on (inline styles bypass the compiler entirely and there is no legitimate reason for them in a traceless-style project).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module 'traceless-style/nextjs'` | Forgot to install `next` or used wrong import path | `npm install next` and re-import |
| Styles appear but `tl.merge()` doesn't deduplicate | Webpack `DefinePlugin` didn't inject `__TRACELESS_STYLE_META__` | Make sure you used `withTracelessStyle()` and not just `TracelessStyleWebpackPlugin` directly |
| Build is slow on huge codebases | Default parser is text-mode (legacy) | Set `TRACELESS_STYLE_PARSER=swc` or run with `--parser=swc` |
| `@swc/core` fails to install on Alpine/musl | Native dep | Pin `@swc/core` to a known-good version, or stay on the legacy parser |
| FOUC / flash of light theme | Forgot `<TracelessRoot />` | Add it to `<head>` of your root layout |

Continue to [3. Thinking in atomic CSS](./03-thinking-in-atomic-css.md) for the conceptual model, or jump to [4. Defining styles with `tl.create`](./04-defining-styles.md).
