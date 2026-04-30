/**
 * traceless-style VS Code extension — selection-range provider.
 *
 * Drives "Expand selection" (Shift+Alt+Right / Cmd+Ctrl+Shift+→) so
 * pressing it inside a tl.create call grows in semantically meaningful
 * jumps:
 *
 *   word  →  key  →  key:value pair  →  group body  →  whole tl.create
 *
 * VS Code already provides word/line ranges; this provider adds the
 * traceless-style-specific levels in between.
 */

import * as vscode from "vscode";
import { findTlCalls, walkObjectEntries } from "../srcWalker";

export class TlSelectionRangeProvider implements vscode.SelectionRangeProvider {
  provideSelectionRanges(
    document:  vscode.TextDocument,
    positions: vscode.Position[]
  ): vscode.ProviderResult<vscode.SelectionRange[]> {
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false) return [];
    const aliases = cfg.get<string[]>("identifierAliases") ?? ["tl"];

    const text  = document.getText();
    const calls = findTlCalls(text, aliases);
    const out:  vscode.SelectionRange[] = [];

    for (const pos of positions) {
      const offset = document.offsetAt(pos);
      const ranges: vscode.Range[] = [];

      for (const call of calls) {
        if (offset < call.callOpenIdx || offset > call.callCloseIdx) continue;
        // Outermost: the whole `tl.<method>(...)` call.
        ranges.push(new vscode.Range(
          document.positionAt(call.callOpenIdx),
          document.positionAt(call.callCloseIdx + 1)
        ));
        if (call.openBrace !== null && call.closeBrace !== null) {
          // Then the styles object body.
          ranges.push(new vscode.Range(
            document.positionAt(call.openBrace),
            document.positionAt(call.closeBrace + 1)
          ));
          // Then each enclosing entry's pair, group body, and key.
          collectEnclosing(text, call.openBrace + 1, call.closeBrace, offset, document, ranges);
        }
        break;
      }

      // Build the linked-list SelectionRange — innermost first.
      let chain: vscode.SelectionRange | undefined;
      for (let i = ranges.length - 1; i >= 0; i--) {
        chain = new vscode.SelectionRange(ranges[i], chain);
      }
      out.push(chain ?? new vscode.SelectionRange(new vscode.Range(pos, pos)));
    }
    return out;
  }
}

function collectEnclosing(
  text:    string,
  start:   number,
  end:     number,
  offset:  number,
  doc:     vscode.TextDocument,
  ranges:  vscode.Range[]
): void {
  for (const entry of walkObjectEntries(text, start, end)) {
    // Pair range: keyStart → valueEnd.
    if (offset >= entry.keyStart && offset <= entry.valueEnd) {
      ranges.push(new vscode.Range(
        doc.positionAt(entry.keyStart),
        doc.positionAt(entry.valueEnd)
      ));
      // If the value is an object, keep recursing inside it.
      if (entry.valueKind === "object") {
        ranges.push(new vscode.Range(
          doc.positionAt(entry.valueStart),
          doc.positionAt(entry.valueEnd)
        ));
        collectEnclosing(text, entry.valueStart + 1, entry.valueEnd - 1, offset, doc, ranges);
      }
      // Key-only range — innermost meaningful selection.
      if (offset >= entry.keyStart && offset <= entry.keyEnd) {
        ranges.push(new vscode.Range(
          doc.positionAt(entry.keyStart),
          doc.positionAt(entry.keyEnd)
        ));
      }
      return;
    }
  }
}
