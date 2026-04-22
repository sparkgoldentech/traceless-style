 /**
 * spark-css — extract function (reusable, not CLI-only)
 * Called by both the CLI and the Next.js plugin automatically.
 */
import fs   from "fs";
import path from "path";
import { transform, globalRegistry } from "../compiler/extractor";
import { generateCSS, generateCSSPretty, buildClassMeta } from "../compiler/css-gen";

export interface ExtractOptions {
  srcDir?:    string;   // default: process.cwd()/src or /app
  outCSS?:    string;   // default: public/spark-css.css
  outMeta?:   string;   // default: .spark-css/class-meta.json
  dev?:       boolean;  // pretty CSS in dev
  silent?:    boolean;  // suppress logs
}

export async function extract(opts: ExtractOptions = {}): Promise<{
  rules:  number;
  bytes:  number;
  files:  number;
  errors: string[];
}> {
  const ROOT    = process.cwd();
  const srcDir  = opts.srcDir  ?? (fs.existsSync(path.join(ROOT,"src")) ? path.join(ROOT,"src") : path.join(ROOT,"app"));
  const outCSS  = opts.outCSS  ?? path.join(ROOT, "public", "spark-css.css");
  const outMeta = opts.outMeta ?? path.join(ROOT, ".spark-css", "class-meta.json");
  const log     = opts.silent ? () => {} : console.log;

  globalRegistry.clear();

  const files     = walkDir(srcDir, [".ts",".tsx",".js",".jsx"]);
  const allErrors: string[] = [];
  let   totalFiles = 0;

  for (const file of files) {
    const src    = fs.readFileSync(file, "utf8");
    const result = transform(src, file);
    result.errors.forEach(e =>
      allErrors.push(`  ❌ ${path.relative(ROOT, e.file)}:${e.line}:${e.col} — ${e.message}`)
    );
    if (result.changed) totalFiles++;
  }

  const rules = globalRegistry.getAll();
  const css   = opts.dev ? generateCSSPretty(rules) : generateCSS(rules);
  const meta  = buildClassMeta(rules);

  fs.mkdirSync(path.dirname(outCSS),  { recursive: true });
  fs.mkdirSync(path.dirname(outMeta), { recursive: true });
  fs.writeFileSync(outCSS,  css);
  fs.writeFileSync(outMeta, JSON.stringify(meta, null, 2));

  if (allErrors.length && !opts.silent) {
    console.error("spark-css errors:\n" + allErrors.join("\n") + "\n");
  }

  log(`✅ spark-css: ${totalFiles} files | ${rules.length} rules | ${css.length} bytes`);

  return { rules: rules.length, bytes: css.length, files: totalFiles, errors: allErrors };
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