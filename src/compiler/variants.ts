 /**
 * spark-css — compiler/variants.ts
 *
 * Central variant registry. All built-in variants live here.
 * sc.extend() creates a new registry with additional variants.
 *
 * Variant types:
 *   Pseudo-class:   _hover    → ":hover"
 *   Pseudo-element: _before   → "::before"
 *   Parent select:  _dark     → ":is(.dark *)"
 *   Ancestor:       _rtl      → '[dir="rtl"] &'
 *   Media query:    sm        → "@media (min-width:640px)"
 */

export type VariantSelector = string;

export interface VariantDefinition {
  /** The CSS selector or at-rule this variant maps to */
  selector: VariantSelector;
  /**
   * Category for documentation and error messages.
   * "pseudo"    → :hover, :focus, ::before
   * "parent"    → .dark &, [dir="rtl"] &
   * "media"     → @media (...)
   * "custom"    → user-defined via sc.extend()
   */
  type: "pseudo" | "parent" | "media" | "custom";
  /** Human-readable description */
  description?: string;
}

/** Full registry type */
export type VariantRegistry = Record<string, VariantDefinition>;

/* ════════════════════════════════════════════
   BUILT-IN VARIANTS
════════════════════════════════════════════ */
export const BUILT_IN_VARIANTS: VariantRegistry = {

  /* ── Pseudo-classes ── */
  _hover:        { selector: ":hover",            type: "pseudo",  description: "Mouse hover" },
  _focus:        { selector: ":focus",            type: "pseudo",  description: "Keyboard focus" },
  _focusWithin:  { selector: ":focus-within",     type: "pseudo",  description: "Focus within element" },
  _focusVisible: { selector: ":focus-visible",    type: "pseudo",  description: "Visible focus ring" },
  _active:       { selector: ":active",           type: "pseudo",  description: "Mouse pressed" },
  _visited:      { selector: ":visited",          type: "pseudo",  description: "Visited link" },
  _disabled:     { selector: ":disabled",         type: "pseudo",  description: "Disabled element" },
  _enabled:      { selector: ":enabled",          type: "pseudo",  description: "Enabled element" },
  _checked:      { selector: ":checked",          type: "pseudo",  description: "Checked checkbox/radio" },
  _indeterminate:{ selector: ":indeterminate",    type: "pseudo",  description: "Indeterminate state" },
  _required:     { selector: ":required",         type: "pseudo",  description: "Required field" },
  _optional:     { selector: ":optional",         type: "pseudo",  description: "Optional field" },
  _valid:        { selector: ":valid",            type: "pseudo",  description: "Valid input" },
  _invalid:      { selector: ":invalid",          type: "pseudo",  description: "Invalid input" },
  _readOnly:     { selector: ":read-only",        type: "pseudo",  description: "Read-only element" },
  _first:        { selector: ":first-child",      type: "pseudo",  description: "First child" },
  _last:         { selector: ":last-child",       type: "pseudo",  description: "Last child" },
  _firstOfType:  { selector: ":first-of-type",    type: "pseudo",  description: "First of type" },
  _lastOfType:   { selector: ":last-of-type",     type: "pseudo",  description: "Last of type" },
  _only:         { selector: ":only-child",       type: "pseudo",  description: "Only child" },
  _odd:          { selector: ":nth-child(odd)",   type: "pseudo",  description: "Odd children" },
  _even:         { selector: ":nth-child(even)",  type: "pseudo",  description: "Even children" },
  _empty:        { selector: ":empty",            type: "pseudo",  description: "Empty element" },

  /* ── Pseudo-elements ── */
  _placeholder:  { selector: "::placeholder",     type: "pseudo",  description: "Input placeholder" },
  _before:       { selector: "::before",          type: "pseudo",  description: "::before pseudo-element" },
  _after:        { selector: "::after",           type: "pseudo",  description: "::after pseudo-element" },
  _selection:    { selector: "::selection",       type: "pseudo",  description: "Text selection" },
  _marker:       { selector: "::marker",          type: "pseudo",  description: "List marker" },

  /* ── Parent/ancestor selectors ── */
  _dark:         { selector: ":is(.dark *)",          type: "parent", description: "Dark mode (class strategy)" },
  _light:        { selector: ":not(.dark) &",         type: "parent", description: "Light mode" },
  _rtl:          { selector: '[dir="rtl"] &',         type: "parent", description: "RTL direction" },
  _ltr:          { selector: '[dir="ltr"] &',         type: "parent", description: "LTR direction" },
  _groupHover:   { selector: ".group:hover &",        type: "parent", description: "Parent group hover" },
  _groupFocus:   { selector: ".group:focus &",        type: "parent", description: "Parent group focus" },
  _groupActive:  { selector: ".group:active &",       type: "parent", description: "Parent group active" },
  _peerHover:    { selector: ".peer:hover ~ &",       type: "parent", description: "Peer element hover" },
  _peerFocus:    { selector: ".peer:focus ~ &",       type: "parent", description: "Peer element focus" },
  _peerChecked:  { selector: ".peer:checked ~ &",     type: "parent", description: "Peer element checked" },
  _peerDisabled: { selector: ".peer:disabled ~ &",    type: "parent", description: "Peer element disabled" },

  /* ── Responsive breakpoints ── */
  sm:            { selector: "@media (min-width:640px)",   type: "media", description: "Small screens (640px+)" },
  md:            { selector: "@media (min-width:768px)",   type: "media", description: "Medium screens (768px+)" },
  lg:            { selector: "@media (min-width:1024px)",  type: "media", description: "Large screens (1024px+)" },
  xl:            { selector: "@media (min-width:1280px)",  type: "media", description: "XL screens (1280px+)" },
  "2xl":         { selector: "@media (min-width:1536px)",  type: "media", description: "2XL screens (1536px+)" },

  /* ── Special media queries ── */
  print:         { selector: "@media print",                                        type: "media", description: "Print media" },
  portrait:      { selector: "@media (orientation:portrait)",                       type: "media", description: "Portrait orientation" },
  landscape:     { selector: "@media (orientation:landscape)",                      type: "media", description: "Landscape orientation" },
  motionSafe:    { selector: "@media (prefers-reduced-motion:no-preference)",       type: "media", description: "Motion allowed" },
  motionReduce:  { selector: "@media (prefers-reduced-motion:reduce)",              type: "media", description: "Reduced motion" },
  contrastMore:  { selector: "@media (prefers-contrast:more)",                      type: "media", description: "High contrast" },
  darkOS:        { selector: "@media (prefers-color-scheme:dark)",                  type: "media", description: "OS dark mode" },
  lightOS:       { selector: "@media (prefers-color-scheme:light)",                 type: "media", description: "OS light mode" },
  hover:         { selector: "@media (hover:hover)",                                type: "media", description: "Hover-capable device" },
  touch:         { selector: "@media (hover:none) and (pointer:coarse)",            type: "media", description: "Touch device" },
};

