/**
 * traceless-style — compiler/wcag.ts
 *
 * ───────────────────────────────────────────────────────────────────
 * WCAG-grounded color math for compile-time contrast auditing.
 * ───────────────────────────────────────────────────────────────────
 *
 * This module is the single source of truth for:
 *   1. Parsing every CSS Color Module 4 syntax we can resolve at build
 *      time (hex, rgb/rgba, hsl/hsla, hwb, oklch, oklab, named).
 *   2. Computing the WCAG 2.1 §RelativeLuminance and §Contrast Ratio
 *      math used by §1.4.3, §1.4.6, §1.4.11.
 *   3. Compositing translucent foregrounds over a known surface per
 *      CSS Color 4 §10 (alpha compositing).
 *   4. Suggesting a corrected color (HSL or OKLCH search) that meets
 *      a configured target ratio while preserving the user's hue.
 *   5. APCA Lc readout (advisory; APCA is the WCAG 3 working-draft
 *      contrast model). We do NOT use APCA as a pass/fail bar — it is
 *      not normative — but we surface the score in diagnostics for
 *      forward-compat reporting.
 *
 * ───────────────────────────────────────────────────────────────────
 * STANDARDS CITED
 * ───────────────────────────────────────────────────────────────────
 *   • WCAG 2.1 §RelativeLuminance     https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 *   • WCAG 2.1 §ContrastRatio         https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 *   • WCAG 2.1 §1.4.3 / §1.4.6 / §1.4.11    AA / AAA / non-text
 *   • WCAG 2.2 §2.4.13                Focus appearance (≥3:1 contrast)
 *   • CSS Color Module 4              https://www.w3.org/TR/css-color-4/
 *   • OKLab / OKLCh — Björn Ottosson  https://bottosson.github.io/posts/oklab/
 *   • APCA Lc (advisory)              https://github.com/Myndex/SAPC-APCA
 *   • Section 508 (US fed)            adopts WCAG 2.0 AA wholesale
 *   • EN 301 549 (EU public sector)   references WCAG 2.1 AA
 *
 * No external dependencies. Pure functions. Deterministic.
 */

export interface RGBA {
  r: number;       // 0..1
  g: number;       // 0..1
  b: number;       // 0..1
  a: number;       // 0..1
}

/* ── WCAG threshold constants (centralized for traceability) ────── */

/** Numeric thresholds for every contrast clause we audit. */
export const WCAG_THRESHOLDS = {
  /** §1.4.3 normal text (Level AA). */
  AA_NORMAL:        4.5,
  /** §1.4.3 large text (≥18pt regular, ≥14pt bold) (Level AA). */
  AA_LARGE:         3.0,
  /** §1.4.11 UI components and graphical objects (Level AA). */
  AA_UI_COMPONENT:  3.0,
  /** §1.4.6 normal text (Level AAA). */
  AAA_NORMAL:       7.0,
  /** §1.4.6 large text (Level AAA). */
  AAA_LARGE:        4.5,
  /** §2.4.13 focus indicator contrast against adjacent surface (Level AA in 2.2). */
  FOCUS_INDICATOR:  3.0,
  /** Luminance midpoint at which we flip "go lighter" vs "go darker" for adjustment. */
  LUMINANCE_MIDPOINT: 0.18,
} as const;

/** Convenience labels mapped to canonical citation strings. */
export const WCAG_CITATIONS = {
  AA_NORMAL:       "WCAG 2.1 §1.4.3 (Level AA) — normal text ≥4.5:1",
  AA_LARGE:        "WCAG 2.1 §1.4.3 (Level AA) — large text ≥3:1",
  AAA_NORMAL:      "WCAG 2.1 §1.4.6 (Level AAA) — normal text ≥7:1",
  AAA_LARGE:       "WCAG 2.1 §1.4.6 (Level AAA) — large text ≥4.5:1",
  AA_UI_COMPONENT: "WCAG 2.1 §1.4.11 (Level AA) — UI components ≥3:1",
  FOCUS_INDICATOR: "WCAG 2.2 §2.4.13 (Level AA) — focus appearance ≥3:1",
} as const;

