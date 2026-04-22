/**
 * spark-css — extract-fn.ts
 *
 * Two-pass extraction:
 * Pass 1 — scan ALL files for sc.extend() → collect all custom variants
 * Pass 2 — scan ALL files for sc.create() → transform with full variant map
 *
 * No config file needed. Works automatically.
 */
import fs   from "fs";
import path from "path";
import {
  transform,
  extractCustomVariants,
  globalRegistry,
} from "../compiler/extractor";
import {
  generateCSS,
  generateCSSPretty,
  buildClassMeta,
} from "../compiler/css-gen";
import {
  mergeVariants,
  DEFAULT_VARIANTS,
  type FlatVariants,
} from "../compiler/variants";

export interface ExtractOptions {
  srcDir?:  string;
  outCSS?:  string;
  outMeta?: string;
  dev?:     boolean;
  silent?:  boolean;
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
  const srcDir  = opts.srcDir ?? (
    fs.existsSync(path.join(ROOT, "src"))
      ? path.join(ROOT, "src")
      : path.join(ROOT, "app")
  );
  const outCSS  = opts.outCSS  ?? path.join(ROOT, "public", "spark-css.css");
  const outMeta = opts.outMeta ?? path.join(ROOT, ".spark-css", "class-meta.json");
  const log     = opts.silent  ? () => {} : console.log;

  globalRegistry.clear();

  const files = walkDir(srcDir, [".ts", ".tsx", ".js", ".jsx"]);

  /* ── PASS 1: Collect ALL custom variants from sc.extend() calls ── */
  const allCustomVariants: Record<string, string> = {};

  for (const file of files) {
    const src     = fs.readFileSync(file, "utf8");
    const detected = extractCustomVariants(src, file);
    Object.assign(allCustomVariants, detected);
  }

  /* Build the complete variant map */
  const { flat: variantMap, errors: varErrors } =
    Object.keys(allCustomVariants).length > 0
      ? mergeVariants(allCustomVariants)
      : { flat: DEFAULT_VARIANTS, errors: [] };

  if (varErrors.length > 0) {
    for (const e of varErrors) {
      console.warn(`[spark-css] Variant warning — ${e.message}`);
    }
  }

  if (Object.keys(allCustomVariants).length > 0 && !opts.silent) {
    log(`📦 Custom variants detected: ${Object.keys(allCustomVariants).join(", ")}`);
  }

  /* ── PASS 2: Transform sc.create() calls with full variant map ── */
  const allErrors: string[] = [];
  let   totalFiles = 0;

  for (const file of files) {
    const src    = fs.readFileSync(file, "utf8");
    const result = transform(src, file, allCustomVariants);

    result.errors.forEach(e => {
      // Only report truly unknown variants (not the ones we just registered)
      const msg = e.message;
      const isKnownCustom = Object.keys(allCustomVariants).some(v =>
        msg.includes(`'${v}'`)
      );
      if (!isKnownCustom) {
        allErrors.push(
          `  ❌ ${path.relative(ROOT, e.file)}:${e.line}:${e.col} — ${msg}`
        );
      }
    });

    result.warnings.forEach(w => {
      if (!opts.silent) console.warn(`  ⚠️  ${w}`);
    });

    if (result.changed) totalFiles++;
  }

  /* ── Write output files ── */
  const rules = globalRegistry.getAll();
  const css   = opts.dev ? generateCSSPretty(rules) : generateCSS(rules);
  const meta  = buildClassMeta(rules);

  fs.mkdirSync(path.dirname(outCSS),  { recursive: true });
  fs.mkdirSync(path.dirname(outMeta), { recursive: true });
  fs.writeFileSync(outCSS,  css);
  fs.writeFileSync(outMeta, JSON.stringify(meta, null, 2));

  /* Write detected variants for the webpack plugin to use */
  const variantsPath = path.join(ROOT, ".spark-css", "variants.json");
  fs.writeFileSync(variantsPath, JSON.stringify(allCustomVariants, null, 2));

  if (allErrors.length > 0 && !opts.silent) {
    console.error("spark-css errors:\n" + allErrors.join("\n") + "\n");
    if (!opts.dev) process.exit(1);
  }

  log(`✅ spark-css: ${totalFiles} files | ${rules.length} rules | ${css.length} bytes`);

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