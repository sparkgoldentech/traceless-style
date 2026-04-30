/**
 * traceless-style — compiler/contrast-validator.ts
 *
 * Build-time WCAG-grounded contrast audit for `tl.create({...})` groups.
 * Catches unreadable text-on-background pairs, low-contrast UI components
 * (borders, outlines, focus rings), and gradient-clipped text in BOTH
 * light and dark modes — before they ship.
 *
 * ───────────────────────────────────────────────────────────────────
 * STANDARDS REFERENCE (cited verbatim in every diagnostic)
 * ───────────────────────────────────────────────────────────────────
 *
 * • WCAG 2.1 — Web Content Accessibility Guidelines 2.1 (W3C, 2018)
 *     https://www.w3.org/TR/WCAG21/
 *   - 1.4.3 Contrast (Minimum) — Level AA:
 *       4.5:1 normal text · 3:1 large text (≥18pt or ≥14pt bold)
 *       https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 *   - 1.4.6 Contrast (Enhanced) — Level AAA:
 *       7:1 normal · 4.5:1 large
 *       https://www.w3.org/WAI/WCAG21/Understanding/contrast-enhanced.html
 *   - 1.4.11 Non-text Contrast — Level AA:
 *       3:1 for UI components (borders, focus rings, icons, glyphs of
 *       form controls) and graphical objects required to understand
 *       content.
 *       https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
 *   - 1.4.1 Use of Color — Level A:
 *       Color is not the SOLE means of conveying information. Audited
 *       indirectly here as a "link must differ from body" advisory.
 *
 * • WCAG 2.2 — supersedes 2.1 (W3C, 2023). Same numeric thresholds.
 *     https://www.w3.org/TR/WCAG22/
 *   - 2.4.13 Focus Appearance — Level AAA:
 *       focus indicator ≥3:1 against adjacent surface, ≥2px area.
 *
 * • Section 508 (US federal) — adopts WCAG 2.0 AA wholesale via the
 *     2017 Refresh: §1194.22(c).
 *     https://www.section508.gov/manage/laws-and-policies/
 *
 * • EN 301 549 (European Union) — public-sector accessibility standard;
 *     references WCAG 2.1 AA as its normative baseline.
 *     https://www.etsi.org/deliver/etsi_en/301500_301599/301549/
 *
 * • APCA (Advanced Perceptual Contrast Algorithm) — proposed for the
 *     WCAG 3 working draft (NOT a normative requirement today). We
 *     compute and surface the Lc score in diagnostics for forward-compat
 *     reporting; pass/fail is still WCAG 2.1.
 *     https://github.com/Myndex/SAPC-APCA
 *
 * • CSS Color Module 4 — color spaces and alpha compositing math.
 *     https://www.w3.org/TR/css-color-4/
 *     §10 alpha compositing  (we composite translucent fg/bg against a
 *     configured page surface before measuring).
 *
 * ───────────────────────────────────────────────────────────────────
 * WHAT THIS VALIDATOR CATCHES
 * ───────────────────────────────────────────────────────────────────
 *
 * Within each `tl.create({ groupName: { ... } })` body:
 *
 *   A. TEXT CONTRAST (§1.4.3 / §1.4.6)
 *      – `color` vs `backgroundColor` in light mode (as written)
 *      – `color` vs `backgroundColor` in dark mode (`_dark` overrides
 *        OR auto-derived dark pair from `auto-dark.ts`)
 *      – `color: transparent` + `background-clip: text` → gradient-text
 *        path: validates EACH gradient stop against the page surface,
 *        AND samples N midpoints between adjacent stops (so a low-
 *        contrast trough between two acceptable stops gets flagged).
 *
 *   B. UI-COMPONENT CONTRAST (§1.4.11)
 *      – `borderColor` (and per-side variants) vs surface bg
 *      – `outlineColor` vs surface bg (focus rings — also §2.4.13)
 *      – `boxShadow` color vs surface (when used as a glow indicator)
 *      – `caretColor` vs the input's bg
 *      – `accentColor` vs adjacent bg
 *      – `textDecorationColor` vs adjacent bg (so underlines stay visible)
 *
 *   C. ADVISORY READOUTS
 *      – APCA Lc (forward-compat with WCAG 3)
 *      – Suggested replacement color in OKLCH-search form (preserves
 *        designer hue better than HSL search), or the existing HSL form
 *        depending on `suggestionSpace`.
 *
 * Translucent values are composited against the configured surface
 * color before measurement (CSS Color 4 §10).
 *
 * ───────────────────────────────────────────────────────────────────
 * CONFIGURATION  (`traceless-style.config.js`)
 * ───────────────────────────────────────────────────────────────────
 *
 *   contrast: {
 *     level:               "AA" | "AAA" | "off",   // default "AA"
 *     strict:              boolean,                // default true — AA fails build
 *     strictAAA:           boolean,                // default false
 *     surfaceLight:        "#fafafa",
 *     surfaceDark:         "#0a0a0f",
 *     largeTextSize:       18,                     // px threshold for "large text"
 *     auditUiComponents:   boolean,                // default true (1.4.11)
 *     auditPlaceholder:    boolean,                // default true (placeholders are text)
 *     gradientSampleCount: number,                 // default 5 — samples between adjacent stops
 *     suggestionSpace:     "hsl" | "oklch",        // default "oklch"
 *   }
 *
 * Per-group escape hatches inside any group body:
 *     _skipContrast: true                       // skip every check for this group
 *     _skipContrast: "light" | "dark" | "all"   // skip one mode (or all)
 *     _skipContrast: ["light", "ui"]            // skip light-mode + ui-component
 *
 * Categories: "all", "light", "dark", "text", "ui", "gradient", "placeholder".
 */

import * as wcag from "./wcag";
import type { StyleObject } from "./ast-parser";
import { deriveDarkColor } from "./auto-dark";
import { tokenRegistry } from "./tokens";
import { DIAGNOSTICS } from "./diagnostic-codes";

/* ── Configuration ────────────────────────────────────────────── */

