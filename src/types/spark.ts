 /**
 * spark-css — types/spark.ts
 *
 * Core TypeScript types for the spark-css API.
 * StyleX-equivalent strictness — typos caught at compile time.
 */

import type { CSSProperties } from "./css";

/* ════════════════════════════════════════
   VARIANT TYPES
════════════════════════════════════════ */

/** All built-in variant keys */
export type BuiltInVariantKey =
  | "_hover"        | "_focus"        | "_focusWithin"  | "_focusVisible"
  | "_active"       | "_visited"      | "_disabled"     | "_enabled"
  | "_checked"      | "_indeterminate"| "_required"     | "_optional"
  | "_valid"        | "_invalid"      | "_readOnly"
  | "_first"        | "_last"         | "_firstOfType"  | "_lastOfType"
  | "_only"         | "_odd"          | "_even"         | "_empty"
  | "_placeholder"  | "_before"       | "_after"        | "_selection" | "_marker"
  | "_dark"         | "_light"
  | "_rtl"          | "_ltr"
  | "_groupHover"   | "_groupFocus"   | "_groupActive"
  | "_peerHover"    | "_peerFocus"    | "_peerChecked"  | "_peerDisabled"
  | "sm" | "md" | "lg" | "xl" | "2xl"
  | "print"         | "portrait"      | "landscape"
  | "motionSafe"    | "motionReduce"  | "contrastMore"
  | "darkOS"        | "lightOS"       | "hover"         | "touch";

/* ════════════════════════════════════════
   STYLE DEFINITION TYPES
════════════════════════════════════════ */

/**
 * A style definition for sc.create().
 * Accepts CSS properties + variant keys.
 * Variant values must be plain style objects (no nesting).
 *
 * Custom variants from sc.extend() are also accepted
 * via the string index signature.
 */
export type StyleDef<TVariants extends string = BuiltInVariantKey> = {
  [K in keyof CSSProperties]?: CSSProperties[K];
} & {
  [K in TVariants]?: {
    [P in keyof CSSProperties]?: CSSProperties[P];
  };
} & {
  /**
   * Custom variants from sc.extend() are accepted here.
   * TypeScript won't autocomplete them (they're dynamic)
   * but won't throw an error either.
   */
  [key: string]: CSSProperties[keyof CSSProperties] | {
    [P in keyof CSSProperties]?: CSSProperties[P];
  } | undefined;
};

/** A map of style keys to StyleDef objects */
export type StyleMap<TVariants extends string = BuiltInVariantKey> = {
  [key: string]: StyleDef<TVariants>;
};

/** The resolved output of sc.create() — maps each key to a class string */
export type ResolvedStyleMap<T extends StyleMap> = {
  readonly [K in keyof T]: string;
};

/* ════════════════════════════════════════
   SC.CREATE() TYPE
════════════════════════════════════════ */

/**
 * Typed version of sc.create().
 * Returns a read-only map of key → class string.
 * Keys are typed from the input — full autocomplete.
 */
export interface CreateFn {
  <T extends StyleMap>(map: T): ResolvedStyleMap<T>;
}

/* ════════════════════════════════════════
   SC.MERGE() TYPE
════════════════════════════════════════ */

/**
 * Typed version of sc.merge().
 * Accepts class strings or falsy values.
 * Returns a class string.
 */
export interface MergeFn {
  (...inputs: (string | undefined | null | false | 0)[]): string;
}

/* ════════════════════════════════════════
   SC.CX() TYPE
════════════════════════════════════════ */

/**
 * Typed version of sc.cx().
 * Like clsx — accepts strings and conditional objects.
 */
export interface CxFn {
  (...inputs: (
    | string
    | undefined
    | null
    | false
    | 0
    | Record<string, boolean>
  )[]): string;
}

/* ════════════════════════════════════════
   SC.EXTEND() TYPES
════════════════════════════════════════ */

/** Options for sc.extend() */
export interface ExtendOptions {
  /**
   * Custom variant definitions.
   *
   * Key:   variant name used in sc.create() (must be a valid CSS identifier)
   * Value: CSS selector or at-rule
   *
   * Valid examples:
   *   _tablet:     "@media (min-width: 900px)"
   *   _brand:      ".my-brand &"
   *   _hoverFocus: ":hover, :focus"
   *   _nthChild3:  ":nth-child(3)"
   *
   * Invalid examples (caught with runtime warning):
   *   "123abc":  "..."   ← invalid identifier
   *   _custom:   ""      ← empty selector
   *   _evil:     "<script>..." ← rejected
   */
  variants: Record<string, string>;
}

/** A spark-css instance returned by sc.extend() */
export interface SparkCSSInstance {
  /** Define styles — replaced at build time */
  create: CreateFn;
  /** Conflict-aware merge — last property wins */
  merge:  MergeFn;
  /** Conditional class joining */
  cx:     CxFn;
  /** Flat variant map for this instance */
  variants: Record<string, string>;
  /** Any validation errors from the extend() call */
  errors: Array<{ key: string; message: string }>;
}

/** The default sc object */
export interface SparkCSS {
  create:  CreateFn;
  merge:   MergeFn;
  cx:      CxFn;
  extend:  (options: ExtendOptions) => SparkCSSInstance;
  variants: Record<string, string>;
}

/* ════════════════════════════════════════
   STRICT MODE HELPERS
════════════════════════════════════════ */

/**
 * Ensure a value is a valid CSS property value at compile time.
 * Used internally.
 */
export type ValidCSSValue<T extends keyof CSSProperties> = CSSProperties[T];

/**
 * Extract the keys of a resolved style map as a union type.
 * Useful for typing className props.
 *
 * Example:
 *   const $ = sc.create({ card: {...}, title: {...} });
 *   type StyleKey = StyleKeys<typeof $>; // "card" | "title"
 */
export type StyleKeys<T extends Record<string, string>> = keyof T;

/**
 * A className value — always a string (from sc.create output).
 * Use this to type className props that accept spark-css output.
 *
 * Example:
 *   interface Props { className?: SparkClassName }
 */
export type SparkClassName = string;