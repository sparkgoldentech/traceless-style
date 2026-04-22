/**
 * spark-css v3 — runtime/index.ts
 *
 * The ONLY runtime code. Extremely tiny (~200 bytes gzipped).
 * After build-time extraction, sc.create() returns a plain object.
 * This file only provides:
 * 1. sc.merge() — conflict-aware class merging
 * 2. sc.cx()    — simple class joining
 * 3. sc.create()— dev-mode fallback (never runs in production)
 */

import type { CSSProperties }  from "../types/css";
import type { VariantKey }     from "../types/variants";
import { VARIANTS }            from "../compiler/extractor";

export type StyleDef = CSSProperties & {
  [K in VariantKey]?: CSSProperties;
} & {
  [key: string]: unknown;
};

type StyleMap       = Record<string, StyleDef>;
type ResolvedMap<T> = { [K in keyof T]: string };

/* ── Class meta for conflict resolution (loaded from generated file) ── */
let __meta: Record<string, string> = {};

export function __setMeta(meta: Record<string, string>): void {
  __meta = meta;
}

/**
 * Conflict-aware merge.
 * Last definition of a CSS property wins.
 *
 * Example:
 *   sc.merge(styles.base, isActive && styles.active)
 */
export function merge(...inputs: (string | undefined | null | false)[]): string {
  if (!inputs.some(Boolean)) return "";

  // If no meta loaded, fall back to simple concat
  if (Object.keys(__meta).length === 0) {
    return inputs.filter(Boolean).join(" ");
  }

  const propToClass = new Map<string, string>();
  for (const input of inputs) {
    if (!input) continue;
    for (const cls of input.split(/\s+/)) {
      if (!cls) continue;
      const metaKey = __meta[cls];
      propToClass.set(metaKey ?? cls, cls);
    }
  }
  return [...propToClass.values()].join(" ");
}

/**
 * Simple class joining — no conflict resolution.
 * Like clsx but zero dependencies.
 */
export function cx(...inputs: (string | undefined | null | false | Record<string, boolean>)[]): string {
  const classes: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === "string") {
      classes.push(input);
    } else if (typeof input === "object") {
      for (const [cls, active] of Object.entries(input)) {
        if (active) classes.push(cls);
      }
    }
  }
  return classes.join(" ");
}

/**
 * sc.create() — at RUNTIME this is a development-only fallback.
 * In production after extraction, calls to this are replaced by plain objects.
 */
export function create<T extends StyleMap>(map: T): ResolvedMap<T> {
  if (process.env.NODE_ENV === "production") {
    // This should never run in production
    // If it does, it means the extraction step was skipped
    console.error(
      "[spark-css] sc.create() called at runtime in production!\n" +
      "Run `npx spark-css extract` before building.\n" +
      "Add to package.json: \"build\": \"spark-css extract && next build\""
    );
  }

  // Dev fallback: runtime hash generation
  try {
    const { transform, globalRegistry } = require("../compiler/extractor");
    const { generateCSS }               = require("../compiler/css-gen");

    const result: Record<string, string> = {};
    for (const [key, styles] of Object.entries(map)) {
      const src      = `sc.create(${JSON.stringify({ [key]: styles })})`;
      const { code } = transform(src, "runtime");
      try {
        // eslint-disable-next-line no-new-func
        const parsed = JSON.parse(code) as Record<string, string>;
        result[key]  = parsed[key] ?? "";
      } catch {
        result[key] = "";
      }
    }

    // Inject CSS into DOM (dev only)
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