/**
 * traceless-style VS Code extension — entry point.
 *
 * Wires up every language feature this extension contributes. Each
 * provider is wrapped through `safeProvider` so a single bug in one
 * provider can never propagate to VS Code's host process — the same
 * shape Pylance / ESLint / Tailwind IntelliSense ship with. If a
 * provider throws, the failure is logged to our local output channel
 * (`View → Output → traceless-style`) and the call returns a safe
 * empty default that VS Code interprets as "no contribution."
 *
 *   Language services
 *   ─────────────────
 *   - Completion provider          CSS properties, values, variants, keyframe stops
 *   - Color provider               Inline swatches + click-to-pick color picker
 *   - Hover provider               CSS docs + MDN links + variant selectors + color resolution
 *   - Diagnostic provider          Unknown properties, non-literal values, suspicious values
 *   - Contrast diagnostics         Inline WCAG 2.1 §1.4.3/§1.4.6/§1.4.11 audits
 *   - Code-action provider         Quick-fixes incl. AAA-grade contrast replacements
 *   - Code-lens provider           Actionable summary above each tl.create / keyframes call
 *   - Document-symbol provider     Outline view + breadcrumb
 *   - Definition provider          Ctrl+click `$.btn` → its declaration
 *   - References provider          Shift+F12 finds every `$.btn` usage
 *   - Rename provider              F2 renames a key + all its usages atomically
 *   - Signature help provider      Shows `tl.create / keyframes / extend` signatures
 *   - Folding-range provider       Collapse `tl.create` groups + variants
 *   - Selection-range provider     Smart selection growth
 *   - Workspace-symbol provider    Ctrl+T searches every group
 *   - Inlay-hints provider         Rule counts next to group keys
 *
 *   UI surfaces
 *   ───────────
 *   - Status bar                   Current file's group + rule count, click → output channel
 *   - CSS preview webview          Live-rendered emitted CSS for the active file
 *   - Output channel               Privacy-respecting local logging
 *   - Walkthrough                  First-run onboarding tour
 *
 *   Commands
 *   ────────
 *   - traceless-style.sortKeys     Sort tl.create keys at cursor
 *   - traceless-style.previewCss   Open the live CSS preview for the active file
 *   - traceless-style.showLogs     Open the output channel
 *
 * Performance: a per-document AST cache (documentCache.ts) means each
 * provider reads pre-walked structure instead of re-parsing on every
 * keystroke. At 30+ providers × 60 keys/sec, that's the difference
 * between snappy and laggy.
 *
 * Privacy: telemetry-free. Local output channel only.
 */

import * as vscode from "vscode";
import { TlCompletionProvider }     from "./providers/completion";
import { TlColorProvider }          from "./providers/colors";
import { TlHoverProvider }          from "./providers/hover";
import { TlCodeActionProvider }     from "./providers/codeActions";
import { TlDocumentSymbolProvider } from "./providers/symbols";
import { TlDefinitionProvider }     from "./providers/definition";
import { TlReferencesProvider }     from "./providers/references";
import { TlRenameProvider }         from "./providers/rename";
import { TlSignatureHelpProvider }  from "./providers/signatureHelp";
import { TlFoldingProvider }        from "./providers/folding";
import { TlSelectionRangeProvider } from "./providers/selectionRanges";
import { TlWorkspaceSymbolProvider }from "./providers/workspaceSymbols";
import { TlInlayHintsProvider }     from "./providers/inlayHints";
import { TlCodeLensProvider }       from "./providers/codeLens";
import { registerDiagnostics }      from "./providers/diagnostics";
import { sortKeysAtCursor }         from "./commands/sortKeys";
import { registerStatusBar }        from "./statusBar";
import { invalidate as invalidateCache } from "./documentCache";
import { previewCssCommand, registerPreview } from "./preview";
import { error, info, showChannel, warn }     from "./logger";
import { safe, safeProvider }                 from "./safe";

const SUPPORTED_LANGUAGES: vscode.DocumentSelector = [
  { language: "typescript",       scheme: "file" },
  { language: "typescriptreact",  scheme: "file" },
  { language: "javascript",       scheme: "file" },
  { language: "javascriptreact",  scheme: "file" },
];

/* Trigger characters — kept tight on purpose.
 *
 *   :   after `display:` we want the value list to pop.
 *   {   opening a group or variant body.
 *   _   variant keys all start with underscore.
 *
 * We DO NOT trigger on `,`, ` `, `"`, `'`, or `;`. Those characters
 * mean "I just finished a property" or "I'm typing inside a value" —
 * popping suggestions there is the classic annoyance where pressing
 * Enter to start a new line accidentally inserts a property. Whenever
 * the user actually starts typing a new key (any identifier character
 * a/b/c/...) VS Code's quickSuggestions still opens the menu via the
 * standard "trigger on typing" path. */
const COMPLETION_TRIGGERS    = [":", "{", "_"];
const SIGNATURE_TRIGGERS     = ["(", ","];

