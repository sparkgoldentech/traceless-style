# Inline diagnostics

The extension catches mistakes the moment you type:

- **Typos**: `colour: "red"` → red squiggle on `colour` with "Did you mean: color"
- **Non-literal values**: `color: someVar` → squiggle (the strict AST parser rejects identifiers)
- **Suspicious values**: a value containing `;` `}` `</` or bidi/control characters → warning

Press **Ctrl+.** on a squiggle to see quick-fix actions:

```
↪ Replace with 'color'        (the closest match)
↪ Replace with 'colormap'     (next closest)
```

Suggestions are ranked by Levenshtein distance, top match marked preferred.
