/**
 * traceless-style VS Code extension — safe.ts
 *
 * Error boundaries + cancellation-token discipline for every language
 * provider this extension contributes. The single most important
 * difference between an extension that ships in the VS Code Marketplace
 * and one that quietly takes the editor down: the marketplace one
 * NEVER crashes. It catches everything, logs it locally, and returns a
 * safe default so VS Code's host process keeps humming.
 *
 * Every provider method that VS Code calls is wrapped through one of
 * these helpers. The wrapped function:
 *
 *   1. Catches every exception — sync OR async (rejected promise).
 *   2. Logs the failure to our output channel WITH the provider name
 *      and the underlying stack, so users can paste it into bug reports.
 *   3. Returns a sensible empty default (`undefined`, `[]`, `null`) that
 *      VS Code interprets as "this provider has nothing to contribute."
 *   4. Honors the cancellation token — if the request was cancelled
 *      before our work finishes, we return early and don't waste cycles.
 *
 * This is the same shape Pylance / ESLint / Tailwind IntelliSense use.
 * It's why those extensions never appear in the "Disabled because it
 * caused VS Code to become unresponsive" list.
 */

import * as vscode from "vscode";
import { error, time } from "./logger";

/** A provider method's normal return type, narrowed for our wrappers. */
type Returnable = unknown | Thenable<unknown>;

/**
 * Wrap a provider method that returns synchronously OR returns a
 * Thenable. The wrapper:
 *   - times the call (verbose only),
 *   - returns `defaultValue` on any thrown / rejected error,
 *   - returns `defaultValue` if the cancellation token signals first.
 *
 * Use as a HOF when registering: instead of
 *   languages.registerHoverProvider(LANGS, new TlHoverProvider());
 * write
 *   languages.registerHoverProvider(LANGS, safeProvider("hover", new TlHoverProvider()));
 *
 * The factory `safeProvider` below uses this for every method on a
 * provider object. You can also call `safe()` directly for one-off
 * commands or callbacks.
 */
export function safe<T>(
  label:        string,
  fn:           () => T | Thenable<T>,
  defaultValue: T,
  token?:       vscode.CancellationToken,
): T | Thenable<T> {
  if (token?.isCancellationRequested) return defaultValue;
  const stop = time(label);
  try {
    const result = fn();
    if (result && typeof (result as PromiseLike<T>).then === "function") {
      return (result as PromiseLike<T>).then(
        v => { stop(); return v; },
        (e: unknown) => {
          stop();
          error(`${label} failed (async)`, e);
          return defaultValue;
        }
      );
    }
    stop();
    return result;
  } catch (e) {
    stop();
    error(`${label} failed`, e);
    return defaultValue;
  }
}

/**
 * Wrap every method on a provider with `safe`. Returns a fresh object
 * with the same shape — VS Code can't tell the difference. Each method
 * gets its own label like `hover.provideHover` for tracing, and a
 * sensible default return value based on the method name.
 */
export function safeProvider<T extends object>(prefix: string, instance: T): T {
  const wrapped: Record<string, unknown> = Object.create(Object.getPrototypeOf(instance));
  for (const k of allMethodNames(instance)) {
    const fn = (instance as unknown as Record<string, unknown>)[k];
    if (typeof fn !== "function") {
      wrapped[k] = fn;
      continue;
    }
    const label = `${prefix}.${k}`;
    const def   = defaultForMethod(k);
    wrapped[k] = function (...args: unknown[]): unknown {
      // The cancellation token is the LAST argument for most provider
      // methods (signature varies; many have it second-to-last). We grep
      // for any argument that has `isCancellationRequested` to be robust
      // against future signature changes.
      const token = findCancellationToken(args);
      return safe(
        label,
        () => (fn as (...a: unknown[]) => unknown).apply(instance, args),
        def,
        token
      );
    };
  }
  return wrapped as T;
}

/* ── helpers ─────────────────────────────────────────────────────── */

function allMethodNames(obj: object): string[] {
  const names = new Set<string>();
  // Walk the prototype chain (skip Object.prototype) so methods defined
  // on the class are picked up regardless of whether they're own or
  // inherited.
  let cur: object | null = obj;
  while (cur && cur !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(cur)) {
      if (k === "constructor") continue;
      const desc = Object.getOwnPropertyDescriptor(cur, k);
      if (desc && typeof desc.value === "function") names.add(k);
    }
    cur = Object.getPrototypeOf(cur);
  }
  return [...names];
}

function findCancellationToken(args: unknown[]): vscode.CancellationToken | undefined {
  for (const a of args) {
    if (a && typeof a === "object" && "isCancellationRequested" in (a as object)) {
      return a as vscode.CancellationToken;
    }
  }
  return undefined;
}

/**
 * Best-effort safe-default for a provider method, keyed on the method
 * name. VS Code's provider interfaces all return either an array, a
 * single value, or null/undefined for "no contribution"; the helpers
 * below match the shapes the host expects so a returned default never
 * surprises VS Code with a wrong-shape value.
 */
function defaultForMethod(method: string): Returnable {
  // Methods that return arrays (collections of items).
  if (
    method.startsWith("provideCodeActions") ||
    method.startsWith("provideCodeLenses") ||
    method.startsWith("provideColorPresentations") ||
    method.startsWith("provideDocumentColors") ||
    method.startsWith("provideFoldingRanges") ||
    method.startsWith("provideInlayHints") ||
    method.startsWith("provideReferences") ||
    method.startsWith("provideDocumentSymbols") ||
    method.startsWith("provideWorkspaceSymbols") ||
    method.startsWith("provideSelectionRanges") ||
    method.startsWith("provideCompletionItems") ||
    method.startsWith("provideDocumentLinks") ||
    method === "provideDocumentSemanticTokens"
  ) {
    return [];
  }
  // Methods that return null when nothing applies.
  if (
    method.startsWith("provideHover") ||
    method.startsWith("provideDefinition") ||
    method.startsWith("provideTypeDefinition") ||
    method.startsWith("provideImplementation") ||
    method.startsWith("provideRenameEdits") ||
    method.startsWith("prepareRename") ||
    method.startsWith("provideSignatureHelp") ||
    method.startsWith("provideDocumentFormattingEdits")
  ) {
    return null;
  }
  return undefined;
}
