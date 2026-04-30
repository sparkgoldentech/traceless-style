/**
 * traceless-style VS Code extension — inlay hints provider.
 *
 * Renders ghost text after each top-level group key inside a
 * `tl.create({...})` showing the COUNT of atomic rules the group emits
 * (e.g. `btn:` → `btn: ⟨3 rules⟩`). Keeps the developer aware of how
 * many CSS rules each component contributes — useful when refactoring
 * for bundle-size sensitivity.
 *
 * We intentionally don't try to compute the actual `tlXXXXXX` class
 * hashes here — that requires running the library's FNV implementation
 * with the same property allowlist + auto-rtl rewrite, and any drift
 * between the extension's bundle and the user's installed library
 * version would mislead. Counts are stable and trivially correct.
 *
 * Inlay hints are disabled by default in VS Code unless the user has
 * `editor.inlayHints.enabled` set, so this provider is opt-in by virtue
 * of that setting alone — no extra config knob needed.
 */

import * as vscode from "vscode";
import { findTlCalls, walkObjectEntries } from "../srcWalker";

export class TlInlayHintsProvider implements vscode.InlayHintsProvider {
  provideInlayHints(
    document: vscode.TextDocument,
    range:    vscode.Range
  ): vscode.ProviderResult<vscode.InlayHint[]> {
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false) return [];
    if (cfg.get<boolean>("inlayHints") === false) return [];
    const aliases = cfg.get<string[]>("identifierAliases") ?? ["tl"];

    const text  = document.getText();
    const start = document.offsetAt(range.start);
    const end   = document.offsetAt(range.end);
    const out:  vscode.InlayHint[] = [];

    for (const call of findTlCalls(text, aliases)) {
      if (call.openBrace === null || call.closeBrace === null) continue;
      // Skip calls that don't intersect the requested range — VS Code calls
      // us with the visible viewport range, so this keeps us scaling.
      if (call.callCloseIdx < start || call.callOpenIdx > end) continue;

      for (const entry of walkObjectEntries(text, call.openBrace + 1, call.closeBrace)) {
        if (entry.valueKind !== "object") continue;
        const ruleCount = countRules(text, entry.valueStart + 1, entry.valueEnd - 1);
        const label     = ` ⟨${ruleCount} rule${ruleCount === 1 ? "" : "s"}⟩`;

        const pos  = document.positionAt(entry.keyEnd);
        const hint = new vscode.InlayHint(pos, label, vscode.InlayHintKind.Type);
        hint.paddingLeft = false;
        hint.tooltip     = new vscode.MarkdownString(
          `Group **${entry.key}** emits ${ruleCount} atomic CSS rule${ruleCount === 1 ? "" : "s"} ` +
          `(includes nested variant blocks like \`_dark\`, \`_hover\`, …).`
        );
        out.push(hint);
      }
    }
    return out;
  }
}

/** Recursively count leaf entries (props that produce a CSS rule). */
function countRules(src: string, start: number, end: number): number {
  let total = 0;
  for (const entry of walkObjectEntries(src, start, end)) {
    if (entry.valueKind === "object") {
      // Variant block / nested group — recurse without counting the
      // parent itself.
      total += countRules(src, entry.valueStart + 1, entry.valueEnd - 1);
    } else if (entry.valueKind === "string" || entry.valueKind === "number" || entry.valueKind === "template") {
      total += 1;
    }
    // booleans (control keys) and identifiers don't produce CSS.
  }
  return total;
}
