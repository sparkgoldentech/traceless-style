/**
 * traceless-style — compiler/extractor.ts
 *
 * Auto-detects BOTH tl.create() AND tl.extend() calls.
 * No config file needed — custom variants are discovered
 * directly from source code.
 *
 * Pass 1: Scan all files → find tl.extend() calls → collect custom variants
 * Pass 2: Scan all files → find tl.create() calls → transform with all variants
 */

import path from "path";
import fs   from "fs";
import { parseStyleObject, StyleObject, ParseError } from "./ast-parser";
import { classFor, toKebab }                          from "./hash";
import {
  DEFAULT_VARIANTS,
  mergeVariants,
  type FlatVariants,
} from "./variants";
import type { AtomicRule } from "./css-gen";
import { isKnownProperty, suggestClosestProperty } from "./css-properties";
import {
  tokenRegistry,
  tokenExportRegistry,
  tokenVarName,
  themeClassName,
  keyframeName,
  flattenTokenMap,
  buildVarShape,
  type NestedTokenShape,
} from "./tokens";
import { deriveDarkColor, isAutoDarkProperty, deriveDarkPair } from "./auto-dark";
import {
  validateGroupContrast,
  type ContrastIssue,
  type ContrastValidatorOptions,
  DEFAULT_CONTRAST_OPTIONS,
} from "./contrast-validator";
import { convertToLogical } from "./auto-rtl";
import { DIAGNOSTICS } from "./diagnostic-codes";

/**
 * Auto-RTL toggle.
 *
 * Default ON: every physical directional property the developer writes
 * (marginLeft, paddingRight, borderTopLeftRadius, left, etc.) is rewritten
 * to its logical equivalent (marginInlineStart, paddingInlineEnd,
 * borderStartStartRadius, insetInlineStart). Once a `dir="rtl"` ancestor
 * exists, the browser flips them automatically — zero extra CSS, zero
 * runtime cost.
 *
 * Disabled globally via traceless-style.config.js → `autoRtl: false`,
 * or per-style group via `_autoRtl: false` inside a `tl.create({...})`
 * entry.
 */
let _autoRtlEnabled = true;
export function setAutoRtl(on: boolean): void { _autoRtlEnabled = on; }
export function getAutoRtl(): boolean         { return _autoRtlEnabled; }

/**
 * Auto-dark-mode toggle.
 *
 * Default ON: every parseable color value the user writes gets a paired
 * `:is(.dark *)` rule with a derived dark variant (lightness-inverted).
 * The component carries both atomic classes; the dark-class rule's
 * higher-specificity selector wins under `<html class="dark">`. Result:
 * dropping `<ThemeToggle />` flips every color in the app — the developer
 * never writes `_dark: {...}` for routine color overrides.
 *
 * Disabled globally via traceless-style.config.js → `autoDarkMode: false`,
 * or per-style group via the `_autoDark: false` key inside any
 * `tl.create({...})` entry.
 */
let _autoDarkEnabled = true;
export function setAutoDarkMode(on: boolean): void { _autoDarkEnabled = on; }
export function getAutoDarkMode(): boolean         { return _autoDarkEnabled; }

/* ── Contrast validator (module-scoped configuration) ────────────
   Set from the CLI at the start of each `extract()` run based on the
   `contrast: {...}` block in `traceless-style.config.js`. Defaults to
   AA, non-strict, page surfaces #fafafa/#0a0a0f. Issues collected per
   transform() call live on the call's `errors` array — the existing
   error pipeline picks them up and surfaces them with the same code-
   frame formatting other compile-time errors get. */
let _contrastOptions: ContrastValidatorOptions = { ...DEFAULT_CONTRAST_OPTIONS };
export function setContrastOptions(opts: Partial<ContrastValidatorOptions>): void {
  _contrastOptions = { ...DEFAULT_CONTRAST_OPTIONS, ..._contrastOptions, ...opts };
}
export function getContrastOptions(): ContrastValidatorOptions {
  return { ..._contrastOptions };
}
/** Per-extract collection of contrast issues. Cleared at the start of every extract() run. */
let _contrastIssues: ContrastIssue[] = [];
export function getContrastIssues(): ContrastIssue[] { return _contrastIssues; }
export function clearContrastIssues(): void          { _contrastIssues = []; }

export interface TransformResult {
  code:            string;
  rules:           AtomicRule[];
  changed:         boolean;
  errors:          ParseError[];
  warnings:        string[];
  customVariants?: Record<string, string>;
}

/* ═══════════════════════════════════════
   Rule Registry
═══════════════════════════════════════ */
class RuleRegistry {
  private rules = new Map<string, AtomicRule>();
  private order = 0;

  add(r: Omit<AtomicRule, "order">): AtomicRule {
    if (this.rules.has(r.cls)) return this.rules.get(r.cls)!;
    const full = { ...r, order: this.order++ };
    this.rules.set(r.cls, full);
    return full;
  }

  getAll(): AtomicRule[] {
    return [...this.rules.values()].sort((a, b) => a.order - b.order);
  }

  clear(): void {
    this.rules.clear();
    this.order = 0;
  }
}

export const globalRegistry = new RuleRegistry();

/* Re-export for backward compat */
export const VARIANTS: FlatVariants = DEFAULT_VARIANTS;

/* ═══════════════════════════════════════
   Robust call finder
   Skips strings, template literals, comments
═══════════════════════════════════════ */
function findNamedCalls(
  src:      string,
  fnName:   string  // e.g. "create" or "extend"
): Array<{ fullStart: number; fullEnd: number; argSrc: string }> {
  const calls: Array<{ fullStart: number; fullEnd: number; argSrc: string }> = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    // Skip line comments
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }

    // Skip block comments
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    // Skip string literals
    if (ch === '"' || ch === "'") {
      const q = ch; i++;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === q)    { i++;    break;    }
        i++;
      }
      continue;
    }

    // Skip template literals
    if (ch === "`") {
      i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") {
          i += 2; let d = 1;
          while (i < src.length && d > 0) {
            if      (src[i] === "{") d++;
            else if (src[i] === "}") d--;
            i++;
          }
          continue;
        }
        i++;
      }
      i++;
      continue;
    }

    // Match .fnName(
    const needle = `.${fnName}(`;
    if (src.slice(i, i + needle.length) === needle) {
      // Find the preceding identifier (the sc instance name)
      let idEnd = i;
      let idStart = idEnd - 1;
      while (idStart > 0 && /[a-zA-Z0-9_$]/.test(src[idStart - 1])) idStart--;

      const callStart = idStart;
      i += needle.length;

      // Skip whitespace
      while (i < src.length && /\s/.test(src[i])) i++;

      // Must open with {
      if (src[i] !== "{") continue;

      const openPos = i;
      let depth = 0, inStr = false, strCh = "", end = openPos;

      for (let j = openPos; j < src.length; j++) {
        const c = src[j];
        if (inStr) {
          if (c === strCh && src[j - 1] !== "\\") inStr = false;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") { inStr = true; strCh = c; continue; }
        if (c === "{") depth++;
        if (c === "}") {
          depth--;
          if (depth === 0) {
            end = j + 1;
            let pe = end;
            while (pe < src.length && /\s/.test(src[pe])) pe++;
            if (src[pe] === ")") pe++;
            calls.push({ fullStart: callStart, fullEnd: pe, argSrc: src.slice(openPos, end) });
            i = pe;
            break;
          }
        }
      }
      continue;
    }

    i++;
  }

  return calls;
}

