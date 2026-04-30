# Configuration: `traceless-style.config.js`

Optional file at the project root. CommonJS only — `traceless-style.config.js`, not `.mjs` or `.ts`.

## Full shape

```js
// traceless-style.config.js
module.exports = {
  /* Source roots to scan. Default: union of `src/` and `app/` if either exists. */
  srcDir: "src",                            // string or string[]

  /* Lint configuration. Default: all rules ON (strict). */
  lint: {
    noInlineStyles: true,                   // cannot be disabled fully
    noClassString:  true,
    noCSSModules:   true,
    noTailwind:     true,
    ignore:         ["**/__tests__/**"],
  },
  // …or `lint: false` to disable noClassString/noCSSModules/noTailwind
  //   (noInlineStyles stays on).

  /* Auto dark-mode derivation. Default: true. */
  autoDarkMode: true,

  /* Auto RTL physical → logical rewriting. Default: true. */
  autoRtl: true,

  /* WCAG contrast validation. Default: AA enforced, strict by default
     (build fails on errors). Set strict: false to demote to warnings. */
  contrast: {
    level:               "AA",          // "AA" | "AAA" | "off"
    strict:              true,          // AA failures → build errors (default true)
    strictAAA:           false,         // AAA failures → build errors
    surfaceLight:        "#fafafa",
    surfaceDark:         "#0a0a0f",
    largeTextSize:       18,            // px threshold for "large text"
    auditUiComponents:   true,          // §1.4.11 — borders, caret, accent, etc.
    auditPlaceholder:    true,          // §1.4.3 for &::placeholder selectors
    gradientSampleCount: 5,             // midpoints between adjacent gradient stops
    suggestionSpace:     "oklch",       // "oklch" | "hsl" — fix-color search space
    auditPeerSurfaces:   false,         // opt-in: cross-validate against sibling bgs
  },

  /* Custom variants — also detected from `tl.extend({ variants })` calls.
     Putting them here is optional; useful when you want them centralized. */
  variants: {
    _tablet: "@media (min-width: 900px)",
  },
};
```

## Key reference

### `srcDir: string | string[]`

Source root(s) to scan. If unset, the CLI scans both `src/` and `app/` (whichever exist) plus the project root as a final fallback.

### `lint`

See [Linting](../learn/12-linting.md) for the full rule list.

| Key | Type | Default | Notes |
|---|---|---|---|
| `noInlineStyles` | `boolean` | `true` | Cannot be fully disabled — even `lint: false` keeps this on |
| `noClassString`  | `boolean` | `true` | Reject bare `className="..."` strings |
| `noCSSModules`   | `boolean` | `true` | Reject `.module.css` imports |
| `noTailwind`     | `boolean` | `true` | Reject Tailwind utility class names |
| `ignore`         | `string[]` | `[]` | Glob patterns to skip |

### `autoDarkMode: boolean`

When `true` (default), the compiler derives a dark-mode variant of every color value in your styles. See [Dark mode](../learn/08-dark-mode.md). Disable via `_autoDark: false` per group, or globally with `autoDarkMode: false`.

### `autoRtl: boolean`

When `true` (default), the compiler rewrites physical CSS properties (`marginLeft`, `paddingRight`, etc.) to their logical equivalents. See [RTL](../learn/09-rtl.md). Disable per group with `_autoRtl: false`.

### `contrast`

WCAG 2.1 + 2.2 audit settings. The full feature set is documented in
[WCAG contrast validation](../learn/13-wcag-contrast.md).

| Key | Type | Default | Notes |
|---|---|---|---|
| `level` | `"AA" \| "AAA" \| "off"` | `"AA"` | Highest standard the validator aims for. AA is the legal floor for Section 508 (US) and EN 301 549 (EU). |
| `strict` | `boolean` | **`true`** | AA failures → build errors. Set `false` to demote to warnings while migrating an older codebase. |
| `strictAAA` | `boolean` | `false` | AAA failures → build errors. AAA is best-effort enhancement; many legitimate designs (large hero gradients, decorative chips) fail it. |
| `surfaceLight` | `string` | `"#fafafa"` | Assumed light-mode page surface. Used to composite translucent backgrounds before measurement (CSS Color 4 §10). |
| `surfaceDark` | `string` | `"#0a0a0f"` | Assumed dark-mode page surface. |
| `largeTextSize` | `number` | `18` | Pixel threshold above which text qualifies as "large" (3:1 / 4.5:1 instead of 4.5:1 / 7:1). WCAG defines large as ≥18pt regular OR ≥14pt bold. |
| `auditUiComponents` | `boolean` | `true` | Audit border / outline / caret / accent / text-decoration / box-shadow colors per §1.4.11 (≥3:1). |
| `auditPlaceholder` | `boolean` | `true` | Audit `&::placeholder` selectors. Placeholder text counts as text under §1.4.3. |
| `gradientSampleCount` | `number` | `5` | When auditing `color: transparent` + `background-clip: text`, sample N midpoints between each pair of adjacent gradient stops. Catches low-contrast troughs that lie between two acceptable declared stops. Set to `0` to only check declared stops. |
| `suggestionSpace` | `"hsl" \| "oklch"` | `"oklch"` | Color space for the fix-suggestion binary search. OKLCH preserves hue and chroma intent better than HSL — a brand blue stays blue. |
| `auditPeerSurfaces` | `boolean` | `false` | When true, audit a group's `color` against the backgrounds declared on **sibling groups** in the same `tl.create({...})` call. Catches cross-component contrast bugs but produces false positives on unrelated siblings. Off by default; enable for design-system rigor. |

### `variants`

Optional pre-registered custom variants. Same format as `tl.extend({ variants: ... })`. Most projects prefer the `tl.extend` form (variant definitions colocated with code).

## Environment variables

| Variable | Effect |
|---|---|
| `TRACELESS_STYLE_PARSER` | Force parser: `"swc"` or `"legacy"`. Overrides config. |
| `TRACELESS_STYLE_DEBUG_RESOLVE` | When set to `1`, prints the cross-file token export registry after Pass 0. Useful for debugging "my import isn't expanding." |

## Loading order

The CLI (`src/cli/extract.ts`) loads config in this order:

1. Resolve `traceless-style.config.js` from `process.cwd()`.
2. If it exists, `require()` it (with cache-busted re-read for watch mode).
3. Apply `srcDir` → CLI `SRC_DIRS`.
4. Apply `lint` → CLI lint runner.
5. Apply `autoDarkMode` → `setAutoDarkMode(false)` if `false`.
6. Apply `contrast` → `setContrastOptions(cfg.contrast)`.

If the config file is missing or malformed, defaults are used silently.

## ESM project notes

If your project uses `"type": "module"` in package.json, name the config explicitly:

- ✅ `traceless-style.config.cjs` (CommonJS)
- ❌ `traceless-style.config.mjs` (not currently supported — `require()` cannot load ESM)
- ❌ `traceless-style.config.ts` (not currently supported)

The CLI uses Node's `require()` to load the config — see `createRequire(import.meta.url)` in `src/cli/extract.ts`.

## See also

- [CLI](./cli.md)
- [Linting](../learn/12-linting.md)
- [Dark mode](../learn/08-dark-mode.md)
- [WCAG contrast validation](../learn/13-wcag-contrast.md)
