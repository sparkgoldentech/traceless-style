/**
 * traceless-style init — zero-config scaffolder.
 *
 * Detects the framework and wires up everything a new project needs:
 *
 *   1. package.json scripts: `dev` / `build` route through `traceless-style`
 *      so the CLI runs extraction before the framework starts.
 *   2. Root layout: imports `<TracelessRoot />` and inserts it inside
 *      `<head>` so dark mode + RTL anti-flash work before first paint.
 *   3. CSS import: ensures `traceless-style.css` is imported by the layout.
 *   4. Config file: writes `traceless-style.config.js` with sane defaults
 *      if one doesn't already exist.
 *
 * Idempotent: running `init` twice is safe — every step checks current
 * state before editing. Conservative: when the layout file is too unusual
 * to edit reliably, the command prints exact copy-paste instructions
 * instead of guessing.
 */

import fs   from "fs";
import path from "path";

interface InitResult {
  changed: string[];   // human-readable list of changes applied
  warnings: string[];  // human-readable list of things the user must do manually
}

type Framework = "next" | "vite" | "remix" | "astro" | "sveltekit" | "qwik" | "solid" | "plain" | "unknown";

interface PackageJson {
  scripts?:        Record<string, string>;
  dependencies?:   Record<string, string>;
  devDependencies?:Record<string, string>;
}

function detectFramework(root: string): Framework {
  const p = path.join(root, "package.json");
  if (!fs.existsSync(p)) {
    // No package.json at all — likely a static-HTML project. We can
    // still wire a CSS file + sample component for them.
    if (fs.existsSync(path.join(root, "index.html"))) return "plain";
    return "unknown";
  }
  let pkg: PackageJson = {};
  try { pkg = JSON.parse(fs.readFileSync(p, "utf8")); } catch { return "unknown"; }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  /* Detection order matters — a SvelteKit project depends on `vite`,
     so we check the more specific framework first. Same for Remix
     (which can depend on either @remix-run/dev or @react-router/dev
     under the v3 rebrand). */
  if (deps.next)                                        return "next";
  if (deps["@remix-run/dev"] || deps["@react-router/dev"]) return "remix";
  if (deps.astro)                                       return "astro";
  if (deps["@sveltejs/kit"])                            return "sveltekit";
  if (deps["@builder.io/qwik"])                         return "qwik";
  if (deps["solid-js"] && deps["vite-plugin-solid"])    return "solid";
  if (deps.vite)                                        return "vite";
  // No supported framework, but there IS a package.json — treat as a
  // plain Node project where we wire only the CLI scripts + CSS file.
  return "plain";
}

