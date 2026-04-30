/**
 * traceless-style — compiler/extractor-swc.ts
 *
 * Optional SWC-backed parser. Same public surface as ./extractor.ts:
 *   - transform(src, file, customVariants?)
 *   - extractCustomVariants(src, file)
 *
 * Why two extractors?
 *   The default extractor is a hand-rolled scanner — zero native deps,
 *   tiny install footprint. This file uses @swc/core for a real JS/TS AST,
 *   which is more robust against unusual JSX/TS syntax (template literal
 *   nesting, decorators, etc.) and faster on large codebases.
 *
 * Safety guarantees (must hold for both extractors):
 *   - No dynamic code is ever evaluated. We only inspect AST shape.
 *   - Inside tl.create()/tl.extend() arguments, only literal values are
 *     accepted: string, number, negative number, nested object, fully-static
 *     template literal. The legacy null/undefined/true/false silently-skip
 *     behavior is preserved for backward compatibility.
 *   - Spreads, computed keys, methods, getters/setters, identifiers,
 *     function calls, and template literals with ${...} expressions are
 *     rejected with file:line:col errors.
 *
 * Lazy-loaded by ../cli/extract-fn.ts when parser="swc". Never imported by
 * the legacy path, so consumers who don't opt in never load @swc/core.
 */

import * as swc from "@swc/core";
import type { ParseError, StyleObject, StyleValue } from "./ast-parser";
import type { TransformResult, processStyles as ProcessStylesFn, globalRegistry as GlobalRegistry } from "./extractor";
import type { mergeVariants as MergeVariantsFn, FlatVariants } from "./variants";

export type { TransformResult };

/**
 * Dependencies injected by the caller. Keeping these as parameters (instead
 * of static imports of `./extractor` and `./variants`) is what lets this
 * file be safely lazy-loaded — at runtime, the caller passes its own
 * singletons so `globalRegistry` is shared with the rest of the pipeline.
 */
export interface SwcExtractorDeps {
  processStyles:    typeof ProcessStylesFn;
  globalRegistry:   typeof GlobalRegistry;
  mergeVariants:    typeof MergeVariantsFn;
  DEFAULT_VARIANTS: FlatVariants;
  /**
   * Optional pre-processor (e.g. the legacy extractor's tokens/themes/cssVar
   * detection). If provided, it's run on the source BEFORE SWC parses, so
   * we don't have to reimplement those rewrites in the SWC visitor.
   */
  preprocess?: (src: string, file: string, errors: ParseError[]) => string;
}

export interface SwcExtractor {
  transform:             (src: string, file: string, customVariants?: Record<string, string>) => TransformResult;
  extractCustomVariants: (src: string, file: string) => Record<string, string>;
}

/* ─── Loose AST node typing.
   @swc/core's published types are huge and version-shifting; we only need
   a handful of fields and rely on `type` discrimination at runtime. */
type AnyNode = {
  type:  string;
  span?: { start: number; end: number };
  [k: string]: unknown;
};

/* ─── Sentinel for "skip this property" (matches legacy behavior of
   silently dropping null/undefined/true/false values). */
const SKIP: unique symbol = Symbol("traceless-style.skip");

/* ═══════════════════════════════════════
   Parser configuration per file extension
═══════════════════════════════════════ */
function parseOptions(file: string): swc.ParseOptions {
  if (file.endsWith(".tsx")) return { syntax: "typescript", tsx: true,  decorators: true };
  if (file.endsWith(".ts"))  return { syntax: "typescript", tsx: false, decorators: true };
  if (file.endsWith(".jsx")) return { syntax: "ecmascript", jsx: true,  decorators: true };
  return                            { syntax: "ecmascript", jsx: false, decorators: true };
}

