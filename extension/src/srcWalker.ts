/**
 * traceless-style VS Code extension — srcWalker.ts
 *
 * Shared, dependency-free helpers for walking JS/TS source while
 * respecting strings (single, double, template literal with `${}`),
 * comments (line and block), and balanced braces / brackets / parens.
 *
 * Every provider in this extension that scans source code uses these
 * primitives so we have ONE implementation of the lexical-walk rules.
 * Diverging copies (we had three) caused subtle bugs in earlier versions
 * — e.g., one didn't recognize template-literal interpolation, so a
 * call inside a backtick string was incorrectly parsed as a real call.
 *
 * Public API:
 *   skipString          — past a string starting at i; returns position after closing quote
 *   skipLineComment     — past a `//` comment to the next newline
 *   skipBlockComment    — past `/* ... *​/` to the position after `*​/`
 *   skipWsAndComments   — combined — useful between tokens
 *   matchBrace          — `{` at start → position of the matching `}`
 *   matchBracket        — `[` at start → position of the matching `]`
 *   matchParen          — `(` at start → position of the matching `)`
 *   findTlCalls         — every `<alias>.<method>(` in the source
 */

export interface TlCall {
  /** Method name: `create`, `keyframes`, or `extend`. */
  method:       "create" | "keyframes" | "extend";
  /** Index of the opening `(`. */
  callOpenIdx:  number;
  /** Index of the closing `)` (or end of source if unclosed). */
  callCloseIdx: number;
  /** Index of the styles object's opening `{` — null if absent. */
  openBrace:    number | null;
  /** Index of the matching `}` — null if absent or unbalanced. */
  closeBrace:   number | null;
  /** For `keyframes`, the literal name argument (`tl.keyframes("fadeIn", …)`). */
  keyframeName: string | null;
}

/** Iterate every `<alias>.<method>(...)` call. */
export function findTlCalls(src: string, aliases: string[]): TlCall[] {
  const aliasRe = aliases.map(escapeRegex).join("|");
  const re = new RegExp(`(?<![A-Za-z0-9_$])(?:${aliasRe})\\.(create|keyframes|extend)\\s*\\(`, "g");
  const out: TlCall[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const method      = m[1] as TlCall["method"];
    const callOpenIdx = m.index + m[0].length - 1; // index of `(`
    const callCloseIdx = matchParen(src, callOpenIdx);
    let openBrace:    number | null = null;
    let closeBrace:   number | null = null;
    let keyframeName: string | null = null;

    let i = callOpenIdx + 1;
    i = skipWsAndComments(src, i);
    // Optional first arg for keyframes: a name literal.
    if ((src[i] === '"' || src[i] === "'") && method === "keyframes") {
      const q = src[i];
      const start = i + 1;
      i = skipString(src, i);
      keyframeName = src.slice(start, i - 1);
      i = skipWsAndComments(src, i);
      if (src[i] === ",") { i++; i = skipWsAndComments(src, i); }
    }
    if (src[i] === "{") {
      openBrace = i;
      const c = matchBrace(src, i);
      if (c >= 0) closeBrace = c;
    }

    out.push({
      method, callOpenIdx,
      callCloseIdx: callCloseIdx >= 0 ? callCloseIdx : src.length,
      openBrace, closeBrace, keyframeName,
    });
  }
  return out;
}

/* ── lexical skippers ───────────────────────────────────────────── */

export function skipString(src: string, i: number): number {
  const q = src[i++];
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") { i += 2; continue; }
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

export function skipLineComment(src: string, i: number): number {
  while (i < src.length && src[i] !== "\n") i++;
  return i;
}

export function skipBlockComment(src: string, i: number): number {
  i += 2;
  while (i < src.length) {
    if (src[i] === "*" && src[i + 1] === "/") return i + 2;
    i++;
  }
  return i;
}

export function skipWsAndComments(src: string, i: number): number {
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch))                    { i++; continue; }
    if (ch === "/" && src[i + 1] === "/") { i = skipLineComment(src, i); continue; }
    if (ch === "/" && src[i + 1] === "*") { i = skipBlockComment(src, i); continue; }
    return i;
  }
  return i;
}

/* ── balanced-token matchers ───────────────────────────────────── */

