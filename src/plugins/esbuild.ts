/**
 * traceless-style/esbuild — esbuild integration
 *
 * Usage:
 *   import { build } from "esbuild";
 *   import { tracelessStyle } from "traceless-style/esbuild";
 *
 *   build({
 *     entryPoints: ["src/main.tsx"],
 *     bundle:      true,
 *     plugins:     [tracelessStyle()],
 *   });
 *
 * Hooks:
 *   onStart  →  full extraction once per build (fills the registry, lints,
 *               writes public/traceless-style.css)
 *   onLoad   →  per-file transform that rewrites tl.create() / tl.extend()
 *               / tl.defineTokens() / tl.createTheme() / tl.keyframes() /
 *               tl.cssVar() inline before esbuild parses TS/JSX.
 *
 * The full extraction at onStart is what fills the global rule registry.
 * The per-file onLoad transform rewrites individual sources so the bundle
 * carries the resolved class strings instead of the original sc.* calls.
 *
 * onLoad returns `{ contents, loader }`. We re-use the same legacy
 * text-mode extractor as the Vite plugin so esbuild plugins don't pull
 * @swc/core into the bundle.
 */

import path from "path";
import fs   from "fs";
import { extract }                          from "../cli/extract-fn";
import { transform as legacyTransform }     from "../compiler/extractor";

interface EsbuildPluginShape {
  name:  string;
  setup: (build: EsbuildBuild) => void;
}

interface EsbuildBuild {
  initialOptions: { absWorkingDir?: string };
  onStart: (cb: () => void | Promise<void>) => void;
  onLoad:  (
    filter: { filter: RegExp; namespace?: string },
    cb: (args: { path: string }) => Promise<{ contents: string; loader: string } | null | undefined>
  ) => void;
}

export interface TracelessStyleEsbuildOptions {
  /** Source roots to scan. Defaults to whichever of `src/` and `app/` exist. */
  srcDir?: string | string[];
  /** Skip lint enforcement. */
  dev?:    boolean;
}

const TRACELESS_API_RE = /\b(sc\.create|sc\.extend|defineTokens|createTheme|keyframes|cssVar)\b/;

function loaderFor(p: string): string {
  if (p.endsWith(".tsx")) return "tsx";
  if (p.endsWith(".ts"))  return "ts";
  if (p.endsWith(".jsx")) return "jsx";
  return "js";
}

export function tracelessStyle(options: TracelessStyleEsbuildOptions = {}): EsbuildPluginShape {
  return {
    name: "traceless-style",
    setup(build) {
      const root = build.initialOptions.absWorkingDir ?? process.cwd();
      const cssFile = path.join(root, "public", "traceless-style.css");
      let ran = false;

      build.onStart(async () => {
        if (ran) return;
        ran = true;
        fs.mkdirSync(path.dirname(cssFile), { recursive: true });
        await extract({
          srcDir:  options.srcDir,
          outCSS:  cssFile,
          outMeta: path.join(root, ".traceless-style", "class-meta.json"),
          dev:     options.dev,
        });
      });

      build.onLoad({ filter: /\.(tsx?|jsx?)$/ }, async ({ path: filePath }) => {
        if (filePath.includes("node_modules")) return null;
        const src = await fs.promises.readFile(filePath, "utf8");
        if (!TRACELESS_API_RE.test(src)) {
          // Fast path — let esbuild handle the file with its default loader.
          return { contents: src, loader: loaderFor(filePath) };
        }
        const result = legacyTransform(src, filePath);
        if (!result.changed) return { contents: src, loader: loaderFor(filePath) };
        return { contents: result.code, loader: loaderFor(filePath) };
      });
    },
  };
}
