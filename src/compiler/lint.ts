/**
 * traceless-style — compiler/lint.ts
 *
 * Enforces traceless-style rules at build time.
 * Detects forbidden patterns and reports errors that FAIL the build.
 *
 * Rules:
 *   no-inline-styles   — style={} or style="" forbidden in JSX
 *   no-class-string    — className="literal string" forbidden (use tl.create)
 *   no-css-modules     — importing .module.css forbidden
 *   no-tailwind        — Tailwind class names detected
 */

import fs from "fs";
import { codeFrame } from "./codeframe";
import { DIAGNOSTICS } from "./diagnostic-codes";

/** Map of lint rule slugs to the canonical TLS#### code from the
 *  central diagnostic registry. Lets the same diagnostic carry both
 *  its human-readable rule name AND a stable identifier for CI / docs
 *  / suppression directives. */
const RULE_TO_DIAGNOSTIC: Record<string, { code: string; docsUrl: string }> = {
  "no-inline-styles": { code: DIAGNOSTICS.LINT_INLINE_STYLE.code,  docsUrl: DIAGNOSTICS.LINT_INLINE_STYLE.docsUrl  },
  "no-class-string":  { code: DIAGNOSTICS.LINT_CLASS_STRING.code,  docsUrl: DIAGNOSTICS.LINT_CLASS_STRING.docsUrl  },
  "no-css-modules":   { code: DIAGNOSTICS.LINT_CSS_MODULES.code,   docsUrl: DIAGNOSTICS.LINT_CSS_MODULES.docsUrl   },
  "no-tailwind":      { code: DIAGNOSTICS.LINT_TAILWIND.code,      docsUrl: DIAGNOSTICS.LINT_TAILWIND.docsUrl      },
};

export interface LintError {
  rule:    string;
  message: string;
  file:    string;
  line:    number;
  col:     number;
  code?:   string;       // the offending code snippet (legacy field)
  /** TLS#### canonical identifier for this diagnostic. */
  tlsCode?: string;
  /** Documentation URL the user can click to read about the rule. */
  docsUrl?: string;
}

export interface LintOptions {
  /** Block style={} and style="" in JSX */
  noInlineStyles?:  boolean;
  /** Block className="literal-string" (must use tl.create) */
  noClassString?:   boolean;
  /** Block .module.css imports */
  noCSSModules?:    boolean;
  /** Warn when Tailwind class names detected */
  noTailwind?:      boolean;
  /** Files/patterns to ignore */
  ignore?:          string[];
}

/**
 * Strict-by-default lint configuration.
 *
 * traceless-style's stance: the project is a styling system, not a styling
 * *option*. Mixing inline styles, string classNames, CSS modules, or
 * Tailwind utility classes alongside tl.create() defeats the type
 * safety, conflict resolution, and atomic deduplication the compiler
 * provides. Every rule below is enforced by default; users with hybrid
 * codebases can opt out individually in traceless-style.config.js.
 */
