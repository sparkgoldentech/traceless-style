# Cross-file token resolution

Tokens defined in one file work in another. This page documents every supported import form and the resolver rules.

## Supported import forms

| Form | Example | How it resolves |
|---|---|---|
| Named relative | `import { tokens } from "./theme"` | Direct lookup against the file's exports |
| Named with rename | `import { tokens as t } from "./theme"` | `t` becomes the local name |
| Namespace | `import * as M from "./theme"` | Synthesizes `{ exportName: shape }` from every named export of the file (recursively across `export *`) |
| Default identifier | `import T from "./theme"` (where the file has `export default tokens`) | Resolves the `default` export — registered when `export default tokens;` is detected |
| Default object | `import M from "./theme"` (where the file has `export default { tokens }`) | Synthesizes a default shape with `tokens` as a key |
| Path-aliased | `import { tokens } from "@/theme"` | Applies `tsconfig.json compilerOptions.paths` rules (wildcards + exact) before file-system lookup |
| Bare specifier | `import { tokens } from "@my-org/design-tokens"` | Falls back to `require.resolve()` against the project's `node_modules` |
| Re-export named | `export { tokens } from "./theme"` | Recursive `resolve()` follows the chain |
| Re-export renamed | `export { tokens as themeTokens } from "./theme"` | Chain follows the original name `tokens` |
| Re-export star | `export * from "./theme"` | Every export from the source becomes a virtual export of the re-exporter (cycle-safe) |
| Deferred export | `const tokens = ...; export { tokens };` | Second-pass scan promotes the local binding |
| Default from binding | `const tokens = ...; export default tokens;` | Registered as the `default` export |

## File-system lookup order

For a relative import `./theme`, the resolver tries:

1. `./theme.ts`
2. `./theme.tsx`
3. `./theme.js`
4. `./theme.jsx`
5. `./theme/index.ts`
6. `./theme/index.tsx`
7. `./theme/index.js`
8. `./theme/index.jsx`

First match wins.

## Path aliases

The resolver reads `tsconfig.json compilerOptions.paths` and applies wildcard substitution:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*":      ["src/*"],
      "@theme":   ["src/theme/index.ts"],
      "@ui/*":    ["packages/ui/src/*"]
    }
  }
}
```

Then `import { tokens } from "@/theme/tokens"` resolves to `src/theme/tokens.ts`.

The tsconfig parser is **string-aware** (`stripJsonComments` in `extractor.ts`). A regex-only stripper miscounts strings whenever a glob like `"**/*.ts"` appears in the JSON — the `*/` substring inside a string literal looks like a block-comment closer.

## Bare specifiers

If the import isn't relative and doesn't match a path alias, the resolver falls back to `require.resolve()`:

```ts
import { tokens } from "@my-org/design-tokens";
// → Node's standard module resolution against the project's node_modules
```

This works for monorepo packages, npm-published token packages, etc.

## Cycle safety

`export * from "./a"` in `b.ts` and `export * from "./b"` in `a.ts` is a cycle. The resolver tracks visited specifiers to break the cycle (a re-encountered file is treated as having no further exports for the recursion).

## Member access expansion

Inside each `tl.create` argument body (and **only** there), the preprocessor walks the AST/text and rewrites:

```ts
tokens.brand.primary
```

…to:

```ts
"var(--tl-aaaaaaaa)"
```

…where the hash is `fnv32a("token:brand-primary")` — the same hash `defineTokens` computed when emitting the `:root` rule.

The rewrite is **scoped** to `tl.create` args so that:

- A function parameter named `tokens` is not rewritten.
- A local variable named `tokens` (from a different module) is not rewritten unless it's the imported one.
- Comments / strings / template literals containing `tokens.x.y` are unaffected.

## Diagnostic

When debugging "my token isn't expanding," set the env var:

```bash
TRACELESS_STYLE_DEBUG_RESOLVE=1 npx traceless-style
```

This prints the contents of `tokenExportRegistry` after Pass 0 — every file path, every exported binding, every nested shape. Common findings:

- The file isn't in `srcDir` (typo, or `srcDir` doesn't include it).
- The export is missing the `export` keyword (`const tokens = ...` without export).
- The path alias maps to a different folder than you expected.
- A re-export chain breaks at a non-traceless-style file (the resolver can't follow it because it doesn't have a `tl.defineTokens` call).

## Implementation pointers

- Resolver entry: `src/compiler/extractor.ts` `resolveImport(specifier, fromFile)`.
- Registry: `src/compiler/tokens.ts` `tokenExportRegistry` + `setResolver(...)`.
- Per-file scan: `src/compiler/extractor.ts` `parseFileImports(src, file)`.
- Rewrite: `src/compiler/extractor.ts` `expandTokenMemberAccess(...)`.

## See also

- [Design tokens & themes](../learn/06-tokens-and-themes.md)
- [Two-pass extraction](./two-pass-extraction.md)
