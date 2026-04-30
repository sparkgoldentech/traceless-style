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
  // Vite plugin
  {
    entry:     { "plugins/vite": "src/plugins/vite.ts" },
    format:    ["cjs", "esm"],
    dts:       true,
    clean:     false,
    minify:    false,
    external:  ["vite", "path", "fs", "../cli/extract-fn", "../compiler/extractor"],
    outDir:    "dist",
  },
  // Rollup plugin
  {
    entry:     { "plugins/rollup": "src/plugins/rollup.ts" },
    format:    ["cjs", "esm"],
    dts:       true,
    clean:     false,
    minify:    false,
    external:  ["rollup", "path", "fs", "../cli/extract-fn", "../compiler/extractor"],
    outDir:    "dist",
  },
  // esbuild plugin
  {
    entry:     { "plugins/esbuild": "src/plugins/esbuild.ts" },
    format:    ["cjs", "esm"],
    dts:       true,
    clean:     false,
    minify:    false,
    external:  ["esbuild", "path", "fs", "../cli/extract-fn", "../compiler/extractor"],
    outDir:    "dist",
  },
  // Extract function (shared)
  {
    entry:     { "cli/extract-fn": "src/cli/extract-fn.ts" },
    format:    ["cjs", "esm"],
    dts:       true,
    clean:     false,
    minify:    false,
    external:  [
      "path", "fs",
      "./compiler/extractor",
      "./compiler/css-gen",
      "../compiler/extractor-swc",
      "../compiler/extractor-swc.js",
      "@swc/core",
    ],
    outDir:    "dist",
  },
  // SWC-backed extractor (optional, lazy-loaded by extract-fn when parser="swc")
  {
    entry:     { "compiler/extractor-swc": "src/compiler/extractor-swc.ts" },
    format:    ["cjs", "esm"],
    dts:       true,
    clean:     false,
    minify:    false,
    external:  [
      "@swc/core",
      "./extractor",
      "../compiler/extractor",
      "./variants",
      "./ast-parser",
    ],
    outDir:    "dist",
  },
  // CLI binary — bundles cli/commands.ts inline (static import). Subcommand
  // code adds <2KB and has no side effects at import time, so paying the
  // load cost on every extract run isn't worth a separate entry.
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

  // Dark mode system
  {
    entry:     { dark: "src/dark.ts" },
    format:    ["cjs", "esm"],
    dts:       true,
    clean:     false,
    minify:    true,
    external:  ["react"],
    outDir:    "dist",
  },

  // RTL mode system (parallel to dark.ts)
  {
    entry:     { rtl: "src/rtl.ts" },
    format:    ["cjs", "esm"],
    dts:       true,
    clean:     false,
    minify:    true,
    external:  ["react"],
    outDir:    "dist",
  },

]);