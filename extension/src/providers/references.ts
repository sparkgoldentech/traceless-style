/**
 * traceless-style VS Code extension — references provider.
 *
 * Powers the "Find All References" action (Shift+F12) on a `tl.create`
 * group key.
 *
 *   - Cursor on the DECLARATION (`btn:` inside `tl.create({ btn: ... })`)
 *     → returns every `<binding>.btn` member-access usage AND the
 *     declaration site itself.
 *   - Cursor on a USAGE (`$.btn` in JSX or anywhere else)
 *     → same set: declaration + every usage.
 *
 * Implementation uses the document cache, so the structural walk runs
 * at most once per document change regardless of how many providers ask.
 *
 * Limitations (acknowledged):
 *   - Same-file resolution only. Cross-file binding tracking needs the
 *     TS LS — defer to v0.5.
 *   - Doesn't follow assignments (`const button = $.btn`). Also v0.5.
 */

import * as vscode from "vscode";
import { getDocumentInfo } from "../documentCache";

export class TlReferencesProvider implements vscode.ReferenceProvider {
  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context:  vscode.ReferenceContext,
    token:    vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location[]> {
    if (token.isCancellationRequested) return null;
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false) return null;

    const info = getDocumentInfo(document);
    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_$][A-Za-z0-9_$]*/);
    if (!wordRange) return null;
    const word = document.getText(wordRange);

    // Determine the binding (variable holding the tl.create result) by
    // looking for `<binding>.<word>` on the same line, or — if cursor is
    // on the declaration — by walking up to the enclosing tl.create call.
    const binding = resolveBinding(document, position, word, info);
    if (!binding) return null;

    const refs: vscode.Location[] = [];

    /* 1. Declaration site (if the word is a key inside `<binding>`'s call). */
    for (const group of info.groups) {
      // Find the source of the binding by scanning the document for
      // `(const|let|var) <binding>... = tl.<method>(...)` with the same
      // call-paren index.
      const text = info.text;
      const declRe = new RegExp(
        `\\b(?:const|let|var)\\s+${escapeRegex(binding)}(?![A-Za-z0-9_$])[^=]*=\\s*(?:${info.aliases.map(escapeRegex).join("|")})\\.(create|keyframes|extend)\\s*\\(`,
        "g"
      );
      const declMatch = declRe.exec(text);
      if (!declMatch) continue;
      if (group.call.callOpenIdx !== declMatch.index + declMatch[0].length - 1) continue;

      for (const entry of group.entries) {
        if (entry.key === word) {
          refs.push(new vscode.Location(
            document.uri,
            new vscode.Range(document.positionAt(entry.keyStart), document.positionAt(entry.keyEnd))
          ));
        }
      }
    }

    /* 2. Every usage `<binding>.<word>` in the document. */
    const usageRe = new RegExp(
      `(?<![A-Za-z0-9_$])${escapeRegex(binding)}\\.(${escapeRegex(word)})(?![A-Za-z0-9_$])`,
      "g"
    );
    let m: RegExpExecArray | null;
    while ((m = usageRe.exec(info.text)) !== null) {
      if (token.isCancellationRequested) return refs;
      const start = m.index + binding.length + 1; // +1 for the `.`
      const end   = start + word.length;
      refs.push(new vscode.Location(
        document.uri,
        new vscode.Range(document.positionAt(start), document.positionAt(end))
      ));
    }

    /* Optionally include the declaration in the result list. VS Code
       passes `context.includeDeclaration` based on the user's command;
       respect it. */
    if (!context.includeDeclaration) {
      // Filter out exact key-position matches (which are declarations).
      // Heuristic: declaration ranges are always preceded by whitespace
      // and followed by `:`. Usage ranges are preceded by `.`.
      return refs.filter(r => {
        const lineText = document.lineAt(r.range.start.line).text;
        const ch       = lineText[r.range.start.character - 1];
        return ch === ".";
      });
    }
    return refs;
  }
}

/** Find the binding the cursor is associated with. Returns null when the
 *  cursor is on a word that isn't a `tl.create` key or `<x>.<key>`. */
function resolveBinding(
  document: vscode.TextDocument,
  position: vscode.Position,
  word:     string,
  info:     ReturnType<typeof getDocumentInfo>
): string | null {
  // Case 1: cursor is in `<binding>.<word>` member access on the same line.
  const lineText = document.lineAt(position.line).text;
  const before   = lineText.slice(0, position.character);
  const memberRe = /([A-Za-z_$][A-Za-z0-9_$]*)\.\s*$/.exec(before);
  if (memberRe) return memberRe[1];

  // Case 2: cursor is on the DECLARATION key inside a tl.create call.
  // Find which call's group contains this offset and read back its binding.
  const offset = document.offsetAt(position);
  for (const group of info.groups) {
    if (group.call.openBrace === null || group.call.closeBrace === null) continue;
    if (offset < group.call.openBrace || offset > group.call.closeBrace) continue;
    const text   = info.text;
    const before = text.slice(Math.max(0, group.call.callOpenIdx - 200), group.call.callOpenIdx);
    const aliasRe = info.aliases.map(escapeRegex).join("|");
    const re = new RegExp(
      `\\b(?:const|let|var)\\s+([A-Za-z_$][A-Za-z0-9_$]*)(?![A-Za-z0-9_$])[^=]*=\\s*(?:${aliasRe})\\.(?:create|keyframes|extend)\\s*$`,
      "m"
    );
    const m = re.exec(before);
    if (m) return m[1];
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
