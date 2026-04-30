/**
 * traceless-style DevTools — Firefox build script.
 *
 * Generates a Firefox-compatible distribution at `dist-firefox/`:
 *   1. Reads the Chrome `manifest.json` as source-of-truth.
 *   2. Adds Firefox-specific fields (`browser_specific_settings.gecko.id`).
 *   3. Copies all the other assets (HTML / out/*.js / icons / docs)
 *      verbatim — the panel code is API-identical between Chromium and
 *      Firefox for the DevTools surfaces we use (`chrome.devtools.panels`,
 *      `chrome.devtools.inspectedWindow.eval`, the events).
 *   4. Optionally zips the result for AMO upload.
 *
 * Why a parallel folder vs. a manifest swap in-place:
 *   - Lets developers keep an unpacked Chrome install loaded while
 *     simultaneously testing the Firefox build (Firefox loads from
 *     `dist-firefox/`, Chrome from the project root).
 *   - The CI workflow that uploads artifacts can grab BOTH at once.
 *   - "manifest.json swapping" is a footgun: if the swap script crashes,
 *     the user is left with a busted manifest in the working tree.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const OUT  = path.join(ROOT, "dist-firefox");

/* The gecko ID is the canonical addon identifier on AMO. Standard form:
   reverse-domain. Don't change without coordinating with anyone who has
   already installed the AMO signed build — Firefox treats a different ID
   as a different addon. */
const GECKO_ID            = "traceless-style@sparkgoldentech.com";
const STRICT_MIN_VERSION  = "109.0";

const FILES_TO_COPY = [
  "devtools.html",
  "panel.html",
  "out/devtools.js",
  "out/panel.js",
  "out/panel.css",
  "icons/icon-16.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
];

/* ── 1. Manifest transform ───────────────────────────────────────── */
const baseManifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

// Spread first; injected fields land at the end of the JSON for clarity.
const firefoxManifest = {
  ...baseManifest,
  browser_specific_settings: {
    gecko: {
      id:                 GECKO_ID,
      strict_min_version: STRICT_MIN_VERSION,
    },
  },
};

// Firefox doesn't require/accept `minimum_chrome_version` — drop it.
delete firefoxManifest.minimum_chrome_version;

/* ── 2. Write the Firefox manifest + copy assets ─────────────────── */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

fs.writeFileSync(
  path.join(OUT, "manifest.json"),
  JSON.stringify(firefoxManifest, null, 2) + "\n"
);

for (const rel of FILES_TO_COPY) {
  const src  = path.join(ROOT, rel);
  const dest = path.join(OUT,  rel);
  if (!fs.existsSync(src)) {
    console.error(`⚠ missing asset: ${rel} — run \`npm run build\` first.`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

console.log(`✓ Firefox build at: ${path.relative(process.cwd(), OUT)}`);

/* ── 3. Optionally zip for AMO upload ────────────────────────────── */
const wantZip = process.argv.includes("--zip");
if (wantZip) {
  const zipName = "traceless-style-devtools-firefox.zip";
  const zipPath = path.join(ROOT, zipName);
  fs.rmSync(zipPath, { force: true });
  if (!tryZip(zipPath, OUT)) {
    console.error(
      "\nCouldn't run `zip`, `7z`, or PowerShell's Compress-Archive.\n" +
      "Open the dist-firefox/ folder, select all files, and create a .zip manually.\n" +
      "Then upload at https://addons.mozilla.org/developers/addon/submit/"
    );
    process.exit(1);
  }
  console.log(`✓ Firefox zip:        ${path.relative(process.cwd(), zipPath)}`);
}

/**
 * Try every common archiver until one works. Returns true on success.
 *
 * Order:
 *   1. POSIX `zip` (Git Bash / WSL / macOS / Linux)
 *   2. `7z`        (common on Windows, available in many CI images)
 *   3. PowerShell  `Compress-Archive` (always available on Windows 10+)
 */
function tryZip(zipPath, sourceDir) {
  // 1. zip
  let r = spawnSync("zip", ["-r", zipPath, "."], { cwd: sourceDir, stdio: ["ignore", "ignore", "pipe"] });
  if (r.status === 0) return true;

  // 2. 7z
  r = spawnSync("7z", ["a", "-tzip", zipPath, "."], { cwd: sourceDir, stdio: ["ignore", "ignore", "pipe"] });
  if (r.status === 0) return true;

  // 3. PowerShell — Windows-only, but the most reliable fallback there.
  //    `-Force` overwrites; `-Path` accepts a glob, `-DestinationPath` is the .zip.
  if (process.platform === "win32") {
    const args = [
      "-NoProfile", "-Command",
      `Compress-Archive -Path "${sourceDir}\\*" -DestinationPath "${zipPath}" -Force`,
    ];
    r = spawnSync("powershell.exe", args, { stdio: ["ignore", "ignore", "pipe"] });
    if (r.status === 0) return true;
  }

  return false;
}

console.log(`
Next steps for Firefox:
  Local install (temporary):
    1. Open  about:debugging
    2. Click "This Firefox" → "Load Temporary Add-on…"
    3. Pick  ${path.relative(process.cwd(), path.join(OUT, "manifest.json"))}
    4. Open any page → F12 → "traceless-style" tab
    (Firefox unloads temporary add-ons on browser restart — this is by design.)

  Permanent install: requires AMO signing.
    1. Run  npm run package:firefox        (generates the .zip)
    2. Upload at https://addons.mozilla.org/developers/addon/submit/
    3. Once signed, install from AMO or download the signed .xpi.
`);
