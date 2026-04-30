# `tl.cx`

clsx-style conditional class joining. No conflict resolution — preserves input order, drops falsy values.

## Signature

```ts
function cx(
  ...inputs: (
    | string
    | undefined
    | null
    | false
    | 0
    | Record<string, boolean>
  )[]
): string;
```

## Examples

### Conditional strings

```ts
tl.cx($.btn, isPrimary && $.primary, isDisabled && $.disabled);
```

### Object form

```ts
tl.cx($.btn, {
  [$.primary]:  variant === "primary",
  [$.danger]:   variant === "danger",
  [$.large]:    size === "lg",
});
```

### Mixed

```ts
tl.cx(
  "third-party-utility",          // arbitrary class string
  $.btn,                          // tl.create class
  isHover && $.hovered,           // conditional
  { [$.disabled]: !canClick },    // object form
);
```

## When to use `tl.cx` vs `tl.merge`

| Need | Use |
|---|---|
| Conditional classes that DON'T conflict | `tl.cx` |
| Conditional classes that DO conflict on a property | `tl.merge` |
| Mixing tl.create classes with arbitrary class strings | `tl.cx` |
| Component prop forwarding with override priority | `tl.merge` |

`tl.cx` is faster (no meta map lookup). Use `tl.merge` when correctness depends on the last-wins semantic.

## See also

- [`tl.merge`](./merge.md) — last-wins joining with conflict resolution
- [Composition: `tl.merge` and `tl.cx`](../learn/10-merge-and-cx.md)
