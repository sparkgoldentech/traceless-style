/**
 * traceless-style VS Code extension — signature help provider.
 *
 * When the user types `tl.create(`, `tl.keyframes(`, or `tl.extend(`,
 * VS Code triggers signature help. We show:
 *   - The expected argument shape for that method
 *   - A brief one-line description
 *   - Two example uses, ready to copy
 *
 * Triggered on `(` and `,` characters inside tl-method calls.
 *
 * Why a custom provider when TS already provides signature help: the
 * library's API uses a generic catch-all `StyleObject` type, which means
 * TS's signature help shows nothing useful — just `(map: AnyStyleMap)`.
 * Our provider shows the SHAPE the user should write, with concrete
 * examples for the specific method.
 */

import * as vscode from "vscode";
import { getDocumentInfo } from "../documentCache";

interface MethodSignature {
  label:       string;
  description: string;
  example:     string;
  paramName:   string;
  paramDoc:    string;
}

const SIGNATURES: Record<string, MethodSignature> = {
  create: {
    label:       "tl.create(map, options?)",
    description: "Create atomic styles. Each top-level key becomes a class string.",
    example:     "tl.create({\n  btn: { padding: '1rem', color: 'red' },\n  card: { borderRadius: '8px' },\n})",
    paramName:   "map",
    paramDoc:    "An object whose top-level keys are GROUP names and whose values are CSS-style objects. Variants like `_dark`, `_hover` nest inside groups.",
  },
  keyframes: {
    label:       "tl.keyframes(name, frames)",
    description: "Define a CSS @keyframes rule. Returns a class name to use in `animation:` values.",
    example:     "const fade = tl.keyframes('fadeIn', {\n  from: { opacity: 0 },\n  to:   { opacity: 1 },\n})",
    paramName:   "name",
    paramDoc:    "Animation name (string literal).",
  },
  extend: {
    label:       "tl.extend(options)",
    description: "Register custom variants that the compiler picks up via build-time scanning.",
    example:     "tl.extend({\n  variants: {\n    _brand: '.brand &',\n    _tablet: '@media (min-width: 900px)',\n  },\n})",
    paramName:   "options",
    paramDoc:    "Object with a `variants` key mapping variant names to CSS selectors / at-rules.",
  },
};

export class TlSignatureHelpProvider implements vscode.SignatureHelpProvider {
  provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    token:    vscode.CancellationToken,
    context:  vscode.SignatureHelpContext
  ): vscode.ProviderResult<vscode.SignatureHelp> {
    if (token.isCancellationRequested) return null;
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false) return null;

    const info   = getDocumentInfo(document);
    const offset = document.offsetAt(position);

    for (const call of info.calls) {
      if (offset <= call.callOpenIdx)  continue;
      if (offset >  call.callCloseIdx) continue;

      /* SUPPRESSION RULE — single decisive predicate.
       *
       * Bug: signature popup stayed pinned the whole time the user wrote
       * inside `tl.create({ ...lots of code... })` because the cursor
       * sits between `(` and `)` for the entire body. VS Code re-asks
       * the provider on every keystroke; previously we kept returning a
       * help record, so the popup never went away.
       *
       * Fix: when the cursor is inside the styles-object body, return
       * null UNLESS the user explicitly invoked help with
       * Ctrl+Shift+Space. Three reasons this is the right cut:
       *
       *   • `isRetrigger: true` actually means "popup is showing and
       *     VS Code is asking us to keep it" — that's the EXACT case
       *     we want to dismiss. Treating it as an "explicit" trigger
       *     was the bug.
       *   • `TriggerCharacter` (typing `(` / `,`) only fires once at
       *     the trigger position. By the time the user is inside the
       *     body typing properties, every subsequent re-ask is
       *     `ContentChange`. So suppressing everything except `Invoke`
       *     hides the popup the moment they leave the trigger position.
       *   • A user who genuinely wants the signature mid-body presses
       *     Ctrl+Shift+Space — that's `Invoke`, which still shows. */
      const insideObjectBody =
        call.openBrace  !== null &&
        call.closeBrace !== null &&
        offset > call.openBrace &&
        offset <= call.closeBrace;

      // Numeric fallbacks because tests may invoke without a context
      // arg (and JS-mocked vscode may not export the enum).
      const Invoke = (vscode.SignatureHelpTriggerKind && vscode.SignatureHelpTriggerKind.Invoke) ?? 1;
      const triggerKind = context?.triggerKind ?? Invoke;
      const isExplicitInvoke = triggerKind === Invoke && !context?.isRetrigger;

      if (insideObjectBody && !isExplicitInvoke) return null;

      const sig = SIGNATURES[call.method];
      if (!sig) return null;

      const help = new vscode.SignatureHelp();
      const info_ = new vscode.SignatureInformation(sig.label);
      info_.documentation = new vscode.MarkdownString(
        `${sig.description}\n\n**Example:**\n\`\`\`ts\n${sig.example}\n\`\`\``
      );
      const param = new vscode.ParameterInformation(sig.paramName, new vscode.MarkdownString(sig.paramDoc));
      info_.parameters = [param];
      help.signatures = [info_];
      help.activeSignature = 0;
      help.activeParameter = 0;
      return help;
    }
    return null;
  }
}
