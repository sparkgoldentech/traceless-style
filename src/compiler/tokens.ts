/**
 * traceless-style — compiler/tokens.ts
 *
 * Shared registry for design tokens and themes. Mirrors the role of
 * `globalRegistry` (atomic rules) and `BUILT_IN_VARIANTS` (variants):
 * a process-singleton populated by the extractor and consumed by
 * `css-gen.ts` to emit `:root` and theme-class CSS.
 *
 * Both runtime helpers (tl.defineTokens / tl.createTheme / tl.cssVar)
 * AND compile-time emission share the hash functions in this file so
 * the names line up — exactly the same invariant we maintain between
 * compiler/hash.ts and runtime/index.ts.
 */

import { fnv32a } from "./hash";

/** A single token: a CSS variable name and its light value, optionally
 *  paired with an auto-derived dark value. The presence of `darkValue`
 *  causes css-gen to emit a matching `.dark` rule that re-binds the same
 *  variable, so every component that uses `var(--name)` flips
 *  automatically when `<html class="dark">` is applied — no theme class,
 *  no `_dark:` block, no developer code at all. */
export interface TokenEntry {
  /** The CSS variable name *without* leading `--` (e.g. `tl-brand-primary`). */
  name:       string;
  value:      string;
  darkValue?: string;
}

/** A theme override: a class name and the (varName → newValue) it sets. */
export interface ThemeEntry {
  /** Class name with no leading dot (e.g. `scThemeAbc123`). */
  cls:       string;
  overrides: Array<{ name: string; value: string }>;
}

/**
 * A registered @keyframes rule: a hashed identifier and the per-step
 * declarations. Each step's body is itself a flat (prop → value) map,
 * already passed through the same property allowlist + value validators
 * as `tl.create()` so we never emit an unknown property or a value
 * that contains an injection sequence.
 */
export interface KeyframeEntry {
  /** Identifier name, e.g. `scKfAbc123` — no leading `@keyframes`. */
  name:  string;
  /** Each step: `from`, `to`, or a percentage like `50%`. */
  steps: Array<{ stop: string; decls: Array<{ prop: string; value: string }> }>;
}

/**
 * The shape of a `defineTokens` result, with each leaf replaced by its
 * `var(--sc-<hash>)` string. Used by the import resolver to rewrite
 * cross-file `tokens.brand.primary`-style member accesses inside
 * `tl.create()` arguments back into literal strings.
 *
 * Recursive: nested groups produce nested objects; leaves are strings.
 */
export type NestedTokenShape = { [key: string]: string | NestedTokenShape };

class TokenRegistry {
  private tokens     = new Map<string, TokenEntry>();
  private themes     = new Map<string, ThemeEntry>();
  private keyframes  = new Map<string, KeyframeEntry>();

  addToken(name: string, value: string, darkValue?: string): TokenEntry {
    const existing = this.tokens.get(name);
    if (existing) {
      // First-write-wins for the light value; later calls can fill in a
      // darkValue if one wasn't computed earlier.
      if (darkValue && !existing.darkValue) existing.darkValue = darkValue;
      return existing;
    }
    const entry: TokenEntry = { name, value, darkValue };
    this.tokens.set(name, entry);
    return entry;
  }

  addTheme(cls: string, overrides: Array<{ name: string; value: string }>): ThemeEntry {
    const existing = this.themes.get(cls);
    if (existing) return existing;
    const entry: ThemeEntry = { cls, overrides };
    this.themes.set(cls, entry);
    return entry;
  }

  addKeyframe(name: string, steps: KeyframeEntry["steps"]): KeyframeEntry {
    const existing = this.keyframes.get(name);
    if (existing) return existing;
    const entry: KeyframeEntry = { name, steps };
    this.keyframes.set(name, entry);
    return entry;
  }

  getTokens():    TokenEntry[]    { return [...this.tokens.values()]; }
  getThemes():    ThemeEntry[]    { return [...this.themes.values()]; }
  getKeyframes(): KeyframeEntry[] { return [...this.keyframes.values()]; }

  clear(): void {
    this.tokens.clear();
    this.themes.clear();
    this.keyframes.clear();
  }
}

export const tokenRegistry = new TokenRegistry();

/**
 * What an exported binding actually is — either a concrete token shape
 * (the result of a local `defineTokens`) or a re-export pointing somewhere
 * else. The `resolve()` lookup follows re-exports recursively with cycle
 * detection, so `export { x } from "./a"` chains resolve transparently.
 */
export type TokenExportEntry =
  | { kind: "shape";  shape: NestedTokenShape }
  | { kind: "reexport-named"; from: string; sourceName: string }
  | { kind: "reexport-star";  from: string };

/**
 * Per-file export registry. Used to support cross-file `tokens.brand.primary`
 * references inside `tl.create()`. Populated during the scan-defineTokens
 * prepass before any file's full transform runs, so the import resolver
 * can look up an imported binding regardless of file processing order.
 *
 * Keyed by absolute file path (always `path.resolve()`-normalized) so a
 * relative import like `./theme` and an absolute caller path land on the
 * same lookup. The `from` field on re-export entries stores the ORIGINAL
 * import specifier (`./y`, `@/utils`, `pkg-name`) — resolution happens
 * during `resolve()`, not at register time, because the resolver depends
 * on the file we're starting from.
 */
