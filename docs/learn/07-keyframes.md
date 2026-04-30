# Keyframes & animation

`tl.keyframes` is the analogue of CSS `@keyframes`. It returns an animation name you can drop into the `animation` property of any `tl.create` call.

```ts
import { tl } from "traceless-style";

const fadeIn = tl.keyframes("fadeIn", {
  from: { opacity: 0 },
  to:   { opacity: 1 },
});

const slideUp = tl.keyframes("slideUp", {
  "0%":   { opacity: 0, transform: "translateY(20px)" },
  "100%": { opacity: 1, transform: "translateY(0)"   },
});

const $ = tl.create({
  modal: {
    animation: `${fadeIn} 0.2s ease-in, ${slideUp} 0.3s 0.1s ease-out`,
  },
});
```

What this compiles to:

```css
@keyframes tlKfa1b2c3d4 {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes tlKfe5f6g7h8 {
  0%   { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0);    }
}
.tl<modal-anim-hash> { animation: tlKfa1b2c3d4 0.2s ease-in, tlKfe5f6g7h8 0.3s 0.1s ease-out; }
```

`fadeIn` is a string (`"tlKfa1b2c3d4"`) at runtime, so template-literal embedding in animation shorthands works naturally.

## Step keys

Each top-level key in the second argument is a keyframe step. Valid step names:

| Form | Example |
|---|---|
| `from` | `from: { opacity: 0 }` |
| `to`   | `to:   { opacity: 1 }` |
| `<integer>%` | `"50%": { transform: "scale(1.05)" }` |
| `<decimal>%` | `"33.33%": { ... }` |

Anything else (e.g. `"middle"`, `"halfway"`) is rejected with a build error.

## Per-step value validation

Properties inside each step go through the **same allowlist + injection guard** as `tl.create`:

```ts
tl.keyframes("bad", {
  from: {
    colour: "red",                       // ✗ Unknown CSS property — did you mean 'color'?
    color:  "red; background: blue;",    // ✗ CSS-injection char in value
  },
});
```

This is the third defense layer (after AST literal-only parsing and property allowlist). Step-level validation prevents a malicious or broken keyframe from breaking out of its rule block.

## Naming and hashing

The animation name passed to `tl.keyframes("name", ...)` is hashed with `fnv32a("keyframes:" + name)` and prefixed with `tlKf`. The same name in two files produces the **same hash**, so you can declare one keyframe in a shared module and import the resulting string:

```ts
// app/animations.ts
export const fadeIn = tl.keyframes("fadeIn", { from: { opacity: 0 }, to: { opacity: 1 } });

// app/Modal.tsx
import { fadeIn } from "../app/animations";
const $ = tl.create({ modal: { animation: `${fadeIn} 0.2s` } });
```

Each unique `(name, frames)` pair produces exactly one `@keyframes` rule.

## Combining with variants

Use variants to gate animations on user preferences:

```ts
const $ = tl.create({
  pulse: {
    animation: `${fadeIn} 1s ease-in-out infinite`,

    motionReduce: {
      animation: "none",                 // Respect user's "reduce motion" setting
    },
  },
});
```

## Common patterns

### Spring-style appearance

```ts
const popIn = tl.keyframes("popIn", {
  "0%":   { opacity: 0, transform: "scale(0.85)" },
  "60%":  { opacity: 1, transform: "scale(1.03)" },
  "100%": { opacity: 1, transform: "scale(1)"    },
});
```

### Loading spinner

```ts
const spin = tl.keyframes("spin", {
  to: { transform: "rotate(360deg)" },
});

const $ = tl.create({
  spinner: {
    width:  "24px",
    height: "24px",
    border: "2px solid #ccc",
    borderTopColor: "#3b82f6",
    borderRadius:   "50%",
    animation:      `${spin} 0.8s linear infinite`,
  },
});
```

### Pulse with reduced-motion fallback

```ts
const pulse = tl.keyframes("pulse", {
  "0%":   { opacity: 1 },
  "50%":  { opacity: 0.5 },
  "100%": { opacity: 1 },
});

const $ = tl.create({
  liveDot: {
    animation:    `${pulse} 1.5s ease-in-out infinite`,
    motionReduce: { animation: "none" },
  },
});
```

## Caveats

- **No interpolation between non-animatable properties.** This is a CSS limitation, not a traceless-style one — `display: none → block` won't tween, but `opacity` and `transform` will.
- **The runtime fallback returns the same name without emitting CSS.** If you call `tl.keyframes` in an environment where the compiler didn't run (Server Components without bundler transform, Jest without setup), the name will resolve correctly but the `@keyframes` rule itself comes from the static stylesheet — the animation will work as long as the stylesheet was loaded.

Continue to [8. Dark mode](./08-dark-mode.md).
