/**
 * spark-css — runtime/index.ts
 *
 * Public API:
 *   sc.create()  — define styles (replaced at build time)
 *   sc.merge()   — conflict-aware class merging (last wins)
 *   sc.cx()      — simple conditional class joining
 *   sc.extend()  — create a new instance with custom variants
 */

import {
  mergeVariants,
  DEFAULT_VARIANTS,
  type FlatVariants,
  type VariantValidationError,
} from "../compiler/variants";

/* ── Re-export all public types ── */
export type { CSSProperties }                                          from "../types/css";
export type {
  StyleDef, StyleMap, ResolvedStyleMap,
  SparkClassName, StyleKeys,
  ExtendOptions, SparkCSSInstance,
}                                                                      from "../types/spark";

/* ── Compile-time meta injected by webpack DefinePlugin ── */
declare const __SPARK_CSS_META__: Record<string, string> | undefined;

let __meta: Record<string, string> = {};
try {
  if (typeof __SPARK_CSS_META__ !== "undefined" && __SPARK_CSS_META__) {
    __meta = __SPARK_CSS_META__;
  }
} catch { /* not available */ }

export function __setMeta(meta: Record<string, string>): void {
  __meta = { ...__meta, ...meta };
}

/* ── Internal style map types ── */
type AnyStyleMap  = Record<string, Record<string, unknown>>;
type ResolvedMap<T> = { [K in keyof T]: string };

/* ══════════════════════════════════════════
   sc.merge() — conflict-aware, last wins
   Identical to StyleX props() behavior
══════════════════════════════════════════ */
export function merge(
  ...inputs: (string | undefined | null | false | 0)[]
): string {
  const valid = inputs.filter(
    (x): x is string => typeof x === "string" && x.length > 0
  );
  if (valid.length === 0) return "";
  if (valid.length === 1) return valid[0];

  if (Object.keys(__meta).length === 0) {
    return [...new Set(valid.join(" ").split(/\s+/).filter(Boolean))].join(" ");
  }

  const propKeyToClass = new Map<string, string>();
  const unknownClasses = new Set<string>();

  for (const input of valid) {
    for (const cls of input.split(/\s+/)) {
      if (!cls) continue;
      const key = __meta[cls];
      if (key !== undefined) propKeyToClass.set(key, cls);
      else                   unknownClasses.add(cls);
    }
  }

  return [...propKeyToClass.values(), ...unknownClasses].join(" ");
}

/* ══════════════════════════════════════════
   sc.cx() — simple conditional class joining
   Zero dependencies, like clsx
══════════════════════════════════════════ */
export function cx(
  ...inputs: (string | undefined | null | false | 0 | Record<string, boolean>)[]
): string {
  const classes: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === "string") {
      classes.push(input);
    } else if (typeof input === "object") {
      for (const [cls, on] of Object.entries(input)) {
        if (on && cls) classes.push(cls);
      }
    }
  }
  return classes.join(" ");
}

/* ══════════════════════════════════════════
   sc.create() — replaced at build time
   This function only runs in dev / without webpack transform
══════════════════════════════════════════ */
export function create<T extends AnyStyleMap>(map: T): ResolvedMap<T> {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    console.error(
      "[spark-css] sc.create() ran at runtime in production!\n" +
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
      const { code } = transform(`sc.create(${JSON.stringify({ [key]: styles })})`, "runtime");
      try { result[key] = (JSON.parse(code) as Record<string, string>)[key] ?? ""; }
      catch { result[key] = ""; }
    }
    if (typeof document !== "undefined") {
      const css = generateCSS(globalRegistry.getAll());
      let tag = document.querySelector<HTMLStyleElement>("style[data-sc]");
      if (!tag) { tag = document.createElement("style"); tag.setAttribute("data-sc","1"); document.head.appendChild(tag); }
      tag.textContent = css;
    }
    return result as ResolvedMap<T>;
  } catch {
    const r: Record<string, string> = {};
    for (const k of Object.keys(map)) r[k] = "";
    return r as ResolvedMap<T>;
  }
}

/* ══════════════════════════════════════════
   sc.extend() — custom variants instance
══════════════════════════════════════════ */
export interface LocalExtendOptions {
  variants: Record<string, string>;
  prefix?:  string;
}

export interface LocalSparkCSSInstance {
  create:   typeof create;
  merge:    typeof merge;
  cx:       typeof cx;
  variants: FlatVariants;
  errors:   VariantValidationError[];
}

export function extend(options: LocalExtendOptions): LocalSparkCSSInstance {
  const { flat, errors } = mergeVariants(options.variants);
  if (errors.length > 0) {
    for (const err of errors) {
      console.warn(`[spark-css] sc.extend() — ${err.message}`);
    }
  }
  return { create, merge, cx, variants: flat, errors };
}

/* ── Default sc instance ── */
export const sc = { create, merge, cx, extend, variants: DEFAULT_VARIANTS };