/* ═══════════════════════════════════════
   Span handling.

   SWC spans have two real-world quirks we have to compensate for:

   1. They're offsets into a *global* byte buffer that grows across every
      parseSync() call in the process. Subtracting `module.span.start`
      gives offsets relative to the start of *this* parse.
   2. They're UTF-8 BYTE offsets into a CRLF-normalized version of the
      source — i.e. SWC silently rewrites \r\n → \n before parsing. JS
      strings are indexed in code units, not bytes, and our test inputs
      may contain CRLF and non-ASCII characters (em-dashes in comments,
      emojis in JSX, etc.).

   To make span-based slicing correct, we always:
     - normalize \r\n → \n on input,
     - feed the normalized string to SWC,
     - convert SWC's byte offsets to char offsets via `byteToChar()`,
     - slice and return the normalized source.

   The returned `code` therefore has LF line endings even if the input
   had CRLF. This is downstream-safe (webpack/typescript handle both)
   and matches what SWC itself would produce.
═══════════════════════════════════════ */
function normalizeLineEndings(src: string): string {
  return src.indexOf("\r") === -1 ? src : src.replace(/\r\n?/g, "\n");
}

/**
 * Compute the 1-indexed baseline for SWC spans relative to *this* source.
 *
 * SWC spans are byte offsets into a process-global byte buffer that grows
 * with every parseSync() call. We can recover the per-source baseline from
 * `module.span.end`, which is always `(globalBytesBefore + sourceBytes + 1)`.
 *
 * Don't use `module.span.start` — that points at the first non-comment
 * byte (past leading JSDoc/comments), so it's wrong as a baseline whenever
 * the source has a header comment.
 */
function spanBaseline(module: AnyNode, src: string): number {
  const sourceBytes = Buffer.byteLength(src, "utf8");
  const end         = module.span?.end ?? sourceBytes;
  return end - sourceBytes;
}

/** Convert a UTF-8 byte offset (as SWC reports) into a JS char index. */
function byteToChar(src: string, byteOffset: number): number {
  if (byteOffset <= 0) return 0;
  let bytes = 0;
  const len = src.length;
  for (let i = 0; i < len; i++) {
    if (bytes >= byteOffset) return i;
    const c = src.charCodeAt(i);
    if      (c < 0x80)               bytes += 1;
    else if (c < 0x800)              bytes += 2;
    else if (c >= 0xD800 && c <= 0xDBFF) { bytes += 4; i++; } // surrogate pair
    else                             bytes += 3;
  }
  return len;
}

function offsetToLineCol(src: string, offset: number): { line: number; col: number } {
  let line = 1, col = 1;
  const limit = Math.min(offset, src.length);
  for (let i = 0; i < limit; i++) {
    if (src.charCodeAt(i) === 10) { line++; col = 1; }
    else col++;
  }
  return { line, col };
}

/* ═══════════════════════════════════════
   Single-pass AST visitor
═══════════════════════════════════════ */
function visit(node: unknown, fn: (n: AnyNode) => void): void {
  if (!node || typeof node !== "object") return;
  const n = node as AnyNode;
  if (typeof n.type === "string") fn(n);
  for (const k of Object.keys(n)) {
    const v = (n as Record<string, unknown>)[k];
    if (Array.isArray(v)) {
      for (const item of v) visit(item, fn);
    } else if (v && typeof v === "object" && typeof (v as AnyNode).type === "string") {
      visit(v, fn);
    }
  }
}

/* ═══════════════════════════════════════
   Locate every <id>.create({...}) and <id>.extend({...})
═══════════════════════════════════════ */
interface FoundCall {
  fnName:    "create" | "extend";
  objExpr:   AnyNode;
  /** Char index into the normalized source (NOT byte offset). */
  callStart: number;
  /** Char index into the normalized source (NOT byte offset). */
  callEnd:   number;
}

function findCalls(module: AnyNode, baseline: number, normalizedSrc: string): FoundCall[] {
  const out: FoundCall[] = [];
  visit(module, (n) => {
    if (n.type !== "CallExpression") return;
    const callee = n.callee as AnyNode | undefined;
    if (!callee || callee.type !== "MemberExpression") return;
    const prop = callee.property as AnyNode | undefined;
    if (!prop || prop.type !== "Identifier") return;
    const name = prop.value as string;
    if (name !== "create" && name !== "extend") return;
    const args = n.arguments as Array<{ spread?: unknown; expression: AnyNode }> | undefined;
    if (!Array.isArray(args) || args.length !== 1) return;
    const arg = args[0];
    if (!arg || arg.spread || !arg.expression) return;
    if (arg.expression.type !== "ObjectExpression") return;
    if (!n.span) return;
    const startBytes = n.span.start - baseline;
    const endBytes   = n.span.end   - baseline;
    out.push({
      fnName:    name,
      objExpr:   arg.expression,
      callStart: byteToChar(normalizedSrc, startBytes),
      callEnd:   byteToChar(normalizedSrc, endBytes),
    });
  });
  return out;
}

