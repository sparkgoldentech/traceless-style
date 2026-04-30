/**
 * traceless-style — css-gen.ts
 * Generates atomic CSS + class metadata for conflict resolution.
 *
 * Meta format: { "scm92pvu": "display", "sc1eilc0": "background-color::is(.dark *)" }
 * Key = class name, Value = "prop" or "prop:selector"
 * This allows tl.merge() to know which property each class sets.
 */

export interface AtomicRule {
  cls:       string;
  prop:      string;
  value:     string;
  selector?: string;
  order:     number;
  /**
   * Cascade layer name. Rules in a layer compete for specificity ONLY
   * with other rules in the same layer (or unlayered rules), per the
   * `@layer` spec. Used to mix traceless-style with third-party CSS
   * (Stripe widgets, Intercom, etc.) without surprise overrides.
   * Undefined = unlayered.
   */
  layer?: string;
  /** Per-bundle CSS code-splitting. When set, the rule is emitted into
   *  `<bundle>.css` instead of the default `traceless-style.css` —
   *  enables route-/feature-level CSS chunking for huge apps. */
  bundle?: string;
  /**
   * Source-position metadata for dev mode debugging. Populated when the
   * extractor knows which file (and optionally which line / camelCase key)
   * the rule originated from. `generateCSSPretty` emits these as block
   * comments so DevTools shows the source location of each `.scXXXXXX`.
   * Never written to minified production output.
   */
  origin?: {
    file:       string;
    line?:      number;
    sourceKey?: string;
  };
}

/**
 * Validate that a rule is safe to emit into CSS.
 *
 * Two layers of defense:
 *
 * 1. PROPERTY NAME — must look like a CSS identifier. Anything with
 *    braces, angle brackets, or whitespace is rejected outright.
 *
 * 2. VALUE — rejected on:
 *      a. JS/JSX artifacts that have historically leaked from demo code
 *         (this catches typos and copy-paste accidents).
 *      b. CSS-injection sequences. A malicious or accidental value like
 *         `red; } body { display: none;` would, if emitted, close the
 *         current rule and inject another. traceless-style today only accepts
 *         literals (the AST parser rejects variables), so this is
 *         defense-in-depth — but it's the kind of guard that turns a
 *         future bug into a contained failure rather than a CSS exfil.
 *      c. ASCII control characters (0x00–0x1F except \t and space) and
 *         invisible/bidirectional Unicode codepoints commonly used for
 *         homoglyph attacks: ZWSP/ZWNJ/ZWJ/BOM and the LRE/RLE/PDF/LRO/
 *         RLO/LRI/RLI/FSI/PDI bidi controls.
 */
const JS_ARTIFACTS = [
  "{", "}",
  "dim(", "fn(", "kw(", "st(", "pr(",
  "=>",
  "import ", "const ", "return ",
  "&nbsp", "<br",
  "React", "tsx", "jsx",
];

const CSS_INJECTION_PATTERNS = [
  ";",       // would terminate the declaration we're emitting
  "</",      // </style>, </script> — HTML escape
  "<",       // any tag open
  ">",       // any tag close
  "*/",      // CSS comment escape
  "\\\\",    // raw backslash sequences (CSS escapes are fine but doubles aren't)
];

// ASCII control chars (excluding \t \n \r) + invisible/bidi Unicode used in
// homoglyph and CSS-exfil attacks. Written with \u escapes so the source
// itself stays free of the very characters we're guarding against.
const UNSAFE_CHAR_CLASS = new RegExp(
  "[" +
    "\\u0000-\\u0008" +     // ASCII NUL–BS
    "\\u000B-\\u001F" +     // ASCII VT–US (skip \t=09, \n=0A, \r=0D)
    "\\u007F" +             // DEL
    "\\u200B-\\u200F" +     // ZWSP, ZWNJ, ZWJ, LRM, RLM
    "\\u202A-\\u202E" +     // bidi: LRE/RLE/PDF/LRO/RLO
    "\\u2066-\\u2069" +     // bidi isolates: LRI/RLI/FSI/PDI
    "\\uFEFF" +             // BOM / ZWNBSP
  "]"
);

export function isValidRule(prop: string, value: string): boolean {
  if (!/^-?-?[a-zA-Z][a-zA-Z0-9-]*$/.test(prop)) return false;
  if (!value || !value.trim()) return false;
  if (JS_ARTIFACTS.some(s => value.includes(s))) return false;
  if (CSS_INJECTION_PATTERNS.some(s => value.includes(s))) return false;
  if (UNSAFE_CHAR_CLASS.test(value)) return false;
  return true;
}

