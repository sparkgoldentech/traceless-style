/**
 * traceless-style VS Code extension — definition provider.
 *
 * Powers Ctrl+click / F12 navigation from a class-accessor expression
 * (e.g. `$.btn`) to the line that DECLARES the rule (`btn: { ... }`)
 * inside the matching `tl.create({...})`.
 *
 * Resolution algorithm (regex + lexical scan, no TS AST):
 *
 *   1. Identify the identifier under the cursor.
 *   2. Read the line context. If the cursor sits in a member-access
 *      expression `<binding>.<key>` where `<key>` is the identifier we
 *      just found, capture `<binding>`.
 *   3. Scan the document for `const <binding> = tl.create({...})` (also
 *      `let`/`var`, with optional type annotation). Take the FIRST such
 *      declaration in document order — JS's lexical-scoping rules mean
 *      a `$` declared earlier wins.
 *   4. Inside that `tl.create` body, locate the key `<key>:` and return
 *      a Location pointing at it.
 *
 * Limitations (acknowledged, not bugs):
 *   - Doesn't follow imports — `$` from another file isn't resolved.
 *     Most projects keep `tl.create` and its consumers in the same file
 *     anyway; cross-file resolution is a v0.4 task that needs the TS AST.
 *   - Renamed-export tokens (`const button = $.btn`) aren't followed.
 */

import * as vscode from "vscode";
import { findTlCalls, walkObjectEntries } from "../srcWalker";

export class TlDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false) return null;
    const aliases = cfg.get<string[]>("identifierAliases") ?? ["tl"];

    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_$][A-Za-z0-9_$]*/);
    if (!wordRange) return null;
    const key = document.getText(wordRange);

    // Look for `<binding>.<key>` on the same line (cursor is on `<key>`).
    const line   = document.lineAt(position.line).text;
    const before = line.slice(0, wordRange.start.character);
    const m = /([A-Za-z_$][A-Za-z0-9_$]*)\.\s*$/.exec(before);
    if (!m) return null;
    const binding = m[1];

    const text = document.getText();

    // Find `(const|let|var) <binding>(:.*)?\s*=\s*tl.<method>(...)` in the
    // document. Take the first match in document order. We use a lookahead
    // to anchor the END of the binding identifier instead of `\b` because
    // `$` (a common alias for tl.create return values) isn't a word char,
    // so `\b\$\b` would never match.
    const bindingPat = escapeRegex(binding);
    const declRe = new RegExp(
      `\\b(?:const|let|var)\\s+${bindingPat}(?![A-Za-z0-9_$])[^=]*=\\s*(?:${aliases.map(escapeRegex).join("|")})\\.(create|keyframes|extend)\\s*\\(`,
      "g"
    );
    const declMatch = declRe.exec(text);
    if (!declMatch) return null;

    // Re-discover the call's open-paren via findTlCalls so we get the
    // styles object boundary cleanly (tlCall returns a typed structure).
    const callOpenIdx = declMatch.index + declMatch[0].length - 1;
    const matchingCall = findTlCalls(text, aliases).find(c => c.callOpenIdx === callOpenIdx);
    if (!matchingCall || matchingCall.openBrace === null || matchingCall.closeBrace === null) return null;

    for (const entry of walkObjectEntries(text, matchingCall.openBrace + 1, matchingCall.closeBrace)) {
      if (entry.key === key) {
        const start = document.positionAt(entry.keyStart);
        const end   = document.positionAt(entry.keyEnd);
        return new vscode.Location(document.uri, new vscode.Range(start, end));
      }
    }
    return null;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
