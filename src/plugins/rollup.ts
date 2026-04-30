/**
 * traceless-style/rollup — Rollup integration
 *
 * Usage in rollup.config.js:
 *   import { tracelessStyle } from "traceless-style/rollup";
 *   export default {
 *     plugins: [tracelessStyle()],
 *   };
 *
 * Vite extends Rollup's plugin shape, so this re-uses the same hooks
 * with a name fit for Rollup. The dev-server-specific `handleHotUpdate`
 * and `enforce` are dropped because they're Vite-only — Rollup builds
 * are one-shot.
 *
 * CSS lands in public/traceless-style.css to mirror the other integrations.
 */

import path from "path";
import fs   from "fs";
import { extract }                          from "../cli/extract-fn";
import { transform as legacyTransform }     from "../compiler/extractor";

interface RollupPluginShape {
  name: string;
  buildStart?: () => void | Promise<void>;
  transform?: (code: string, id: string) => { code: string; map: null } | null | undefined;
}

export interface TracelessStyleRollupOptions {
  /** Source roots to scan. Defaults to whichever of `src/` and `app/` exist. */
  srcDir?: string | string[];
  /** Skip lint enforcement (matches the CLI's `--dev`). */
  dev?:    boolean;
}

export function tracelessStyle(options: TracelessStyleRollupOptions = {}): RollupPluginShape {
  let ranOnce = false;

  return {
    name: "traceless-style",

    async buildStart() {
      if (ranOnce) return;
      ranOnce = true;
      const root = process.cwd();
      const cssFile = path.join(root, "public", "traceless-style.css");
      fs.mkdirSync(path.dirname(cssFile), { recursive: true });
      await extract({
        srcDir:  options.srcDir,
        outCSS:  cssFile,
        outMeta: path.join(root, ".traceless-style", "class-meta.json"),
        dev:     options.dev,
      });
    },

    transform(code, id) {
      if (!/\.(tsx?|jsx?)$/.test(id))    return null;
      if (id.includes("node_modules"))   return null;
      if (
        !code.includes("tl.create")     && !code.includes("tl.extend") &&
        !code.includes("defineTokens")  && !code.includes("createTheme") &&
        !code.includes("keyframes")     && !code.includes("cssVar")
      ) return null;

      const result = legacyTransform(code, id);
      if (!result.changed) return null;
      return { code: result.code, map: null };
    },
  };
}