/* ═══════════════════════════════════════
   Object-literal → StyleObject conversion.
   Strict: rejects anything dynamic.
═══════════════════════════════════════ */
function readKey(
  keyNode: AnyNode,
  src:     string,
  baseline: number,
  file:    string,
  errors:  ParseError[]
): string | null {
  if (keyNode.type === "Identifier")     return keyNode.value as string;
  if (keyNode.type === "StringLiteral")  return keyNode.value as string;
  if (keyNode.type === "NumericLiteral") return String(keyNode.value);
  const { line, col } = positionOf(keyNode, src, baseline);
  if (keyNode.type === "Computed") {
    errors.push({
      message: "Computed property keys ([expr]: ...) are not allowed inside tl.create()/tl.extend().",
      line, col, file,
    });
    return null;
  }
  errors.push({
    message: `Unsupported property key type '${keyNode.type}'.`,
    line, col, file,
  });
  return null;
}

function readValue(
  node:    AnyNode,
  src:     string,
  baseline: number,
  file:    string,
  errors:  ParseError[]
): StyleValue | StyleObject | typeof SKIP | null {
  switch (node.type) {
    case "StringLiteral":  return node.value as string;
    case "NumericLiteral": return node.value as number;
    case "BooleanLiteral": return SKIP;
    case "NullLiteral":    return SKIP;
    case "ObjectExpression": return objExprToStyleObject(node, src, baseline, file, errors);

    case "UnaryExpression": {
      const arg = node.argument as AnyNode | undefined;
      if (node.operator === "-" && arg?.type === "NumericLiteral") {
        return -(arg.value as number);
      }
      const { line, col } = positionOf(node, src, baseline);
      errors.push({
        message: `Unsupported unary expression '${node.operator}' inside style value — only negative numeric literals are allowed.`,
        line, col, file,
      });
      return null;
    }

    case "Identifier": {
      if (node.value === "undefined") return SKIP;
      const { line, col } = positionOf(node, src, baseline);
      errors.push({
        message: `Variable '${node.value}' not supported — use a literal value.`,
        line, col, file,
      });
      return null;
    }

    case "TemplateLiteral": {
      const exprs   = (node.expressions as unknown[]) ?? [];
      const quasis  = (node.quasis      as Array<{ cooked?: string; raw?: string }>) ?? [];
      if (exprs.length === 0 && quasis.length === 1) {
        return quasis[0].cooked ?? quasis[0].raw ?? "";
      }
      const { line, col } = positionOf(node, src, baseline);
      errors.push({
        message: "Template literals with ${...} expressions are not allowed inside tl.create() — use a plain string literal.",
        line, col, file,
      });
      return null;
    }

    default: {
      const { line, col } = positionOf(node, src, baseline);
      errors.push({
        message: `Unsupported value type '${node.type}' inside tl.create()/tl.extend().`,
        line, col, file,
      });
      return null;
    }
  }
}

