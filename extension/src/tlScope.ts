/**
 * traceless-style VS Code extension — tlScope.ts
 *
 * Lightweight, regex-based detector for "is this position inside a
 * tl.create({...}) (or .keyframes / .extend) argument body?" We don't
 * spin up a TypeScript Language Service for the extension because:
 *
 *   1. Latency matters for completion. A full TS parse on every keystroke
 *      is too slow.
 *   2. The set of syntactic shapes we need to recognize is tiny — five
 *      method names, all called as `<alias>.<method>(`. A balanced-brace
 *      walk handles them with zero compile-time cost.
 *
 * Detection algorithm:
 *   1. Find every occurrence of `<alias>.create(` / `.keyframes(` / `.extend(`
 *      in the file. We allow a configurable list of aliases (default ["tl"])
 *      so users with renamed imports get the same support.
 *   2. From the opening `(`, walk forward through balanced braces while
 *      respecting strings (single, double, template) and comments.
 *   3. If the cursor offset falls inside the OUTER object (between the
 *      first `{` after the call paren and its matching `}`), report the
 *      scope along with the depth so completion can decide what to offer.
 *
 * Edge cases handled:
 *   - Strings with escaped quotes
 *   - Template literals with `${...}` expressions
 *   - Block / line comments
 *   - Nested braces inside values (keyframes' `from { ... }` etc.)
 *   - Cursor exactly at a brace boundary
 *
 * NOT handled (and this is fine for v0.1):
 *   - Spread/dynamic property keys — we just don't suggest inside them.
 *   - tl renamed via destructured import (`const { create } = tl`).
 *     Users who do this get no completion until we add a real-AST mode.
 */

export type TlMethod = "create" | "keyframes" | "extend";

export interface TlScope {
  method:    TlMethod;
  /** Character offset of the opening `{` of the styles object. */
  openBrace: number;
  /** Character offset of the matching `}`. */
  closeBrace: number;
  /** Brace nesting depth at `cursorOffset` relative to the styles object root.
   *  0 = top level (group keys like `btn`, `card`); 1 = inside a group
   *  (CSS property keys); >=2 = inside a nested variant block (`_dark`,
   *  `_hover`, etc.) or inside `from`/`to` for keyframes. */
  depth: number;
  /** True when the cursor sits at a position where a NEW key would go
   *  (i.e. just after `{` or `,`, optionally with whitespace). */
  atKeyPosition: boolean;
}

const METHODS: TlMethod[] = ["create", "keyframes", "extend"];

/**
 * Detect whether `cursorOffset` is inside a tl-method call argument body
 * within `source`. Returns null if the cursor isn't inside one.
 *
 * `aliases` is the list of identifier names to treat as the traceless-style
 * API root (default `["tl"]` — but users with `import { tl as t }` can
 * extend via the `traceless-style.identifierAliases` setting).
 */
export function detectTlScope(
  source:       string,
  cursorOffset: number,
  aliases:      string[]
): TlScope | null {
  // Build a regex for `<alias>.<method>(` matching every alias x method
  // combination. The lookbehind keeps us from matching `xtl.create(` in
  // the middle of a longer identifier (e.g. `myTl.create`).
  const aliasRe = aliases.map(escape).join("|");
  const re = new RegExp(`(?<![A-Za-z0-9_$])(?:${aliasRe})\\.(create|keyframes|extend)\\s*\\(`, "g");

  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const callOpenIdx = match.index + match[0].length - 1; // index of '('
    const styleObj    = findStylesObject(source, callOpenIdx);
    if (!styleObj) continue;
    if (cursorOffset > styleObj.openBrace && cursorOffset < styleObj.closeBrace) {
      const depth         = nestingDepth(source, styleObj.openBrace, cursorOffset);
      const atKeyPosition = isAtKeyPosition(source, cursorOffset);
      return {
        method:        match[1] as TlMethod,
        openBrace:     styleObj.openBrace,
        closeBrace:    styleObj.closeBrace,
        depth,
        atKeyPosition,
      };
    }
  }
  return null;
}

/**
 * Given the offset of `(` in a tl-method call, find the boundaries of the
 * outermost `{...}` argument. Returns null if we walk off the end without
 * finding one — defensive for partially-typed source.
 */
function findStylesObject(src: string, callParenOffset: number): { openBrace: number; closeBrace: number } | null {
  // Skip whitespace + opening tokens until we hit `{`. Real-world calls:
  //   tl.create({ ... })
  //   tl.create(   {           ← whitespace-tolerant
  //     ...
  //   })
  let i = callParenOffset + 1;
  i = skipWsAndComments(src, i);
  if (src[i] !== "{") return null;
  const openBrace = i;
  const closeBrace = matchBrace(src, openBrace);
  if (closeBrace < 0) return null;
  return { openBrace, closeBrace };
}

/** Find the index of the `}` matching the `{` at `start`. -1 if missing. */
function matchBrace(src: string, start: number): number {
  let depth = 0;
  let i     = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") { i = skipString(src, i); continue; }
    if (ch === "/" && src[i + 1] === "/")       { i = skipLineComment(src, i); continue; }
    if (ch === "/" && src[i + 1] === "*")       { i = skipBlockComment(src, i); continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** Brace nesting depth between an outer `{` and a cursor inside it. */
function nestingDepth(src: string, openBrace: number, cursor: number): number {
  let depth = 0;
  let i     = openBrace + 1;
  while (i < cursor && i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") { i = skipString(src, i); continue; }
    if (ch === "/" && src[i + 1] === "/")       { i = skipLineComment(src, i); continue; }
    if (ch === "/" && src[i + 1] === "*")       { i = skipBlockComment(src, i); continue; }
    if (ch === "{")      depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return depth;
}

/** True if the cursor is positioned where a fresh key would be typed
 *  (start of object, or just after a comma + optional whitespace). */
function isAtKeyPosition(src: string, cursor: number): boolean {
  let i = cursor - 1;
  while (i >= 0 && /\s/.test(src[i])) i--;
  if (i < 0) return true;
  const ch = src[i];
  return ch === "{" || ch === "," || ch === ";";
}

/* ── string / comment skippers (shared) ─────────────────────────── */

function skipString(src: string, i: number): number {
  const q = src[i++];
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\")          { i += 2; continue; }
    if (q === "`" && ch === "$" && src[i + 1] === "{") {
      // Template-literal expression — recurse with brace matching.
      i += 2;
      let depth = 1;
      while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === '"' || c === "'" || c === "`") { i = skipString(src, i); continue; }
        i++;
      }
      continue;
    }
    if (ch === q) return i + 1;
    i++;
  }
  return i;
}

function skipLineComment(src: string, i: number): number {
  while (i < src.length && src[i] !== "\n") i++;
  return i;
}

function skipBlockComment(src: string, i: number): number {
  i += 2;
  while (i < src.length) {
    if (src[i] === "*" && src[i + 1] === "/") return i + 2;
    i++;
  }
  return i;
}

function skipWsAndComments(src: string, i: number): number {
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch))                    { i++; continue; }
    if (ch === "/" && src[i + 1] === "/") { i = skipLineComment(src, i); continue; }
    if (ch === "/" && src[i + 1] === "*") { i = skipBlockComment(src, i); continue; }
    return i;
  }
  return i;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