export type ContrastLevel = "AA" | "AAA" | "off";
export type SuggestionSpace = "hsl" | "oklch";
export type SkipCategory = "all" | "light" | "dark" | "text" | "ui" | "gradient" | "placeholder";

export interface ContrastValidatorOptions {
  /** Highest standard to audit against. "off" disables the validator entirely. */
  level: ContrastLevel;
  /** Page-level surface colors used when compositing translucent values. */
  surfaceLight: string;
  surfaceDark:  string;
  /**
   * Pixel size threshold for "large text". WCAG defines this as ≥18pt
   * (24px) regular OR ≥14pt (18.66px) bold. We default to 18px which
   * covers both with a tiny safety margin and is easy to compare
   * against the `fontSize` declarations.
   */
  largeTextSize: number;
  /** When true, AA violations are reported with severity="error". When false, "warning". */
  strict: boolean;
  /**
   * When true, AAA violations are also errors. When false (default),
   * AAA violations are always warnings even in strict mode — AAA is
   * "best effort", not legally required, and many legitimate designs
   * (large hero gradients, decorative chips) would fail it.
   */
  strictAAA: boolean;
  /** Audit border/outline/box-shadow/caret/accent colors per §1.4.11. */
  auditUiComponents: boolean;
  /** Audit placeholder text declared via `&::placeholder` selectors. */
  auditPlaceholder: boolean;
  /**
   * Number of intermediate samples to take between adjacent gradient
   * stops when validating a clipped-text gradient. The default (5) is
   * a good balance — catches mid-gradient troughs without flagging
   * smooth transitions that briefly dip near (but never below) the
   * threshold. Set to 0 to only check declared stops.
   */
  gradientSampleCount: number;
  /** Color space used to find suggested replacement colors. */
  suggestionSpace: SuggestionSpace;
  /**
   * Audit a group's `color` against the backgrounds declared on SIBLING
   * groups in the same `tl.create({...})` call (in addition to the page
   * surface). Catches "the card body works on a white page but breaks
   * on the dark hero next to it" classes of bug.
   *
   * Off by default because not every sibling pair represents a real
   * placement — two unrelated components in one `tl.create` shouldn't
   * cross-validate. Turn on for design systems where every component
   * MUST stay readable across every declared surface.
   */
  auditPeerSurfaces: boolean;
}

export const DEFAULT_CONTRAST_OPTIONS: ContrastValidatorOptions = {
  level:               "AA",
  surfaceLight:        "#fafafa",
  surfaceDark:         "#0a0a0f",
  largeTextSize:       18,
  // STRICT BY DEFAULT — accessibility violations fail the build.
  // Override in `traceless-style.config.js` with `contrast: { strict: false }`
  // to demote them to warnings while migrating an older codebase.
  strict:              true,
  // AAA stays warn-only — AAA is best-effort enhancement, not legally
  // required, and many legitimate designs would fail it.
  strictAAA:           false,
  auditUiComponents:   true,
  auditPlaceholder:    true,
  gradientSampleCount: 5,
  suggestionSpace:     "oklch",
  // Off by default — false positives on unrelated siblings outweigh the
  // real-world catches in most projects. Design systems that DO want
  // every component to survive every surface should enable this.
  auditPeerSurfaces:   false,
};

/* ── Diagnostic shape ────────────────────────────────────────── */

export type ContrastStandard =
  | "WCAG 2.1 AA — 1.4.3"
  | "WCAG 2.1 AAA — 1.4.6"
  | "WCAG 2.1 AA — 1.4.11"
  | "WCAG 2.2 AA — 2.4.13";

export type ContrastCategory = "text" | "ui" | "gradient" | "placeholder" | "focus" | "image-bg";

export interface ContrastIssue {
  severity:    "error" | "warning";
  /** Human-readable description, includes a WCAG citation. */
  message:     string;
  /** Foreground property name and value as written. */
  fgProp:      string;
  fgValue:     string;
  /** Background property name and value as written. */
  bgProp:      string;
  bgValue:     string;
  /** Observed contrast ratio, 1.0 to 21.0. */
  ratio:       number;
  /** Required ratio for the standard being audited. */
  required:    number;
  /** Which standard the requirement comes from. */
  standard:    ContrastStandard;
  /** What KIND of element is failing. */
  category:    ContrastCategory;
  /** Light or dark mode. */
  mode:        "light" | "dark";
  /** Suggested replacement color for the foreground that would meet the threshold. */
  suggestion?: string;
  /** APCA Lc score (advisory, WCAG 3 working draft). Negative when text is lighter than bg. */
  apcaLc?:     number;
  /** Group key (e.g. `btn`). */
  group:       string;
  /** Source file. */
  file:        string;
  /** TLS#### canonical identifier — links into the docs and CI grep. */
  tlsCode?:    string;
  /** Documentation URL for click-through. */
  docsUrl?:    string;
}

/** Map a (standard + category) pair to its canonical TLS#### code. */
function lookupCode(standard: ContrastStandard, category: ContrastCategory): { code: string; docsUrl: string } {
  if (category === "image-bg") return { code: DIAGNOSTICS.CONTRAST_IMAGE_BG.code, docsUrl: DIAGNOSTICS.CONTRAST_IMAGE_BG.docsUrl };
  if (category === "gradient") return { code: DIAGNOSTICS.CONTRAST_GRADIENT.code, docsUrl: DIAGNOSTICS.CONTRAST_GRADIENT.docsUrl };
  if (category === "ui")       return { code: DIAGNOSTICS.CONTRAST_UI.code,       docsUrl: DIAGNOSTICS.CONTRAST_UI.docsUrl       };
  if (category === "focus")    return { code: DIAGNOSTICS.CONTRAST_FOCUS.code,    docsUrl: DIAGNOSTICS.CONTRAST_FOCUS.docsUrl    };
  if (standard === "WCAG 2.1 AAA — 1.4.6") return { code: DIAGNOSTICS.CONTRAST_TEXT_AAA.code, docsUrl: DIAGNOSTICS.CONTRAST_TEXT_AAA.docsUrl };
  return { code: DIAGNOSTICS.CONTRAST_TEXT_AA.code, docsUrl: DIAGNOSTICS.CONTRAST_TEXT_AA.docsUrl };
}

