/**
 * traceless-style VS Code extension — documentCache.ts
 *
 * Per-document, version-keyed cache for the source-walking results that
 * every provider needs. Without this, each completion / hover / definition
 * keystroke re-walks the whole file (5–50 ms × 12 providers × every tap).
 * With this, we walk once per document change and serve every provider
 * from cached arrays.
 *
 * Cache discipline:
 *   - Keyed on `(uri, version)` — VS Code increments `document.version`
 *     on every text edit, so a stale entry can never be served.
 *   - LRU eviction at 32 documents. The cap exists only for memory; in
 *     practice users have 5–15 tabs open at once, well under the limit.
 *   - On document close, we drop the entry immediately to keep memory
 *     small. Re-opening the same file rebuilds in <5 ms.
 *
 * Thread safety: VS Code extensions run on a single thread; no locks
 * needed. The cache is intentionally simple Map-backed.
 *
 * What it caches:
 *   - tlCalls:        every `tl.<method>(...)` call's structural info
 *   - groupEntries:   pre-walked group keys with their value ranges
 *
 * Providers should call `getDocumentInfo(document)` rather than calling
 * `findTlCalls` / `walkObjectEntries` directly. The cache returns cached
 * data when available and rebuilds on miss.
 */

import * as vscode from "vscode";
import { findTlCalls, walkObjectEntries, type TlCall, type ObjectEntry } from "./srcWalker";

interface GroupRecord {
  call:    TlCall;
  entries: ObjectEntry[];
}

export interface DocumentInfo {
  /** Document version this snapshot reflects. */
  version: number;
  /** Source text at that version (kept so providers can slice without re-fetching). */
  text:    string;
  /** All `tl.<method>(...)` calls in the file. */
  calls:   TlCall[];
  /** For each call, the top-level entries in its styles object — pre-walked for speed. */
  groups:  GroupRecord[];
  /** Aliases used to detect calls (so a config change forces a rebuild). */
  aliases: string[];
}

const MAX_ENTRIES = 32;

const _cache = new Map<string, DocumentInfo>();
let   _aliasesCacheKey = "";

/**
 * Read or build the cached info for `document`. Cache-miss path runs the
 * full walker; hit path is O(1).
 */
export function getDocumentInfo(document: vscode.TextDocument): DocumentInfo {
  const cfg     = vscode.workspace.getConfiguration("traceless-style");
  const aliases = cfg.get<string[]>("identifierAliases") ?? ["tl"];
  const aliasKey = aliases.join("|");

  // If aliases changed since the last cache fill, blow the whole cache.
  if (aliasKey !== _aliasesCacheKey) {
    _cache.clear();
    _aliasesCacheKey = aliasKey;
  }

  const key      = document.uri.toString();
  const existing = _cache.get(key);
  if (existing && existing.version === document.version) return existing;

  // Cache miss — walk and store.
  const text   = document.getText();
  const calls  = findTlCalls(text, aliases);
  const groups: GroupRecord[] = calls.map(call => ({
    call,
    entries: call.openBrace !== null && call.closeBrace !== null
      ? [...walkObjectEntries(text, call.openBrace + 1, call.closeBrace)]
      : [],
  }));

  const info: DocumentInfo = { version: document.version, text, calls, groups, aliases };
  _cache.set(key, info);

  // LRU-ish eviction: when we exceed the cap, drop the oldest entry. Map
  // iteration is insertion-ordered in JS, so the first key is the oldest.
  if (_cache.size > MAX_ENTRIES) {
    const firstKey = _cache.keys().next().value;
    if (firstKey) _cache.delete(firstKey);
  }
  return info;
}

/** Drop an entry — call from `onDidCloseTextDocument` to release memory. */
export function invalidate(uri: vscode.Uri): void {
  _cache.delete(uri.toString());
}

/** Clear everything — useful when the user changes settings that affect parsing. */
export function clearCache(): void {
  _cache.clear();
}

/** Expose stats for diagnostics + potential future status-bar use. */
export function getCacheStats(): { size: number; max: number } {
  return { size: _cache.size, max: MAX_ENTRIES };
}
