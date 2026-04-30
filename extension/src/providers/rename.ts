/**
 * traceless-style VS Code extension — rename provider.
 *
 * Powers F2 (Rename Symbol) on a `tl.create` group key. Renames the
 * declaration AND every `<binding>.<oldName>` member access in the same
 * file in one atomic edit.
 *
 *   const $ = tl.create({
 *     btn: { color: "red" },         <- F2 here, type "button"
 *     card: { ... },
 *   });
 *   <div className={$.btn} />        <- updates to $.button
 *   <div className={$.btn + ' x'} /> <- updates to $.button
 *
 * The `prepareRename` step validates the new name AND restricts which
 * positions support rename (so users don't accidentally trigger it on a
 * CSS property name like `color`).
 *
 * Same-file only — cross-file rename needs the TS LS, deferred to v0.5.
 */

import * as vscode from "vscode";
import { getDocumentInfo } from "../documentCache";

export class TlRenameProvider implements vscode.RenameProvider {
  /** Validate that the position is rename-able + return the range we'll edit. */
  prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
    token:    vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string }> {
    if (token.isCancellationRequested) return null;
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false) return null;

    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_$][A-Za-z0-9_$]*/);
    if (!wordRange) return null;
    const word = document.getText(wordRange);

    // Only allow rename when the word is a tl.create group key OR a
    // `<binding>.<key>` member access. Anything else → reject.
    if (!isRenameTarget(document, position, word)) {
      throw new Error("This symbol cannot be renamed by the traceless-style extension.");
    }

    return { range: wordRange, placeholder: word };
  }

  provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName:  string,
    token:    vscode.CancellationToken
  ): vscode.ProviderResult<vscode.WorkspaceEdit> {
    if (token.isCancellationRequested) return null;
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false) return null;

    // Validate new name — must be a JS identifier we can use as both an
    // object key AND a member-access lookup.
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(newName)) {
      throw new Error(`'${newName}' is not a valid JavaScript identifier.`);
    }

    const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_$][A-Za-z0-9_$]*/);
    if (!wordRange) return null;
    const oldName = document.getText(wordRange);
    if (oldName === newName) return null;

    const info = getDocumentInfo(document);
    const binding = resolveBinding(document, position, oldName, info);
    if (!binding) return null;

    const edit = new vscode.WorkspaceEdit();

    /* 1. Declaration site: rewrite `oldName:` inside the matching
          tl.create's group entries. */
    for (const group of info.groups) {
      const text = info.text;
      const declRe = new RegExp(
        `\\b(?:const|let|var)\\s+${escapeRegex(binding)}(?![A-Za-z0-9_$])[^=]*=\\s*(?:${info.aliases.map(escapeRegex).join("|")})\\.(create|keyframes|extend)\\s*\\(`,
        "g"
      );
      const declMatch = declRe.exec(text);
      if (!declMatch) continue;
      if (group.call.callOpenIdx !== declMatch.index + declMatch[0].length - 1) continue;

      for (const entry of group.entries) {
        if (entry.key !== oldName) continue;
        edit.replace(
          document.uri,
          new vscode.Range(document.positionAt(entry.keyStart), document.positionAt(entry.keyEnd)),
          newName
        );
      }
    }

    /* 2. Usage sites: every `<binding>.<oldName>` in the document. */
    const usageRe = new RegExp(
      `(?<![A-Za-z0-9_$])(${escapeRegex(binding)}\\.)${escapeRegex(oldName)}(?![A-Za-z0-9_$])`,
      "g"
    );
    let m: RegExpExecArray | null;
    while ((m = usageRe.exec(info.text)) !== null) {
      if (token.isCancellationRequested) return null;
      const start = m.index + m[1].length;
      const end   = start + oldName.length;
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(start), document.positionAt(end)),
        newName
      );
    }

    return edit;
  }
}

/* ── helpers ────────────────────────────────────────────────────── */

function isRenameTarget(
  document: vscode.TextDocument,
  position: vscode.Position,
  word:     string
): boolean {
  // Allow rename ONLY when:
  //   (a) the position is `<binding>.<word>` (a usage), OR
  //   (b) the position is a key inside a tl.create call.
  const lineText = document.lineAt(position.line).text;
  const before   = lineText.slice(0, position.character);
  if (/[A-Za-z_$][A-Za-z0-9_$]*\.\s*$/.test(before)) return true;

  const info   = getDocumentInfo(document);
  const offset = document.offsetAt(position);
  for (const group of info.groups) {
    if (group.call.openBrace === null || group.call.closeBrace === null) continue;
    if (offset < group.call.openBrace || offset > group.call.closeBrace) continue;
    for (const entry of group.entries) {
      if (entry.keyStart <= offset && offset <= entry.keyEnd && entry.key === word) {
        return true;
      }
    }
  }
  return false;
}

function resolveBinding(
  document: vscode.TextDocument,
  position: vscode.Position,
  word:     string,
  info:     ReturnType<typeof getDocumentInfo>
): string | null {
  const lineText = document.lineAt(position.line).text;
  const before   = lineText.slice(0, position.character);
  const memberRe = /([A-Za-z_$][A-Za-z0-9_$]*)\.\s*$/.exec(before);
  if (memberRe) return memberRe[1];

  const offset = document.offsetAt(position);
  for (const group of info.groups) {
    if (group.call.openBrace === null || group.call.closeBrace === null) continue;
    if (offset < group.call.openBrace || offset > group.call.closeBrace) continue;
    // We're inside a styles object. Walk backward from the call's open
    // paren to find the binding declaration. The chunk we slice ends
    // RIGHT BEFORE the `(`, so we DON'T anchor at end-of-string — instead,
    // we require the binding to be followed by `= <alias>.<method>` to
    // confirm it's the right declaration.
    const text     = info.text;
    const txtBefore = text.slice(Math.max(0, group.call.callOpenIdx - 200), group.call.callOpenIdx);
    const aliasRe = info.aliases.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const re = new RegExp(
      `\\b(?:const|let|var)\\s+([A-Za-z_$][A-Za-z0-9_$]*)(?![A-Za-z0-9_$])[^=]*=\\s*(?:${aliasRe})\\.(?:create|keyframes|extend)\\s*$`,
      "m"
    );
    const m = re.exec(txtBefore);
    if (m) return m[1];
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
