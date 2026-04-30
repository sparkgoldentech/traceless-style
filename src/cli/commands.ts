/**
 * traceless-style CLI subcommands: inspect, audit.
 *
 * Both run a silent extraction and read back the registries (atomic rules,
 * tokens, themes) to produce human-readable reports. They never modify
 * source files. Output goes to stdout.
 *
 * Security posture: these commands accept a file path and read it; any
 * user-controlled string in output is run through a `safe()` strip so
 * terminal-control sequences in malicious source code can't escape into
 * the operator's terminal. Inputs to extract() are validated to be inside
 * the project root.
 */

import fs   from "fs";
import path from "path";
import { spawn } from "child_process";
import { extract }                                from "./extract-fn";
import { globalRegistry, getContrastIssues }     from "../compiler/extractor";
import { tokenRegistry }                          from "../compiler/tokens";
import type { AtomicRule }                        from "../compiler/css-gen";
import { runInteractiveContrastFix }              from "./contrast-fix";

/** Strip terminal control / escape sequences from any string we display. */
function safe(s: string): string {
  // Remove ESC + control chars + the C1 range. Keeps us safe from a source
  // file that embeds ANSI escapes hoping to recolor or misalign our output.
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0B-\x1F\x7F-\x9F]/g, "");
}

/** Resolve a user-supplied path safely against the project root. */
function resolveSafe(root: string, p: string): string {
  const abs = path.isAbsolute(p) ? p : path.resolve(root, p);
  if (!abs.startsWith(root)) {
    throw new Error(`[traceless-style] refusing to operate on a path outside the project root: ${abs}`);
  }
  return abs;
}

/* ════════════════════════════════════════
   inspect
════════════════════════════════════════ */
export async function inspectCommand(filePath: string): Promise<number> {
  const ROOT = process.cwd();
  const target = resolveSafe(ROOT, filePath);

  if (!fs.existsSync(target)) {
    console.error(`[traceless-style] file not found: ${target}`);
    return 1;
  }
  const stat = fs.statSync(target);
  if (!stat.isFile()) {
    console.error(`[traceless-style] not a file: ${target}`);
    return 1;
  }

  // Run extraction scoped to just this file by giving extract() a tmp dir
  // that contains a single symlink isn't portable on Windows; instead we
  // run against the file's parent dir then filter rules by origin.
  await extract({
    srcDir:  path.dirname(target),
    silent:  true,
    lint:    false,
    outCSS:  path.join(ROOT, ".traceless-style", "inspect.css"),
    outMeta: path.join(ROOT, ".traceless-style", "inspect.json"),
  });

  const rel = path.relative(ROOT, target).replace(/\\/g, "/");
  console.log(`\ntraceless-style inspect — ${safe(rel)}\n`);

  const rules = globalRegistry.getAll().filter(r => {
    if (!r.origin) return false;
    const orig = path.resolve(r.origin.file);
    return orig === target;
  });

  if (rules.length === 0 && tokenRegistry.getTokens().length === 0 && tokenRegistry.getThemes().length === 0) {
    console.log("  (no traceless-style APIs detected in this file)");
    return 0;
  }

  if (rules.length > 0) {
    console.log(`Atomic rules from this file: ${rules.length}\n`);
    // Group by sourceKey for readability.
    const byKey = new Map<string, AtomicRule[]>();
    for (const r of rules) {
      const k = r.origin?.sourceKey ?? "<anonymous>";
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(r);
    }
    for (const [key, list] of byKey) {
      console.log(`  ${safe(key)}:`);
      for (const r of list) {
        const sel = r.selector ? `   [${safe(r.selector)}]` : "";
        console.log(`    .${r.cls}   ${safe(r.prop)}: ${safe(r.value)}${sel}`);
      }
      console.log("");
    }
  }

  const tokens = tokenRegistry.getTokens();
  if (tokens.length > 0) {
    console.log(`Tokens registered (process-wide, may include other files): ${tokens.length}`);
    for (const t of tokens) console.log(`  --${safe(t.name)}: ${safe(t.value)}`);
    console.log("");
  }

  const themes = tokenRegistry.getThemes();
  if (themes.length > 0) {
    console.log(`Themes registered (process-wide): ${themes.length}`);
    for (const th of themes) {
      console.log(`  .${safe(th.cls)} (${th.overrides.length} overrides)`);
    }
    console.log("");
  }

  return 0;
}

