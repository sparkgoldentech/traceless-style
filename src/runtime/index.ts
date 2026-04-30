/**
 * traceless-style — runtime/index.ts
 * Public API: tl.create(), tl.merge(), tl.cx(), tl.extend()
 */

import {
  mergeVariants,
  DEFAULT_VARIANTS,
  type FlatVariants,
  type VariantValidationError,
} from "../compiler/variants";
// Import the same auto-dark + auto-rtl helpers the compiler uses, so the
// runtime fallback emits IDENTICAL atomic classes to what the compiler
// would produce. tsup inlines these (no externals match them) so the
// runtime bundle is self-contained.
import { deriveDarkColor, isAutoDarkProperty } from "../compiler/auto-dark";
import { convertToLogical }                    from "../compiler/auto-rtl";
import { maybeShowDevtoolsHint }               from "./devtools-hint";

export type { CSSProperties }                                from "../types/css";
export type { StyleDef, StyleMap, ResolvedStyleMap,
              TracelessClassName, StyleKeys,
              ExtendOptions, TracelessStyleInstance }        from "../types/traceless";

/* ── Compile-time meta injected by webpack DefinePlugin ── */
declare const __TRACELESS_STYLE_META__: Record<string, string> | undefined;

let __meta: Record<string, string> = {};
try {
  if (typeof __TRACELESS_STYLE_META__ !== "undefined" && __TRACELESS_STYLE_META__) {
    __meta = __TRACELESS_STYLE_META__;
  }
} catch { /* not available */ }

export function __setMeta(meta: Record<string, string>): void {
  __meta = { ...__meta, ...meta };
}

type AnyStyleMap   = Record<string, Record<string, unknown>>;
type ResolvedMap<T>= { [K in keyof T]: string };

/* ══════════════════════════════════════════
   tl.merge() — conflict-aware, last wins
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
   tl.cx() — conditional class joining
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
   Ensures tl.create() fallback produces
   CORRECT class names in all environments
══════════════════════════════════════════ */
// 8-char base36 hash. MUST stay byte-identical to compiler/hash.ts —
// any divergence means runtime fallback emits classes the compiler
// didn't, breaking SSR / RSC / un-transformed paths. Two parallel
// 32-bit FNV-1a's with different primes; combined via BigInt to 64
// bits; reduced mod 36^8; padded to exactly 8 chars.
const _H8_SPACE = 36n ** 8n;
function _fnv32a(str: string): string {
  let a = 0x811c9dc5 >>> 0;
  let b = 0x84222325 >>> 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x05f5e101) >>> 0;
  }
  const combined = ((BigInt(a) << 32n) | BigInt(b)) % _H8_SPACE;
  return combined.toString(36).padStart(8, "0");
}

