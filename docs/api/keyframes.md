# `tl.keyframes`

Declare a CSS `@keyframes` animation. Returns the hashed identifier (`tlKf<hash>`) for use in an `animation` value.

## Signature

```ts
function keyframes(
  name:   string,
  frames: Record<string, Record<string, unknown>>
): string;
```

## Examples

### Simple fade

```ts
const fadeIn = tl.keyframes("fadeIn", {
  from: { opacity: 0 },
  to:   { opacity: 1 },
});

const $ = tl.create({
  modal: { animation: `${fadeIn} 0.2s ease-in` },
});
```

### Multi-step

```ts
const slideUp = tl.keyframes("slideUp", {
  "0%":   { opacity: 0, transform: "translateY(20px)" },
  "60%":  { opacity: 0.8 },
  "100%": { opacity: 1, transform: "translateY(0)"   },
});
```

### With reduce-motion fallback

```ts
const pulse = tl.keyframes("pulse", {
  "0%": { opacity: 1 },
  "50%":{ opacity: 0.5 },
  "100%":{ opacity: 1 },
});

const $ = tl.create({
  liveDot: {
    animation: `${pulse} 1.5s ease-in-out infinite`,
    motionReduce: { animation: "none" },
  },
});
```

## Step keys

| Form | Example |
|---|---|
| `from` | `from: { opacity: 0 }` |
| `to`   | `to: { opacity: 1 }` |
| `<integer>%` | `"50%": { ... }` |
| `<decimal>%` | `"33.33%": { ... }` |

Anything else is rejected with a build error.

## Per-step value validation

Properties inside each step go through the same allowlist + injection guard as `tl.create` — unknown properties get a "did you mean" suggestion, and CSS-injection chars in values are rejected.

## Hashing & sharing

The animation name passed to `tl.keyframes("name", ...)` is hashed with `fnv32a("keyframes:" + name)` and prefixed with `tlKf`. The same name in two files produces the same hash, so you can declare keyframes once in a shared module and import the resulting string.

## Compile output

For:

```ts
const fadeIn = tl.keyframes("fadeIn", { from: { opacity: 0 }, to: { opacity: 1 } });
```

The CSS file gains:

```css
@keyframes tlKfa1b2c3d4 {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

The variable `fadeIn` is replaced at the call site with the literal `"tlKfa1b2c3d4"`.

## See also

- [Keyframes & animation](../learn/07-keyframes.md)
