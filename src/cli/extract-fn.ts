/**
 * traceless-style — extract-fn.ts
 *
 * Two-pass extraction:
 * Pass 1 — scan ALL files for tl.extend() → collect all custom variants
 * Pass 2 — scan ALL files for tl.create() → transform with full variant map
 *
 * No config file needed. Works automatically.
 */
import fs   from "fs";
import path from "path";
import {
  transform        as legacyTransform,
  extractCustomVariants as legacyExtractCustomVariants,
  globalRegistry,
  processStyles,
  preprocessTokensAndCssVar,
  scanDefineTokens,
  loadPathAliases,
  installRegistryResolver,
  debugDumpExportRegistry,
  setContrastOptions,
  getContrastIssues,
  clearContrastIssues,
  type TransformResult,
} from "../compiler/extractor";
import { formatContrastIssues, type ContrastValidatorOptions } from "../compiler/contrast-validator";
import {
  generateCSS,
  generateCSSPretty,
  generateTokensCSS,
  generateThemesCSS,
  generateKeyframesCSS,
  buildClassMeta,
  BASELINE_CSS,
} from "../compiler/css-gen";
import { tokenRegistry, tokenExportRegistry } from "../compiler/tokens";
import {
  mergeVariants,
  DEFAULT_VARIANTS,
  type FlatVariants,
} from "../compiler/variants";
import {
  lint,
  formatLintErrors,
  type LintOptions,
  type LintError,
  DEFAULT_LINT_OPTIONS,
} from "../compiler/lint";
import { codeFrame } from "../compiler/codeframe";
import { buildCssSourceMap } from "../compiler/sourcemap";
import { FileCache } from "./file-cache";

// Re-export lint primitives so external tooling (CI checks, IDE plugins,
// custom build scripts) can run the same checks the CLI runs.
export { lint, DEFAULT_LINT_OPTIONS, formatLintErrors };
export type { LintOptions, LintError };

/**
 * Which AST parser the extractor uses.
 *   "auto"   — (default) pick automatically: legacy below AUTO_SWC_THRESHOLD
 *              files, SWC at or above it. Falls back to legacy if @swc/core
 *              isn't installed. Empirically the crossover sits around 100
 *              files (see CLAUDE.md "Empirical perf").
 *   "legacy" — hand-rolled scanner. Zero native deps.
 *   "swc"    — @swc/core full JS/TS AST. Stricter validation, faster on
 *              large codebases. Requires @swc/core (an optionalDependency).
 *
 * Can also be set via the TRACELESS_STYLE_PARSER environment variable.
 */
export type ParserChoice = "auto" | "legacy" | "swc";

/**
 * File-count threshold above which "auto" uses SWC. Below this, the
 * hand-rolled scanner wins because per-file parser overhead dominates.
 */
export const AUTO_SWC_THRESHOLD = 100;

export interface ExtractOptions {
  /**
   * Source root(s) to scan. Accepts a single directory or a list. Real
   * Next.js App Router projects often have BOTH `src/` and `app/` at root;
   * passing both ensures every file that ships gets linted and extracted.
   */
  srcDir?:  string | string[];
  outCSS?:  string;
  outMeta?: string;
  dev?:     boolean;
  silent?:  boolean;
  /** Lint rules — enforce traceless-style usage patterns */
  lint?:    LintOptions | false;
  /** AST parser. Default "auto" (legacy < AUTO_SWC_THRESHOLD files, SWC otherwise). */
  parser?:  ParserChoice;
  /**
   * Use the file-level cache to skip re-extracting unchanged files.
   * Cache key is sha256 of the source. Cache lives at
   * `.traceless-style/cache.json`. Default: true. Disable for benchmark
   * runs or when debugging cache invalidation issues.
   */
  cache?:   boolean;
  /**
   * WCAG contrast validation. Defaults to `{ level: "AA", strict: false }`
   * — every fg/bg pair in light + dark modes is audited and warnings are
   * surfaced. Setting `strict: true` makes AA violations fail the build
   * (like lint errors). Setting `level: "off"` disables the audit.
   */
  contrast?: Partial<ContrastValidatorOptions>;
}

