# WCAG contrast validation

traceless-style runs a **build-time accessibility audit** on every
`tl.create({...})` group. Color/background pairs are checked against
WCAG 2.1 thresholds (and WCAG 2.2 for focus rings). The build fails
by default when something doesn't meet AA. An interactive auto-fix
prompt walks you through accessible replacements that preserve your
design's hue.

What gets checked, where, against which spec — all of it is in this
page. The features are wide, so the page is long; jump via the table
of contents below.

- [Quick example](#quick-example)
- [What gets audited](#what-gets-audited)
- [Standards we cite](#standards-we-cite)
- [Strict-by-default](#strict-by-default)
- [Configuration](#configuration)
- [APCA Lc readout](#apca-lc-readout)
- [Token-aware audits](#token-aware-audits)
- [Gradient-text auditing](#gradient-text-auditing)
- [UI-component contrast (§1.4.11)](#ui-component-contrast)
- [Focus indicators (§2.4.13)](#focus-indicators)
- [Image backgrounds](#image-backgrounds)
- [Peer-surface auditing](#peer-surface-auditing)
- [Auto-dark interaction](#auto-dark-interaction)
- [Suggested replacements](#suggested-replacements)
- [Per-group escape hatch](#per-group-escape-hatch)
- [Interactive auto-fix](#interactive-auto-fix)
- [Diagnostic codes](#diagnostic-codes)
- [Limits, honest](#limits-honest)

---

## Quick example

```ts
const $ = tl.create({
  card: {
    backgroundColor: "#ffffff",
    color:           "#bbbbbb",        // ← 1.85:1 against white
  },
});
```

```
✗ [TLS0501 · WCAG 2.1 AA — 1.4.3] app/Card.tsx — card (text, light)
    Insufficient contrast — light mode: color "#bbbbbb" on backgroundColor
    "#ffffff" measures 1.85:1. WCAG 2.1 §1.4.3 (Level AA) requires ≥4.5:1
    for normal text. APCA Lc 22 (advisory; WCAG 3 working draft).
    Suggestion: change color to "#737373" for 4.5:1 contrast.
    docs: https://traceless-style.dev/diagnostics#tls0501

🚫 traceless-style halted build — fix 1 error before continuing.
```

Run with `--fix-contrast` (or just open it from a TTY) and the CLI
walks you through accepting `#737373` (or rejecting it) one issue at
a time.

---

## What gets audited

Inside every `tl.create({ groupName: { ... } })` body, six checks run:

| Check | When it runs | Standard | Threshold |
|---|---|---|---|
| Light-mode text | both `color` and `backgroundColor` literal | §1.4.3 (AA) | 4.5:1 normal, 3:1 large |
| Dark-mode text | a `_dark: { ... }` block (or auto-derived) | §1.4.3 (AA) | same |
| AAA upgrade | `level: "AAA"` set | §1.4.6 | 7:1 normal, 4.5:1 large |
| UI components | `borderColor`, `outlineColor`, `caretColor`, `accentColor`, `textDecorationColor`, informational `boxShadow` | §1.4.11 | 3:1 |
| Focus indicators | `outlineColor` (counts under both 1.4.11 and 2.4.13) | §2.4.13 | 3:1 |
| Gradient-text | `color: transparent` + `background-clip: text` | §1.4.3 | per-stop + sampled midpoints |
| Image bg | text + `background-image: url(...)` | §1.4.3 | advisory only |

**Translucent values** are composited against the configured surface
(default `#fafafa` light, `#0a0a0f` dark) before measurement, per
[CSS Color Module 4 §10 alpha compositing](https://www.w3.org/TR/css-color-4/#compositing).

**`var(--tl-X)` references** resolve through the token registry —
when you write `color: tl.cssVar("brand-primary")`, the validator
sees the underlying hex value and audits it. See
[Token-aware audits](#token-aware-audits).

**Auto-dark variants** are audited against the dark surface. When
you don't write an explicit `_dark` block, the validator audits the
auto-derived dark color for the same property. See
[Auto-dark interaction](#auto-dark-interaction).

---

## Standards we cite

Each diagnostic includes the canonical citation so you can look up
why the threshold exists.

| Citation | Threshold |
|---|---|
| [WCAG 2.1 §1.4.3 (AA)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html) | 4.5:1 normal text · 3:1 large |
| [WCAG 2.1 §1.4.6 (AAA)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-enhanced.html) | 7:1 normal · 4.5:1 large |
| [WCAG 2.1 §1.4.11 (AA)](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html) | 3:1 for UI components |
| [WCAG 2.2 §2.4.13 (AA)](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) | 3:1 focus indicator vs adjacent surface |
| [Section 508 (US)](https://www.section508.gov/manage/laws-and-policies/) | adopts WCAG 2.0 AA wholesale |
| [EN 301 549 (EU)](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/) | references WCAG 2.1 AA |
| [APCA / SAPC-W3 0.1.9](https://github.com/Myndex/SAPC-APCA) | advisory readout (WCAG 3 working draft) |
| [CSS Color Module 4](https://www.w3.org/TR/css-color-4/) | color spaces + alpha compositing math |

---

## Strict-by-default

The validator runs at **error severity** by default. AA failures fail
the build. This matches Section 508 / EN 301 549 — the minimum legal
contrast bar. To migrate an older codebase, set `strict: false` to
demote errors to warnings while you fix:

```js
// traceless-style.config.js
module.exports = {
  contrast: {
    strict: false,        // demote to warnings while migrating
  },
};
```

**AAA does not fail the build by default.** AAA (7:1 normal text) is
"best-effort" in the WCAG hierarchy — not legally required, and many
legitimate designs (hero gradients, decorative chips) won't reach it.
Set `strictAAA: true` to fail the build on AAA misses too.

---

## Configuration

```js
// traceless-style.config.js
module.exports = {
  contrast: {
    level:               "AA",          // "AA" | "AAA" | "off"
    strict:              true,          // build fails on AA misses
    strictAAA:           false,         // AAA stays warn-only
    surfaceLight:        "#fafafa",
    surfaceDark:         "#0a0a0f",
    largeTextSize:       18,
    auditUiComponents:   true,
    auditPlaceholder:    true,
    gradientSampleCount: 5,
    suggestionSpace:     "oklch",       // hue-preserving fix search
    auditPeerSurfaces:   false,         // opt-in cross-component check
  },
};
```

Every option is documented in [Configuration](../api/config.md#contrast).

The defaults are calibrated for new projects: strict AA, AAA-aware
suggestions, OKLCH-space hue-preserving fixes, midpoint sampling on
gradient text. The only opt-in is `auditPeerSurfaces` — it produces
useful warnings for design systems but false positives for apps where
sibling groups in a `tl.create({...})` aren't actually composed
together.

---

## APCA Lc readout

Every diagnostic includes an **APCA Lc** score alongside the WCAG
ratio:

```
measures 2.46:1. WCAG 2.1 §1.4.3 (Level AA) requires ≥4.5:1
for normal text. APCA Lc 47 (advisory; WCAG 3 working draft).
```

[APCA](https://github.com/Myndex/SAPC-APCA) (Advanced Perceptual
Contrast Algorithm) is a perception-weighted score on a roughly
−108..+106 scale. It's part of the WCAG 3 working draft — **not
normative today** — but a useful forward-compat readout. Positive
Lc means text is darker than the background (normal polarity);
negative means lighter (reverse polarity, e.g. white text on black).

Rough APCA bronze readability brackets:

| Lc magnitude | Use |
|---|---|
| ≥ 90 | very small text (<14pt) |
| ≥ 75 | body text 14pt+ regular / 12pt+ bold |
| ≥ 60 | headlines / display |
| ≥ 45 | large decorative |
| ≥ 30 | non-text spot elements (icons) |
| ≥ 15 | absolute floor — anything below is unreadable |

We use the **full SAPC-W3 0.1.9 reference** — not a simplified
educational version. Pure-black on pure-white scores `Lc 106`, the
top of the scale.

---

## Token-aware audits

When you write `color: tl.cssVar("brand-primary")`, the value reaches
the validator as `var(--tl-XXXXXX)`. The validator resolves it
through the token registry to the underlying color and audits THAT:

```ts
const tokens = tl.defineTokens({
  brand: {
    primary: "#3b82f6",         // 3.5:1 against #fafafa
    muted:   "#94a3b8",         // 2.5:1 — fails 4.5:1 for text
  },
});

const $ = tl.create({
  cardTitle: {
    color: tl.cssVar("brand-primary"),     // ✗ flagged — token resolves to 3.5:1
  },
  footnote: {
    color: tl.cssVar("brand-muted"),       // ✗ flagged — token resolves to 2.5:1
  },
});
```

The diagnostic shows `var(--tl-XXX)` in the message (so you can grep
your source for the token name) and tells you to update the token's
declaration in `tl.defineTokens()` rather than the consumer:

```
value comes from a design token (`var(--tl-wkweb9zz)`) — change the
token's value where it's declared in `tl.defineTokens({...})` or in
your `tl.createTheme(...)` overrides; our suggested literal "#677589"
would meet ≥4.5:1
```

Dark-mode resolution: when a token has a `darkValue` (set by
`tl.createTheme`), the dark-mode audit uses that value. When it
doesn't, the audit falls back to the light value as a worst-case.

---

## Gradient-text auditing

The pattern `color: transparent` + `background-clip: text` paints
text glyphs with a gradient. Each pixel of the glyph takes its color
from the gradient — so a single low-contrast stop renders that slice
of the text unreadable.

The validator:

1. Extracts every declared color stop from the gradient.
2. Audits each declared stop against the page surface.
3. Samples `gradientSampleCount` (default `5`) midpoints between each
   pair of adjacent stops by **linear interpolation in sRGB** and
   audits those too.

The midpoint sampling matters. A gradient `#000 0% → #f0f0f0 50% → #000 100%`
has acceptable endpoints (`21:1`) but a `#f0f0f0` midpoint that
measures `1.06:1` against `#fafafa`. Without midpoints we'd miss
exactly the unreadable slice.

Set `gradientSampleCount: 0` to disable midpoint sampling and only
check declared stops.

Conic and radial gradients are checked the same way as linear —
position hints (`50%`, `at center`, `from 90deg`) are stripped before
extraction.

---

## UI-component contrast

Per §1.4.11, the visual presentation of UI components must have a
contrast ratio of at least 3:1 against adjacent colors. The validator
checks:

| Property | Why |
|---|---|
| `borderColor` (and `borderTopColor`, `borderRightColor`, etc.) | Borders define the component's bounding box. |
| `outlineColor` | Focus rings and selection rings — also covered by §2.4.13. |
| `caretColor` | The text caret in inputs. Below 3:1 makes typing position invisible. |
| `accentColor` | Native form-control tinting (checkbox, radio, range). |
| `textDecorationColor` | Underlines / overlines / line-throughs. |
| `boxShadow` color (informational shadows only) | Skipped for soft drop-shadows. |

### The box-shadow heuristic

Box-shadows are tricky — `0 8px 32px rgba(99,102,241,0.4)` is a
decorative depth cue, not a UI component. We don't want to fail the
build on every soft glow. The validator distinguishes:

| Pattern | Treated as | Audited? |
|---|---|---|
| `inset` shadow | Border-via-shadow | yes |
| `... 4px <color>` (positive **spread**) | Focus ring or outline-via-shadow | yes |
| `0 8px 32px <color>` (positive **blur**, no spread) | Soft drop-shadow / glow | **skipped** |

This catches focus rings drawn via `box-shadow: 0 0 0 4px ...`
without flagging every aesthetic depth shadow.

To force a shadow to count, give it positive spread. To explicitly
opt out of any shadow's contrast check, use `_skipContrast: "ui"` at
the group level.

---

## Focus indicators

`outlineColor` is checked under **both** §1.4.11 (UI component, 3:1)
and §2.4.13 (focus appearance — same threshold but a different
citation). Diagnostics that come from §2.4.13 carry `TLS0504`; the
generic UI ones carry `TLS0503`.

WCAG 2.2's §2.4.13 also requires a minimum size for focus indicators
(2 CSS pixel area). We can't validate the size at compile time
without knowing the rendered geometry — that's runtime territory
(axe-core / Pa11y handle it).

---

## Image backgrounds

When a group has both `color` and a `url(...)`-bearing background,
the validator emits a **warning, not an error**:

```
⚠ [TLS0506 · WCAG 2.1 AA — 1.4.3] app/Hero.tsx — hero (image-bg, light)
    Image background detected on group "hero" — text contrast cannot be
    verified statically. Add a solid background layer (e.g. semi-opaque
    overlay) behind the text, OR validate this surface at runtime with
    axe-core / Pa11y.
```

Pixel-level contrast against an image is fundamentally a runtime
question — the same image can have wildly different luminance regions.
The library's stance: warn at build, defer to a runtime auditor.
Common fixes:

```ts
// Add an overlay layer between the image and the text:
hero: {
  backgroundImage: "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('/hero.jpg')",
  color:           "#ffffff",
},
```

The overlay is opaque enough that the validator can audit
`#ffffff` against `rgba(0,0,0,0.55)` composited over `#fafafa`
(passes ~10:1).

---

## Peer-surface auditing

Off by default. When `auditPeerSurfaces: true`, a group's `color` is
audited against every sibling group's `backgroundColor` in the same
`tl.create({...})` call, plus the configured page surface. The
worst-case ratio wins.

```ts
// auditPeerSurfaces: true
const $ = tl.create({
  hero:      { backgroundColor: "#0a0a0f", color: "#ffffff" },
  cardTitle: { color: "#000000" },             // ✗ — fails on the dark hero bg
});
```

Useful for design systems where every component must remain readable
on every other component's background. Disable for app code where
siblings in a `tl.create` aren't necessarily composed together.

---

## Auto-dark interaction

When you write a `color`/`backgroundColor` pair without an explicit
`_dark` block, the compiler [auto-derives](./08-dark-mode.md) a
dark-mode variant. The contrast validator audits the **auto-derived
pair** and flags failures the same way:

```ts
const $ = tl.create({
  card: {
    backgroundColor: "#ffffff",
    color:           "#0f172a",      // 17:1 in light — fine
    // No _dark block. The compiler derives:
    //   _dark: {
    //     backgroundColor: <dark variant of #ffffff>,
    //     color:           <dark variant of #0f172a>,
    //   }
    // Both are validated against #0a0a0f.
  },
});
```

Diagnostic messages tag auto-derived pairs explicitly:

```
color (auto-dark) "var(--tl-1115azxa)" on page surface "#0a0a0f"
measures 2.94:1
```

If the auto-dark pair fails, add an explicit `_dark` block to override
the derivation. The validator's suggested replacement is computed for
you to copy in:

```ts
heading: {
  color:  tl.cssVar("brand-primary"),
  _dark:  { color: "#60a5fa" },        // explicit override
},
```

---

## Suggested replacements

Every fix-eligible diagnostic includes a `Suggestion: change ... to "X"`
line. The replacement comes from a binary search in **OKLCH** space
(by default), which preserves the user's hue and chroma intent.

The full ladder of strategies:

1. **Alpha preservation.** When the input is `rgba(R,G,B,A)` with
   `A < 1`, we keep `R/G/B` unchanged and binary-search the smallest
   `A` that hits the target. A translucent-white border (`rgba(255,255,255,0.06)`)
   stays a translucent-white border — just opaque enough to be
   perceptible.
2. **OKLCH lightness search.** When alpha alone can't reach the
   target (or the input is opaque), search the L axis with H and C
   held constant. A "brand indigo" stays a brand indigo, just darker
   or lighter.
3. **Pure white/black fallback.** Only when sRGB gamut won't allow
   the target.

Switch to HSL-space search via `suggestionSpace: "hsl"` if you have
a specific reason — OKLCH's perceptual uniformity makes its results
look closer to the original color.

---

## Per-group escape hatch

The `_skipContrast` key on any group disables contrast checking for
that group — selectively or wholesale:

```ts
const $ = tl.create({
  // Skip every contrast check on this group:
  decorativeOverlay: {
    _skipContrast: true,
    color:         "#666",
    background:    "rgba(0,0,0,0.3)",
  },

  // Skip just light-mode checks (dark mode still audited):
  lightOnly: {
    _skipContrast: "light",
    color:         "#bbbbbb",
  },

  // Skip just UI-component checks (1.4.11) — keep text checks:
  softCard: {
    _skipContrast: "ui",
    backgroundColor: "#ffffff",
    color:           "#000000",
    boxShadow:       "0 8px 32px rgba(0,0,0,0.4)",   // would otherwise flag
  },

  // Multiple categories at once:
  badge: {
    _skipContrast: ["dark", "ui"],
    // ...
  },
});
```

Recognized values:

| Value | Effect |
|---|---|
| `true` / `"all"` | skip every check on this group |
| `"light"` | skip light-mode text + UI checks |
| `"dark"` | skip dark-mode text + UI checks |
| `"text"` | skip §1.4.3 / §1.4.6 text-contrast checks (keep UI) |
| `"ui"` | skip §1.4.11 UI-component checks (keep text) |
| `"focus"` | skip §2.4.13 focus-indicator checks |
| `"gradient"` | skip gradient-text per-stop checks |
| `"placeholder"` | skip `&::placeholder` checks |
| array of any of the above | skip the union |

Use sparingly. The suggestions in each error are computed to preserve
design intent — they're rarely a bigger change than disabling the
rule.

---

## Interactive auto-fix

Run extraction from a TTY (and not in CI) with `--fix-contrast`, or
just rely on the auto-prompt on `traceless-style dev` / `build`, and
the CLI walks you through every fixable issue:

```
╔══════════════════════════════════════════════════════════════════╗
║  traceless-style — interactive accessibility auto-fix            ║
╚══════════════════════════════════════════════════════════════════╝
  3 contrast issues found · 2 auto-fixable · 1 advisory
  Targets: WCAG 2.1 AAA (§1.4.6 ≥7:1 normal text) + APCA Lc ≥75
           WCAG 2.1 §1.4.11 / 2.2 §2.4.13 (UI ≥4.5:1, AA-large grade)
  Search:  OKLCH-space hue-preserving lightness adjustment

  Press Y / Enter to apply, N to skip, A to apply all, Q to quit.

  ⚠ app/Card.tsx → card.color  [WCAG 2.1 AA — 1.4.3]
    against : backgroundColor = #ffffff
    current : #bbbbbb
              1.85:1, APCA Lc 22  (need ≥4.5:1 for WCAG 2.1 AA — 1.4.3)
    fix     : #686868
              7.04:1, APCA Lc 78  (AAA-grade, hue preserved)
    Apply this fix? [Y/n/a=apply-all/q=quit]
```

Key behaviors:

- **Targets one tier higher than the diagnostic.** AA failures get
  AAA-grade replacements (7:1 normal text). UI components get AA-large
  (4.5:1 instead of the 3:1 minimum).
- **In-place edit, scoped to the group.** The rewriter finds the
  property inside its enclosing brace block and replaces the value
  literal — never touches an unrelated occurrence elsewhere in the
  file.
- **Closed-loop verify.** After applying, the CLI re-extracts and
  reports remaining issues. If everything resolved, you see
  `✅ all contrast issues resolved.`
- **Honest accounting.** Edits that didn't actually change source
  bytes (e.g. token-derived values that aren't literal in the source)
  are reported as failed-applies with actionable hints — no silent
  no-ops.
- **CI-safe.** Auto-suppressed when `process.env.CI` is set or stdin/
  stdout aren't TTYs. Force on with `--fix-contrast`, force off with
  `--no-fix-prompt`.

The advisory list (issues that can't be auto-fixed) prints at the
end with exact next-step instructions — e.g.,

```
ℹ 1 advisory issue requires a manual edit:
  ⚠ app/theme.ts — footnote.color (light mode)
    measured 2.46:1 vs required ≥4.5:1 (WCAG 2.1 AA — 1.4.3)
    next:  value comes from a design token (`var(--tl-wkweb9zz)`) — change
           the token's value where it's declared in `tl.defineTokens({...})`
```

---

## Diagnostic codes

Every contrast diagnostic carries a stable `TLS####` code. Full
reference: [Diagnostic codes](../reference/diagnostic-codes.md).

| Code | Severity | Title |
|---|---|---|
| `TLS0501` | error | Text below WCAG 2.1 §1.4.3 (AA) |
| `TLS0502` | warning | Text below WCAG 2.1 §1.4.6 (AAA) |
| `TLS0503` | error | UI component below §1.4.11 |
| `TLS0504` | error | Focus indicator below §2.4.13 |
| `TLS0505` | error | Gradient-text stop fails contrast |
| `TLS0506` | warning | Image background — runtime audit advised |

Greppable in CI logs:

```bash
# fail this PR's CI when any new TLS0501 (AA text) regresses
if grep -q TLS0501 build.log; then exit 1; fi
```

---

## Limits, honest

The validator is precise about what it can audit — and equally
precise about what it can't.

**What it audits accurately:**

- Same-block `color` + `backgroundColor` pairs.
- Translucent values composited against the configured surface.
- Token references (`var(--tl-X)`) resolved through the registry.
- Auto-derived dark-mode pairs.
- Per-side border colors.
- `boxShadow` colors when the shadow is informational (spread > 0
  or `inset`).
- Gradient stops + sampled midpoints.

**What it can't see (and how to handle):**

| Gap | Workaround |
|---|---|
| Ancestor backgrounds across files | Enable `auditPeerSurfaces` for design-system rigor; otherwise pair with axe-core in CI. |
| Image content luminance | TLS0506 warning + manual overlay or runtime audit. |
| `color-mix(in <space>, ...)` | Resolved approximately as in-sRGB mix. Exact result may differ slightly from the browser's. |
| `oklch()` / `oklab()` source values | Parsed and converted to RGBA via the standard CSS Color 4 matrices. |
| `var()` references that don't go through `tl.defineTokens` | Skipped (we only resolve registered tokens). |
| Focus-ring **size** (§2.4.13 also requires 2px area) | Runtime tools only — we audit color, not geometry. |
| Closed shadow roots / iframe contents | The validator runs at compile time on TS/TSX source — not on rendered output. |

For everything outside the build-time audit, pair traceless-style
with [axe-core](https://github.com/dequelabs/axe-core) or
[Pa11y](https://pa11y.org/) in CI. The two catch different bug
classes — build-time validation prevents shipping broken contrast;
runtime validation catches DOM-tree composition issues neither tool
can know about statically.
