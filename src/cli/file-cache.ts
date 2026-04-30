/**
 * traceless-style — cli/file-cache.ts
 *
 * File-level cache for incremental extraction. At FB/X scale (10K+
 * source files), re-extracting every file on every save is the dominant
 * cost; most files don't change between runs. This module shortcuts the
 * unchanged ones.
 *
 * Cache key: SHA-256 of the source text. Content-addressed (mtime alone
 * is unreliable across CI clones, branch switches, IDE plays). Stored at
 * `.traceless-style/cache.json` so it survives across runs.
 *
 * Cache contents per file:
 *   - inputHash:    sha256 of the source code
 *   - rules:        AtomicRule[] the extractor produced for this file
 *   - customVars:   custom variants the file registered (Pass 1 detection)
 *   - exportedTokens: token shapes exported from the file (Pass 0)
 *
 * Invariants:
 *   1. The cache key is the source TEXT hash. If extraction logic
 *      changes (e.g. new pseudo-element built-in), the user must bump
 *      `CACHE_VERSION` to invalidate everything. Mismatched cache is
 *      worse than no cache.
 *   2. The cache is read-once / written-once per `extract()` call —
 *      we never partial-write or interleave with other producers.
 *   3. Failure to read or write the cache is a soft error: extraction
 *      still works, just slower. We log + skip.
 */

import fs   from "fs";
import path from "path";
import crypto from "crypto";
import type { AtomicRule } from "../compiler/css-gen";

/** Bumping this string invalidates every existing cache entry. Bump it
 *  any time the extraction output format or default behavior changes. */
const CACHE_VERSION = "v3-keyframe-bindings";

export interface FileCacheEntry {
  inputHash:    string;
  rules:        AtomicRule[];
  customVars:   Record<string, string>;
  /** Files with `tl.defineTokens` export shape. Cleared per run, but keep
   *  the data here too so PASS 0 can be skipped on cache hits. */
  exportedTokens?: unknown;
}

interface CacheFile {
  version: string;
  entries: Record<string, FileCacheEntry>;  // file path → entry
}

export class FileCache {
  private root:    string;
  private path:    string;
  private map:     Map<string, FileCacheEntry> = new Map();
  private dirty:   boolean = false;

  /** Stats — useful for the CLI to print "X cache hits, Y misses". */
  public hits = 0;
  public misses = 0;

  constructor(rootDir: string) {
    this.root = rootDir;
    this.path = path.join(rootDir, ".traceless-style", "cache.json");
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.path)) return;
      const raw = fs.readFileSync(this.path, "utf8");
      const parsed = JSON.parse(raw) as CacheFile;
      if (parsed.version !== CACHE_VERSION) return; // version mismatch → wipe
      for (const [k, v] of Object.entries(parsed.entries)) {
        this.map.set(k, v);
      }
    } catch {
      // Soft fail — extract from scratch.
      this.map.clear();
    }
  }

  /**
   * Get the cached entry for a file IF the input hash matches the
   * current source. Returns null on miss. Increments stats.
   */
  get(file: string, currentSource: string): FileCacheEntry | null {
    const hash = sha256(currentSource);
    const entry = this.map.get(file);
    if (entry && entry.inputHash === hash) {
      this.hits++;
      return entry;
    }
    this.misses++;
    return null;
  }

  /** Update or insert the entry for a file. Marks the cache dirty so it
   *  gets flushed on `save()`. */
  set(file: string, currentSource: string, entry: Omit<FileCacheEntry, "inputHash">): void {
    this.map.set(file, { ...entry, inputHash: sha256(currentSource) });
    this.dirty = true;
  }

  /**
   * Drop entries for files that no longer exist. Prevents the cache
   * from growing unboundedly when files are deleted/renamed.
   */
  prune(currentFiles: Set<string>): void {
    for (const file of [...this.map.keys()]) {
      if (!currentFiles.has(file)) {
        this.map.delete(file);
        this.dirty = true;
      }
    }
  }

  /** Flush to disk. Idempotent — calling without dirty changes is a no-op. */
  save(): void {
    if (!this.dirty) return;
    try {
      fs.mkdirSync(path.dirname(this.path), { recursive: true });
      const data: CacheFile = {
        version: CACHE_VERSION,
        entries: Object.fromEntries(this.map),
      };
      // Atomic write: tmp file + rename, so a Ctrl+C mid-write doesn't
      // corrupt the cache for the next run.
      const tmp = this.path + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, this.path);
      this.dirty = false;
    } catch {
      /* soft fail; we'll just rebuild next time */
    }
  }
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}
