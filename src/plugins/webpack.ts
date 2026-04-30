/**
 * traceless-style webpack plugin + loader
 *
 * Responsibilities:
 * 1. Transform tl.create() → plain objects at compile time
 * 2. Emit public/traceless-style.css after compilation
 * 3. Inject __TRACELESS_STYLE_META__ as a compile-time constant via DefinePlugin
 *    so tl.merge() has zero-cost conflict resolution at runtime
 */
import path    from "path";
import fs      from "fs";
import type { Compiler, WebpackPluginInstance } from "webpack";
import { transform, globalRegistry, setAutoDarkMode, setContrastOptions } from "../compiler/extractor";
import { generateCSS, buildClassMeta }  from "../compiler/css-gen";
import { extract }                      from "../cli/extract-fn";
import { DEFAULT_LINT_OPTIONS, type LintOptions } from "../compiler/lint";
import type { ContrastValidatorOptions } from "../compiler/contrast-validator";

/**
 * Best-effort load of `traceless-style.config.js` from the compiler's
 * project root. Returns `null` when no config is present, when the
 * file fails to require, or when the export shape is unrecognized.
 *
 * This makes the webpack plugin honor the same config file the CLI
 * does — without it, every `next build` runs with strict defaults
 * even when the user has set `contrast: { strict: false }` for an
 * in-progress migration. That's the difference between "config
 * works" and "config silently ignored," which is the kind of friction
 * that makes a tool feel half-built.
 */
interface LoadedConfig {
  lint?:         LintOptions | false;
  autoDarkMode?: boolean;
  contrast?:     Partial<ContrastValidatorOptions>;
}
function loadProjectConfig(root: string): LoadedConfig | null {
  const cfgPath = path.join(root, "traceless-style.config.js");
  if (!fs.existsSync(cfgPath)) return null;
  try {
    // Bust the require cache so a config edit in watch mode is picked
    // up without restarting the dev server.
    delete require.cache[require.resolve(cfgPath)];
    return require(cfgPath) as LoadedConfig;
  } catch (e) {
    console.warn(`[traceless-style] traceless-style.config.js failed to load: ${(e as Error).message}`);
    return null;
  }
}

const PLUGIN = "TracelessStylePlugin";

export class TracelessStyleWebpackPlugin implements WebpackPluginInstance {
  private ran = false;

  apply(compiler: Compiler): void {
    const webpack = compiler.webpack ?? require("webpack");

    /* ── Step 1: Run full extraction before compilation starts ── */
    compiler.hooks.beforeCompile.tapAsync(PLUGIN, async (_, cb) => {
      if (!this.ran) {
        this.ran = true;
        try {
          const srcDir = this.findSrcDirs(compiler.context);
          // Read the project's traceless-style.config.js so user-set
          // contrast / lint / autoDarkMode options apply during the
          // bundler-driven extraction the same way they do for the
          // standalone CLI. Without this, `next build` runs with hard
          // defaults regardless of what the user wrote in config.
          const cfg = loadProjectConfig(compiler.context);
          if (cfg) {
            if (cfg.autoDarkMode === false)        setAutoDarkMode(false);
            if (cfg.contrast)                      setContrastOptions(cfg.contrast);
          }
          const lintOpt: LintOptions | false =
            cfg?.lint === false                    ? { ...DEFAULT_LINT_OPTIONS, noClassString: false, noCSSModules: false, noTailwind: false }
          : cfg?.lint                              ? { ...DEFAULT_LINT_OPTIONS, ...cfg.lint }
                                                   : DEFAULT_LINT_OPTIONS;
          await extract({
            srcDir,
            outCSS:    path.join(compiler.context, "public", "traceless-style.css"),
            outMeta:   path.join(compiler.context, ".traceless-style", "class-meta.json"),
            lint:      lintOpt,
            contrast:  cfg?.contrast,
          });
        } catch (e) {
          console.error("[traceless-style] extraction error:", e);
        }
      }
      cb();
    });

    /* ── Step 2: Inject __TRACELESS_STYLE_META__ into the bundle ── */
    compiler.hooks.thisCompilation.tap(PLUGIN, (compilation) => {
      /* Read the meta file (written by extract above) */
      const metaPath = path.join(compiler.context, ".traceless-style", "class-meta.json");
      let meta: Record<string, string> = {};
      try {
        if (fs.existsSync(metaPath)) {
          meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        }
      } catch { /* ignore */ }

      /* Use DefinePlugin to bake meta into the bundle as a compile-time constant */
      new webpack.DefinePlugin({
        __TRACELESS_STYLE_META__: webpack.DefinePlugin.runtimeValue(
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
      fs.writeFileSync(path.join(outDir, "traceless-style.css"), css);

      const metaDir = path.join(compiler.context, ".traceless-style");
      fs.mkdirSync(metaDir, { recursive: true });
      fs.writeFileSync(
        path.join(metaDir, "class-meta.json"),
        JSON.stringify(meta)
      );
    });
  }

  /**
   * Return every source root that exists. Real Next App Router projects
   * commonly have BOTH `src/` and `app/`; scanning only one silently
   * misses files. Falls back to the project root when neither exists.
   */
  private findSrcDirs(context: string): string[] {
    const dirs: string[] = [];
    for (const d of ["src", "app"]) {
      const full = path.join(context, d);
      if (fs.existsSync(full)) dirs.push(full);
    }
    return dirs.length > 0 ? dirs : [context];
  }
}

/** webpack loader — transforms individual files at compile time */
export function tracelessStyleLoader(
  this: {
    resourcePath: string;
    cacheable?:   () => void;
  },
  source: string
): string {
  if (this.cacheable) this.cacheable();

  const ext = path.extname(this.resourcePath);
  if (![".ts", ".tsx", ".js", ".jsx"].includes(ext)) return source;
  if (!source.includes("tl.create")) return source;

  const { code, errors, warnings } = transform(source, this.resourcePath);

  warnings.forEach(w => console.warn(w));
  errors.forEach(e =>
    console.error(
      `[traceless-style] ${path.relative(process.cwd(), e.file)}:${e.line}:${e.col} — ${e.message}`
    )
  );

  return code;
}