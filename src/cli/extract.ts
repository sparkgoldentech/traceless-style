#!/usr/bin/env node
/**
 * traceless-style CLI — extract command
 *
 * Usage:
 *   traceless-style extract            → production (fails on lint errors)
 *   traceless-style extract --dev      → development (pretty CSS)
 *   traceless-style extract --watch    → watch mode
 *
 * Lint rules enforced on EVERY run (dev AND prod):
 *   - no inline styles (style={} or style="")  → ALWAYS hard fail
 *   - no CSS modules                            → opt-in
 *   - no class strings                          → opt-in
 */

import fs   from "fs";
import path from "path";
import { createRequire } from "node:module";

// Load CommonJS modules (the user's `traceless-style.config.js`) from inside
// this ESM bundle. esbuild's `__require` polyfill throws "Dynamic require of
// X is not supported" in pure ESM contexts; `createRequire(import.meta.url)`
// gives us a real Node `require` that works regardless of how this CLI is
// loaded. Without this, the config-file read silently fails and every
// project ends up running with default options.
const requireFromHere = createRequire(import.meta.url);
import { extract }                    from "./extract-fn";
import type { ParserChoice }          from "./extract-fn";
import { lint, formatLintErrors, DEFAULT_LINT_OPTIONS } from "../compiler/lint";
import type { LintOptions }           from "../compiler/lint";
import { inspectCommand, auditCommand, devCommand, buildCommand } from "./commands";
import { initCommand } from "./init";
import { setAutoDarkMode, setContrastOptions, getContrastIssues } from "../compiler/extractor";
import type { ContrastValidatorOptions } from "../compiler/contrast-validator";
import { runInteractiveContrastFix } from "./contrast-fix";

const args    = process.argv.slice(2);
const WATCH   = args.includes("--watch");
const DEV     = args.includes("--dev");
/* `--fix-contrast` is the explicit opt-in (legacy / scripted use).
   `--no-fix-prompt` is the explicit opt-OUT (CI / non-interactive).
   With neither flag, we auto-prompt iff stdout is a TTY and CI=false. */
const FIX_CONTRAST_FLAG = args.includes("--fix-contrast");
const NO_FIX_PROMPT     = args.includes("--no-fix-prompt");

function readParserFlag(argv: string[]): ParserChoice | undefined {
  const arg = argv.find(a => a === "--parser=swc" || a === "--parser=legacy");
  if (arg === "--parser=swc")    return "swc";
  if (arg === "--parser=legacy") return "legacy";
  return undefined;
}
const PARSER = readParserFlag(args);
const ROOT    = process.cwd();
/**
 * Source roots to scan. We return a list (not a single dir) because real
 * Next.js App Router projects often have BOTH `src/` (for shared code) and
 * `app/` (for routes) at the project root. Picking one and ignoring the
 * other was a silent correctness hole — the unscanned directory's files
 * would compile into the bundle without ever being linted.
 *
 * Resolution order:
 *   1. `srcDir` from traceless-style.config.js wins (single dir, explicit).
 *   2. Otherwise: union of `src/` and `app/` that actually exist.
 *   3. Fall back to project root.
 */
const SRC_DIRS: string[] = (() => {
  const cfgPath = path.join(ROOT, "traceless-style.config.js");
  try {
    if (fs.existsSync(cfgPath)) {
      delete requireFromHere.cache[requireFromHere.resolve(cfgPath)];
      const cfg = requireFromHere(cfgPath) as { srcDir?: string | string[] };
      if (Array.isArray(cfg.srcDir)) return cfg.srcDir.map(d => path.join(ROOT, d));
      if (cfg.srcDir) return [path.join(ROOT, cfg.srcDir)];
    }
  } catch { /* ignore */ }
  const dirs: string[] = [];
  for (const d of ["src", "app"]) {
    const full = path.join(ROOT, d);
    if (fs.existsSync(full)) dirs.push(full);
  }
  return dirs.length > 0 ? dirs : [ROOT];
})();

/* ── Load lint config ──
   Default behavior: every rule in DEFAULT_LINT_OPTIONS is enforced.
   Users can override individual rules in traceless-style.config.js. The only
   way to fully disable lint is `lint: false` — and even then we leave
   noInlineStyles on, because inline styles bypass the compiler entirely
   and there is no legitimate reason for them in a traceless-style project. */
function getLintOptions(): LintOptions {
  const cfgPath = path.join(ROOT, "traceless-style.config.js");
  try {
    if (fs.existsSync(cfgPath)) {
      delete requireFromHere.cache[requireFromHere.resolve(cfgPath)];
      const cfg = requireFromHere(cfgPath) as { lint?: LintOptions | false };
      if (cfg.lint === false) return { ...DEFAULT_LINT_OPTIONS, noClassString: false, noCSSModules: false, noTailwind: false };
      if (cfg.lint) return { ...DEFAULT_LINT_OPTIONS, ...cfg.lint };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_LINT_OPTIONS };
}

/* Apply non-lint config knobs (auto-dark, contrast, etc.) before extraction runs. */
function applyTopLevelConfig(): void {
  const cfgPath = path.join(ROOT, "traceless-style.config.js");
  try {
    if (!fs.existsSync(cfgPath)) return;
    delete requireFromHere.cache[requireFromHere.resolve(cfgPath)];
    const cfg = requireFromHere(cfgPath) as {
      autoDarkMode?: boolean;
      contrast?:    Partial<ContrastValidatorOptions>;
    };
    if (cfg.autoDarkMode === false) setAutoDarkMode(false);
    if (cfg.contrast)               setContrastOptions(cfg.contrast);
  } catch { /* ignore */ }
}

/* ── Walk directory ── */
function walkDir(dir: string, exts: string[], files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(full, exts, files);
    else if (exts.includes(path.extname(e.name))) files.push(full);
  }
  return files;
}