/* ════════════════════════════════════════
   Step 1: package.json scripts
   Only rewrite if the existing script is the framework's bare command.
   We never overwrite user customizations.
════════════════════════════════════════ */
function updatePackageScripts(root: string, fw: Framework, result: InitResult): void {
  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) return;

  const raw = fs.readFileSync(pkgPath, "utf8");
  let pkg: PackageJson;
  try { pkg = JSON.parse(raw); } catch {
    result.warnings.push("package.json is not valid JSON — skipped script wiring.");
    return;
  }

  const scripts = pkg.scripts ?? {};
  const desiredDev   = "traceless-style dev";
  const desiredBuild = "traceless-style build";

  // Only touch scripts that are the bare framework command. Anything else
  // (custom flags, pre-built env vars, monorepo scripts) is the user's and
  // we leave it alone.
  const safeDevPatterns: Partial<Record<Framework, string[]>> = {
    next:      ["next dev"],
    vite:      ["vite", "vite dev"],
    remix:     ["remix dev"],
    astro:     ["astro dev"],
    sveltekit: ["vite dev", "vite"],
    qwik:      ["vite", "vite dev"],
    solid:     ["vite", "vite dev"],
    plain:     [],
  };
  const safeBuildPatterns: Partial<Record<Framework, string[]>> = {
    next:      ["next build"],
    vite:      ["vite build", "tsc && vite build"],
    remix:     ["remix build"],
    astro:     ["astro build", "astro check && astro build"],
    sveltekit: ["vite build"],
    qwik:      ["vite build"],
    solid:     ["vite build"],
    plain:     [],
  };
  /* Match-any check.
   *
   * We treat a script as "safe to rewrite" when ANY of these is true:
   *   1. It exactly matches one of the framework's bare commands
   *      (e.g. "next dev", "vite", "vite build", "astro dev").
   *   2. It already invokes traceless-style — either through the CLI
   *      binary directly, the `traceless-style` PATH command, an npx
   *      form, or a node call against our extract.mjs/extract.js. We
   *      consider these "user already chose us; canonicalize the form."
   *
   * The second class catches the very common case where the user did
   * a manual install: their script ran `node .../extract.mjs && next
   * build` and now we're upgrading them to `traceless-style build`. */
  const matchAny = (cur: string | undefined, patterns: string[] | undefined): boolean => {
    if (!cur) return false;
    if ((patterns ?? []).includes(cur)) return true;
    // Already invokes us — any path containing our CLI counts.
    if (/(?:^|[\s&|])(?:npx\s+)?traceless-style\b/.test(cur))   return true;
    if (/extract\.m?js\b/.test(cur))                            return true;
    return false;
  };

  let changed = false;
  if (!scripts.dev || matchAny(scripts.dev, safeDevPatterns[fw])) {
    scripts.dev = desiredDev;
    changed = true;
  } else if (scripts.dev !== desiredDev) {
    result.warnings.push(
      `package.json "scripts.dev" is custom (${scripts.dev}) — replace with "${desiredDev}" manually if you want zero-config.`
    );
  }
  if (!scripts.build || matchAny(scripts.build, safeBuildPatterns[fw])) {
    scripts.build = desiredBuild;
    changed = true;
  } else if (scripts.build !== desiredBuild) {
    result.warnings.push(
      `package.json "scripts.build" is custom (${scripts.build}) — replace with "${desiredBuild}" manually if you want zero-config.`
    );
  }

  if (changed) {
    pkg.scripts = scripts;
    // Preserve the original 2-space indent JSON style most projects use.
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    result.changed.push(`package.json — wired "dev" + "build" to traceless-style`);
  }
}