function objExprToStyleObject(
  obj:     AnyNode,
  src:     string,
  baseline: number,
  file:    string,
  errors:  ParseError[]
): StyleObject | null {
  if (obj.type !== "ObjectExpression") {
    const { line, col } = positionOf(obj, src, baseline);
    errors.push({
      message: `Expected an object literal, got '${obj.type}'.`,
      line, col, file,
    });
    return null;
  }
  const props = (obj.properties as AnyNode[]) ?? [];
  const result: StyleObject = {};

  for (const prop of props) {
    if (prop.type === "SpreadElement") {
      const { line, col } = positionOf(prop, src, baseline);
      errors.push({
        message: "Spread (...) is not allowed inside tl.create()/tl.extend() — every property must be an explicit literal.",
        line, col, file,
      });
      return null;
    }
    if (prop.type === "Identifier") {
      // Shorthand `{ foo }` — references a variable, never legal here.
      const { line, col } = positionOf(prop, src, baseline);
      errors.push({
        message: `Shorthand property '${prop.value}' references a variable — write 'key: literal' instead.`,
        line, col, file,
      });
      return null;
    }
    if (
      prop.type === "MethodProperty" ||
      prop.type === "GetterProperty" ||
      prop.type === "SetterProperty"
    ) {
      const { line, col } = positionOf(prop, src, baseline);
      errors.push({
        message: "Methods, getters and setters are not allowed inside tl.create()/tl.extend().",
        line, col, file,
      });
      return null;
    }
    if (prop.type !== "KeyValueProperty") {
      const { line, col } = positionOf(prop, src, baseline);
      errors.push({
        message: `Unsupported property type '${prop.type}' inside tl.create()/tl.extend().`,
        line, col, file,
      });
      return null;
    }

    const key = readKey(prop.key as AnyNode, src, baseline, file, errors);
    if (key === null) return null;

    const value = readValue(prop.value as AnyNode, src, baseline, file, errors);
    if (value === null) return null;
    if (value === SKIP) continue;

    result[key] = value as StyleValue | StyleObject;
  }
  return result;
}

function positionOf(node: AnyNode, src: string, baseline: number): { line: number; col: number } {
  if (!node.span) return { line: 0, col: 0 };
  // node.span.start is a UTF-8 byte offset; convert to char index first
  // so newline counting in offsetToLineCol() lands on the right character.
  const charOffset = byteToChar(src, node.span.start - baseline);
  return offsetToLineCol(src, charOffset);
}

