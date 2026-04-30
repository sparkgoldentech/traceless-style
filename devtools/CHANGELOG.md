# Changelog — traceless-style DevTools

## [0.4.0] — 2026-04-28

Major usability + power-user expansion. Brings the panel to feature parity with the most polished CSS-in-JS / framework DevTools (React, Apollo, Redux).

### Added

- **Global search overlay** (`Ctrl+Shift+F` or the new `⌕` button): one Ctrl+K-style box that searches across classes, tokens, themes, and animations simultaneously. `↑` / `↓` to navigate, `Enter` to jump, `Esc` to dismiss. Each result is tagged with its origin tab so context is never lost.
- **Settings tab** (7th tab): per-feature toggles for color swatches, used-counts, conflict highlighting, and auto-refresh. Plus an "Export" section (JSON / CSS), a "Reset all settings" button, and an explicit privacy notice.
- **Unused-class detection** (Classes tab): `Unused only` chip-toggle in the toolbar filters to classes whose `elementCount === 0`. Unused rows render dimmed with the count in amber so they're easy to spot. Critical for trimming bundle size on long-lived apps.
- **Export panel state**: download the live page state as JSON (full snapshot — every class, token, theme, keyframe) or as CSS (reconstructed atomic stylesheet). Saves immediately to the browser's downloads folder.
- **Reset all settings**: in the Settings tab; clears `localStorage` and reloads the panel.

### Hardened

- Settings persist across sessions via `localStorage`, with `DEFAULT_UI` as the fallback when storage is unavailable (private mode etc.).
- Global search Ctrl+Shift+F handler registers in the **capture phase** so it works even when an input has focus.
- Every search-result action wraps in a try/catch — a single broken result never breaks the rest of the list.
- Settings checkboxes have explicit defaults and re-render the affected tabs immediately on change.

### Stats

- Bundle size: 26.1 KB JS + 11.5 KB CSS (was 21.5 + 10.2). Addition is the 7th tab, the global-search overlay, and the chip-toggle UI.
- Panel still loads in <50 ms on a midrange laptop.

## [0.3.2] — 2026-04-28

### Fixed (critical)

- **Dialogs ignored mouse-close**: `aboutBackdrop.hidden = true` had no visible effect because the backdrop's `display: flex` rule (author CSS) overrode the UA stylesheet's `[hidden] { display: none }`. The close handlers fired correctly — CSS just kept the element visible. Added a global `[hidden] { display: none !important }` so the `hidden` attribute is always honored on every element, regardless of layout rules.

This affected: About dialog, Help dialog, error banner, info banner, toast — anything we hide via the `hidden` attribute. All of them now close cleanly with mouse, keyboard, or click-outside.

## [0.3.1] — 2026-04-28

### Fixed (critical)

- **Frozen popup** when no traceless-style was detected on the page: the previous version rendered a fullscreen overlay card that had no close button, no `Esc` handler, and blocked tab navigation. Replaced with a non-blocking inline banner above the tab content with a ✕ dismiss button. Tabs remain navigable; the user is never trapped behind a modal.

### Added (defense in depth so nothing freezes again)

- **Mousedown-tracked backdrop click**: dialogs only close on a click that BOTH started and ended on the backdrop, so a drag-from-inside text selection never closes the dialog accidentally — but a deliberate click outside always does.
- **Force-close-on-error fallback**: a global `window.error` + `unhandledrejection` listener calls `closeAllDialogs()`. If any provider ever throws an uncaught error while a dialog is open, the dialog still closes — the panel is never left in an unrecoverable state.
- **Focus restoration**: closing a dialog returns focus to the button that opened it, so keyboard users don't lose their place.
- **Focus latched safely**: opening a dialog focuses the close button via a `setTimeout`-deferred call wrapped in try/catch, so a corrupted DOM can never freeze the open path either.
- **Banner dismiss is session-scoped**: clicking ✕ on the "no traceless-style detected" banner stops it reappearing on every refresh until the panel reloads.

## [0.3.0] — 2026-04-28

Best-practices polish — brings the panel up to the bar set by React DevTools, Apollo DevTools, and Redux DevTools.

### Added