/* ════════════════════════════════════════
   audit
════════════════════════════════════════ */
export async function auditCommand(): Promise<number> {
  const ROOT = process.cwd();

  const t0 = Date.now();
  const result = await extract({
    silent:  true,
    lint:    false,
    outCSS:  path.join(ROOT, ".traceless-style", "audit.css"),
    outMeta: path.join(ROOT, ".traceless-style", "audit.json"),
  });
  const elapsed = Date.now() - t0;

  const rules    = globalRegistry.getAll();
  const tokens   = tokenRegistry.getTokens();
  const themes   = tokenRegistry.getThemes();

  console.log(`\ntraceless-style audit\n`);

  console.log(`Extraction:`);
  console.log(`  files transformed     ${result.files}`);
  console.log(`  parser                ${process.env.TRACELESS_STYLE_PARSER ?? "auto"}`);
  console.log(`  elapsed               ${elapsed}ms`);
  console.log(``);

  console.log(`Output:`);
  console.log(`  atomic rules          ${rules.length}`);
  console.log(`  design tokens         ${tokens.length}`);
  console.log(`  themes                ${themes.length}`);
  console.log(`  CSS bytes             ${result.bytes}`);
  console.log(``);

  // Dedup: how many `prop:value:selector` keys we collapsed into rules.
  // Since the registry already keys by `cls` (which is hash of those),
  // count is exact. Compute the theoretical maximum (each origin separately).
  let originCount = 0;
  for (const r of rules) if (r.origin) originCount++;
  const dedup = rules.length > 0 ? (originCount / rules.length).toFixed(2) : "0.00";
  console.log(`Atomic rule reuse:`);
  console.log(`  declarations seen     ${originCount}`);
  console.log(`  unique atomic rules   ${rules.length}`);
  console.log(`  reuse factor          ${dedup}× (higher = more dedup)`);
  console.log(``);

  // Variant breakdown.
  const variantCount = new Map<string, number>();
  for (const r of rules) {
    if (!r.selector) continue;
    const key = r.selector.length > 30 ? r.selector.slice(0, 27) + "..." : r.selector;
    variantCount.set(key, (variantCount.get(key) ?? 0) + 1);
  }
  if (variantCount.size > 0) {
    console.log(`Top selectors:`);
    [...variantCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([sel, n]) => console.log(`  ${String(n).padStart(4)}  ${safe(sel)}`));
    console.log(``);
  }

  // Custom variants discovered.
  const cvKeys = Object.keys(result.customVariants);
  if (cvKeys.length > 0) {
    console.log(`Custom variants (tl.extend):`);
    for (const k of cvKeys) console.log(`  ${safe(k)}   ${safe(result.customVariants[k])}`);
    console.log(``);
  }

  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.length}`);
    for (const e of result.errors.slice(0, 5)) console.log(`  ${safe(e)}`);
    if (result.errors.length > 5) console.log(`  ... and ${result.errors.length - 5} more`);
    return 1;
  }
  return 0;
}

/* ════════════════════════════════════════
   wrap — zero-config dev/build commands

   Goal: the user never edits next.config.ts (or any other framework
   config). They install traceless-style and add ONE script:
       "dev": "traceless-style dev"
   `traceless-style dev`  → runs extraction once, watches sources,
                            and spawns the framework's own dev command
                            (`next dev`, `vite dev`, etc.) as a child.
   `traceless-style build` → runs extraction, then spawns `next build`
                             (or equivalent) as a child.

   Framework detection: read package.json deps and pick the first match.
   The user can override with `--framework=next|vite|...` if needed.

   The atomic CSS file lands in `public/traceless-style.css` (Next + Vite
   serve `public/` as static assets). The user adds ONE import line to
   their root layout: `import "../public/traceless-style.css";`
════════════════════════════════════════ */

type Framework = "next" | "vite" | "remix" | "astro" | "unknown";

interface PackageJson {
  scripts?:        Record<string, string>;
  dependencies?:   Record<string, string>;
  devDependencies?:Record<string, string>;
}

function detectFramework(root: string): Framework {
  const p = path.join(root, "package.json");
  if (!fs.existsSync(p)) return "unknown";
  let pkg: PackageJson = {};
  try { pkg = JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return "unknown"; }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (deps.next)   return "next";
  if (deps.vite)   return "vite";
  if (deps["@remix-run/dev"]) return "remix";
  if (deps.astro)  return "astro";
  return "unknown";
}

function readFrameworkOverride(args: string[]): Framework | null {
  const arg = args.find(a => a.startsWith("--framework="));
  if (!arg) return null;
  const v = arg.split("=")[1];
  if (["next", "vite", "remix", "astro"].includes(v)) return v as Framework;
  return null;
}

function frameworkCommand(fw: Framework, mode: "dev" | "build"): string[] | null {
  switch (fw) {
    case "next":  return mode === "dev" ? ["next", "dev"]   : ["next", "build"];
    case "vite":  return mode === "dev" ? ["vite"]          : ["vite", "build"];
    case "remix": return mode === "dev" ? ["remix", "dev"]  : ["remix", "build"];
    case "astro": return mode === "dev" ? ["astro", "dev"]  : ["astro", "build"];
    default: return null;
  }
}

/**
 * Run the appropriate framework command (`next dev`, `vite`, etc.) as a
 * child process. We use `npx` so the user doesn't need to have the
 * framework's bin on PATH — npm/yarn/pnpm all install bins to node_modules
 * and `npx` resolves through them.
 */
function spawnFramework(cmd: string[]): Promise<number> {
  return new Promise(resolve => {
    const proc = spawn("npx", ["--yes", ...cmd], {
      stdio: "inherit",
      shell: process.platform === "win32",   // .cmd on Windows
    });
    proc.on("close", code => resolve(code ?? 0));
    proc.on("error", e => { console.error(`[traceless-style] failed to spawn ${cmd.join(" ")}:`, e); resolve(1); });
  });
}

/**
 * Shared "auto-fix prompt + verify" orchestration used by both `dev`
 * and `build` zero-config commands. Runs only when:
 *   • there ARE contrast issues (otherwise nothing to prompt about),
 *   • stdin/stdout are real TTYs (no piped/redirected automation),
 *   • `process.env.CI` is unset (CI safety — never block a CI build),
 *   • caller didn't pass `--no-fix-prompt`.
 *
 * On accept, we re-extract once to confirm the applied fixes resolved
 * the violations — closed-loop UX so the user immediately sees what
 * remains (if anything). On non-interactive contexts this is a no-op
 * and the regular validator output stands.
 */
async function maybePromptContrastFix(args: string[], rootDir: string): Promise<void> {
  if (args.includes("--no-fix-prompt")) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;
  if (process.env.CI) return;
  const issues = getContrastIssues();
  if (issues.length === 0) return;
  const result = await runInteractiveContrastFix(issues, rootDir);
  if (result.applied > 0) {
    console.log("\n🔁 verifying applied fixes — re-extracting...\n");
    await extract({ silent: false, lint: false });
    const remaining = getContrastIssues().length;
    if (remaining === 0) {
      console.log("✅ all contrast issues resolved.\n");
    } else {
      console.log(`ℹ ${remaining} issue${remaining === 1 ? "" : "s"} remain (advisory or skipped).\n`);
    }
  }
}

export async function devCommand(args: string[]): Promise<number> {
  const ROOT = process.cwd();
  const fw = readFrameworkOverride(args) ?? detectFramework(ROOT);
  const fwCmd = frameworkCommand(fw, "dev");
  if (!fwCmd) {
    console.error(
      `[traceless-style] couldn't detect a framework in ${ROOT}.\n` +
      `Add one of [next, vite, remix, astro] to your dependencies, or pass --framework=<name>.`
    );
    return 1;
  }

  console.log(`\n🔥 traceless-style dev — detected ${fw}, wrapping \`${fwCmd.join(" ")}\`\n`);

  /* Initial extraction — scans the WHOLE project (every .tsx/.jsx under
     src/ and app/) for parse errors, forbidden patterns (no-inline-styles,
     no-class-string, no-css-modules, no-tailwind), property-allowlist
     violations, and WCAG contrast failures.
     Lint is ENFORCED (no `lint: false` here) so dev surfaces every issue
     the production build would surface — you find them at edit time, not
     CI time. Hard errors halt before the framework dev server starts. */
  console.log(`📊 traceless-style — scanning project (parse / lint / accessibility)...`);
  const scanResult = await extract({ silent: false });
  if (scanResult.errors.length > 0) {
    console.error(`\n🚫 traceless-style halted dev startup — fix ${scanResult.errors.length} error${scanResult.errors.length === 1 ? "" : "s"} before running again.\n`);
    return 1;
  }
  console.log(`✓ scan complete: ${scanResult.files} files, ${scanResult.rules} atomic rules, no errors.\n`);

  /* Auto-prompt for contrast fixes BEFORE spawning the framework dev
     server. Done here (not inside the watcher) because: (a) we don't
     want to interrupt the developer mid-edit with a prompt, (b) the
     framework's stdout takes over after spawn so a prompt later would
     race with hot-reload output. */
  await maybePromptContrastFix(args, ROOT);

  // Watch source files in parallel with the framework dev process. The
  // watcher runs full re-extraction on every change — atomic-rule
  // generation is fast (~100ms for typical apps), so the simplicity is
  // worth the extra work.
  const fsWatch = await import("fs");
  const watchTargets = ["src", "app"]
    .map(d => path.join(ROOT, d))
    .filter(d => fsWatch.existsSync(d));
  let debounce: NodeJS.Timeout | undefined;
  for (const dir of watchTargets) {
    fsWatch.watch(dir, { recursive: true }, (_, filename) => {
      if (!filename) return;
      if (!/\.(tsx?|jsx?)$/.test(String(filename))) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        extract({ silent: true, lint: false }).catch(e =>
          console.error("[traceless-style] re-extract failed:", e)
        );
      }, 150);
    });
  }

  return spawnFramework(fwCmd);
}

