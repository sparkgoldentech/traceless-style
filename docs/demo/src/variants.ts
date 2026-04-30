/**
 * Custom variants — extends the built-in registry with project-specific
 * breakpoints and helpers.
 *
 * Demonstrates: tl.extend({ variants: ... }).
 *
 * This file is imported once from App.tsx so its registration runs early.
 * The compiler also discovers it via Pass 1 — either is sufficient on its
 * own; importing makes it visible to the runtime fallback path too.
 */
import { tl } from "traceless-style";

tl.extend({
  variants: {
    /* Project-specific breakpoint for tablet sizes */
    _tablet:  "@media (min-width: 900px)",

    /* Retina / hi-DPI displays */
    _retina:  "@media (-webkit-min-device-pixel-ratio: 2)",

    /* Hover dark — combines parent .dark with :hover.
       Useful for hover states that need different dark-mode colors. */
    _hoverDark: ":is(.dark *):hover",

    /* Inside a brand-tagged container */
    _brand:    ".my-brand &",
  },
});
