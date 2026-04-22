 /**
 * spark-css — compiler/lint.ts
 *
 * Enforces spark-css rules at build time.
 * Detects forbidden patterns and reports errors that FAIL the build.
 *
 * Rules:
 *   no-inline-styles   — style={} or style="" forbidden in JSX
 *   no-class-string    — className="literal string" forbidden (use sc.create)
 *   no-css-modules     — importing .module.css forbidden
 *   no-tailwind        — Tailwind class names detected
 */

export interface LintError {
  rule:    string;
  message: string;
  file:    string;
  line:    number;
  col:     number;
  code?:   string; // the offending code snippet
}

export interface LintOptions {
  /** Block style={} and style="" in JSX */
  noInlineStyles?:  boolean;
  /** Block className="literal-string" (must use sc.create) */
  noClassString?:   boolean;
  /** Block .module.css imports */
  noCSSModules?:    boolean;
  /** Warn when Tailwind class names detected */
  noTailwind?:      boolean;
  /** Files/patterns to ignore */
  ignore?:          string[];
}

export const DEFAULT_LINT_OPTIONS: LintOptions = {
  noInlineStyles: true,
  noClassString:  false, // opt-in — too strict for mixed codebases
  noCSSModules:   false,
  noTailwind:     false,
  ignore:         ["node_modules", ".next", "dist", ".spark-css"],
};

/* ════════════════════════════════════════
   RULE: no-inline-styles
   Detects style={...} in JSX
════════════════════════════════════════ */
function checkNoInlineStyles(
  src:  string,
  file: string
): LintError[] {
  const errors: LintError[] = [];
  const lines = src.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Skip comments
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    // Find style={ patterns in JSX
    // Matches: style={{ ... }}, style={variable}, style={fn()}
    const stylePattern = /\bstyle\s*=\s*\{/g;
    let match: RegExpExecArray | null;

    while ((match = stylePattern.exec(line)) !== null) {
      const col = match.index;

      // Allow: suppressHydrationWarning, data-* attributes
      // Allow: comments
      const context = line.slice(Math.max(0, col - 20), col + 50);
      if (context.includes("//")) continue;

      // Extract the snippet for the error message
      const snippet = line.slice(col, col + 40).trim();

      errors.push({
        rule:    "no-inline-styles",
        message:
          `Inline styles are forbidden in spark-css projects.\n` +
          `  Found: \`${snippet}...\`\n` +
          `  Fix:   Move styles to sc.create() and use className={$.yourClass}`,
        file,
        line:    lineIdx + 1,
        col:     col + 1,
        code:    snippet,
      });
    }

    // Also detect style="string" (HTML attribute style)
    const htmlStylePattern = /\bstyle\s*=\s*["'][^"']+["']/g;
    while ((match = htmlStylePattern.exec(line)) !== null) {
      errors.push({
        rule:    "no-inline-styles",
        message:
          `Inline styles are forbidden in spark-css projects.\n` +
          `  Found: \`${match[0]}\`\n` +
          `  Fix:   Move styles to sc.create() and use className={$.yourClass}`,
        file,
        line:    lineIdx + 1,
        col:     match.index + 1,
        code:    match[0],
      });
    }
  }

  return errors;
}

/* ════════════════════════════════════════
   RULE: no-class-string
   Detects className="literal" (not from sc.create)
════════════════════════════════════════ */
function checkNoClassString(
  src:  string,
  file: string
): LintError[] {
  const errors: LintError[] = [];
  const lines = src.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (line.trim().startsWith("//")) continue;

    // className="literal-classes" — not using sc.create
    const pattern = /\bclassName\s*=\s*["'][^"']+["']/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(line)) !== null) {
      // Allow empty className=""
      if (match[0].includes('""') || match[0].includes("''")) continue;

      errors.push({
        rule:    "no-class-string",
        message:
          `String className is forbidden — use sc.create() instead.\n` +
          `  Found: \`${match[0]}\`\n` +
          `  Fix:   const $ = sc.create({ name: { ... } }); → className={$.name}`,
        file,
        line:    lineIdx + 1,
        col:     match.index + 1,
        code:    match[0],
      });
    }
  }

  return errors;
}