/* ════════════════════════════════════════
   Step 2: root layout (Next App Router)
════════════════════════════════════════ */
function findNextLayout(root: string): string | null {
  for (const candidate of [
    "app/layout.tsx", "app/layout.jsx",
    "src/app/layout.tsx", "src/app/layout.jsx",
  ]) {
    const full = path.join(root, candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function findViteEntry(root: string): string | null {
  for (const candidate of [
    "src/main.tsx", "src/main.jsx", "src/main.ts", "src/main.js",
    "src/index.tsx", "src/index.jsx", "src/index.ts", "src/index.js",
  ]) {
    const full = path.join(root, candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function findRemixRoot(root: string): string | null {
  for (const candidate of [
    "app/root.tsx", "app/root.jsx", "app/root.ts", "app/root.js",
  ]) {
    const full = path.join(root, candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function findAstroLayout(root: string): string | null {
  // Astro's convention is `src/layouts/Layout.astro`. We also accept any
  // `*.astro` directly under `src/layouts/`.
  const dir = path.join(root, "src", "layouts");
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir)) {
    if (entry.endsWith(".astro")) return path.join(dir, entry);
  }
  return null;
}

function findSvelteKitLayout(root: string): string | null {
  for (const candidate of [
    "src/routes/+layout.svelte",
    "src/routes/+layout.ts",
    "src/routes/+layout.js",
  ]) {
    const full = path.join(root, candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/**
 * Pre-create `public/traceless-style.css` with a no-op stub so framework
 * imports never 404 before the first extraction runs. Idempotent — won't
 * overwrite an existing populated file (only stamps a fresh empty stub
 * when the file doesn't exist yet).
 *
 * We write to whichever public-asset directory the framework expects:
 *   next / vite / remix / qwik / solid → `public/`
 *   astro                              → `public/`
 *   sveltekit                          → `static/`
 *   plain                              → `./` (next to index.html)
 *
 * Compatible with all frameworks, zero manual setup.
 */
function ensureCssStub(root: string, fw: Framework, result: InitResult): void {
  const dir  = fw === "sveltekit" ? "static" : fw === "plain" ? "." : "public";
  const full = path.join(root, dir, "traceless-style.css");
  if (fs.existsSync(full)) return;
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(
      full,
      "/* traceless-style — placeholder. Will be populated by the CLI on the first extract run. */\n"
    );
    result.changed.push(`${path.relative(root, full).replace(/\\/g, "/")} — created CSS stub`);
  } catch (e) {
    result.warnings.push(
      `Couldn't create ${path.relative(root, full)}: ${(e as Error).message}. ` +
      `Create it manually or run \`traceless-style\` to generate it.`
    );
  }
}

/**
 * Edit the Next.js root layout to import + render <TracelessRoot /> and
 * import the generated CSS.
 *
 * Three edits, each idempotent:
 *   - import { TracelessRoot } from "traceless-style/dark";
 *   - import "../public/traceless-style.css"; (path relative to layout)
 *   - <TracelessRoot /> inside <head>
 */
function updateNextLayout(root: string, layoutPath: string, result: InitResult): void {
  const src = fs.readFileSync(layoutPath, "utf8");
  let out = src;
  let changed = false;

  // 1. Add the import for TracelessRoot if missing.
  if (!/from\s+["']traceless-style\/dark["']/.test(out)) {
    const importLine = `import { TracelessRoot } from "traceless-style/dark";\n`;
    out = insertImport(out, importLine);
    changed = true;
  }

  // 2. Add the CSS import if missing. Path is relative to the layout file,
  //    pointing at public/traceless-style.css at the project root.
  const layoutDir = path.dirname(layoutPath);
  const cssAbs    = path.join(root, "public", "traceless-style.css");
  let   cssRel    = path.relative(layoutDir, cssAbs).replace(/\\/g, "/");
  if (!cssRel.startsWith(".")) cssRel = "./" + cssRel;
  if (!new RegExp(`["']${escapeRegex(cssRel)}["']`).test(out)
      && !/traceless-style\.css["']/.test(out)) {
    const cssImport = `import "${cssRel}";\n`;
    out = insertImport(out, cssImport);
    changed = true;
  }

  // 3. Render <TracelessRoot /> inside <head>. We do this only when there's
  //    an unambiguous `<head>...</head>` to insert into. If the layout is
  //    too creative (head split across components, or no head at all), we
  //    print a manual instruction.
  if (!/<TracelessRoot\s*\/?>/.test(out)) {
    const headOpen = /<head\s*>/.exec(out);
    if (headOpen) {
      const insertAt = headOpen.index + headOpen[0].length;
      out = out.slice(0, insertAt)
          + "\n        <TracelessRoot />"
          + out.slice(insertAt);
      changed = true;
    } else {
      result.warnings.push(
        `Couldn't find <head> in ${path.relative(root, layoutPath)}. ` +
        `Add <TracelessRoot /> manually inside the head element.`
      );
    }
  }

  if (changed) {
    fs.writeFileSync(layoutPath, out);
    result.changed.push(`${path.relative(root, layoutPath)} — added <TracelessRoot /> + CSS import`);
  }
}

/**
 * Edit the Remix root.tsx to import the generated CSS via the `links()`
 * export. Remix's idiomatic CSS-import pattern is a `LinksFunction`
 * returning `[{ rel: "stylesheet", href: "..." }]`. The dark/RTL
 * anti-flash bootstrap goes via a `<TracelessRoot />` inserted in
 * `<head>`. Idempotent — checks before each edit.
 */
function updateRemixRoot(root: string, rootPath: string, result: InitResult): void {
  const src = fs.readFileSync(rootPath, "utf8");
  let out = src;
  let changed = false;

  // 1. Ensure the TracelessRoot import exists.
  if (!/from\s+["']traceless-style\/dark["']/.test(out)) {
    out = insertImport(out, `import { TracelessRoot } from "traceless-style/dark";\n`);
    changed = true;
  }

  // 2. Append a stylesheet link via the `links()` export. If the file
  //    already exports `links` we don't try to merge — we print an
  //    instruction. Remix's `LinksFunction` is too varied to safely edit.
  if (!/traceless-style\.css/.test(out)) {
    if (/export\s+(?:const|function)\s+links\b/.test(out)) {
      result.warnings.push(
        `${path.relative(root, rootPath)} already exports a links() function. ` +
        `Add \`{ rel: "stylesheet", href: "/traceless-style.css" }\` to its returned array.`
      );
    } else {
      // No links() export — append one. We import LinksFunction at the
      // top so the new export type-checks under `strict`.
      if (!/import\s+(?:type\s+)?\{[^}]*LinksFunction[^}]*\}\s+from\s+["']@remix-run\/node["']/.test(out)
       && !/import\s+(?:type\s+)?\{[^}]*LinksFunction[^}]*\}\s+from\s+["']@remix-run\/react["']/.test(out)) {
        out = insertImport(out, `import type { LinksFunction } from "@remix-run/node";\n`);
      }
      out += `\nexport const links: LinksFunction = () => [\n  { rel: "stylesheet", href: "/traceless-style.css" },\n];\n`;
      changed = true;
    }
  }

  // 3. Insert <TracelessRoot /> into <head> when one exists.
  if (!/<TracelessRoot\s*\/?>/.test(out)) {
    const headOpen = /<head\s*>/.exec(out);
    if (headOpen) {
      const insertAt = headOpen.index + headOpen[0].length;
      out = out.slice(0, insertAt) + "\n        <TracelessRoot />" + out.slice(insertAt);
      changed = true;
    } else {
      result.warnings.push(
        `Couldn't find <head> in ${path.relative(root, rootPath)}. Add <TracelessRoot /> ` +
        `inside the <head> manually for dark/RTL anti-flash.`
      );
    }
  }

  if (changed) {
    fs.writeFileSync(rootPath, out);
    result.changed.push(`${path.relative(root, rootPath)} — wired CSS link + TracelessRoot`);
  }
}

/**
 * Edit an Astro layout (`src/layouts/Layout.astro`) to import the
 * generated CSS at the file head. Astro layouts use frontmatter +
 * markup — we insert the import inside the frontmatter `---` block so
 * Astro's bundler picks it up.
 */
function updateAstroLayout(root: string, layoutPath: string, result: InitResult): void {
  const src = fs.readFileSync(layoutPath, "utf8");
  if (/traceless-style\.css/.test(src)) return;

  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/m.exec(src);
  if (!fmMatch) {
    // Pure-template Astro file — prepend a frontmatter block.
    const out = `---\nimport "/traceless-style.css";\n---\n` + src;
    fs.writeFileSync(layoutPath, out);
    result.changed.push(`${path.relative(root, layoutPath)} — prepended frontmatter + CSS import`);
    return;
  }
  const before = src.slice(0, fmMatch.index + 4);   // "---\n"
  const fmBody = fmMatch[1];
  const after  = src.slice(fmMatch.index + fmMatch[0].length);
  const out = before + `import "/traceless-style.css";\n` + fmBody + "\n---" + after;
  fs.writeFileSync(layoutPath, out);
  result.changed.push(`${path.relative(root, layoutPath)} — added CSS import to frontmatter`);
}

/**
 * Edit a SvelteKit `+layout.svelte` to import the generated CSS. The
 * convention is a `<script>` block containing `import "$lib/.../style.css"`;
 * we use the `$lib` alias if it exists, otherwise a relative path to
 * `static/traceless-style.css` (which SvelteKit serves from `/`).
 */
function updateSvelteKitLayout(root: string, layoutPath: string, result: InitResult): void {
  const src = fs.readFileSync(layoutPath, "utf8");
  if (/traceless-style\.css/.test(src)) return;

  // SvelteKit serves /static/* at the root URL. The recommended way to
  // import a CSS file is via the `import` statement in a script block;
  // Vite picks it up. We use the public-URL form so it works whether
  // or not the `$lib` alias is set.
  const importStmt = `import "/traceless-style.css";`;
  let out: string;
  if (/<script\b[^>]*>[\s\S]*?<\/script>/.test(src)) {
    out = src.replace(/<script\b([^>]*)>/, (m, attrs) => `<script${attrs}>\n  ${importStmt}\n`);
  } else {
    out = `<script>\n  ${importStmt}\n</script>\n\n` + src;
  }
  fs.writeFileSync(layoutPath, out);
  result.changed.push(`${path.relative(root, layoutPath)} — added CSS import`);
}

/**
 * Edit the Vite entry to import the generated CSS.
 * For Vite there's no shared "head" file, so dark/RTL anti-flash is up to
 * the user — we print an instruction.
 */
function updateViteEntry(root: string, entryPath: string, result: InitResult): void {
  const src = fs.readFileSync(entryPath, "utf8");
  if (/traceless-style\.css/.test(src)) return; // already wired

  // For Vite the convention is to put the CSS in src/ so the bundler
  // picks it up. We point at public/traceless-style.css since that's where
  // the CLI emits it; Vite resolves "/traceless-style.css" against public.
  const importLine = `import "/traceless-style.css";\n`;
  const out = insertImport(src, importLine);
  fs.writeFileSync(entryPath, out);
  result.changed.push(`${path.relative(root, entryPath)} — added traceless-style.css import`);
  result.warnings.push(
    `Vite has no shared <head> file. To enable dark/RTL anti-flash, render ` +
    `<TracelessRoot /> from "traceless-style/dark" inside an index.html <head>, ` +
    `or set the dir/class on <html> manually before React mounts.`
  );
}

/* ════════════════════════════════════════
   Step 3: .vscode/extensions.json — recommend the IDE extension.
   VS Code can't auto-install extensions when an npm package lands; the
   security boundary forbids it (every extension hits this — Tailwind,
   Prettier, ESLint, StyleX). What we CAN do is mark the extension as a
   workspace recommendation. On first open, VS Code prompts the user
   with a one-click "Install" button. That's as automatic as it gets.
════════════════════════════════════════ */
const EXTENSION_ID = "sparkgoldentech.traceless-style-vscode";

function recommendVscodeExtension(root: string, result: InitResult): void {
  const dir   = path.join(root, ".vscode");
  const file  = path.join(dir, "extensions.json");
  let current: { recommendations?: string[]; unwantedRecommendations?: string[] } = {};

  if (fs.existsSync(file)) {
    try {
      // Tolerate JSON-with-comments — VS Code's own format. We don't strip
      // comments perfectly, but JSON.parse rejects them, so we fall back
      // to a regex-based strip for the common case.
      const raw = fs.readFileSync(file, "utf8");
      const stripped = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      current = JSON.parse(stripped);
    } catch {
      result.warnings.push(
        `.vscode/extensions.json exists but isn't valid JSON — leave it alone manually add "${EXTENSION_ID}" to its recommendations.`
      );
      return;
    }
  }

  const recs = new Set<string>(current.recommendations ?? []);
  if (recs.has(EXTENSION_ID)) return;          // already recommended
  // Respect explicit unwanted-recommendation opt-outs.
  if ((current.unwantedRecommendations ?? []).includes(EXTENSION_ID)) return;

  recs.add(EXTENSION_ID);
  current.recommendations = [...recs].sort();

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(current, null, 2) + "\n");
  result.changed.push(".vscode/extensions.json — recommended the traceless-style IDE extension");
}

/* ════════════════════════════════════════
   Step 4: traceless-style.config.js  (OPT-IN ONLY)
   ─────────────────────────────────────────
   The library is fully functional with zero configuration. Strict-by-
   default lint, strict-by-default contrast (AA), auto-dark, auto-rtl,
   strict-by-default CSS-injection guards — every default matches what
   we'd write into a config file anyway. So `init` no longer creates
   one. Users who want to customize can run `init --with-config` or
   create the file manually; either way, partial configs are merged
   over defaults so a user-written file only needs to specify the
   knobs that differ.
════════════════════════════════════════ */
function writeDefaultConfig(root: string, withConfig: boolean, result: InitResult): void {
  const cfgPath = path.join(root, "traceless-style.config.js");
  if (fs.existsSync(cfgPath)) return;
  if (!withConfig) return;  // zero-config by default

  const body =
`/** @type {import('traceless-style').TracelessStyleConfig} */
module.exports = {
  // All keys below match the library's strict-by-default behavior, so
  // commenting any one out has no effect — they're shown for discovery.
  lint: {
    noInlineStyles: true,
    noClassString:  true,
    noCSSModules:   true,
    noTailwind:     true,
  },
  contrast: {
    level:  "AA",       // "AAA" for stricter contrast suggestions
    strict: true,       // false demotes contrast errors to warnings
  },
  // autoDarkMode: false,    // disable the auto-derived _dark variant
  // autoRtl:      false,    // disable physical-to-logical rewriting
};
`;
  fs.writeFileSync(cfgPath, body);
  result.changed.push("traceless-style.config.js — wrote defaults");
}

/* ════════════════════════════════════════
   Helpers
════════════════════════════════════════ */
function insertImport(src: string, importLine: string): string {
  // Insert after the last existing import. If there are no imports, insert
  // at the top — but after a leading "use client" / "use server" pragma.
  const importRe = /^import\s.+?from\s+["'][^"']+["'];?\s*$/gm;
  let lastEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src)) !== null) lastEnd = m.index + m[0].length;
  if (lastEnd >= 0) {
    return src.slice(0, lastEnd) + "\n" + importLine + src.slice(lastEnd + 1);
  }
  // No imports — go after a directive prologue if present.
  const directive = /^(?:["'](?:use client|use server|use strict)["'];?\s*\n)+/.exec(src);
  if (directive) return src.slice(0, directive[0].length) + importLine + src.slice(directive[0].length);
  return importLine + src;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ════════════════════════════════════════
   Entry point
════════════════════════════════════════ */
export async function initCommand(argv: string[] = process.argv.slice(2)): Promise<number> {
  const ROOT        = process.cwd();
  const fw          = detectFramework(ROOT);
  const withConfig  = argv.includes("--with-config");
  const skipExtract = argv.includes("--no-extract");
  const result: InitResult = { changed: [], warnings: [] };

  console.log("\n🔥 traceless-style init\n");
  console.log(`  detected framework: ${fw}\n`);

  if (fw === "unknown") {
    console.error(
      `Couldn't detect a project root in ${ROOT}.\n` +
      `Run \`npm init -y\` first, or place an index.html, or run init from a project subdirectory.\n`
    );
    return 1;
  }

  /* 1. WIRE package.json scripts (if a package.json exists). */
  if (fw !== "plain" || fs.existsSync(path.join(ROOT, "package.json"))) {
    updatePackageScripts(ROOT, fw, result);
  }

  /* 2. PRE-CREATE the CSS stub so framework imports never 404 before
        the first extraction runs. Compatible with all targets. */
  ensureCssStub(ROOT, fw, result);

  /* 3. WIRE the framework's entrypoint. Each branch is idempotent —
        re-running init never duplicates imports or layout markup. */
  switch (fw) {
    case "next": {
      const layout = findNextLayout(ROOT);
      if (layout) updateNextLayout(ROOT, layout, result);
      else result.warnings.push(
        `No app/layout.tsx found. Create one and add <TracelessRoot /> inside <head> ` +
        `plus \`import "../public/traceless-style.css"\` at the top.`
      );
      break;
    }
    case "remix": {
      const root = findRemixRoot(ROOT);
      if (root) updateRemixRoot(ROOT, root, result);
      else result.warnings.push(
        `No app/root.tsx found. Create one and add a links() export with ` +
        `\`{ rel: "stylesheet", href: "/traceless-style.css" }\`.`
      );
      break;
    }
    case "astro": {
      const layout = findAstroLayout(ROOT);
      if (layout) updateAstroLayout(ROOT, layout, result);
      else result.warnings.push(
        `No src/layouts/*.astro found. Add \`import "/traceless-style.css"\` ` +
        `to a layout component's frontmatter.`
      );
      break;
    }
    case "sveltekit": {
      const layout = findSvelteKitLayout(ROOT);
      if (layout) updateSvelteKitLayout(ROOT, layout, result);
      else result.warnings.push(
        `No src/routes/+layout.svelte found. Create one with ` +
        `\`<script>import "/traceless-style.css";</script>\`.`
      );
      break;
    }
    case "vite":
    case "qwik":
    case "solid": {
      const entry = findViteEntry(ROOT);
      if (entry) updateViteEntry(ROOT, entry, result);
      else result.warnings.push(
        `No src/main.{ts,tsx} or src/index.{ts,tsx} found. Add ` +
        `\`import "/traceless-style.css"\` to your entry file.`
      );
      break;
    }
    case "plain": {
      // Static HTML / no-framework projects: emit the CSS stub next to
      // index.html and instruct the user to <link> it. Nothing else to
      // wire.
      result.warnings.push(
        `Plain HTML project detected. Add \`<link rel="stylesheet" href="traceless-style.css">\` ` +
        `inside <head> of your index.html.`
      );
      break;
    }
  }

  /* 4. RECOMMEND the VS Code extension (only when .vscode dir or any
        editor-config files exist — don't pollute static-HTML projects). */
  if (fw !== "plain" || fs.existsSync(path.join(ROOT, ".vscode"))) {
    recommendVscodeExtension(ROOT, result);
  }

  /* 5. CONFIG file — opt-in. Defaults already match what we'd write. */
  writeDefaultConfig(ROOT, withConfig, result);

  /* 6. RUN an initial extraction so the CSS file is populated before
        the user starts the dev server. We invoke the actual `extract`
        function so users see real diagnostics if anything's amiss.
        Skippable via --no-extract for environments where the source
        tree isn't yet authored (e.g. running init in a fresh dir). */
  if (!skipExtract) {
    try {
      // Lazy import — extract() pulls in the whole compiler. Loading it
      // only when needed keeps `init` startup snappy.
      const { extract } = await import("./extract-fn");
      console.log("📦 running first extraction so the CSS file is populated...\n");
      await extract({ silent: true, lint: false });
      result.changed.push("public/traceless-style.css — populated by initial extraction");
    } catch (e) {
      // Don't fail init just because extraction failed (e.g. no source
      // files yet). The stub from ensureCssStub is good enough; the
      // first dev/build run will populate it for real.
      result.warnings.push(
        `Initial extraction skipped (${(e as Error).message}). ` +
        `The CSS file will populate on your next \`npm run dev\` / \`npm run build\`.`
      );
    }
  }

  /* ── Report ── */
  if (result.changed.length === 0 && result.warnings.length === 0) {
    console.log("  Already set up — nothing to do.\n");
    printIdeBanner();
    return 0;
  }
  if (result.changed.length > 0) {
    console.log("✅ Changes applied:");
    for (const line of result.changed) console.log("   ✓ " + line);
    console.log("");
  }
  if (result.warnings.length > 0) {
    console.log("⚠️  Manual steps:");
    for (const line of result.warnings) console.log("   • " + line);
    console.log("");
  }
  console.log("Next: `npm run dev` (or `pnpm dev` / `yarn dev`) — extraction runs automatically.\n");
  console.log("Zero config required. The library ships strict-by-default:");
  console.log("  • lint:      no inline styles, no class strings, no CSS modules, no Tailwind");
  console.log("  • contrast:  WCAG 2.1 AA enforced (escape via `_skipContrast`)");
  console.log("  • dark:      auto-derived from every color (override per-block via `_dark`)");
  console.log("  • rtl:       physical → logical rewriting (override via `_autoRtl: false`)");
  console.log("");
  console.log("Tip: prefix `npx ` for one-off invocations — `npx traceless-style init --with-config`,");
  console.log("      `npx traceless-style audit`, `npx traceless-style inspect <file>`. The npm");
  console.log("      bin isn't on PATH globally on Windows / fresh installs; `npx` always works.\n");
  printIdeBanner();
  return 0;
}

/** Print the one-time install hint for the VS Code extension. */
function printIdeBanner(): void {
  console.log("💡 Editor support");
  console.log(`   The traceless-style VS Code extension adds autocomplete, color swatches,`);
  console.log(`   diagnostics, hover docs, outline view, and more — all scoped to your`);
  console.log(`   tl.create({...}) calls. It's already recommended in this workspace, so`);
  console.log(`   VS Code will prompt you on the next open. To install manually:`);
  console.log("");
  console.log(`     code --install-extension ${EXTENSION_ID}`);
  console.log("");
}