/* ── WCAG thresholds (centralized, sourced from wcag.ts) ─────── */

const T = wcag.WCAG_THRESHOLDS;

/* ── Helper: classify a font as "large text" per WCAG ────────── */

function isLargeText(obj: StyleObject, largeTextSize: number): boolean {
  const fontSize   = obj.fontSize;
  const fontWeight = obj.fontWeight;
  if (typeof fontSize !== "string" && typeof fontSize !== "number") return false;
  const px = parsePx(String(fontSize));
  if (px === null) return false;
  // ≥18pt (24px) regular always qualifies.
  if (px >= 24) return true;
  // ≥14pt (18.66px) AND bold (700+).
  const weight = parseWeight(fontWeight);
  if (px >= largeTextSize && weight >= 700) return true;
  return false;
}

/**
 * Extract a px value from a font-size string. Handles plain numbers
 * (`24px`, `1.5rem`) AND CSS math (`clamp(min, pref, max)`, `min(...)`,
 * `max(...)`) — for `clamp(48px, 8vw, 88px)` we take the MIN value
 * (48px), which is the worst case for "is this large text?". Returns
 * null when no parseable px is found.
 */
function parsePx(s: string): number | null {
  const t = s.trim();
  const direct = /^(-?[\d.]+)(px|rem|em)?$/.exec(t);
  if (direct) {
    const n = parseFloat(direct[1]);
    if (isNaN(n)) return null;
    return (direct[2] === "rem" || direct[2] === "em") ? n * 16 : n;
  }
  if (/^(?:clamp|min|max)\s*\(/i.test(t)) {
    const lengths: number[] = [];
    const re = /(-?[\d.]+)(px|rem|em)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const n = parseFloat(m[1]);
      if (isNaN(n)) continue;
      lengths.push(m[2] === "rem" || m[2] === "em" ? n * 16 : n);
    }
    if (lengths.length === 0) return null;
    return Math.min(...lengths);
  }
  return null;
}

function parseWeight(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 400;
  if (v === "bold")   return 700;
  if (v === "normal") return 400;
  const n = parseInt(v, 10);
  return isNaN(n) ? 400 : n;
}

/* ── Per-group escape hatch parsing ──────────────────────────── */

function getSkipCategories(obj: StyleObject): Set<SkipCategory> {
  const raw = (obj as Record<string, unknown>)._skipContrast;
  if (raw === undefined) return new Set();
  if (raw === true)      return new Set<SkipCategory>(["all"]);
  if (typeof raw === "string") return new Set<SkipCategory>([raw as SkipCategory]);
  if (Array.isArray(raw)) {
    const out = new Set<SkipCategory>();
    for (const v of raw) if (typeof v === "string") out.add(v as SkipCategory);
    return out;
  }
  return new Set();
}

function shouldSkip(skip: Set<SkipCategory>, mode: "light" | "dark", category: ContrastCategory): boolean {
  if (skip.has("all")) return true;
  if (skip.has(mode)) return true;
  if (skip.has(category as SkipCategory)) return true;
  return false;
}

/* ── Token resolution: var(--tl-XXX) → underlying color ──────── */

/**
 * Resolve a `var(--tl-XXX)` reference to its underlying color value,
 * via the process-singleton `tokenRegistry`. Returns the resolved
 * value (which `parseColor` can then handle), or the input unchanged
 * if it isn't a token reference, or null if the token isn't known.
 *
 * Token registry entries carry a `value` (light) and optional
 * `darkValue` — we pick whichever matches the audit mode so that a
 * theme-aware pair stays correct in both light and dark.
 *
 * Why a wrapper instead of teaching parseColor: parseColor lives in
 * wcag.ts which knows nothing about traceless-style internals; we
 * keep the dependency one-way (validator → tokens, never the
 * reverse). This also keeps the wcag module test-isolatable.
 */
function resolveTokenValue(value: string, mode: "light" | "dark"): string | null {
  const m = /^var\(\s*--([\w-]+)(?:\s*,[^)]+)?\s*\)$/.exec(value.trim());
  if (!m) return null;
  const varName = m[1];
  const entries = tokenRegistry.getTokens();
  const hit = entries.find(e => e.name === varName);
  if (!hit) return null;
  if (mode === "dark" && hit.darkValue) return hit.darkValue;
  return hit.value;
}

/**
 * Combined parse: resolves tokens FIRST (so contrast checks "see"
 * actual colors), then falls back to plain `parseColor` for literal
 * inputs. Returns null when nothing static is resolvable — caller
 * skips the check.
 */
function parseColorMaybeToken(value: string, mode: "light" | "dark"): wcag.RGBA | null {
  const resolved = resolveTokenValue(value, mode);
  if (resolved !== null) {
    const r = wcag.parseColor(resolved);
    if (r) return r;
  }
  return wcag.parseColor(value);
}

/* ── Core validation: check ONE group ─────────────────────────── */

/**
 * Validate one group's color/background pair in both modes plus its
 * UI-component declarations. Returns an array of issues (empty if all
 * clear). The caller (extractor) decides how to surface them — issues
 * carry severity already.
 *
 * `peerBackgrounds` is the list of `backgroundColor` declarations
 * found on SIBLING groups in the same `tl.create({...})` call. When
 * the current group sets `color` but doesn't declare its own bg, we
 * audit the foreground against EACH peer bg (in addition to the
 * configured page surface) and surface the worst-case violation. This
 * approximates "the component might be placed inside a card, a
 * section, a hero — make sure it stays readable on any of them."
 */