interface ExtractorImpl {
  transform:             (src: string, file: string, custom?: Record<string, string>) => TransformResult;
  extractCustomVariants: (src: string, file: string) => Record<string, string>;
}

/**
 * Indirect dynamic import — hidden from bundlers via `Function(...)`.
 * This is critical: it keeps esbuild/tsup from trying to follow the import
 * into `extractor-swc` (and through it, into `@swc/core`'s native binary
 * resolution) at build time. The legacy parser path never triggers this
 * load, so users without `@swc/core` installed never pay the cost.
 */
const importHidden = new Function(
  "specifier",
  "return import(specifier);"
) as (specifier: string) => Promise<unknown>;

function legacyImpl(): ExtractorImpl {
  return {
    transform:             legacyTransform,
    extractCustomVariants: legacyExtractCustomVariants,
  };
}

async function tryLoadSwc(silent: boolean): Promise<ExtractorImpl | null> {
  try {
    const swcMod = (await importHidden("../compiler/extractor-swc.js")) as {
      createSwcExtractor: (deps: {
        processStyles:    typeof processStyles;
        globalRegistry:   typeof globalRegistry;
        mergeVariants:    typeof mergeVariants;
        DEFAULT_VARIANTS: typeof DEFAULT_VARIANTS;
        preprocess?:      typeof preprocessTokensAndCssVar;
      }) => ExtractorImpl;
    };
    const swc = swcMod.createSwcExtractor({
      processStyles,
      globalRegistry,
      mergeVariants,
      DEFAULT_VARIANTS,
      preprocess: preprocessTokensAndCssVar,
    });
    if (!silent) console.log("⚡ traceless-style: using SWC parser");
    return swc;
  } catch {
    return null;
  }
}

/**
 * Pick the parser implementation.
 *   - explicit "legacy" / "swc" choice → honored (errors if SWC requested but missing)
 *   - "auto" (default) → file-count-based:
 *       fileCount < AUTO_SWC_THRESHOLD → legacy (faster on small codebases)
 *       fileCount ≥ AUTO_SWC_THRESHOLD → SWC if installed, else legacy
 */
async function loadExtractor(
  choice:    ParserChoice,
  fileCount: number,
  silent:    boolean
): Promise<ExtractorImpl> {
  if (choice === "legacy") return legacyImpl();

  if (choice === "swc") {
    const impl = await tryLoadSwc(silent);
    if (impl) return impl;
    throw new Error(
      "[traceless-style] parser=\"swc\" requires @swc/core. Install it with:\n" +
      "  npm install --save-dev @swc/core"
    );
  }

  // "auto"
  if (fileCount < AUTO_SWC_THRESHOLD) return legacyImpl();
  const impl = await tryLoadSwc(silent);
  return impl ?? legacyImpl();
}

function resolveParser(opts: ExtractOptions): ParserChoice {
  if (opts.parser) return opts.parser;
  const env = process.env.TRACELESS_STYLE_PARSER?.toLowerCase();
  if (env === "swc")    return "swc";
  if (env === "legacy") return "legacy";
  if (env === "auto")   return "auto";
  return "auto";
}

export interface ExtractResult {
  rules:           number;
  bytes:           number;
  files:           number;
  errors:          string[];
  customVariants:  Record<string, string>;
  variants:        FlatVariants;
}

