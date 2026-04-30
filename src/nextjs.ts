/**
 * traceless-style/nextjs — Next.js integration
 *
 * Usage in next.config.ts:
 *   import { withTracelessStyle } from "traceless-style/nextjs";
 *   export default withTracelessStyle(nextConfig);
 *
 * Automatically:
 * 1. Extracts styles before each build
 * 2. Transforms tl.create() → plain objects at compile time
 * 3. Injects __TRACELESS_STYLE_META__ into bundle (enables tl.merge() conflict resolution)
 * 4. Emits traceless-style.css
 * 5. Configures Turbopack resolveAlias
 */

import path from "path";
import fs   from "fs";
import type { NextConfig } from "next";
import { TracelessStyleWebpackPlugin, tracelessStyleLoader } from "./plugins/webpack";

export { TracelessStyleWebpackPlugin };

export interface TracelessStyleNextOptions {
  /** Source directory to scan. Default: src/ or app/ */
  srcDir?: string;
  /**
   * Custom variants passed to tl.extend().
   * Must match what you pass to tl.extend() in your code.
   *
   * Example:
   *   withTracelessStyle(nextConfig, {
   *     variants: {
   *       _tablet: "@media (min-width: 900px)",
   *       _brand:  ".my-brand &",
   *     }
   *   })
   */
  variants?: Record<string, string>;
}

export function withTracelessStyle(
  nextConfig: NextConfig = {},
  options: TracelessStyleNextOptions = {}
): NextConfig {
  // Defensive check: withTracelessStyle is for Next.js. If users call it from
  // a Vite/Rspack/raw-webpack config they'd otherwise hit cryptic "config
  // shape" errors deep inside Next's loader. Catch it early with a
  // pointer to the right integration.
  try {
    require.resolve("next");
  } catch {
    throw new Error(
      "[traceless-style] `withTracelessStyle()` is the Next.js integration but the " +
      "`next` package is not installed. For raw webpack, import " +
      "`TracelessStyleWebpackPlugin` from \"traceless-style/webpack\" and add it " +
      "to your webpack config's plugins array. For Vite/Rspack/Turbopack " +
      "users not on Next.js, the matching plugin doesn't exist yet — " +
      "open an issue at https://github.com/sparkgoldentech/traceless-style/issues."
    );
  }

  const ROOT    = process.cwd();
  const cssFile = path.join(ROOT, "public", "traceless-style.css");
  const metaDir = path.join(ROOT, ".traceless-style");

  /* Ensure output files exist before Next.js starts */
  fs.mkdirSync(path.dirname(cssFile), { recursive: true });
  fs.mkdirSync(metaDir, { recursive: true });
  if (!fs.existsSync(cssFile)) {
    fs.writeFileSync(cssFile, "/* traceless-style — generated */\n");
  }

  return {
    ...nextConfig,

    /* ── Turbopack resolveAlias (forward slashes required on Windows) ── */
    turbopack: {
      ...(nextConfig as any).turbopack,
      resolveAlias: {
        ...((nextConfig as any).turbopack?.resolveAlias ?? {}),
        "traceless-style":       path.join(__dirname, "runtime", "index.js").replace(/\\/g, "/"),
        "traceless-style/dark":  path.join(__dirname, "dark.js").replace(/\\/g, "/"),
        "traceless-style/nextjs":path.join(__dirname, "nextjs.js").replace(/\\/g, "/"),
      },
    },

    /* ── Webpack ── */
    webpack(config, ctx) {

      /* 1. Transform tl.create() at compile time */
      config.module.rules.unshift({
        test:    /\.(ts|tsx|js|jsx)$/,
        exclude: [/node_modules/, /\.traceless-style/],
        use:     [{ loader: require.resolve("./plugins/webpack") }],
      });

      /* 2. TracelessStyleWebpackPlugin:
         - Runs extraction before compile
         - Injects __TRACELESS_STYLE_META__ via DefinePlugin
         - Emits traceless-style.css after emit */
      config.plugins = [
        ...(config.plugins ?? []),
        new TracelessStyleWebpackPlugin(),
      ];

      /* 3. Auto-inject traceless-style.css into app (client only) */
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