/**
 * Generate minified CSS for design tokens.
 *
 * Emits two rules when any token has a paired dark value:
 *   :root      { --tl-name: lightValue; ... }
 *   .dark      { --tl-name: darkValue;  ... }
 *
 * The `.dark` rule re-binds every variable that has a derived dark
 * counterpart. With `<html class="dark">` applied, every `var()`
 * reference in atomic rules (`color: var(--tl-foo)`) automatically
 * resolves to the dark value — no theme class on individual components,
 * no `_dark:` blocks, no developer code at all. This is what makes a
 * single `<ThemeToggle />` flip the ENTIRE site.
 */
export function generateTokensCSS(
  tokens: Array<{ name: string; value: string; darkValue?: string }>
): string {
  if (tokens.length === 0) return "";

  const lightDecls = tokens
    .filter(t => isValidRule("--" + t.name, t.value))
    .map(t => `--${t.name}:${t.value}`)
    .join(";");

  const darkDecls = tokens
    .filter(t => t.darkValue && isValidRule("--" + t.name, t.darkValue))
    .map(t => `--${t.name}:${t.darkValue!}`)
    .join(";");

  let css = lightDecls ? `:root{${lightDecls}}` : "";
  if (darkDecls) css += `.dark{${darkDecls}}`;
  return css;
}

/** Generate minified CSS for theme overrides (`.scTheme<hash> { --sc-...: override; }`). */
export function generateThemesCSS(
  themes: Array<{ cls: string; overrides: Array<{ name: string; value: string }> }>
): string {
  return themes
    .map(t => {
      const decls = t.overrides
        .filter(o => isValidRule("--" + o.name, o.value))
        .map(o => `--${o.name}:${o.value}`)
        .join(";");
      return decls ? `.${t.cls}{${decls}}` : "";
    })
    .filter(Boolean)
    .join("");
}

/** Generate minified CSS for `@keyframes` rules. */
export function generateKeyframesCSS(
  frames: Array<{
    name:  string;
    steps: Array<{ stop: string; decls: Array<{ prop: string; value: string }> }>;
  }>
): string {
  const STOP_RE = /^(from|to|\d+%)$/i;
  return frames
    .map(kf => {
      const stepCSS = kf.steps
        .filter(s => STOP_RE.test(s.stop))
        .map(s => {
          const decls = s.decls
            .filter(d => isValidRule(d.prop, d.value))
            .map(d => `${d.prop}:${d.value}`)
            .join(";");
          return decls ? `${s.stop}{${decls}}` : "";
        })
        .filter(Boolean)
        .join("");
      return stepCSS ? `@keyframes ${kf.name}{${stepCSS}}` : "";
    })
    .filter(Boolean)
    .join("");
}

/**
 * Baseline CSS prepended to every generated stylesheet.
 *
 * Why this exists: the `<html>` element itself is outside the React tree and
 * isn't styled by `tl.create()`, so without a baseline rule the browser
 * canvas, scrollbars, native form controls, and overscroll background all
 * stay light even when `.dark` is on `<html>`. The `color-scheme` property
 * is the standard, single-source-of-truth way to tell the browser "this
 * document supports light *and* dark"; the browser then switches every
 * piece of native chrome accordingly.
 *
 * `color-scheme: light dark` on `:root` advertises support; the explicit
 * `html.dark { color-scheme: dark }` rule pins the value when the user has
 * toggled to dark. Result: scrollbars go dark, default text/background of
 * `<html>` go dark, autofill highlights go dark — for free, with no
 * user-side CSS. Light-only sites are unaffected.
 */
export const BASELINE_CSS = `:root{color-scheme:light dark}html.dark{color-scheme:dark}html:not(.dark){color-scheme:light}`;

/**
 * Serialize a single atomic rule to its CSS-text form (no surrounding
 * `@layer` wrapper — that's added by the caller when grouping by layer).
 */
function serializeRule(r: AtomicRule): string {
  const d = `${r.prop}:${r.value}`;
  if (!r.selector)                return `.${r.cls}{${d}}`;
  if (r.selector.startsWith("@")) return `${r.selector}{.${r.cls}{${d}}}`;
  if (r.selector.includes("&"))   return `${r.selector.replace(/&/g, `.${r.cls}`)}{${d}}`;
  return `.${r.cls}${r.selector}{${d}}`;
}