export function validateGroupContrast(
  obj:              StyleObject,
  group:            string,
  file:             string,
  options:          ContrastValidatorOptions = DEFAULT_CONTRAST_OPTIONS,
  peerBackgrounds?: { light: string[]; dark: string[] },
): ContrastIssue[] {
  if (options.level === "off") return [];
  const skip = getSkipCategories(obj);
  if (skip.has("all")) return [];

  const issues: ContrastIssue[] = [];
  const large = isLargeText(obj, options.largeTextSize);

  /* ── Z. IMAGE-BACKGROUND ADVISORY ──
     When a group sets `color` and has a `url(...)`-bearing background
     (image / SVG / data URI), we can't statically determine pixel-level
     contrast. Emit an advisory issue so the user knows to validate at
     runtime (axe-core, Pa11y) or to add a solid bg layer behind the text. */
  const bgAny = pickStr(obj, "background", "backgroundImage", "background-image");
  if (bgAny && /\burl\(/i.test(bgAny) && pickStr(obj, "color")) {
    issues.push({
      severity: "warning",
      message:
        `Image background detected on group "${group}" — text contrast cannot be ` +
        `verified statically. Add a solid background layer (e.g. semi-opaque overlay) ` +
        `behind the text, OR validate this surface at runtime with axe-core / Pa11y. ` +
        `Reference: WCAG 2.1 §1.4.3 — applies regardless of background medium.`,
      fgProp: "color", fgValue: pickStr(obj, "color") ?? "",
      bgProp: "background-image", bgValue: bgAny,
      ratio: 0, required: T.AA_NORMAL,
      standard: "WCAG 2.1 AA — 1.4.3",
      category: "image-bg",
      mode: "light",
      group, file,
    });
  }

  /* ── A. GRADIENT-TEXT: `color:transparent` + `background-clip:text` ── */
  // The visible text IS the background gradient, clipped to the glyph
  // shapes. Validate every declared stop AND a configurable number of
  // midpoints between adjacent stops — a single low-contrast trough
  // makes a chunk of the text unreadable, even if the declared stops
  // are individually fine.
  const isGradientText = (
    pickStr(obj, "color") === "transparent" &&
    (pickStr(obj, "backgroundClip", "background-clip") === "text"
     || pickStr(obj, "webkitBackgroundClip", "-webkit-background-clip") === "text")
  );
  if (isGradientText && !skip.has("gradient")) {
    const bg = pickStr(obj, "background", "backgroundImage", "background-image");
    if (bg && /linear-gradient|radial-gradient|conic-gradient/.test(bg)) {
      if (!shouldSkip(skip, "light", "gradient")) {
        issues.push(...validateGradient(bg, options.surfaceLight, "light", large, options, group, file));
      }
      const darkBg = (obj._dark as Record<string, unknown> | undefined)?.background
                  ?? (obj._dark as Record<string, unknown> | undefined)?.backgroundImage;
      const darkGradient = typeof darkBg === "string" ? darkBg : bg;
      if (!shouldSkip(skip, "dark", "gradient")) {
        issues.push(...validateGradient(darkGradient, options.surfaceDark, "dark", large, options, group, file));
      }
    }
  }

  /* ── B. TEXT CONTRAST (1.4.3 / 1.4.6) — light mode ── */
  const lightFg = pickStr(obj, "color");
  const lightBg = pickStr(obj, "backgroundColor", "background-color");
  if (lightFg && lightBg && !shouldSkip(skip, "light", "text")) {
    const issue = checkPair(
      lightFg, lightBg,
      "color", lookupBgPropName(obj),
      "light", "text",
      options.surfaceLight,
      large,
      options,
      group, file,
    );
    if (issue) issues.push(issue);
  } else if (lightFg && !lightBg && !shouldSkip(skip, "light", "text")) {
    // No own bg — audit against page surface AND (when enabled) each
    // peer bg, report worst case so designers learn the floor across
    // the surface lattice.
    const candidates = uniq([
      options.surfaceLight,
      ...(options.auditPeerSurfaces ? (peerBackgrounds?.light ?? []) : []),
    ]);
    let worst: ContrastIssue | null = null;
    for (const candidate of candidates) {
      const isPeer = candidate !== options.surfaceLight;
      const issue = checkPair(
        lightFg, candidate,
        "color", isPeer ? "peer-group bg" : "page surface",
        "light", "text",
        options.surfaceLight,
        large,
        options,
        group, file,
      );
      if (issue && (!worst || issue.ratio < worst.ratio)) worst = issue;
    }
    if (worst) issues.push(worst);
  }

  /* ── C. TEXT CONTRAST — dark mode ── */
  const darkBlock = obj._dark as Record<string, unknown> | undefined;
  if (typeof darkBlock === "object" && darkBlock !== null) {
    const darkFg = (typeof darkBlock.color === "string" ? darkBlock.color : null)
                ?? lightFg;
    const darkBg = (typeof darkBlock.backgroundColor === "string" ? darkBlock.backgroundColor : null)
                ?? (typeof (darkBlock as Record<string, unknown>)["background-color"] === "string"
                     ? (darkBlock as Record<string, unknown>)["background-color"] as string
                     : null)
                ?? lightBg;
    if (darkFg && darkBg && !shouldSkip(skip, "dark", "text")) {
      const issue = checkPair(
        darkFg, darkBg,
        "color", lookupBgPropName(obj),
        "dark", "text",
        options.surfaceDark,
        large,
        options,
        group, file,
      );
      if (issue) issues.push(issue);
    }
  } else if (lightFg && lightBg && !shouldSkip(skip, "dark", "text")) {
    const autoFg = deriveDarkColor(lightFg) ?? lightFg;
    const autoBg = deriveDarkColor(lightBg) ?? lightBg;
    const issue = checkPair(
      autoFg, autoBg,
      "color (auto-dark)", lookupBgPropName(obj) + " (auto-dark)",
      "dark", "text",
      options.surfaceDark,
      large,
      options,
      group, file,
    );
    if (issue) issues.push(issue);
  } else if (lightFg && !lightBg && !shouldSkip(skip, "dark", "text")) {
    // No own bg AND no _dark override — audit auto-dark fg against page
    // surface AND each peer bg's auto-dark equivalent. Catches cases like
    // a card whose `color` is fine on white but loses contrast against a
    // dark sibling bg in the same `tl.create`.
    const autoFg = deriveDarkColor(lightFg) ?? lightFg;
    const candidates = uniq([
      options.surfaceDark,
      ...(options.auditPeerSurfaces ? (peerBackgrounds?.dark ?? []) : []),
    ]);
    let worst: ContrastIssue | null = null;
    for (const candidate of candidates) {
      const isPeer = candidate !== options.surfaceDark;
      const issue = checkPair(
        autoFg, candidate,
        "color (auto-dark)", isPeer ? "peer-group bg" : "page surface",
        "dark", "text",
        options.surfaceDark,
        large,
        options,
        group, file,
      );
      if (issue && (!worst || issue.ratio < worst.ratio)) worst = issue;
    }
    if (worst) issues.push(worst);
  }

  /* ── D. UI-COMPONENT CONTRAST (§1.4.11) ── */
  if (options.auditUiComponents) {
    issues.push(...validateUiComponents(obj, "light", options.surfaceLight, options, skip, group, file));
    if (typeof darkBlock === "object" && darkBlock !== null) {
      issues.push(...validateUiComponents(
        darkBlock as StyleObject, "dark", options.surfaceDark, options, skip, group, file
      ));
    }
  }

  /* ── E. PLACEHOLDER text: any nested `&::placeholder` selector ── */
  if (options.auditPlaceholder && !skip.has("placeholder")) {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== "object" || v === null) continue;
      if (!/(::placeholder|:placeholder-shown)/.test(k)) continue;
      const phFg = pickStr(v as StyleObject, "color");
      const phBg = pickStr(obj, "backgroundColor", "background-color")
                ?? options.surfaceLight;
      if (phFg && !shouldSkip(skip, "light", "placeholder")) {
        const issue = checkPair(
          phFg, phBg,
          `${k} > color`, lookupBgPropName(obj) || "page surface",
          "light", "placeholder",
          options.surfaceLight,
          large,
          options,
          group, file,
        );
        if (issue) issues.push(issue);
      }
    }
  }

  return issues;
}

