/**
 * traceless-style DevTools — build script.
 *
 * Bundles three TypeScript entries to `out/`:
 *   - devtools.ts → out/devtools.js   (registers the panel)
 *   - panel.ts    → out/panel.js      (the panel UI)
 *   - panel.css   → out/panel.css     (stylesheet)
 *
 * Plain esbuild — no plugins, no React, no framework. Modern Chrome
 * extensions can use ES modules, but DevTools panels load via classic
 * <script> in panel.html, so we emit IIFE-wrapped bundles.
 */

import * as esbuild from "esbuild";
import fs from "node:fs";

const watch = process.argv.includes("--watch");
fs.mkdirSync("out", { recursive: true });

const common = {
  bundle:    true,
  platform:  "browser",
  format:    "iife",
  target:    "chrome100",
  minify:    !watch,
  sourcemap: watch ? "inline" : false,
  logLevel:  "info",
};

const entries = [
  { entryPoints: ["src/devtools.ts"],      outfile: "out/devtools.js" },
  { entryPoints: ["src/panel/panel.ts"],   outfile: "out/panel.js"    },
  { entryPoints: ["src/panel/panel.css"],  outfile: "out/panel.css", loader: { ".css": "css" } },
];

if (watch) {
  for (const e of entries) {
    const ctx = await esbuild.context({ ...common, ...e });
    await ctx.watch();
  }
  console.log("watching for changes…");
} else {
  await Promise.all(entries.map(e => esbuild.build({ ...common, ...e })));
  console.log("✓ built");
}
