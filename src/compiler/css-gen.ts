/**
 * spark-css — css-gen.ts
 * Generates atomic CSS + class metadata for conflict resolution.
 *
 * Meta format: { "scm92pvu": "display", "sc1eilc0": "background-color::is(.dark *)" }
 * Key = class name, Value = "prop" or "prop:selector"
 * This allows sc.merge() to know which property each class sets.
 */

export interface AtomicRule {
  cls:       string;
  prop:      string;
  value:     string;
  selector?: string;
  order:     number;
}

/** Validate CSS rule — reject JSX artifacts that leaked from demo code */
export function isValidRule(prop: string, value: string): boolean {
  if (!/^-?[a-zA-Z][a-zA-Z0-9-]*$/.test(prop)) return false;
  const jsArtifacts = [
    "{", "}", "dim(", "fn(", "kw(", "st(", "pr(",
    "=>", "import ", "const ", "return ", "&nbsp", "<br",
    "React", "tsx", "jsx",
  ];
  if (jsArtifacts.some(s => value.includes(s))) return false;
  if (!value.trim()) return false;
  return true;
}

/** Generate minified CSS */
export function generateCSS(rules: AtomicRule[]): string {
  return [...rules]
    .sort((a, b) => a.order - b.order)
    .filter(r => isValidRule(r.prop, r.value))
    .map(r => {
      const d = `${r.prop}:${r.value}`;
      if (!r.selector)                return `.${r.cls}{${d}}`;
      if (r.selector.startsWith("@")) return `${r.selector}{.${r.cls}{${d}}}`;
      if (r.selector.includes("&"))   return `${r.selector.replace(/&/g, `.${r.cls}`)}{${d}}`;
      return `.${r.cls}${r.selector}{${d}}`;
    })
    .join("");
}

/** Generate pretty CSS for dev mode */
export function generateCSSPretty(rules: AtomicRule[]): string {
  const lines = ["/* spark-css — generated */\n"];
  [...rules]
    .sort((a, b) => a.order - b.order)
    .filter(r => isValidRule(r.prop, r.value))
    .forEach(r => {
      const d = `  ${r.prop}: ${r.value};`;
      if (!r.selector)
        lines.push(`.${r.cls} {\n${d}\n}\n`);
      else if (r.selector.startsWith("@"))
        lines.push(`${r.selector} {\n  .${r.cls} {\n  ${d}\n  }\n}\n`);
      else if (r.selector.includes("&"))
        lines.push(`${r.selector.replace(/&/g, `.${r.cls}`)} {\n${d}\n}\n`);
      else
        lines.push(`.${r.cls}${r.selector} {\n${d}\n}\n`);
    });
  return lines.join("");
}

/**
 * Build class metadata map for conflict resolution.
 *
 * Format: { cls → "prop" | "prop:selector" }
 *
 * Examples:
 *   "scm92pvu" → "display"               (base class)
 *   "sc1eilc0" → "background-color::is(.dark *)"  (dark variant)
 *   "scyyzqjv" → "box-shadow::hover"     (hover variant)
 *
 * This lets sc.merge() know:
 *   - Two classes with same prop:selector → CONFLICT → last wins
 *   - Two classes with same prop but DIFFERENT selectors → NOT a conflict
 */
export function buildClassMeta(rules: AtomicRule[]): Record<string, string> {
  const meta: Record<string, string> = {};
  rules
    .filter(r => isValidRule(r.prop, r.value))
    .forEach(r => {
      // Key = "prop" for base, "prop:selector" for variants
      meta[r.cls] = r.selector
        ? `${r.prop}:${r.selector}`
        : r.prop;
    });
  return meta;
}