/* ── UI-COMPONENT validation (§1.4.11) ───────────────────────── */

/**
 * Validate borders, outlines, box-shadow color, caret-color,
 * accent-color, text-decoration-color against the surrounding bg.
 * §1.4.11 requires ≥3:1 between UI components and their adjacent
 * surface so they remain identifiable to low-vision users.
 */
function validateUiComponents(
  obj:     StyleObject,
  mode:    "light" | "dark",
  surface: string,
  options: ContrastValidatorOptions,
  skip:    Set<SkipCategory>,
  group:   string,
  file:    string,
): ContrastIssue[] {
  if (shouldSkip(skip, mode, "ui")) return [];

  const out: ContrastIssue[] = [];
  const bg = pickStr(obj, "backgroundColor", "background-color") ?? surface;

  /** Properties that name colors of UI affordances. Each gets checked
   *  against the group's bg (or the page surface if no bg is set). */
  const uiProps: { key: string; label: string; category: ContrastCategory; threshold: number; standard: ContrastStandard; }[] = [
    { key: "borderColor",         label: "borderColor",         category: "ui",    threshold: T.AA_UI_COMPONENT, standard: "WCAG 2.1 AA — 1.4.11" },
    { key: "border-color",        label: "border-color",        category: "ui",    threshold: T.AA_UI_COMPONENT, standard: "WCAG 2.1 AA — 1.4.11" },
    { key: "borderTopColor",      label: "borderTopColor",      category: "ui",    threshold: T.AA_UI_COMPONENT, standard: "WCAG 2.1 AA — 1.4.11" },
    { key: "borderRightColor",    label: "borderRightColor",    category: "ui",    threshold: T.AA_UI_COMPONENT, standard: "WCAG 2.1 AA — 1.4.11" },
    { key: "borderBottomColor",   label: "borderBottomColor",   category: "ui",    threshold: T.AA_UI_COMPONENT, standard: "WCAG 2.1 AA — 1.4.11" },
    { key: "borderLeftColor",     label: "borderLeftColor",     category: "ui",    threshold: T.AA_UI_COMPONENT, standard: "WCAG 2.1 AA — 1.4.11" },
    { key: "outlineColor",        label: "outlineColor",        category: "focus", threshold: T.FOCUS_INDICATOR, standard: "WCAG 2.2 AA — 2.4.13" },
    { key: "outline-color",       label: "outline-color",       category: "focus", threshold: T.FOCUS_INDICATOR, standard: "WCAG 2.2 AA — 2.4.13" },
    { key: "caretColor",          label: "caretColor",          category: "ui",    threshold: T.AA_UI_COMPONENT, standard: "WCAG 2.1 AA — 1.4.11" },
    { key: "caret-color",         label: "caret-color",         category: "ui",    threshold: T.AA_UI_COMPONENT, standard: "WCAG 2.1 AA — 1.4.11" },
    { key: "accentColor",         label: "accentColor",         category: "ui",    threshold: T.AA_UI_COMPONENT, standard: "WCAG 2.1 AA — 1.4.11" },
    { key: "accent-color",        label: "accent-color",        category: "ui",    threshold: T.AA_UI_COMPONENT, standard: "WCAG 2.1 AA — 1.4.11" },
    { key: "textDecorationColor", label: "textDecorationColor", category: "ui",    threshold: T.AA_UI_COMPONENT, standard: "WCAG 2.1 AA — 1.4.11" },
    { key: "text-decoration-color",label:"text-decoration-color",category: "ui",    threshold: T.AA_UI_COMPONENT, standard: "WCAG 2.1 AA — 1.4.11" },
  ];

  for (const p of uiProps) {
    const v = (obj as Record<string, unknown>)[p.key];
    if (typeof v !== "string" || !v) continue;
    const issue = checkUiPair(
      v, bg,
      p.label, lookupBgPropName(obj) || "page surface",
      mode, p.category, p.threshold, p.standard,
      surface, options, group, file,
    );
    if (issue) out.push(issue);
  }

  // box-shadow: check first color token (most box-shadows are "<offsets> <color>").
  // Heuristic — only flag shadows that PLAUSIBLY identify a UI component:
  //   • spread > 0 OR inset present  → ring / outline / inset border  → CHECK
  //   • otherwise (blur > 0, spread = 0)                              → soft drop-shadow / glow → DECORATIVE, skip
  // WCAG 1.4.11 applies to "visual information required to identify UI
  // components" — a soft drop-shadow under a card carries no identifying
  // information, only depth. Flagging it produces noise without protecting
  // anyone, and the user can still opt-in via `_skipContrast` semantics
  // for the rare case where the shadow IS load-bearing.
  const boxShadow = (obj as Record<string, unknown>).boxShadow;
  if (typeof boxShadow === "string" && boxShadow) {
    const isLoadBearing = isInformationalShadow(boxShadow);
    if (isLoadBearing) {
      const color = extractFirstColor(boxShadow);
      if (color) {
        const issue = checkUiPair(
          color, bg,
          "boxShadow color", lookupBgPropName(obj) || "page surface",
          mode, "ui", T.AA_UI_COMPONENT, "WCAG 2.1 AA — 1.4.11",
          surface, options, group, file,
        );
        if (issue) out.push(issue);
      }
    }
  }

  return out;
}

