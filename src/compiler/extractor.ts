/**
 * spark-css — compiler/extractor.ts
 *
 * Auto-detects BOTH sc.create() AND sc.extend() calls.
 * No config file needed — custom variants are discovered
 * directly from source code.
 *
 * Pass 1: Scan all files → find sc.extend() calls → collect custom variants
 * Pass 2: Scan all files → find sc.create() calls → transform with all variants
 */

import { parseStyleObject, StyleObject, ParseError } from "./ast-parser";
import { classFor, toKebab }                          from "./hash";
import {
  DEFAULT_VARIANTS,
  mergeVariants,
  type FlatVariants,
} from "./variants";
import type { AtomicRule } from "./css-gen";

export interface TransformResult {
  code:            string;
  rules:           AtomicRule[];
  changed:         boolean;
  errors:          ParseError[];
  warnings:        string[];
  customVariants?: Record<string, string>;
}

/* ═══════════════════════════════════════
   Rule Registry
═══════════════════════════════════════ */
class RuleRegistry {
  private rules = new Map<string, AtomicRule>();
  private order = 0;

  add(r: Omit<AtomicRule, "order">): AtomicRule {
    if (this.rules.has(r.cls)) return this.rules.get(r.cls)!;
    const full = { ...r, order: this.order++ };
    this.rules.set(r.cls, full);
    return full;
  }

  getAll(): AtomicRule[] {
    return [...this.rules.values()].sort((a, b) => a.order - b.order);
  }

  clear(): void {
    this.rules.clear();
    this.order = 0;
  }
}

export const globalRegistry = new RuleRegistry();

/* Re-export for backward compat */
export const VARIANTS: FlatVariants = DEFAULT_VARIANTS;

/* ═══════════════════════════════════════
   Robust call finder
   Skips strings, template literals, comments
═══════════════════════════════════════ */
function findNamedCalls(
  src:      string,
  fnName:   string  // e.g. "create" or "extend"
): Array<{ fullStart: number; fullEnd: number; argSrc: string }> {
  const calls: Array<{ fullStart: number; fullEnd: number; argSrc: string }> = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    // Skip line comments
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }

    // Skip block comments
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    // Skip string literals
    if (ch === '"' || ch === "'") {
      const q = ch; i++;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === q)    { i++;    break;    }
        i++;
      }
      continue;
    }

    // Skip template literals
    if (ch === "`") {
      i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") {
          i += 2; let d = 1;
          while (i < src.length && d > 0) {
            if      (src[i] === "{") d++;
            else if (src[i] === "}") d--;
            i++;
          }
          continue;
        }
        i++;
      }
      i++;
      continue;
    }

    // Match .fnName(
    const needle = `.${fnName}(`;
    if (src.slice(i, i + needle.length) === needle) {
      // Find the preceding identifier (the sc instance name)
      let idEnd = i;
      let idStart = idEnd - 1;
      while (idStart > 0 && /[a-zA-Z0-9_$]/.test(src[idStart - 1])) idStart--;

      const callStart = idStart;
      i += needle.length;

      // Skip whitespace
      while (i < src.length && /\s/.test(src[i])) i++;

      // Must open with {
      if (src[i] !== "{") continue;

      const openPos = i;
      let depth = 0, inStr = false, strCh = "", end = openPos;

      for (let j = openPos; j < src.length; j++) {
        const c = src[j];
        if (inStr) {
          if (c === strCh && src[j - 1] !== "\\") inStr = false;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") { inStr = true; strCh = c; continue; }
        if (c === "{") depth++;
        if (c === "}") {
          depth--;
          if (depth === 0) {
            end = j + 1;
            let pe = end;
            while (pe < src.length && /\s/.test(src[pe])) pe++;
            if (src[pe] === ")") pe++;
            calls.push({ fullStart: callStart, fullEnd: pe, argSrc: src.slice(openPos, end) });
            i = pe;
            break;
          }
        }
      }
      continue;
    }

    i++;
  }

  return calls;
}

/* ═══════════════════════════════════════
   Pass 1: Auto-detect sc.extend() calls
   Returns all custom variants found
═══════════════════════════════════════ */
export function extractCustomVariants(src: string, file: string): Record<string, string> {
  const found: Record<string, string> = {};

  const calls = findNamedCalls(src, "extend");
  if (!calls.length) return found;

  for (const call of calls) {
    // sc.extend({ variants: { _tablet: "@media...", ... } })
    // The arg is the outer object { variants: { ... } }
    const { obj, errors } = parseStyleObject(call.argSrc, file);
    if (!obj) continue;

    // Look for the "variants" key
    const variantsObj = obj["variants"];
    if (!variantsObj || typeof variantsObj !== "object") continue;

    // Each key:value is a variant definition
    for (const [key, selector] of Object.entries(variantsObj)) {
      if (typeof selector === "string" && selector.trim()) {
        found[key] = selector;
      }
    }
  }

  return found;
}