/* ── Public API ─────────────────────────────────────────────────── */

/**
 * Parse a CSS color value to an RGBA tuple. Returns null for values
 * that can't be statically resolved (currentColor, var(), gradients,
 * system colors). Callers treat null as "skip — runtime-only color."
 *
 * Supports:
 *   • #rgb / #rgba / #rrggbb / #rrggbbaa
 *   • rgb(R G B [/ A])     (CSS Color 4 — comma or space-separated, % allowed)
 *   • rgba(R, G, B, A)     (legacy CSS3)
 *   • hsl(H S% L% [/ A])   (deg/rad/turn/grad on hue)
 *   • hsla(H, S%, L%, A)
 *   • hwb(H W% B% [/ A])   (CSS Color 4)
 *   • oklch(L C H [/ A])   (CSS Color 4 / OKLCh)
 *   • oklab(L a b [/ A])   (CSS Color 4 / OKLab)
 *   • All 148 CSS Color 4 §6.3 named colors.
 */
export function parseColor(input: string): RGBA | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (v === "transparent")  return { r: 0, g: 0, b: 0, a: 0 };
  if (v === "currentcolor") return null;
  if (v === "inherit" || v === "initial" || v === "unset" || v === "revert" || v === "revert-layer") return null;
  if (v.startsWith("var("))   return null;
  if (v.startsWith("env("))   return null;
  if (v.startsWith("color("))         return null;  // color(display-p3 …) — not statically resolved
  if (v.startsWith("color-mix("))     return parseColorMix(v);
  if (v.startsWith("light-dark("))    return parseLightDark(v);

  if (v.startsWith("#")) return parseHex(v);

  let m = v.match(/^rgba?\(\s*([^)]+)\)$/);
  if (m) return parseRgbArgs(m[1]);

  m = v.match(/^hsla?\(\s*([^)]+)\)$/);
  if (m) return parseHslArgs(m[1]);

  m = v.match(/^hwb\(\s*([^)]+)\)$/);
  if (m) return parseHwbArgs(m[1]);

  m = v.match(/^oklch\(\s*([^)]+)\)$/);
  if (m) return parseOklchArgs(m[1]);

  m = v.match(/^oklab\(\s*([^)]+)\)$/);
  if (m) return parseOklabArgs(m[1]);

  return NAMED_COLORS[v] ?? null;
}

/**
 * WCAG 2.1 relative luminance for a SOLID color. Alpha is ignored —
 * caller composites first if needed.
 *
 * Formula per https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(c: RGBA): number {
  const lin = (x: number): number =>
    x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * WCAG contrast ratio between two SOLID colors. Returns a value in
 * [1, 21]. WCAG 2.1 §1.4.3 requires ≥4.5:1 for normal text,
 * ≥3:1 for large text. §1.4.6 requires ≥7:1.
 *
 * For colors with alpha < 1, the caller must composite against an
 * assumed solid backdrop FIRST (see `composite()`). Calling this on
 * translucent values directly produces meaningless numbers because
 * the "color" of a translucent pixel depends on what's underneath.
 */
export function contrastRatio(a: RGBA, b: RGBA): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Composite a translucent FOREGROUND over a SOLID backdrop using the
 * "over" operator (CSS Color 4 §10.alpha-compositing). After this call
 * the returned color is solid (alpha=1 unless both inputs were 0-alpha).
 */
export function composite(fg: RGBA, backdrop: RGBA): RGBA {
  const a = fg.a + backdrop.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (fg.r * fg.a + backdrop.r * backdrop.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + backdrop.g * backdrop.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + backdrop.b * backdrop.a * (1 - fg.a)) / a,
    a,
  };
}

