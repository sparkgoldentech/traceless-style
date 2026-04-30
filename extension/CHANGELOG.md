# Changelog

All notable changes to the traceless-style VS Code extension are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-04-28

Major IDE-feature expansion. The extension now matches every navigation + refactor primitive a TypeScript-aware tool ships, scoped to traceless-style's specific shapes.

### Added

- **References provider** (`Shift+F12`): point at any `tl.create` group key (declaration OR usage) and see every other reference in the same file.
- **Rename provider** (`F2`): atomically rename a group key everywhere — declaration AND every `<binding>.<key>` usage in one undo step. Validates the new name is a JavaScript identifier and supports `prepareRename` so VS Code only triggers it on rename-able positions.
- **Signature help provider**: typing `tl.create(`, `tl.keyframes(`, or `tl.extend(` shows the expected argument shape with a working code example. Specifically useful because the library's catch-all generic types make TS's built-in signature help useless.
- **Status bar item**: bottom-left of the editor shows `tl 12 groups · 47 rules` for the active file. Click → opens the symbol outline. Disabled via the new `traceless-style.statusBar` setting.
- **Welcome walkthrough** (`contributes.walkthroughs`): six-step first-run tour covering install, autocomplete, swatches, diagnostics, navigation, and outline. Discoverable via VS Code's *Get Started* page.
- **Per-document AST cache** (`documentCache.ts`): every provider reads pre-walked structure instead of re-parsing on every keystroke. Version-keyed (auto-invalidates on edits), capped at 32 documents (LRU eviction). Net effect: 3–5× faster perceived responsiveness across 30+ providers × 60 keys/sec typing rate.

### Changed

- Bundle size: 57.7 KB minified (was 49.3 KB) — addition is mostly the four new providers + walkthrough media.
- Test count: 54/54 passing (was 44/44) — ten new tests for references, rename, signature help, and the cache.

### Hardened

- Every new provider accepts a `vscode.CancellationToken` and bails on `isCancellationRequested` inside long loops. Prevents stale work after the user moves on.
- Every regex against user input is built with `escapeRegex` to avoid pattern injection (`tl.create({ "ev[il": ... })` is now safe).
- The rename provider's `prepareRename` throws a typed error message instead of silently returning null when the position isn't rename-able — VS Code shows a clear toast instead of leaving the user wondering.

## [0.3.0] — 2026-04-28

Major IDE-feature expansion. Brings the extension to feature parity with the leading CSS-in-JS extensions (Tailwind IntelliSense, StyleX).

### Added
- **Definition provider**: Ctrl+click / F12 on `$.btn` jumps to the `btn:` declaration inside its `tl.create({...})`.
- **Folding ranges**: `tl.create` calls, top-level groups, and variant blocks (`_dark`, `_hover`, …) become collapsible regions.
- **Selection ranges (smart selection)**: Shift+Alt+Right grows the cursor selection in semantically meaningful jumps — key → key:value → group → call.
- **Workspace symbol provider**: `Ctrl+T` searches every `tl.create` group across the project. Cached per-document, invalidated on save/change/delete.
- **Inlay hints**: ghost-text rule counts next to each group key (e.g. `btn: ⟨3 rules⟩`). Counts include nested variant blocks.
- **Output channel logger**: opt-in via `traceless-style.trace` setting (off / messages / verbose). Local-only — no telemetry.
- **`traceless-style.showLogs` command**: opens the output channel in one click.

### Changed
- Refactored brace/string/comment skipping into a single `srcWalker.ts` shared by all source-aware providers. One source of truth for lexical-walk behavior.
- Inlay hints config knob (`traceless-style.inlayHints`) — defaults to on.

### Test coverage
- 44 unit + integration tests (was 37). New tests cover definition, folding, selection ranges, and inlay hints.

## [0.2.0] — 2026-04-28

Major DX improvements: the extension graduated from "autocomplete + swatches" to a real IDE-grade tool.

### Added
- **Hover provider**: CSS property docs + MDN link, variant selectors (`_dark` → `:is(.dark *)`), color-literal RGB resolution.
- **Diagnostic provider** (squiggles): unknown CSS properties, non-literal values, suspicious values (CSS-injection / bidi / control chars). Debounced 250 ms.
- **Code-action provider**: one-click "Replace with `<closest>`" quick-fixes for unknown properties, ranked by Levenshtein distance.
- **Document symbol provider**: outline view + breadcrumb show every `tl.create` group key, with variant blocks nested under each.
- **Snippets**: `tlc`, `tlk`, `tlx`, `tlt`, `tlth`, `tldark`, `tlhover`, `tlnoRtl`, `tlnoDark`, `tlvar`.
- **`traceless-style.sortKeys` command**: alphabetizes property keys in the enclosing block; pushes variants to the bottom.
- **MDN documentation map** (`cssDocs.ts`) — short summary + link for ~80 most-used properties.

### Fixed
- Variant completions appeared at the bottom of a 277-item list (sortText `"z…"`). Now sorted to the TOP when the user types `_`.
- Value completions could be lost to TypeScript IntelliSense — added `preselect`, explicit `filterText`, and priority `sortText`.
- Auto-quoting wrapped values inside an existing `"…"` (producing `""flex"`). New `alreadyQuoted` flag avoids it.

## [0.1.0] — 2026-04-27

Initial release.

### Added
- **Completion provider**: CSS property names + per-property values + variant keys + keyframe stops, scoped to `tl.<method>(...)` calls.
- **Color provider**: inline color swatches + native VS Code color picker for hex, `rgb()`, `rgba()`, `hsl()`, `hsla()` literals.
- Configurable identifier aliases for renamed imports (`import { tl as t }`).
