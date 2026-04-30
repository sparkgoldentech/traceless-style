/**
 * traceless-style VS Code extension — folding range provider.
 *
 * Reports custom folding regions for:
 *   - the whole `tl.create({...})` / `tl.keyframes(...)` / `tl.extend(...)` call
 *   - each top-level group inside `tl.create` (`btn: {...}`, `card: {...}`, …)
 *   - each variant block inside a group (`_dark: {...}`, `_hover: {...}`, …)
 *
 * VS Code already folds plain JS object literals, but tagging these as
 * region folds lets users collapse "all groups in this file" via
 * **Fold All Block Comments → Fold Level 2** style commands. Larger
 * style files (~50 groups) benefit immensely.
 */

import * as vscode from "vscode";
import { findTlCalls, walkObjectEntries } from "../srcWalker";

export class TlFoldingProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(document: vscode.TextDocument): vscode.ProviderResult<vscode.FoldingRange[]> {
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false) return [];
    const aliases = cfg.get<string[]>("identifierAliases") ?? ["tl"];

    const text   = document.getText();
    const ranges: vscode.FoldingRange[] = [];

    for (const call of findTlCalls(text, aliases)) {
      const start = document.positionAt(call.callOpenIdx).line;
      const end   = document.positionAt(call.callCloseIdx).line;
      if (end > start) {
        ranges.push(new vscode.FoldingRange(start, end, vscode.FoldingRangeKind.Region));
      }

      if (call.openBrace !== null && call.closeBrace !== null) {
        for (const entry of walkObjectEntries(text, call.openBrace + 1, call.closeBrace)) {
          if (entry.valueKind !== "object") continue;
          const s = document.positionAt(entry.keyStart).line;
          const e = document.positionAt(entry.valueEnd).line;
          if (e > s) {
            ranges.push(new vscode.FoldingRange(s, e, vscode.FoldingRangeKind.Region));
          }
          // Also fold inner variant blocks (`_dark`, `_hover`, …).
          for (const inner of walkObjectEntries(text, entry.valueStart + 1, entry.valueEnd - 1)) {
            if (inner.valueKind !== "object") continue;
            const is = document.positionAt(inner.keyStart).line;
            const ie = document.positionAt(inner.valueEnd).line;
            if (ie > is) {
              ranges.push(new vscode.FoldingRange(is, ie, vscode.FoldingRangeKind.Region));
            }
          }
        }
      }
    }
    return ranges;
  }
}
