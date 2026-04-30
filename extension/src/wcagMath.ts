/**
 * traceless-style VS Code extension — wcagMath.ts
 *
 * Self-contained WCAG / APCA color math used by the contrast diagnostic
 * provider and its code actions. MIRRORED from the library's
 * `src/compiler/wcag.ts` — kept here as a focused subset (~300 lines)
 * so the extension's bundle stays small and ships independently of any
 * installed `traceless-style` version.
 *
 * Standards:
 *   - WCAG 2.1 §RelativeLuminance / §ContrastRatio
 *   - WCAG 2.1 §1.4.3 (AA, 4.5:1 normal / 3:1 large)
 *   - WCAG 2.1 §1.4.6 (AAA, 7:1 normal / 4.5:1 large)
 *   - WCAG 2.1 §1.4.11 (UI components, 3:1)
 *   - APCA SAPC-W3 0.1.9 (advisory readout, WCAG 3 working draft)
 *   - OKLab / OKLCh — Björn Ottosson 2020 (perceptual color space)
 *
 * Design notes:
 *   - All functions are pure. No side effects, no Node deps. Browser-safe.
 *   - parseColor accepts hex (#rgb, #rrggbb, #rrggbbaa), rgb()/rgba(),
 *     hsl()/hsla(), and the 21 most common named colors. Returns null
 *     for var(), currentColor, gradients, and oklch/oklab (we don't
 *     fully parse those in the extension to stay lean — diagnostics
 *     gracefully skip values we can't resolve, the build-time validator
 *     handles them).
 *   - adjustForContrastOklch preserves designer hue + chroma (the
 *     "design-grade fix" — a brand blue stays blue).
 */

export interface RGBA { r: number; g: number; b: number; a: number; }

export const WCAG = {
  AA_NORMAL: 4.5,
  AA_LARGE:  3.0,
  AA_UI:     3.0,
  AAA_NORMAL: 7.0,
  AAA_LARGE:  4.5,
  LUMINANCE_MIDPOINT: 0.18,
} as const;

const NAMED_COLORS: Record<string, RGBA> = {
  white:        { r: 1, g: 1, b: 1, a: 1 },
  black:        { r: 0, g: 0, b: 0, a: 1 },
  transparent:  { r: 0, g: 0, b: 0, a: 0 },
  red:          { r: 1, g: 0, b: 0, a: 1 },
  green:        { r: 0, g: 0.502, b: 0, a: 1 },
  blue:         { r: 0, g: 0, b: 1, a: 1 },
  yellow:       { r: 1, g: 1, b: 0, a: 1 },
  cyan:         { r: 0, g: 1, b: 1, a: 1 },
  magenta:      { r: 1, g: 0, b: 1, a: 1 },
  gray:         { r: 0.502, g: 0.502, b: 0.502, a: 1 },
  grey:         { r: 0.502, g: 0.502, b: 0.502, a: 1 },
  silver:       { r: 0.753, g: 0.753, b: 0.753, a: 1 },
  orange:       { r: 1, g: 0.647, b: 0, a: 1 },
  purple:       { r: 0.502, g: 0, b: 0.502, a: 1 },
  pink:         { r: 1, g: 0.753, b: 0.796, a: 1 },
  brown:        { r: 0.647, g: 0.165, b: 0.165, a: 1 },
  navy:         { r: 0, g: 0, b: 0.502, a: 1 },
  teal:         { r: 0, g: 0.502, b: 0.502, a: 1 },
  lime:         { r: 0, g: 1, b: 0, a: 1 },
  maroon:       { r: 0.502, g: 0, b: 0, a: 1 },
  olive:        { r: 0.502, g: 0.502, b: 0, a: 1 },
};

export function parseColor(input: string): RGBA | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (v === "currentcolor" || v.startsWith("var(") || v.startsWith("env(")) return null;

  if (v.startsWith("#")) {
    let h = v.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split("").map(c => c + c).join("");
    if ((h.length !== 6 && h.length !== 8) || !/^[0-9a-f]+$/.test(h)) return null;
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }

  let m = v.match(/^rgba?\(\s*([^)]+)\)$/);
  if (m) return parseRgbArgs(m[1]);

  m = v.match(/^hsla?\(\s*([^)]+)\)$/);
  if (m) return parseHslArgs(m[1]);

  return NAMED_COLORS[v] ?? null;
}

