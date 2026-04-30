/**
 * Synthetic-project extraction benchmark.
 *
 * Generates a temp project of N synthetic .tsx files, each containing a
 * realistic `tl.create({...})` call with mixed shared/unique values.
 * Runs the extractor:
 *   1. Cold (no cache file)
 *   2. Warm (with cache from #1)
 *   3. Single-file invalidation (one file's content changes; cache should
 *      hit on the others and miss only on that one).
 *
 * Reports cold time, warm time, cache hit ratio, total atomic rules
 * emitted, and CSS bundle size. The output goes to bench/results.json
 * for reproducibility.
 *
 * Sizing: the default 10K files mirrors mid-size Meta-style projects.
 * Override via `BENCH_FILES=2000 node bench/synthetic-project.mjs` for
 * smaller sweeps when iterating on the benchmark itself.
 */

import fs   from "node:fs";
import path from "node:path";
import os   from "node:os";

const NUM_FILES   = parseInt(process.env.BENCH_FILES   ?? "10000", 10);
const NUM_GROUPS  = parseInt(process.env.BENCH_GROUPS  ?? "5",     10); // groups per file
const NUM_PROPS   = parseInt(process.env.BENCH_PROPS   ?? "8",     10); // props per group

const PROPS = [
  "padding", "margin", "color", "backgroundColor", "fontSize",
  "borderRadius", "lineHeight", "letterSpacing", "boxShadow", "opacity",
];
const COLORS = [
  "#ffffff", "#000000", "#3b82f6", "#10b981", "#ef4444",
  "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#64748b",
];
const SIZES = [
  "0", "0.25rem", "0.5rem", "1rem", "1.5rem", "2rem", "3rem", "4rem",
];
const VARIANTS = [
  "_hover", "_focus", "_active", "_dark",
];

function generateGroup(seed) {
  const lines = [`  group${seed}: {`];
  for (let i = 0; i < NUM_PROPS; i++) {
    const prop = PROPS[(seed + i) % PROPS.length];
    let value;
    if (/color|background/i.test(prop)) value = COLORS[(seed + i) % COLORS.length];
    else if (prop === "opacity")        value = String(((seed + i) % 10) / 10);
    else if (prop === "fontSize")       value = `${12 + ((seed + i) % 20)}px`;
    else                                value = SIZES[(seed + i) % SIZES.length];
    lines.push(`    ${prop}: "${value}",`);
  }
  if (seed % 3 === 0) {
    const variant = VARIANTS[seed % VARIANTS.length];
    lines.push(`    ${variant}: { color: "${COLORS[seed % COLORS.length]}" },`);
  }
  lines.push("  },");
  return lines.join("\n");
}

function generateFile(idx) {
  const groups = [];
  for (let g = 0; g < NUM_GROUPS; g++) {
    groups.push(generateGroup(idx * NUM_GROUPS + g));
  }
  return `import { tl } from "traceless-style";\n\nconst $ = tl.create({\n${groups.join("\n")}\n});\n\nexport default $;\n`;
}

async function bench() {
  const root = path.join(os.tmpdir(), `traceless-bench-${Date.now()}`);
  const srcDir = path.join(root, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  console.log(`Generating ${NUM_FILES} files at ${srcDir}…`);
  const tGen0 = Date.now();
  for (let i = 0; i < NUM_FILES; i++) {
    fs.writeFileSync(path.join(srcDir, `comp${i}.tsx`), generateFile(i));
  }
  // Realistic project structure needs a package.json + node_modules link.
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: "bench-project", version: "0.0.0",
    dependencies: { "traceless-style": "*" },
  }, null, 2));
  // Link traceless-style so `import { tl } from "traceless-style"` resolves.
  const libRoot = path.resolve(import.meta.dirname, "..");
  const nm = path.join(root, "node_modules");
  fs.mkdirSync(nm, { recursive: true });
  try {
    fs.symlinkSync(libRoot, path.join(nm, "traceless-style"), "junction");
  } catch {
    // Symlinks may need admin on Windows; copying dist/ is enough for the extractor.
    const distSrc = path.join(libRoot, "dist");
    const distDst = path.join(nm, "traceless-style");
    if (fs.existsSync(distSrc)) {
      fs.cpSync(distSrc, path.join(distDst, "dist"), { recursive: true });
      fs.cpSync(path.join(libRoot, "package.json"), path.join(distDst, "package.json"));
    }
  }
  const tGen = Date.now() - tGen0;
  console.log(`  generated in ${tGen}ms`);

  // Use the freshly built CLI bundle.
  const cli = path.resolve(libRoot, "dist/cli/extract.mjs");
  const { spawnSync } = await import("node:child_process");

  function runExtract(label) {
    const t0 = Date.now();
    const r = spawnSync("node", [cli], { cwd: root, encoding: "utf8" });
    const elapsedMs = Date.now() - t0;
    const out = r.stdout + "\n" + r.stderr;
    const cacheLine = (out.match(/cache:.*$/m) ?? [""])[0];
    const ruleLine  = (out.match(/✅ traceless-style:.*$/m) ?? [""])[0];
    return { label, elapsedMs, cacheLine, ruleLine };
  }

  console.log(`\nCold extraction…`);
  const cold = runExtract("cold");
  console.log(`  ${cold.elapsedMs}ms  ${cold.ruleLine}`);

  console.log(`Warm extraction (cache hit)…`);
  const warm = runExtract("warm");
  console.log(`  ${warm.elapsedMs}ms  ${warm.cacheLine}`);

  // Invalidate one file and re-run; expect cache to hit on all but one.
  console.log(`Single-file change…`);
  fs.appendFileSync(path.join(srcDir, "comp0.tsx"), `\nexport const x = 1;\n`);
  const single = runExtract("single");
  console.log(`  ${single.elapsedMs}ms  ${single.cacheLine}`);

  // CSS bundle size.
  const cssPath = path.join(root, "public", "traceless-style.css");
  const cssSize = fs.existsSync(cssPath) ? fs.statSync(cssPath).size : 0;

  // Cleanup.
  fs.rmSync(root, { recursive: true, force: true });

  return {
    files:    NUM_FILES,
    groups:   NUM_FILES * NUM_GROUPS,
    cold,
    warm,
    single,
    cssBytes: cssSize,
    speedup:  warm.elapsedMs > 0 ? (cold.elapsedMs / warm.elapsedMs).toFixed(1) + "x" : "n/a",
  };
}

bench().then(r => {
  console.log("\n=== synthetic-project benchmark ===");
  console.table([
    {
      files:        r.files,
      "cold (ms)":  r.cold.elapsedMs,
      "warm (ms)":  r.warm.elapsedMs,
      "warm speedup": r.speedup,
      "single-file change (ms)": r.single.elapsedMs,
      "CSS bytes":  r.cssBytes,
    },
  ]);
});
