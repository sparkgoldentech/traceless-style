# CLI

`traceless-style` ships a single binary. Use it through `npx` so it
resolves the local install regardless of whether your shell has the
npm bin path on `PATH`:

```bash
npx traceless-style                    # extract once (production)
npx traceless-style --watch            # extract + watch
npx traceless-style --dev              # pretty CSS with source comments
npx traceless-style --fix-contrast     # interactive AAA-grade auto-fix prompt

npx traceless-style init               # zero-config scaffolder
npx traceless-style dev                # extract + watch + spawn framework dev server
npx traceless-style build              # extract + spawn framework build
npx traceless-style audit              # repo-wide stats
npx traceless-style inspect <file>     # describe one file's usage
```

`PATH` note: on a fresh install (especially Windows / PowerShell), the
bare `traceless-style` command isn't on `PATH`. Use `npx`, an npm
script (`npm run dev` / `npm run build`), or install globally with
`npm i -g traceless-style`.

## Subcommands

### `extract` (default)

```bash
npx traceless-style                       # production extract
npx traceless-style --watch               # watch mode
npx traceless-style --dev                 # dev mode (pretty CSS + source comments)
npx traceless-style --parser=swc          # force SWC parser
npx traceless-style --parser=legacy       # force legacy parser
npx traceless-style --fix-contrast        # interactive contrast fix
npx traceless-style --no-fix-prompt       # CI: never prompt, just print
```

What it does, in order:

1. Loads `traceless-style.config.js` from the cwd if present. (None is
   required — defaults are strict-by-default.)
2. Walks `srcDir` (default: union of `src/` and `app/` that exist).
   File order is sorted explicitly so byte output is deterministic
   across machines.
3. Runs **lint** (strict-by-default rules) on every `.tsx` / `.jsx`.
   Aborts on errors with exit code `1`.
4. **Pass 0**: scans for `tl.defineTokens` / `tl.createTheme` exports
   so cross-file token references resolve regardless of file order.
5. **Pass 1**: scans for `tl.extend({ variants })` calls; merges them
   over the built-in variants.
6. **Pass 2**: walks every file with the full variant map, transforms
   each `tl.create(...)` argument into class-name strings, registers
   atomic rules.
7. Writes `public/traceless-style.css` (or `static/traceless-style.css`
   for SvelteKit). Also writes `.traceless-style/class-meta.json` for
   `tl.merge()`'s last-wins resolution.
8. Reports any remaining contrast issues. If `contrast.strict: true`
   (the default) and there are errors, exits with code `1` before any
   framework hand-off.

### `init`

```bash
npx traceless-style init                       # zero-config scaffold
npx traceless-style init --with-config         # also write a config.js stub
npx traceless-style init --no-extract          # skip the initial extraction
```

Detects the framework (Next, Vite, Remix, Astro, SvelteKit, Qwik,
Solid, plain HTML) and:

- Adds `dev` / `build` scripts to `package.json`. Existing scripts
  that match a known safe pattern (`next dev`, `vite`, `astro dev`,
  etc.) or that already invoke our CLI (`node .../extract.mjs`,
  `traceless-style ...`, `npx traceless-style ...`) are rewritten to
  the canonical `traceless-style dev` / `traceless-style build`.
- Pre-creates `public/traceless-style.css` (or the framework's
  equivalent path) as an empty stub so framework imports never 404.
- Wires the framework's layout / entry point:
  - **Next.js** App Router: imports `<TracelessRoot />` and the CSS
    file in `app/layout.tsx`, inserts `<TracelessRoot />` inside
    `<head>`.
  - **Remix**: adds a `LinksFunction` export with the stylesheet
    link, plus `<TracelessRoot />` in `<head>`.
  - **Astro**: adds the CSS import to the layout's frontmatter.
  - **SvelteKit**: adds the CSS import to `+layout.svelte`'s `<script>`.
  - **Vite / Qwik / Solid**: adds the CSS import to the entry file.
- Recommends the [VS Code extension](../integrations/vscode.md) via
  `.vscode/extensions.json`.
- Runs an initial extraction so the CSS file is populated before
  `npm run dev`. Skip with `--no-extract` for fresh-scaffold scenarios
  where the source tree isn't authored yet.
- Writes `traceless-style.config.js` **only when `--with-config` is
  passed**. The library's defaults are strict-by-default — most
  projects need no config file at all.

Idempotent — running it twice never duplicates imports or rewrites
custom scripts.

### `dev`

```bash
npx traceless-style dev [extra args passed to framework]
```

1. Runs the full scan (lint + parse + contrast). Halts before the
   framework starts if any errors surface.
2. (TTY only) prompts the interactive contrast fix when there are
   fixable accessibility issues; see `--fix-contrast` below.
3. Spawns the framework's dev server (`next dev`, `vite`, `astro dev`,
   `remix dev`, …). Detected from `package.json` dependencies.
4. Watches source files in parallel; re-extracts on change. Watch
   re-extracts are silent and skip lint to keep HMR snappy.

### `build`

```bash
npx traceless-style build [extra args passed to framework]
```

Same as `dev` minus the watcher. Hard-fails on:

- Any lint error (`TLS0401`–`TLS0404`).
- Any parse / property-allowlist / variant error.
- Any contrast error when `contrast.strict: true` (the default).

The framework build is **never** invoked when traceless-style errors
exist. CI gets a clean exit code `1`.

### `audit`

```bash
npx traceless-style audit
```

Repo-wide statistics. Prints:

