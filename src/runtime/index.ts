/**
 * spark-css — runtime/index.ts
 * Public API: sc.create(), sc.merge(), sc.cx(), sc.extend()
 */

import {
  mergeVariants,
  DEFAULT_VARIANTS,
  type FlatVariants,
  type VariantValidationError,
} from "../compiler/variants";

export type { CSSProperties }                                from "../types/css";
export type { StyleDef, StyleMap, ResolvedStyleMap,
              SparkClassName, StyleKeys,
              ExtendOptions, SparkCSSInstance }              from "../types/spark";

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

type AnyStyleMap   = Record<string, Record<string, unknown>>;
type ResolvedMap<T>= { [K in keyof T]: string };

/* ══════════════════════════════════════════
   sc.merge() — conflict-aware, last wins
══════════════════════════════════════════ */
export function merge(
  ...inputs: (string | undefined | null | false | 0)[]
): string {
  const valid = inputs.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (valid.length === 0) return "";
  if (valid.length === 1) return valid[0];
  if (Object.keys(__meta).length === 0)
    return [...new Set(valid.join(" ").split(/\s+/).filter(Boolean))].join(" ");

  const propKeyToClass = new Map<string, string>();
  const unknownClasses = new Set<string>();
  for (const input of valid) {
    for (const cls of input.split(/\s+/)) {
      if (!cls) continue;
      const key = __meta[cls];
      if (key !== undefined) propKeyToClass.set(key, cls);
      else unknownClasses.add(cls);
    }
  }
  return [...propKeyToClass.values(), ...unknownClasses].join(" ");
}

/* ══════════════════════════════════════════
   sc.cx() — conditional class joining
══════════════════════════════════════════ */
export function cx(
  ...inputs: (string | undefined | null | false | 0 | Record<string, boolean>)[]
): string {
  const classes: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === "string") classes.push(input);
    else if (typeof input === "object")
      for (const [cls, on] of Object.entries(input)) if (on && cls) classes.push(cls);
  }
  return classes.join(" ");
}

/* ══════════════════════════════════════════
   Inline hash — identical to compiler
   Ensures sc.create() fallback produces
   CORRECT class names in all environments
══════════════════════════════════════════ */
function _fnv32a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h.toString(36).slice(0, 6);
}

function _classFor(prop: string, value: string, selector?: string): string {
  return `sc${_fnv32a(selector ? `${prop}:${value}:${selector}` : `${prop}:${value}`)}`;
}

const _BUILT_IN: Record<string, string> = {
  _hover:":hover", _focus:":focus", _focusWithin:":focus-within",
  _focusVisible:":focus-visible", _active:":active", _visited:":visited",
  _disabled:":disabled", _checked:":checked", _placeholder:"::placeholder",
  _before:"::before", _after:"::after", _selection:"::selection",
  _dark:":is(.dark *)", _light:":not(.dark) &",
  _rtl:"[dir=\"rtl\"] &", _ltr:"[dir=\"ltr\"] &",
  _first:":first-child", _last:":last-child",
  _odd:":nth-child(odd)", _even:":nth-child(even)", _empty:":empty",
  _groupHover:".group:hover &", _groupFocus:".group:focus &",
  _peerFocus:".peer:focus ~ &", _peerChecked:".peer:checked ~ &",
  sm:"@media (min-width:640px)", md:"@media (min-width:768px)",
  lg:"@media (min-width:1024px)", xl:"@media (min-width:1280px)",
  "2xl":"@media (min-width:1536px)", print:"@media print",
  motionSafe:"@media (prefers-reduced-motion:no-preference)",
  motionReduce:"@media (prefers-reduced-motion:reduce)",
  darkOS:"@media (prefers-color-scheme:dark)",
};

/* Module-level custom variant registry — populated by sc.extend() */
const _customVariants: Record<string, string> = {};

function _processStyles(
  obj:      Record<string, unknown>,
  variants: Record<string, string>,
  selector?: string
): string[] {
  const classes: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue;
    if (key in variants) {
      if (typeof value === "object")
        classes.push(..._processStyles(value as Record<string, unknown>, variants, variants[key]));
      continue;
    }
    if (typeof value !== "object")
      classes.push(_classFor(key, String(value), selector));
  }
  return classes;
}

/* ══════════════════════════════════════════
   sc.create() — deterministic fallback
   Uses same FNV-1a hash as the compiler.
   Produces IDENTICAL output in all envs:
     - Static generation workers
     - Server Components
     - Jest tests
     - Dev without webpack transform
══════════════════════════════════════════ */
export function create<T extends AnyStyleMap>(map: T): ResolvedMap<T> {
  const variants = { ..._BUILT_IN, ..._customVariants };
  const result: Record<string, string> = {};
  for (const [key, styles] of Object.entries(map)) {
    const classes = _processStyles(styles as Record<string, unknown>, variants);
    result[key]   = [...new Set(classes)].join(" ");
  }
  return result as ResolvedMap<T>;
}

/* ══════════════════════════════════════════
   sc.extend() — custom variants
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
  if (errors.length > 0)
    for (const err of errors) console.warn(`[spark-css] sc.extend() — ${err.message}`);

  /* Register at module level so create() uses them */
  Object.assign(_customVariants, options.variants);

  return { create, merge, cx, variants: flat, errors };
}

/* ── Default sc instance ── */
export const sc = { create, merge, cx, extend, variants: DEFAULT_VARIANTS };