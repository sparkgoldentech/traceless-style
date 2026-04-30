/**
 * traceless-style — runtime/devtools-hint.ts
 *
 * One-time, dev-mode console hint nudging users to install the
 * traceless-style DevTools browser extension. Same UX pattern as React
 * DevTools / MobX / Apollo Client / Redux DevTools — the line you've
 * seen in your console a thousand times.
 *
 * Properties (intentional, mirrored from the React DevTools convention):
 *
 *   - DEV-MODE ONLY  — never logs in production. We check `process.env.
 *                      NODE_ENV` and `__DEV__` (the convention some
 *                      bundlers inject). Fail-closed: if we can't tell,
 *                      assume production and skip.
 *   - ONE TIME PER SESSION — uses `sessionStorage` so the hint shows
 *                      once when the user opens a tab and stays quiet
 *                      across SPA navigations.
 *   - OPT-OUT  — `localStorage.setItem("traceless-style:no-devtools-hint", "1")`
 *                silences it forever for that origin. Mentioned in the
 *                hint itself so users can dismiss without searching.
 *   - SKIPS WHEN PANEL IS OPEN  — the DevTools extension exposes
 *                `window.__TRACELESS_DEVTOOLS__ = true` on activation;
 *                if it's set, we know the user already has the panel
 *                installed and don't need to nag.
 *   - NO-THROW  — if anything fails (private mode storage, Web Worker
 *                context, custom Console replacements), we silently
 *                bail. The hint is never load-bearing.
 *
 * Implementation note: every storage access is wrapped in try/catch —
 * private/incognito mode, mobile web views, and embedded WebViews all
 * throw on `localStorage` access in some configurations.
 */

const STORAGE_OPT_OUT = "traceless-style:no-devtools-hint";
const SESSION_FLAG    = "traceless-style:devtools-hinted";
const DEVTOOLS_URL    = "https://traceless-style.dev/devtools";

let _shown = false;

/** Test-only — resets the once-per-load latch so unit tests can re-exercise
 *  the function. NOT exported on the public `tl` namespace. Free to remove
 *  when there's a better testing seam. */
export function _resetForTest(): void { _shown = false; }

/**
 * Show the DevTools install hint once. Safe to call from `tl.create()` —
 * it's idempotent and never throws.
 *
 * Calling pattern: invoke unconditionally; the function decides whether
 * to actually print based on environment + storage.
 */
export function maybeShowDevtoolsHint(): void {
  if (_shown) return;
  _shown = true;

  try {
    if (typeof window === "undefined") return;

    if (!isDevMode())                        return;
    if (devtoolsExtensionInstalled())        return;
    if (userOptedOut())                      return;
    if (sessionAlreadyHinted())              return;

    markSessionHinted();

    // Two-line styled output — keeps the visual weight low while still
    // being scannable. The orange chip matches the brand color the
    // VS Code extension uses, so users get a coherent visual identity.
    const tag = "%ctraceless-style";
    const tagStyle =
      "background:#ff6f00;color:white;padding:2px 6px;border-radius:3px;" +
      "font-weight:600;font-family:system-ui,sans-serif;";
    const reset   = "color:inherit;font-weight:normal;";
    const link    = "color:#1a73e8;text-decoration:underline;";

    const console_ = window.console;
    if (!console_ || typeof console_.log !== "function") return;

    console_.log(
      tag +
        "%c → Install the DevTools panel for class inspection, token editing, and live theme switching.\n" +
        "                  %c" + DEVTOOLS_URL + "\n" +
        "                  %cSilence this with: localStorage.setItem(\"" + STORAGE_OPT_OUT + "\", \"1\")",
      tagStyle, reset, link, "color:#9aa0a6;font-size:11px;",
    );
  } catch {
    // Never break the app for a hint.
  }
}

/* ── helpers ────────────────────────────────────────────────────── */

function isDevMode(): boolean {
  // Bundler-injected globals first — they're the most reliable signal.
  // `__DEV__` is the convention used by React Native and Webpack with
  // DefinePlugin. `process.env.NODE_ENV` is set by Vite, Next, esbuild,
  // Rollup, Parcel, etc.
  try {
    const w = window as unknown as { __DEV__?: boolean };
    if (w.__DEV__ === true) return true;
    if (w.__DEV__ === false) return false;
  } catch { /* ignore */ }

  try {
    if (typeof process !== "undefined" && process.env && process.env.NODE_ENV) {
      return process.env.NODE_ENV !== "production";
    }
  } catch { /* ignore */ }

  // Heuristic last resort — if the page hostname is localhost or a private
  // address, assume dev. Public domains (production) skip the hint.
  try {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1") return true;
    if (/^192\.168\./.test(h) || /^10\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  } catch { /* ignore */ }

  return false; // fail-closed
}

function devtoolsExtensionInstalled(): boolean {
  try {
    return Boolean((window as unknown as { __TRACELESS_DEVTOOLS__?: boolean }).__TRACELESS_DEVTOOLS__);
  } catch {
    return false;
  }
}

function userOptedOut(): boolean {
  // Read through `window.localStorage` (not the bare `localStorage`
  // global) so a mocked `window` in tests is consistent. In a real
  // browser they're the same object.
  try { return window.localStorage.getItem(STORAGE_OPT_OUT) === "1"; }
  catch { return false; }
}

function sessionAlreadyHinted(): boolean {
  try { return window.sessionStorage.getItem(SESSION_FLAG) === "1"; }
  catch { return false; }
}

function markSessionHinted(): void {
  try { window.sessionStorage.setItem(SESSION_FLAG, "1"); }
  catch { /* private mode etc. */ }
}