export function matchBrace(src: string, start: number): number {
  return matchBalanced(src, start, "{", "}");
}
export function matchBracket(src: string, start: number): number {
  return matchBalanced(src, start, "[", "]");
}
export function matchParen(src: string, start: number): number {
  return matchBalanced(src, start, "(", ")");
}

function matchBalanced(src: string, start: number, open: string, close: string): number {
  let depth = 0;
  let i     = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") { i = skipString(src, i); continue; }
    if (ch === "/" && src[i + 1] === "/")       { i = skipLineComment(src, i); continue; }
    if (ch === "/" && src[i + 1] === "*")       { i = skipBlockComment(src, i); continue; }
    if (ch === open)  depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/* ── helpers ────────────────────────────────────────────────────── */

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Walk a `{ key: value, … }` body and yield each key + its value range.
 *  `start` is the index AFTER the opening `{`; `end` is the index OF the
 *  matching `}`. Yields entries even when the value is a nested object —
 *  consumers can recurse into the value range themselves if needed. */
export interface ObjectEntry {
  keyStart: number;
  keyEnd:   number;
  /** Character offset of the `:` separator. */
  colonIdx: number;
  /** Character offset of the first non-whitespace char of the value. */
  valueStart: number;
  /** One past the last char of the value (does not include trailing comma). */
  valueEnd: number;
  /** Quoted name, dequoted: `"foo bar"` → `foo bar`. */
  key: string;
  /** What kind of value follows: `object`, `array`, `string`, `number`,
   *  `template`, `identifier`, `unknown`. */
  valueKind: "object" | "array" | "string" | "number" | "template" | "identifier" | "boolean" | "null" | "unknown";
}

export function* walkObjectEntries(src: string, start: number, end: number): Generator<ObjectEntry> {
  let i = start;
  while (i < end) {
    i = skipWsAndComments(src, i);
    if (i >= end) return;

    let keyStart: number, keyEnd: number, key: string;
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i];
      keyStart = i + 1;
      i++;
      while (i < end && src[i] !== q) { if (src[i] === "\\") i += 2; else i++; }
      keyEnd = i;
      key = src.slice(keyStart, keyEnd);
      i++;
    } else if (/[A-Za-z_$0-9-]/.test(src[i])) {
      keyStart = i;
      while (i < end && /[A-Za-z0-9_$-]/.test(src[i])) i++;
      keyEnd = i;
      key = src.slice(keyStart, keyEnd);
    } else {
      i++;
      continue;
    }

    i = skipWsAndComments(src, i);
    if (src[i] !== ":") {
      while (i < end && src[i] !== "," && src[i] !== "}") i++;
      if (src[i] === ",") i++;
      continue;
    }
    const colonIdx = i;
    i++;
    i = skipWsAndComments(src, i);
    const valueStart = i;
    let valueEnd: number;
    let valueKind: ObjectEntry["valueKind"];

    if (src[i] === "{") {
      const close = matchBrace(src, i);
      valueEnd = close >= 0 ? close + 1 : end;
      valueKind = "object";
      i = valueEnd;
    } else if (src[i] === "[") {
      const close = matchBracket(src, i);
      valueEnd = close >= 0 ? close + 1 : end;
      valueKind = "array";
      i = valueEnd;
    } else if (src[i] === '"' || src[i] === "'") {
      valueEnd = skipString(src, i);
      valueKind = "string";
      i = valueEnd;
    } else if (src[i] === "`") {
      valueEnd = skipString(src, i);
      valueKind = "template";
      i = valueEnd;
    } else if (/[-0-9.]/.test(src[i])) {
      const s = i;
      while (i < end && /[-0-9.eE+]/.test(src[i])) i++;
      valueEnd = i;
      valueKind = "number";
    } else if (/[A-Za-z_$]/.test(src[i])) {
      const s = i;
      while (i < end && /[A-Za-z0-9_$.]/.test(src[i])) i++;
      const ident = src.slice(s, i);
      valueEnd = i;
      if (ident === "true" || ident === "false")     valueKind = "boolean";
      else if (ident === "null" || ident === "undefined") valueKind = "null";
      else valueKind = "identifier";
    } else {
      while (i < end && src[i] !== "," && src[i] !== "}") i++;
      valueEnd = i;
      valueKind = "unknown";
    }

    yield { keyStart, keyEnd, colonIdx, valueStart, valueEnd, key, valueKind };

    i = skipWsAndComments(src, i);
    if (src[i] === ",") i++;
  }
}
