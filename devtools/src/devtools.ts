/**
 * traceless-style DevTools — devtools.ts
 *
 * Registers the panel with Chrome's DevTools API. This script runs in
 * the (hidden) `devtools.html` host frame; it has nothing to do with
 * the page being inspected. The panel HTML it points at is what users
 * actually see when they switch to the "traceless-style" tab in F12.
 */

chrome.devtools.panels.create(
  "traceless-style",
  "icons/icon-48.png",
  "panel.html",
);