function _classFor(prop: string, value: string, selector?: string): string {
  return `tl${_fnv32a(selector ? `${prop}:${value}:${selector}` : `${prop}:${value}`)}`;
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

/* Module-level custom variant registry — populated by tl.extend() */
const _customVariants: Record<string, string> = {};

function _processStyles(
  obj:      Record<string, unknown>,
  variants: Record<string, string>,
  selector?: string
): string[] {
  const classes: string[] = [];

  // Mirror the compiler: top-level opt-outs.
  const autoDarkLocal =
    Object.prototype.hasOwnProperty.call(obj, "_autoDark")
      ? (obj as Record<string, unknown>)._autoDark !== false
      : true;
  const autoRtlLocal =
    Object.prototype.hasOwnProperty.call(obj, "_autoRtl")
      ? (obj as Record<string, unknown>)._autoRtl !== false
      : true;
  const explicitDarkOverrides = new Set<string>();
  const darkVariant = (obj as Record<string, unknown>)._dark;
  if (darkVariant && typeof darkVariant === "object") {
    for (const k of Object.keys(darkVariant as Record<string, unknown>)) {
      explicitDarkOverrides.add(k);
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue;
    if (key === "_autoDark") continue;
    if (key === "_autoRtl") continue;
    if (key === "_layer")   continue;
    if (key === "_bundle")  continue;
    if (key in variants) {
      if (typeof value === "object")
        classes.push(..._processStyles(value as Record<string, unknown>, variants, variants[key]));
      continue;
    }
    // Raw @-rule / selector keys — pass through as-is (mirrors compiler).
    if (typeof value === "object" && (
      key.startsWith("@") ||
      key.startsWith(":") ||
      key.startsWith("[") ||
      key.startsWith(".") ||
      key.includes("&")
    )) {
      classes.push(..._processStyles(value as Record<string, unknown>, variants, key));
      continue;
    }
    if (typeof value !== "object") {
      // Same auto-rtl rewrite the compiler does, so the hash matches the
      // CSS file. Hash is computed on the LOGICAL form whenever auto-rtl
      // is on for this group.
      const rawVal = String(value);
      const rtl    = autoRtlLocal
        ? convertToLogical(key, rawVal)
        : { prop: key, value: rawVal, changed: false };
      const emittedKey   = rtl.prop;
      const emittedValue = rtl.value;

      classes.push(_classFor(emittedKey, emittedValue, selector));

      // Auto-dark: emit the paired class with the same hash function the
      // compiler uses, so the rule already in the CSS file matches.
      if (
        autoDarkLocal &&
        isAutoDarkProperty(emittedKey) &&
        !explicitDarkOverrides.has(key) &&
        (selector === undefined || !selector.includes(".dark"))
      ) {
        const darkValue = deriveDarkColor(emittedValue);
        if (darkValue) {
          const darkSelector = selector
            ? `:is(.dark *)${selector.startsWith(":") ? selector : ` ${selector}`}`
            : ":is(.dark *)";
          classes.push(_classFor(emittedKey, darkValue, darkSelector));
        }
      }
    }
  }
  return classes;
}

/* ══════════════════════════════════════════
   tl.create() — deterministic fallback
   Uses same FNV-1a hash as the compiler.
   Produces IDENTICAL output in all envs:
     - Static generation workers
     - Server Components
     - Jest tests
     - Dev without webpack transform
══════════════════════════════════════════ */
export function create<T extends AnyStyleMap>(map: T): ResolvedMap<T> {
  // One-time DevTools install hint in dev mode. Internally guarded so
  // we can call unconditionally — never throws, never duplicates.
  maybeShowDevtoolsHint();
  const variants = { ..._BUILT_IN, ..._customVariants };
  const result: Record<string, string> = {};
  for (const [key, styles] of Object.entries(map)) {
    const classes = _processStyles(styles as Record<string, unknown>, variants);
    result[key]   = [...new Set(classes)].join(" ");
  }
  return result as ResolvedMap<T>;
}

/* ══════════════════════════════════════════
   tl.extend() — custom variants
══════════════════════════════════════════ */
export interface LocalExtendOptions {
  variants: Record<string, string>;
  prefix?:  string;
}

export interface LocalTracelessStyleInstance {
  create:   typeof create;
  merge:    typeof merge;
  cx:       typeof cx;
  variants: FlatVariants;
  errors:   VariantValidationError[];
}

export function extend(options: LocalExtendOptions): LocalTracelessStyleInstance {
  const { flat, errors } = mergeVariants(options.variants);
  if (errors.length > 0)
    for (const err of errors) console.warn(`[traceless-style] tl.extend() — ${err.message}`);

  /* Register at module level so create() uses them */
  Object.assign(_customVariants, options.variants);

  return { create, merge, cx, variants: flat, errors };
}

/* ══════════════════════════════════════════
   Design tokens & themes.

   API:
     const t   = tl.defineTokens({ brand: { primary: "#3b82f6" } });
     const dk  = tl.createTheme("dark", { brand: { primary: "#60a5fa" } });
     const $   = tl.create({ btn: { color: tl.cssVar("brand-primary") } });
     <body className={dk}><button className={$.btn}/></body>

   At build time, the compiler:
     - emits `:root { --tl-<hash>: value; ... }` for defineTokens
     - emits `.tlTheme<hash> { --tl-<hash>: override; }` for createTheme
     - replaces `tl.cssVar("name")` with the literal `"var(--tl-<hash>)"`
       inside tl.create() values.

   The runtime versions below are the dev/SSR fallback — they produce
   the same names so behavior is identical whether the compiler ran
   or not. The hash MUST stay in sync with compiler/tokens.ts (same
   invariant as the existing runtime↔compiler hash pairing).
══════════════════════════════════════════ */

function _tokenVarName(key: string): string {
  return `tl-${_fnv32a("token:" + key)}`;
}

function _themeClassName(name: string): string {
  return `tlTheme${_fnv32a("theme:" + name)}`;
}

function _flatten(
  obj:    Record<string, unknown>,
  prefix: string = ""
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}-${k}` : k;
    if (v && typeof v === "object") out.push(..._flatten(v as Record<string, unknown>, key));
    else if (typeof v === "string" || typeof v === "number") out.push([key, String(v)]);
  }
  return out;
}

/** Turn a nested token-value map into a typed `{ leafKey: "var(--sc-<hash>)" }` object. */
type FlatTokens<T> = T extends Record<string, infer V>
  ? V extends string | number
    ? { [K in keyof T]: string }
    : V extends Record<string, unknown>
      ? { [K in keyof T]: FlatTokens<V> }
      : never
  : never;

export function defineTokens<T extends Record<string, unknown>>(map: T): FlatTokens<T> {
  // Walk the map and replace each leaf with `"var(--sc-<hash>)"` — keeping
  // the same nested shape so users can read tokens.brand.primary.
  function walk(o: Record<string, unknown>, prefix: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      const key = prefix ? `${prefix}-${k}` : k;
      if (v && typeof v === "object")
        out[k] = walk(v as Record<string, unknown>, key);
      else
        out[k] = `var(--${_tokenVarName(key)})`;
    }
    return out;
  }
  return walk(map, "") as FlatTokens<T>;
}

export function createTheme(
  name:      string,
  _overrides: Record<string, unknown>
): string {
  // The runtime form just produces the class name. The compiler emits
  // the matching `.scTheme<hash> { ... }` rule. If neither has run
  // (rare — dev without bundler transform), the user gets the class
  // applied with no overrides — visually a no-op rather than a crash.
  return _themeClassName(name);
}

/**
 * Reference a token's CSS variable by its dotted/dashed leaf path.
 *
 * The optional generic `T` lets you constrain the argument to the leaf
 * keys of a token map you've already declared:
 *
 *   const tokens = tl.defineTokens({ brand: { primary: "..." }, spacing: { md: "..." } });
 *   tl.cssVar<TokenKeyOf<typeof tokens>>("brand-primary");   // ✓
 *   tl.cssVar<TokenKeyOf<typeof tokens>>("brand-typo");      // ✗ compile error
 *
 * Without the generic, any string is accepted (back-compat).
 */
export function cssVar<T extends string = string>(name: T): string {
  return `var(--${_tokenVarName(name)})`;
}

/**
 * Extract every dash-joined leaf path from a token shape produced by
 * `defineTokens`. Inverse of FlatTokens — recursively walks nested
 * objects and produces "outer-inner-leaf" string literals.
 */
export type TokenKeyOf<T> = T extends Record<string, infer V>
  ? V extends string
    ? keyof T & string
    : V extends Record<string, unknown>
      ? { [K in keyof T & string]: `${K}-${TokenKeyOf<T[K]>}` }[keyof T & string]
      : never
  : never;

/**
 * A class-name string produced by traceless-style. Branded so component props
 * can declare "this must be a tl.create / tl.merge / tl.cx output" rather
 * than accept any string. Useful for design-system component APIs:
 *
 *   function Button(props: { className?: TracelessClass }) { ... }
 *   <Button className={$.btn} />          // ✓
 *   <Button className="raw-string" />     // ✓ at runtime, but caller can
 *                                         //   tighten with `as TracelessClass`
 *                                         //   to make accidental string
 *                                         //   passing visible.
 *
 * The brand is structural and erased at runtime — no overhead.
 */
export type TracelessClass = string & { readonly __tracelessClass?: unique symbol };

function _keyframeName(name: string): string {
  return `tlKf${_fnv32a("keyframes:" + name)}`;
}

/**
 * Declare a keyframe animation. Returns the hashed identifier so it can
 * be used directly in an `animation:` value:
 *
 *   const fadeIn = tl.keyframes("fadeIn", {
 *     from: { opacity: 0 },
 *     to:   { opacity: 1 },
 *   });
 *   tl.create({ modal: { animation: `${fadeIn} 0.2s ease-in` } });
 *
 * The compiler emits the corresponding `@keyframes scKfXXX { ... }` rule
 * to the generated CSS file. At runtime (untransformed paths), this
 * function is a pure name producer — the CSS rule is supplied by the
 * compiler. Same hash invariant pattern as defineTokens / createTheme.
 */
export function keyframes(
  name:    string,
  _frames: Record<string, Record<string, unknown>>
): string {
  return _keyframeName(name);
}

/* ── Default tl instance ── */
export const tl = {
  create, merge, cx, extend,
  defineTokens, createTheme, cssVar, keyframes,
  variants: DEFAULT_VARIANTS,
};