/**
 * spark-css webpack plugin + loader
 * Runs automatically when withSparkCSS() is used in next.config.ts
 */
import path   from "path";
import fs     from "fs";
import type { Compiler } from "webpack";
import { transform, globalRegistry } from "../compiler/extractor";
import { generateCSS, buildClassMeta } from "../compiler/css-gen";
import { extract }                     from "../cli/extract-fn";

const PLUGIN = "SparkCSSPlugin";

export class SparkCSSWebpackPlugin {
  private ran = false;

  apply(compiler: Compiler) {
    /* Before each compilation — run full extraction first */
    compiler.hooks.beforeCompile.tapAsync(PLUGIN, async (_, cb) => {
      if (!this.ran) {
        this.ran = true;
        try {
          await extract({
            srcDir: fs.existsSync(path.join(compiler.context, "src"))
              ? path.join(compiler.context, "src")
              : path.join(compiler.context, "app"),
            outCSS:  path.join(compiler.context, "public", "spark-css.css"),
            outMeta: path.join(compiler.context, ".spark-css", "class-meta.json"),
          });
        } catch (e) {
          console.error("[spark-css] extraction error:", e);
        }
      }
      cb();
    });

    /* After emit — update CSS with any new rules found during compilation */
    compiler.hooks.afterEmit.tap(PLUGIN, () => {
      const rules  = globalRegistry.getAll();
      if (!rules.length) return;
      const css    = generateCSS(rules);
      const meta   = buildClassMeta(rules);
      const outDir = path.join(compiler.context, "public");
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "spark-css.css"), css);
      const metaDir = path.join(compiler.context, ".spark-css");
      fs.mkdirSync(metaDir, { recursive: true });
      fs.writeFileSync(path.join(metaDir, "class-meta.json"), JSON.stringify(meta));
    });
  }
}

/** webpack loader — transforms sc.create() at compile time */
export function sparkCSSLoader(
  this: { resourcePath: string; cacheable?: () => void },
  source: string
): string {
  if (this.cacheable) this.cacheable();
  if (![".ts",".tsx",".js",".jsx"].includes(path.extname(this.resourcePath))) return source;
  if (!source.includes("sc.create")) return source;

  const { code, errors, warnings } = transform(source, this.resourcePath);
  warnings.forEach(w => console.warn(w));
  errors.forEach(e =>
    console.error(`[spark-css] ${path.relative(process.cwd(), e.file)}:${e.line}:${e.col} — ${e.message}`)
  );
  return code;
}