# Recipe: Server Components

`tl.create` works in React Server Components. The compiler transforms server-component files in the same pass as client-component files; the runtime fallback uses the same hash function so untransformed paths produce byte-identical class names.

## Server Component example

```tsx
// app/articles/page.tsx (Server Component)
import { tl } from "traceless-style";
import { tokens } from "@/theme/tokens";

const $ = tl.create({
  list: {
    display:             "grid",
    gridTemplateColumns: "1fr",
    gap:                 tokens.spacing.md,
    md: { gridTemplateColumns: "1fr 1fr" },
  },
  card: {
    padding:       tokens.spacing.md,
    background:    tokens.surface.default,
    borderRadius:  tokens.radius.md,
    boxShadow:     tokens.shadow.sm,
  },
  title: {
    fontSize:   "1.25rem",
    fontWeight: 600,
    marginBlockEnd: tokens.spacing.sm,
  },
});

async function loadArticles() {
  // Direct database / API call from the server.
  return await db.article.findMany({ take: 10 });
}

export default async function ArticlesPage() {
  const articles = await loadArticles();
  return (
    <ul className={$.list}>
      {articles.map(a => (
        <li key={a.id} className={$.card}>
          <h2 className={$.title}>{a.title}</h2>
          <p>{a.excerpt}</p>
        </li>
      ))}
    </ul>
  );
}
```

## How it works

The Next.js webpack loader runs over **every** module — server and client. Both paths produce literal class strings; the compiler doesn't distinguish. The atomic CSS file is single-source-of-truth for both.

The `__TRACELESS_STYLE_META__` constant injected via `DefinePlugin` is available in both server and client bundles (it's a compile-time constant, not a runtime DOM thing), so `tl.merge` works in Server Components too.

## What about `useTracelessDark` / `<ThemeToggle />`?

Those are **client components** — they use React hooks and DOM APIs. Mark them with the `"use client"` directive (Next.js handles this automatically via the package boundary):

```tsx
// app/header.tsx
"use client";
import { ThemeToggle } from "traceless-style/dark";

export function Header() {
  return <header><ThemeToggle /></header>;
}
```

`<TracelessRoot />`, however, is a **pure render** — no hooks, no effects. It's safe in Server Components and runs in your root layout without `"use client"`.

## Streaming

Server-rendered HTML using traceless-style classes streams correctly because:

1. The class names are deterministic (same input → same hash).
2. The CSS is shipped as a single `<link>`-able stylesheet, not injected into the DOM at runtime.
3. There's no per-component `<style>` tag (which traditional CSS-in-JS requires for SSR).

Browsers can paint the first byte of HTML the moment the stylesheet loads — no waiting for JS hydration.

## Limitations

- **Avoid `tl.extend` calls in server-component-only files** that aren't reachable from your `srcDir`. Pass 1 still finds them, but if a server file is gated behind a runtime check, the extension might not be visible. Define custom variants in a shared module imported by both server and client.
- **`tl.keyframes` in a server file** works, but the animation only runs in the browser (server-rendered HTML doesn't animate). The class is deterministic.

## See also

- [Next.js integration](../integrations/nextjs.md)
- [The compiler](../learn/11-the-compiler.md)
