/**
 * traceless-style VS Code extension — code actions provider.
 *
 * Turns diagnostics into one-click quick-fixes:
 *
 *   - `unknown-css-property` with suggestions → "Replace with: <name>"
 *     for each suggestion (typically 1–3 fixes).
 *   - `non-literal-value` → no automatic fix (the user has to write a
 *     literal); we surface a code-action that links to the docs page.
 *
 * The `kind` is `QuickFix` for property-name fixes so they appear in the
 * lightbulb menu and on `Ctrl+.`.
 */

import * as vscode from "vscode";
import { readSuggestions } from "./diagnostics";
import { getContrastFix, CONTRAST_CODES } from "./contrastDiagnostics";
import { suggestAccessibleColor, WCAG } from "../wcagMath";

const SOURCE = "traceless-style";

export class TlCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    _range:    vscode.Range,
    context:  vscode.CodeActionContext
  ): vscode.ProviderResult<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];

    for (const d of context.diagnostics) {
      if (d.source !== SOURCE) continue;
      const code = typeof d.code === "object" ? d.code.value : d.code;

      if (code === "unknown-css-property") {
        const suggestions = readSuggestions(d);
        for (const fix of suggestions) {
          const action = new vscode.CodeAction(
            `Replace with '${fix}'`,
            vscode.CodeActionKind.QuickFix
          );
          action.diagnostics = [d];
          action.isPreferred = suggestions.indexOf(fix) === 0;
          action.edit = new vscode.WorkspaceEdit();
          action.edit.replace(document.uri, d.range, fix);
          actions.push(action);
        }
      }

      if (code === "non-literal-value") {
        const action = new vscode.CodeAction(
          "Open the literal-value docs",
          vscode.CodeActionKind.QuickFix
        );
        action.diagnostics = [d];
        action.command = {
          command: "vscode.open",
          title:   "Open docs",
          arguments: [vscode.Uri.parse("https://github.com/sparkgoldentech/traceless-style#literal-only-values")],
        };
        actions.push(action);
      }

      /* Contrast quick-fixes — three tiers, each surfaces as its own
         lightbulb item so the user picks the trade-off they want:
           - "Apply WCAG AA fix"  → minimum legal threshold (4.5:1 / 3:1)
           - "Apply WCAG AAA fix" → enhanced (7:1 normal, 4.5:1 large/UI)
                                    matches Apple HIG / IBM Carbon / Fluent
           - "Replace with brighter / darker hue (preserve design intent)"
             → uses the alpha-preserving + OKLCH path under the hood */
      if (code === CONTRAST_CODES.TEXT_AA || code === CONTRAST_CODES.TEXT_AAA || code === CONTRAST_CODES.UI) {
        const fix = getContrastFix(d);
        if (fix) {
          // Tier 1 — minimum-effort fix at the diagnostic's reported target.
          const aaSug = suggestAccessibleColor(fix.fgValue, fix.bgValue, fix.target, fix.surface);
          if (aaSug && aaSug !== fix.fgValue) {
            const a = new vscode.CodeAction(
              `Apply ${code === CONTRAST_CODES.UI ? "WCAG AA UI" : (fix.target >= WCAG.AAA_NORMAL ? "WCAG AAA" : "WCAG AA")} fix → "${aaSug}" (preserves hue)`,
              vscode.CodeActionKind.QuickFix
            );
            a.diagnostics = [d];
            a.isPreferred = true;
            a.edit = new vscode.WorkspaceEdit();
            a.edit.replace(document.uri, fix.replaceRange, `"${aaSug}"`);
            actions.push(a);
          }
          // Tier 2 — when the diagnostic is at AA, also offer AAA upgrade.
          if (fix.target < WCAG.AAA_NORMAL && code !== CONTRAST_CODES.UI) {
            const aaaSug = suggestAccessibleColor(fix.fgValue, fix.bgValue, WCAG.AAA_NORMAL, fix.surface);
            if (aaaSug && aaaSug !== aaSug && aaaSug !== fix.fgValue) {
              const a = new vscode.CodeAction(
                `Apply WCAG AAA fix (7:1) → "${aaaSug}"`,
                vscode.CodeActionKind.QuickFix
              );
              a.diagnostics = [d];
              a.edit = new vscode.WorkspaceEdit();
              a.edit.replace(document.uri, fix.replaceRange, `"${aaaSug}"`);
              actions.push(a);
            }
          }
          // Tier 3 — pure docs link for users who want to read the standard.
          const docs = new vscode.CodeAction(
            "Open WCAG contrast guide",
            vscode.CodeActionKind.QuickFix
          );
          docs.diagnostics = [d];
          docs.command = {
            command: "vscode.open",
            title:   "Open WCAG contrast guide",
            arguments: [vscode.Uri.parse("https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html")],
          };
          actions.push(docs);
        }
      }
    }

    return actions;
  }
}
