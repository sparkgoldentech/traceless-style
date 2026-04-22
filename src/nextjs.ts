/**
 * spark-css/nextjs — Next.js integration
 *
 * Usage in next.config.ts:
 *   import { withSparkCSS } from "spark-css/nextjs";
 *   export default withSparkCSS(nextConfig);
 *
 * That's it — no manual imports, no CLI commands needed.
 * spark-css handles everything automatically.
 */

import path from "path";
import fs   from "fs";
import type { NextConfig } from "next";
import { SparkCSSWebpackPlugin, sparkCSSLoader } from "./plugins/webpack";

export { SparkCSSWebpackPlugin };

export function withSparkCSS(nextConfig: NextConfig = {}): NextConfig {
  const ROOT    = process.cwd();
  const cssFile = path.join(ROOT, "public", "spark-css.css");
  const metaDir = path.join(ROOT, ".spark-css");

  /* Ensure CSS file exists before Next.js starts */
  fs.mkdirSync(path.dirname(cssFile), { recursive: true });
  fs.mkdirSync(metaDir, { recursive: true });
  if (!fs.existsSync(cssFile)) {
    fs.writeFileSync(cssFile, "/* spark-css — generated */\n");
  }

  return {
    ...nextConfig,

    /* Turbopack — resolve spark-css to the dist runtime */
    turbopack: {
      ...(nextConfig as any).turbopack,
      resolveAlias: {
        ...((nextConfig as any).turbopack?.resolveAlias ?? {}),
        "spark-css": path.join(__dirname, "runtime", "index.js"),
      },
    },

    /* Webpack — transform sc.create() + emit CSS */
    webpack(config, ctx) {

      /* 1. Transform sc.create() calls at build time */
      config.module.rules.unshift({
        test:    /\.(ts|tsx|js|jsx)$/,
        exclude: [/node_modules/, /\.spark-css/],
        use:     [{ loader: require.resolve("./plugins/webpack") }],
      });

      /* 2. Collect rules and emit spark-css.css */
      config.plugins = [
        ...(config.plugins ?? []),
        new SparkCSSWebpackPlugin(),
      ];

      /* 3. Auto-inject spark-css.css into the client app
         by prepending an import to the _app entry */
      if (!ctx.isServer) {
        const origEntry = config.entry;
        config.entry = async () => {
          const entries = await (
            typeof origEntry === "function"
              ? origEntry()
              : Promise.resolve(origEntry)
          );

          /* Find the main app entry and prepend our CSS shim */
          const shimPath = path.join(__dirname, "css-shim.js");

          /* Write the shim dynamically pointing to the actual CSS file */
          fs.writeFileSync(
            shimPath,
            `require(${JSON.stringify(cssFile)});\n`
          );

          for (const key of Object.keys(entries)) {
            if (
              typeof entries[key] === "object" &&
              Array.isArray(entries[key]) &&
              !entries[key].includes(shimPath)
            ) {
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