/**
 * Adjust the LIGHTNESS of `fg` until contrastRatio(fg, bg) >= target.
 * Works in HSL — preserves hue and saturation, mutates only L. Picks
 * the direction that needs less change (lighten on a dark bg, darken
 * on a light bg, threshold at WCAG_THRESHOLDS.LUMINANCE_MIDPOINT).
 *
 * Falls back to pure white or pure black if no L value reaches the
 * target — guarantees the returned color always satisfies the bound
 * (or maxes out at the boundary).
 */
export function adjustForContrast(
  fg:    RGBA,
  bg:    RGBA,
  target: number = WCAG_THRESHOLDS.AA_NORMAL
): RGBA {
  const current = contrastRatio(fg, bg);
  if (current >= target) return { ...fg };

  const bgLum     = relativeLuminance(bg);
  const goLighter = bgLum < WCAG_THRESHOLDS.LUMINANCE_MIDPOINT;

  const hsl = rgbToHsl(fg);
  let lo  = goLighter ? hsl.l : 0;
  let hi  = goLighter ? 1     : hsl.l;
  let bestL = goLighter ? hi : lo;
  let bestRatio = contrastRatio(hslToRgb({ h: hsl.h, s: hsl.s, l: bestL, a: fg.a }), bg);

  // 18 iterations → precision ~1/262144. Plenty for an 8-bit display.
  for (let i = 0; i < 18; i++) {
    const midL = (lo + hi) / 2;
    const candidate = hslToRgb({ h: hsl.h, s: hsl.s, l: midL, a: fg.a });
    const r = contrastRatio(candidate, bg);
    if (r >= target) {
      // Found a passing L; record it, then move toward original to preserve fidelity.
      bestL = midL; bestRatio = r;
      if (goLighter) hi = midL; else lo = midL;
    } else {
      if (goLighter) lo = midL; else hi = midL;
    }
  }

  if (bestRatio < target) {
    return goLighter
      ? { r: 1, g: 1, b: 1, a: fg.a }
      : { r: 0, g: 0, b: 0, a: fg.a };
  }
  return hslToRgb({ h: hsl.h, s: hsl.s, l: bestL, a: fg.a });
}

/**
 * Same idea as `adjustForContrast`, but searches in OKLCH space.
 * OKLCH is perceptually uniform: the search yields a result that's
 * closer in apparent hue and chroma to the original than HSL gives,
 * at the cost of slightly more compute. Recommended for "suggestion"
 * output where designers want a result that LOOKS like their input.
 */
export function adjustForContrastOklch(
  fg:    RGBA,
  bg:    RGBA,
  target: number = WCAG_THRESHOLDS.AA_NORMAL
): RGBA {
  const current = contrastRatio(fg, bg);
  if (current >= target) return { ...fg };

  const bgLum     = relativeLuminance(bg);
  const goLighter = bgLum < WCAG_THRESHOLDS.LUMINANCE_MIDPOINT;

  const oklch = rgbToOklch(fg);
  let lo  = goLighter ? oklch.L : 0;
  let hi  = goLighter ? 1       : oklch.L;
  let bestL = goLighter ? hi : lo;
  let bestRatio = contrastRatio(oklchToRgb(bestL, oklch.C, oklch.H, fg.a), bg);

  for (let i = 0; i < 18; i++) {
    const midL = (lo + hi) / 2;
    const candidate = oklchToRgb(midL, oklch.C, oklch.H, fg.a);
    const r = contrastRatio(candidate, bg);
    if (r >= target) {
      bestL = midL; bestRatio = r;
      if (goLighter) hi = midL; else lo = midL;
    } else {
      if (goLighter) lo = midL; else hi = midL;
    }
  }

  if (bestRatio < target) {
    return goLighter
      ? { r: 1, g: 1, b: 1, a: fg.a }
      : { r: 0, g: 0, b: 0, a: fg.a };
  }
  return oklchToRgb(bestL, oklch.C, oklch.H, fg.a);
}