/* ── Flat selector map (used by extractor) ── */
export type FlatVariants = Record<string, string>;

export function toFlatVariants(registry: VariantRegistry): FlatVariants {
  const flat: FlatVariants = {};
  for (const [key, def] of Object.entries(registry)) {
    flat[key] = def.selector;
  }
  return flat;
}

/* ── Default flat variants (cached) ── */
export const DEFAULT_VARIANTS: FlatVariants = toFlatVariants(BUILT_IN_VARIANTS);

/* ════════════════════════════════════════════
   VARIANT VALIDATION
════════════════════════════════════════════ */

export interface VariantValidationError {
  key:     string;
  message: string;
}

/**
 * Validates a custom variant definition.
 * Returns an array of errors (empty = valid).
 */
export function validateVariant(
  key: string,
  selector: VariantSelector
): VariantValidationError[] {
  const errors: VariantValidationError[] = [];

  /* Key must be a valid identifier */
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(key)) {
    errors.push({
      key,
      message: `Variant key "${key}" must be a valid identifier (letters, numbers, hyphens, underscores).`,
    });
  }

  /* Selector must not be empty */
  if (!selector || !selector.trim()) {
    errors.push({ key, message: `Variant "${key}" selector cannot be empty.` });
    return errors;
  }

  /* Selector must be a valid CSS selector or at-rule */
  const isAtRule   = selector.startsWith("@");
  const isPseudo   = selector.startsWith(":");
  const isParent   = selector.includes("&") || selector.startsWith("[") || selector.startsWith(".");
  const isValid    = isAtRule || isPseudo || isParent;

  if (!isValid) {
    errors.push({
      key,
      message:
        `Variant "${key}" has invalid selector "${selector}". ` +
        `Must be a pseudo-class (:hover), at-rule (@media ...), or parent selector (.class &).`,
    });
  }

  /* Warn on potential injection — no quotes-outside-strings allowed */
  if (/[<>]/.test(selector)) {
    errors.push({
      key,
      message: `Variant "${key}" selector contains invalid characters.`,
    });
  }

  return errors;
}

/**
 * Merge built-in variants with custom variants.
 * Custom variants override built-ins with same key.
 * Returns both the merged registry and any validation errors.
 */
export function mergeVariants(
  custom: Record<string, string>
): {
  registry: VariantRegistry;
  flat:     FlatVariants;
  errors:   VariantValidationError[];
} {
  const errors: VariantValidationError[] = [];
  const customDefs: VariantRegistry = {};

  for (const [key, selector] of Object.entries(custom)) {
    const validationErrors = validateVariant(key, selector);
    if (validationErrors.length > 0) {
      errors.push(...validationErrors);
      continue; // skip invalid variants
    }
    customDefs[key] = {
      selector,
      type: "custom",
      description: `Custom variant (user-defined)`,
    };
  }

  const registry: VariantRegistry = { ...BUILT_IN_VARIANTS, ...customDefs };
  const flat: FlatVariants = toFlatVariants(registry);

  return { registry, flat, errors };
}