/* ═══════════════════════════════════════
   Public API — factory that closes over the caller's deps so this module
   never imports `./extractor` or `./variants` at runtime. The injected
   globalRegistry / processStyles / mergeVariants / DEFAULT_VARIANTS are
   the same instances used by the rest of the pipeline, so atomic-rule
   state is shared.
═══════════════════════════════════════ */
export function createSwcExtractor(deps: SwcExtractorDeps): SwcExtractor {
  const { processStyles, globalRegistry, mergeVariants, DEFAULT_VARIANTS, preprocess } = deps;

  function extractCustomVariants(src: string, file: string): Record<string, string> {
    if (!src.includes("extend")) return {};

    const norm = normalizeLineEndings(src);

    let module: AnyNode;
    try {
      module = swc.parseSync(norm, parseOptions(file)) as unknown as AnyNode;
    } catch {
      return {};
    }

    const baseline = spanBaseline(module, norm);
    const out: Record<string, string> = {};
    const errors: ParseError[] = [];

    for (const call of findCalls(module, baseline, norm)) {
      if (call.fnName !== "extend") continue;
      const outer = objExprToStyleObject(call.objExpr, norm, baseline, file, errors);
      if (!outer) continue;
      const variants = outer["variants"];
      if (variants && typeof variants === "object") {
        for (const [k, v] of Object.entries(variants)) {
          if (typeof v === "string" && v.trim()) out[k] = v;
        }
      }
    }
    return out;
  }

  function transform(
    src:            string,
    file:           string,
    customVariants: Record<string, string> = {}
  ): TransformResult {
  const errors:   ParseError[] = [];
  const warnings: string[]     = [];

  // Cheap text-prefilter — skip files that obviously have nothing to do.
  if (
    !src.includes("create") && !src.includes("extend") &&
    !src.includes("defineTokens") && !src.includes("createTheme") &&
    !src.includes("cssVar")
  ) {
    return { code: src, rules: [], changed: false, errors: [], warnings: [] };
  }

  // Run the legacy text-based preprocessor for tokens/themes/cssVar BEFORE
  // we parse — these rewrites turn dynamic-looking forms into literal
  // strings/objects so SWC's strict literal-only value validation accepts
  // the result. Reimplementing the rewrites in the SWC visitor would
  // duplicate logic with no benefit.
  const preprocessed = preprocess ? preprocess(src, file, errors) : src;

  // Normalize line endings so SWC's CRLF→LF rewrite doesn't desync from
  // our source slicing. All offsets below are into `norm`, and `norm` is
  // what we return as `code`.
  const norm = normalizeLineEndings(preprocessed);

  let module: AnyNode;
  try {
    module = swc.parseSync(norm, parseOptions(file)) as unknown as AnyNode;
  } catch (e) {
    return {
      code:     src,
      rules:    [],
      changed:  false,
      errors:   [{
        message: `SWC parse error: ${(e as Error).message ?? String(e)}`,
        line:    0,
        col:     0,
        file,
      }],
      warnings: [],
    };
  }

  const baseline = spanBaseline(module, norm);
  const allCalls = findCalls(module, baseline, norm);

  // Pass 1 (this file): merge any tl.extend variants into the custom map.
  const localCustom: Record<string, string> = {};
  for (const call of allCalls) {
    if (call.fnName !== "extend") continue;
    const outer = objExprToStyleObject(call.objExpr, norm, baseline, file, errors);
    if (!outer) continue;
    const v = outer["variants"];
    if (v && typeof v === "object") {
      for (const [k, sel] of Object.entries(v)) {
        if (typeof sel === "string" && sel.trim()) localCustom[k] = sel;
      }
    }
  }

  const allCustom = { ...customVariants, ...localCustom };
  const { flat: variants, errors: varErrors } =
    Object.keys(allCustom).length > 0
      ? mergeVariants(allCustom)
      : { flat: DEFAULT_VARIANTS, errors: [] };

  for (const ve of varErrors) warnings.push(`[traceless-style] ${ve.message}`);

  // Pass 2: transform tl.create calls. Splice in REVERSE so earlier
  // offsets stay valid as we mutate the source.
  const createCalls = allCalls.filter(c => c.fnName === "create");
  if (createCalls.length === 0) {
    return {
      code:           norm,
      rules:          [],
      changed:        false,
      errors,
      warnings,
      customVariants: allCustom,
    };
  }

  let result  = norm;
  let changed = false;

  for (const call of [...createCalls].sort((a, b) => b.callStart - a.callStart)) {
    // Defensive sanity check: spans must point at the callee in the source.
    const slice = result.slice(call.callStart, call.callEnd);
    if (!/^[A-Za-z_$][\w$]*\s*\.\s*create\s*\(/.test(slice)) {
      warnings.push(`[traceless-style] SWC span mismatch in ${file} — skipping a tl.create() call.`);
      continue;
    }

    const outerObj = objExprToStyleObject(call.objExpr, norm, baseline, file, errors);
    if (!outerObj) {
      warnings.push(`[traceless-style] Could not parse tl.create() in ${file}`);
      continue;
    }

    const resolved: Record<string, string> = {};
    for (const [key, styles] of Object.entries(outerObj)) {
      if (typeof styles !== "object") {
        errors.push({
          message: `tl.create() key '${key}' must be an object`,
          line:    0,
          col:     0,
          file,
        });
        continue;
      }
      const classes = processStyles(styles as StyleObject, variants, undefined, file, errors);
      resolved[key] = [...new Set(classes)].join(" ");
    }

    const replacement = JSON.stringify(resolved);
    result  = result.slice(0, call.callStart) + replacement + result.slice(call.callEnd);
    changed = true;
  }

  if (
    changed &&
    !result.includes(".create") &&
    !result.includes(".merge") &&
    !result.includes(".cx")
  ) {
    result = result
      .replace(/import\s+\{[^}]*\b(sc|merge|cx|extend)\b[^}]*\}\s+from\s+["']traceless-style[^"']*["'];?\n?/g, "")
      .replace(/import\s+\*\s+as\s+\w+\s+from\s+["']traceless-style[^"']*["'];?\n?/g, "");
  }

  return {
    code:           result,
    rules:          globalRegistry.getAll(),
    changed,
    errors,
    warnings,
    customVariants: allCustom,
  };
  } // end transform

  return { transform, extractCustomVariants };
}
