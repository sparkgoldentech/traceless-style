/**
 * traceless-style VS Code extension — document symbols provider.
 *
 * Walks every `tl.create({...})` (and `.keyframes` / `.extend`) call in
 * the document and emits hierarchical symbols for the breadcrumb /
 * outline view:
 *
 *   tl.create               (Class)
 *     btn                   (Field)
 *       _dark               (Field)
 *     card                  (Field)
 *   tl.keyframes: fadeIn    (Function)
 *     from                  (Field)
 *     to                    (Field)
 *
 * Why this matters: large `tl.create` blocks become navigable. Cmd+Shift+O
 * → "btn" jumps to the group. The breadcrumb shows the current group as
 * the user scrolls.
 */

import * as vscode from "vscode";

export class TlDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false) return [];
    const aliases = cfg.get<string[]>("identifierAliases") ?? ["tl"];

    const text = document.getText();
    const out:  vscode.DocumentSymbol[] = [];

    const aliasRe = aliases.map(escape).join("|");
    const re = new RegExp(`(?<![A-Za-z0-9_$])(?:${aliasRe})\\.(create|keyframes|extend)\\s*\\(`, "g");

    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const method      = m[1];
      const callOpenIdx = m.index + m[0].length - 1;
      const obj         = findStylesObject(text, callOpenIdx);
      if (!obj) continue;

      // `keyframes` calls are usually `tl.keyframes("name", { ... })` — try
      // to pull the name out for a friendlier symbol label.
      let label = `tl.${method}`;
      if (method === "keyframes") {
        const argText = text.slice(m.index + m[0].length, obj.openBrace);
        const nameMatch = /["']([^"']+)["']\s*,/.exec(argText);
        if (nameMatch) label = `tl.keyframes: ${nameMatch[1]}`;
      }

      const range  = new vscode.Range(
        document.positionAt(m.index),
        document.positionAt(obj.closeBrace + 1)
      );
      const select = new vscode.Range(
        document.positionAt(m.index),
        document.positionAt(m.index + m[0].length - 1)
      );

      const sym = new vscode.DocumentSymbol(
        label,
        method === "create" ? "styles" : method,
        method === "create" ? vscode.SymbolKind.Class
        : method === "keyframes" ? vscode.SymbolKind.Function
        : vscode.SymbolKind.Namespace,
        range,
        select
      );
      sym.children = collectKeys(text, obj.openBrace + 1, obj.closeBrace, document);
      out.push(sym);
    }

    return out;
  }
}

/* ── walk a styles object and return its top-level keys as symbols ── */

function collectKeys(
  src:        string,
  start:      number,
  end:        number,
  document:   vscode.TextDocument
): vscode.DocumentSymbol[] {
  const out: vscode.DocumentSymbol[] = [];
  let i = start;
  while (i < end) {
    i = skipWsAndComments(src, i);
    if (i >= end) break;

    let nameStart: number, nameEnd: number, name: string;
    if (src[i] === '"' || src[i] === "'") {
      nameStart = i + 1;
      const q = src[i];
      i++;
      while (i < end && src[i] !== q) { if (src[i] === "\\") i += 2; else i++; }
      nameEnd = i;
      name = src.slice(nameStart, nameEnd);
      i++;
    } else if (/[A-Za-z_$0-9]/.test(src[i])) {
      nameStart = i;
      while (i < end && /[A-Za-z0-9_$-]/.test(src[i])) i++;
      nameEnd = i;
      name = src.slice(nameStart, nameEnd);
    } else { i++; continue; }

    i = skipWsAndComments(src, i);
    if (src[i] !== ":") {
      while (i < end && src[i] !== "," && src[i] !== "}") i++;
      if (src[i] === ",") i++;
      continue;
    }
    i++;
    i = skipWsAndComments(src, i);

    const valueStart = i;
    let valueEnd = valueStart;
    let children: vscode.DocumentSymbol[] = [];

    if (src[i] === "{") {
      const close = matchBrace(src, i);
      if (close > 0) {
        valueEnd = close + 1;
        children = collectKeys(src, i + 1, close, document);
      } else {
        valueEnd = end;
      }
      i = valueEnd;
    } else if (src[i] === '"' || src[i] === "'") {
      const q = src[i]; i++;
      while (i < end && src[i] !== q) { if (src[i] === "\\") i += 2; else i++; }
      i++;
      valueEnd = i;
    } else {
      while (i < end && src[i] !== "," && src[i] !== "}") i++;
      valueEnd = i;
    }

    const isVariant = name.startsWith("_");
    const sym = new vscode.DocumentSymbol(
      name,
      isVariant ? "variant" : "rule",
      isVariant ? vscode.SymbolKind.Event : vscode.SymbolKind.Field,
      new vscode.Range(document.positionAt(nameStart), document.positionAt(valueEnd)),
      new vscode.Range(document.positionAt(nameStart), document.positionAt(nameEnd)),
    );
    sym.children = children;
    out.push(sym);

    i = skipWsAndComments(src, i);
    if (src[i] === ",") i++;
  }
  return out;
}

/* ── helpers (subset) ─────────────────────────────────────────────── */

function findStylesObject(src: string, callParenOffset: number): { openBrace: number; closeBrace: number } | null {
  let i = callParenOffset + 1;
  i = skipWsAndComments(src, i);
  while (i < src.length && src[i] !== "{") {
    // Skip past the keyframes "name" arg.
    if (src[i] === '"' || src[i] === "'" || src[i] === "`") { i = skipString(src, i); continue; }
    if (src[i] === ",") { i++; i = skipWsAndComments(src, i); continue; }
    if (src[i] === ")") return null;
    i++;
  }
  if (src[i] !== "{") return null;
  const openBrace = i;
  const closeBrace = matchBrace(src, openBrace);
  if (closeBrace < 0) return null;
  return { openBrace, closeBrace };
}

function matchBrace(src: string, start: number): number {
  let depth = 0;
  let i     = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") { i = skipString(src, i); continue; }
    if (ch === "/" && src[i + 1] === "/")       { i = skipLineComment(src, i); continue; }
    if (ch === "/" && src[i + 1] === "*")       { i = skipBlockComment(src, i); continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

function skipString(src: string, i: number): number {
  const q = src[i++];
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") { i += 2; continue; }
    if (q === "`" && ch === "$" && src[i + 1] === "{") {
      i += 2;
      let depth = 1;
      while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === '"' || c === "'" || c === "`") { i = skipString(src, i); continue; }
        i++;
      }
      continue;
    }
    if (ch === q) return i + 1;
    i++;
  }
  return i;
}

function skipLineComment(src: string, i: number): number {
  while (i < src.length && src[i] !== "\n") i++;
  return i;
}

function skipBlockComment(src: string, i: number): number {
  i += 2;
  while (i < src.length) {
    if (src[i] === "*" && src[i + 1] === "/") return i + 2;
    i++;
  }
  return i;
}

function skipWsAndComments(src: string, i: number): number {
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch))                    { i++; continue; }
    if (ch === "/" && src[i + 1] === "/") { i = skipLineComment(src, i); continue; }
    if (ch === "/" && src[i + 1] === "*") { i = skipBlockComment(src, i); continue; }
    return i;
  }
  return i;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
