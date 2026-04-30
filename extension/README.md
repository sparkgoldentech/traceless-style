# traceless-style for VS Code

IDE-grade support for [traceless-style](https://github.com/sparkgoldentech/traceless-style) — zero-runtime atomic CSS-in-JS.

## Features

### Autocomplete
- **CSS property names** inside `tl.create({...})`, `tl.keyframes({...})`, and `tl.extend({...})`. ~280 properties from the library's own allowlist.
- **Per-property values**: type `display: ` and pick `flex`, `grid`, `inline-block`, etc. from a curated list. Values are auto-quoted.
- **Variant keys**: `_dark`, `_hover`, `_focus`, `_active`, `_disabled`, `_hoverFocus`, `_first`/`_last`/`_odd`/`_even`, `_mobile`/`_tablet`/`_widescreen`, plus `_autoDark` / `_autoRtl` opt-out controls. Snippets expand to `_dark: { $0 }` with the cursor inside.
- **Keyframe stops** at the top level of `tl.keyframes`: `from`, `to`, `0%` … `100%`.
- **Smart sorting**: typing `_` puts variants on top; typing a letter puts CSS properties on top. The first match is auto-selected.

### Hover documentation
- **CSS properties**: short summary + MDN reference link.
- **Variant keys**: explanation + the actual selector the compiler generates (`_dark` → `:is(.dark *)`, etc.).
- **Color literals**: hex, `rgb()`, and `rgba()` resolve to a readable RGB triplet so you can sanity-check translucent values without doing math.

### Inline color swatches & picker
- Colored squares next to every `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()` literal inside `tl.create`.
- Click any swatch → native VS Code color picker.
- Format-preserving: pick a new color and the original notation (hex / rgb / hsl) is offered first.

### Diagnostics (inline squigglies)
- **Unknown CSS properties** (`colour: "red"`) — error with "Did you mean: color" hint, scoped quick-fix to replace it.
- **Non-literal values** (`color: someVar`) — error matching the library's strict literal-only AST parser.
- **Suspicious values** (`;`, `}`, `</`, `*​/`, bidi/control chars) — flagged warnings the library's CSS-injection guard would also reject.
- Debounced (~250ms) so they don't fight your typing rhythm.

### Quick-fix code actions
- Right-click a squiggle / `Ctrl+.` → one-click "Replace with `<closest-name>`" for unknown-property errors. Up to 3 suggestions ranked by edit distance.

### Outline / breadcrumb
- Every `tl.create({...})` group key shows up in the outline view (`Ctrl+Shift+O`) and in the breadcrumb at the top of the editor.
- `tl.keyframes` calls show their animation name (`tl.keyframes: fadeIn`).
- Variant blocks (`_dark`, `_hover`, …) appear as nested children under their parent rule.

### Snippets

Type one of these in any TypeScript / JavaScript file and press Tab:

| Prefix | Expands to |
|---|---|
| `tlc` | `const $ = tl.create({ … })` boilerplate |
| `tlk` | `tl.keyframes("name", { from: {...}, to: {...} })` |
| `tlx` | `tl.extend({ variants: { … } })` |
| `tlt` | `tl.defineTokens({ … })` |
| `tlth` | `tl.createTheme("name", { … })` |
| `tldark` | `_dark: { … }` block |
| `tlhover` | `_hover: { … }` block |
| `tlnoRtl` | `_autoRtl: false,` opt-out |
| `tlnoDark` | `_autoDark: false,` opt-out |
| `tlvar` | `tl.cssVar<TokenKeyOf<typeof tokens>>(...)` typed token reference |

### Commands

In the command palette (`Ctrl+Shift+P`):

- **traceless-style: Sort tl.create keys at cursor** — alphabetizes properties in the enclosing `{...}` block. Variant keys (`_dark`, `_hover`, …) are pushed to the bottom for readability.

### Smart scoping

Every feature only activates **inside** `tl.<method>(...)` calls. Outside that scope, the editor's normal TypeScript IntelliSense, hover, etc. are unchanged. No pollution.

## Install

From the marketplace:

```
ext install sparkgoldentech.traceless-style-vscode
```

Or build locally:

```bash
git clone https://github.com/sparkgoldentech/traceless-style
cd traceless-style/extension
npm install
npm run build
# Then open this folder in VS Code and press F5 to launch the Extension Development Host.
```

## Settings

| Setting | Default | What it does |
|---|---|---|
| `traceless-style.enable` | `true` | Master switch — disables every provider in this extension. |
| `traceless-style.diagnostics` | `true` | Toggles inline error/warning squigglies (other features stay on). |
| `traceless-style.identifierAliases` | `["tl"]` | Identifiers the extension treats as the traceless-style API root. Add `"t"` if you `import { tl as t }`. |

## Roadmap

- **TypeScript-AST mode**: replace the regex scope detector with a real `typescript` AST walk for handling destructured imports + JSX-prop styling.
- **Definition provider**: `Ctrl+click` on `$.btn` → jump to the `tl.create({ btn: ... })` declaration.
- **Cross-file token hover**: hover on `tokens.brand.primary` → resolved color value pulled from the source `tl.defineTokens` call.
- **Format-on-save** (opt-in): apply `Sort tl.create keys` automatically.
- **Codemod commands**: convert `style={{...}}` → `tl.create`, convert Tailwind classes → `tl.create`.

## Development

```bash
npm install         # install dev deps (vscode types, esbuild, tsx)
npm run dev         # watch mode — esbuild rebuilds the bundle on save
npm test            # unit + integration tests via node:test (no vscode needed)
npm run package     # build a .vsix for distribution
```

The bundle is ~40KB minified. Tests cover the scope detector, completion provider, color provider, hover provider, diagnostic provider, code-action provider, and document-symbol provider — they mock the small `vscode` API surface and drive the providers against real source.

## License

MIT.
