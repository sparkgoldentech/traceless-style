/**
 * traceless-style — diagnostic-codes.ts
 *
 * Single source of truth for every error / warning / info code the
 * library emits. Same shape as TypeScript (`TS2304`), Babel
 * (`BABEL5005`), ESLint rule slugs, and Pylance — a stable code lets
 * users grep CI output, write code-aware ignore comments, and click
 * straight into the docs.
 *
 * Every diagnostic the compiler / lint / contrast validator emits
 * carries a code from this registry. The format is `TLS####`:
 *
 *   TLS0001 – TLS0099   parser & AST   (literal-only requirement, etc.)
 *   TLS0100 – TLS0199   property allowlist + value validation
 *   TLS0200 – TLS0299   variant + extension errors
 *   TLS0300 – TLS0399   tokens / themes / keyframes
 *   TLS0400 – TLS0499   lint (no-inline-styles, …)
 *   TLS0500 – TLS0599   contrast / accessibility (WCAG 1.4.x, 2.4.x, APCA)
 *   TLS0600 – TLS0699   build wiring (config, framework integration)
 *
 * Every entry is the canonical record:
 *   - severity         default severity (caller can override per-context).
 *   - title            one-line summary used in the diagnostic header.
 *   - description      paragraph users read in the docs.
 *   - hint             optional "did you mean" / "try" string.
 *   - docsUrl          live URL pointing at the rule's docs section.
 *
 * The docs URL is derived from a single base (DOCS_BASE) so we can
 * relocate the docs site without touching every call site. CI runs an
 * assertion that every code present here appears in DIAGNOSTICS.md.
 */

export type Severity = "error" | "warning" | "info";

export interface DiagnosticCodeEntry {
  /** The canonical TLS#### identifier. */
  code:        string;
  /** Default severity. Callers may demote based on config (e.g. dev mode). */
  severity:    Severity;
  /** One-line headline used in formatted output. */
  title:       string;
  /** Paragraph-form description for the docs. */
  description: string;
  /** Optional actionable hint, displayed under the headline. */
  hint?:       string;
  /** Documentation URL for users to click. */
  docsUrl:     string;
}

const DOCS_BASE = "https://traceless-style.dev/diagnostics" as const;
function url(code: string): string { return `${DOCS_BASE}#${code.toLowerCase()}`; }

/* ── REGISTRY ───────────────────────────────────────────────────── */

