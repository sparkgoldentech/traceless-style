/**
 * spark-css — runtime/index.ts
 *
 * The ONLY code that runs in the browser.
 * All sc.create() calls are replaced at build time — this file
 * only provides merge(), cx(), and the class meta lookup.
 *
 * sc.merge() — StyleX-equivalent conflict resolution:
 *   - Last definition of a CSS property WINS
 *   - Earlier conflicting classes are REMOVED from the output
 *   - Variant-specific conflicts (e.g. _dark:color) resolved separately
 *
 * Example:
 *   const a = sc.create({ box: { color: "red",  display: "flex" } });
 *   const b = sc.create({ box: { color: "blue", padding: "1rem" } });
 *
 *   sc.merge(a.box, b.box)
 *   // a.box = "scRED sc111"   (color:red, display:flex)
 *   // b.box = "scBLUE sc222"  (color:blue, padding:1rem)
 *
 *   Without conflict resolution: "scRED sc111 scBLUE sc222"
 *   → both color:red AND color:blue in HTML, CSS order decides
 *
 *   With conflict resolution:    "sc111 scBLUE sc222"
 *   → scRED removed because scBLUE (color:blue) comes later
 *   → display:flex and padding:1rem kept (no conflict)
 */

import type { CSSProperties }  from "../types/css";
import type { VariantKey }     from "../types/variants";

/* ── Class metadata — injected at build time by webpack DefinePlugin ── */
declare const __SPARK_CSS_META__: Record<string, string> | undefined;

/**
 * Runtime meta store.
 * Populated from __SPARK_CSS_META__ (compile-time constant)
 * or via __setMeta() for SSR/test environments.
 */
let __meta: Record<string, string> = {};

/* Load compile-time meta if available */
try {
  if (typeof __SPARK_CSS_META__ !== "undefined" && __SPARK_CSS_META__) {
    __meta = __SPARK_CSS_META__;
  }
} catch {
  // __SPARK_CSS_META__ not defined — will be set via __setMeta()
}

/** Set meta at runtime (used by SSR, tests, or when DefinePlugin not used) */
export function __setMeta(meta: Record<string, string>): void {
  __meta = { ...__meta, ...meta };
}

/**
 * Conflict-aware style merge — the core innovation.
 *
 * Algorithm:
 * 1. Walk each class string left to right (earlier → later)
 * 2. For each class, look up its "prop:selector" key in meta
 * 3. Map: propKey → latestClass (later always overwrites earlier)
 * 4. Output: deduplicated values (last wins per prop:selector)
 *
 * This is O(n) where n = total number of classes across all inputs.
 */
export function merge(
  ...inputs: (string | undefined | null | false | 0)[]
): string {
  // Fast path — nothing to merge
  const valid = inputs.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (valid.length === 0) return "";
  if (valid.length === 1) return valid[0];

  // No meta loaded — fall back to simple concatenation
  if (Object.keys(__meta).length === 0) {
    return [...new Set(valid.join(" ").split(/\s+/).filter(Boolean))].join(" ");
  }

  /**
   * propKey → winning class
   * propKey format: "display" | "color::hover" | "background-color::is(.dark *)"
   *
   * Why separate base and variant?
   * color:red (base) and color:blue:hover are NOT conflicts —
   * they apply in different conditions.
   */
  const propKeyToClass = new Map<string, string>();

  /* Classes without meta (unknown/external) — always kept */
  const unknownClasses = new Set<string>();

  for (const input of valid) {
    const classes = input.split(/\s+/);
    for (const cls of classes) {
      if (!cls) continue;
      const key = __meta[cls];
      if (key !== undefined) {
        // Known class — last one wins per key
        propKeyToClass.set(key, cls);
      } else {
        // Unknown class (external, e.g. from globals.css) — always keep
        unknownClasses.add(cls);
      }
    }
  }

  const result = [
    ...[...propKeyToClass.values()],
    ...[...unknownClasses],
  ];

  return result.join(" ");
}

/**
 * Conditional class joining — no conflict resolution.
 * Equivalent to clsx, zero dependencies.
 *
 * Accepts:
 *   - strings: "scm92pvu sc883bzd"
 *   - false/null/undefined: skipped
 *   - objects: { [cls]: boolean }
 *
 * Usage:
 *   cx($.base, isActive && $.active, { [$.highlight]: hasError })
 */
export function cx(
  ...inputs: (string | undefined | null | false | 0 | Record<string, boolean>)[]
): string {
  const classes: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === "string") {
      classes.push(input);
    } else if (typeof input === "object") {
      for (const [cls, condition] of Object.entries(input)) {
        if (condition && cls) classes.push(cls);
      }
    }
  }
  return classes.join(" ");
}

/* ── StyleDef type ── */
export type StyleDef = CSSProperties & {
  [K in VariantKey]?: CSSProperties;
} & {
  [key: string]: unknown;
};

type StyleMap       = Record<string, StyleDef>;
type ResolvedMap<T> = { [K in keyof T]: string };

/**
 * sc.create() — REPLACED at build time by plain object.
 *
 * This function only runs in:
 * 1. Development without the webpack transform
 * 2. Tests
 * 3. Non-Next.js environments
 *
 * In production after build: sc.create({ card: { display: "flex" } })
 * becomes:                   { card: "scm92pvu" }
 * and this function is never called.
 */
export function create<T extends StyleMap>(map: T): ResolvedMap<T> {
  if (
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "production"
  ) {
    console.error(
      "[spark-css] sc.create() called at runtime in production!\n" +
      "This means the build-time transform did not run.\n" +
      "Add to next.config.ts: import { withSparkCSS } from 'spark-css/nextjs'\n" +
      "Or run: npx spark-css extract before building."
    );
  }

  // Dev fallback — runtime extraction
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { transform, globalRegistry } = require("../compiler/extractor");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { generateCSS }               = require("../compiler/css-gen");

    const result: Record<string, string> = {};

    for (const [key, styles] of Object.entries(map)) {
      const fakeSrc = `sc.create(${JSON.stringify({ [key]: styles })})`;
      const { code } = transform(fakeSrc, "runtime");
      try {
        const parsed = JSON.parse(code) as Record<string, string>;
        result[key]  = parsed[key] ?? "";
      } catch {
        result[key] = "";
      }
    }

    /* Inject CSS into DOM in dev mode */
    if (typeof document !== "undefined") {
      const css = generateCSS(globalRegistry.getAll());
      let tag   = document.querySelector<HTMLStyleElement>("style[data-sc]");
      if (!tag) {
        tag = document.createElement("style");
        tag.setAttribute("data-sc", "1");
        document.head.appendChild(tag);
      }
      tag.textContent = css;
    }

    return result as ResolvedMap<T>;
  } catch {
    const result: Record<string, string> = {};
    for (const key of Object.keys(map)) result[key] = "";
    return result as ResolvedMap<T>;
  }
}

/** Main sc object */
export const sc = { create, merge, cx };