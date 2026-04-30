/**
 * traceless-style — compiler/auto-rtl.ts
 *
 * Automatic right-to-left support via CSS logical properties.
 *
 * The professional way to do RTL on the modern web is to use logical
 * properties (`margin-inline-start` instead of `margin-left`, etc.) and
 * let the browser flip them based on the nearest `dir` ancestor. This
 * module is the translator: when the developer writes physical
 * properties, the compiler rewrites them to logical equivalents before
 * registering the atomic rule. The user gets RTL for free — they just
 * add `<html dir="rtl">` (site-wide) or `<section dir="rtl">`
 * (component-scoped) and the layout flips, with zero CSS or runtime
 * cost beyond what they'd pay anyway.
 *
 * Comparison to "auto-dark":
 *   - auto-dark inverts color VALUES → emits a paired `:is(.dark *)` rule
 *   - auto-rtl rewrites the property NAME → uses native browser handling
 *
 * The auto-rtl approach has zero specificity cost and zero extra rules in
 * the CSS file — the same atomic rule serves both directions. That's why
 * it's better than emitting a `[dir="rtl"] &` pair like Tailwind plugins.
 *
 * Defaults to ON. Opt-out per group via `_autoRtl: false`, or globally
 * via `traceless-style.config.js` → `autoRtl: false`.
 */

/* ─── Property name mapping (physical → logical) ───────────────────────── */

const PHYSICAL_TO_LOGICAL: Record<string, string> = {
  // Margin
  marginLeft:           "marginInlineStart",
  marginRight:          "marginInlineEnd",
  "margin-left":        "margin-inline-start",
  "margin-right":       "margin-inline-end",

  // Padding
  paddingLeft:          "paddingInlineStart",
  paddingRight:         "paddingInlineEnd",
  "padding-left":       "padding-inline-start",
  "padding-right":      "padding-inline-end",

  // Border (shorthand + longhand)
  borderLeft:           "borderInlineStart",
  borderRight:          "borderInlineEnd",
  "border-left":        "border-inline-start",
  "border-right":       "border-inline-end",

  borderLeftWidth:      "borderInlineStartWidth",
  borderRightWidth:     "borderInlineEndWidth",
  "border-left-width":  "border-inline-start-width",
  "border-right-width": "border-inline-end-width",

  borderLeftStyle:      "borderInlineStartStyle",
  borderRightStyle:     "borderInlineEndStyle",
  "border-left-style":  "border-inline-start-style",
  "border-right-style": "border-inline-end-style",

  borderLeftColor:      "borderInlineStartColor",
  borderRightColor:     "borderInlineEndColor",
  "border-left-color":  "border-inline-start-color",
  "border-right-color": "border-inline-end-color",

  // Border radius corners — use the start/start, start/end, end/start,
  // end/end logical names. Mnemonic: first half is block (top/bottom),
  // second half is inline (left/right under LTR; right/left under RTL).
  borderTopLeftRadius:     "borderStartStartRadius",
  borderTopRightRadius:    "borderStartEndRadius",
  borderBottomLeftRadius:  "borderEndStartRadius",
  borderBottomRightRadius: "borderEndEndRadius",
  "border-top-left-radius":     "border-start-start-radius",
  "border-top-right-radius":    "border-start-end-radius",
  "border-bottom-left-radius":  "border-end-start-radius",
  "border-bottom-right-radius": "border-end-end-radius",

  // Position offsets (for absolute/fixed/sticky)
  left:                 "insetInlineStart",
  right:                "insetInlineEnd",
};

/* ─── Value-level translations for properties whose VALUES need flipping ─ */

const VALUE_TRANSLATIONS: Record<string, Record<string, string>> = {
  textAlign:        { left: "start",        right: "end"          },
  "text-align":     { left: "start",        right: "end"          },
  textAlignLast:    { left: "start",        right: "end"          },
  "text-align-last":{ left: "start",        right: "end"          },
  float:            { left: "inline-start", right: "inline-end"   },
  clear:            { left: "inline-start", right: "inline-end"   },
  captionSide:      { left: "inline-start", right: "inline-end"   },
  "caption-side":   { left: "inline-start", right: "inline-end"   },
  resize:           { /* no left/right values */ },
};

/* ─── Public API ──────────────────────────────────────────────────────── */

export interface LogicalForm {
  prop:  string;
  value: string;
  /** True iff a translation actually happened (caller can use this to mark
   *  the rule's origin so dev-mode source comments still point at the
   *  original property the developer wrote). */
  changed: boolean;
}

/**
 * Translate a physical CSS declaration to its logical equivalent.
 *
 * Returns the original input unchanged when the property has no logical
 * counterpart (e.g. `display`, `color`, `padding` shorthand) or when the
 * value isn't a translatable keyword. The caller never has to special-case
 * "is this property convertible?" — just pass everything through.
 */
export function convertToLogical(prop: string, value: string): LogicalForm {
  const newProp = PHYSICAL_TO_LOGICAL[prop];
  // Value translations key by the ORIGINAL prop name (textAlign:left lookup
  // happens before the prop is rewritten — and textAlign has no logical
  // prop name, only a value translation, so this lookup is correct).
  const valueMap = VALUE_TRANSLATIONS[prop] ?? VALUE_TRANSLATIONS[newProp ?? ""] ?? {};
  const newValue = valueMap[value.trim()];

  if (newProp || newValue) {
    return {
      prop:    newProp  ?? prop,
      value:   newValue ?? value,
      changed: true,
    };
  }
  return { prop, value, changed: false };
}

/** True iff this property has a physical-to-logical translation (or a
 *  value-level translation we'd apply if the value matches). Used by the
 *  inspect/audit commands to surface which rules went through auto-rtl. */
export function hasLogicalForm(prop: string): boolean {
  return prop in PHYSICAL_TO_LOGICAL || prop in VALUE_TRANSLATIONS;
}
