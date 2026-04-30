/**
 * ThemeBar — fixed-position bar with built-in dark/light + LTR/RTL toggles.
 *
 * Demonstrates:
 *   • <ThemeToggle /> from "traceless-style/dark" (drop-in)
 *   • <RtlToggle />   from "traceless-style/rtl"  (drop-in)
 *   • useTracelessDark + useTracelessRtl React hooks
 *   • position: "fixed" with insetInlineEnd (RTL-safe)
 */
import { tl } from "traceless-style";
import { ThemeToggle, useTracelessDark } from "traceless-style/dark";
import { RtlToggle,   useTracelessRtl  } from "traceless-style/rtl";
import { tokens } from "../theme/tokens";

const $ = tl.create({
  bar: {
    position:        "fixed",
    insetBlockStart: tokens.spacing.md,
    insetInlineEnd:  tokens.spacing.md,
    display:         "flex",
    gap:             tokens.spacing.sm,
    padding:         tokens.spacing.sm,
    background:      tokens.surface.default,
    border:          "1px solid transparent",
    borderColor:     tokens.surface.border,
    borderRadius:    tokens.radius.round,
    boxShadow:       tokens.shadow.md,
    zIndex:          50,
  },
  btn: {
    padding:        "0.375rem 0.75rem",
    border:         "1px solid transparent",
    borderColor:    tokens.surface.border,
    borderRadius:   tokens.radius.round,
    background:     "transparent",
    color:          tokens.text.default,
    fontFamily:     tokens.font.sans,
    fontSize:       "0.875rem",
    cursor:         "pointer",
    _hover:        { background: tokens.surface.muted },
    _focusVisible: { outline: "2px solid", outlineOffset: "2px" },
  },
  label: {
    fontSize: "0.75rem",
    color:    tokens.text.muted,
    paddingInline: tokens.spacing.sm,
    alignSelf: "center",
  },
});

export function ThemeBar() {
  const { mode }  = useTracelessDark();
  const { dir }   = useTracelessRtl();

  return (
    <div className={$.bar} role="toolbar" aria-label="Theme controls">
      <span className={$.label}>{mode} · {dir}</span>
      <ThemeToggle className={$.btn} />
      <RtlToggle   className={$.btn} />
    </div>
  );
}
