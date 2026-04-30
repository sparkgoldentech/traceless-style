/**
 * traceless-style — compiler/auto-dark.ts
 *
 * Automatic dark-mode color derivation. The compiler asks `deriveDarkColor`
 * for every color-valued style (color, background, border, etc.) the user
 * writes in `tl.create()`. If the value parses cleanly as a color, we
 * return a derived dark-mode variant; if not (gradients, CSS vars,
 * `currentColor`, `transparent`, `none`), we return null and the caller
 * skips auto-dark for that declaration.
 *
 * Algorithm:
 *   1. parse → RGB
 *   2. RGB → HSL
 *   3. invert lightness via curve `L' = 0.92 - 0.84 * L`
 *      • L=0   (black) → L'=0.92 (near-white)
 *      • L=1   (white) → L'=0.08 (near-black)
 *      • L=0.5         → L'=0.5  (mid stays mid)
 *      The curve avoids pure-black/pure-white extremes that look harsh,
 *      while preserving relative contrast and hue.
 *   4. HSL → RGB → hex
 *
 * Why HSL not OKLCH? OKLCH gives perceptually-uniform inversion but
 * requires a few hundred lines of color-space math and gamut clipping.
 * HSL is good enough for v1 — the dark variants look balanced for typical
 * UI palettes. Future iteration can swap to OKLCH internally without API
 * changes.
 *
 * Pure: no I/O, no globals, all functions deterministic.
 */

import * as wcag from "./wcag";

const NAMED_COLORS: Record<string, [number, number, number]> = {
  // 16 web-safe + a few common extras. Anything else falls through to "not
  // a parseable color" and skips auto-dark, which is the safe default.
  black:        [0,   0,   0],
  white:        [255, 255, 255],
  red:          [255, 0,   0],
  green:        [0,   128, 0],
  blue:         [0,   0,   255],
  yellow:       [255, 255, 0],
  cyan:         [0,   255, 255],
  magenta:      [255, 0,   255],
  silver:       [192, 192, 192],
  gray:         [128, 128, 128],
  grey:         [128, 128, 128],
  maroon:       [128, 0,   0],
  olive:        [128, 128, 0],
  purple:       [128, 0,   128],
  teal:         [0,   128, 128],
  navy:         [0,   0,   128],
  orange:       [255, 165, 0],
  pink:         [255, 192, 203],
  brown:        [165, 42,  42],
  indigo:       [75,  0,   130],
  violet:       [238, 130, 238],
  gold:         [255, 215, 0],
  beige:        [245, 245, 220],
};

/** RGBA tuple — 0–255 channels, alpha 0..1 (defaults to 1 when input is opaque). */
export type RGBA = [number, number, number, number];

/** Parse a CSS color value into a 0–255 RGBA tuple, or null if non-derivable.
 *  Alpha defaults to 1 (fully opaque). Translucent inputs preserve their
 *  alpha channel through the auto-dark inverter, so a subtle frosted-glass
 *  overlay like `rgba(255,255,255,0.05)` round-trips correctly to a dark
 *  variant of the same translucency rather than a solid block. */
export function parseColor(input: string): RGBA | null {
  const v = input.trim().toLowerCase();
  if (!v) return null;

  // Skip values that aren't simple colors — auto-dark should leave them alone.
  if (
    v === "transparent" || v === "currentcolor" || v === "inherit" ||
    v === "initial"     || v === "unset"        || v === "revert" ||
    v === "none"
  ) return null;
  if (v.includes("var(") || v.includes("calc(")) return null;
  if (v.includes("gradient(")) return null;

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
  if (v.startsWith("#")) return parseHex(v);

  // Named color
  if (NAMED_COLORS[v]) {
    const [r, g, b] = NAMED_COLORS[v];
    return [r, g, b, 1];
  }

  // rgb()/rgba() — both legacy comma-separated and modern space-separated.
  if (v.startsWith("rgb")) return parseRgb(v);

  // hsl()/hsla()
  if (v.startsWith("hsl")) return parseHsl(v);

  return null;
}

