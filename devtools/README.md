# traceless-style DevTools

Chrome / Edge extension that adds a **traceless-style** panel to the browser's developer tools — like React DevTools, but for traceless-style atomic CSS classes, design tokens, dark mode, and RTL state.

## What's in the panel

| Tab | What you see |
|---|---|
| **Inspector** | Live view of the currently selected element (`$0`) plus a **cascade view** that marks the winning rule for each property. Conflicting base rules get a ⚠ warning. Click a class → highlights every element on the page using it. **Element picker** in the top bar (⌖) lets you click any element on the page to inspect it directly. |
| **Classes** | Searchable browser of every `tl*` class with use-counts. Filter accepts `prop:value` syntax (`padding:1rem`) for fast narrowing. Each row has a copy-as-CSS button. |
| **Tokens** | Every `--tl-*` CSS custom property with light AND dark values side-by-side. **Click any value to live-edit** — hit Enter and the page updates instantly via a `:root` override. |
| **Theme** | One-click dark / RTL toggles + theme-switcher. Buttons drive the same engines `<ThemeToggle />` and `<RtlToggle />` use, so your app reacts immediately. |
| **Animations** | Every `@keyframes` rule with a play-preview button and copy-CSS. |
| **Stats** | Rule count, used-class count, CSS bundle size, token count, theme count, animation count. |

## Keyboard shortcuts

| Key | Action |
|---|---|
| `1`–`6` | Switch tab |
| `/` | Focus the active tab's search box |
| `?` | Show keyboard shortcut cheat sheet |
| `Esc` | Cancel picker / close dialog / blur input |
| `Ctrl+R` | Re-scan the page |
| `Ctrl+Shift+P` | Toggle element picker |
| `←` / `→` / `Home` / `End` | Navigate between tabs (when a tab is focused) |

## Accessibility

The panel follows WAI-ARIA's tablist / tabpanel / dialog patterns. Every interactive control has a visible focus ring, every icon-only button has an `aria-label`, and `prefers-reduced-motion` users get reduced animation. The panel is fully keyboard-navigable.

## Privacy

**Telemetry-free**. Manifest declares zero `permissions` and zero `host_permissions`. Reads only from pages where the user has DevTools open. Never sends data anywhere.

## Browser support

| Browser | Status | Distribution |
|---|---|---|
| Chrome | ✅ Works as-is | Chrome Web Store + unpacked |
| Edge | ✅ Works as-is | Edge Add-ons + unpacked |
| Brave / Vivaldi / Arc | ✅ Works as-is | Chrome Web Store |
| Opera | ✅ Works as-is | Opera Addons (or "Install Chrome Extensions" addon) |
| **Firefox** | ✅ Supported via separate build | AMO (addons.mozilla.org) |
| Safari | ❌ Not supported | Would require an Xcode-based rewrite — Safari's DevTools API is fundamentally different. Defer. |

## Install — development (Chromium)

```bash
git clone https://github.com/sparkgoldentech/traceless-style
cd traceless-style/devtools
npm install
npm run build
```

Then in Chrome / Edge / Brave / Opera:

1. Open `chrome://extensions` (or `edge://extensions`, etc.)
2. Toggle **Developer mode** on
3. Click **Load unpacked**
4. Pick the `devtools/` folder
5. Open any page that uses traceless-style → F12 → **traceless-style** tab

## Install — development (Firefox)

```bash
npm run build:firefox     # generates dist-firefox/ with the Firefox manifest
```

Then:

1. Open `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on…**
4. Pick `devtools/dist-firefox/manifest.json`
5. Open any page → F12 → **traceless-style** tab

> Firefox unloads temporary add-ons on browser restart. For permanent installs you need an AMO-signed `.xpi` (see Publishing below).

## Install — published

| Store | Build & upload command |
|---|---|
| Chrome Web Store | `npm run package` → upload `traceless-style-devtools.zip` |
| Edge Add-ons | Same `.zip` works for Edge |
| Firefox AMO | `npm run package:firefox` → upload `traceless-style-devtools-firefox.zip` |

## How it works

DevTools panels run in a separate iframe with their own JavaScript context. To read state from the inspected page, this extension uses Chrome's `chrome.devtools.inspectedWindow.eval()` API — it ships an inspector function as a string, runs it in the page's context, and gets a JSON result back. The advantage over a content-script approach: no permissions for the inspected origin, no message-passing layer, and we can read same-origin stylesheets directly.

The inspector reads:
- `document.styleSheets` — finds every `.tl*` rule, extracts class / prop / value / variant
- `:root { --tl-*: …; }` — design tokens
- `.dark { --tl-*: …; }` — dark overrides
- `.tlTheme*` — theme classes available on the page
- `<html dir>` and `<html class>` — current dark / RTL state
- `document.getElementsByClassName()` — per-class element counts

Toggle commands write to `<html>` directly (matching the runtime engine's behavior) and dispatch the same `traceless-dark-change` / `traceless-dir-change` events the library uses, so any open `<ThemeToggle />` updates without a refresh.

## Privacy

The extension is **telemetry-free**. It reads only from pages you have open in DevTools and never sends data anywhere. No network requests. No analytics. The minimum-permissions manifest declares ZERO host permissions and ZERO `permissions:` — Chrome grants `inspectedWindow.eval` automatically when DevTools is open, no broader access needed.

## Architecture

```
devtools/
├ manifest.json          # Manifest V3
├ devtools.html          # Hidden host frame; loads devtools.js
├ panel.html             # The panel UI (loads panel.js + panel.css)
├ src/
│  ├ devtools.ts         # Registers the panel
│  ├ shared/
│  │  ├ types.ts         # PageState shape
│  │  └ inspector.ts     # Stringified function evaluated in the page
│  └ panel/
│     ├ panel.ts         # Panel UI, vanilla DOM
│     └ panel.css
├ icons/                 # 16/48/128 PNGs (placeholder)
├ build.mjs              # esbuild bundler
├ package.mjs            # zip the extension for upload
└ tsconfig.json
```

Bundle sizes (minified):

| File | Size |
|---|---|
| `out/devtools.js` | ~0.5 KB |
| `out/panel.js`    | ~9 KB   |
| `out/panel.css`   | ~3 KB   |

## Roadmap (v0.2)

- **Live token edit**: click a token value → input appears → page updates as you type.
- **Conflict detection**: highlight elements whose `tl*` classes set the same property.
- **History view**: time-travel between dark/light/theme combinations to compare layouts.
- **Component map**: pair atomic classes with the React component name from React DevTools (cross-extension cooperation).
- **Firefox port**: WebExtensions browser API is mostly compatible; the only blocker is the build entry point.

## License

MIT.
