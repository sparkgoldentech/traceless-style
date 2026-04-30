/**
 * traceless-style — compiler/codeframe.ts
 *
 * Babel-style code frames: a few lines of source around an error site
 * with a caret pointing at the offending column. Used by lint and parser
 * error formatting so build failures show *where* the problem is, not
 * just a line number the user has to chase.
 *
 *   > 12 | const x = { color: variable };
 *        |                    ^
 *
 * Pure / dependency-free. Safe for both Node and browser playgrounds.
 */

export interface CodeFrameOptions {
  /** Lines of context above and below the error line. Default: 2. */
  context?: number;
  /** When true, prepend a leading "│ " to every line. Useful for nested error displays. */
  bar?:     boolean;
}

/**
 * Build a code-frame string. `line` and `col` are both 1-based, matching
 * the convention used by parser/lint errors throughout the codebase.
 *
 * Defensive against:
 *   - line/col out of range (clamped to source bounds)
 *   - tabs (rendered as 2 spaces so caret alignment is reliable)
 *   - trailing CRLF (split handles both endings)
 */
export function codeFrame(
  src:  string,
  line: number,
  col:  number,
  opts: CodeFrameOptions = {}
): string {
  const ctx     = Math.max(0, opts.context ?? 2);
  const lines   = src.split(/\r?\n/);
  if (lines.length === 0) return "";

  const errIdx  = Math.max(0, Math.min(lines.length - 1, line - 1));
  const start   = Math.max(0, errIdx - ctx);
  const end     = Math.min(lines.length, errIdx + ctx + 1);
  const gutterW = String(end).length;

  // Replace tabs with 2 spaces so the caret aligns visually. Adjust col
  // accordingly: each tab before the column position contributes (2-1)=1
  // extra column to the rendered line.
  const renderLine = (raw: string): string => raw.replace(/\t/g, "  ");
  const errLineRaw = lines[errIdx] ?? "";
  const colInRendered = (() => {
    let c = 0;
    for (let i = 0; i < Math.min(col - 1, errLineRaw.length); i++) {
      c += errLineRaw[i] === "\t" ? 2 : 1;
    }
    return c;
  })();

  const out: string[] = [];
  for (let i = start; i < end; i++) {
    const n        = i + 1;
    const isErr    = i === errIdx;
    const marker   = isErr ? ">" : " ";
    const num      = String(n).padStart(gutterW, " ");
    const text     = renderLine(lines[i]);
    out.push(`${marker} ${num} | ${text}`);
    if (isErr) {
      const padW   = `  ${" ".repeat(gutterW)} | `.length;
      const caret  = " ".repeat(padW + colInRendered) + "^";
      out.push(caret);
    }
  }

  if (opts.bar) {
    return out.map(l => `│ ${l}`).join("\n");
  }
  return out.join("\n");
}
