import { defineConfig } from "tsup";

export default defineConfig([
  // Runtime — tiny client bundle
  {
    entry:     { "runtime/index": "src/runtime/index.ts" },
    format:    ["cjs", "esm"],
    dts:       true,
    clean:     false,
    minify:    true,
    treeshake: true,
    external:  ["react", "react-dom", "next", "webpack"],
    outDir:    "dist",
  },
  // Next.js integration
  {
    entry:     { nextjs: "src/nextjs.ts" },
    format:    ["cjs", "esm"],
    dts:       true,
    clean:     false,
    minify:    false,
    external:  ["react", "next", "webpack", "path", "fs",
                "./plugins/webpack", "../plugins/webpack",
                "./cli/extract-fn", "../cli/extract-fn"],
    outDir:    "dist",
  },
  // Webpack plugin
  {
    entry:     { "plugins/webpack": "src/plugins/webpack.ts" },
    format:    ["cjs", "esm"],
    dts:       true,
    clean:     false,
    minify:    false,
    external:  ["webpack", "path", "fs", "./compiler/extractor", "./compiler/css-gen", "./cli/extract-fn"],
    outDir:    "dist",
  },
  // Extract function (shared)
  {
    entry:     { "cli/extract-fn": "src/cli/extract-fn.ts" },
    format:    ["cjs", "esm"],
    dts:       true,
    clean:     false,
    minify:    false,
    external:  ["path", "fs", "./compiler/extractor", "./compiler/css-gen"],
    outDir:    "dist",
  },
  // CLI binary
  {
    entry:     { "cli/extract": "src/cli/extract.ts" },
    format:    ["esm"],
    dts:       false,
    clean:     false,
    minify:    false,
    external:  ["path", "fs"],
    outDir:    "dist",
    esbuildOptions(options) {
      options.banner = { js: "#!/usr/bin/env node" };
    },
  },

]);