/**
 * Design tokens — the source of truth for every color, spacing unit,
 * radius, shadow, and font in the demo.
 *
 * Demonstrates:
 *   • tl.defineTokens — emits :root { --tl-*: value }
 *   • tl.createTheme  — emits .tlTheme<hash> with overrides
 *   • Cross-file token export (consumed by every component file)
 */
import { tl } from "traceless-style";

export const tokens = tl.defineTokens({
  brand: {
    primary:   "#3b82f6",   // blue
    secondary: "#10b981",   // emerald
    danger:    "#dc2626",
  },

  text: {
    default: "#0f172a",
    muted:   "#64748b",
    inverse: "#f8fafc",
  },

  surface: {
    default: "#ffffff",
    muted:   "#f1f5f9",
    border:  "#e2e8f0",
  },

  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "2rem",
    xl: "4rem",
  },

  radius: {
    sm:    "4px",
    md:    "8px",
    lg:    "16px",
    round: "999px",
  },

  shadow: {
    sm: "0 1px 3px rgba(0,0,0,0.1)",
    md: "0 4px 12px rgba(0,0,0,0.1)",
    lg: "0 10px 30px rgba(0,0,0,0.15)",
  },

  font: {
    sans: "system-ui, -apple-system, sans-serif",
    mono: "ui-monospace, SFMono-Regular, monospace",
  },
});

/* Dark theme — overrides the surface and text colors. Brand colors
   could be left to auto-derivation, but we tweak them here for a more
   recognizable feel. */
export const darkTheme = tl.createTheme("dark", {
  brand: {
    primary:   "#60a5fa",
    secondary: "#34d399",
    danger:    "#ef4444",
  },
  text: {
    default: "#f8fafc",
    muted:   "#94a3b8",
    inverse: "#0f172a",
  },
  surface: {
    default: "#0f172a",
    muted:   "#1e293b",
    border:  "#334155",
  },
});

/* Alternate brand theme — applies to a section / page only.
   Demonstrates that themes nest. */
export const brandPink = tl.createTheme("brand-pink", {
  brand: { primary: "#ec4899", secondary: "#f43f5e" },
});
