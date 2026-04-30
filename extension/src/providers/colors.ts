/**
 * traceless-style VS Code extension — color provider.
 *
 * Adds inline color swatches and the click-to-pick color picker for any
 * hex/rgb/rgba/hsl/hsla literal that appears inside a `tl.create({...})`
 * argument body. Strings outside tl-method calls are left alone — we
 * deliberately don't decorate every CSS-looking literal in the file.
 *
 * VS Code calls us in two phases:
 *   1. provideDocumentColors — return ranges + initial colors.
 *   2. provideColorPresentations — given a new color the user picked,
 *      return the textual replacement(s) we want to write.
 *
 * Format preservation: we return the user's input as the primary
 * presentation, plus the alternate formats. So if they originally wrote
 * `#3b82f6`, the picker offers another hex, rgb(), and hsl() but doesn't
 * silently rewrite their hex into a different format.
 */

import * as vscode from "vscode";
import { detectTlScope } from "../tlScope";

const HEX_RE  = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB_RE  = /\brgba?\(\s*(\d+(?:\.\d+)?%?)\s*,?\s*(\d+(?:\.\d+)?%?)\s*,?\s*(\d+(?:\.\d+)?%?)(?:\s*[,/]\s*(\d*\.?\d+%?))?\s*\)/g;
const HSL_RE  = /\bhsla?\(\s*(\d+(?:\.\d+)?(?:deg|rad|turn|grad)?)\s*,?\s*(\d+(?:\.\d+)?%)\s*,?\s*(\d+(?:\.\d+)?%)(?:\s*[,/]\s*(\d*\.?\d+%?))?\s*\)/g;

export class TlColorProvider implements vscode.DocumentColorProvider {
  provideDocumentColors(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.ColorInformation[]> {
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false) return [];
    const aliases = cfg.get<string[]>("identifierAliases") ?? ["tl"];

    const text = document.getText();
    const out:  vscode.ColorInformation[] = [];

    const consider = (offset: number, length: number, color: vscode.Color) => {
      const scope = detectTlScope(text, offset, aliases);
      if (!scope) return;
      const start = document.positionAt(offset);
      const end   = document.positionAt(offset + length);
      out.push(new vscode.ColorInformation(new vscode.Range(start, end), color));
    };

    let m: RegExpExecArray | null;
    HEX_RE.lastIndex = 0;
    while ((m = HEX_RE.exec(text)) !== null) {
      const c = parseHex(m[0]);
      if (c) consider(m.index, m[0].length, c);
    }
    RGB_RE.lastIndex = 0;
    while ((m = RGB_RE.exec(text)) !== null) {
      const c = parseRgb(m[1], m[2], m[3], m[4]);
      if (c) consider(m.index, m[0].length, c);
    }
    HSL_RE.lastIndex = 0;
    while ((m = HSL_RE.exec(text)) !== null) {
      const c = parseHsl(m[1], m[2], m[3], m[4]);
      if (c) consider(m.index, m[0].length, c);
    }

    return out;
  }

  provideColorPresentations(
    color: vscode.Color
  ): vscode.ProviderResult<vscode.ColorPresentation[]> {
    return [
      presentHex(color),
      presentRgb(color),
      presentHsl(color),
    ];
  }
}

/* ── parsers ──────────────────────────────────────────────────────── */

function parseHex(hex: string): vscode.Color | null {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) {
    h = h.split("").map(c => c + c).join("");
  }
  if (h.length !== 6 && h.length !== 8) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return new vscode.Color(r, g, b, a);
}

function parseRgb(rs: string, gs: string, bs: string, as?: string): vscode.Color | null {
  const parseChannel = (s: string): number => {
    if (s.endsWith("%")) return parseFloat(s) / 100;
    return parseFloat(s) / 255;
  };
  const parseAlpha = (s: string | undefined): number => {
    if (!s) return 1;
    if (s.endsWith("%")) return parseFloat(s) / 100;
    return parseFloat(s);
  };
  const r = parseChannel(rs), g = parseChannel(gs), b = parseChannel(bs);
  if ([r, g, b].some(n => isNaN(n))) return null;
  return new vscode.Color(clamp01(r), clamp01(g), clamp01(b), clamp01(parseAlpha(as)));
}

function parseHsl(hs: string, ss: string, ls: string, as?: string): vscode.Color | null {
  // Strip unit from hue; treat values as degrees.
  let h = parseFloat(hs);
  if (hs.endsWith("rad"))  h = (h * 180) / Math.PI;
  if (hs.endsWith("turn")) h = h * 360;
  if (hs.endsWith("grad")) h = (h * 360) / 400;
  h = ((h % 360) + 360) % 360 / 360;
  const s = parseFloat(ss) / 100;
  const l = parseFloat(ls) / 100;
  if ([h, s, l].some(n => isNaN(n))) return null;
  const { r, g, b } = hslToRgb(h, s, l);
  const a = !as ? 1 : (as.endsWith("%") ? parseFloat(as) / 100 : parseFloat(as));
  return new vscode.Color(r, g, b, clamp01(a));
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hueToRgb = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hueToRgb(h + 1 / 3), g: hueToRgb(h), b: hueToRgb(h - 1 / 3) };
}

/* ── presenters ───────────────────────────────────────────────────── */

function presentHex(c: vscode.Color): vscode.ColorPresentation {
  const r = toHex2(c.red);
  const g = toHex2(c.green);
  const b = toHex2(c.blue);
  const a = c.alpha < 1 ? toHex2(c.alpha) : "";
  return new vscode.ColorPresentation(`#${r}${g}${b}${a}`);
}

function presentRgb(c: vscode.Color): vscode.ColorPresentation {
  const r = Math.round(c.red   * 255);
  const g = Math.round(c.green * 255);
  const b = Math.round(c.blue  * 255);
  const txt = c.alpha < 1
    ? `rgba(${r},${g},${b},${round(c.alpha, 3)})`
    : `rgb(${r},${g},${b})`;
  return new vscode.ColorPresentation(txt);
}

function presentHsl(c: vscode.Color): vscode.ColorPresentation {
  const { h, s, l } = rgbToHsl(c.red, c.green, c.blue);
  const txt = c.alpha < 1
    ? `hsla(${Math.round(h * 360)},${Math.round(s * 100)}%,${Math.round(l * 100)}%,${round(c.alpha, 3)})`
    : `hsl(${Math.round(h * 360)},${Math.round(s * 100)}%,${Math.round(l * 100)}%)`;
  return new vscode.ColorPresentation(txt);
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h /= 6;
  }
  return { h, s, l };
}

/* ── helpers ─────────────────────────────────────────────────────── */

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }
function toHex2(n: number): string {
  const v = Math.round(clamp01(n) * 255).toString(16);
  return v.length === 1 ? "0" + v : v;
}
function round(n: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}