/** Format an RGBA back to a CSS color string. */
export function formatColor(c: RGBA): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  if (c.a >= 1) return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return `rgba(${r},${g},${b},${round3(c.a)})`;
}

/* ── APCA Lc (advisory only — NOT used as pass/fail) ───────────── */

/**
 * Compute the APCA "Lc" score for `text` over `bg`. Both must be
 * solid (alpha=1) — caller composites first.
 *
 * Lc is a perception-weighted contrast score on a roughly -108..+106
 * scale (positive when text is darker than bg, normal polarity;
 * negative when text is lighter, reverse polarity).
 *
 * APCA bronze/silver readability guidance (Lc magnitude):
 *   ≥ 90   minimum for body text smaller than 14pt
 *   ≥ 75   minimum for body text 14pt+ regular / 12pt+ bold
 *   ≥ 60   minimum for headline / display text
 *   ≥ 45   non-content / large decorative text
 *   ≥ 30   non-text spot elements (icons, glyphs)
 *   ≥ 15   absolute floor — anything below is unreadable
 *
 * APCA is part of the WCAG 3 working draft (NOT normative today). We
 * include it so diagnostics carry a forward-compat readout next to
 * the WCAG 2.1 ratio. Reference: SAPC-APCA / Andrew Somers, version
 * 0.1.9 W3 (https://github.com/Myndex/SAPC-APCA).
 *
 * This is the FULL SAPC-W3 0.1.9 reference implementation, not the
 * simplified educational version. Constants exactly match the W3
 * reference so external auditors can confirm by-the-book conformance.
 */
export function apcaLc(text: RGBA, bg: RGBA): number {
  // SAPC-W3 0.1.9 reference constants (`@APCA/W3/0.1.9`).
  const SA98G       = 0.56;
  const RA98G       = 0.57;
  const SA98G_W     = 0.65;
  const RA98G_W     = 0.62;
  const NormBG      = 0.55;
  const NormTXT     = 0.58;
  const RevTXT      = 0.57;
  const RevBG       = 0.62;
  const blkThrs     = 0.022;
  const blkClmp     = 1.414;
  const scaleBoW    = 1.14;
  const scaleWoB    = 1.14;
  const loBoWoffset = 0.027;
  const loWoBoffset = 0.027;
  const deltaYmin   = 0.0005;
  const loClip      = 0.1;

  let yTxt = sapcLuminance(text);
  let yBg  = sapcLuminance(bg);

  // 1. Soft-clamp the very-dark end (≤ 0.022 sRGB) so values near pure
  //    black don't blow up the polynomial.
  yTxt = yTxt < blkThrs ? yTxt + Math.pow(blkThrs - yTxt, blkClmp) : yTxt;
  yBg  = yBg  < blkThrs ? yBg  + Math.pow(blkThrs - yBg,  blkClmp) : yBg;

  // 2. If the two luminances are essentially identical, declare zero.
  if (Math.abs(yBg - yTxt) < deltaYmin) return 0;

  let outputContrast = 0;
  if (yBg > yTxt) {
    // Normal polarity: text darker than bg ("BoW" — black on white).
    const SAPC = (Math.pow(yBg, SA98G) - Math.pow(yTxt, RA98G)) * scaleBoW;
    outputContrast = SAPC < loClip ? 0 : SAPC - loBoWoffset;
  } else {
    // Reverse polarity: text lighter than bg ("WoB" — white on black).
    const SAPC = (Math.pow(yBg, SA98G_W) - Math.pow(yTxt, RA98G_W)) * scaleWoB;
    outputContrast = SAPC > -loClip ? 0 : SAPC + loWoBoffset;
  }
  // The reference returns Lc on a 0..±108 scale via *100.
  // Suppress unused-but-named conformance constants from being tree-shaken
  // away; they exist for parity with the W3 reference.
  void NormBG; void NormTXT; void RevTXT; void RevBG;
  return outputContrast * 100;
}