export async function extract(opts: ExtractOptions = {}): Promise<ExtractResult> {
  const ROOT    = process.cwd();
  const srcDirs = resolveSrcDirs(opts.srcDir, ROOT);
  const outCSS  = opts.outCSS  ?? path.join(ROOT, "public", "traceless-style.css");
  const outMeta = opts.outMeta ?? path.join(ROOT, ".traceless-style", "class-meta.json");
  const log     = opts.silent  ? () => {} : console.log;

  globalRegistry.clear();
  tokenRegistry.clear();
  tokenExportRegistry.clear();
  clearContrastIssues();
  if (opts.contrast) setContrastOptions(opts.contrast);

  // Read tsconfig.json paths (if any) so cross-file member access through
  // `@/theme`-style aliases resolves. Then install the alias-aware
  // resolver into the export registry so re-export chains can follow
  // path-aliased and bare specifiers.
  loadPathAliases(ROOT);
  installRegistryResolver();

  const files: string[] = [];
  for (const dir of srcDirs) walkDir(dir, [".ts", ".tsx", ".js", ".jsx"], files);
  /* DETERMINISTIC ORDERING — `fs.readdirSync` is filesystem-dependent
     (NTFS / APFS sort alphabetically; ext4 / xfs return hash order). To
     guarantee byte-stable CSS output across machines and CI runs we
     sort explicitly. Same convention webpack, esbuild, and Rollup ship
     with for their own caching / cache-key generation. */
  files.sort();

  /* ── PASS 0: Read-only scan of every file for `defineTokens` exports ──
     Populates `tokenExportRegistry` so any later file's `transform()` can
     resolve cross-file `import { tokens } from "./theme"; tokens.brand.x`
     references regardless of file processing order. */
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    scanDefineTokens(src, file);
  }

  if (process.env.TRACELESS_STYLE_DEBUG_RESOLVE) {
    // Diagnostic: dump the export registry after PASS 0 so users debugging
    // cross-file resolution can see what the scanner actually saw.
    console.error("[traceless-style] export registry after PASS 0:\n" + debugDumpExportRegistry());
  }

  // Parser choice depends on file count for "auto" mode, so defer loading.
  const parser   = resolveParser(opts);
  const impl     = await loadExtractor(parser, files.length, opts.silent ?? false);

  /* ── PASS 1: Collect ALL custom variants from tl.extend() calls ── */
  const allCustomVariants: Record<string, string> = {};

  for (const file of files) {
    const src     = fs.readFileSync(file, "utf8");
    const detected = impl.extractCustomVariants(src, file);
    Object.assign(allCustomVariants, detected);
  }

  /* Build the complete variant map */
  const { flat: variantMap, errors: varErrors } =
    Object.keys(allCustomVariants).length > 0
      ? mergeVariants(allCustomVariants)
      : { flat: DEFAULT_VARIANTS, errors: [] };

  if (varErrors.length > 0) {
    for (const e of varErrors) {
      console.warn(`[traceless-style] Variant warning — ${e.message}`);
    }
  }

  if (Object.keys(allCustomVariants).length > 0 && !opts.silent) {
    log(`📦 Custom variants detected: ${Object.keys(allCustomVariants).join(", ")}`);
  }

  /* ── PASS 2: Transform tl.create() calls with full variant map ── */
  const allErrors: string[] = [];
  let   totalFiles = 0;

  // File-level cache. Skips lint + transform for files whose source
  // hasn't changed since the previous run. Critical at FB/X scale where
  // re-extracting 10K files every save would be the slow path. Cache
  // is keyed on a sha256 of the source text — branch switches and IDE
  // plays don't fool it the way mtime would.
  //
  // EXCLUSION: files that use `tl.keyframes`, `tl.defineTokens`, or
  // `tl.createTheme` are NEVER cached. Those APIs register entries in
  // the token-registry side-effect that the cache (which only stores
  // atomic rules) can't replay. A cache hit on those files would lose
  // every keyframe / token / theme they declare. Detect via cheap text
  // scan — these substrings can only appear in our own API calls.
  const cacheEnabled = opts.cache !== false;
  const cache = cacheEnabled ? new FileCache(ROOT) : null;
  const variantSig = JSON.stringify(allCustomVariants);
  const hasSideEffectingApi = (src: string): boolean =>
    src.includes(".keyframes") || src.includes(".defineTokens") || src.includes(".createTheme");

  for (const file of files) {
    const src    = fs.readFileSync(file, "utf8");
    const cacheable = !hasSideEffectingApi(src);

    /* Cache hit fast path — only for files without side-effecting APIs. */
    const cacheKey = src + "\0VARS:" + variantSig;
    const hit = cacheable ? cache?.get(file, cacheKey) : null;
    if (hit) {
      for (const r of hit.rules) globalRegistry.add(r);
      if (hit.rules.length > 0) totalFiles++;
      continue;
    }

    /* ── Lint check — enforce traceless-style rules ── */
    if (opts.lint !== false) {
      const lintOpts = opts.lint ?? DEFAULT_LINT_OPTIONS;
      const lintErrors = lint(src, file, lintOpts);
      if (lintErrors.length > 0) {
        const formatted = formatLintErrors(lintErrors, ROOT);
        if (opts.dev) {
          console.warn(formatted);
        } else {
          console.error(formatted);
          process.exit(1); // Hard fail in production builds
        }
      }
    }

    const result = impl.transform(src, file, allCustomVariants);

    // Store the result in the cache only when:
    //   - extraction was clean (no errors), AND
    //   - the file has no side-effecting APIs we can't replay.
    // Files with `tl.keyframes` / `tl.defineTokens` / `tl.createTheme`
    // need their token-registry side effects re-run on each extraction.
    if (cache && cacheable && result.errors.length === 0) {
      cache.set(file, cacheKey, { rules: result.rules, customVars: {} });
    }

    result.errors.forEach(e => {
      // Only report truly unknown variants (not the ones we just registered)
      const msg = e.message;
      const isKnownCustom = Object.keys(allCustomVariants).some(v =>
        msg.includes(`'${v}'`)
      );
      if (!isKnownCustom) {
        const head = `  ❌ ${path.relative(ROOT, e.file)}:${e.line}:${e.col} — ${msg}`;
        const frame = codeFrame(src, e.line, e.col)
          .split("\n").map(l => "     " + l).join("\n");
        allErrors.push(head + "\n" + frame);
      }
    });

    result.warnings.forEach(w => {
      if (!opts.silent) console.warn(`  ⚠️  ${w}`);
    });

    if (result.changed) totalFiles++;
  }

  /* ── Write output files ──
     Layer order in the emitted CSS file:
       1. :root tokens         (must come first — referenced by everything)
       2. theme overrides      (override tokens when their class is applied)
       3. @keyframes           (referenced by atomic `animation:` values)
       4. atomic rules         (consume tokens via var())                     */
  const rules     = globalRegistry.getAll();
  const tokens    = tokenRegistry.getTokens();
  const themes    = tokenRegistry.getThemes();
  const keyframes = tokenRegistry.getKeyframes();

  // Bundle splitting: rules with `bundle: "feed"` go into <feed>.css
  // INSTEAD of the default file. Tokens, themes, keyframes, and the
  // baseline always live in the default file (referenced by every
  // bundle via CSS custom properties), so a route loads the default
  // file PLUS its specific bundle. Apps without `bundle:` markers
  // emit a single monolithic file and continue to work as before.
  const defaultRules: typeof rules = [];
  const byBundle     = new Map<string, typeof rules>();
  for (const r of rules) {
    if (r.bundle) {
      let arr = byBundle.get(r.bundle);
      if (!arr) { arr = []; byBundle.set(r.bundle, arr); }
      arr.push(r);
    } else {
      defaultRules.push(r);
    }
  }

  const baseCSS = opts.dev ? generateCSSPretty(defaultRules) : generateCSS(defaultRules);
  let   css     = BASELINE_CSS
                + generateTokensCSS(tokens)
                + generateThemesCSS(themes)
                + generateKeyframesCSS(keyframes)
                + baseCSS;
  const meta    = buildClassMeta(rules);

  // Source map — only for the minified production output of the default file.
  const cssFileName = path.basename(outCSS);
  if (!opts.dev) {
    const { map, comment } = buildCssSourceMap(defaultRules, css, {
      rootDir:  ROOT,
      fileName: cssFileName,
    });
    css = css + comment;
    fs.mkdirSync(path.dirname(outCSS), { recursive: true });
    fs.writeFileSync(outCSS + ".map", map);
  }

  fs.mkdirSync(path.dirname(outCSS),  { recursive: true });
  fs.mkdirSync(path.dirname(outMeta), { recursive: true });
  fs.writeFileSync(outCSS,  css);
  fs.writeFileSync(outMeta, JSON.stringify(meta, null, 2));

  // Emit per-bundle CSS files alongside the default. Each lives next to
  // outCSS with the same basename rules: e.g. public/traceless-feed.css
  // for `bundle: "feed"` when outCSS = public/traceless-style.css.
  const outDir   = path.dirname(outCSS);
  const baseName = path.basename(outCSS, ".css"); // "traceless-style"
  for (const [bundleName, bundleRules] of byBundle) {
    if (!/^[A-Za-z0-9_-]+$/.test(bundleName)) {
      // Reject suspicious bundle names — defense in depth.
      continue;
    }
    const bundleFile = path.join(outDir, `${baseName}.${bundleName}.css`);
    let   bundleCss  = opts.dev ? generateCSSPretty(bundleRules) : generateCSS(bundleRules);
    if (!opts.dev) {
      const { map, comment } = buildCssSourceMap(bundleRules, bundleCss, {
        rootDir:  ROOT,
        fileName: path.basename(bundleFile),
      });
      bundleCss = bundleCss + comment;
      fs.writeFileSync(bundleFile + ".map", map);
    }
    fs.writeFileSync(bundleFile, bundleCss);
  }
  if (byBundle.size > 0 && !opts.silent) {
    log(`📦 emitted ${byBundle.size} bundle CSS file${byBundle.size === 1 ? "" : "s"}: ${[...byBundle.keys()].join(", ")}`);
  }

  /* Write detected variants for the webpack plugin to use */
  const variantsPath = path.join(ROOT, ".traceless-style", "variants.json");
  fs.writeFileSync(variantsPath, JSON.stringify(allCustomVariants, null, 2));

  if (allErrors.length > 0 && !opts.silent) {
    console.error("traceless-style errors:\n" + allErrors.join("\n") + "\n");
    if (!opts.dev) process.exit(1);
  }

  /* ── Contrast audit results ────────────────────────────────────
     Surface every fg/bg pair that failed WCAG. Errors (strict mode)
     fail the build; warnings just print. */
  const contrastIssues = getContrastIssues();
  if (contrastIssues.length > 0 && !opts.silent) {
    const formatted = formatContrastIssues(contrastIssues);
    const hasErrors = contrastIssues.some(i => i.severity === "error");
    if (hasErrors) {
      console.error(formatted);
      if (!opts.dev) process.exit(1);
    } else {
      console.warn(formatted);
    }
  }

  // Drop cache entries for files that no longer exist + flush to disk.
  if (cache) {
    cache.prune(new Set(files));
    cache.save();
    if (cache.hits + cache.misses > 0 && !opts.silent) {
      log(`💾 cache: ${cache.hits} hit${cache.hits === 1 ? "" : "s"}, ${cache.misses} miss${cache.misses === 1 ? "" : "es"}`);
    }
  }

  log(`✅ traceless-style: ${totalFiles} files | ${rules.length} rules | ${css.length} bytes`);

  return {
    rules:          rules.length,
    bytes:          css.length,
    files:          totalFiles,
    errors:         allErrors,
    customVariants: allCustomVariants,
    variants:       variantMap,
  };
}

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

/**
 * Normalize the user-provided srcDir option to a list of absolute paths.
 *
 * - explicit string → wrap in array
 * - explicit array  → resolve each
 * - omitted         → union of `src/` and `app/` that exist at ROOT;
 *                     fall back to ROOT itself if neither exists.
 *
 * Auto-discovering BOTH src/ and app/ matches how Next.js App Router
 * projects are actually laid out, and prevents the silent miss where one
 * directory's files compile into the bundle but never get linted.
 */
function resolveSrcDirs(opt: string | string[] | undefined, root: string): string[] {
  if (Array.isArray(opt) && opt.length > 0) {
    return opt.map(d => path.isAbsolute(d) ? d : path.join(root, d));
  }
  if (typeof opt === "string" && opt.length > 0) {
    return [path.isAbsolute(opt) ? opt : path.join(root, opt)];
  }
  const dirs: string[] = [];
  for (const d of ["src", "app"]) {
    const full = path.join(root, d);
    if (fs.existsSync(full)) dirs.push(full);
  }
  return dirs.length > 0 ? dirs : [root];
}