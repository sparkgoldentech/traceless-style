/**
 * traceless-style DevTools — Chrome / Edge packaging script.
 *
 * Bundles every file Chromium browsers need into a `.zip` ready to
 * upload to the Chrome Web Store, Edge Add-ons, or to drag-drop into
 * `chrome://extensions` for an unpacked install.
 *
 * Cross-platform: tries `zip`, then `7z`, then PowerShell's
 * `Compress-Archive` (always present on Windows 10+). For Firefox use
 * `npm run package:firefox` instead.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FILES = [
  "manifest.json",
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

const missing = FILES.filter(f => !fs.existsSync(path.join(__dirname, f)));
if (missing.length) {
  console.error("Missing files — run `npm run build` first:\n  " + missing.join("\n  "));
  process.exit(1);
}

const zipPath = path.join(__dirname, "traceless-style-devtools.zip");
fs.rmSync(zipPath, { force: true });

// Try, in order: POSIX zip → 7z → PowerShell. The Chrome zip wants only
// SPECIFIC files at the root (no node_modules, no out/build artifacts,
// no source). Easiest cross-tool approach: stage them in a temp dir,
// then archive the temp dir's contents.
const stage = fs.mkdtempSync(path.join(__dirname, ".pkg-"));
try {
  for (const rel of FILES) {
    const dest = path.join(stage, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(__dirname, rel), dest);
  }
  if (!tryZip(zipPath, stage)) {
    console.error(
      "\nCouldn't run `zip`, `7z`, or PowerShell's Compress-Archive.\n" +
      "Compress these files manually and upload to Chrome/Edge stores:"
    );
    for (const f of FILES) console.error("  " + f);
    process.exit(1);
  }
  console.log(`\n✓ packaged: ${path.relative(process.cwd(), zipPath)}`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}

function tryZip(zip, sourceDir) {
  let r = spawnSync("zip", ["-r", zip, "."], { cwd: sourceDir, stdio: ["ignore", "ignore", "pipe"] });
  if (r.status === 0) return true;
  r = spawnSync("7z", ["a", "-tzip", zip, "."], { cwd: sourceDir, stdio: ["ignore", "ignore", "pipe"] });
  if (r.status === 0) return true;
  if (process.platform === "win32") {
    const args = ["-NoProfile", "-Command",
      `Compress-Archive -Path "${sourceDir}\\*" -DestinationPath "${zip}" -Force`];
    r = spawnSync("powershell.exe", args, { stdio: ["ignore", "ignore", "pipe"] });
    if (r.status === 0) return true;
  }
  return false;
}
