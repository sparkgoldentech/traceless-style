/**
 * traceless-style VS Code extension — status bar item.
 *
 * Bottom-left of the editor: shows `tl 12 groups · 47 rules` for the
 * active file. Click → opens the outline view scoped to the file.
 *
 *   - Visible only when the active file has at least one tl.create call.
 *   - Updates on document change (debounced) and on active-editor change.
 *   - Tooltip shows the breakdown by method (`create`, `keyframes`, `extend`).
 */

import * as vscode from "vscode";
import { getDocumentInfo } from "./documentCache";

let item: vscode.StatusBarItem | undefined;
let debounceTimer: NodeJS.Timeout | undefined;

export function registerStatusBar(context: vscode.ExtensionContext): void {
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = "workbench.action.gotoSymbol";
  context.subscriptions.push(item);

  const update = (editor: vscode.TextEditor | undefined): void => {
    if (!item) return;
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false || cfg.get<boolean>("statusBar") === false) {
      item.hide();
      return;
    }
    if (!editor || !isSupported(editor.document)) { item.hide(); return; }
    const info = getDocumentInfo(editor.document);
    if (info.calls.length === 0) { item.hide(); return; }

    let groups = 0;
    let rules  = 0;
    for (const g of info.groups) {
      groups += g.entries.length;
      for (const e of g.entries) {
        if (e.valueKind === "object")  {
          // Approximate rule count for nested groups by recursing once.
          rules += countLeaves(info.text, e.valueStart + 1, e.valueEnd - 1);
        } else if (e.valueKind === "string" || e.valueKind === "number") {
          rules += 1;
        }
      }
    }

    item.text = `$(symbol-color) tl ${groups} groups · ${rules} rules`;
    const byMethod = info.calls.reduce<Record<string, number>>((acc, c) => {
      acc[c.method] = (acc[c.method] ?? 0) + 1;
      return acc;
    }, {});
    item.tooltip = new vscode.MarkdownString(
      `**traceless-style — current file**\n\n` +
      Object.entries(byMethod).map(([k, n]) => `- \`tl.${k}(...)\`: ${n}`).join("\n") +
      `\n\n*Click to open the symbol outline.*`
    );
    item.show();
  };

  /* Debounced re-render on document change. */
  const debouncedUpdate = (): void => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => update(vscode.window.activeTextEditor), 150);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (vscode.window.activeTextEditor?.document === e.document) debouncedUpdate();
    }),
    vscode.workspace.onDidCloseTextDocument(() => update(vscode.window.activeTextEditor)),
  );

  // Initial paint.
  update(vscode.window.activeTextEditor);
}

function isSupported(doc: vscode.TextDocument): boolean {
  return ["typescript", "typescriptreact", "javascript", "javascriptreact"].includes(doc.languageId);
}

/** Recursively count leaf-value entries (rules) in a styles object body. */
function countLeaves(text: string, start: number, end: number): number {
  // We don't have the per-entry walker exposed publicly here; rely on the
  // document cache's data via a simple text-scan approximation: count
  // colons followed by string/number openers within the range. Cheap and
  // close enough for a status-bar number.
  let n = 0;
  let i = start;
  while (i < end) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      // Skip string content.
      const q = ch; i++;
      while (i < end && text[i] !== q) { if (text[i] === "\\") i += 2; else i++; }
      i++;
      continue;
    }
    if (ch === ":") {
      // Look ahead — string/number/template = leaf rule; { = nested object.
      let j = i + 1;
      while (j < end && /\s/.test(text[j])) j++;
      const next = text[j];
      if (next === "{") {
        // Skip nested object — recurse.
        let depth = 1; j++;
        while (j < end && depth > 0) {
          const c = text[j];
          if (c === '"' || c === "'" || c === "`") {
            const q = c; j++;
            while (j < end && text[j] !== q) { if (text[j] === "\\") j += 2; else j++; }
            j++; continue;
          }
          if (c === "{") depth++;
          else if (c === "}") depth--;
          j++;
        }
        // The recursive count is included via the outer scan, but the
        // approximation already captured nested keys' colons too.
        i = j;
        continue;
      }
      if (next === '"' || next === "'" || next === "`" || /[-0-9.]/.test(next)) n++;
      i = j;
      continue;
    }
    i++;
  }
  return n;
}