- File count scanned.
- Total atomic rules emitted.
- Number of tokens, themes, keyframes registered.
- Deduplication ratio (rules emitted / unique property:value pairs).
- Top 20 selectors by usage count.
- Custom variants discovered.
- CSS bundle size + gzip estimate.

Useful in CI to catch CSS-size regressions:

```yaml
# .github/workflows/audit.yml
- name: Audit CSS
  run: |
    npx traceless-style audit
    if [[ $(wc -c < public/traceless-style.css) -gt 102400 ]]; then
      echo "CSS exceeds 100 KB threshold"
      exit 1
    fi
```

### `inspect <file>`

```bash
npx traceless-style inspect app/Button.tsx
```

Describes one file's usage — every atomic rule grouped by source key,
all tokens / themes / keyframes registered process-wide, and the
custom variants the file references. Useful for "why is this class
showing up?" investigations.

## Flags

### Extraction flags

| Flag | Effect |
|---|---|
| `--watch` | Watch source files; re-extract on change. Default debounce 150 ms. |
| `--dev` | Dev mode: pretty CSS output with source-comment annotations. |
| `--parser=swc` | Force the SWC-backed extractor. |
| `--parser=legacy` | Force the legacy text-mode extractor. |

### Contrast auto-fix flags

| Flag | Effect |
|---|---|
| `--fix-contrast` | Force the interactive prompt even when CI / non-TTY heuristics would skip it. Useful when wrapping the CLI in another tool. |
| `--no-fix-prompt` | Explicitly opt out of the prompt. Equivalent to `CI=true` for this run. |

The interactive auto-fix is described in detail in
[WCAG contrast validation](../learn/13-wcag-contrast.md#interactive-auto-fix).
In short: when the CLI has a TTY (and `CI` is not set), it walks
through every fixable contrast issue, shows the current ratio /
APCA Lc / suggested replacement, and lets you accept (`Y` / Enter),
skip (`N`), apply-all (`A`), or quit (`Q`). Suggestions target
**WCAG AAA** (the highest accessibility tier) and use OKLCH-space
search to preserve the original hue.

### Init flags

| Flag | Effect |
|---|---|
| `--with-config` | Scaffold a `traceless-style.config.js` populated with the library's strict-by-default values. |
| `--no-extract` | Skip the initial extraction at the end of init. |

## Environment variables

| Variable | Effect |
|---|---|
| `TRACELESS_STYLE_PARSER` | Force parser globally: `swc` or `legacy`. Same effect as `--parser=`. |
| `TRACELESS_STYLE_DEBUG_RESOLVE` | When `1`, prints the cross-file token export registry after Pass 0. Useful for debugging "my `import { tokens } from '@/theme'` isn't expanding." |
| `TRACELESS_STYLE_LOG` | Set log verbosity: `silent`, `error`, `warn`, `info` (default), `debug`, `trace`. |
| `TRACELESS_STYLE_LOG_FORMAT` | `text` (default when TTY) or `json` (default in CI — machine-readable lines for log shippers). |
| `TRACELESS_STYLE_LOG_COLOR` | `auto` (default), `always`, `never`. The standard `NO_COLOR` env var is also honored. |
| `CI` | When truthy, disables ANSI color, forces JSON log format, and suppresses the interactive contrast-fix prompt. Set automatically by GitHub Actions, GitLab CI, CircleCI, and most CI systems. |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Lint errors, parse errors, property-allowlist errors, or contrast errors with `strict: true`. |

The build process never exits with codes other than `0` or `1` —
unhandled exceptions inside the compiler are caught and surface as
exit `1` with the stack trace on stderr.

## Programmatic API

The same extraction logic is exposed as a function:

```ts
import { extract } from "traceless-style/cli";

const result = await extract({
  srcDir:    ["src", "app"],
  outCSS:    "public/traceless-style.css",
  outMeta:   ".traceless-style/class-meta.json",
  dev:       false,
  silent:    false,
  lint:      { noInlineStyles: true },        // or `false` to skip
  parser:    "auto",                          // "auto" | "legacy" | "swc"
  cache:     true,
  contrast:  { level: "AA", strict: true },
});

console.log(`Emitted ${result.rules} rules across ${result.files} files`);
```

Returns a `{ rules, bytes, files, errors, warnings }` summary. Errors
contain stable `tlsCode` identifiers (see [Diagnostic codes](../reference/diagnostic-codes.md)).

## Output files

| Path | Purpose |
|---|---|
| `public/traceless-style.css` | Atomic rules, tokens, themes, keyframes. (`static/traceless-style.css` for SvelteKit.) |
| `public/traceless-style.css.map` | v3 source map. |
| `.traceless-style/class-meta.json` | Class-name → property mapping. Used by `tl.merge()` for last-wins resolution. |
| `.traceless-style/cache.json` | File-level extraction cache. Skipped for files using `tl.keyframes` / `tl.defineTokens` / `tl.createTheme` (their side effects can't be replayed from cache). |

`.traceless-style/` is a build artifact — gitignore it.

## Watch-mode performance

Watch re-extracts run **silently** and **skip lint** to keep HMR
snappy. The full scan (lint + extract + contrast) only runs on the
**initial** dev startup and on every `build`. If you want lint /
contrast feedback for every save, add an editor integration: the
[VS Code extension](../integrations/vscode.md) runs the same checks
inline as you type.

## Telemetry

None. No analytics, no remote calls, no opt-in/opt-out. The CLI
writes to stdout/stderr only.
