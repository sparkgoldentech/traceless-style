/**
 * traceless-style VS Code extension — workspace symbol provider.
 *
 * Surfaces every `tl.create` group key from every TS/JS file in the
 * workspace through the `Ctrl+T` (Open Symbol by Name) palette. With
 * a project of 50+ style files, this is the fastest way to jump to a
 * specific rule.
 *
 * Indexing strategy:
 *   - Lazy: scan files only on the first request, then cache.
 *   - Reactive: invalidate the cache for a file when it changes/saves.
 *   - Bounded: limit to 1,000 files per scan to avoid pathological cases.
 *
 * VS Code calls `provideWorkspaceSymbols(query)` with the user's typed
 * filter; we return all symbols and let the editor do its own fuzzy
 * matching (it's faster + more consistent than a custom one).
 */

import * as vscode from "vscode";
import { findTlCalls, walkObjectEntries } from "../srcWalker";

const SUPPORTED_GLOB = "**/*.{ts,tsx,js,jsx}";
const FILE_LIMIT     = 1000;

interface CachedSymbols {
  /** Document version when the cache was computed. */
  version: number;
  symbols: vscode.SymbolInformation[];
}

export class TlWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  private cache = new Map<string, CachedSymbols>();

  /** Hooked from extension.ts to invalidate on file changes. */
  invalidate(uri: vscode.Uri): void {
    this.cache.delete(uri.toString());
  }

  async provideWorkspaceSymbols(
    _query: string,
    token:  vscode.CancellationToken
  ): Promise<vscode.SymbolInformation[]> {
    const cfg = vscode.workspace.getConfiguration("traceless-style");
    if (cfg.get<boolean>("enable") === false) return [];
    const aliases = cfg.get<string[]>("identifierAliases") ?? ["tl"];

    const uris = await vscode.workspace.findFiles(
      SUPPORTED_GLOB,
      "**/node_modules/**",
      FILE_LIMIT,
      token
    );
    if (token.isCancellationRequested) return [];

    const results: vscode.SymbolInformation[] = [];
    for (const uri of uris) {
      if (token.isCancellationRequested) break;
      const symbols = await this.symbolsForFile(uri, aliases);
      results.push(...symbols);
    }
    return results;
  }

  private async symbolsForFile(uri: vscode.Uri, aliases: string[]): Promise<vscode.SymbolInformation[]> {
    const cached = this.cache.get(uri.toString());
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(uri);
    } catch {
      return [];
    }
    if (cached && cached.version === doc.version) return cached.symbols;

    const text     = doc.getText();
    const calls    = findTlCalls(text, aliases);
    const symbols: vscode.SymbolInformation[] = [];

    for (const call of calls) {
      if (call.openBrace === null || call.closeBrace === null) continue;
      for (const entry of walkObjectEntries(text, call.openBrace + 1, call.closeBrace)) {
        const range = new vscode.Range(doc.positionAt(entry.keyStart), doc.positionAt(entry.valueEnd));
        const containerName =
          call.method === "keyframes"
            ? `tl.keyframes${call.keyframeName ? `: ${call.keyframeName}` : ""}`
            : `tl.${call.method}`;
        symbols.push(new vscode.SymbolInformation(
          entry.key,
          entry.key.startsWith("_") ? vscode.SymbolKind.Event : vscode.SymbolKind.Field,
          containerName,
          new vscode.Location(uri, range)
        ));
      }
    }
    this.cache.set(uri.toString(), { version: doc.version, symbols });
    return symbols;
  }
}
