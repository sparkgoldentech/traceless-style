/**
 * traceless-style VS Code extension — code-lens provider.
 *
 * Renders an actionable summary line above every `tl.create({...})`,
 * `tl.keyframes(...)`, and `tl.extend({...})` call:
 *
 *     +-------------------------------------------------------+
 *     |  *  12 atomic rules . 3 variants . 2 _dark overrides  |
 *     |     Preview emitted CSS . Sort keys . Audit contrast  |
 *     +-------------------------------------------------------+
 *     const $ = tl.create({
 *       btn: { …
 *
 * Each segment is its own clickable lens command. Same shape Tailwind
 * IntelliSense / Pylance / Stylelint use to surface "the action you
 * probably want next" without forcing the user to memorize commands.
 *
 * Performance: served from `documentCache` so re-renders during typing
 * cost ~0.1 ms. The provider returns a flat list; VS Code groups them
 * onto a single line above the call when they fit.
 */

import * as vscode from "vscode";
import { getDocumentInfo } from "../documentCache";
import { trace } from "../logger";

interface CallStats {
  rules:        number;
  variants:     number;
  darkOverrides:number;
  groupCount:   number;
}

export class TlCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  /** Force a re-render — wired to config changes that affect what we surface. */
  refresh(): void { this._onDidChange.fire(); }

  provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false)   return [];
    if (cfg.get<boolean>("codeLens") === false) return [];

    const info = getDocumentInfo(document);
    if (info.calls.length === 0)                return [];

    const lenses: vscode.CodeLens[] = [];
    for (const call of info.calls) {
      if (token.isCancellationRequested) return lenses;

      // Anchor the lens on the line that contains `tl.<method>(`.
      const start = document.positionAt(call.callOpenIdx);
      const lensRange = new vscode.Range(start.line, 0, start.line, 0);

      const stats = computeStats(info, call);
      const summary = summarize(call.method, stats);
      const fileUri = document.uri;

      // Primary lens — informational summary, click jumps cursor here.
      lenses.push(new vscode.CodeLens(lensRange, {
        title:     `$(zap) ${summary}`,
        tooltip:   `traceless-style ${call.method} call`,
        command:   "revealLine",
        arguments: [{ lineNumber: start.line, at: "center" }],
      }));

      // Action: preview the emitted CSS for this file.
      if (call.method === "create" || call.method === "keyframes") {
        lenses.push(new vscode.CodeLens(lensRange, {
          title:     "Preview emitted CSS",
          tooltip:   "Open a side panel with the CSS this file would produce.",
          command:   "traceless-style.previewCss",
          arguments: [fileUri],
        }));
      }

      // Action: sort keys at this call site.
      if (call.method === "create") {
        lenses.push(new vscode.CodeLens(lensRange, {
          title:     "Sort keys",
          tooltip:   "Alphabetize the top-level keys of this tl.create call.",
          command:   "traceless-style.sortKeys",
          arguments: [fileUri, start],
        }));
      }

      // Action: audit contrast for this file (jumps the user to the
      // problems panel filtered to this document's contrast diagnostics).
      lenses.push(new vscode.CodeLens(lensRange, {
        title:     "Audit contrast",
        tooltip:   "Open the Problems panel filtered to traceless-style diagnostics.",
        command:   "workbench.actions.view.problems",
      }));
    }

    trace(`codeLens: ${lenses.length} lens${lenses.length === 1 ? "" : "es"} for ${document.uri.fsPath}`);
    return lenses;
  }

  resolveCodeLens(lens: vscode.CodeLens): vscode.CodeLens {
    return lens;  // already fully populated
  }
}

/* ── stats ────────────────────────────────────────────────── */

function computeStats(info: ReturnType<typeof getDocumentInfo>, call: typeof info.calls[number]): CallStats {
  const group = info.groups.find(g => g.call === call);
  if (!group) return { rules: 0, variants: 0, darkOverrides: 0, groupCount: 0 };

  let rules         = 0;
  let variants      = 0;
  let darkOverrides = 0;
  const groupCount  = group.entries.length;

  for (const entry of group.entries) {
    if (entry.valueKind === "object") {
      // Walk inside the group body to count leaf rules + variant blocks.
      // Cheap text scan — same approximation the status bar uses.
      const body = info.text.slice(entry.valueStart + 1, entry.valueEnd - 1);
      let i = 0;
      while (i < body.length) {
        const ch = body[i];
        if (ch === '"' || ch === "'" || ch === "`") {
          const q = ch; i++;
          while (i < body.length && body[i] !== q) { if (body[i] === "\\") i += 2; else i++; }
          i++; continue;
        }
        // Variant blocks start with `_<ident>:` and contain a nested object.
        if (ch === "_" && /[A-Za-z]/.test(body[i + 1] ?? "")) {
          const matchEnd = body.slice(i).search(/[^\w]/);
          const key = matchEnd > 0 ? body.slice(i, i + matchEnd) : body.slice(i);
          // Skip the special non-variant control keys.
          const isVariantLike = !["_autoDark","_autoRtl","_layer","_bundle","_skipContrast","_decorative"].includes(key);
          if (isVariantLike) variants++;
          if (key === "_dark") darkOverrides++;
        }
        if (ch === ":") {
          // Look ahead — leaf or nested.
          let j = i + 1;
          while (j < body.length && /\s/.test(body[j])) j++;
          const next = body[j];
          if (next === '"' || next === "'" || next === "`" || /[-0-9.]/.test(next)) rules++;
        }
        i++;
      }
    } else if (entry.valueKind === "string" || entry.valueKind === "number") {
      rules++;
    }
  }
  return { rules, variants, darkOverrides, groupCount };
}

function summarize(method: string, s: CallStats): string {
  if (method === "create") {
    const segs = [`${s.groupCount} group${s.groupCount === 1 ? "" : "s"}`,
                  `${s.rules} rule${s.rules === 1 ? "" : "s"}`];
    if (s.variants > 0)      segs.push(`${s.variants} variant${s.variants === 1 ? "" : "s"}`);
    if (s.darkOverrides > 0) segs.push(`${s.darkOverrides} _dark override${s.darkOverrides === 1 ? "" : "s"}`);
    return segs.join(" · ");
  }
  if (method === "keyframes") return `keyframes — ${s.rules} step${s.rules === 1 ? "" : "s"}`;
  if (method === "extend")    return `extend — ${s.groupCount} variant${s.groupCount === 1 ? "" : "s"}`;
  return `tl.${method}`;
}