export async function buildCommand(args: string[]): Promise<number> {
  const ROOT = process.cwd();
  const fw = readFrameworkOverride(args) ?? detectFramework(ROOT);
  const fwCmd = frameworkCommand(fw, "build");
  if (!fwCmd) {
    console.error(
      `[traceless-style] couldn't detect a framework in ${ROOT}.\n` +
      `Add one of [next, vite, remix, astro] to your dependencies, or pass --framework=<name>.`
    );
    return 1;
  }

  console.log(`\n🔥 traceless-style build — detected ${fw}, wrapping \`${fwCmd.join(" ")}\`\n`);

  /* Production build: scan the WHOLE project (every .tsx/.jsx under
     src/ and app/) FIRST. Two-pass extraction discovers `tl.extend`
     custom variants then transforms every `tl.create` call. Lint runs
     strict-by-default (no-inline-styles, no-class-string, no-css-modules,
     no-tailwind). Property allowlist enforced. WCAG contrast strict.
     Any error → process.exit(1) inside extract() — framework build is
     NEVER reached when there are errors. The explicit gate below is
     defense-in-depth in case extract() is invoked silently. */
  console.log(`📊 traceless-style — scanning project (parse / lint / accessibility)...`);
  const scanResult = await extract({ silent: false });
  if (scanResult.errors.length > 0) {
    console.error(`\n🚫 traceless-style halted build — fix ${scanResult.errors.length} error${scanResult.errors.length === 1 ? "" : "s"} before continuing. The framework build did NOT run.\n`);
    return 1;
  }
  console.log(`✓ scan complete: ${scanResult.files} files, ${scanResult.rules} atomic rules, no errors.\n`);

  /* Local builds run in a TTY → prompt for accessibility fixes before
     handing off to the framework build. CI builds (CI=true OR no TTY)
     skip the prompt and surface violations through the validator's
     normal warn/error output. This is the "robust by default" pattern
     big-tech design systems publish: developer machines get rich
     interactivity; pipelines get deterministic, non-blocking output. */
  await maybePromptContrastFix(args, ROOT);

  return spawnFramework(fwCmd);
}
