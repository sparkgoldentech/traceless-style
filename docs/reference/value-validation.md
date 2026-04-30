# Defense-in-depth value validation

traceless-style validates property values at three layers. Even if a future bug in one layer let something through, the next layer catches it. This page documents what each layer checks.

## Layer 1: Strict literal-only AST parser

Source: `src/compiler/ast-parser.ts`.

The parser for `tl.create({...})` arguments accepts only:

- Object literals
- String literals (single, double, or backtick — but backtick is treated as a literal string, not a template)
- Number literals
- Boolean literals (only for `_auto*` control keys)

It rejects:

- Variables (`{ color: x }`)
- Function calls (`{ color: f() }`)
- Template substitutions (`` { color: `${x}` } ``)
- Array spreads (`{ ...a }`)
- Computed keys (`{ [k]: v }`)

This is the first defense. By the time we get to layer 2, we know every value is a string or a number directly from source.

## Layer 2: Property allowlist

Source: `src/compiler/css-properties.ts`.

`isKnownProperty(prop)` accepts:

- ~250 standard CSS properties (curated list).
- CSS variables: `/^--[a-zA-Z][a-zA-Z0-9-]*$/`.
- Vendor prefixes: `webkitFoo`, `mozBar`, `-webkit-foo`, `-moz-bar`, etc.

Anything else is rejected with a Levenshtein-suggested replacement:

```
✗ Unknown CSS property 'colour' — did you mean 'color'?
```

This catches typos, prevents random keys from being injected as raw CSS, and ensures the emitted CSS only contains real declarations.

## Layer 3: Value injection guard

Source: `src/compiler/css-gen.ts` `isValidRule(prop, value)`.

For every value (after layers 1 and 2 pass), the guard rejects:

### CSS-injection sequences

| Char | Why rejected |
|---|---|
| `;` | Could terminate the current declaration and inject a new one |
| `}` | Could close the current rule and open another |
| `<` `>` `</` | HTML-tag characters — could indicate JSX leak or template-literal injection |
| `*/` | Could close a CSS block comment that wraps the rule |
| `\\\\` (literal backslash-backslash) | CSS-escape sequence — used in some bypass attempts |

### Invisible / bidi Unicode

Standard homoglyph and exfil mitigations. Rejected:

- ZWSP (`U+200B`), ZWNJ (`U+200C`), ZWJ (`U+200D`)
- LRM (`U+200E`), RLM (`U+200F`)
- LRE / RLE / PDF / LRO / RLO (`U+202A`–`U+202E`)
- LRI / RLI / FSI / PDI (`U+2066`–`U+2069`)
- BOM (`U+FEFF`)

### ASCII control characters

`U+0000`–`U+001F` (except `\t`, `\n`, `\r`) and `U+007F` (DEL).

## Why three layers

The realistic threat model is **not** a malicious developer trying to inject CSS — anyone with commit access can already do whatever they want. The threats are:

1. **Accidents.** A typo in a property name or a stray copy-paste of HTML into a value.
2. **Supply chain.** A compromised dependency that emits a `tl.create` call with a malicious value as part of a token (token values are ostensibly literal strings — but who validates them?).
3. **Future regressions.** Someone refactors the AST parser and inadvertently makes it accept template literals; the property allowlist might stop a typo'd property name; the value guard then catches the resulting injection attempt.

Each layer is cheap (a regex test, a hash lookup), so running all three on every value is essentially free.

## What's allowed

The guard is **literal-allowlist-conservative**, not "best effort sanitization." It rejects rather than escapes. If you need a value that contains a forbidden character (e.g. a Unicode bullet `•` in `content`), use the CSS escape:

```ts
{ content: '"\\2022 "' }      // bullet (U+2022) via CSS escape
```

CSS escapes (`\hh` or `\hhhh ` with a trailing space) pass through unchanged — they're string content from the parser's perspective.

## Implementation pointers

- Layer 1: `src/compiler/ast-parser.ts` and the AST-walker in `src/compiler/extractor-swc.ts`.
- Layer 2: `src/compiler/css-properties.ts`.
- Layer 3: `src/compiler/css-gen.ts` `isValidRule(prop, value)`.

The third layer is also applied to per-step keyframe declarations and to selector strings in custom variants, so `tl.keyframes` and `tl.extend({ variants })` get the same protection.

## See also

- [The compiler](../learn/11-the-compiler.md)
- [Property allowlist](../api/properties.md)