/* ═══════════════════════════════════════
   Pass 1: Auto-detect tl.extend() calls
   Returns all custom variants found
═══════════════════════════════════════ */
export function extractCustomVariants(src: string, file: string): Record<string, string> {
  const found: Record<string, string> = {};

  const calls = findNamedCalls(src, "extend");
  if (!calls.length) return found;

  for (const call of calls) {
    // tl.extend({ variants: { _tablet: "@media...", ... } })
    // The arg is the outer object { variants: { ... } }
    const { obj, errors } = parseStyleObject(call.argSrc, file);
    if (!obj) continue;

    // Look for the "variants" key
    const variantsObj = obj["variants"];
    if (!variantsObj || typeof variantsObj !== "object") continue;

    // Each key:value is a variant definition
    for (const [key, selector] of Object.entries(variantsObj)) {
      if (typeof selector === "string" && selector.trim()) {
        found[key] = selector;
      }
    }
  }

  return found;
}

/* ═══════════════════════════════════════
   Style processing
   Exported so alternative parsers (e.g. extractor-swc.ts)
   can reuse the same variant resolution + registry write path.
═══════════════════════════════════════ */
/** Per-call rule metadata threaded through processStyles. Optional —
 *  unset values mean "no layer / default bundle / unlayered output". */
export interface RuleMetadata {
  layer?:  string;
  bundle?: string;
}

