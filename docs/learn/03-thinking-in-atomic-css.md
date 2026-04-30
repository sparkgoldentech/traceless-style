# Thinking in atomic CSS

The mental model behind traceless-style is small but unfamiliar if you've spent the last decade writing CSS-in-JS. This page introduces the concept and shows what it costs and what it saves.

## What is atomic CSS?

In *atomic* (or *functional*) CSS, every distinct `property: value` pair is one class. Two components that both use `padding: 8px` share the same class — there's no per-component stylesheet, no `Button-padding-3xfgh` collision-avoidance hash. Just:

```css
.tlxxxxxxxx { padding: 8px; }
```

When a component declares:

```ts
const $ = tl.create({ btn: { padding: "8px", color: "white" } });
```

…the compiler emits exactly two classes (`.tlxxxxxxxx`, `.tlyyyyyyyy`), registers them in the global pool, and rewrites `$.btn` to `"tlxxxxxxxx tlyyyyyyyy"`. Another component that uses `padding: "8px"` reuses the same class — no second rule is emitted.

## Why it scales

The **vocabulary of CSS values most apps actually use is small.** Most apps converge on:

- 6–10 colors per theme
- 6–10 spacing units (rem-based scale)
- 4–5 font-sizes
- 3–6 border-radius values
- 5–10 box-shadow recipes

Multiplied across ~30 properties that take those values plus media-query and pseudo-class variants, you end up with a CSS file that grows logarithmically: it gets bigger fast at first, then asymptotes. Real measurements from `bench/RESULTS.md`:

| Files (each with 5 styles) | Atomic rules emitted | CSS size |
|---|---|---|
| 100 | 412 | 28 KB |
| 1,000 | 1,247 | 72 KB |
| 5,000 | 1,681 | 95 KB |
| 50,000 | 1,894 | 105 KB |

The 50,000-file project ships **less CSS than a single styled-components page** typically does after the first hour of use.

## Why deduplication only works at the value level

Two `display: flex` declarations from different files are *the same rule*. Two `color: red` declarations are *the same rule*. The browser treats them identically, so we can collapse them into one selector. This is the core insight; everything else follows.

But two `Button.css` modules each defining `.button { padding: 8px; color: white; }` are **two rules** — the selectors differ. CSS Modules adds per-file specificity that prevents reuse. Atomic CSS removes the per-file boundary.

## The cost: HTML payload increases slightly

A component that uses 10 distinct properties produces an element with 10 classes:

```html
<button class="tlaa11 tlaa12 tlaa13 tlaa14 tlaa15 tlaa16 tlaa17 tlaa18 tlaa19 tlaa20">…</button>
```

Each class is 10 bytes. Ten classes = 100 bytes per element. For an HTML document with 1,000 styled elements, that's 100 KB of additional HTML payload — **but**:

- HTML compresses extremely well (gzip on a class list of 10 atomic classes is ~30 bytes per element, not 100).
- You're trading HTML size for *CSS size + browser parse time*. CSS bundle is shipped once; HTML payload only matters for the initial page load.
- Modern browsers parse 100 atomic classes faster than they parse one CSS rule with 10 declarations because the parser hits the same hashed entries.

In practice: SSR'd HTML grows by ~5–15%, CSS shrinks by 80–95%, total transfer is smaller, and Time-To-First-Paint improves.

## How conflicts are resolved

If two atomic classes both set the same CSS property, the **last one in the `class` attribute wins** — but only because the underlying CSS rules have *equal specificity*. Source-order in the stylesheet matters too. traceless-style emits rules in registration order, but for an atomic system that's not enough — you need a class-attribute deduplicator that keeps the *last one per property*.

That deduplicator is `tl.merge()`. See [Composition: `tl.merge` and `tl.cx`](./10-merge-and-cx.md).

```ts
const base       = tl.create({ b: { color: "white", padding: "8px" } });
const danger     = tl.create({ d: { color: "red" } });

<button className={tl.merge(base.b, danger.d)} />
// → "tl<padding-8px> tl<color-red>"
//   ↑ color:white was dropped because color:red came later
```

`tl.merge` works because the compiler injects a runtime constant `__TRACELESS_STYLE_META__` that maps every class back to the property it controls. Without it, the runtime falls back to set-deduplication only.

## Mental model summary

1. Every CSS rule in your project is a *value* in a global pool.
2. Components don't *own* CSS — they *select* CSS classes from the pool.
3. The compiler is responsible for ensuring identical inputs hash to identical class names.
4. Conflicts are resolved by the *last write* in `tl.merge`, not by stylesheet order.
5. The runtime fallback hash is mathematically identical to the compiler hash, so untransformed code paths produce the same output as transformed ones.

Continue to [4. Defining styles with `tl.create`](./04-defining-styles.md).
