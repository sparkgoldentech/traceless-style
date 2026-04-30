/**
 * traceless-style/vite — Vite integration
 *
 * Usage in vite.config.ts:
 *   import { defineConfig } from "vite";
 *   import { tracelessStyle } from "traceless-style/vite";
 *
 *   export default defineConfig({
 *     plugins: [tracelessStyle()],
 *   });
 *
 * What it does:
 *   - buildStart    runs full extraction (lint, tokens, themes, atomic
 *                   rules) and writes traceless-style.css to public/.
 *   - transform     per-file rewrite of tl.create() / tl.extend() /
 *                   tl.defineTokens() / tl.createTheme() / tl.cssVar()
 *                   using the same extract-fn pipeline that powers Next.js.
 *   - handleHotUpdate  re-extract when source files change in dev so the
 *                      generated CSS stays current.
 *
 * Output: public/traceless-style.css. Mirrors the Next.js wrapper's behavior so
 * the public surface is consistent across bundlers.
 */

import path from "path";
import fs   from "fs";
import { extract }                          from "../cli/extract-fn";
import { transform as legacyTransform }     from "../compiler/extractor";

/** Vite Plugin shape — narrowed to the fields we use, so we don't need
 *  Vite as a build-time type dependency. */
interface VitePluginShape {
  name: string;
  enforce?: "pre" | "post";
  configResolved?: (config: { root: string }) => void | Promise<void>;
  buildStart?: () => void | Promise<void>;
  transform?: (code: string, id: string) => { code: string; map: null } | null | undefined;
  handleHotUpdate?: (ctx: { file: string }) => void;
}

export interface TracelessStyleViteOptions {
  /** Source roots to scan. Defaults to whichever of `src/` and `app/` exist. */
  srcDir?: string | string[];
  /** Skip lint enforcement (matches the CLI's `--dev` behavior). */
  dev?: boolean;
}

export function tracelessStyle(options: TracelessStyleViteOptions = {}): VitePluginShape {
  let root = process.cwd();
  let ranOnce = false;

  async function fullExtract(): Promise<void> {
    await extract({
      srcDir: options.srcDir,
      outCSS: path.join(root, "public", "traceless-style.css"),
      outMeta: path.join(root, ".traceless-style", "class-meta.json"),
      dev: options.dev,
      // Lint is enforced inside extract() unless dev=true.
    });
    ranOnce = true;
  }

  return {
    name:    "traceless-style",
    enforce: "pre",   // run BEFORE esbuild's TS/JSX transform

    configResolved(cfg) {
      root = cfg.root ?? process.cwd();
      // Make sure the output directory exists so Vite's static-asset middleware
      // can serve the CSS even before the first extraction completes.
      const cssFile = path.join(root, "public", "traceless-style.css");
      fs.mkdirSync(path.dirname(cssFile), { recursive: true });
      if (!fs.existsSync(cssFile)) {
        fs.writeFileSync(cssFile, "/* traceless-style — generated */\n");
      }
    },

    async buildStart() {
      // One full extraction at the top of every build/dev session.
      // The per-file transform below also rewrites tl.create() inline,
      // but the full pass is what populates the global rule registry.
      if (!ranOnce) await fullExtract();
    },

    transform(code, id) {
      if (!/\.(tsx?|jsx?)$/.test(id)) return null;
      if (id.includes("node_modules"))  return null;
      if (
        !code.includes("tl.create")     && !code.includes("tl.extend") &&
        !code.includes("defineTokens")  && !code.includes("createTheme") &&
        !code.includes("cssVar")
      ) return null;

      // Vite's per-file transform runs after buildStart, so the registry
      // is already populated. Use the legacy text-mode transform — it's
      // dependency-free and matches the file-by-file rewrite the webpack
      // loader does.
      const result = legacyTransform(code, id);
      if (!result.changed) return null;
      return { code: result.code, map: null };
    },

    handleHotUpdate(ctx) {
      // Re-run extraction when a source file changes. We don't try to be
      // surgical — atomic-rule generation is fast (the registry is rebuilt
      // from scratch in <100ms for typical app sizes) and any cleverer
      // cache-invalidation logic would be a footgun.
      if (/\.(tsx?|jsx?)$/.test(ctx.file) && !ctx.file.includes("node_modules")) {
        fullExtract().catch(e => console.error("[traceless-style] HMR re-extract failed:", e));
      }
    },
  };
}