- **About dialog** (`?` button in top bar): version pulled live from the manifest, telemetry-free + zero-permissions badges, links to docs / GitHub / issues / changelog / license, "Built by Spark Golden Tech" footer credit.
- **Keyboard shortcut cheat sheet** (`⌨` button or press `?`): one-page reference for every shortcut.
- **Helpful empty state** when no traceless-style is detected on the page — explains common causes (loading, missing CSS, build hasn't run) instead of just "Not detected".
- **Error banner** for eval failures, with a one-click "Retry" button. Covers cases like inspected page navigation, content-security-policy blocks, and crashed pages.
- **Scan-time stat** ("last scan: 12 ms") so users can see panel performance at a glance.
- **Reduced motion support** via `@media (prefers-reduced-motion: reduce)` — disables transitions and animations for users who've requested it.

### Accessibility

- WAI-ARIA tablist pattern: `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`. Arrow keys / Home / End navigate tabs; non-active tabs are removed from the tab order so keyboard users don't have to step through them.
- `role="alert"` on the error banner; `role="dialog"` + `aria-modal="true"` on dialogs.
- All icon-only buttons have `aria-label`.
- Visible focus rings on every focusable element (`:focus-visible` outlines).
- Screen-reader-only headers on action columns (`<th class="sr-only">actions</th>`).
- `aria-live="polite"` on the status line and dark/RTL state indicators.

### Changed

- Bundle size: 21.5 KB JS + 10.2 KB CSS (was 19.7 + 6.6 KB) — addition is mostly the dialog UI + accessibility wiring.
- Status text uses fewer characters when scan succeeds, so the top bar stays clean even on small windows.

## [0.2.1] — 2026-04-28

### Added

- **Firefox support** via parallel build (`npm run build:firefox` / `npm run package:firefox`). Generates a `dist-firefox/` folder with a Firefox-flavored manifest (`browser_specific_settings.gecko.id`) and a separate AMO-ready `.zip`.
- Cross-platform zip fallback: tries `zip` → `7z` → PowerShell's `Compress-Archive` so packaging works on Windows without Git Bash / WSL.

### Browser support matrix

| Browser | Status |
|---|---|
| Chrome / Edge / Brave / Opera / Vivaldi / Arc | ✅ One build |
| Firefox 109+ | ✅ Separate build |
| Safari | ❌ Defer (different API; Xcode required) |

## [0.2.0] — 2026-04-28

Polish pass to bring the panel to feature parity with the leading CSS-in-JS DevTools (StyleX, Tailwind, React DevTools).

### Added

- **Element picker** (⌖ button in the top bar / `Ctrl+Shift+P`): click any element on the page to inspect it. Shows a live orange overlay that follows the cursor. `Esc` cancels.
- **Cascade view** (Inspector tab): a checkbox toggles between "all rules" and "winning rule per property". Conflicting base rules are flagged with a `⚠`; overridden rules are dimmed and struck through.
- **Live token editing** (Tokens tab): click any token value → inline editor → hit Enter and the page updates instantly. Light + dark values are editable independently.
- **Animations tab**: every `@keyframes` rule on the page with a play-preview button and a "copy CSS" button. Filter box for projects with many animations.
- **Copy buttons** on every rule row — copies the rule as plain CSS to the clipboard.
- **Keyboard shortcuts**:
  - `1`–`6` switch tabs
  - `/` focuses the active tab's search box
  - `Esc` cancels the picker / blurs the focused input
  - `Ctrl+R` re-scans the page
  - `Ctrl+Shift+P` toggles the element picker
- **Persistent UI state**: last tab, search filters, and the cascade toggle survive panel reloads via `localStorage`.
- **Toast notifications** for transient feedback (copy success, token update, picker prompt).
- **Smart filter syntax**: `prop:value` filters both halves at once (e.g. `padding:1rem`).
- **Stats expanded** with theme + animation counts.

### Changed

- Bundle size: 19.7 KB minified panel JS (was 12.4 KB) for the substantial feature additions.
- Token cells in the Tokens tab now show a subtle hover highlight, signaling editability.

## [0.1.0] — 2026-04-28

Initial release.

### Added

- DevTools panel with Inspector / Classes / Tokens / Theme / Stats tabs.
- Reads `tl*` rules, `--tl-*` tokens, and `tlTheme*` classes from page stylesheets via `chrome.devtools.inspectedWindow.eval`.
- Click-to-highlight on class names.
- Dark / RTL toggles + theme switcher.
- Manifest V3, zero permissions, telemetry-free.