export function processStyles(
  obj:       StyleObject,
  variants:  FlatVariants,
  selector?: string,
  file = "<unknown>",
  errors: ParseError[] = [],
  meta:    RuleMetadata = {},
  /** Backgrounds declared on SIBLING groups in the same `tl.create({...})`.
   *  Used by the contrast validator as candidate ancestor surfaces when
   *  this group's `color` is set without a same-block `backgroundColor`. */
  peerBackgrounds: { light: string[]; dark: string[] } = { light: [], dark: [] },
  /** Group key (`btn`, `card`, …). Used by the contrast validator to
   *  produce diagnostics that reference the specific tl.create entry,
   *  rather than a generic placeholder. */
  groupKey: string = "(group)"
): string[] {
  const classes: string[] = [];

  // Auto-dark opt-out at this level: `_autoDark: false` disables auto-dark
  // for every color property in this object (and its variant blocks).
  // Pre-scan because the key can appear at any position and shouldn't be
  // emitted as a CSS rule.
  let autoDarkLocal = _autoDarkEnabled;
  if (Object.prototype.hasOwnProperty.call(obj, "_autoDark")) {
    autoDarkLocal = (obj as Record<string, unknown>)._autoDark !== false;
  }
  // Auto-RTL opt-out at this level — `_autoRtl: false`. Same scoping as
  // _autoDark: applies to every property in this object and its variants.
  let autoRtlLocal = _autoRtlEnabled;
  if (Object.prototype.hasOwnProperty.call(obj, "_autoRtl")) {
    autoRtlLocal = (obj as Record<string, unknown>)._autoRtl !== false;
  }
  // Per-group `_layer` / `_bundle` keys override the inherited meta.
  // Lets users mix layered + unlayered rules in one create() call.
  const localMeta: RuleMetadata = { ...meta };
  const layerKey  = (obj as Record<string, unknown>)._layer;
  const bundleKey = (obj as Record<string, unknown>)._bundle;
  if (typeof layerKey  === "string") localMeta.layer  = layerKey;
  if (typeof bundleKey === "string") localMeta.bundle = bundleKey;
  meta = localMeta;
  // Also collect explicit _dark overrides so we don't double-emit auto-dark
  // for properties the user already overrode by hand.
  const explicitDarkOverrides = new Set<string>();
  const darkVariant = (obj as Record<string, unknown>)._dark;
  if (darkVariant && typeof darkVariant === "object") {
    for (const k of Object.keys(darkVariant as Record<string, unknown>)) {
      explicitDarkOverrides.add(k);
    }
  }

  /* ── PAIR-AWARE AUTO-DARK ────────────────────────────────────────
     If THIS group has both `color` and `backgroundColor` (or shorthand
     equivalents), derive their dark variants together via deriveDarkPair
     so the resulting pair is GUARANTEED to meet WCAG AA (4.5:1) contrast.
     Naive per-property HSL inversion can produce invisible pairs (white
     text + 4%-translucent-white bg → black text + 4%-translucent-black
     bg = ~1.1:1). The pair derivation auto-adjusts the foreground
     lightness when needed.
     `pairedFg` is keyed on the ORIGINAL property name as the user wrote
     it (camelCase or kebab); the emission loop below looks up here when
     deriving auto-dark for `color`. */
  const pairedFg = new Map<string, string>();  // origKey → adjusted dark color value
  if (autoDarkLocal) {
    const fgKey = ["color"].find(k => Object.prototype.hasOwnProperty.call(obj, k));
    const bgKey = ["backgroundColor", "background-color", "background"]
      .find(k => Object.prototype.hasOwnProperty.call(obj, k));
    if (fgKey && bgKey
        && !explicitDarkOverrides.has(fgKey)
        && !explicitDarkOverrides.has(bgKey)) {
      const fgVal = String((obj as Record<string, unknown>)[fgKey]);
      const bgVal = String((obj as Record<string, unknown>)[bgKey]);
      // Only apply pair derivation to backgroundColor/-color longhand —
      // `background` shorthand may include gradients/images we can't
      // safely re-derive. The shorthand case still gets per-property auto-dark
      // independently; the longhand case is the one we pair-correct.
      //
      // ALSO: only pair when BOTH sides parse cleanly. Strings like
      // `currentColor` / `transparent` / `var(--x)` aren't real colors;
      // for those, the per-property auto-dark path correctly skips.
      // Without this guard, we'd populate `pairedFg` with the unchanged
      // value and emit a no-op dark rule.
      if (bgKey === "backgroundColor" || bgKey === "background-color") {
        const pair = deriveDarkPair(fgVal, bgVal);
        // ratio === 0 is the documented sentinel for "couldn't compute"
        // (one side wasn't parseable). Skip in that case.
        if (pair.ratio > 0) pairedFg.set(fgKey, pair.fg);
      }
    }
  }
  /* ── BACKGROUND-CLIP:TEXT FOOTGUN GUARD ──────────────────────────
     The `background:` shorthand resets `background-clip` to its initial
     `border-box` value as part of expansion. When a user writes
       { background: "linear-gradient(...)", backgroundClip: "text" }
     atomic CSS emits two separate rules — and depending on the order in
     which other files register their own `background:` shorthand, the
     reset can land AFTER the clip rule in the cascade and silently make
     gradient text invisible. This is a real bug we hit in production
     (showcase hero h1) and there is no legitimate use of the shorthand
     alongside `background-clip: text`; the longhand `backgroundImage:`
     does not reset the clip and is the correct primitive. We error
     loudly so the next adopter doesn't have to debug invisible text.
     Also walks immediate variant blocks (`_dark`, `_hover`, ...) when
     this block clips to text — variants override `background:` while
     inheriting the parent's clip on the same element. */
  {
    const isClipToText = (o: Record<string, unknown>): boolean =>
      o.backgroundClip === "text" ||
      o["background-clip"] === "text" ||
      o.webkitBackgroundClip === "text" ||
      o["-webkit-background-clip"] === "text";
    const hasBgShorthand = (o: Record<string, unknown>): boolean =>
      Object.prototype.hasOwnProperty.call(o, "background") &&
      typeof o.background === "string" &&
      (o.background as string).length > 0;
    const root = obj as Record<string, unknown>;
    const rootClips = isClipToText(root);
    if (rootClips && hasBgShorthand(root)) {
      errors.push({
        message:
          "Conflict: `background:` shorthand resets `background-clip` to its " +
          "initial value (`border-box`), so `backgroundClip: \"text\"` can be " +
          "silently undone by cascade order in atomic CSS. Use the longhand " +
          "`backgroundImage:` instead — it preserves `background-clip: text`.",
        line: 0, col: 0, file,
        tlsCode: DIAGNOSTICS.PROP_BG_CLIP_TEXT_CONFLICT.code,
        docsUrl: DIAGNOSTICS.PROP_BG_CLIP_TEXT_CONFLICT.docsUrl,
      });
    }
    if (rootClips) {
      for (const [vk, vv] of Object.entries(root)) {
        if (!vk.startsWith("_") || typeof vv !== "object" || vv === null) continue;
        if (vk === "_autoDark" || vk === "_autoRtl" || vk === "_layer" || vk === "_bundle") continue;
        if (hasBgShorthand(vv as Record<string, unknown>)) {
          errors.push({
            message:
              `Conflict in '${vk}': parent block sets \`background-clip: text\` but ` +
              "this variant uses `background:` shorthand, which resets the clip back to " +
              "`border-box`. Use `backgroundImage:` longhand inside the variant.",
            line: 0, col: 0, file,
            tlsCode: DIAGNOSTICS.PROP_BG_CLIP_TEXT_CONFLICT.code,
            docsUrl: DIAGNOSTICS.PROP_BG_CLIP_TEXT_CONFLICT.docsUrl,
          });
        }
      }
    }
  }

  /* ── CONTRAST AUDIT: light + dark mode, WCAG 2.1 AA/AAA ──────────
     Run only when this is the ROOT object of a group (selector is
     undefined). Nested variant blocks (`_hover`, `_dark`, etc.) inherit
     the parent's contrast since the same fg/bg are applied; auditing
     them again would just produce duplicate findings. */
  if (selector === undefined && _contrastOptions.level !== "off") {
    // We don't have the group's source key here (`btn`, `card`, etc.)
    // because processStyles is called per-group with the group's body
    // already unwrapped. The diagnostic still includes the file path,
    // so users can locate it. A future enhancement could thread the
    // group key through the call chain.
    const found = validateGroupContrast(obj, groupKey, file, _contrastOptions, peerBackgrounds);
    if (found.length > 0) {
      _contrastIssues.push(...found);
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (key === "_autoDark") continue;     // pre-handled above; never an atomic rule
    if (key === "_autoRtl") continue;      // pre-handled above; never an atomic rule
    if (key === "_layer")   continue;      // pre-handled above; cascade-layer marker
    if (key === "_bundle")  continue;      // pre-handled above; CSS-chunk marker
    if (key === "_skipContrast") continue; // contrast-validator escape hatch; never an atomic rule

    // Variant key (registered in BUILT_IN_VARIANTS or via tl.extend).
    if (key in variants) {
      if (typeof value !== "object") {
        errors.push({
          message: `Variant '${key}' must be an object, got ${typeof value}`,
          line: 0, col: 0, file,
        });
        continue;
      }
      classes.push(
        ...processStyles(value as StyleObject, variants, variants[key], file, errors, meta)
      );
      continue;
    }

    // RAW @-rule keys: `@media (...)`, `@container (...)`, `@supports (...)`.
    // The key IS the selector — no registration needed. This unlocks
    // container queries and arbitrary feature queries without polluting
    // the global variant namespace.
    if (key.startsWith("@") && typeof value === "object") {
      classes.push(
        ...processStyles(value as StyleObject, variants, key, file, errors, meta)
      );
      continue;
    }

    // RAW pseudo / parent selector keys: `:hover`, `[dir="rtl"] &`,
    // `.group:hover &`. Same passthrough pattern — useful when no
    // built-in variant matches and registering a custom one would be overkill.
    if ((key.startsWith(":") || key.startsWith("[") || key.startsWith(".") || key.includes("&")) && typeof value === "object") {
      classes.push(
        ...processStyles(value as StyleObject, variants, key, file, errors, meta)
      );
      continue;
    }

    // Unknown object — likely typo in variant name
    if (typeof value === "object") {
      const suggestion = findClosestVariant(key, variants);
      errors.push({
        message:
          `Unknown variant '${key}'` +
          (suggestion ? ` — did you mean '${suggestion}'?` : "") +
          ` Add it via tl.extend({ variants: { ${key}: "..." } }).`,
        line: 0, col: 0, file,
        tlsCode: DIAGNOSTICS.VARIANT_UNKNOWN.code,
        docsUrl: DIAGNOSTICS.VARIANT_UNKNOWN.docsUrl,
      });
      continue;
    }

    // CSS property — validate the name against the allowlist before
    // we hash and register. This catches typos at build time and
    // removes one degree of freedom from any future injection vector.
    if (!isKnownProperty(key)) {
      const suggestion = suggestClosestProperty(key);
      errors.push({
        message:
          `Unknown CSS property '${key}'` +
          (suggestion ? ` — did you mean '${suggestion}'?` : "") +
          " (use --customProperty for CSS variables, or a -webkit-/-moz-/-ms-/-o- prefix for vendor properties).",
        line: 0, col: 0, file,
        tlsCode: DIAGNOSTICS.PROP_UNKNOWN.code,
        docsUrl: DIAGNOSTICS.PROP_UNKNOWN.docsUrl,
      });
      continue;
    }

    // Auto-RTL: rewrite physical → logical so the SAME atomic rule covers
    // both directions (the browser flips logical properties under
    // `dir="rtl"` for free). When the rewrite fires the hash is computed
    // on the logical form, so runtime + compiler stay in sync.
    const rawVal = String(value);
    const rtl = autoRtlLocal
      ? convertToLogical(key, rawVal)
      : { prop: key, value: rawVal, changed: false };
    const emittedKey   = rtl.prop;
    const emittedValue = rtl.value;
    const strVal       = emittedValue;

    const cls    = classFor(emittedKey, strVal, selector);
    globalRegistry.add({
      cls,
      prop:   toKebab(emittedKey),
      value:  strVal,
      selector,
      layer:  meta.layer,
      bundle: meta.bundle,
      origin: file === "<unknown>" ? undefined : {
        file,
        sourceKey: rtl.changed ? `${key} → ${emittedKey} (auto-rtl)` : key,
      },
    });
    classes.push(cls);

    // Auto-dark: emit a paired `:is(.dark *)` rule with a derived value
    // for every color property the user wrote (skipping anything they
    // already overrode in `_dark: {...}` and skipping when the current
    // selector is itself dark-mode-related to avoid recursion). Uses the
    // POST-RTL property name so the hash matches.
    if (
      autoDarkLocal &&
      isAutoDarkProperty(emittedKey) &&
      !explicitDarkOverrides.has(key) &&
      (selector === undefined || !selector.includes(".dark"))
    ) {
      // Use the pair-adjusted foreground when available (color paired
      // with a sibling backgroundColor in this group). Falls back to
      // naive HSL inversion for everything else.
      const darkValue = pairedFg.get(key) ?? deriveDarkColor(strVal);
      if (darkValue) {
        const darkSelector = selector
          ? `:is(.dark *)${selector.startsWith(":") ? selector : ` ${selector}`}`
          : ":is(.dark *)";
        const darkCls = classFor(emittedKey, darkValue, darkSelector);
        globalRegistry.add({
          cls:      darkCls,
          prop:     toKebab(emittedKey),
          value:    darkValue,
          selector: darkSelector,
          layer:    meta.layer,
          bundle:   meta.bundle,
          origin:   file === "<unknown>" ? undefined : { file, sourceKey: `${key} (auto-dark)` },
        });
        classes.push(darkCls);
      }
    }
  }

  return classes;
}

function findClosestVariant(key: string, variants: FlatVariants): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const v of Object.keys(variants)) {
    const d = levenshtein(key, v);
    if (d < bestDist && d <= 2) { bestDist = d; best = v; }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

/* ═══════════════════════════════════════
   Tokens, themes, and tl.cssVar() expansion.

   These are simpler than tl.create — they don't generate atomic rules,
   they just register :root / theme-class CSS and (for cssVar) replace
   the call with a literal var() string so the strict literal-only
   parser is happy with the result.
═══════════════════════════════════════ */

/** Replace every `<id>.cssVar("name")` in src with the literal var() string. */
function expandCssVarCalls(src: string): string {
  return src.replace(
    /\b[A-Za-z_$][\w$]*\.cssVar\s*\(\s*(["'])([\w-]+)\1\s*\)/g,
    (_match, _quote, name) => JSON.stringify(`var(--${tokenVarName(name)})`)
  );
}

/* ═══════════════════════════════════════
   Cross-file `tokens.brand.primary` support.

   Pipeline:
     1. `scanDefineTokens(src, file)` runs over ALL files first (read-only),
        populating `tokenExportRegistry` so any file's exports are visible
        regardless of processing order.
     2. Per-file `transform()` calls `parseFileImports(src, file)` to build
        a local map { localBindingName → NestedTokenShape }.
     3. Inside each `tl.create()` call, `expandTokenMemberAccess()` rewrites
        `<localName>.<key>.<key>...` to the literal `var(--sc-XXX)` string
        the leaf resolves to. Replacement is scoped to the call's argument
        body, so identifiers shadowed in inner scopes (e.g. function
        parameters) are never touched.

   Limitation: only named imports are resolved — `import { x } from "./y"`.
   `import * as M from "./y"` and `import M from "./y"` (default) aren't
   supported in v1. Document this for users.
═══════════════════════════════════════ */

/* ─── Path alias support ───────────────────────────────────────────────
   Read tsconfig.json's compilerOptions.baseUrl + paths once per extract
   run. The mapping is kept module-private and rebuilt by `loadPathAliases`.
   Aliases like `"@/*": ["./src/*"]` are normalized to ordered match rules:
   exact prefixes get tried first, then wildcards.
*/
type AliasRule =
  | { kind: "exact";    pattern: string;       targets: string[] }
  | { kind: "wildcard"; prefix: string; suffix: string; targets: { prefix: string; suffix: string }[] };

let aliasRules: AliasRule[]   = [];
let aliasBaseDir: string      = process.cwd();

/**
 * Strip line + block comments from JSON-with-comments tsconfig files.
 * String-aware: comment markers inside string literals (e.g. "**\/*.ts")
 * are NOT stripped. Walks char-by-char to track string boundaries with
 * proper escape handling — a regex-only approach miscount strings every
 * time it sees `/*` or `//` inside a quoted glob.
 */
function stripJsonComments(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    // String literal — copy through to closing quote.
    if (c === '"') {
      out += c; i++;
      while (i < s.length) {
        out += s[i];
        if (s[i] === "\\" && i + 1 < s.length) { out += s[i + 1]; i += 2; continue; }
        if (s[i] === '"') { i++; break; }
        i++;
      }
      continue;
    }
    // Block comment.
    if (c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    // Line comment.
    if (c === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

export function loadPathAliases(projectRoot: string): void {
  aliasRules   = [];
  aliasBaseDir = projectRoot;

  const cfgPath = path.join(projectRoot, "tsconfig.json");
  if (!fs.existsSync(cfgPath)) return;

  let raw: { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
  try {
    raw = JSON.parse(stripJsonComments(fs.readFileSync(cfgPath, "utf8")));
  } catch {
    return;
  }

  const co = raw.compilerOptions ?? {};
  const baseUrl = co.baseUrl
    ? path.resolve(projectRoot, co.baseUrl)
    : projectRoot;
  aliasBaseDir = baseUrl;

  const paths = co.paths ?? {};
  for (const [pattern, targets] of Object.entries(paths)) {
    if (pattern.endsWith("/*")) {
      // "@/*" → match prefix "@/", everything after is the wildcard.
      const prefix = pattern.slice(0, -1);            // drop trailing `*`, keep the `/`
      aliasRules.push({
        kind:   "wildcard",
        prefix,
        suffix: "",
        targets: targets.map(t => {
          const star = t.indexOf("*");
          if (star < 0) return { prefix: t, suffix: "" };
          return { prefix: t.slice(0, star), suffix: t.slice(star + 1) };
        }),
      });
    } else {
      aliasRules.push({ kind: "exact", pattern, targets });
    }
  }
  // Try wildcards after exact matches by sorting rules.
  aliasRules.sort((a, b) => (a.kind === "exact" ? -1 : 1) - (b.kind === "exact" ? -1 : 1));
}

/** Apply tsconfig paths to a non-relative specifier. Returns the rewritten
 *  path (still a string specifier) on match, or null if no rule fires. */
function applyAliases(spec: string): string | null {
  for (const rule of aliasRules) {
    if (rule.kind === "exact") {
      if (spec === rule.pattern && rule.targets.length > 0) {
        return path.resolve(aliasBaseDir, rule.targets[0]);
      }
    } else {
      if (spec.startsWith(rule.prefix) && rule.targets.length > 0) {
        const remainder = spec.slice(rule.prefix.length);
        const first = rule.targets[0];
        return path.resolve(aliasBaseDir, first.prefix + remainder + first.suffix);
      }
    }
  }
  return null;
}

/** Try the candidate paths an import specifier could resolve to.
 *
 *  Resolution order:
 *    1. Relative paths (./foo, ../bar) → resolved against fromDir.
 *    2. tsconfig path aliases (@/foo, ~/utils) → resolved against baseUrl.
 *    3. Bare specifiers (lodash, @scope/pkg) → require.resolve fallback.
 *
 *  Each candidate is tried against the standard extension list before
 *  giving up. A null return means "this specifier doesn't lead to a token
 *  source" — it doesn't error, just declines to resolve. */
function resolveImport(fromDir: string, spec: string): string | null {
  // 1. Relative imports
  if (spec.startsWith(".")) {
    return tryCandidates(path.resolve(fromDir, spec));
  }

  // 2. tsconfig path aliases
  const aliased = applyAliases(spec);
  if (aliased) return tryCandidates(aliased);

  // 3. Bare specifier — node module resolution
  try {
    const r = require;   // captured to avoid TS complaining about dynamic require
    const resolved = r.resolve(spec, { paths: [fromDir, aliasBaseDir] });
    return path.resolve(resolved);
  } catch {
    return null;
  }
}

function tryCandidates(base: string): string | null {
  const candidates = [
    base,
    base + ".ts",
    base + ".tsx",
    base + ".js",
    base + ".jsx",
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
    path.join(base, "index.jsx"),
  ];
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return path.resolve(c); }
    catch { /* not present */ }
  }
  return null;
}

/**
 * Read-only scan: register every defineTokens binding into the export
 * registry. Handles both inline-export forms (`export const X = ...`) and
 * deferred-export forms (`const X = ...; export { X };` and
 * `export default X`). Runs once across all files BEFORE any full
 * `transform()` so cross-file references resolve regardless of order.
 *
 * Also seeds `tokenRegistry` with the discovered token names — idempotent
 * when `processDefineTokens` runs later during `transform()`.
 */
export function scanDefineTokens(src: string, file: string): void {
  if (!src.includes("defineTokens") && !src.includes("export")) return;

  const absPath = path.resolve(file);

  // Phase 1: catalog every local defineTokens binding in the file (whether
  // immediately exported or not), so deferred export statements can later
  // promote them.
  const localBindings = new Map<string, NestedTokenShape>();

  if (src.includes("defineTokens")) {
    const calls = findNamedCalls(src, "defineTokens");
    for (const call of calls) {
      const { obj } = parseStyleObject(call.argSrc, file);
      if (!obj) continue;

      // Seed tokenRegistry — keeps later transforms idempotent.
      // Auto-dark each token: if the value parses as a color, derive the
      // dark counterpart so generateTokensCSS can emit a `.dark` rule that
      // re-binds the same variable. This is what makes ALL components
      // using `tl.cssVar(...)` automatically support dark mode.
      for (const { key, value } of flattenTokenMap(obj as Record<string, unknown>)) {
        const dark = _autoDarkEnabled ? deriveDarkColor(value) ?? undefined : undefined;
        tokenRegistry.addToken(tokenVarName(key), value, dark);
      }

      const window = src.slice(Math.max(0, call.fullStart - 120), call.fullStart);
      const decl = window.match(/(?:^|[\s;{}])(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/);
      if (!decl) continue;
      const isInlineExport = !!decl[1];
      const bindingName    = decl[2];
      const shape          = buildVarShape(obj as Record<string, unknown>);

      localBindings.set(bindingName, shape);
      if (isInlineExport) {
        tokenExportRegistry.registerShape(absPath, bindingName, shape);
      }
    }
  }

  // Phase 2: deferred exports of locally-bound tokens.
  //   `export { x };`              → register x under name x
  //   `export { x as y };`         → register x under name y
  //   `export default x;`          → register x under name "default"
  //   `export default { x };`      → register x under name "default" with key "x"
  if (localBindings.size > 0) {
    // Named bare-export statements (no `from` clause).
    const bareRe = /^[ \t]*export\s*\{([^}]+)\}\s*;?[ \t]*$/gm;
    let bm: RegExpExecArray | null;
    while ((bm = bareRe.exec(src)) !== null) {
      for (const clause of bm[1].split(",").map(c => c.trim()).filter(Boolean)) {
        const aliasMatch = clause.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
        const localName  = aliasMatch ? aliasMatch[1] : clause;
        const exportName = aliasMatch ? aliasMatch[2] : clause;
        const shape = localBindings.get(localName);
        if (shape) tokenExportRegistry.registerShape(absPath, exportName, shape);
      }
    }

    // `export default X;` — single identifier referring to a local binding.
    const defaultIdRe = /^[ \t]*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?[ \t]*$/gm;
    let dm: RegExpExecArray | null;
    while ((dm = defaultIdRe.exec(src)) !== null) {
      const shape = localBindings.get(dm[1]);
      if (shape) tokenExportRegistry.registerShape(absPath, "default", shape);
    }

    // `export default { x, y: alias }` — synthesize a virtual default
    // export shape composed of the listed bindings. Property values that
    // aren't simple identifiers are skipped.
    const defaultObjRe = /^[ \t]*export\s+default\s*\{([^}]*)\}\s*;?[ \t]*$/gm;
    let om: RegExpExecArray | null;
    while ((om = defaultObjRe.exec(src)) !== null) {
      const shape: NestedTokenShape = {};
      for (const clause of om[1].split(",").map(c => c.trim()).filter(Boolean)) {
        const colonMatch = clause.match(/^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)$/);
        const key  = colonMatch ? colonMatch[1] : clause;
        const ref  = colonMatch ? colonMatch[2] : clause;
        const refShape = localBindings.get(ref);
        if (refShape) shape[key] = refShape;
      }
      if (Object.keys(shape).length > 0) {
        tokenExportRegistry.registerShape(absPath, "default", shape);
      }
    }
  }

  // Phase 3: re-exports from other files.
  scanFileReexports(src, absPath);
}

/** Scan re-export statements and register them. */
function scanFileReexports(src: string, absPath: string): void {
  // Star re-export: `export * from "./y"`
  const starRe = /^[ \t]*export\s*\*\s*from\s*["']([^"']+)["']\s*;?[ \t]*$/gm;
  let sm: RegExpExecArray | null;
  while ((sm = starRe.exec(src)) !== null) {
    // Use a uniquely-keyed entry per source so multiple star re-exports coexist.
    tokenExportRegistry.register(absPath, `\0star:${sm[1]}`, {
      kind: "reexport-star",
      from: sm[1],
    });
  }

  // Named re-export: `export { a, b as c } from "./y"`
  const namedRe = /^[ \t]*export\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']\s*;?[ \t]*$/gm;
  let nm: RegExpExecArray | null;
  while ((nm = namedRe.exec(src)) !== null) {
    const from = nm[2];
    for (const clause of nm[1].split(",").map(s => s.trim()).filter(Boolean)) {
      const aliasMatch = clause.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      const sourceName = aliasMatch ? aliasMatch[1] : clause;
      const localName  = aliasMatch ? aliasMatch[2] : clause;
      if (!/^[A-Za-z_$][\w$]*$/.test(sourceName)) continue;
      tokenExportRegistry.register(absPath, localName, {
        kind:       "reexport-named",
        from,
        sourceName,
      });
    }
  }

  // Re-export of a local binding (no `from` clause): `export { tokens };`
  // The local binding registration is already handled by scanDefineTokens
  // when it sees `export const tokens = ...`. The bare-export form is
  // covered too because the `(?:export\s+)?` regex matches both placements.
  // No additional handling required here.
}

/**
 * Per-file import resolution. Returns a map of local-binding-name →
 * resolved token shape, covering:
 *
 *   import { tokens } from "./theme"          (named, optionally aliased)
 *   import * as Theme from "./theme"          (namespace — first dotted key
 *                                              after Theme picks the export)
 *   import Theme from "./theme"               (default export)
 *
 * For named imports, the value is the export's shape directly. For
 * namespace and default imports we wrap a synthetic record so the same
 * `expandTokenMemberAccess` code path can walk it.
 */
export function parseFileImports(src: string, file: string): Map<string, NestedTokenShape> {
  const out = new Map<string, NestedTokenShape>();
  if (!src.includes("import")) return out;

  const fromDir = path.dirname(path.resolve(file));

  // Match every `import ... from "..."` statement. We narrow afterward.
  const importRe = /import\s+([^"';]+?)\s+from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;

  while ((m = importRe.exec(src)) !== null) {
    const clause   = m[1].trim();
    const specifier = m[2];
    const resolvedPath = resolveImport(fromDir, specifier);
    if (!resolvedPath) continue;

    // Namespace import: `* as M`
    const nsMatch = clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (nsMatch) {
      const localName = nsMatch[1];
      // Build a synthetic shape: every NAMED export from the file becomes
      // a key whose value is the resolved shape.
      const nsShape: NestedTokenShape = {};
      for (const exportName of tokenExportRegistry.listExportNames(resolvedPath)) {
        const s = tokenExportRegistry.resolve(resolvedPath, exportName);
        if (s) nsShape[exportName] = s;
      }
      if (Object.keys(nsShape).length > 0) out.set(localName, nsShape);
      continue;
    }

    // Default-only:  `import Foo from "./mod"`
    // Default + named: `import Foo, { a, b } from "./mod"`
    // Named-only:  `import { a, b } from "./mod"`
    const defaultMatch = clause.match(/^([A-Za-z_$][\w$]*)\s*(?:,\s*\{([^}]*)\})?$/);
    const namedOnlyMatch = clause.match(/^\{([^}]*)\}$/);

    let defaultName: string | undefined;
    let namedClause: string | undefined;

    if (defaultMatch) {
      defaultName = defaultMatch[1];
      namedClause = defaultMatch[2];
    } else if (namedOnlyMatch) {
      namedClause = namedOnlyMatch[1];
    }

    // Resolve default export, if present.
    if (defaultName) {
      const shape = tokenExportRegistry.resolve(resolvedPath, "default");
      if (shape) out.set(defaultName, shape);
    }

    // Resolve named exports.
    if (namedClause) {
      const clauses = namedClause.split(",").map(c => c.trim()).filter(Boolean);
      for (const c of clauses) {
        const aliasMatch = c.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
        const importedName = aliasMatch ? aliasMatch[1] : c;
        const localName    = aliasMatch ? aliasMatch[2] : c;
        if (!/^[A-Za-z_$][\w$]*$/.test(importedName)) continue;
        const shape = tokenExportRegistry.resolve(resolvedPath, importedName);
        if (shape) out.set(localName, shape);
      }
    }
  }
  return out;
}

/** Public hook so extract-fn can install the alias-aware resolver into
 *  the registry's recursive resolve(). The registry's listExportNames
 *  also depends on this resolver to follow `export *` chains. */
export function installRegistryResolver(): void {
  tokenExportRegistry.setResolver(
    (fromFile, spec) => resolveImport(path.dirname(fromFile), spec),
    (file)           => tokenExportRegistry.listExportNames(file),
  );
}

/** Diagnostic: TRACELESS_STYLE_DEBUG_RESOLVE prints what the export registry
 *  knows after PASS 0. Useful for debugging cross-file resolution issues
 *  in real adopter projects without instrumenting the source. */
export function debugDumpExportRegistry(): string {
  const lines: string[] = [];
  // The registry's internal state isn't exposed; use a minimal probe via
  // `resolve` for known-name patterns isn't useful here. Instead, snapshot
  // by re-encoding via JSON of the internal Map. Reach in via the unique
  // closed-over instance — TypeScript will complain about private field
  // access in strict mode, so we cast through `unknown` deliberately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = tokenExportRegistry as unknown as { exports: Map<string, Map<string, unknown>> };
  for (const [file, m] of reg.exports) {
    lines.push(`  ${file}`);
    for (const [name, entry] of m) lines.push(`    ${name}  →  ${JSON.stringify(entry).slice(0, 200)}`);
  }
  return lines.length > 0 ? lines.join("\n") : "  (empty)";
}

/**
 * Inside an `tl.create()` argument body, replace `<localName>.<k>.<k>...`
 * with the literal `var(--sc-XXX)` string the leaf resolves to.
 *
 * Replacement is bounded to the argument's text so we never accidentally
 * rewrite a shadowing local of the same name in an inner scope.
 */
function expandTokenMemberAccess(
  argSrc:   string,
  imports:  Map<string, NestedTokenShape>
): string {
  if (imports.size === 0) return argSrc;

  // Build one regex per import (anchoring at the local name).
  let result = argSrc;
  for (const [localName, shape] of imports) {
    const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}((?:\\.[A-Za-z_$][\\w$]*)+)`, "g");
    result = result.replace(re, (match, dotted: string) => {
      const keys = dotted.slice(1).split(".");
      let cur: NestedTokenShape | string = shape;
      for (const k of keys) {
        if (typeof cur === "string") return match;        // already a leaf — odd path
        if (!(k in cur)) return match;                    // unknown key — leave as-is
        cur = cur[k];
      }
      if (typeof cur !== "string") return match;          // not a leaf — leave for runtime
      return JSON.stringify(cur);
    });
  }
  return result;
}

/** Detect `<id>.defineTokens({...})` and emit token CSS. */
function processDefineTokens(src: string, file: string, errors: ParseError[]): {
  src:     string;
  changed: boolean;
} {
  const calls = findNamedCalls(src, "defineTokens");
  if (!calls.length) return { src, changed: false };

  let result  = src;
  let offset  = 0;

  for (const call of calls) {
    const { obj, errors: pe } = parseStyleObject(call.argSrc, file);
    errors.push(...pe);
    if (!obj) continue;

    const flat = flattenTokenMap(obj as Record<string, unknown>);
    const runtimeForm: Record<string, unknown> = {};

    for (const { key, value } of flat) {
      const name = tokenVarName(key);
      const dark = _autoDarkEnabled ? deriveDarkColor(value) ?? undefined : undefined;
      tokenRegistry.addToken(name, value, dark);
      // Reconstruct the nested shape with var() strings.
      setNested(runtimeForm, key.split("-"), `var(--${name})`);
    }

    const replacement = JSON.stringify(runtimeForm);
    const start = call.fullStart + offset;
    const end   = call.fullEnd   + offset;
    result  = result.slice(0, start) + replacement + result.slice(end);
    offset += replacement.length - (end - start);
  }
  return { src: result, changed: true };
}

function setNested(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    if (!cur[seg] || typeof cur[seg] !== "object") cur[seg] = {};
    cur = cur[seg] as Record<string, unknown>;
  }
  cur[path[path.length - 1]] = value;
}

/**
 * Detect `<id>.keyframes("name", { from: {...}, to: {...} })` and emit
 * the corresponding @keyframes rule. Same two-arg shape as createTheme,
 * so we use the same scanner.
 */
function processKeyframes(src: string, file: string, errors: ParseError[]): {
  src:     string;
  changed: boolean;
} {
  const re = /\b[A-Za-z_$][\w$]*\.keyframes\s*\(\s*(["'])([\w-]+)\1\s*,\s*\{/g;
  let result  = src;
  let changed = false;
  const matches: Array<{ start: number; bodyStart: number; name: string }> = [];
  // Track `const X = tl.keyframes(...)` assignments so we can resolve
  // `${X}` interpolations in template literals later in the file.
  const keyframeBindings = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    matches.push({ start: m.index, bodyStart: m.index + m[0].length - 1, name: m[2] });
  }

  for (const { start, bodyStart, name } of matches.reverse()) {
    let depth = 0, inStr = false, q = "", j = bodyStart;
    let bodyEnd = -1;
    for (; j < src.length; j++) {
      const c = src[j];
      if (inStr) {
        if (c === q && src[j - 1] !== "\\") inStr = false;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { inStr = true; q = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { bodyEnd = j + 1; break; }
      }
    }
    if (bodyEnd < 0) continue;
    let callEnd = bodyEnd;
    while (callEnd < src.length && /\s/.test(src[callEnd])) callEnd++;
    if (src[callEnd] !== ")") continue;
    callEnd++;

    const argSrc = src.slice(bodyStart, bodyEnd);
    const { obj, errors: pe } = parseStyleObject(argSrc, file);
    errors.push(...pe);
    if (!obj) continue;

    // Frames: `from`, `to`, percentages — each maps to a flat declaration map.
    const steps: Array<{ stop: string; decls: Array<{ prop: string; value: string }> }> = [];
    for (const [stop, decls] of Object.entries(obj)) {
      if (typeof decls !== "object" || decls === null) {
        errors.push({
          message: `tl.keyframes(): step '${stop}' must be an object of CSS declarations`,
          line: 0, col: 0, file,
        });
        continue;
      }
      const flat: Array<{ prop: string; value: string }> = [];
      for (const [k, v] of Object.entries(decls)) {
        if (v === undefined || v === null || typeof v === "object") continue;
        if (!isKnownProperty(k)) {
          const suggestion = suggestClosestProperty(k);
          errors.push({
            message:
              `Unknown CSS property '${k}' inside tl.keyframes()` +
              (suggestion ? ` — did you mean '${suggestion}'?` : "."),
            line: 0, col: 0, file,
            tlsCode: DIAGNOSTICS.PROP_UNKNOWN.code,
            docsUrl: DIAGNOSTICS.PROP_UNKNOWN.docsUrl,
          });
          continue;
        }
        flat.push({ prop: toKebab(k), value: String(v) });
      }
      if (flat.length > 0) steps.push({ stop, decls: flat });
    }

    const ident = keyframeName(name);
    tokenRegistry.addKeyframe(ident, steps);

    // Look BACKWARD for a binding pattern: `const X =` (or let/var) up
    // to ~80 chars before the call. If found, remember `X → ident` so
    // template literals like `${X}` elsewhere in the file can resolve
    // to the actual @keyframes identifier. Without this, users who
    // wrote ``animation: `${fadeUp} 0.6s` `` saw their animations
    // silently break — the literal-only AST parser can't evaluate
    // ${fadeUp}, so the rule emitted CSS containing the unresolved
    // template placeholder.
    const lookback = result.slice(Math.max(0, start - 80), start);
    const bindMatch = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*$/m.exec(lookback);
    if (bindMatch) keyframeBindings.set(bindMatch[1], ident);

    const replacement = JSON.stringify(ident);
    result  = result.slice(0, start) + replacement + result.slice(callEnd);
    changed = true;
  }

  // Resolve `${binding}` interpolations in template literals using the
  // keyframe-binding map. We ONLY substitute inside backtick-quoted
  // strings so we don't accidentally rewrite source that happens to
  // contain `${X}` outside a template context.
  if (keyframeBindings.size > 0) {
    result = expandKeyframeBindingsInTemplates(result, keyframeBindings);
    changed = true;
  }

  return { src: result, changed };
}

/**
 * Walk `src`, find every backtick template literal, and inside each one
 * substitute `${name}` with the resolved keyframe identifier when `name`
 * is a known binding. Leaves all non-template strings untouched.
 *
 * Why a hand-rolled walk: a global regex would also match `${X}` in
 * string-typed source (e.g. "${fadeUp} text" — single-quoted), which is
 * NOT a template literal and shouldn't be expanded.
 */
function expandKeyframeBindingsInTemplates(src: string, bindings: Map<string, string>): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    // Skip line + block comments verbatim.
    if (ch === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      const stop = end < 0 ? src.length : end;
      out += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop);
      i = stop;
      continue;
    }
    // Skip non-template strings verbatim.
    if (ch === '"' || ch === "'") {
      const q = ch;
      let j = i + 1;
      while (j < src.length && src[j] !== q) { if (src[j] === "\\") j += 2; else j++; }
      out += src.slice(i, Math.min(j + 1, src.length));
      i = j + 1;
      continue;
    }
    // Template literal — perform substitution while preserving everything else.
    if (ch === "`") {
      let j = i + 1;
      let body = "`";
      while (j < src.length && src[j] !== "`") {
        if (src[j] === "\\") { body += src.slice(j, j + 2); j += 2; continue; }
        if (src[j] === "$" && src[j + 1] === "{") {
          const close = src.indexOf("}", j + 2);
          if (close < 0) { body += src.slice(j); j = src.length; break; }
          const inner = src.slice(j + 2, close).trim();
          const replacement = bindings.get(inner);
          if (replacement) {
            body += replacement;  // emit the literal keyframe name, not "${X}"
          } else {
            body += src.slice(j, close + 1);
          }
          j = close + 1;
          continue;
        }
        body += src[j];
        j++;
      }
      body += "`";
      out += body;
      i = j + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Detect `<id>.createTheme("name", {...})` and emit theme CSS. */
function processCreateThemes(src: string, file: string, errors: ParseError[]): {
  src:     string;
  changed: boolean;
} {
  // Two-arg pattern: <id>.createTheme(<string>, <object>).
  // We scan for the call header, then find the matching `}` of the
  // second arg, then `)`. Strings/comments are skipped via simple
  // state — same approach as findNamedCalls but extended.
  const re = /\b[A-Za-z_$][\w$]*\.createTheme\s*\(\s*(["'])([\w-]+)\1\s*,\s*\{/g;
  let result  = src;
  let changed = false;
  // Iterate from the END so splices don't shift earlier offsets.
  const matches: Array<{ start: number; bodyStart: number; name: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const idStart = m.index;
    const bodyStart = m.index + m[0].length - 1; // points at the `{`
    matches.push({ start: idStart, bodyStart, name: m[2] });
  }

  for (const { start, bodyStart, name } of matches.reverse()) {
    // Match the closing `}` of the override object, then `)`.
    let depth = 0, inStr = false, q = "", j = bodyStart;
    let bodyEnd = -1;
    for (; j < src.length; j++) {
      const c = src[j];
      if (inStr) {
        if (c === q && src[j - 1] !== "\\") inStr = false;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { inStr = true; q = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { bodyEnd = j + 1; break; }
      }
    }
    if (bodyEnd < 0) continue;
    let callEnd = bodyEnd;
    while (callEnd < src.length && /\s/.test(src[callEnd])) callEnd++;
    if (src[callEnd] !== ")") continue;
    callEnd++;

    const argSrc = src.slice(bodyStart, bodyEnd);
    const { obj, errors: pe } = parseStyleObject(argSrc, file);
    errors.push(...pe);
    if (!obj) continue;

    const overrides = flattenTokenMap(obj as Record<string, unknown>)
      .map(({ key, value }) => ({ name: tokenVarName(key), value }));
    const cls = themeClassName(name);
    tokenRegistry.addTheme(cls, overrides);

    const replacement = JSON.stringify(cls);
    result  = result.slice(0, start) + replacement + result.slice(callEnd);
    changed = true;
  }

  return { src: result, changed };
}

/**
 * Run the tokens / themes / cssVar text rewrites in isolation. Exposed
 * so the SWC extractor can run them before its own AST parse — same
 * effect, no duplicated logic.
 */
export function preprocessTokensAndCssVar(
  src:    string,
  file:   string,
  errors: ParseError[]
): string {
  let s = src;
  s = processDefineTokens(s, file, errors).src;
  s = processCreateThemes(s, file, errors).src;
  s = processKeyframes(s, file, errors).src;
  s = expandCssVarCalls(s);

  // Cross-file token member-access expansion. Done HERE (before SWC parses)
  // so the SWC strict-literal-only value validation accepts the result.
  // Scoped to each `tl.create({...})` argument body so we never rewrite a
  // shadowed local of the same name in an inner scope.
  const importedTokens = parseFileImports(s, file);
  if (importedTokens.size > 0) {
    const calls = findNamedCalls(s, "create");
    // Splice in reverse so earlier offsets stay valid.
    for (let i = calls.length - 1; i >= 0; i--) {
      const call = calls[i];
      const expanded = expandTokenMemberAccess(call.argSrc, importedTokens);
      if (expanded === call.argSrc) continue;
      // The arg occupies [argStart, argStart + argSrc.length] inside the
      // call. fullStart points at the start of the callee identifier; the
      // arg is between them. We can locate it by searching forward from
      // fullStart for the first `{`, which findNamedCalls already
      // identified (argSrc starts with the outer `{`).
      const argStart = s.indexOf(call.argSrc, call.fullStart);
      if (argStart < 0) continue;
      s = s.slice(0, argStart) + expanded + s.slice(argStart + call.argSrc.length);
    }
  }

  return s;
}

/* ═══════════════════════════════════════
   Main transform
═══════════════════════════════════════ */
export function transform(
  src:            string,
  file:           string,
  customVariants: Record<string, string> = {}
): TransformResult {
  const errors:   ParseError[] = [];
  const warnings: string[]     = [];
  const rules:    AtomicRule[] = [];

  // Quick prefilter — if the file mentions none of our APIs, we're done.
  if (
    !src.includes("create") && !src.includes("extend") &&
    !src.includes("defineTokens") && !src.includes("createTheme") &&
    !src.includes("keyframes") && !src.includes("cssVar")
  ) {
    return { code: src, rules: [], changed: false, errors: [], warnings: [] };
  }

  // Tokens & themes first — they emit CSS and rewrite their call sites.
  // Then expand tl.cssVar("...") into literal var() strings so the strict
  // literal-only tl.create parser accepts them.
  let working = src;
  let changedAny = false;

  const tokensRes = processDefineTokens(working, file, errors);
  working = tokensRes.src;
  changedAny ||= tokensRes.changed;

  const themesRes = processCreateThemes(working, file, errors);
  working = themesRes.src;
  changedAny ||= themesRes.changed;

  const keyframesRes = processKeyframes(working, file, errors);
  working = keyframesRes.src;
  changedAny ||= keyframesRes.changed;

  working = expandCssVarCalls(working);

  // Auto-detect tl.extend() in this file and merge its variants
  const detectedVariants = extractCustomVariants(working, file);
  const allCustom = { ...customVariants, ...detectedVariants };

  const { flat: variants, errors: varErrors } =
    Object.keys(allCustom).length > 0
      ? mergeVariants(allCustom)
      : { flat: DEFAULT_VARIANTS, errors: [] };

  for (const ve of varErrors) {
    warnings.push(`[traceless-style] ${ve.message}`);
  }

  const calls = findNamedCalls(working, "create");
  if (!calls.length) {
    return {
      code:           working,
      rules:          [],
      changed:        changedAny,
      errors,
      warnings,
      customVariants: allCustom,
    };
  }

  // Resolve imported token bindings ONCE per file. Each call's argSrc gets
  // member-access expansion applied just before parseStyleObject sees it,
  // so cross-file `import { tokens } from "./theme"; tokens.brand.primary`
  // becomes a literal `"var(--sc-XXX)"` the strict parser is happy with.
  const importedTokens = parseFileImports(working, file);

  let result  = working;
  let offset  = 0;
  let changed = changedAny;

  for (const call of calls) {
    const expandedArgSrc = expandTokenMemberAccess(call.argSrc, importedTokens);
    const { obj: outerObj, errors: pe } = parseStyleObject(expandedArgSrc, file);
    errors.push(...pe);

    if (!outerObj) {
      warnings.push(`[traceless-style] Could not parse tl.create() in ${file}`);
      continue;
    }

    const resolved: Record<string, string> = {};

    /* Pre-scan peer-group backgrounds across this `tl.create({...})` body
       so the contrast validator can audit sibling-relationship contrast.
       For each group we collect:
         • light: `backgroundColor` / `background-color` declared on the group itself
         • dark : the same key inside its `_dark` block (or the light value as fallback)
       Background-shorthand values (`linear-gradient(...)`, `url(...)`) are excluded
       because they aren't single colors — they'd produce nonsensical pairings. */
    const peerBgs: { light: string[]; dark: string[] } = { light: [], dark: [] };
    for (const styles of Object.values(outerObj)) {
      if (typeof styles !== "object" || styles === null) continue;
      const g = styles as Record<string, unknown>;
      const lightBg = (typeof g.backgroundColor === "string" && g.backgroundColor)
                   || (typeof g["background-color"] === "string" && g["background-color"])
                   || null;
      if (lightBg && /^[#a-zA-Z0-9.,()% /\s-]+$/.test(lightBg)
          && !/(linear-gradient|radial-gradient|conic-gradient|url\()/.test(lightBg)) {
        peerBgs.light.push(lightBg);
      }
      const dark = g._dark as Record<string, unknown> | undefined;
      const darkBg = dark
        ? ((typeof dark.backgroundColor === "string" && dark.backgroundColor)
           || (typeof dark["background-color"] === "string" && dark["background-color"])
           || lightBg)
        : lightBg;
      if (darkBg && /^[#a-zA-Z0-9.,()% /\s-]+$/.test(darkBg)
          && !/(linear-gradient|radial-gradient|conic-gradient|url\()/.test(darkBg)) {
        peerBgs.dark.push(darkBg);
      }
    }
    peerBgs.light = [...new Set(peerBgs.light)];
    peerBgs.dark  = [...new Set(peerBgs.dark)];

    for (const [key, styles] of Object.entries(outerObj)) {
      if (typeof styles !== "object") {
        errors.push({ message: `tl.create() key '${key}' must be an object`, line: 0, col: 0, file });
        continue;
      }
      const classes = processStyles(styles as StyleObject, variants, undefined, file, errors, {}, peerBgs, key);
      resolved[key] = [...new Set(classes)].join(" ");
    }

    rules.push(
      ...globalRegistry.getAll().filter(r =>
        Object.values(resolved).some(v => v.includes(r.cls))
      )
    );

    const replacement = JSON.stringify(resolved);
    const start = call.fullStart + offset;
    const end   = call.fullEnd   + offset;
    result  = result.slice(0, start) + replacement + result.slice(end);
    offset += replacement.length - (end - start);
    changed = true;
  }

  if (changed && !result.includes(".create") && !result.includes(".merge") && !result.includes(".cx")) {
    result = result
      .replace(/import\s+\{[^}]*\b(sc|merge|cx|extend)\b[^}]*\}\s+from\s+["']traceless-style[^"']*["'];?\n?/g, "")
      .replace(/import\s+\*\s+as\s+\w+\s+from\s+["']traceless-style[^"']*["'];?\n?/g, "");
  }

  return { code: result, rules: globalRegistry.getAll(), changed, errors, warnings, customVariants: allCustom };
}