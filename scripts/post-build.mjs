/**
 * Post-build for traceless-style.
 *
 * Two jobs:
 *   1. Sanitize the CLI's shebang. tsup adds `#!/usr/bin/env node` via the
 *      esbuild banner; in some configurations the source file ALSO ends up
 *      with one and you get a duplicated shebang. The first line is stripped
 *      by Node when running as a script, but the second remains and causes
 *      `SyntaxError: Invalid or unexpected token` at parse time. We collapse
 *      to exactly ONE shebang line.
 *   2. Remove stale CLI artifacts from previous build configs (specifically
 *      `dist/cli/extract.js` from the era when the CLI was emitted as CJS;
 *      the package.json `bin` now points to `extract.mjs`, but a stale `.js`
 *      file from an earlier build would still get picked up if anyone wired
 *      it manually). `clean: false` on the cli/extract tsup entry prevents
 *      tsup from doing this itself (it would also wipe sibling entries'
 *      output), so we do it explicitly here.
 */
import fs              from "node:fs";
import path            from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath is mandatory on Windows: `new URL(".", import.meta.url).pathname`
// returns `/C:/...` (leading slash breaks on win32). fileURLToPath normalizes
// to a valid platform path on every OS.
const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT        = path.resolve(SCRIPTS_DIR, "..");
const CLI_DIR     = path.join(ROOT, "dist", "cli");
const SHEBANG     = "#!/usr/bin/env node";

/* (1) Sanitize shebang in the ESM CLI: zero or more leading shebang lines → exactly one. */
const cliMjs = path.join(CLI_DIR, "extract.mjs");
if (fs.existsSync(cliMjs)) {
  let src = fs.readFileSync(cliMjs, "utf8");
  // Drop every leading shebang line (handles 0, 1, or N duplicates).
  while (src.startsWith(SHEBANG)) {
    const nl = src.indexOf("\n");
    src = nl === -1 ? "" : src.slice(nl + 1);
  }
  // Re-prepend exactly one. Node will strip it transparently when this is
  // executed as a script via the `bin` entry.
  src = SHEBANG + "\n" + src;
  fs.writeFileSync(cliMjs, src, "utf8");
  // Make executable (no-op on Windows, real on POSIX).
  try { fs.chmodSync(cliMjs, 0o755); } catch { /* ignore */ }
  console.log(`✓ post-build: ${path.relative(ROOT, cliMjs)} — single shebang, executable`);
}

/* (2) Wipe stale CLI artifacts from older build configurations. */
const stale = ["extract.js", "extract.js.map", "extract.d.ts", "extract.d.mts"];
for (const name of stale) {
  const p = path.join(CLI_DIR, name);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log(`✓ post-build: removed stale ${path.relative(ROOT, p)}`);
  }
}

console.log("CLI post-build complete.");