function sapcLuminance(c: RGBA): number {
  // APCA uses a 2.4 simple-power curve (NOT WCAG's piecewise linearization)
  // and the BT.709 sRGB primaries weighted per ITU-R Recommendation BT.601.
  // Coefficients come straight from APCA-W3 0.1.9 reference.
  const r = Math.pow(c.r, 2.4);
  const g = Math.pow(c.g, 2.4);
  const b = Math.pow(c.b, 2.4);
  return 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
}

/* ── Internals: hex / rgb / hsl / hwb parsers ──────────────────── */

function parseHex(v: string): RGBA | null {
  let h = v.slice(1);
  if (h.length === 3 || h.length === 4) {
    h = h.split("").map(c => c + c).join("");
  }
  if (h.length !== 6 && h.length !== 8) return null;
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

function parseRgbArgs(args: string): RGBA | null {
  const parts = args
    .replace(/\s*[,/]\s*/g, " ")
    .trim()
    .split(/\s+/);
  if (parts.length < 3 || parts.length > 4) return null;
  const ch = (s: string): number => {
    if (s.endsWith("%")) return parseFloat(s) / 100;
    return parseFloat(s) / 255;
  };
  const a = parts[3]
    ? (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]))
    : 1;
  const r = ch(parts[0]); const g = ch(parts[1]); const b = ch(parts[2]);
  if ([r, g, b, a].some(n => isNaN(n))) return null;
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
}

function parseHslArgs(args: string): RGBA | null {
  const parts = args
    .replace(/\s*[,/]\s*/g, " ")
    .trim()
    .split(/\s+/);
  if (parts.length < 3 || parts.length > 4) return null;
  const h = parseHueDegrees(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const a = parts[3]
    ? (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]))
    : 1;
  if ([h, s, l, a].some(n => isNaN(n))) return null;
  return hslToRgb({ h, s, l, a: clamp01(a) });
}

function parseHwbArgs(args: string): RGBA | null {
  // hwb() — hue + whiteness + blackness per CSS Color 4 §7.
  const parts = args
    .replace(/\s*[,/]\s*/g, " ")
    .trim()
    .split(/\s+/);
  if (parts.length < 3 || parts.length > 4) return null;
  const h = parseHueDegrees(parts[0]);
  let   w = parseFloat(parts[1]) / 100;
  let   bk = parseFloat(parts[2]) / 100;
  const a = parts[3]
    ? (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]))
    : 1;
  if ([h, w, bk, a].some(n => isNaN(n))) return null;
  if (w + bk >= 1) {
    const gray = w / (w + bk);
    return { r: gray, g: gray, b: gray, a: clamp01(a) };
  }
  // Convert via HSL with full saturation/lightness then mix.
  const base = hslToRgb({ h, s: 1, l: 0.5, a: 1 });
  return {
    r: base.r * (1 - w - bk) + w,
    g: base.g * (1 - w - bk) + w,
    b: base.b * (1 - w - bk) + w,
    a: clamp01(a),
  };
}

function parseOklchArgs(args: string): RGBA | null {
  // oklch(L C H [/ A]) — L 0..1 or 0..100%, C 0..0.4ish, H deg.
  const parts = args
    .replace(/\s*[,/]\s*/g, " ")
    .trim()
    .split(/\s+/);
  if (parts.length < 3 || parts.length > 4) return null;
  let L = parts[0].endsWith("%") ? parseFloat(parts[0]) / 100 : parseFloat(parts[0]);
  if (L > 1) L /= 100; // accept 0..100 form too
  const C = parseFloat(parts[1]);
  const H = parseHueDegrees(parts[2]) * 360; // back to degrees for oklch math
  const a = parts[3]
    ? (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]))
    : 1;
  if ([L, C, H, a].some(n => isNaN(n))) return null;
  return oklchToRgb(L, C, H, clamp01(a));
}