function checkUiPair(
  fgValue: string, bgValue: string,
  fgProp:  string, bgProp:  string,
  mode:    "light" | "dark",
  category: ContrastCategory,
  required: number,
  standard: ContrastStandard,
  surface: string,
  options: ContrastValidatorOptions,
  group:   string,
  file:    string,
): ContrastIssue | null {
  const fgRgba = parseColorMaybeToken(fgValue, mode);
  const bgRgba = parseColorMaybeToken(bgValue, mode);
  if (!fgRgba || !bgRgba) return null;
  if (fgRgba.a === 0) return null;

  const surfaceRgba = wcag.parseColor(surface) ?? { r: 0, g: 0, b: 0, a: 1 };
  const compFg = fgRgba.a < 1 ? wcag.composite(fgRgba, surfaceRgba) : fgRgba;
  const compBg = bgRgba.a < 1 ? wcag.composite(bgRgba, surfaceRgba) : bgRgba;
  const ratio  = wcag.contrastRatio(compFg, compBg);
  if (ratio >= required) return null;

  const suggested = adjust(compFg, compBg, required, options.suggestionSpace);
  const apca      = wcag.apcaLc(compFg, compBg);
  const bgDisplay = bgRgba.a === 0
    ? `${bgValue} (inherits page surface "${surface}")`
    : bgValue;

  return {
    severity: options.strict ? "error" : "warning",
    message:
      `Insufficient UI contrast — ${mode} mode: ${fgProp} "${fgValue}" against ` +
      `${bgProp} "${bgDisplay}" measures ${ratio.toFixed(2)}:1. ` +
      `${standard} requires ≥${required}:1 so the affordance stays distinguishable. ` +
      `APCA Lc ${apca.toFixed(0)} (advisory). ` +
      `Suggestion: change ${fgProp} to "${wcag.formatColor(suggested)}".`,
    fgProp, fgValue, bgProp, bgValue,
    ratio, required, standard,
    category, mode,
    suggestion: wcag.formatColor(suggested),
    apcaLc: apca,
    group, file,
  };
}

/**
 * Decide whether a `box-shadow` declaration carries WCAG-relevant
 * information (focus ring, inset border, outline-via-shadow), as
 * opposed to being a decorative drop-shadow / glow.
 *
 * Returns TRUE when the first shadow layer:
 *   • is `inset`  (drawn inside the box; commonly used for borders), OR
 *   • has a non-zero positive SPREAD value  (the "ring" radius parameter)
 *
 * Returns FALSE for the soft drop-shadow / outer-glow pattern (positive
 * blur, zero spread). Those are decorative — they don't carry information
 * required to identify the component, so WCAG 1.4.11 doesn't apply.
 *
 * Multi-layer shadows: we only inspect the FIRST layer because that's
 * the one most likely to be the "identifying" shadow when one exists;
 * subsequent layers tend to be additional depth cues.
 */
function isInformationalShadow(boxShadow: string): boolean {
  const firstLayer = boxShadow.split(/,(?![^()]*\))/)[0].trim();
  if (/\binset\b/i.test(firstLayer)) return true;
  // Strip the color first so leading lengths are easy to parse.
  const stripped = firstLayer
    .replace(/#[0-9a-fA-F]{3,8}\b/, "")
    .replace(/\b(?:rgba?|hsla?|hwb|oklab|oklch)\([^)]+\)/i, "")
    .trim();
  // Tokens are length values: <offsetX> <offsetY> [<blur> [<spread>]]
  const lengths = stripped.split(/\s+/).filter(t => /^-?[\d.]+(px|em|rem)?$/.test(t));
  if (lengths.length < 4) return false;  // no spread provided → not a ring
  const spread = parseFloat(lengths[3]);
  return !isNaN(spread) && spread > 0;
}

function extractFirstColor(boxShadow: string): string | null {
  // box-shadow can be "<inset>? <offsetX> <offsetY> <blur>? <spread>? <color>? [, …]"
  // We pessimistically extract the FIRST recognized color token from the
  // first comma-separated layer.
  const firstLayer = boxShadow.split(/,(?![^()]*\))/)[0].trim();
  // Try hex.
  const hexM = /#[0-9a-fA-F]{3,8}\b/.exec(firstLayer);
  if (hexM) return hexM[0];
  // Try rgb/rgba/hsl/hsla/hwb/oklch/oklab.
  const fnM = /\b(?:rgba?|hsla?|hwb|oklab|oklch)\([^)]+\)/i.exec(firstLayer);
  if (fnM) return fnM[0];
  // Try a named color (last whitespace-token that parses).
  const tokens = firstLayer.split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (wcag.parseColor(tokens[i])) return tokens[i];
  }
  return null;
}

/* ── GRADIENT validation (declared stops + sampled midpoints) ── */

