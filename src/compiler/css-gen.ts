/** Validate CSS property — reject JSX artifacts */
export function isValidRule(prop: string, value: string): boolean {
  // Property must be valid CSS identifier
  if (!/^-?[a-zA-Z][a-zA-Z0-9-]*$/.test(prop)) return false;
  // Value must not contain JSX/JS code artifacts
  const jsArtifacts = ["{", "}", "dim(", "fn(", "kw(", "st(", "pr(", "=>", "import ", "const ", "return ", "nbsp", "&nbsp"];
  if (jsArtifacts.some(s => value.includes(s))) return false;
  // Value must not be empty
  if (!value.trim()) return false;
  return true;
}

/**
 * spark-css v3 — compiler/css-gen.ts
 * Generates atomic CSS from collected rules.
 * Rules are ordered by insertion order for deterministic output.
 */

export interface AtomicRule {
  cls:       string;
  prop:      string;
  value:     string;
  selector?: string;
  order:     number;
}

/** Generate full CSS string from rules */
export function generateCSS(rules: AtomicRule[]): string {
  const sorted = [...rules].sort((a, b) => a.order - b.order);
  const lines: string[] = [];

  for (const rule of sorted) {
    const decl = `${rule.prop}:${rule.value}`;

    if (!rule.selector) {
      lines.push(`.${rule.cls}{${decl}}`);
    } else if (rule.selector.startsWith("@")) {
      lines.push(`${rule.selector}{.${rule.cls}{${decl}}}`);
    } else if (rule.selector.includes("&")) {
      // "& selector" pattern: replace & with .cls
      const sel = rule.selector.replace(/&/g, `.${rule.cls}`);
      lines.push(`${sel}{${decl}}`);
    } else {
      // Pseudo-class/element: .cls:hover { }
      lines.push(`.${rule.cls}${rule.selector}{${decl}}`);
    }
  }

  return lines.join("");
}

/** Pretty-printed CSS for development */
export function generateCSSPretty(rules: AtomicRule[]): string {
  const sorted = [...rules].sort((a, b) => a.order - b.order);
  const lines: string[] = ["/* spark-css — generated atomic stylesheet */\n"];

  for (const rule of sorted) {
    const decl = `  ${rule.prop}: ${rule.value};`;

    if (!rule.selector) {
      lines.push(`.${rule.cls} {\n${decl}\n}\n`);
    } else if (rule.selector.startsWith("@")) {
      lines.push(`${rule.selector} {\n  .${rule.cls} {\n  ${decl}\n  }\n}\n`);
    } else if (rule.selector.includes("&")) {
      const sel = rule.selector.replace(/&/g, `.${rule.cls}`);
      lines.push(`${sel} {\n${decl}\n}\n`);
    } else {
      lines.push(`.${rule.cls}${rule.selector} {\n${decl}\n}\n`);
    }
  }

  return lines.join("");
}

/** Build class→"prop:selector" reverse map for conflict resolution */
export function buildClassMeta(rules: AtomicRule[]): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const rule of rules) {
    meta[rule.cls] = rule.selector ? `${rule.prop}:${rule.selector}` : rule.prop;
  }
  return meta;
}