export const DIAGNOSTICS = {
  /* PARSER (TLS0001 – TLS0099) ─────────────────────────────────── */
  PARSE_VARIABLE_REJECTED: {
    code: "TLS0001", severity: "error",
    title: "Variable in style object",
    description:
      "traceless-style's AST parser only accepts literal values inside `tl.create({...})`. " +
      "Variables, function calls, and computed expressions are rejected at build time.",
    hint:
      "Use a literal string/number, or wrap the runtime value with `tl.cssVar(\"name\")` to " +
      "reference a token defined via `tl.defineTokens({ ... })`.",
    docsUrl: url("TLS0001"),
  },
  PARSE_UNEXPECTED_TOKEN: {
    code: "TLS0002", severity: "error",
    title: "Unexpected token in tl.create body",
    description:
      "The argument to a `tl.<method>(...)` call must be a single object literal with literal " +
      "values. The parser hit a token it can't interpret in that context.",
    docsUrl: url("TLS0002"),
  },
  PARSE_BAD_KEY: {
    code: "TLS0003", severity: "error",
    title: "Invalid key in style object",
    description:
      "Style-object keys must be identifiers, string literals, or number literals.",
    docsUrl: url("TLS0003"),
  },

  /* PROPERTY / VALUE (TLS0100 – TLS0199) ──────────────────────── */
  PROP_UNKNOWN: {
    code: "TLS0101", severity: "error",
    title: "Unknown CSS property",
    description:
      "The property name is not in the curated CSS Color 4 / Layout / Typography allowlist. " +
      "This catches typos and library mistakes at build time.",
    hint:
      "Use a CSS variable (`--brand`) or a vendor prefix (`-webkit-`, `webkit*`) for " +
      "non-standard properties.",
    docsUrl: url("TLS0101"),
  },
  PROP_VALUE_INJECTION: {
    code: "TLS0102", severity: "error",
    title: "Suspicious value (CSS injection guard)",
    description:
      "Values containing `;`, `}`, `</`, `*/`, ASCII control characters, or bidi/zero-width " +
      "Unicode are rejected as a defense-in-depth guard against future parser bugs.",
    docsUrl: url("TLS0102"),
  },
  PROP_BG_CLIP_TEXT_CONFLICT: {
    code: "TLS0103", severity: "error",
    title: "background-clip:text + background shorthand conflict",
    description:
      "The `background:` shorthand resets `background-clip` to `border-box`. When the same " +
      "block also sets `background-clip: text`, atomic-CSS cascade order can silently undo " +
      "the clip and produce invisible gradient text.",
    hint:
      "Use the `backgroundImage:` longhand instead of the `background:` shorthand — it " +
      "preserves `background-clip: text`.",
    docsUrl: url("TLS0103"),
  },

  /* VARIANTS (TLS0200 – TLS0299) ─────────────────────────────── */
  VARIANT_UNKNOWN: {
    code: "TLS0201", severity: "error",
    title: "Unknown variant key",
    description:
      "The key starts with `_` but isn't a registered variant. Built-in variants live in " +
      "`BUILT_IN_VARIANTS`; project variants are registered via `tl.extend({ variants: { ... } })`.",
    docsUrl: url("TLS0201"),
  },
  VARIANT_BAD_VALUE: {
    code: "TLS0202", severity: "error",
    title: "Variant value must be an object",
    description:
      "A variant key (`_dark`, `_hover`, …) must map to a nested style-object containing the " +
      "rules to apply when the variant is active.",
    docsUrl: url("TLS0202"),
  },

  /* TOKENS / THEMES / KEYFRAMES (TLS0300 – TLS0399) ──────────── */
  TOKEN_REDECLARED: {
    code: "TLS0301", severity: "warning",
    title: "Token redeclared",
    description:
      "`tl.defineTokens` was called more than once with the same export key. The second " +
      "declaration's light value is ignored; only `darkValue` is updated if missing.",
    docsUrl: url("TLS0301"),
  },
  KEYFRAMES_INVALID_STOP: {
    code: "TLS0302", severity: "error",
    title: "Invalid keyframe step name",
    description:
      "Keyframe step names must be `from`, `to`, or a `<n>%` value. Other identifiers are " +
      "rejected — `1` is not a percentage, neither is `start`.",
    docsUrl: url("TLS0302"),
  },

  /* LINT (TLS0400 – TLS0499) ────────────────────────────────── */
  LINT_INLINE_STYLE: {
    code: "TLS0401", severity: "error",
    title: "Inline style attribute",
    description:
      "`style={{...}}` and `style=\"...\"` bypass the compiler entirely — the rules they apply " +
      "aren't atomic, can't be deduped, and aren't audited for accessibility.",
    hint:
      "Move the styles into `tl.create({ name: { ... } })` and use the resulting class.",
    docsUrl: url("TLS0401"),
  },
  LINT_CLASS_STRING: {
    code: "TLS0402", severity: "error",
    title: "String className",
    description:
      "Hand-rolled class strings opt out of every guard the compiler provides — type safety, " +
      "atomic dedup, the property allowlist, contrast validation.",
    hint:
      "Replace with `tl.create({ name: { ... } })` and `className={$.name}`.",
    docsUrl: url("TLS0402"),
  },
  LINT_CSS_MODULES: {
    code: "TLS0403", severity: "error",
    title: "CSS module import",
    description:
      "Importing `*.module.css` mixes two stylesheet systems and breaks atomic-CSS dedup. The " +
      "compiler can't audit module-scoped class names for contrast or property correctness.",
    docsUrl: url("TLS0403"),
  },
  LINT_TAILWIND: {
    code: "TLS0404", severity: "error",
    title: "Tailwind utility class",
    description:
      "Tailwind utility classes detected in a `className` string. traceless-style's atomic CSS " +
      "duplicates Tailwind's purpose; mixing the two doubles bundle size.",
    docsUrl: url("TLS0404"),
  },

  /* CONTRAST / A11Y (TLS0500 – TLS0599) ──────────────────────── */
  CONTRAST_TEXT_AA: {
    code: "TLS0501", severity: "error",
    title: "Text contrast below WCAG 2.1 §1.4.3 (AA)",
    description:
      "Foreground / background pair measures below 4.5:1 (or 3:1 for large text). " +
      "Fails the legal floor for Section 508 (US) and EN 301 549 (EU).",
    docsUrl: url("TLS0501"),
  },
  CONTRAST_TEXT_AAA: {
    code: "TLS0502", severity: "warning",
    title: "Text contrast below WCAG 2.1 §1.4.6 (AAA)",
    description:
      "Below the enhanced contrast tier (7:1 / 4.5:1). Best-effort; not legally required.",
    docsUrl: url("TLS0502"),
  },
  CONTRAST_UI: {
    code: "TLS0503", severity: "error",
    title: "UI component contrast below WCAG 2.1 §1.4.11",
    description:
      "Border / outline / caret / accent / text-decoration color measures below 3:1 against " +
      "its surface. UI affordances must remain identifiable to low-vision users.",
    docsUrl: url("TLS0503"),
  },
  CONTRAST_FOCUS: {
    code: "TLS0504", severity: "error",
    title: "Focus indicator below WCAG 2.2 §2.4.13",
    description:
      "Focus ring contrast below 3:1 against adjacent surface. Required by WCAG 2.2's enhanced " +
      "focus-appearance criterion.",
    docsUrl: url("TLS0504"),
  },
  CONTRAST_GRADIENT: {
    code: "TLS0505", severity: "error",
    title: "Gradient-text stop fails contrast",
    description:
      "When `color: transparent` + `background-clip: text` is used, every gradient stop fills " +
      "part of the glyph. A single low-contrast stop (or sampled midpoint) renders that slice " +
      "of text unreadable.",
    docsUrl: url("TLS0505"),
  },
  CONTRAST_IMAGE_BG: {
    code: "TLS0506", severity: "warning",
    title: "Image background — runtime audit advised",
    description:
      "Text sits on a `url(...)`-backed background. Pixel-level contrast can't be verified at " +
      "build time. Add a solid layer behind the text or audit at runtime with axe-core / Pa11y.",
    docsUrl: url("TLS0506"),
  },

  /* BUILD / CONFIG (TLS0600 – TLS0699) ───────────────────────── */
  CONFIG_INVALID: {
    code: "TLS0601", severity: "error",
    title: "Invalid traceless-style.config.js",
    description:
      "The config file failed to load or contains an unknown key. Schema is documented in " +
      "the docs link.",
    docsUrl: url("TLS0601"),
  },
} as const satisfies Record<string, DiagnosticCodeEntry>;

/** Type narrows to the keys of DIAGNOSTICS — pick once at call sites. */
export type DiagnosticCodeKey = keyof typeof DIAGNOSTICS;

/** Look up an entry by its TLS#### code (e.g., for tests / tooling). */
export function findByCode(code: string): DiagnosticCodeEntry | null {
  for (const k of Object.keys(DIAGNOSTICS) as DiagnosticCodeKey[]) {
    if (DIAGNOSTICS[k].code === code) return DIAGNOSTICS[k];
  }
  return null;
}

/** Stable list — used by docs generation and code-frame tests. */
export function allDiagnostics(): readonly DiagnosticCodeEntry[] {
  return Object.values(DIAGNOSTICS);
}
