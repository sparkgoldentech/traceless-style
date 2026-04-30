/**
 * traceless-style VS Code extension — completion provider.
 *
 * Three completion contexts, each with proper sorting + filtering so
 * results behave the way a Tailwind/StyleX user expects:
 *
 *   1. KEY POSITION (depth >= 1, after `{` / `,` / new line)
 *      → CSS property names + variant keys (`_dark`, `_hover`, …).
 *      → Variants sort with `0_…` so they appear at the top when the
 *        user types `_`. Properties sort with `1_…` so they win when the
 *        user types a letter that doesn't match a variant.
 *
 *   2. VALUE POSITION (after `<prop>: ` on the same line)
 *      → Per-property values from the curated map (display: flex/grid/…).
 *      → Inserted with surrounding `"…"` because the strict AST parser
 *        rejects unquoted identifiers.
 *      → `preselect: true` on the first item so Enter accepts immediately.
 *
 *   3. KEYFRAME STOPS (depth 0 of `tl.keyframes({...})`)
 *      → from / to / percentages, ahead of everything else.
 *
 * Filter text is set explicitly on every item so VS Code's filter still
 * matches the user's typed prefix even when the cursor is after `: ` or
 * other delimiters that confuse the default word-pattern logic.
 */

import * as vscode from "vscode";
import { detectTlScope, type TlScope } from "../tlScope";
import { KNOWN_PROPERTIES, PROPERTY_VALUES, VARIANT_KEYS } from "../cssData";
import { CSS_PROPERTY_DOCS } from "../cssDocs";

export class TlCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token:   vscode.CancellationToken,
    context:  vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false) return null;
    const aliases = cfg.get<string[]>("identifierAliases") ?? ["tl"];

    const offset = document.offsetAt(position);
    const text   = document.getText();
    const scope  = detectTlScope(text, offset, aliases);
    if (!scope) return null;

    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    const valueCtx   = detectValueContext(linePrefix);

    if (valueCtx) {
      return propertyValueCompletions(valueCtx.property, valueCtx.alreadyQuoted);
    }

    /* "Between properties" cool-off — when the user just finished a
       property (the line ends with `,` or `;`, optionally followed by
       whitespace) and HAS NOT TYPED any character of the next key yet,
       we return null so the popup closes. This is the classic
       annoyance VS Code's TS provider also avoids: hit comma, hit
       Enter, do NOT have a property accidentally inserted. The popup
       reopens automatically as soon as the user types the first letter
       of the next key (quickSuggestions handles that path). */
    if (isBetweenPropertiesEmpty(linePrefix)) return null;

    if (scope.atKeyPosition || /(^|[\s{,])[A-Za-z_$][A-Za-z0-9_$-]*$/.test(linePrefix)) {
      const typed = extractTypedPrefix(linePrefix);
      // Preselect the first item ONLY when the user has typed at least
      // one character — otherwise Enter at a fresh position would
      // insert an item the user never asked for.
      void context; // (signature includes context for VS Code; we don't need it here yet)
      return keyCompletions(scope, typed, /* preselectFirst */ typed.length > 0);
    }

    return null;
  }
}

/**
 * True when the cursor sits on an empty "next property" slot: the line
 * up to the cursor is whitespace, optionally preceded by a `,` or `;`
 * with more whitespace, all the way back to the start of the line OR
 * to the previous non-whitespace token. We do NOT inspect previous
 * lines because multi-line `tl.create` bodies still want suggestions
 * the moment the user starts typing on a fresh line — only the
 * truly-empty cursor position is suppressed.
 */
function isBetweenPropertiesEmpty(linePrefix: string): boolean {
  // Trim trailing whitespace; if there's nothing left, we're on an
  // empty line in the middle of a block — no suggestions yet.
  const trimmed = linePrefix.replace(/[\t ]+$/, "");
  if (trimmed.length === 0) return true;
  // If the line ends with a separator (comma or semicolon) followed by
  // optional whitespace — the previous property is committed and the
  // user has NOT begun the next key yet.
  return /[,;]\s*$/.test(linePrefix);
}

/* ── completion builders ─────────────────────────────────────────── */