function parseRgbArgs(args: string): RGBA | null {
  const parts = args.replace(/\s*[,/]\s*/g, " ").trim().split(/\s+/);
  if (parts.length < 3 || parts.length > 4) return null;
  const ch = (s: string): number => s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s) / 255;
  const r = ch(parts[0]), g = ch(parts[1]), b = ch(parts[2]);
  const a = parts[3] ? (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
  if ([r, g, b, a].some(n => isNaN(n))) return null;
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
}

function parseHslArgs(args: string): RGBA | null {
  const parts = args.replace(/\s*[,/]\s*/g, " ").trim().split(/\s+/);
  if (parts.length < 3 || parts.length > 4) return null;
  let h = parseFloat(parts[0]);
  if (parts[0].endsWith("rad"))  h = (h * 180) / Math.PI;
  if (parts[0].endsWith("turn")) h = h * 360;
  if (parts[0].endsWith("grad")) h = (h * 360) / 400;
  h = (((h % 360) + 360) % 360) / 360;
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const a = parts[3] ? (parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
  if ([h, s, l, a].some(n => isNaN(n))) return null;
  return hslToRgb({ h, s, l, a: clamp01(a) });
}

interface HSL { h: number; s: number; l: number; a: number; }
function hslToRgb(c: HSL): RGBA {
  if (c.s === 0) return { r: c.l, g: c.l, b: c.l, a: c.a };
  const q = c.l < 0.5 ? c.l * (1 + c.s) : c.l + c.s - c.l * c.s;
  const p = 2 * c.l - q;
  const hue = (t: number): number => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hue(c.h + 1 / 3), g: hue(c.h), b: hue(c.h - 1 / 3), a: c.a };
}

