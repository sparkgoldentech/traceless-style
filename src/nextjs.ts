/**
 * spark-css/nextjs — Next.js integration
 *
 * Usage in next.config.ts:
 *   import { withSparkCSS } from "spark-css/nextjs";
 *   export default withSparkCSS(nextConfig);
 *
 * Automatically:
 * 1. Extracts styles before each build
 * 2. Transforms sc.create() → plain objects at compile time
 * 3. Injects __SPARK_CSS_META__ into bundle (enables sc.merge() conflict resolution)
 * 4. Emits spark-css.css
 * 5. Configures Turbopack resolveAlias
 */

import path from "path";
import fs   from "fs";
import type { NextConfig } from "next";
import { SparkCSSWebpackPlugin, sparkCSSLoader } from "./plugins/webpack";

export { SparkCSSWebpackPlugin };

export interface SparkCSSNextOptions {
  /** Source directory to scan. Default: src/ or app/ */
  srcDir?: string;
  /**
   * Custom variants passed to sc.extend().
   * Must match what you pass to sc.extend() in your code.
   *
   * Example:
   *   withSparkCSS(nextConfig, {
   *     variants: {
   *       _tablet: "@media (min-width: 900px)",
   *       _brand:  ".my-brand &",
   *     }
   *   })
   */
  variants?: Record<string, string>;
}

export function withSparkCSS(
  nextConfig: NextConfig = {},
  options: SparkCSSNextOptions = {}
): NextConfig {
  const ROOT    = process.cwd();
  const cssFile = path.join(ROOT, "public", "spark-css.css");
  const metaDir = path.join(ROOT, ".spark-css");

  /* Ensure output files exist before Next.js starts */
  fs.mkdirSync(path.dirname(cssFile), { recursive: true });
  fs.mkdirSync(metaDir, { recursive: true });
  if (!fs.existsSync(cssFile)) {
    fs.writeFileSync(cssFile, "/* spark-css — generated */\n");
  }

  return {
    ...nextConfig,

    /* ── Turbopack resolveAlias (forward slashes required on Windows) ── */
    turbopack: {
      ...(nextConfig as any).turbopack,
      resolveAlias: {
        ...((nextConfig as any).turbopack?.resolveAlias ?? {}),
        "spark-css": path
          .join(__dirname, "runtime", "index.js")
          .replace(/\\/g, "/"),
      },
    },

    /* ── Webpack ── */
    webpack(config, ctx) {

      /* 1. Transform sc.create() at compile time */
      config.module.rules.unshift({
        test:    /\.(ts|tsx|js|jsx)$/,
        exclude: [/node_modules/, /\.spark-css/],
        use:     [{ loader: require.resolve("./plugins/webpack") }],
      });

      /* 2. SparkCSSWebpackPlugin:
         - Runs extraction before compile
         - Injects __SPARK_CSS_META__ via DefinePlugin
         - Emits spark-css.css after emit */
      config.plugins = [
        ...(config.plugins ?? []),
        new SparkCSSWebpackPlugin(),
      ];

      /* 3. Auto-inject spark-css.css into app (client only) */
      if (!ctx.isServer) {
        const origEntry = config.entry;
        config.entry = async () => {
          const entries = await (
            typeof origEntry === "function"
              ? origEntry()
              : Promise.resolve(origEntry)
          );

          /* Write a small shim that imports the CSS */
          const shimPath = path
            .join(__dirname, "css-shim.js")
            .replace(/\\/g, "/");

          fs.writeFileSync(
            shimPath,
            `require(${JSON.stringify(cssFile.replace(/\\/g, "/"))});\n`
          );

          for (const key of Object.keys(entries)) {
            if (Array.isArray(entries[key]) && !entries[key].includes(shimPath)) {
              entries[key].unshift(shimPath);
            }
          }

          return entries;
        };
      }

      if (typeof nextConfig.webpack === "function") {
        return nextConfig.webpack(config, ctx);
      }
      return config;
    },
  };
}