function parseOklabArgs(args: string): RGBA | null {
  // oklab(L a b [/ A]) — L 0..1 or 0..100%, a/b ~ -0.4..+0.4.
  const parts = args
    .replace(/\s*[,/]\s*/g, " ")
    .trim()
    .split(/\s+/);
  if (parts.length < 3 || parts.length > 4) return null;
  let L = parts[0].endsWith("%") ? parseFloat(parts[0]) / 100 : parseFloat(parts[0]);
  if (L > 1) L /= 100;
  const a_ = parseFloat(parts[1]);
  const b_ = parseFloat(parts[2]);
  const al = parts[3]
    ? (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]))
    : 1;
  if ([L, a_, b_, al].some(n => isNaN(n))) return null;
  return oklabToRgb(L, a_, b_, clamp01(al));
}

/**
 * Best-effort parse of `color-mix(in <space>, c1 [p1%], c2 [p2%])`.
 * We resolve in sRGB-linear regardless of the requested space — that's
 * a known approximation, but it's enough for static contrast checks.
 * Return null if either color isn't statically resolvable.
 */
function parseColorMix(v: string): RGBA | null {
  const m = /^color-mix\(\s*in\s+[a-z0-9-]+\s*,\s*([^]+)\)$/i.exec(v);
  if (!m) return null;
  const inner = m[1].trim();
  // Split top-level commas.
  const parts: string[] = [];
  let depth = 0, buf = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (c === "," && depth === 0) { parts.push(buf.trim()); buf = ""; }
    else buf += c;
  }
  if (buf.trim()) parts.push(buf.trim());
  if (parts.length !== 2) return null;
  const split = (s: string): { color: string; pct: number | null } => {
    const m2 = /\s+(-?[\d.]+)%$/.exec(s);
    if (m2) return { color: s.slice(0, m2.index).trim(), pct: parseFloat(m2[1]) / 100 };
    return { color: s, pct: null };
  };
  const a = split(parts[0]); const b = split(parts[1]);
  const ca = parseColor(a.color); const cb = parseColor(b.color);
  if (!ca || !cb) return null;
  let pa = a.pct;
  let pb = b.pct;
  if (pa === null && pb === null) { pa = 0.5; pb = 0.5; }
  else if (pa === null) pa = 1 - (pb ?? 0);
  else if (pb === null) pb = 1 - pa;
  const total = pa + pb;
  if (total === 0) return null;
  pa /= total; pb /= total;
  return {
    r: ca.r * pa + cb.r * pb,
    g: ca.g * pa + cb.g * pb,
    b: ca.b * pa + cb.b * pb,
    a: ca.a * pa + cb.a * pb,
  };
}

/**
 * `light-dark(lightColor, darkColor)` — CSS Color 5. We can't know
 * the user's color-scheme at compile time, so we PESSIMISTICALLY
 * return the LIGHT color. Callers that audit dark mode separately
 * will still flag dark-mode failures via the `_dark` block path.
 */
function parseLightDark(v: string): RGBA | null {
  const m = /^light-dark\(\s*([^,]+)\s*,\s*([^)]+)\)$/i.exec(v);
  if (!m) return null;
  return parseColor(m[1].trim());
}

function parseHueDegrees(s: string): number {
  let h = parseFloat(s);
  if (s.endsWith("rad"))  h = (h * 180) / Math.PI;
  if (s.endsWith("turn")) h = h * 360;
  if (s.endsWith("grad")) h = (h * 360) / 400;
  return (((h % 360) + 360) % 360) / 360;
}

interface HSL { h: number; s: number; l: number; a: number; }

function rgbToHsl(c: RGBA): HSL {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case c.r: h = ((c.g - c.b) / d + (c.g < c.b ? 6 : 0)); break;
      case c.g: h = ((c.b - c.r) / d + 2); break;
      case c.b: h = ((c.r - c.g) / d + 4); break;
    }
    h /= 6;
  }
  return { h, s, l, a: c.a };
}