export function relativeLuminance(c: RGBA): number {
  const lin = (x: number): number => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

export function contrastRatio(a: RGBA, b: RGBA): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

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

/* ── APCA SAPC-W3 0.1.9 (advisory) ─────────────────────────────── */
export function apcaLc(text: RGBA, bg: RGBA): number {
  const yTxt0 = sapcLuminance(text), yBg0 = sapcLuminance(bg);
  const blkThrs = 0.022, blkClmp = 1.414;
  const yTxt = yTxt0 < blkThrs ? yTxt0 + Math.pow(blkThrs - yTxt0, blkClmp) : yTxt0;
  const yBg  = yBg0  < blkThrs ? yBg0  + Math.pow(blkThrs - yBg0,  blkClmp) : yBg0;
  if (Math.abs(yBg - yTxt) < 0.0005) return 0;
  if (yBg > yTxt) {
    const sapc = (Math.pow(yBg, 0.56) - Math.pow(yTxt, 0.57)) * 1.14;
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  } else {
    const sapc = (Math.pow(yBg, 0.65) - Math.pow(yTxt, 0.62)) * 1.14;
    return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
  }
}
function sapcLuminance(c: RGBA): number {
  return 0.2126729 * Math.pow(c.r, 2.4) + 0.7151522 * Math.pow(c.g, 2.4) + 0.0721750 * Math.pow(c.b, 2.4);
}

/* ── OKLab / OKLCh — perceptual hue-preserving search ──────────── */
function srgbLinear(x: number): number {
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function srgbCompand(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}
interface OKLCH { L: number; C: number; H: number; }
function rgbToOklch(c: RGBA): OKLCH {
  const r = srgbLinear(c.r), g = srgbLinear(c.g), b = srgbLinear(c.b);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lp = Math.cbrt(l), mp = Math.cbrt(m), sp = Math.cbrt(s);
  const L  = 0.2104542553 * lp + 0.7936177850 * mp - 0.0040720468 * sp;
  const a  = 1.9779984951 * lp - 2.4285922050 * mp + 0.4505937099 * sp;
  const b_ = 0.0259040371 * lp + 0.7827717662 * mp - 0.8086757660 * sp;
  const C  = Math.sqrt(a * a + b_ * b_);
  let H = (Math.atan2(b_, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}
function oklchToRgb(L: number, C: number, H: number, alpha = 1): RGBA {
  const hRad = (H * Math.PI) / 180;
  const a_ = C * Math.cos(hRad), b_ = C * Math.sin(hRad);
  const lp = L + 0.3963377774 * a_ + 0.2158037573 * b_;
  const mp = L - 0.1055613458 * a_ - 0.0638541728 * b_;
  const sp = L - 0.0894841775 * a_ - 1.2914855480 * b_;
  const l = lp ** 3, m = mp ** 3, s = sp ** 3;
  const r =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return {
    r: clamp01(srgbCompand(clamp01(r))),
    g: clamp01(srgbCompand(clamp01(g))),
    b: clamp01(srgbCompand(clamp01(b))),
    a: clamp01(alpha),
  };
}

export function adjustForContrastOklch(fg: RGBA, bg: RGBA, target: number): RGBA {
  if (contrastRatio(fg, bg) >= target) return { ...fg };
  const goLighter = relativeLuminance(bg) < WCAG.LUMINANCE_MIDPOINT;
  const oklch = rgbToOklch(fg);
  let lo = goLighter ? oklch.L : 0, hi = goLighter ? 1 : oklch.L;
  let bestL = goLighter ? hi : lo;
  let bestRatio = contrastRatio(oklchToRgb(bestL, oklch.C, oklch.H, fg.a), bg);
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const cand = oklchToRgb(mid, oklch.C, oklch.H, fg.a);
    const r = contrastRatio(cand, bg);
    if (r >= target) { bestL = mid; bestRatio = r; if (goLighter) hi = mid; else lo = mid; }
    else             {                              if (goLighter) lo = mid; else hi = mid; }
  }
  if (bestRatio < target) return goLighter ? { r: 1, g: 1, b: 1, a: fg.a } : { r: 0, g: 0, b: 0, a: fg.a };
  return oklchToRgb(bestL, oklch.C, oklch.H, fg.a);
}

/* Alpha-preservation: keep R/G/B, search smallest alpha that meets target. */
export function adjustForContrastAlpha(fg: RGBA, bg: RGBA, target: number): RGBA | null {
  if (fg.a >= 1) return null;
  const opaque = composite({ ...fg, a: 1 }, bg);
  if (contrastRatio(opaque, bg) < target) return null;
  let lo = fg.a, hi = 1, bestA: number | null = null;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(composite({ ...fg, a: mid }, bg), bg) >= target) { bestA = mid; hi = mid; }
    else lo = mid;
  }
  if (bestA === null) return null;
  return { r: fg.r, g: fg.g, b: fg.b, a: Math.min(1, bestA + 0.02) };
}

export function formatColor(c: RGBA, preferRgba: boolean): string {
  const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255);
  if (preferRgba || c.a < 1) {
    const a = Math.round(c.a * 1000) / 1000;
    return a >= 1 ? `rgba(${r},${g},${b},1)` : `rgba(${r},${g},${b},${a})`;
  }
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}
function hex2(n: number): string { return Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0"); }
function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

/* ── High-level audit helper used by diagnostics + code actions ─── */
export interface ContrastAudit {
  ratio:         number;
  apca:          number;
  passesAA:      boolean;
  passesAA_large:boolean;
  passesAAA:     boolean;
  passesUi:      boolean;
}

export function auditPair(fgValue: string, bgValue: string, surface = "#ffffff"): ContrastAudit | null {
  const fg = parseColor(fgValue);
  const bg = parseColor(bgValue);
  if (!fg || !bg) return null;
  if (fg.a === 0) return null;
  const surfaceRgba = parseColor(surface) ?? { r: 1, g: 1, b: 1, a: 1 };
  const compFg = fg.a < 1 ? composite(fg, surfaceRgba) : fg;
  const compBg = bg.a < 1 ? composite(bg, surfaceRgba) : bg;
  const ratio = contrastRatio(compFg, compBg);
  return {
    ratio,
    apca:          apcaLc(compFg, compBg),
    passesAA:      ratio >= WCAG.AA_NORMAL,
    passesAA_large:ratio >= WCAG.AA_LARGE,
    passesAAA:     ratio >= WCAG.AAA_NORMAL,
    passesUi:      ratio >= WCAG.AA_UI,
  };
}

/**
 * Best-effort accessibility-grade replacement that preserves design
 * intent. Tries alpha bump first (for translucent inputs), falls back
 * to OKLCH lightness search.
 */
export function suggestAccessibleColor(
  fgValue: string,
  bgValue: string,
  target:  number,
  surface = "#ffffff"
): string | null {
  const fg = parseColor(fgValue);
  const bg = parseColor(bgValue);
  if (!fg || !bg) return null;
  const surfaceRgba = parseColor(surface) ?? { r: 1, g: 1, b: 1, a: 1 };
  const compBg = bg.a < 1 ? composite(bg, surfaceRgba) : bg;

  if (fg.a < 1) {
    const alphaFix = adjustForContrastAlpha(fg, compBg, target);
    if (alphaFix) return formatColor(alphaFix, true);
  }
  const compFg = fg.a < 1 ? composite(fg, compBg) : fg;
  const adjusted = adjustForContrastOklch(compFg, compBg, target);
  const inputIsRgba = /^rgba?\(/i.test(fgValue.trim());
  return formatColor(adjusted, inputIsRgba);
}