function validateGradient(
  gradient: string,
  surface:  string,
  mode:     "light" | "dark",
  large:    boolean,
  options:  ContrastValidatorOptions,
  group:    string,
  file:     string,
): ContrastIssue[] {
  const stops = extractGradientStops(gradient);
  if (stops.length === 0) return [];
  const surfaceRgba = wcag.parseColor(surface) ?? { r: 0, g: 0, b: 0, a: 1 };
  const aaThreshold = large ? T.AA_LARGE : T.AA_NORMAL;
  const out: ContrastIssue[] = [];

  // Build a flat list of test colors: declared stops + midpoint samples.
  const testPoints: { color: wcag.RGBA; label: string; original: string; }[] = [];
  for (let i = 0; i < stops.length; i++) {
    const sRgba = wcag.parseColor(stops[i]);
    if (!sRgba) continue;
    testPoints.push({ color: sRgba, label: `stop[${i}] "${stops[i]}"`, original: stops[i] });

    // Sample N midpoints between this stop and the next.
    if (i < stops.length - 1 && options.gradientSampleCount > 0) {
      const next = wcag.parseColor(stops[i + 1]);
      if (!next) continue;
      for (let j = 1; j <= options.gradientSampleCount; j++) {
        const t = j / (options.gradientSampleCount + 1);
        testPoints.push({
          color: {
            r: sRgba.r + (next.r - sRgba.r) * t,
            g: sRgba.g + (next.g - sRgba.g) * t,
            b: sRgba.b + (next.b - sRgba.b) * t,
            a: sRgba.a + (next.a - sRgba.a) * t,
          },
          label: `interpolated midpoint ${(t * 100).toFixed(0)}% between stop[${i}] and stop[${i + 1}]`,
          original: `mix of ${stops[i]} → ${stops[i + 1]} @ ${(t * 100).toFixed(0)}%`,
        });
      }
    }
  }

  for (const point of testPoints) {
    if (point.color.a === 0) continue;
    const compFg = point.color.a < 1 ? wcag.composite(point.color, surfaceRgba) : point.color;
    const ratio  = wcag.contrastRatio(compFg, surfaceRgba);
    if (ratio < aaThreshold) {
      const suggested = adjust(compFg, surfaceRgba, aaThreshold, options.suggestionSpace);
      const apca      = wcag.apcaLc(compFg, surfaceRgba);
      out.push({
        severity: options.strict ? "error" : "warning",
        message:
          `Gradient-text ${point.label} measures ${ratio.toFixed(2)}:1 against ` +
          `the ${mode}-mode page surface "${surface}". ` +
          `WCAG 2.1 §1.4.3 (Level AA) requires ≥${aaThreshold}:1 for ${large ? "large" : "normal"} text. ` +
          `When using \`background-clip:text\`, every gradient pixel fills part of a glyph — a single ` +
          `low-contrast region renders that slice unreadable. APCA Lc ${apca.toFixed(0)} (advisory). ` +
          `Suggestion: replace with "${wcag.formatColor(suggested)}" or move outside the visible portion.`,
        fgProp:   "background gradient",
        fgValue:  point.original,
        bgProp:   "page surface (effective bg via background-clip:text)",
        bgValue:  surface,
        ratio, required: aaThreshold,
        standard: "WCAG 2.1 AA — 1.4.3",
        category: "gradient",
        mode,
        suggestion: wcag.formatColor(suggested),
        apcaLc: apca,
        group, file,
      });
    }
  }
  return out;
}

/**
 * Extract color stops from a gradient string. Handles linear / radial /
 * conic gradients with hex / rgb / rgba / hsl / hwb / oklch / named
 * colors. Strips percentage / angle hints — we only need the colors.
 */
function extractGradientStops(gradient: string): string[] {
  const m = /(?:linear|radial|conic)-gradient\(\s*([^]*)\s*\)$/i.exec(gradient.trim());
  if (!m) return [];
  const args = m[1];
  const parts: string[] = [];
  let depth = 0;
  let buf   = "";
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (c === "," && depth === 0) {
      parts.push(buf.trim());
      buf = "";
    } else {
      buf += c;
    }
  }
  if (buf.trim()) parts.push(buf.trim());

  const stops: string[] = [];
  for (const p of parts) {
    if (/^(to\s|[\d.]+(?:deg|rad|turn|grad)$)/i.test(p)) continue;
    if (/^(circle|ellipse|closest|farthest)/i.test(p))  continue;
    if (/^from\s/i.test(p))                             continue;  // conic-gradient angle prefix
    if (/^at\s/i.test(p))                               continue;  // radial-gradient position
    const colorPart = p.replace(/\s+[\d.]+%?\s*$/, "").trim();
    // CSS Color 4 multi-stop syntax: "color 0% 50%" — first whitespace-token
    // that parses as a color wins.
    const tokens = splitTopLevel(colorPart, " ");
    for (const tok of tokens) {
      if (wcag.parseColor(tok)) {
        stops.push(tok);
        break;
      }
    }
  }
  return stops;
}

/** Split on a single-character separator at depth-0 (skips parens). */
function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, buf = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (c === sep && depth === 0) { if (buf) out.push(buf); buf = ""; }
    else buf += c;
  }
  if (buf) out.push(buf);
  return out;
}

/* ── Pair check + suggestion adjuster ─────────────────────────── */

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function pickStr(obj: StyleObject, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (typeof v === "string") return v;
  }
  return null;
}

function lookupBgPropName(obj: StyleObject): string {
  if (Object.prototype.hasOwnProperty.call(obj, "backgroundColor")) return "backgroundColor";
  if (Object.prototype.hasOwnProperty.call(obj, "background-color")) return "background-color";
  return "backgroundColor";
}

function adjust(fg: wcag.RGBA, bg: wcag.RGBA, target: number, space: SuggestionSpace): wcag.RGBA {
  return space === "oklch"
    ? wcag.adjustForContrastOklch(fg, bg, target)
    : wcag.adjustForContrast(fg, bg, target);
}

/**
 * Check one resolved pair (fg + bg) and return an issue when contrast
 * fails the configured level. Both colors get composited against the
 * configured surface before measurement (CSS Color 4 §10).
 */
