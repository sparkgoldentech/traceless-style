/**
 * Button — variant + size + state component.
 *
 * Demonstrates:
 *   • tl.create with variants (_hover, _focusVisible, _active, _disabled)
 *   • Variant-as-prop pattern (primary / secondary / danger / ghost)
 *   • Size-as-prop pattern (sm / md / lg)
 *   • tl.merge for last-wins composition (caller's className overrides)
 *   • TracelessClass branded type
 *   • Token member access (tokens.brand.primary, tokens.spacing.md, etc.)
 *   • Auto-dark mode (no _dark blocks needed for color values)
 */
import { tl } from "traceless-style";
import type { TracelessClass } from "traceless-style";
import { tokens } from "../theme/tokens";

const $ = tl.create({
  base: {
    display:        "inline-flex",
    alignItems:     "center",
    justifyContent: "center",
    gap:            tokens.spacing.sm,

    border:         "1px solid transparent",
    borderRadius:   tokens.radius.md,
    fontFamily:     tokens.font.sans,
    fontWeight:     500,
    cursor:         "pointer",
    transition:     "background 120ms ease, color 120ms ease, border-color 120ms ease",
    userSelect:     "none",
    whiteSpace:     "nowrap",

    _focusVisible: {
      outline:       "2px solid currentColor",
      outlineOffset: "2px",
    },

    _disabled: {
      opacity:       0.5,
      pointerEvents: "none",
    },
  },

  /* ── Sizes ── */
  sm: { padding: "0.25rem 0.5rem",  fontSize: "0.875rem" },
  md: { padding: "0.5rem 1rem",     fontSize: "1rem"     },
  lg: { padding: "0.75rem 1.5rem",  fontSize: "1.125rem" },

  /* ── Variants ── */
  primary: {
    background: tokens.brand.primary,
    color:      tokens.text.inverse,
    _hover:  { filter: "brightness(0.92)" },
    _active: { filter: "brightness(0.85)" },
  },

  secondary: {
    background:  tokens.surface.default,
    color:       tokens.brand.primary,
    borderColor: tokens.brand.primary,
    _hover: { background: tokens.surface.muted },
  },

  danger: {
    background: tokens.brand.danger,
    color:      tokens.text.inverse,
    _hover:  { filter: "brightness(0.92)" },
  },

  ghost: {
    background: "transparent",
    color:      tokens.text.default,
    _hover: { background: tokens.surface.muted },
  },
});

export interface ButtonProps {
  variant?:   "primary" | "secondary" | "danger" | "ghost";
  size?:      "sm" | "md" | "lg";
  disabled?:  boolean;
  className?: TracelessClass;
  onClick?:   () => void;
  children:   React.ReactNode;
}

export function Button({
  variant = "primary",
  size    = "md",
  disabled,
  className,
  onClick,
  children,
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={tl.merge($.base, $[size], $[variant], className)}
    >
      {children}
    </button>
  );
}