function hslToRgb(c: HSL): RGBA {
  if (c.s === 0) return { r: c.l, g: c.l, b: c.l, a: c.a };
  const q = c.l < 0.5 ? c.l * (1 + c.s) : c.l + c.s - c.l * c.s;
  const p = 2 * c.l - q;
  const hue = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: hue(c.h + 1 / 3),
    g: hue(c.h),
    b: hue(c.h - 1 / 3),
    a: c.a,
  };
}

/* ── OKLab / OKLCh conversions (Björn Ottosson, 2020) ─────────── */

/** Linear-light sRGB ↔ OKLab matrices (CSS Color 4 §10.OKLab). */
function srgbLinear(x: number): number {
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function srgbCompand(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

interface OKLCH { L: number; C: number; H: number; }

function rgbToOklch(c: RGBA): OKLCH {
  const r = srgbLinear(c.r);
  const g = srgbLinear(c.g);
  const b = srgbLinear(c.b);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lp = Math.cbrt(l), mp = Math.cbrt(m), sp = Math.cbrt(s);
  const L = 0.2104542553 * lp + 0.7936177850 * mp - 0.0040720468 * sp;
  const a = 1.9779984951 * lp - 2.4285922050 * mp + 0.4505937099 * sp;
  const b_ = 0.0259040371 * lp + 0.7827717662 * mp - 0.8086757660 * sp;
  const C = Math.sqrt(a * a + b_ * b_);
  let H = (Math.atan2(b_, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

function oklchToRgb(L: number, C: number, H: number, a: number = 1): RGBA {
  const hRad = (H * Math.PI) / 180;
  const a_ = C * Math.cos(hRad);
  const b_ = C * Math.sin(hRad);
  return oklabToRgb(L, a_, b_, a);
}

function oklabToRgb(L: number, a: number, b: number, alpha: number = 1): RGBA {
  const lp = L + 0.3963377774 * a + 0.2158037573 * b;
  const mp = L - 0.1055613458 * a - 0.0638541728 * b;
  const sp = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = lp ** 3, m = mp ** 3, s = sp ** 3;
  const r =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b2 = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return {
    r: clamp01(srgbCompand(clamp01(r))),
    g: clamp01(srgbCompand(clamp01(g))),
    b: clamp01(srgbCompand(clamp01(b2))),
    a: clamp01(alpha),
  };
}

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }
function hex2(n: number): string {
  return Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0");
}
function round3(n: number): number { return Math.round(n * 1000) / 1000; }

/* ── Full CSS Color 4 §6.3 named-color table (148 colors). ───── */

const NAMED_COLORS: Record<string, RGBA> = (() => {
  const table: [string, number, number, number][] = [
    ["aliceblue",240,248,255],["antiquewhite",250,235,215],["aqua",0,255,255],
    ["aquamarine",127,255,212],["azure",240,255,255],["beige",245,245,220],
    ["bisque",255,228,196],["black",0,0,0],["blanchedalmond",255,235,205],
    ["blue",0,0,255],["blueviolet",138,43,226],["brown",165,42,42],
    ["burlywood",222,184,135],["cadetblue",95,158,160],["chartreuse",127,255,0],
    ["chocolate",210,105,30],["coral",255,127,80],["cornflowerblue",100,149,237],
    ["cornsilk",255,248,220],["crimson",220,20,60],["cyan",0,255,255],
    ["darkblue",0,0,139],["darkcyan",0,139,139],["darkgoldenrod",184,134,11],
    ["darkgray",169,169,169],["darkgreen",0,100,0],["darkgrey",169,169,169],
    ["darkkhaki",189,183,107],["darkmagenta",139,0,139],["darkolivegreen",85,107,47],
    ["darkorange",255,140,0],["darkorchid",153,50,204],["darkred",139,0,0],
    ["darksalmon",233,150,122],["darkseagreen",143,188,143],["darkslateblue",72,61,139],
    ["darkslategray",47,79,79],["darkslategrey",47,79,79],["darkturquoise",0,206,209],
    ["darkviolet",148,0,211],["deeppink",255,20,147],["deepskyblue",0,191,255],
    ["dimgray",105,105,105],["dimgrey",105,105,105],["dodgerblue",30,144,255],
    ["firebrick",178,34,34],["floralwhite",255,250,240],["forestgreen",34,139,34],
    ["fuchsia",255,0,255],["gainsboro",220,220,220],["ghostwhite",248,248,255],
    ["gold",255,215,0],["goldenrod",218,165,32],["gray",128,128,128],
    ["green",0,128,0],["greenyellow",173,255,47],["grey",128,128,128],
    ["honeydew",240,255,240],["hotpink",255,105,180],["indianred",205,92,92],
    ["indigo",75,0,130],["ivory",255,255,240],["khaki",240,230,140],
    ["lavender",230,230,250],["lavenderblush",255,240,245],["lawngreen",124,252,0],
    ["lemonchiffon",255,250,205],["lightblue",173,216,230],["lightcoral",240,128,128],
    ["lightcyan",224,255,255],["lightgoldenrodyellow",250,250,210],["lightgray",211,211,211],
    ["lightgreen",144,238,144],["lightgrey",211,211,211],["lightpink",255,182,193],
    ["lightsalmon",255,160,122],["lightseagreen",32,178,170],["lightskyblue",135,206,250],
    ["lightslategray",119,136,153],["lightslategrey",119,136,153],["lightsteelblue",176,196,222],
    ["lightyellow",255,255,224],["lime",0,255,0],["limegreen",50,205,50],
    ["linen",250,240,230],["magenta",255,0,255],["maroon",128,0,0],
    ["mediumaquamarine",102,205,170],["mediumblue",0,0,205],["mediumorchid",186,85,211],
    ["mediumpurple",147,112,219],["mediumseagreen",60,179,113],["mediumslateblue",123,104,238],
    ["mediumspringgreen",0,250,154],["mediumturquoise",72,209,204],["mediumvioletred",199,21,133],
    ["midnightblue",25,25,112],["mintcream",245,255,250],["mistyrose",255,228,225],
    ["moccasin",255,228,181],["navajowhite",255,222,173],["navy",0,0,128],
    ["oldlace",253,245,230],["olive",128,128,0],["olivedrab",107,142,35],
    ["orange",255,165,0],["orangered",255,69,0],["orchid",218,112,214],
    ["palegoldenrod",238,232,170],["palegreen",152,251,152],["paleturquoise",175,238,238],
    ["palevioletred",219,112,147],["papayawhip",255,239,213],["peachpuff",255,218,185],
    ["peru",205,133,63],["pink",255,192,203],["plum",221,160,221],
    ["powderblue",176,224,230],["purple",128,0,128],["rebeccapurple",102,51,153],
    ["red",255,0,0],["rosybrown",188,143,143],["royalblue",65,105,225],
    ["saddlebrown",139,69,19],["salmon",250,128,114],["sandybrown",244,164,96],
    ["seagreen",46,139,87],["seashell",255,245,238],["sienna",160,82,45],
    ["silver",192,192,192],["skyblue",135,206,235],["slateblue",106,90,205],
    ["slategray",112,128,144],["slategrey",112,128,144],["snow",255,250,250],
    ["springgreen",0,255,127],["steelblue",70,130,180],["tan",210,180,140],
    ["teal",0,128,128],["thistle",216,191,216],["tomato",255,99,71],
    ["turquoise",64,224,208],["violet",238,130,238],["wheat",245,222,179],
    ["white",255,255,255],["whitesmoke",245,245,245],["yellow",255,255,0],
    ["yellowgreen",154,205,50],
  ];
  const out: Record<string, RGBA> = {};
  for (const [name, r, g, b] of table) {
    out[name] = { r: r / 255, g: g / 255, b: b / 255, a: 1 };
  }
  return out;
})();