/* ═══════════════════════════════════════
   Style processing
═══════════════════════════════════════ */
function processStyles(
  obj:       StyleObject,
  variants:  FlatVariants,
  selector?: string,
  file = "<unknown>",
  errors: ParseError[] = []
): string[] {
  const classes: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;

    // Variant key
    if (key in variants) {
      if (typeof value !== "object") {
        errors.push({
          message: `Variant '${key}' must be an object, got ${typeof value}`,
          line: 0, col: 0, file,
        });
        continue;
      }
      classes.push(
        ...processStyles(value as StyleObject, variants, variants[key], file, errors)
      );
      continue;
    }

    // At-rule inside sc.create() — not supported
    if (key.startsWith("@")) {
      errors.push({
        message: `At-rules inside sc.create() are not supported.`,
        line: 0, col: 0, file,
      });
      continue;
    }

    // Unknown object — likely typo in variant name
    if (typeof value === "object") {
      const suggestion = findClosestVariant(key, variants);
      errors.push({
        message:
          `Unknown variant '${key}'` +
          (suggestion ? ` — did you mean '${suggestion}'?` : "") +
          ` Add it via sc.extend({ variants: { ${key}: "..." } }).`,
        line: 0, col: 0, file,
      });
      continue;
    }

    // CSS property
    const strVal = String(value);
    const cls    = classFor(key, strVal, selector);
    globalRegistry.add({ cls, prop: toKebab(key), value: strVal, selector });
    classes.push(cls);
  }

  return classes;
}

function findClosestVariant(key: string, variants: FlatVariants): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const v of Object.keys(variants)) {
    const d = levenshtein(key, v);
    if (d < bestDist && d <= 2) { bestDist = d; best = v; }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

/* ═══════════════════════════════════════
   Main transform
═══════════════════════════════════════ */
export function transform(
  src:            string,
  file:           string,
  customVariants: Record<string, string> = {}
): TransformResult {
  const errors:   ParseError[] = [];
  const warnings: string[]     = [];
  const rules:    AtomicRule[] = [];

  if (!src.includes("create") && !src.includes("extend")) {
    return { code: src, rules: [], changed: false, errors: [], warnings: [] };
  }

  // Auto-detect sc.extend() in this file and merge its variants
  const detectedVariants = extractCustomVariants(src, file);
  const allCustom = { ...customVariants, ...detectedVariants };

  const { flat: variants, errors: varErrors } =
    Object.keys(allCustom).length > 0
      ? mergeVariants(allCustom)
      : { flat: DEFAULT_VARIANTS, errors: [] };

  for (const ve of varErrors) {
    warnings.push(`[spark-css] ${ve.message}`);
  }

  const calls = findNamedCalls(src, "create");
  if (!calls.length) {
    return { code: src, rules: [], changed: false, errors: [], warnings: [], customVariants: allCustom };
  }

  let result  = src;
  let offset  = 0;
  let changed = false;

  for (const call of calls) {
    const { obj: outerObj, errors: pe } = parseStyleObject(call.argSrc, file);
    errors.push(...pe);

    if (!outerObj) {
      warnings.push(`[spark-css] Could not parse sc.create() in ${file}`);
      continue;
    }

    const resolved: Record<string, string> = {};

    for (const [key, styles] of Object.entries(outerObj)) {
      if (typeof styles !== "object") {
        errors.push({ message: `sc.create() key '${key}' must be an object`, line: 0, col: 0, file });
        continue;
      }
      const classes = processStyles(styles as StyleObject, variants, undefined, file, errors);
      resolved[key] = [...new Set(classes)].join(" ");
    }

    rules.push(
      ...globalRegistry.getAll().filter(r =>
        Object.values(resolved).some(v => v.includes(r.cls))
      )
    );

    const replacement = JSON.stringify(resolved);
    const start = call.fullStart + offset;
    const end   = call.fullEnd   + offset;
    result  = result.slice(0, start) + replacement + result.slice(end);
    offset += replacement.length - (end - start);
    changed = true;
  }

  if (changed && !result.includes(".create") && !result.includes(".merge") && !result.includes(".cx")) {
    result = result
      .replace(/import\s+\{[^}]*\b(sc|merge|cx|extend)\b[^}]*\}\s+from\s+["']spark-css[^"']*["'];?\n?/g, "")
      .replace(/import\s+\*\s+as\s+\w+\s+from\s+["']spark-css[^"']*["'];?\n?/g, "");
  }

  return { code: result, rules: globalRegistry.getAll(), changed, errors, warnings, customVariants: allCustom };
}