function checkPair(
  fgValue:  string,
  bgValue:  string,
  fgProp:   string,
  bgProp:   string,
  mode:     "light" | "dark",
  category: ContrastCategory,
  surface:  string,
  large:    boolean,
  options:  ContrastValidatorOptions,
  group:    string,
  file:     string,
): ContrastIssue | null {
  const fgRgba = parseColorMaybeToken(fgValue, mode);
  const bgRgba = parseColorMaybeToken(bgValue, mode);
  if (!fgRgba || !bgRgba) return null;
  if (fgRgba.a === 0) return null;  // invisible foreground — not a contrast issue

  const surfaceRgba = wcag.parseColor(surface) ?? { r: 0, g: 0, b: 0, a: 1 };
  const compFg = fgRgba.a < 1 ? wcag.composite(fgRgba, surfaceRgba) : fgRgba;
  const compBg = bgRgba.a < 1 ? wcag.composite(bgRgba, surfaceRgba) : bgRgba;
  const ratio  = wcag.contrastRatio(compFg, compBg);

  // When user wrote `background-color: transparent` they're inheriting
  // the page surface; surface that fact in the diagnostic.
  const bgDisplay = bgRgba.a === 0
    ? `${bgValue} (inherits page surface "${surface}")`
    : bgValue;

  const aaThreshold  = large ? T.AA_LARGE  : T.AA_NORMAL;
  const aaaThreshold = large ? T.AAA_LARGE : T.AAA_NORMAL;
  const apca = wcag.apcaLc(compFg, compBg);

  // AA failure → always reported.
  if (ratio < aaThreshold) {
    const suggested = adjust(compFg, compBg, aaThreshold, options.suggestionSpace);
    return {
      severity: options.strict ? "error" : "warning",
      message:
        `Insufficient contrast — ${mode} mode: ${fgProp} "${fgValue}" on ` +
        `${bgProp} "${bgDisplay}" measures ${ratio.toFixed(2)}:1. ` +
        `WCAG 2.1 §1.4.3 (Level AA) requires ≥${aaThreshold}:1 for ` +
        `${large ? "large" : "normal"} text. ` +
        `APCA Lc ${apca.toFixed(0)} (advisory; WCAG 3 working draft). ` +
        `Suggestion: change ${fgProp} to "${wcag.formatColor(suggested)}" ` +
        `for ${aaThreshold.toFixed(1)}:1 contrast.`,
      fgProp, fgValue, bgProp, bgValue,
      ratio, required: aaThreshold,
      standard: "WCAG 2.1 AA — 1.4.3",
      category,
      mode,
      suggestion: wcag.formatColor(suggested),
      apcaLc: apca,
      group, file,
    };
  }

  // AAA failure (only when level === "AAA").
  if (options.level === "AAA" && ratio < aaaThreshold) {
    const suggested = adjust(compFg, compBg, aaaThreshold, options.suggestionSpace);
    return {
      severity: options.strictAAA ? "error" : "warning",
      message:
        `Below WCAG AAA — ${mode} mode: ${fgProp} "${fgValue}" on ` +
        `${bgProp} "${bgDisplay}" measures ${ratio.toFixed(2)}:1. ` +
        `WCAG 2.1 §1.4.6 (Level AAA) requires ≥${aaaThreshold}:1 for ` +
        `${large ? "large" : "normal"} text. AAA is best-effort, not legally required. ` +
        `APCA Lc ${apca.toFixed(0)} (advisory). ` +
        `Suggestion: change ${fgProp} to "${wcag.formatColor(suggested)}".`,
      fgProp, fgValue, bgProp, bgValue,
      ratio, required: aaaThreshold,
      standard: "WCAG 2.1 AAA — 1.4.6",
      category,
      mode,
      suggestion: wcag.formatColor(suggested),
      apcaLc: apca,
      group, file,
    };
  }

  return null;
}

/* ── Diagnostic formatter ─────────────────────────────────────── */

/**
 * Format a list of issues into a multi-line block the CLI can println.
 * Includes the standards-citation banner and a per-issue readout with
 * APCA Lc when available.
 */
export function formatContrastIssues(issues: ContrastIssue[]): string {
  if (issues.length === 0) return "";
  const errors   = issues.filter(i => i.severity === "error").length;
  const warnings = issues.filter(i => i.severity === "warning").length;
  const lines: string[] = [
    "",
    "╔══════════════════════════════════════════════════════════════════╗",
    `║  traceless-style contrast — ${pad(errors)} error${errors === 1 ? " " : "s"}  ·  ${pad(warnings)} warning${warnings === 1 ? " " : "s"}            ║`,
    "╚══════════════════════════════════════════════════════════════════╝",
    "  Standards: WCAG 2.1 §1.4.3 / §1.4.6 / §1.4.11 · WCAG 2.2 §2.4.13",
    "             Section 508 (US) · EN 301 549 (EU) · APCA (advisory)",
    "",
  ];
  for (const i of issues) {
    // Backfill the canonical TLS#### code + docs URL so every issue
    // — including ones that predate the codes registry — surfaces a
    // stable identifier for grep, suppression directives, and click-
    // through docs. Same shape big-tech compilers use (TS2304, BABEL5005).
    if (!i.tlsCode || !i.docsUrl) {
      const lk = lookupCode(i.standard, i.category);
      if (!i.tlsCode) i.tlsCode = lk.code;
      if (!i.docsUrl) i.docsUrl = lk.docsUrl;
    }
    const sigil = i.severity === "error" ? "✗" : "⚠";
    lines.push(`  ${sigil} [${i.tlsCode} · ${i.standard}] ${i.file} — ${i.group} (${i.category}, ${i.mode})`);
    lines.push(`    ${i.message}`);
    if (i.docsUrl) lines.push(`    docs: ${i.docsUrl}`);
    lines.push("");
  }
  if (errors > 0) {
    lines.push(
      `Fix ${errors} contrast error${errors === 1 ? "" : "s"} before continuing, ` +
      `or set \`contrast.strict: false\` in traceless-style.config.js to demote ` +
      `them to warnings (NOT recommended for production builds — accessibility ` +
      `is non-optional and required by Section 508 / EN 301 549).`
    );
    lines.push("");
  }
  return lines.join("\n");
}

function pad(n: number): string {
  return String(n).padStart(2, " ");
}