/* ── Run lint on all files across every source root ── */
function runLint(lintOpts: LintOptions): number {
  const files: string[] = [];
  for (const dir of SRC_DIRS) walkDir(dir, [".tsx", ".jsx"], files);
  const allErrors: import("../compiler/lint").LintError[] = [];

  for (const file of files) {
    const src    = fs.readFileSync(file, "utf8");
    const errors = lint(src, file, lintOpts);
    allErrors.push(...errors);
  }

  if (allErrors.length > 0) {
    const formatted = formatLintErrors(allErrors, ROOT);
    console.error(formatted);
    return allErrors.length;
  }

  return 0;
}

/* ── Main extraction run ── */
async function run() {
  console.log("\n🔥 traceless-style — extracting...\n");

  applyTopLevelConfig();
  const lintOpts = getLintOptions();

  /* ── LINT FIRST — before extraction ── */
  if (lintOpts.noInlineStyles !== false) {
    const errorCount = runLint(lintOpts);
    if (errorCount > 0) {
      console.error(`\n🚫 traceless-style blocked — fix ${errorCount} lint error${errorCount===1?"":"s"} before continuing.\n`);
      process.exit(1); // HARD FAIL — always, even in dev
    }
  }

  /* ── Extract styles from every source root ── */
  await extract({
    srcDir: SRC_DIRS,
    dev:    DEV,
    lint:   false, // already ran above
    parser: PARSER,
  });

  /* ── Interactive accessibility auto-fix ──
     Auto-prompts on TTY when violations exist. CI-safe: any of these
     suppresses the prompt and falls back to plain warn/error output:
       • `--no-fix-prompt` flag
       • CI / non-TTY stdin/stdout
       • `process.env.CI` truthy (GitHub Actions, GitLab, CircleCI all set this)
     Explicit `--fix-contrast` forces the prompt path even when other
     heuristics would skip it (kept for backwards-compat).
     If the user accepts fixes we re-run extraction so they immediately
     see whether all violations were resolved — this is the closed-loop
     UX big-tech design systems expect: "run, fix, verify, done." */
  const hasIssues = getContrastIssues().length > 0;
  const ttyInteractive = !!process.stdin.isTTY && !!process.stdout.isTTY && !process.env.CI;
  const shouldPrompt = hasIssues && !NO_FIX_PROMPT && (FIX_CONTRAST_FLAG || ttyInteractive);
  if (shouldPrompt) {
    const result = await runInteractiveContrastFix(getContrastIssues(), ROOT);
    if (result.applied > 0) {
      // Closed loop — re-extract to verify the fixes resolved the issues.
      // Suppresses the prompt this time so we don't loop indefinitely.
      console.log("\n🔁 verifying applied fixes — re-extracting...\n");
      await extract({
        srcDir: SRC_DIRS,
        dev:    DEV,
        lint:   false,
        parser: PARSER,
      });
      const remaining = getContrastIssues().length;
      if (remaining === 0) {
        console.log("✅ all contrast issues resolved.\n");
      } else {
        console.log(`ℹ ${remaining} issue${remaining === 1 ? "" : "s"} remain (advisory or skipped).\n`);
      }
    }
  }
}

/* ── Watch mode ── */
async function watch() {
  await run();
  console.log("👀 Watching for changes...\n");

  let debounce: NodeJS.Timeout;

  for (const dir of SRC_DIRS) {
    fs.watch(dir, { recursive: true }, (_, filename) => {
      if (!filename) return;
      const ext = path.extname(filename);
      if (![".ts", ".tsx", ".js", ".jsx"].includes(ext)) return;

      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        console.log(`\n🔄 Changed: ${filename}`);
        try { await run(); }
        catch (e) { console.error(e); }
      }, 150);
    });
  }
}

/* ── Entry ──
   Subcommands:
     traceless-style                     → extract (default)
     traceless-style --watch             → extract + watch
     traceless-style --dev               → extract in dev mode (pretty CSS w/ source comments)
     traceless-style init                → ZERO-CONFIG: scaffold layout, scripts, config
     traceless-style dev                 → ZERO-CONFIG: extract + watch + framework dev
     traceless-style build               → ZERO-CONFIG: extract + framework build
     traceless-style inspect <file>      → describe a single file's traceless-style usage
     traceless-style audit               → repo-wide stats
*/
const subcommand = args.find(a => !a.startsWith("-"));
if (subcommand === "init") {
  initCommand(args)
    .then(code => process.exit(code))
    .catch(e => { console.error(e); process.exit(1); });
} else if (subcommand === "inspect") {
  const target = args[args.indexOf("inspect") + 1];
  if (!target) {
    console.error("Usage: traceless-style inspect <file>");
    process.exit(1);
  }
  inspectCommand(target)
    .then(code => process.exit(code))
    .catch(e => { console.error(e); process.exit(1); });
} else if (subcommand === "audit") {
  auditCommand()
    .then(code => process.exit(code))
    .catch(e => { console.error(e); process.exit(1); });
} else if (subcommand === "dev") {
  devCommand(args)
    .then(code => process.exit(code))
    .catch(e => { console.error(e); process.exit(1); });
} else if (subcommand === "build") {
  buildCommand(args)
    .then(code => process.exit(code))
    .catch(e => { console.error(e); process.exit(1); });
} else if (WATCH) {
  watch().catch(e => { console.error(e); process.exit(1); });
} else {
  run().catch(e => { console.error(e); process.exit(1); });
}