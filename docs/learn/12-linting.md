# Linting

traceless-style ships a **strict-by-default** linter that runs before extraction. It rejects styling patterns that bypass the compiler — inline styles, bare class strings, CSS modules, and Tailwind utility classes.

```
🚫 traceless-style blocked — fix 3 lint errors before continuing.

  app/Card.tsx:7:5
  ✗ no-inline-styles: Inline `style={{}}` bypasses traceless-style. Use tl.create instead.

      <div style={{ padding: 16 }}>
           ~~~~~~~~~~~~~~~~~~~~~~

  app/Button.tsx:4:13
  ✗ no-class-string: Bare className strings break atomic CSS guarantees.

      <button className="px-4 py-2">
                        ~~~~~~~~~~

  app/Header.tsx:1:21
  ✗ no-css-modules: CSS Modules collide with traceless-style's deduplication.

      import s from "./Header.module.css";
                    ~~~~~~~~~~~~~~~~~~~~
```

## The four rules

All four are **on by default**. Configuration is opt-out, in `traceless-style.config.js`:

```js
module.exports = {
  lint: {
    noInlineStyles: true,       // (always on — cannot be disabled fully)
    noClassString:  false,      // allow bare className="..."
    noCSSModules:   false,      // allow .module.css imports
    noTailwind:     false,      // allow Tailwind utility classes
  },
};
```

### `no-inline-styles` (cannot be disabled)

```tsx
<div style={{ padding: 16 }}>      // ✗
<div style="padding: 16px;">       // ✗
```

Inline styles bypass the compiler entirely — no atomic deduplication, no auto-dark, no auto-RTL, no contrast validation. There is **no legitimate reason** to use them in a traceless-style project. Even setting `lint: false` in the config does NOT disable this rule.

If you need a truly dynamic value (CSS custom property updated by JS), use a CSS variable:

```tsx
<div style={{ "--progress": progress }}>   // ✓ pattern: setting a CSS var
```

…then read it in your tl.create:

```ts
tl.create({ bar: { width: "var(--progress)" } });
```

### `no-class-string`

```tsx
<button className="px-4 py-2 text-white">    // ✗
```

Bare class strings can't be deduplicated by `tl.merge` (no metadata) and produce visually different results on different rebuilds. Use `tl.create`:

```tsx
const $ = tl.create({ btn: { padding: "8px 16px", color: "white" } });
<button className={$.btn} />
```

### `no-css-modules`

```ts
import styles from "./Card.module.css";    // ✗
```

CSS Modules use per-file scoping and don't deduplicate across files. Mixing them with atomic CSS produces a strictly-larger bundle and unpredictable cascade order.

### `no-tailwind`

The linter detects Tailwind-style utility class names (`px-4`, `bg-red-500`, `flex`, `hover:underline`) and rejects them:

```tsx
<button className="px-4 py-2 bg-blue-500">    // ✗ no-tailwind
```

The detection is heuristic (recognized prefixes + numeric suffixes). False positives are rare; if one occurs, opt out per-file with the `// traceless-disable-next-line` directive (TODO if not yet implemented — for now, set `lint: { noTailwind: false }` globally and configure your editor to flag Tailwind classes).

## Disabling individual rules

```js
// traceless-style.config.js
module.exports = {
  lint: {
    noClassString: false,    // keep noInlineStyles, noCSSModules, noTailwind on
  },
};
```

Setting `lint: false` disables `noClassString`, `noCSSModules`, `noTailwind`, but **keeps `noInlineStyles` on** for the reason above.

## Lint runs before extraction

The CLI structure (`src/cli/extract.ts`):

```
1. Load config
2. Run lint over every .tsx / .jsx file
3. If errors > 0 → exit 1, do NOT extract
4. Extract styles
```

This means lint errors block builds, even in dev mode. The intent is "fail fast" — a bare className that compiles in dev but not prod is a worse outcome than a 100% consistent failure.

## Per-file directives

```tsx
// traceless-disable-next-line
<div className="legacy-class">…</div>

// traceless-disable
import styles from "./old.module.css";

// traceless-enable
```

(Status: directive scanning is implemented behind the standard lint pass; check `src/compiler/lint.ts` for the exact directive set in your version.)

## Targeting

Lint runs only on `.tsx` and `.jsx` files (the user's component source). It does NOT scan:

- `node_modules/`
- Files in directories starting with `.`
- `.ts` / `.js` files (which usually don't contain JSX)

You can additionally exclude files via `lint.ignore` in the config:

```js
module.exports = {
  lint: {
    ignore: ["**/__tests__/**", "**/legacy/**"],
  },
};
```

## Editor integration

The [VS Code extension](../integrations/vscode.md) surfaces lint errors as squigglies in real time, before the build runs. Auto-fix suggests replacements where possible (e.g. typo'd property names).

Continue to [13. WCAG contrast validation](./13-wcag-contrast.md).
