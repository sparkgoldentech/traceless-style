# Composition: `tl.merge` and `tl.cx`

Atomic CSS forces a question that legacy CSS never had to answer: **when two classes set the same property, which wins?** traceless-style answers this with `tl.merge` (conflict-aware, last-wins) and `tl.cx` (clsx-style conditional joining).

## `tl.merge(...inputs)`

Last-wins conflict resolution. Reads compile-time-injected metadata to know which property each class controls.

```ts
import { tl } from "traceless-style";

const base   = tl.create({ btn:    { color: "white", padding: "8px" } });
const danger = tl.create({ d:      { color: "red"                   } });

const cls = tl.merge(base.btn, danger.d);
// → "tl<padding-8px> tl<color-red>"
//   ↑ color:white was dropped because color:red came later
```

### Signature

```ts
function merge(
  ...inputs: (string | undefined | null | false | 0)[]
): string;
```

- Falsy inputs (`undefined`, `null`, `false`, `0`, `""`) are silently ignored — useful for conditional composition.
- Each non-empty string is split on whitespace.
- For each individual class, the compiler-injected `__TRACELESS_STYLE_META__` map is consulted to find its property key.
- The **last** class for each property key wins.
- Classes not in the meta map are preserved as-is, in input order.

### Why this works

The Webpack/Next.js plugin uses `DefinePlugin` to inject a global constant `__TRACELESS_STYLE_META__` that maps every emitted class name to its property key:

```js
__TRACELESS_STYLE_META__ = {
  "tl<color-white>":  "color",
  "tl<color-red>":    "color",
  "tl<padding-8px>":  "padding",
  // ...
};
```

If this constant is missing (e.g. raw `node` execution outside the bundler), `tl.merge` falls back to set-deduplication only — duplicates are removed but property conflicts may remain.

### When to use it

- Component prop forwarding: `<Button className={tl.merge(internalClasses, props.className)} />`
- Style overrides: a `Card` gets a `Card.Danger` variant by merging classes.
- Conditional state: `tl.merge(base, isActive && active, isError && error)`.

### When NOT to use it

- For non-conflicting joins, use `tl.cx`. It's faster (no map lookup).
- For two classes from the same `tl.create` call (already deduplicated), no merging is needed.

## `tl.cx(...inputs)`

clsx-style conditional class joining. No conflict resolution — preserves input order, drops falsy.

```ts
import { tl } from "traceless-style";

const cls = tl.cx(
  $.btn,
  isPrimary && $.primary,
  isDisabled && $.disabled,
  { [$.large]: size === "lg" },
);
```

### Signature

```ts
function cx(
  ...inputs: (string | undefined | null | false | 0 | Record<string, boolean>)[]
): string;
```

- Strings: included if truthy.
- Falsy values: dropped.
- Objects: each key included if its value is truthy (`{ "active": true, "disabled": false }` → `"active"`).

### When to use it

- Conditional styling that doesn't conflict: `tl.cx($.btn, isHover && $.hovered)`.
- Merging arbitrary class strings (not from `tl.create`): `tl.cx("third-party-class", $.btn)`.
- Building lists of classes from arrays: `tl.cx(...classes)`.

## Comparison table

| Feature | `tl.cx` | `tl.merge` |
|---|---|---|
| Conditional input | Yes | Yes |
| Object-form input (`{ class: bool }`) | Yes | No |
| Drops duplicates | No | Yes (set-dedup) |
| Resolves property conflicts | **No** | **Yes** |
| Reads `__TRACELESS_STYLE_META__` | No | Yes |
| Performance | O(n) string concat | O(n) map lookups |

## Patterns

### Prop forwarding with override priority

```tsx
function Button(props: {
  className?: string;
  children?: React.ReactNode;
}) {
  const $ = tl.create({
    btn: { padding: "8px 16px", color: "white", background: "blue" },
  });

  return (
    <button className={tl.merge($.btn, props.className)}>
      {props.children}
    </button>
  );
}

// User usage:
<Button className={tl.create({ override: { color: "yellow" } }).override} />
// → background:blue + padding:... + color:yellow (yellow wins)
```

### Variant composition

```tsx
const variants = tl.create({
  base:      { padding: "8px",  borderRadius: "4px" },
  primary:   { background: "blue",   color: "white" },
  secondary: { background: "white",  color: "blue", border: "1px solid blue" },
  danger:    { background: "red",    color: "white" },
});

function Button({ variant = "primary", ...props }) {
  return (
    <button className={tl.merge(variants.base, variants[variant])} {...props} />
  );
}
```

### Stateful classes

```tsx
const $ = tl.create({
  base:     { padding: "8px", color: "black" },
  active:   { color: "blue" },
  disabled: { opacity: 0.5,   pointerEvents: "none" },
  error:    { color: "red", borderColor: "red" },
});

const cls = tl.cx(
  $.base,
  isActive   && $.active,
  isDisabled && $.disabled,
  isError    && $.error,
);
```

If two of these enabled-classes conflict (e.g. `$.active` and `$.error` both set `color`), use `tl.merge` instead so the last-truthy one wins deterministically.

### Working without the bundler

If your code runs in an environment where the bundler transform didn't run (e.g. Vitest without setup, raw Node), `__TRACELESS_STYLE_META__` is undefined and `tl.merge` falls back to set-deduplication. To get full conflict-resolution semantics in tests, either:

1. Run your tests with the bundler integration (Vitest + `tracelessStyle()` Vite plugin).
2. Or call `__setMeta(meta)` to inject the meta map manually:

```ts
import { __setMeta } from "traceless-style";

__setMeta({
  "tla1b2c3d4": "color",
  "tle5f6g7h8": "padding",
});
```

In production, `__TRACELESS_STYLE_META__` is always injected by the plugin, so this manual step is only ever needed in test setups.

Continue to [11. The compiler](./11-the-compiler.md).