export function activate(context: vscode.ExtensionContext): void {
  info(`activating — extension v${context.extension?.packageJSON?.version ?? "?"}`);

  const t0 = performance.now();
  const workspaceSymbols = new TlWorkspaceSymbolProvider();
  const codeLens         = new TlCodeLensProvider();

  /* Each provider is wrapped through safeProvider so a thrown exception
     in one provider can never propagate to VS Code's host. The wrapper
     also threads cancellation tokens — when VS Code aborts a request
     mid-flight (because the user typed another character), our heavy
     work bails fast instead of finishing a stale call. */
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      SUPPORTED_LANGUAGES,
      safeProvider("completion", new TlCompletionProvider()),
      ...COMPLETION_TRIGGERS
    ),
    vscode.languages.registerColorProvider(SUPPORTED_LANGUAGES, safeProvider("color", new TlColorProvider())),
    vscode.languages.registerHoverProvider(SUPPORTED_LANGUAGES, safeProvider("hover", new TlHoverProvider())),
    vscode.languages.registerCodeActionsProvider(
      SUPPORTED_LANGUAGES,
      safeProvider("codeActions", new TlCodeActionProvider()),
      { providedCodeActionKinds: TlCodeActionProvider.providedCodeActionKinds }
    ),
    vscode.languages.registerCodeLensProvider(SUPPORTED_LANGUAGES, safeProvider("codeLens", codeLens)),
    vscode.languages.registerDocumentSymbolProvider(SUPPORTED_LANGUAGES, safeProvider("symbols", new TlDocumentSymbolProvider())),
    vscode.languages.registerDefinitionProvider(SUPPORTED_LANGUAGES, safeProvider("definition", new TlDefinitionProvider())),
    vscode.languages.registerReferenceProvider(SUPPORTED_LANGUAGES, safeProvider("references", new TlReferencesProvider())),
    vscode.languages.registerRenameProvider(SUPPORTED_LANGUAGES, safeProvider("rename", new TlRenameProvider())),
    vscode.languages.registerSignatureHelpProvider(
      SUPPORTED_LANGUAGES,
      safeProvider("signatureHelp", new TlSignatureHelpProvider()),
      ...SIGNATURE_TRIGGERS
    ),
    vscode.languages.registerFoldingRangeProvider(SUPPORTED_LANGUAGES, safeProvider("folding", new TlFoldingProvider())),
    vscode.languages.registerSelectionRangeProvider(SUPPORTED_LANGUAGES, safeProvider("selectionRanges", new TlSelectionRangeProvider())),
    vscode.languages.registerWorkspaceSymbolProvider(safeProvider("workspaceSymbols", workspaceSymbols)),
    vscode.languages.registerInlayHintsProvider(SUPPORTED_LANGUAGES, safeProvider("inlayHints", new TlInlayHintsProvider())),

    /* CodeLens reacts to config flips that affect what it surfaces. */
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration("traceless-style.codeLens") ||
        e.affectsConfiguration("traceless-style.enable") ||
        e.affectsConfiguration("traceless-style.identifierAliases")
      ) codeLens.refresh();
    }),

    /* Document-cache invalidation on close. */
    vscode.workspace.onDidCloseTextDocument(d => invalidateCache(d.uri)),

    /* Workspace-symbols cache invalidation. */
    vscode.workspace.onDidChangeTextDocument(e => workspaceSymbols.invalidate(e.document.uri)),
    vscode.workspace.onDidSaveTextDocument(d   => workspaceSymbols.invalidate(d.uri)),
    vscode.workspace.onDidDeleteFiles(e => e.files.forEach(u => workspaceSymbols.invalidate(u))),

    /* Commands — each wrapped through `safe` so a thrown command never
       shows the dreaded "extension caused an error" toast. */
    vscode.commands.registerCommand("traceless-style.sortKeys", () =>
      safe("cmd.sortKeys", () => sortKeysAtCursor(), undefined)),
    vscode.commands.registerCommand("traceless-style.previewCss", (...args: unknown[]) =>
      safe("cmd.previewCss", () => previewCssCommand(args[0] as vscode.Uri | undefined), undefined)),
    vscode.commands.registerCommand("traceless-style.showLogs", () =>
      safe("cmd.showLogs", () => showChannel(), undefined)),
  );

  /* Diagnostics + status bar + preview — each registers its own
     listeners. We try/catch each so one failing doesn't prevent the
     others from coming up; users see a warn line in the output channel
     instead of a missing feature with no explanation. */
  try { registerDiagnostics(context); } catch (e) { warn(`diagnostics: ${(e as Error).message}`); error("diagnostics setup", e); }
  try { registerStatusBar(context);   } catch (e) { warn(`status bar: ${(e as Error).message}`);  error("statusBar setup", e); }
  try { registerPreview(context);     } catch (e) { warn(`preview: ${(e as Error).message}`);     error("preview setup", e); }

  info(`activated in ${(performance.now() - t0).toFixed(1)} ms — ${context.subscriptions.length} subscriptions`);
}

export function deactivate(): void {
  // VS Code disposes everything in `context.subscriptions` automatically.
  info("deactivated");
}