/* ════════════════════════════════════════
   RULE: no-css-modules
   Detects import of .module.css files
════════════════════════════════════════ */
function checkNoCSSModules(
  src:  string,
  file: string
): LintError[] {
  const errors: LintError[] = [];
  const lines = src.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (/import\s+.*\.module\.css/.test(line)) {
      errors.push({
        rule:    "no-css-modules",
        message:
          `CSS Modules are forbidden — use sc.create() instead.\n` +
          `  Found: \`${line.trim()}\`\n` +
          `  Fix:   const $ = sc.create({ ... }) instead of CSS Modules`,
        file,
        line:    lineIdx + 1,
        col:     1,
        code:    line.trim(),
      });
    }
  }

  return errors;
}

/* ════════════════════════════════════════
   RULE: no-tailwind
   Detects Tailwind utility classes
════════════════════════════════════════ */
const TAILWIND_PATTERNS = [
  /\bflex\b/, /\bitems-\w+/, /\bjustify-\w+/, /\bgap-\d/,
  /\bp-\d/, /\bm-\d/, /\bw-\d/, /\bh-\d/,
  /\btext-(xs|sm|base|lg|xl|2xl)/, /\bfont-(bold|medium|semibold)/,
  /\bbg-\w+-\d{3}/, /\brounded(-\w+)?/, /\bborder(-\w+)?/,
];

function checkNoTailwind(
  src:  string,
  file: string
): LintError[] {
  const errors: LintError[] = [];
  const lines = src.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (line.trim().startsWith("//")) continue;

    // Only check className values
    const classMatch = line.match(/className\s*=\s*["']([^"']+)["']/);
    if (!classMatch) continue;

    const classes = classMatch[1];
    for (const pattern of TAILWIND_PATTERNS) {
      if (pattern.test(classes)) {
        errors.push({
          rule:    "no-tailwind",
          message:
            `Tailwind classes detected — use sc.create() instead.\n` +
            `  Found: \`${classes}\`\n` +
            `  Fix:   Move to sc.create({ name: { display: "flex", ... } })`,
          file,
          line:    lineIdx + 1,
          col:     1,
          code:    classes,
        });
        break; // one error per line
      }
    }
  }

  return errors;
}

/* ════════════════════════════════════════
   MAIN LINT FUNCTION
════════════════════════════════════════ */
export function lint(
  src:     string,
  file:    string,
  options: LintOptions = DEFAULT_LINT_OPTIONS
): LintError[] {
  const errors: LintError[] = [];

  // Check ignore patterns
  const ignored = (options.ignore ?? DEFAULT_LINT_OPTIONS.ignore!).some(
    pattern => file.includes(pattern)
  );
  if (ignored) return [];

  // Only lint .tsx and .jsx files (JSX)
  if (!file.endsWith(".tsx") && !file.endsWith(".jsx")) return [];

  if (options.noInlineStyles !== false) {
    errors.push(...checkNoInlineStyles(src, file));
  }
  if (options.noClassString) {
    errors.push(...checkNoClassString(src, file));
  }
  if (options.noCSSModules) {
    errors.push(...checkNoCSSModules(src, file));
  }
  if (options.noTailwind) {
    errors.push(...checkNoTailwind(src, file));
  }

  return errors;
}

/* ════════════════════════════════════════
   FORMAT ERRORS FOR DISPLAY
════════════════════════════════════════ */
export function formatLintErrors(
  errors:  LintError[],
  rootDir: string
): string {
  if (errors.length === 0) return "";

  const lines: string[] = [
    `\n╔═══════════════════════════════════════════╗`,
    `║  spark-css lint — ${errors.length} error${errors.length === 1 ? "" : "s"} found${" ".repeat(Math.max(0, 24 - errors.length.toString().length))}║`,
    `╚═══════════════════════════════════════════╝\n`,
  ];

  for (const err of errors) {
    const rel = err.file.replace(rootDir, "").replace(/\\/g, "/").replace(/^\//, "");
    lines.push(`  ✗ [${err.rule}] ${rel}:${err.line}:${err.col}`);
    lines.push(`    ${err.message.split("\n").join("\n    ")}`);
    lines.push("");
  }

  lines.push(`Fix all errors before running spark-css extract.\n`);
  return lines.join("\n");
}