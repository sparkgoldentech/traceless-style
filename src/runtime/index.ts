/**
 * spark-css — runtime/index.ts
 *
 * Public API:
 *   sc.create()  — define styles (replaced at build time)
 *   sc.merge()   — conflict-aware class merging (last wins)
 *   sc.cx()      — simple conditional class joining
 *   sc.extend()  — create a new instance with custom variants
 */

import type { CSSProperties } from "../types/css";
import {
  mergeVariants,
  DEFAULT_VARIANTS,
  type FlatVariants,
  type VariantValidationError,
} from "../compiler/variants";

/* ── Compile-time meta injected by webpack DefinePlugin ── */
declare const __SPARK_CSS_META__: Record<string, string> | undefined;

let __meta: Record<string, string> = {};

try {
  if (typeof __SPARK_CSS_META__ !== "undefined" && __SPARK_CSS_META__) {
    __meta = __SPARK_CSS_META__;
  }
} catch { /* not available — set via __setMeta */ }

export function __setMeta(meta: Record<string, string>): void {
  __meta = { ...__meta, ...meta };
}

/* ── Style types ── */
export type VariantKey = string;

export type StyleDef = CSSProperties & {
  [key: string]: unknown;
};

type StyleMap       = Record<string, StyleDef>;
type ResolvedMap<T> = { [K in keyof T]: string };

/* ══════════════════════════════════════════
   sc.merge() — conflict-aware merge
   Identical behavior to StyleX props()
══════════════════════════════════════════ */
export function merge(
  ...inputs: (string | undefined | null | false | 0)[]
): string {
  const valid = inputs.filter(
    (x): x is string => typeof x === "string" && x.length > 0
  );

  if (valid.length === 0) return "";
  if (valid.length === 1) return valid[0];

  /* No meta — fall back to deduped concatenation */
  if (Object.keys(__meta).length === 0) {
    return [...new Set(valid.join(" ").split(/\s+/).filter(Boolean))].join(" ");
  }

  const propKeyToClass = new Map<string, string>();
  const unknownClasses = new Set<string>();

  for (const input of valid) {
    for (const cls of input.split(/\s+/)) {
      if (!cls) continue;
      const key = __meta[cls];
      if (key !== undefined) {
        propKeyToClass.set(key, cls); // last wins per prop:selector
      } else {
        unknownClasses.add(cls); // external classes always kept
      }
    }
  }

  return [...propKeyToClass.values(), ...unknownClasses].join(" ");
}

/* ══════════════════════════════════════════
   sc.cx() — simple conditional joining
   Like clsx, zero dependencies
══════════════════════════════════════════ */
export function cx(
  ...inputs: (
    | string
    | undefined
    | null
    | false
    | 0
    | Record<string, boolean>
  )[]
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

/* ══════════════════════════════════════════
   sc.create() — replaced at build time
   Dev fallback only
══════════════════════════════════════════ */
export function create<T extends StyleMap>(map: T): ResolvedMap<T> {
  if (
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "production"
  ) {
    console.error(
      "[spark-css] sc.create() called at runtime in production!\n" +
      "Add withSparkCSS() to next.config.ts or run: npx spark-css extract"
    );
  }

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
      } catch { result[key] = ""; }
    }

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

/* ══════════════════════════════════════════
   sc.extend() — create instance with custom variants
══════════════════════════════════════════ */

export interface ExtendOptions {
  /**
   * Custom variant definitions.
   *
   * Key:   variant name used in sc.create()
   * Value: CSS selector or at-rule
   *
   * Examples:
   *   _tablet: "@media (min-width: 900px)"
   *   _brand:  ".my-brand &"
   *   _print:  "@media print"
   *   _hover2: ":hover:not(:disabled)"
   */
  variants: Record<string, string>;

  /**
   * Optional: override the class name prefix.
   * Default: "sc"
   * Use this to differentiate multiple sc instances.
   */
  prefix?: string;
}

export interface SparkCSSInstance {
  create: typeof create;
  merge:  typeof merge;
  cx:     typeof cx;
  /** The flat variant map for this instance */
  variants: FlatVariants;
  /** Any validation errors from the extend() call */
  errors: VariantValidationError[];
}

/**
 * sc.extend() — Create a new spark-css instance with additional variants.
 *
 * Usage:
 *   // In your spark-css config file (e.g. src/sc.ts)
 *   import { sc } from "spark-css";
 *
 *   export const mysc = sc.extend({
 *     variants: {
 *       _tablet:     "@media (min-width: 900px)",
 *       _widescreen: "@media (min-width: 1800px)",
 *       _brand:      ".my-brand &",
 *       _hoverFocus: ":hover, :focus",
 *     },
 *   });
 *
 *   // In any component:
 *   import { mysc } from "@/sc";
 *
 *   const $ = mysc.create({
 *     card: {
 *       padding:  "1rem",
 *       _tablet:  { padding: "2rem" },   // ✅ custom variant
 *       _brand:   { color: "#f97316" },  // ✅ custom variant
 *     },
 *   });
 *
 * Validation:
 *   Invalid variants are skipped and logged to instance.errors.
 *   Built-in variants can be overridden.
 *   The instance behaves exactly like the default sc object.
 */
export function extend(options: ExtendOptions): SparkCSSInstance {
  const { registry, flat, errors } = mergeVariants(options.variants);

  /* Log errors in development */
  if (errors.length > 0 && typeof process !== "undefined") {
    for (const err of errors) {
      console.warn(`[spark-css] sc.extend() — ${err.message}`);
    }
  }

  /*
   * At build time, the webpack loader reads the VARIANTS from the
   * extractor module. For extend() to work at build time, the user
   * must also pass their custom variants to the Next.js plugin:
   *
   *   withSparkCSS(nextConfig, {
   *     variants: {
   *       _tablet: "@media (min-width: 900px)",
   *     },
   *   });
   *
   * This ensures the extractor knows about custom variants during compilation.
   */

  return {
    create,  // same create — build transform handles the variants
    merge,
    cx,
    variants: flat,
    errors,
  };
}

/* ── Default sc instance ── */
export const sc = {
  create,
  merge,
  cx,
  extend,
  variants: DEFAULT_VARIANTS,
};