class TokenExportRegistry {
  private exports = new Map<string, Map<string, TokenExportEntry>>();
  /** Optional resolver for re-export specifiers. Set by extract-fn before
   *  the full transform begins. Without it, only relative paths resolve. */
  private resolver: (fromFile: string, specifier: string) => string | null = () => null;
  private starReexportNames: (file: string) => string[] = () => [];

  setResolver(
    resolver:    (fromFile: string, specifier: string) => string | null,
    listExports: (file: string) => string[]
  ): void {
    this.resolver = resolver;
    this.starReexportNames = listExports;
  }

  register(absPath: string, exportName: string, entry: TokenExportEntry): void {
    let fileMap = this.exports.get(absPath);
    if (!fileMap) {
      fileMap = new Map();
      this.exports.set(absPath, fileMap);
    }
    fileMap.set(exportName, entry);
  }

  /** Convenience for the common case (concrete shape). */
  registerShape(absPath: string, exportName: string, shape: NestedTokenShape): void {
    this.register(absPath, exportName, { kind: "shape", shape });
  }

  /**
   * Resolve a (file, exportName) lookup, following re-export chains.
   * Returns `undefined` if not found, the chain hits a non-resolvable
   * specifier, or a cycle is detected.
   */
  resolve(absPath: string, exportName: string): NestedTokenShape | undefined {
    const seen = new Set<string>();
    const stack: Array<{ file: string; name: string }> = [{ file: absPath, name: exportName }];

    while (stack.length > 0) {
      const { file, name } = stack.pop()!;
      const key = file + "\0" + name;
      if (seen.has(key)) continue;       // cycle — bail this branch
      seen.add(key);

      const fileMap = this.exports.get(file);
      if (!fileMap) continue;

      const direct = fileMap.get(name);
      if (direct) {
        if (direct.kind === "shape") return direct.shape;
        if (direct.kind === "reexport-named") {
          const target = this.resolver(file, direct.from);
          if (target) stack.push({ file: target, name: direct.sourceName });
        }
        // reexport-star can't satisfy a NAMED lookup directly; falls
        // through to the star-walk below.
      }

      // Walk star re-exports declared in this file. Each `export * from
      // "./y"` adds y's exports to this file's surface; if any of them
      // matches `name`, follow.
      for (const entry of fileMap.values()) {
        if (entry.kind !== "reexport-star") continue;
        const target = this.resolver(file, entry.from);
        if (target) stack.push({ file: target, name });
      }
    }
    return undefined;
  }

  /** List every NAMED export in a file (concrete shapes + re-exports).
   *  Used to expand `export *` chains during real-world resolution. */
  listExportNames(absPath: string): string[] {
    const fileMap = this.exports.get(absPath);
    if (!fileMap) return [];
    const out: string[] = [];
    for (const [name, entry] of fileMap) {
      if (entry.kind !== "reexport-star") out.push(name);
    }
    // Walk star re-exports recursively (with cycle detection).
    const seen = new Set<string>([absPath]);
    const stack: string[] = [];
    for (const entry of fileMap.values()) {
      if (entry.kind === "reexport-star") {
        const target = this.resolver(absPath, entry.from);
        if (target && !seen.has(target)) stack.push(target);
      }
    }
    while (stack.length > 0) {
      const f = stack.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      const m = this.exports.get(f);
      if (!m) continue;
      for (const [name, e] of m) {
        if (e.kind === "reexport-star") {
          const target = this.resolver(f, e.from);
          if (target && !seen.has(target)) stack.push(target);
        } else if (!out.includes(name)) {
          out.push(name);
        }
      }
    }
    return out;
  }

  clear(): void {
    this.exports.clear();
  }
}

export const tokenExportRegistry = new TokenExportRegistry();

/** Walk a parsed style object and produce a NestedTokenShape with var() leaves. */
export function buildVarShape(obj: Record<string, unknown>, prefix = ""): NestedTokenShape {
  const out: NestedTokenShape = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}-${k}` : k;
    if (v && typeof v === "object") {
      out[k] = buildVarShape(v as Record<string, unknown>, key);
    } else if (typeof v === "string" || typeof v === "number") {
      out[k] = `var(--${tokenVarName(key)})`;
    }
  }
  return out;
}

/* ═══════════════════════════════════════
   Hash helpers — identical to the runtime versions in runtime/index.ts.
   If you change one, change the other (same invariant as compiler/hash
   vs runtime hash). The fixture in test/tokens.test.ts pins this.
═══════════════════════════════════════ */

/** Compute the CSS-variable name (without leading `--`) for a token key. */
export function tokenVarName(key: string): string {
  return `tl-${fnv32a("token:" + key)}`;
}

/** Compute the class name for a theme (without leading `.`). */
export function themeClassName(name: string): string {
  return `tlTheme${fnv32a("theme:" + name)}`;
}

/** Compute the @keyframes identifier (without leading `@keyframes`). */
export function keyframeName(name: string): string {
  return `tlKf${fnv32a("keyframes:" + name)}`;
}

/** Flatten nested token maps into "group-key" → value pairs.
 *
 *  defineTokens({ brand: { primary: "..." } })
 *    → [{ key: "brand-primary", value: "..." }]
 *
 *  defineTokens({ primary: "..." })
 *    → [{ key: "primary", value: "..." }]
 */
export function flattenTokenMap(
  obj:    Record<string, unknown>,
  prefix: string = ""
): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}-${k}` : k;
    if (v && typeof v === "object") {
      out.push(...flattenTokenMap(v as Record<string, unknown>, key));
    } else if (typeof v === "string" || typeof v === "number") {
      out.push({ key, value: String(v) });
    }
  }
  return out;
}
