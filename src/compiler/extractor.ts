import { parseStyleObject, StyleObject, ParseError } from "./ast-parser";
import { classFor, toKebab }                          from "./hash";
import type { AtomicRule }                            from "./css-gen";

export interface TransformResult {
  code:     string;
  rules:    AtomicRule[];
  changed:  boolean;
  errors:   ParseError[];
  warnings: string[];
}

class RuleRegistry {
  private rules = new Map<string, AtomicRule>();
  private order = 0;
  add(r: Omit<AtomicRule, "order">): AtomicRule {
    if (this.rules.has(r.cls)) return this.rules.get(r.cls)!;
    const full = { ...r, order: this.order++ };
    this.rules.set(r.cls, full);
    return full;
  }
  getAll(): AtomicRule[] { return [...this.rules.values()].sort((a, b) => a.order - b.order); }
  clear(): void { this.rules.clear(); this.order = 0; }
}

export const globalRegistry = new RuleRegistry();

export const VARIANTS: Record<string, string> = {
  _hover:        ":hover",
  _focus:        ":focus",
  _focusWithin:  ":focus-within",
  _focusVisible: ":focus-visible",
  _active:       ":active",
  _visited:      ":visited",
  _disabled:     ":disabled",
  _checked:      ":checked",
  _placeholder:  "::placeholder",
  _before:       "::before",
  _after:        "::after",
  _selection:    "::selection",
  _dark:         ":is(.dark *)",
  _light:        ":not(.dark) &",
  _rtl:          '[dir="rtl"] &',
  _ltr:          '[dir="ltr"] &',
  _first:        ":first-child",
  _last:         ":last-child",
  _odd:          ":nth-child(odd)",
  _even:         ":nth-child(even)",
  _empty:        ":empty",
  _groupHover:   ".group:hover &",
  _groupFocus:   ".group:focus &",
  _peerFocus:    ".peer:focus ~ &",
  _peerChecked:  ".peer:checked ~ &",
  sm:            "@media (min-width:640px)",
  md:            "@media (min-width:768px)",
  lg:            "@media (min-width:1024px)",
  xl:            "@media (min-width:1280px)",
  "2xl":         "@media (min-width:1536px)",
  print:         "@media print",
  motionSafe:    "@media (prefers-reduced-motion:no-preference)",
  motionReduce:  "@media (prefers-reduced-motion:reduce)",
  darkOS:        "@media (prefers-color-scheme:dark)",
  portrait:      "@media (orientation:portrait)",
  landscape:     "@media (orientation:landscape)",
};

function processStyles(
  obj: StyleObject,
  selector?: string,
  file = "<unknown>",
  errors: ParseError[] = []
): string[] {
  const classes: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (key in VARIANTS) {
      if (typeof value !== "object") {
        errors.push({ message: `Variant '${key}' must be an object`, line: 0, col: 0, file });
        continue;
      }
      classes.push(...processStyles(value as StyleObject, VARIANTS[key], file, errors));
      continue;
    }
    if (key.startsWith("@")) {
      errors.push({ message: `At-rules not allowed inside sc.create()`, line: 0, col: 0, file });
      continue;
    }
    if (typeof value === "object") {
      errors.push({ message: `Unknown variant '${key}'. Add via sc.extend().`, line: 0, col: 0, file });
      continue;
    }
    const sv = String(value);
    const cls = classFor(key, sv, selector);
    globalRegistry.add({ cls, prop: toKebab(key), value: sv, selector });
    classes.push(cls);
  }
  return classes;
}

/**
 * Robust sc.create() finder.
 * Skips string literals, template literals, and comments entirely.
 * Only finds ACTUAL sc.create() calls in executable code.
 */
function findCalls(src: string): Array<{
  fullStart: number;
  fullEnd:   number;
  argSrc:    string;
}> {
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

    // Skip string literals — sc.create inside strings is NOT a real call
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\" ) { i += 2; continue; }
        if (src[i] === q)    { i++; break; }
        i++;
      }
      continue;
    }

    // Skip JSX attribute strings with curly braces like {"sc.create"}
    if (ch === "{" && src[i + 1] === '"') {
      i++;
      continue;
    }

    // Skip template literals entirely
    if (ch === "`") {
      i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\" ) { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") {
          i += 2;
          let depth = 1;
          while (i < src.length && depth > 0) {
            if (src[i] === "{") depth++;
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

    // Look for sc.create(
    if (
      ch === "s" &&
      src[i + 1] === "c" &&
      src[i + 2] === "." &&
      src[i + 3] === "c" &&
      src[i + 4] === "r" &&
      src[i + 5] === "e" &&
      src[i + 6] === "a" &&
      src[i + 7] === "t" &&
      src[i + 8] === "e" &&
      src[i + 9] === "("
    ) {
      const callStart = i;
      i += 10;

      // Skip whitespace
      while (i < src.length && /\s/.test(src[i])) i++;

      // Must be followed by { to be a valid sc.create call
      if (src[i] !== "{") continue;

      const openPos = i;
      let depth = 0;
      let inStr  = false;
      let strCh  = "";
      let end    = openPos;

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

export function transform(src: string, file: string): TransformResult {
  const errors: ParseError[] = [];
  const warnings: string[]   = [];
  const rules: AtomicRule[]  = [];

  if (!src.includes("sc.create")) {
    return { code: src, rules: [], changed: false, errors: [], warnings: [] };
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
        errors.push({ message: `Key '${key}' must be an object`, line: 0, col: 0, file });
        continue;
      }
      resolved[key] = [
        ...new Set(processStyles(styles as StyleObject, undefined, file, errors))
      ].join(" ");
    }

    rules.push(...globalRegistry.getAll().filter(r =>
      Object.values(resolved).some(v => v.includes(r.cls))
    ));

    const replacement = JSON.stringify(resolved);
    const start = call.fullStart + offset;
    const end   = call.fullEnd   + offset;
    result  = result.slice(0, start) + replacement + result.slice(end);
    offset += replacement.length - (end - start);
    changed = true;
  }

  if (changed && !result.includes("sc.")) {
    result = result
      .replace(/import\s+\{[^}]*\bsc\b[^}]*\}\s+from\s+["']spark-css[^"']*["'];?\n?/g, "")
      .replace(/import\s+sc\s+from\s+["']spark-css[^"']*["'];?\n?/g, "");
  }

  return { code: result, rules: globalRegistry.getAll(), changed, errors, warnings };
}