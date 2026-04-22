/**
 * spark-css — compiler/extractor.ts
 *
 * Transforms sc.create() calls at build time.
 * Uses the variant registry so custom variants from sc.extend() work.
 */

import { parseStyleObject, StyleObject, ParseError } from "./ast-parser";
import { classFor, toKebab }                          from "./hash";
import {
  DEFAULT_VARIANTS,
  mergeVariants,
  type FlatVariants,
} from "./variants";
import type { AtomicRule }                            from "./css-gen";

export interface TransformResult {
  code:     string;
  rules:    AtomicRule[];
  changed:  boolean;
  errors:   ParseError[];
  warnings: string[];
}

/* ═══════════════════════════════
   Rule Registry
═══════════════════════════════ */
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

/* Re-export VARIANTS for backward compat */
export const VARIANTS: FlatVariants = DEFAULT_VARIANTS;

/* ═══════════════════════════════
   Style processing
═══════════════════════════════ */
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

    /* Variant key */
    if (key in variants) {
      if (typeof value !== "object") {
        errors.push({
          message: `Variant '${key}' must be an object, got ${typeof value}`,
          line: 0, col: 0, file,
        });
        continue;
      }
      classes.push(
        ...processStyles(
          value as StyleObject,
          variants,
          variants[key],
          file,
          errors
        )
      );
      continue;
    }

    /* At-rule inside sc.create() — not supported */
    if (key.startsWith("@")) {
      errors.push({
        message: `At-rules inside sc.create() are not supported. Use globalStyles() for @keyframes.`,
        line: 0, col: 0, file,
      });
      continue;
    }

    /* Unknown nested object — likely a typo in variant name */
    if (typeof value === "object") {
      /* Give a helpful error with suggestions */
      const suggestion = findClosestVariant(key, variants);
      errors.push({
        message:
          `Unknown variant '${key}'` +
          (suggestion ? ` — did you mean '${suggestion}'?` : "") +
          ` Add custom variants via sc.extend({ variants: { ${key}: "..." } }).`,
        line: 0, col: 0, file,
      });
      continue;
    }

    /* CSS property */
    const strVal = String(value);
    const cls    = classFor(key, strVal, selector);
    globalRegistry.add({ cls, prop: toKebab(key), value: strVal, selector });
    classes.push(cls);
  }

  return classes;
}

/** Find closest variant key (Levenshtein distance ≤ 2) */
function findClosestVariant(
  key:      string,
  variants: FlatVariants
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;

  for (const variant of Object.keys(variants)) {
    const dist = levenshtein(key, variant);
    if (dist < bestDist && dist <= 2) {
      bestDist = dist;
      best     = variant;
    }
  }

  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

/* ═══════════════════════════════
   sc.create() call finder
   Robust — skips strings, comments, template literals
═══════════════════════════════ */
function findCalls(src: string): Array<{
  fullStart: number;
  fullEnd:   number;
  argSrc:    string;
}> {
  const calls: Array<{ fullStart: number; fullEnd: number; argSrc: string }> = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    /* Skip line comments */
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }

    /* Skip block comments */
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    /* Skip string literals — sc.create inside strings is NOT a call */
    if (ch === '"' || ch === "'") {
      const q = ch; i++;
      while (i < src.length) {
        if (src[i] === "\\" ) { i += 2; continue; }
        if (src[i] === q)    { i++;     break;    }
        i++;
      }
      continue;
    }

    /* Skip template literals entirely */
    if (ch === "`") {
      i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\" ) { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") {
          i += 2; let depth = 1;
          while (i < src.length && depth > 0) {
            if      (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            i++;
          }
          continue;
        }
        i++;
      }
      i++;
      continue;
    }

    /* Look for sc.create( or mysc.create( */
    if (
      src[i + 0] === "c" &&
      src[i + 1] === "r" &&
      src[i + 2] === "e" &&
      src[i + 3] === "a" &&
      src[i + 4] === "t" &&
      src[i + 5] === "e" &&
      src[i + 6] === "("
    ) {
      /* Find the preceding dot + identifier (e.g. sc. or mysc.) */
      let dotPos = i - 1;
      if (dotPos < 0 || src[dotPos] !== ".") { i++; continue; }

      let idEnd   = dotPos;
      let idStart = idEnd - 1;
      while (idStart > 0 && /[a-zA-Z0-9_$]/.test(src[idStart - 1])) idStart--;

      const callStart = idStart;
      i = i + 7; // skip "create("

      /* Skip whitespace */
      while (i < src.length && /\s/.test(src[i])) i++;

      /* Must be followed by { */
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
            calls.push({
              fullStart: callStart,
              fullEnd:   pe,
              argSrc:    src.slice(openPos, end),
            });
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

/* ═══════════════════════════════
   Main transform function
═══════════════════════════════ */
export function transform(
  src:            string,
  file:           string,
  customVariants: Record<string, string> = {}
): TransformResult {
  const errors:   ParseError[] = [];
  const warnings: string[]     = [];
  const rules:    AtomicRule[] = [];

  if (!src.includes("create")) {
    return { code: src, rules: [], changed: false, errors: [], warnings: [] };
  }

  /* Merge built-ins with any custom variants passed by the plugin */
  const { flat: variants, errors: varErrors } = customVariants && Object.keys(customVariants).length > 0
    ? mergeVariants(customVariants)
    : { flat: DEFAULT_VARIANTS, errors: [] };

  /* Log variant errors as warnings */
  for (const ve of varErrors) {
    warnings.push(`[spark-css] ${ve.message}`);
  }

  const calls = findCalls(src);
  if (!calls.length) {
    return { code: src, rules: [], changed: false, errors: [], warnings: [] };
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
        errors.push({
          message: `sc.create() key '${key}' must be an object`,
          line: 0, col: 0, file,
        });
        continue;
      }

      const classes = processStyles(
        styles as StyleObject,
        variants,
        undefined,
        file,
        errors
      );
      resolved[key] = [...new Set(classes)].join(" ");
    }

    rules.push(
      ...globalRegistry
        .getAll()
        .filter(r => Object.values(resolved).some(v => v.includes(r.cls)))
    );

    const replacement = JSON.stringify(resolved);
    const start = call.fullStart + offset;
    const end   = call.fullEnd   + offset;
    result  = result.slice(0, start) + replacement + result.slice(end);
    offset += replacement.length - (end - start);
    changed = true;
  }

  /* Remove spark-css imports if no more references remain */
  if (changed && !result.includes(".create") && !result.includes(".merge") && !result.includes(".cx")) {
    result = result
      .replace(/import\s+\{[^}]*\b(sc|merge|cx|extend)\b[^}]*\}\s+from\s+["']spark-css[^"']*["'];?\n?/g, "")
      .replace(/import\s+\*\s+as\s+\w+\s+from\s+["']spark-css[^"']*["'];?\n?/g, "");
  }

  return {
    code: result,
    rules: globalRegistry.getAll(),
    changed,
    errors,
    warnings,
  };
}