function parseHex(s: string): RGBA | null {
  const hex = s.slice(1);
  if (hex.length === 3 || hex.length === 4) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
    if ([r, g, b].some(Number.isNaN) || Number.isNaN(a)) return null;
    return [r, g, b, a];
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].some(Number.isNaN) || Number.isNaN(a)) return null;
    return [r, g, b, a];
  }
  return null;
}

function parseRgb(s: string): RGBA | null {
  const m = s.match(/^rgba?\s*\(\s*([^)]+)\s*\)$/);
  if (!m) return null;
  // Support both "r, g, b[, a]" and "r g b [/ a]"
  const parts = m[1].split(/[,\s/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const r = parseRgbComponent(parts[0]);
  const g = parseRgbComponent(parts[1]);
  const b = parseRgbComponent(parts[2]);
  if ([r, g, b].some(c => c === null)) return null;
  let a = 1;
  if (parts.length >= 4) {
    const ap = parseAlphaComponent(parts[3]);
    if (ap === null) return null;
    a = ap;
  }
  return [r as number, g as number, b as number, a];
}

function parseAlphaComponent(s: string): number | null {
  const t = s.trim();
  if (t.endsWith("%")) {
    const n = parseFloat(t);
    if (Number.isNaN(n)) return null;
    return Math.max(0, Math.min(1, n / 100));
  }
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : Math.max(0, Math.min(1, n));
}

function parseRgbComponent(s: string): number | null {
  const t = s.trim();
  if (t.endsWith("%")) {
    const n = parseFloat(t);
    if (Number.isNaN(n)) return null;
    return Math.round((n / 100) * 255);
  }
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : Math.max(0, Math.min(255, Math.round(n)));
}

function parseHsl(s: string): RGBA | null {
  const m = s.match(/^hsla?\s*\(\s*([^)]+)\s*\)$/);
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const h = parseHueComponent(parts[0]);
  const s2 = parsePercentageComponent(parts[1]);
  const l = parsePercentageComponent(parts[2]);
  if (h === null || s2 === null || l === null) return null;
  let a = 1;
  if (parts.length >= 4) {
    const ap = parseAlphaComponent(parts[3]);
    if (ap === null) return null;
    a = ap;
  }
  const [r, g, b] = hslToRgb(h, s2, l);
  return [r, g, b, a];
}

function parseHueComponent(s: string): number | null {
  const t = s.trim().replace(/deg$/, "");
  const n = parseFloat(t);
  if (Number.isNaN(n)) return null;
  // Normalize to [0, 360)
  return ((n % 360) + 360) % 360;
}

function parsePercentageComponent(s: string): number | null {
  const t = s.trim();
  if (!t.endsWith("%")) {
    // Allow bare numbers in 0..1 too.
    const n = parseFloat(t);
    if (Number.isNaN(n)) return null;
    return Math.max(0, Math.min(1, n));
  }
  const n = parseFloat(t);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(1, n / 100));
}

