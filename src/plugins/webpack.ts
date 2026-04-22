/**
 * spark-css webpack plugin + loader
 *
 * Responsibilities:
 * 1. Transform sc.create() → plain objects at compile time
 * 2. Emit public/spark-css.css after compilation
 * 3. Inject __SPARK_CSS_META__ as a compile-time constant via DefinePlugin
 *    so sc.merge() has zero-cost conflict resolution at runtime
 */
import path    from "path";
import fs      from "fs";
import type { Compiler, WebpackPluginInstance } from "webpack";
import { transform, globalRegistry }    from "../compiler/extractor";
import { generateCSS, buildClassMeta }  from "../compiler/css-gen";
import { extract }                      from "../cli/extract-fn";

const PLUGIN = "SparkCSSPlugin";

export class SparkCSSWebpackPlugin implements WebpackPluginInstance {
  private ran = false;

  apply(compiler: Compiler): void {
    const webpack = compiler.webpack ?? require("webpack");

    /* ── Step 1: Run full extraction before compilation starts ── */
    compiler.hooks.beforeCompile.tapAsync(PLUGIN, async (_, cb) => {
      if (!this.ran) {
        this.ran = true;
        try {
          const srcDir = this.findSrcDir(compiler.context);
          await extract({
            srcDir,
            outCSS:  path.join(compiler.context, "public", "spark-css.css"),
            outMeta: path.join(compiler.context, ".spark-css", "class-meta.json"),
          });
        } catch (e) {
          console.error("[spark-css] extraction error:", e);
        }
      }
      cb();
    });

    /* ── Step 2: Inject __SPARK_CSS_META__ into the bundle ── */
    compiler.hooks.thisCompilation.tap(PLUGIN, (compilation) => {
      /* Read the meta file (written by extract above) */
      const metaPath = path.join(compiler.context, ".spark-css", "class-meta.json");
      let meta: Record<string, string> = {};
      try {
        if (fs.existsSync(metaPath)) {
          meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        }
      } catch { /* ignore */ }

      /* Use DefinePlugin to bake meta into the bundle as a compile-time constant */
      new webpack.DefinePlugin({
        __SPARK_CSS_META__: webpack.DefinePlugin.runtimeValue(
          () => JSON.stringify(meta),
          { fileDependencies: [metaPath] }
        ),
      }).apply({ hooks: { thisCompilation: { tap: (_: string, fn: (c: typeof compilation) => void) => fn(compilation) } } } as unknown as Compiler);
    });

    /* ── Step 3: After emit — update CSS with any new rules from compilation ── */
    compiler.hooks.afterEmit.tap(PLUGIN, () => {
      const rules = globalRegistry.getAll();
      if (!rules.length) return;

      const css    = generateCSS(rules);
      const meta   = buildClassMeta(rules);
      const outDir = path.join(compiler.context, "public");

      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "spark-css.css"), css);

      const metaDir = path.join(compiler.context, ".spark-css");
      fs.mkdirSync(metaDir, { recursive: true });
      fs.writeFileSync(
        path.join(metaDir, "class-meta.json"),
        JSON.stringify(meta)
      );
    });
  }

  private findSrcDir(context: string): string {
    const src = path.join(context, "src");
    const app = path.join(context, "app");
    if (fs.existsSync(src)) return src;
    if (fs.existsSync(app)) return app;
    return context;
  }
}

/** webpack loader — transforms individual files at compile time */
export function sparkCSSLoader(
  this: {
    resourcePath: string;
    cacheable?:   () => void;
  },
  source: string
): string {
  if (this.cacheable) this.cacheable();

  const ext = path.extname(this.resourcePath);
  if (![".ts", ".tsx", ".js", ".jsx"].includes(ext)) return source;
  if (!source.includes("sc.create")) return source;

  const { code, errors, warnings } = transform(source, this.resourcePath);

  warnings.forEach(w => console.warn(w));
  errors.forEach(e =>
    console.error(
      `[spark-css] ${path.relative(process.cwd(), e.file)}:${e.line}:${e.col} — ${e.message}`
    )
  );

  return code;
}