function keyCompletions(scope: TlScope, typedPrefix: string, preselectFirst = true): vscode.CompletionItem[] {
  const items: vscode.CompletionItem[] = [];
  const startsWithUnderscore = typedPrefix.startsWith("_");

  if (scope.method === "keyframes" && scope.depth === 0) {
    // Keyframes top level: from/to/percentages — only thing that makes
    // sense at this depth, so we don't return CSS properties.
    let i = 0;
    for (const stop of ["from", "to", "0%", "25%", "50%", "75%", "100%"]) {
      const item = new vscode.CompletionItem(stop, vscode.CompletionItemKind.Keyword);
      item.detail     = "keyframe stop";
      item.sortText   = `0${String(i++).padStart(3, "0")}`;
      item.filterText = stop;
      item.preselect  = i === 1;
      items.push(item);
    }
    return items;
  }

  // Variant keys — sorted high when the user has typed an underscore, low
  // otherwise so they don't drown out CSS properties.
  if (scope.method !== "extend") {
    const variantBucket = startsWithUnderscore ? "0" : "2";
    let i = 0;
    for (const v of VARIANT_KEYS) {
      const item = new vscode.CompletionItem(v.name, vscode.CompletionItemKind.Keyword);
      item.detail        = "traceless-style variant";
      item.documentation = new vscode.MarkdownString(v.doc);
      item.insertText    = new vscode.SnippetString(`${v.name}: { $0 }`);
      item.sortText      = `${variantBucket}${String(i++).padStart(3, "0")}`;
      item.filterText    = v.name;
      items.push(item);
    }
  }

  // CSS property keys.
  const propertyBucket = startsWithUnderscore ? "2" : "1";
  let propIdx = 0;
  for (const prop of KNOWN_PROPERTIES) {
    const item = new vscode.CompletionItem(prop, vscode.CompletionItemKind.Property);
    item.detail        = "CSS property";
    const docInfo      = CSS_PROPERTY_DOCS[prop];
    if (docInfo) {
      const md = new vscode.MarkdownString(docInfo.summary);
      md.appendMarkdown(`\n\n[MDN reference](${docInfo.mdn})`);
      md.isTrusted = false;
      item.documentation = md;
    }
    item.insertText    = new vscode.SnippetString(`${prop}: $0`);
    item.sortText      = `${propertyBucket}${String(propIdx++).padStart(4, "0")}`;
    item.filterText    = prop;
    items.push(item);
  }

  // Pre-select the first item ONLY when the user has actually typed a
  // prefix to bias against. With no prefix we'd be guessing intent —
  // and an Enter at that position should insert a newline, not a
  // suggestion the user never asked for.
  if (preselectFirst && items.length > 0) items[0].preselect = true;

  return items;
}

function propertyValueCompletions(property: string, alreadyQuoted: boolean): vscode.CompletionItem[] {
  const values = PROPERTY_VALUES[property];
  if (!values || values.length === 0) return [];

  return values.map((v, i) => {
    const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Value);
    item.detail     = `${property} value`;
    // Wrap in quotes only when the user hasn't already opened a string.
    // Otherwise we'd produce `""flex"`.
    item.insertText = alreadyQuoted ? v : `"${v}"`;
    item.sortText   = `0${String(i).padStart(3, "0")}`;
    item.filterText = v;
    item.preselect  = i === 0;
    return item;
  });
}

/* ── value-context detection ─────────────────────────────────────── */

interface ValueContext {
  property:      string;
  /** True when the cursor sits immediately after an opening string quote. */
  alreadyQuoted: boolean;
}

/**
 * Detect whether the cursor is positioned in the VALUE of a `prop: ...`
 * pair on the current line. The value group rejects `{` / `}` so a fresh
 * key inside a nested object (`btn: { p|`) is NOT misclassified as the
 * value of the outer key.
 *
 * `alreadyQuoted` is true when the cursor sits right after `"` or `'`,
 * which lets us avoid double-quoting the inserted value.
 */
function detectValueContext(linePrefix: string): ValueContext | null {
  const re = /([A-Za-z_$][A-Za-z0-9_$-]*)\s*:\s*([^,{}]*)$/g;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(linePrefix)) !== null) {
    last = m;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (!last) return null;

  const valueText      = last[2];
  const trimmedValue   = valueText.trimStart();
  const alreadyQuoted  = trimmedValue.startsWith('"') || trimmedValue.startsWith("'");
  const property       = camelize(last[1]);
  return { property, alreadyQuoted };
}

/** Pull the identifier the user is currently typing off the end of the line. */
function extractTypedPrefix(linePrefix: string): string {
  const m = /([A-Za-z_$][A-Za-z0-9_$-]*)$/.exec(linePrefix);
  return m ? m[1] : "";
}

/** kebab-case → camelCase (idempotent for already-camel input). */
function camelize(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