/* ─── Color-space conversions ─────────────────────────────────────────── */

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const r1 = r / 255, g1 = g / 255, b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r1: h = (g1 - b1) / d + (g1 < b1 ? 6 : 0); break;
      case g1: h = (b1 - r1) / d + 2;                  break;
      case b1: h = (r1 - g1) / d + 4;                  break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if      (h < 60)  { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else              { r1 = c; g1 = 0; b1 = x; }
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Format an RGBA tuple back to a CSS string. Translucent values come out
 *  as `rgba(r,g,b,a)` so subtle frosted-glass overlays stay translucent;
 *  fully-opaque values come out as `#hex` for compactness. */
function formatRgba(r: number, g: number, b: number, a: number): string {
  if (a >= 1) return rgbToHex(r, g, b);
  // Round alpha to 3 decimals to avoid 0.030000000000000002-style noise.
  const aRounded = Math.round(a * 1000) / 1000;
  return `rgba(${r},${g},${b},${aRounded})`;
}

/* ─── Public API ──────────────────────────────────────────────────────── */

/**
 * Curve that maps a light-mode lightness to its dark-mode counterpart.
 * Slightly compressed at the extremes so pure-black inputs don't become
 * pure-white outputs (the contrast looks too harsh otherwise).
 */
function invertLightness(L: number): number {
  return Math.max(0, Math.min(1, 0.92 - 0.84 * L));
}

/**
 * Derive a dark-mode color from a light-mode value, preserving alpha.
 *
 * Returns null if `value` doesn't parse as a recognizable color, in which
 * case the caller should skip auto-dark for that declaration. Alpha
 * round-trips: a 5% white overlay (`rgba(255,255,255,0.05)`) becomes a 5%
 * dark overlay (`rgba(20,20,20,0.05)`), keeping the frosted-glass look.
 */
export function deriveDarkColor(value: string): string | null {
  const rgba = parseColor(value);
  if (!rgba) return null;
  const [or, og, ob, a] = rgba;
  const [h, s, l] = rgbToHsl(or, og, ob);
  const newL      = invertLightness(l);
  const [r, g, b] = hslToRgb(h, s, newL);
  return formatRgba(r, g, b, a);
}

/**
 * The set of CSS properties whose values are colors and where auto-dark
 * makes sense. Shorthand props (`background`, `border`, `outline`) are
 * deliberately NOT in this list — their values may include lengths,
 * styles, gradients, etc., and naive substitution would break them.
 * Users who want auto-dark on a shorthand should use the longhand.
 */
export const AUTO_DARK_PROPS: ReadonlySet<string> = new Set([
  "color",
  "backgroundColor", "background-color",
  "borderColor", "border-color",
  "borderTopColor", "border-top-color",
  "borderRightColor", "border-right-color",
  "borderBottomColor", "border-bottom-color",
  "borderLeftColor", "border-left-color",
  "borderBlockColor", "border-block-color",
  "borderInlineColor", "border-inline-color",
  "borderBlockStartColor", "border-block-start-color",
  "borderBlockEndColor", "border-block-end-color",
  "borderInlineStartColor", "border-inline-start-color",
  "borderInlineEndColor", "border-inline-end-color",
  "outlineColor", "outline-color",
  "caretColor", "caret-color",
  "accentColor", "accent-color",
  "textDecorationColor", "text-decoration-color",
  "columnRuleColor", "column-rule-color",
  "fill",
  "stroke",
]);

/** True iff this property's value should get auto-dark derivation. */
export function isAutoDarkProperty(prop: string): boolean {
  return AUTO_DARK_PROPS.has(prop);
}

/* ──────────────────────────────────────────────────────────────────
   CONTRAST-AWARE PAIR DERIVATION
   ──────────────────────────────────────────────────────────────────
   When auto-dark sees a `color` AND a `backgroundColor` on the SAME
   group, it derives BOTH dark variants in concert and verifies WCAG AA
   contrast (≥4.5:1) is preserved. If the naive HSL inversion would
   produce an invisible pair (say, dark text on a near-transparent
   dark background), the foreground is auto-adjusted along the L axis
   until the target ratio is met. Pure black / pure white are the
   absolute fallbacks.

   This closes the "invisible text" footgun where a user wrote a
   white-on-translucent-white pair, expected auto-dark to "just work",
   and got a black-on-translucent-black pair (~1.1:1 contrast). */

export interface DarkPair {
  /** Resolved dark-mode foreground color (CSS string). */
  fg: string;
  /** Resolved dark-mode background color (CSS string). */
  bg: string;
  /** Whether the foreground was adjusted from naive HSL inversion to
   *  satisfy the contrast target. Useful for build-time diagnostics. */
  fgAdjusted: boolean;
  /** Final WCAG contrast ratio (or 0 when one side wasn't a parseable color). */
  ratio: number;
}

/** Default surface-color we composite translucent backgrounds against
 *  when computing contrast in dark mode. Matches the usual page
 *  background most product apps end up with. */
const DEFAULT_DARK_SURFACE = "#0a0a0f";

/**
 * Derive both dark-mode foreground and background, ensuring the pair
 * meets the WCAG AA contrast ratio (4.5:1 by default). The naive HSL
 * inversion runs first; if the resulting pair is unreadable, the fg's
 * lightness is adjusted (binary search) until the target is met.
 *
 * @param fgValue        original (light-mode) foreground color CSS value
 * @param bgValue        original (light-mode) background color CSS value
 * @param surfaceFallback color used as the under-layer when a translucent
 *                        bg is being composited. Defaults to `#0a0a0f`
 *                        (the typical dark-mode page surface).
 * @param targetRatio    WCAG ratio to maintain. Default 4.5 (AA, normal text).
 *                        Pass 3.0 for "large text" leniency, 7.0 for AAA.
 */
export function deriveDarkPair(
  fgValue:        string,
  bgValue:        string,
  surfaceFallback: string = DEFAULT_DARK_SURFACE,
  targetRatio:    number = 4.5,
): DarkPair {
  const naiveFg = deriveDarkColor(fgValue) ?? fgValue;
  const naiveBg = deriveDarkColor(bgValue) ?? bgValue;

  const fgRgba = wcag.parseColor(naiveFg);
  const bgRgba = wcag.parseColor(naiveBg);
  // If either side isn't a parseable solid color (gradients, var(), etc.),
  // we can't safely reason about contrast — fall back to the naive values.
  if (!fgRgba || !bgRgba) {
    return { fg: naiveFg, bg: naiveBg, fgAdjusted: false, ratio: 0 };
  }

  // Composite a translucent background against the surface fallback so
  // we're measuring contrast against what the user will actually see.
  const surface  = wcag.parseColor(surfaceFallback) ?? { r: 0, g: 0, b: 0, a: 1 };
  const compFg   = fgRgba.a < 1 ? wcag.composite(fgRgba, surface) : fgRgba;
  const compBg   = bgRgba.a < 1 ? wcag.composite(bgRgba, surface) : bgRgba;

  const currentRatio = wcag.contrastRatio(compFg, compBg);
  if (currentRatio >= targetRatio) {
    return { fg: naiveFg, bg: naiveBg, fgAdjusted: false, ratio: currentRatio };
  }

  // Adjust the foreground until the target is met. Preserve the original
  // alpha so frosted-glass overlays don't lose their translucency.
  const adjusted = wcag.adjustForContrast(compFg, compBg, targetRatio);
  // Restore the original alpha (adjustForContrast may have changed L
  // but the user's design intent for the alpha should survive).
  const finalFg: wcag.RGBA = { ...adjusted, a: fgRgba.a };
  const finalRatio = wcag.contrastRatio(
    finalFg.a < 1 ? wcag.composite(finalFg, surface) : finalFg,
    compBg,
  );

  return {
    fg:         wcag.formatColor(finalFg),
    bg:         naiveBg,
    fgAdjusted: true,
    ratio:      finalRatio,
  };
}

/**
 * Standalone variant: ensure an EXISTING pair (e.g. user-provided
 * explicit dark-mode colors) still meets the contrast target.
 * Returns the original pair unchanged if it's fine, or an adjusted
 * fg if it's not. Useful for validating user-written `_dark` blocks.
 */
export function ensureContrast(
  fgValue:    string,
  bgValue:    string,
  surfaceFallback: string = DEFAULT_DARK_SURFACE,
  targetRatio: number = 4.5,
): DarkPair {
  const fgRgba = wcag.parseColor(fgValue);
  const bgRgba = wcag.parseColor(bgValue);
  if (!fgRgba || !bgRgba) {
    return { fg: fgValue, bg: bgValue, fgAdjusted: false, ratio: 0 };
  }
  const surface = wcag.parseColor(surfaceFallback) ?? { r: 0, g: 0, b: 0, a: 1 };
  const compFg  = fgRgba.a < 1 ? wcag.composite(fgRgba, surface) : fgRgba;
  const compBg  = bgRgba.a < 1 ? wcag.composite(bgRgba, surface) : bgRgba;
  const ratio   = wcag.contrastRatio(compFg, compBg);
  if (ratio >= targetRatio) return { fg: fgValue, bg: bgValue, fgAdjusted: false, ratio };
  const adjusted = wcag.adjustForContrast(compFg, compBg, targetRatio);
  const finalFg: wcag.RGBA = { ...adjusted, a: fgRgba.a };
  const finalRatio = wcag.contrastRatio(
    finalFg.a < 1 ? wcag.composite(finalFg, surface) : finalFg,
    compBg,
  );
  return {
    fg:         wcag.formatColor(finalFg),
    bg:         bgValue,
    fgAdjusted: true,
    ratio:      finalRatio,
  };
}
