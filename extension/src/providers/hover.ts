/**
 * traceless-style VS Code extension — hover provider.
 *
 * Three categories of hover content, all scoped to inside `tl.create({...})`
 * (and `.keyframes` / `.extend`):
 *
 *   1. CSS PROPERTY KEYS   — short summary + MDN link.
 *   2. VARIANT KEYS        — what the variant does + the selector it
 *                            generates (`_dark` → `:is(.dark *)`, etc.).
 *   3. COLOR LITERALS      — the resolved hex + an `rgb(...)` form so the
 *                            user can sanity-check translucent values.
 *
 * Outside scope, we return null and let other hover providers (TypeScript,
 * Tailwind, etc.) take over — no pollution.
 */

import * as vscode from "vscode";
import { detectTlScope } from "../tlScope";
import { CSS_PROPERTY_DOCS } from "../cssDocs";
import { VARIANT_KEYS } from "../cssData";

const VARIANT_SELECTORS: Record<string, string> = {
  _dark:        ":is(.dark *)",
  _hover:       ":hover",
  _focus:       ":focus",
  _active:      ":active",
  _disabled:    ":disabled",
  _hoverFocus:  ":hover, :focus",
  _notDisabled: ":not(:disabled)",
  _first:       ":first-child",
  _last:        ":last-child",
  _odd:         ":nth-child(odd)",
  _even:        ":nth-child(even)",
  _mobile:      "@media (max-width: 639px)",
  _tablet:      "@media (min-width: 900px)",
  _widescreen:  "@media (min-width: 1280px)",
  _autoDark:    "(control key — set false to disable auto-derived dark variants)",
  _autoRtl:     "(control key — set false to disable auto-derived logical properties)",
};

export class TlHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false) return null;
    const aliases = cfg.get<string[]>("identifierAliases") ?? ["tl"];

    const offset = document.offsetAt(position);
    const text   = document.getText();
    const scope  = detectTlScope(text, offset, aliases);
    if (!scope) return null;

    // 1. Try identifier under cursor — could be a CSS property or variant.
    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_$][A-Za-z0-9_$-]*/);
    if (wordRange) {
      const word = document.getText(wordRange);

      // Variant?
      if (word.startsWith("_")) {
        const variant = VARIANT_KEYS.find(v => v.name === word);
        if (variant) {
          const md = new vscode.MarkdownString();
          md.appendMarkdown(`**\`${variant.name}\`** — traceless-style variant\n\n`);
          md.appendMarkdown(variant.doc + "\n\n");
          const sel = VARIANT_SELECTORS[variant.name];
          if (sel) md.appendMarkdown(`Generates: \`${sel}\``);
          return new vscode.Hover(md, wordRange);
        }
      }

      // CSS property?
      const docInfo = CSS_PROPERTY_DOCS[word];
      if (docInfo) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**\`${word}\`** — CSS property\n\n`);
        md.appendMarkdown(docInfo.summary + "\n\n");
        md.appendMarkdown(`[MDN reference](${docInfo.mdn})`);
        return new vscode.Hover(md, wordRange);
      }
    }

    // 2. Color literal under cursor?
    const colorHover = colorAt(document, position);
    if (colorHover) return colorHover;

    return null;
  }
}

/* ── color literal hover ─────────────────────────────────────────── */

const HEX_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

function colorAt(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | null {
  const line = doc.lineAt(pos.line).text;
  HEX_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEX_RE.exec(line)) !== null) {
    const start = m.index;
    const end   = m.index + m[0].length;
    if (pos.character >= start && pos.character <= end) {
      const md = new vscode.MarkdownString();
      const rgb = hexToRgb(m[0]);
      md.appendMarkdown(`**Color** \`${m[0]}\``);
      if (rgb) {
        md.appendMarkdown(`\n\n— rgb(${rgb.r}, ${rgb.g}, ${rgb.b})${rgb.a < 1 ? `, alpha ${rgb.a}` : ""}`);
      }
      return new vscode.Hover(md, new vscode.Range(pos.line, start, pos.line, end));
    }
  }
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number; a: number } | null {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = h.split("").map(c => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? Math.round(parseInt(h.slice(6, 8), 16) / 255 * 100) / 100 : 1,
  };
}
