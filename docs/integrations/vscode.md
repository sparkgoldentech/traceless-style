# VS Code extension

![The traceless-style VS Code extension showing autocomplete, hover docs, and inline color swatches inside a tl.create block](/images/vs-code-extention.png)

The traceless-style VS Code extension lights up `tl.create`, `tl.keyframes`, `tl.extend`, `tl.defineTokens`, and `tl.createTheme` calls with autocomplete, hover docs, color swatches, diagnostics, and quick-fixes.

## Features

### Autocomplete

- 280+ CSS properties (matching the runtime allowlist).
- Per-property values (e.g. `display:` suggests `flex | grid | block | …`).
- 60+ variant keys with snippets (`_hover`, `_focus`, `_dark`, breakpoints, etc.).
- Token member access: typing `tokens.` shows every leaf path from your `defineTokens` shape.

### Hover docs

- CSS property summaries + MDN links.
- Variant selector explanation (e.g. `_dark` → `:is(.dark *)` — "applies in dark mode").
- Inline color swatch with RGB triplet.

### Color swatches

Hex, `rgb()`, `rgba()`, `hsl()`, `hsla()` values get an inline color picker. Picking a color replaces the value while preserving the original format (you stay in hex if you started in hex).

### Diagnostics

- Unknown properties with "Did you mean…" hint.
- Non-literal values (variables, function calls).
- Suspicious values (control chars, bidi Unicode, CSS-injection sequences).
- Tailwind utility class detection in `className=` strings.

### Quick-fixes

- Replace unknown property with closest match (Levenshtein-ranked).
- Convert inline `style={{}}` to `tl.create` (best-effort).

### Outline / breadcrumb

Every `tl.create` key, `tl.keyframes` animation, and variant block appears as a nested child in the file outline. Cmd/Ctrl-click to jump.

### Snippets

| Prefix | Expands to |
|---|---|
| `tlc` | `const $ = tl.create({ key: { … } });` |
| `tlk` | `const $name = tl.keyframes("name", { from: { … }, to: { … } });` |
| `tlx` | `tl.extend({ variants: { _name: "selector" } });` |
| `tlt` | `const tokens = tl.defineTokens({ … });` |
| `tlth` | `const $theme = tl.createTheme("name", { … });` |
| `tldark` | `_dark: { … }` |
| `tlhover` | `_hover: { … }` |
| `tlnoRtl` | `_autoRtl: false,` |
| `tlnoDark` | `_autoDark: false,` |
| `tlvar` | `tl.cssVar("…")` |

### Command: Sort tl.create keys

Right-click → "Sort tl.create keys" alphabetizes properties and pushes variants (`_hover`, `sm`, etc.) to the bottom of each group.

## Settings

| Setting | Default | Description |
|---|---|---|
| `traceless-style.enable` | `true` | Enable the extension globally. |
| `traceless-style.diagnostics` | `true` | Emit lint/property diagnostics. |
| `traceless-style.identifierAliases` | `["tl"]` | Aliases the extension treats as `tl`. Add e.g. `["tl", "$$"]` if you do `import { tl as $$ }`. |

## Scoping

Features activate **only inside `tl.<method>(...)` calls** — you can keep the extension installed without it interfering with non-traceless code. A regex+AST hybrid scanner identifies the call boundaries.

## Where to install

Search for "traceless-style" in the VS Code Marketplace, or:

- **VSIX:** `extension/` directory in the monorepo, run `npm run package` to build.
- **Marketplace ID:** `sparkgoldentech.traceless-style`

## See also

- `extension/README.md` for full feature list and changelog.
- [DevTools browser extension](./devtools.md) for runtime inspection.