/**
 * Generate minified CSS, grouping rules by their `layer` field so the
 * cascade-layer wrapper is emitted around each layer's rules. Unlayered
 * rules are emitted at the top, then `@layer name { ... }` blocks in
 * `layerOrder` (or first-seen order if not declared).
 */
export function generateCSS(
  rules:       AtomicRule[],
  layerOrder?: string[]
): string {
  const valid = [...rules]
    .sort((a, b) => a.order - b.order)
    .filter(r => isValidRule(r.prop, r.value));

  /* Bucket by layer. */
  const unlayered: AtomicRule[] = [];
  const byLayer = new Map<string, AtomicRule[]>();
  for (const r of valid) {
    if (!r.layer) unlayered.push(r);
    else {
      let arr = byLayer.get(r.layer);
      if (!arr) { arr = []; byLayer.set(r.layer, arr); }
      arr.push(r);
    }
  }

  /* Emit. */
  const parts: string[] = [];

  // Layer-order declaration. Browsers honor the FIRST `@layer name1, name2;`
  // it sees as the layer order, regardless of whether layers are defined
  // later. When `layerOrder` is provided we use it; otherwise we emit the
  // layers in first-seen-rule order.
  const layerNames = layerOrder?.length ? layerOrder : [...byLayer.keys()];
  if (layerNames.length > 0) {
    parts.push(`@layer ${layerNames.join(",")};`);
  }

  for (const r of unlayered) parts.push(serializeRule(r));
  for (const name of layerNames) {
    const layerRules = byLayer.get(name);
    if (!layerRules || layerRules.length === 0) continue;
    parts.push(`@layer ${name}{${layerRules.map(serializeRule).join("")}}`);
  }

  return parts.join("");
}

/** Render an origin tag, sanitized so it can't break out of the comment. */
function originComment(origin: AtomicRule["origin"]): string {
  if (!origin) return "";
  // Strip `*/` defensively — even though origin fields come from our own
  // extractor (not user-controlled), the same defense-in-depth posture as
  // value validation applies: never let a path or key close the comment.
  const safe = (s: string) => s.replace(/\*\//g, "*​/");
  const file = safe(origin.file);
  const loc  = origin.line ? `:${origin.line}` : "";
  const key  = origin.sourceKey ? `  ${safe(origin.sourceKey)}` : "";
  return `/* ${file}${loc}${key} */`;
}

/** Generate pretty CSS for dev mode */
export function generateCSSPretty(rules: AtomicRule[]): string {
  const lines = ["/* traceless-style — generated */\n"];
  [...rules]
    .sort((a, b) => a.order - b.order)
    .filter(r => isValidRule(r.prop, r.value))
    .forEach(r => {
      const d = `  ${r.prop}: ${r.value};`;
      const tag = originComment(r.origin);
      const lead = tag ? tag + "\n" : "";
      if (!r.selector)
        lines.push(`${lead}.${r.cls} {\n${d}\n}\n`);
      else if (r.selector.startsWith("@"))
        lines.push(`${lead}${r.selector} {\n  .${r.cls} {\n  ${d}\n  }\n}\n`);
      else if (r.selector.includes("&"))
        lines.push(`${lead}${r.selector.replace(/&/g, `.${r.cls}`)} {\n${d}\n}\n`);
      else
        lines.push(`${lead}.${r.cls}${r.selector} {\n${d}\n}\n`);
    });
  return lines.join("");
}

/**
 * Build class metadata map for conflict resolution.
 *
 * Format: { cls → "prop" | "prop:selector" }
 *
 * Examples:
 *   "scm92pvu" → "display"               (base class)
 *   "sc1eilc0" → "background-color::is(.dark *)"  (dark variant)
 *   "scyyzqjv" → "box-shadow::hover"     (hover variant)
 *
 * This lets tl.merge() know:
 *   - Two classes with same prop:selector → CONFLICT → last wins
 *   - Two classes with same prop but DIFFERENT selectors → NOT a conflict
 */
export function buildClassMeta(rules: AtomicRule[]): Record<string, string> {
  const meta: Record<string, string> = {};
  rules
    .filter(r => isValidRule(r.prop, r.value))
    .forEach(r => {
      // Key = "prop" for base, "prop:selector" for variants
      meta[r.cls] = r.selector
        ? `${r.prop}:${r.selector}`
        : r.prop;
    });
  return meta;
}