/**
 * traceless-style VS Code extension — `sortKeys` command.
 *
 * Sorts the property keys of the `tl.create({...})` group containing the
 * cursor (or the nearest `_dark`/`_hover`/etc. block). Variant keys
 * (`_dark`, `_hover`, `_autoRtl`, etc.) are pushed to the END so the
 * physical-property block stays uncluttered, mirroring the convention
 * many traceless-style users adopt by hand.
 *
 * Triggered from the command palette (`traceless-style: Sort tl.create
 * keys at cursor`) or via the menu/keybinding the user adds in their
 * own settings.
 *
 * Why command, not format-on-save: a project-wide formatter would
 * conflict with Prettier and disrupt diffs. A targeted command lets the
 * user apply it deliberately when they want to.
 */

import * as vscode from "vscode";

export async function sortKeysAtCursor(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { vscode.window.showInformationMessage("No active editor."); return; }

  const doc    = editor.document;
  const text   = doc.getText();
  const offset = doc.offsetAt(editor.selection.active);

  const block = findEnclosingBlock(text, offset);
  if (!block) {
    vscode.window.showInformationMessage("Place the cursor inside a tl.create group to sort it.");
    return;
  }

  const sorted = sortBlockBody(text.slice(block.openBrace + 1, block.closeBrace), block.indent);
  if (sorted === null) {
    vscode.window.showWarningMessage("Couldn't safely sort this block — it has unbalanced or unusual structure.");
    return;
  }

  await editor.edit(eb => {
    eb.replace(
      new vscode.Range(doc.positionAt(block.openBrace + 1), doc.positionAt(block.closeBrace)),
      "\n" + sorted + block.indent
    );
  });
  vscode.window.setStatusBarMessage("traceless-style: keys sorted", 2000);
}

/* ── find the nearest enclosing { … } block ──────────────────────── */

function findEnclosingBlock(src: string, offset: number): { openBrace: number; closeBrace: number; indent: string } | null {
  // Walk backward from the cursor to find an opening `{` whose matching
  // `}` falls AFTER the cursor — that's the enclosing block.
  let i = offset - 1;
  while (i >= 0) {
    if (src[i] === "{") {
      const close = matchBrace(src, i);
      if (close > offset) {
        // Compute indentation of the line containing the opening brace.
        const lineStart = src.lastIndexOf("\n", i) + 1;
        const indent    = (/^[ \t]*/.exec(src.slice(lineStart, i)) ?? [""])[0];
        return { openBrace: i, closeBrace: close, indent };
      }
    }
    i--;
  }
  return null;
}

/* ── sort the body of a {…} block ────────────────────────────────── */

interface Entry {
  key:        string;
  isVariant:  boolean;
  rawText:    string;        // entire `key: value,?` segment, with leading newline + indent
}

function sortBlockBody(body: string, blockIndent: string): string | null {
  const entries: Entry[] = [];
  let i = 0;
  while (i < body.length) {
    const start = i;
    // Skip leading whitespace + comments to find the key.
    i = skipWsAndComments(body, i);
    if (i >= body.length) break;

    // Collect a comment-block immediately preceding the key — keep it
    // attached so re-sorting doesn't strand explanatory comments.
    // (We've already advanced past comments above; capture from `start`.)

    // Read key.
    let keyStart = i, keyEnd = i, key = "";
    if (body[i] === '"' || body[i] === "'") {
      const q = body[i];
      i++; keyStart = i;
      while (i < body.length && body[i] !== q) { if (body[i] === "\\") i += 2; else i++; }
      keyEnd = i;
      key = body.slice(keyStart, keyEnd);
      i++;
    } else if (/[A-Za-z_$0-9-]/.test(body[i])) {
      keyStart = i;
      while (i < body.length && /[A-Za-z0-9_$-]/.test(body[i])) i++;
      keyEnd = i;
      key = body.slice(keyStart, keyEnd);
    } else {
      // Unrecognized — bail.
      return null;
    }

    i = skipWsAndComments(body, i);
    if (body[i] !== ":") return null;
    i++;

    // Walk through the value (literal, nested object, or array).
    i = skipValue(body, i);
    if (i < 0) return null;

    // Trailing comma + optional whitespace until next entry.
    i = skipWsAndComments(body, i);
    if (body[i] === ",") i++;

    const rawText = body.slice(start, i);
    entries.push({ key, isVariant: key.startsWith("_"), rawText });
  }

  // Sort: properties first (alphabetically), variants last (alphabetically).
  entries.sort((a, b) => {
    if (a.isVariant !== b.isVariant) return a.isVariant ? 1 : -1;
    return a.key.localeCompare(b.key);
  });

  // Reconstruct with consistent leading newline + indent. Trim each entry's
  // own leading whitespace because we'll re-prefix it.
  const itemIndent = blockIndent + "  ";
  const lines: string[] = [];
  for (const e of entries) {
    const trimmed = e.rawText.replace(/^[\s]+/, "").replace(/,\s*$/, "");
    if (!trimmed) continue;
    lines.push(itemIndent + trimmed + ",");
  }
  return "\n" + lines.join("\n") + "\n";
}

/* ── value skipper ───────────────────────────────────────────────── */

function skipValue(body: string, i: number): number {
  i = skipWsAndComments(body, i);
  if (i >= body.length) return -1;
  const ch = body[i];
  if (ch === "{") {
    const close = matchBrace(body, i);
    return close < 0 ? -1 : close + 1;
  }
  if (ch === "[") {
    const close = matchBracket(body, i);
    return close < 0 ? -1 : close + 1;
  }
  if (ch === '"' || ch === "'" || ch === "`") return skipString(body, i);
  // Bare value — read until comma or closing brace at our depth.
  while (i < body.length && body[i] !== "," && body[i] !== "}") {
    if (body[i] === '"' || body[i] === "'" || body[i] === "`") { i = skipString(body, i); continue; }
    i++;
  }
  return i;
}

function matchBrace(src: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") { i = skipString(src, i); continue; }
    if (ch === "/" && src[i + 1] === "/") { i = skipLineComment(src, i); continue; }
    if (ch === "/" && src[i + 1] === "*") { i = skipBlockComment(src, i); continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

function matchBracket(src: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") { i = skipString(src, i); continue; }
    if (ch === "[") depth++;
    else if (ch === "]") { depth--; if (depth === 0) return i; }
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
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "/" && src[i + 1] === "/") { i = skipLineComment(src, i); continue; }
    if (ch === "/" && src[i + 1] === "*") { i = skipBlockComment(src, i); continue; }
    return i;
  }
  return i;
}
