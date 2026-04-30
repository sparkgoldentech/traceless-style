# Diagnostic codes

Every error and warning the compiler emits carries a stable `TLS####`
identifier. They show up at the start of every diagnostic line:

```
✗ [TLS0404 · no-tailwind] app/Card.tsx:3:14
    Tailwind classes detected — use tl.create() instead.
    docs: https://traceless-style.dev/diagnostics#tls0404
```

The codes never change once published. Use them in CI greps, in
issue titles, and in suppression directives. If a code's behavior
changes in a way that would break a downstream grep, we add a new
code instead of mutating the old one.

## Quick lookup

| Code | Severity | Title |
|---|---|---|
| [`TLS0001`](#tls0001) | error | Variable in style object |
| [`TLS0002`](#tls0002) | error | Unexpected token in tl.create body |
| [`TLS0003`](#tls0003) | error | Invalid key in style object |
| [`TLS0101`](#tls0101) | error | Unknown CSS property |
| [`TLS0102`](#tls0102) | error | Suspicious value (CSS injection guard) |
| [`TLS0103`](#tls0103) | error | `background-clip:text` + `background:` shorthand conflict |
| [`TLS0201`](#tls0201) | error | Unknown variant key |
| [`TLS0202`](#tls0202) | error | Variant value must be an object |
| [`TLS0301`](#tls0301) | warning | Token redeclared |
| [`TLS0302`](#tls0302) | error | Invalid keyframe step name |
| [`TLS0401`](#tls0401) | error | Inline style attribute |
| [`TLS0402`](#tls0402) | error | String className |
| [`TLS0403`](#tls0403) | error | CSS module import |
| [`TLS0404`](#tls0404) | error | Tailwind utility class |
| [`TLS0501`](#tls0501) | error | Text contrast below WCAG 2.1 AA |
| [`TLS0502`](#tls0502) | warning | Text contrast below WCAG 2.1 AAA |
| [`TLS0503`](#tls0503) | error | UI component contrast below 1.4.11 |
| [`TLS0504`](#tls0504) | error | Focus indicator below 2.4.13 |
| [`TLS0505`](#tls0505) | error | Gradient-text stop fails contrast |
| [`TLS0506`](#tls0506) | warning | Image background — runtime audit advised |
| [`TLS0601`](#tls0601) | error | Invalid `traceless-style.config.js` |

The numeric ranges are:

| Range | Domain |
|---|---|
| `TLS0001`–`TLS0099` | Parser / AST |
| `TLS0100`–`TLS0199` | Property allowlist + value validation |
| `TLS0200`–`TLS0299` | Variants + `tl.extend` |
| `TLS0300`–`TLS0399` | Tokens, themes, keyframes |
| `TLS0400`–`TLS0499` | Lint rules |
| `TLS0500`–`TLS0599` | Contrast / accessibility (WCAG, APCA) |
| `TLS0600`–`TLS0699` | Build wiring (config, framework integration) |

---

## Parser / AST (TLS00xx)

### TLS0001

**Variable in style object.** The compiler's strict literal-only
parser rejected an identifier or expression where it expected a
literal string, number, or nested object.

```ts
const padding = "1rem";

// ✗ TLS0001 — `padding` is an identifier.
tl.create({ btn: { padding } });

// ✓ Use a literal:
tl.create({ btn: { padding: "1rem" } });

// ✓ Or wrap the runtime value in a token:
const tokens = tl.defineTokens({ space: { md: "1rem" } });
tl.create({ btn: { padding: tl.cssVar("space-md") } });
```

The parser is intentionally strict — see [Defense-in-depth value
validation](./value-validation.md). Allowing variables would force
the compiler to evaluate arbitrary JavaScript at build time, which
is a security and maintainability hazard. Tokens give you the
"runtime configurability" you'd want from a variable.

### TLS0002

**Unexpected token in `tl.create` body.** The argument to a
`tl.<method>(...)` call must be a single object literal. The parser
hit something it can't interpret — usually a spread (`...obj`),
a function call, or a stray comma.

```ts
const base = { padding: "1rem" };

// ✗ TLS0002 — spread isn't supported in tl.create arguments.
tl.create({ btn: { ...base, color: "red" } });

// ✓ Inline the keys, or compose at the className site:
const $ = tl.create({
  base: { padding: "1rem" },
  btn:  { padding: "1rem", color: "red" },
});
```

If you genuinely want to share a sub-object, declare two groups and
combine their classes via `tl.merge()` at the use site.

### TLS0003

**Invalid key in style object.** Keys must be identifiers, string
literals, or numbers. Computed keys (`[someExpr]:`) and getter/
setter shorthand are not supported.

---

## Property / value (TLS01xx)

### TLS0101

**Unknown CSS property.** The property name isn't in the curated
allowlist (~250 CSS Color 4 / Layout / Typography properties plus
vendor prefixes and CSS variables). Common cause: a typo.

```ts
tl.create({ btn: {
  colour: "red",        // ✗ TLS0101 — did you mean 'color'?
  fontSizz: "16px",     // ✗ TLS0101 — did you mean 'fontSize'?
} });
```

The diagnostic includes a Levenshtein-suggested replacement when one
exists. Custom property names (`--brand-primary`) and vendor prefixes
(`webkitTransform`, `-moz-appearance`) are accepted without warning.

### TLS0102

**Suspicious value (CSS injection guard).** A value contains
characters the CSS-rule emitter blocks at the value boundary — `;`,
`}`, `</`, `*/`, `\\`, ASCII control characters (0x00–0x1F except
TAB/LF/CR), or invisible Unicode (zero-width / bidi-control).

This is **defense-in-depth**. The current AST parser already rejects
non-literal values, so an attacker would need a parser bug to inject
hostile values. The injection guard exists so that a future parser
change can never accidentally widen the attack surface.

### TLS0103

**`background-clip:text` + `background:` shorthand conflict.** The
CSS `background:` shorthand resets `background-clip` to its initial
value (`border-box`). When the same group sets `background-clip: text`,
atomic-CSS cascade order can silently undo the clip and produce
invisible gradient text.

```ts
// ✗ TLS0103
tl.create({ heroTitle: {
  background:     "linear-gradient(120deg, #6366f1, #ec4899)",
  backgroundClip: "text",
  color:          "transparent",
} });

// ✓ Use the longhand — backgroundImage doesn't reset clip.
tl.create({ heroTitle: {
  backgroundImage: "linear-gradient(120deg, #6366f1, #ec4899)",
  backgroundClip:  "text",
  color:           "transparent",
} });
```

We added this guard after a real production bug — gradient hero text
appeared correctly in development and broke when an unrelated component
emitted its own `background:` rule later in the cascade.

---

## Variants (TLS02xx)

### TLS0201

**Unknown variant key.** The key starts with `_` but isn't a
registered variant. Built-in variants are listed in the
[variants table](../api/variants-table.md). Project-specific variants
must be registered via `tl.extend({ variants: { ... } })`.

```ts
tl.create({
  btn: {
    color: "blue",
    _hovered: { color: "red" },   // ✗ TLS0201 — did you mean '_hover'?
  },
});
```

### TLS0202

**Variant value must be an object.** A variant key (`_dark`, `_hover`,
…) must map to a nested style-object containing the rules to apply
when the variant matches.

```ts
// ✗ TLS0202
tl.create({ btn: { _hover: "red" } });

// ✓
tl.create({ btn: { _hover: { color: "red" } } });
```

---

## Tokens / themes / keyframes (TLS03xx)

### TLS0301

**Token redeclared.** `tl.defineTokens` was called more than once
with the same export key. The second declaration's light value is
ignored (first-write-wins); only `darkValue` is updated when missing.

If two files genuinely declare the same token, this is a sign your
project should consolidate them. A single `tokens.ts` file shared
across the project is the recommended pattern.

### TLS0302

**Invalid keyframe step name.** Keyframe step names must be `from`,
`to`, or a `<n>%` value.

```ts
// ✗ TLS0302
tl.keyframes("slide", {
  start: { x: 0 },        // not a percentage / from / to
  end:   { x: 100 },
});

// ✓
tl.keyframes("slide", {
  from: { transform: "translateX(0)" },
  to:   { transform: "translateX(100px)" },
});
```

---

## Lint (TLS04xx)

### TLS0401

**Inline style attribute.** `style={{...}}` and `style="..."` bypass
the compiler entirely. Inline styles can't be deduplicated, can't be
audited for accessibility, and can't be type-checked against the
property allowlist.

```tsx
// ✗ TLS0401
<div style={{ padding: 16, color: "red" }}>...</div>

// ✓
const $ = tl.create({ box: { padding: "1rem", color: "red" } });
<div className={$.box}>...</div>
```

This rule cannot be disabled. `lint: false` in the config keeps
`noInlineStyles` on — there is no legitimate use of `style=` in a
traceless-style project.

### TLS0402

**String `className`.** A `className="some-class"` literal opts out
of every guard the compiler provides — type safety, atomic dedup, the
property allowlist, contrast validation.

```tsx
// ✗ TLS0402
<button className="primary-button">Save</button>

// ✓
const $ = tl.create({ primary: { background: "#3b82f6", color: "#fff" } });
<button className={$.primary}>Save</button>
```

Strings produced by `tl.create()`, `tl.merge()`, `tl.cx()`, or library
class accessors (`$.btn`) are recognized — only literal string
expressions are flagged.

### TLS0403

**CSS module import.** Importing `*.module.css` mixes two stylesheet
systems and breaks atomic-CSS dedup. Module-scoped class names are
opaque to traceless-style — it can't audit them for contrast or
property correctness, and it can't deduplicate them with its own atoms.

### TLS0404

**Tailwind utility class.** Tailwind class strings detected in a
`className`. Tailwind's atomic CSS duplicates traceless-style's
purpose; mixing the two doubles your bundle size.

If you're migrating from Tailwind incrementally, see
[Migrating from Tailwind](../recipes/migrating-from-tailwind.md).
Until the migration is complete, set `lint.noTailwind: false` in
the config to silence the rule per-file rather than disabling globally.

---

## Contrast / accessibility (TLS05xx)

These come from the [WCAG contrast validator](../learn/13-wcag-contrast.md).
Each carries a citation to the specific WCAG criterion that
defines the threshold.

### TLS0501

**Text contrast below WCAG 2.1 §1.4.3 (AA).** A foreground/background
pair measures below 4.5:1 (or 3:1 for large text — ≥18pt regular or
≥14pt bold). This is the legal floor for Section 508 (US) and EN
301 549 (EU). Build fails by default; `contrast.strict: false`
demotes to warning.

The diagnostic includes:

- Measured ratio (e.g. `2.46:1`).
- APCA Lc score (advisory, WCAG 3 working draft).
- A suggested replacement color computed via OKLCH-space search
  (preserves the designer's hue and chroma intent).

### TLS0502

**Text contrast below WCAG 2.1 §1.4.6 (AAA).** Below the enhanced
contrast tier (7:1 / 4.5:1). AAA is best-effort — not legally
required — so this is a warning unless `contrast.strictAAA: true`.

### TLS0503

**UI component contrast below WCAG 2.1 §1.4.11.** A `borderColor`,
`caretColor`, `accentColor`, `textDecorationColor`, or extracted
`boxShadow` color (when the shadow is "informational" — has spread or
is `inset`) measures below 3:1 against its background. UI affordances
must remain identifiable to low-vision users.

### TLS0504

**Focus indicator below WCAG 2.2 §2.4.13.** An `outlineColor`
measures below 3:1 against the surface. Focus rings need to remain
visible for keyboard users.

### TLS0505

**Gradient-text stop fails contrast.** When `color: transparent` +
`background-clip: text` is in use, every gradient stop (and sampled
midpoint, when `gradientSampleCount > 0`) fills part of the glyph.
A single low-contrast stop renders that slice of text unreadable.

### TLS0506

**Image background — runtime audit advised.** Text sits on a
`url(...)`-backed background. Pixel-level contrast can't be verified
at build time. Add a solid layer behind the text (opaque overlay,
linear-gradient with high-contrast endpoints) or audit at runtime
with axe-core / Pa11y.

---

## Build / config (TLS06xx)

### TLS0601

**Invalid `traceless-style.config.js`.** The config file failed to
load (syntax error, missing module, unsupported export shape) or
contains an unknown top-level key.

The full schema is in [Configuration](../api/config.md). Unknown keys
trigger this code with a "did you mean" suggestion.

---

## Suppressing diagnostics

There's no `// traceless-style-disable-line` comment yet — instead,
diagnostics are suppressed at the source where they're meaningful:

| Diagnostic | Suppression |
|---|---|
| `TLS0501`–`TLS0506` (contrast) | `_skipContrast: true` (all categories) or `_skipContrast: "ui"` / `"dark"` / etc. per-category at the group level. |
| `TLS0401`–`TLS0404` (lint) | Disable the rule globally in `traceless-style.config.js` (e.g. `lint.noTailwind: false`). |
| `TLS0101` / `TLS0102` (property) | Use a CSS variable (`--brand`) or vendor prefix instead. There is no opt-out — these guards keep the bundle safe. |

When in doubt, fix the diagnostic rather than suppress it. The
suggestions in each error are computed to preserve design intent —
they're rarely a bigger change than disabling the rule.