export const DEFAULT_LINT_OPTIONS: LintOptions = {
  noInlineStyles: true,
  noClassString:  true,
  noCSSModules:   true,
  noTailwind:     true,
  ignore:         ["node_modules", ".next", "dist", ".traceless-style"],
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
    const line    = lines[lineIdx];
    const trimmed = line.trim();

    // Skip comment lines
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    // Find style={...} in JSX
    const stylePattern = /\bstyle\s*=\s*\{/g;
    let match: RegExpExecArray | null;

    while ((match = stylePattern.exec(line)) !== null) {
      const col     = match.index;
      const before  = line.slice(0, col);
      const snippet = line.slice(col, col + 50).trim();

      // Skip if inside a comment
      if (before.includes("//")) continue;

      // Skip: dangerouslySetInnerHTML={{ __html: ... }} — not a style
      if (snippet.includes("dangerouslySetInnerHTML")) continue;

      // Skip: suppressHydrationWarning
      if (snippet.includes("suppressHydrationWarning")) continue;

      errors.push({
        rule:    "no-inline-styles",
        message:
          `Inline styles are forbidden in traceless-style projects.\n` +
          `  Found: \`${snippet.slice(0, 60)}...\`\n` +
          `  Fix:   Move styles to tl.create() and use className={$.yourClass}`,
        file,
        line:    lineIdx + 1,
        col:     col + 1,
        code:    snippet,
      });
    }

    // Find style="..." HTML attribute
    const htmlStylePattern = /\bstyle\s*=\s*["'][^"']+["']/g;
    while ((match = htmlStylePattern.exec(line)) !== null) {
      const before = line.slice(0, match.index);
      if (before.includes("//")) continue;

      errors.push({
        rule:    "no-inline-styles",
        message:
          `Inline styles are forbidden in traceless-style projects.\n` +
          `  Found: \`${match[0]}\`\n` +
          `  Fix:   Move styles to tl.create() and use className={$.yourClass}`,
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
   Detects className="literal" (not from tl.create)
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

    // className="literal-classes" — not using tl.create
    const pattern = /\bclassName\s*=\s*["'][^"']+["']/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(line)) !== null) {
      // Allow empty className=""
      if (match[0].includes('""') || match[0].includes("''")) continue;

      errors.push({
        rule:    "no-class-string",
        message:
          `String className is forbidden — use tl.create() instead.\n` +
          `  Found: \`${match[0]}\`\n` +
          `  Fix:   const $ = tl.create({ name: { ... } }); → className={$.name}`,
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
          `CSS Modules are forbidden — use tl.create() instead.\n` +
          `  Found: \`${line.trim()}\`\n` +
          `  Fix:   const $ = tl.create({ ... }) instead of CSS Modules`,
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
            `Tailwind classes detected — use tl.create() instead.\n` +
            `  Found: \`${classes}\`\n` +
            `  Fix:   Move to tl.create({ name: { display: "flex", ... } })`,
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

  const header = `  traceless-style lint — ${errors.length} error${errors.length === 1 ? "" : "s"} found`;
  const lines: string[] = [
    `\n╔═══════════════════════════════════════════╗`,
    `║${header}${" ".repeat(Math.max(0, 43 - header.length))}║`,
    `╚═══════════════════════════════════════════╝\n`,
  ];

  // Cache file reads — many errors often come from the same file.
  const srcCache = new Map<string, string>();
  const readSrc = (file: string): string | null => {
    if (srcCache.has(file)) return srcCache.get(file)!;
    try { const s = fs.readFileSync(file, "utf8"); srcCache.set(file, s); return s; }
    catch { return null; }
  };

  for (const err of errors) {
    const rel = err.file.replace(rootDir, "").replace(/\\/g, "/").replace(/^\//, "");
    // Resolve the canonical TLS#### code + docs URL from the central
    // registry. Legacy lint errors that predate the codes registry still
    // produce a sensible header (just `[no-tailwind]`); new errors get
    // the structured `[TLS0404 · no-tailwind]` shape that matches every
    // big-tech compiler (TS, Babel, ESLint).
    const dx       = err.tlsCode ?? RULE_TO_DIAGNOSTIC[err.rule]?.code;
    const docsUrl  = err.docsUrl  ?? RULE_TO_DIAGNOSTIC[err.rule]?.docsUrl;
    const codeTag  = dx ? `${dx} · ${err.rule}` : err.rule;
    lines.push(`  ✗ [${codeTag}] ${rel}:${err.line}:${err.col}`);
    lines.push(`    ${err.message.split("\n").join("\n    ")}`);
    if (docsUrl) lines.push(`    docs: ${docsUrl}`);
    const src = readSrc(err.file);
    if (src) {
      lines.push("");
      lines.push(codeFrame(src, err.line, err.col).split("\n").map(l => "    " + l).join("\n"));
    }
    lines.push("");
  }

  lines.push(`Fix all errors before running traceless-style extract.\n`);
  return lines.join("\n");
}