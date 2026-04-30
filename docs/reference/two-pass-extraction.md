# Two-pass extraction

Most build-time CSS-in-JS libraries do one sweep over the source code and call it done. traceless-style does **three** — Pass 0, Pass 1, Pass 2 — because some calls reference state defined in *other* files.

## The passes

### Pass 0: Token discovery (read-only)

For each file in `srcDir`, scan for top-level `tl.defineTokens({...})` calls (and `export ... defineTokens` / `export default defineTokens` forms). Register the resulting nested-shape into `tokenExportRegistry[file][exportName]`.

Why this needs to come first: file processing order is **not deterministic**. If `Card.tsx` references `tokens.brand.primary` from `theme/tokens.ts`, `theme/tokens.ts` might not have been processed yet when we hit `Card.tsx`. Pass 0 ensures every export is registered before any consumer is processed.

```ts
// theme/tokens.ts
export const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
// → tokenExportRegistry.set("/abs/path/theme/tokens.ts", "tokens", { brand: { primary: "..." } })
```

### Pass 1: Custom variant discovery

For each file, find every `tl.extend({ variants: {...} })` call and merge the discovered variants into a single map. Built-in variants are merged in too (with `mergeVariants(custom)`).

This is why **no central config file is needed for custom variants** — they're discovered from source. The result is a flat `Record<string, string>` of variant key → CSS selector.

```ts
// app/variants.ts
tl.extend({ variants: { _tablet: "@media (min-width: 900px)" } });

// → customVariants["_tablet"] = "@media (min-width: 900px)"
```

### Pass 2: Full transformation

For each file:

1. Read source text.
2. Parse imports → resolve token shapes via `tokenExportRegistry` + tsconfig path aliases.
3. **Preprocess**:
   - Replace `tl.cssVar("name")` with literal `"var(--tl-<hash>)"`.
   - Replace `<localTokenName>.x.y.z` member access with literal `"var(--tl-<hash>)"` — **but only inside `tl.create` argument bodies**, never globally. Function parameters named `tokens` are safe.
4. Parse the (preprocessed) `tl.create` arg with the strict literal-only AST parser.
5. Walk the style tree:
   - Validate property against allowlist.
   - Validate value (injection guard, Unicode guard, control-char guard).
   - Apply auto-RTL.
   - Hash → register atomic rule.
   - Apply auto-dark.
6. WCAG contrast audit per group.
7. Rewrite the call site to a literal `{ key: "tla1b2c3d4 …" }` object.

## Why three passes instead of one

The naive "one pass" approach fails for cross-file token references because:

- Files process in walk order (alphabetical, or whatever the bundler chooses).
- A file at the top of the alphabet might import from one further down.
- Without pre-scanning, we'd have to fall back to "string contains `tokens.brand.primary`?" heuristics — error-prone and resolver-blind.

The three-pass approach trades some startup time for correctness:

- Pass 0 is **fast** (scan-and-register, no transformation).
- Pass 1 is **fast** (find one specific call shape, build a map).
- Pass 2 is the actual work.

For 5,000 files, total extraction takes ~95 ms with SWC, dominated by Pass 2.

## File-level cache

Pass 2 results are cached in `.traceless-style/cache.json`, keyed by SHA-256 of the source. Pass 0 and Pass 1 always run (they're cheap) — but Pass 2's per-file output is reused if the source hash matches.

Cache version: `v3-keyframe-bindings`. Bumped when the cache shape changes, invalidating all entries.

**Excluded from caching**: files that contain `tl.keyframes`, `tl.defineTokens`, or `tl.createTheme`. These are side-effecting (they register entries into the global registry), and replaying their cached transformation skips that registration. To ensure correctness, those files always re-run Pass 2.

## Watch mode

When a source file changes:

1. Re-run Pass 0 on that file (in case `defineTokens` exports changed).
2. Re-run Pass 1 on that file (in case `tl.extend` variants changed).
3. Re-run Pass 2 on that file.
4. Regenerate `traceless-style.css`.

If a `defineTokens` export changes, every consumer file is re-transformed (cache invalidated by the changed token hash). The cache key includes Pass 0 state, so this happens automatically.

## Singleton clearing

`extract-fn.ts` calls `globalRegistry.clear()` and `tokenRegistry.clear()` at the start of every full extraction run. This prevents stale rules from accumulating across runs (notably during webpack rebuilds, where the same Node process serves multiple builds).

If you write a new entrypoint that bypasses `extract-fn.ts`, clear them yourself.

## See also

- [The compiler](../learn/11-the-compiler.md)
- [Cross-file token resolution](./cross-file-resolution.md)
