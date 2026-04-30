# `tl.merge`

Last-wins conflict-aware class joining. Reads compile-time-injected metadata to deterministically pick the latest input that sets each property.

## Signature

```ts
function merge(
  ...inputs: (string | undefined | null | false | 0)[]
): string;
```

## Behavior

- **Falsy inputs** (`undefined`, `null`, `false`, `0`, `""`) are silently dropped.
- Each non-empty input is split on whitespace.
- For each individual class, looks up `__TRACELESS_STYLE_META__[class]` to find the property key it controls.
- The **last class for each property key wins**.
- Classes not in the meta map are preserved as-is, in input order.
- Returns a single space-joined string.

## Examples

### Basic conflict resolution

```ts
const base   = tl.create({ b: { color: "white", padding: "8px" } });
const danger = tl.create({ d: { color: "red"                   } });

tl.merge(base.b, danger.d);
// → "tl<padding-8px> tl<color-red>"   (color:white dropped)
```

### Conditional override

```ts
const $ = tl.create({
  base:   { color: "black", padding: "8px" },
  active: { color: "blue" },
  error:  { color: "red"  },
});

tl.merge($.base, isActive && $.active, isError && $.error);
// only the LAST truthy color wins
```

### Component prop forwarding

```tsx
function Card({ className, children }: {
  className?: string;
  children: React.ReactNode;
}) {
  const $ = tl.create({ card: { padding: "1rem", background: "white" } });
  return (
    <article className={tl.merge($.card, className)}>
      {children}
    </article>
  );
}

// Caller's className wins on any conflicting property:
<Card className={tl.create({ override: { background: "yellow" } }).override} />
```

## Why `__TRACELESS_STYLE_META__` matters

Without the compile-time meta map, `tl.merge` falls back to set-deduplication only — duplicate classes are dropped, but property conflicts may remain visible:

```ts
// With meta:    "tl<padding-8px> tl<color-red>"
// Without meta: "tl<color-white> tl<padding-8px> tl<color-red>"
//                ↑ kept, even though it's overridden — last in HTML wins,
//                  which works for this trivial case but is unreliable
//                  with raw selector overrides.
```

The Webpack/Next.js plugin injects the meta map automatically via `DefinePlugin`. For test environments outside the bundler:

```ts
import { __setMeta } from "traceless-style";
__setMeta({ "tla1b2c3d4": "color", /* ... */ });
```

## See also

- [`tl.cx`](./cx.md) — conditional joining without conflict resolution
- [Composition: `tl.merge` and `tl.cx`](../learn/10-merge-and-cx.md)
