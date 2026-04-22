import { defineConfig } from "tsup";

export default defineConfig([
  // Runtime — tiny, used by app code
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
    minify:    true,
    external:  ["react", "next", "webpack", "path", "fs", "./plugins/webpack", "../plugins/webpack"],
    outDir:    "dist",
  },
  // Webpack plugin — Node.js, no minify
  {
    entry:     { "plugins/webpack": "src/plugins/webpack.ts" },
    format:    ["cjs", "esm"],
    dts:       true,
    clean:     false,
    minify:    false,
    external:  ["webpack", "path", "fs"],
    outDir:    "dist",
  },
  // CLI — use ESM format so shebang works on line 1
  {
    entry:     { "cli/extract": "src/cli/extract.ts" },
    format:    ["esm"],
    dts:       false,
    clean:     false,
    minify:    false,
    external:  ["path", "fs"],
    outDir:    "dist",
    // shebang must be the very first line — footer trick doesn't work
    // Instead we patch after build via onSuccess
    esbuildOptions(options) {
      options.banner = { js: "#!/usr/bin/env node" };
    },
  },
]);