/**
 * traceless-style DevTools — shared types.
 *
 * These types describe the JSON payload the panel reads from the
 * inspected page via `chrome.devtools.inspectedWindow.eval(...)`. The
 * inspector script (executed in page context) builds a `PageState`
 * snapshot and returns it as JSON; the panel renders from it.
 */

export interface ClassInfo {
  /** Full atomic class name, e.g. "tlAbc123". */
  cls: string;
  /** CSS property the rule sets, e.g. "padding". */
  prop: string;
  /** Resolved value of the rule, e.g. "1rem" or "var(--tl-1qigm9)". */
  value: string;
  /** Selector suffix for variant rules: `:hover`, `:is(.dark *)`, etc. null for base rules. */
  selector: string | null;
  /** How many DOM elements on the page currently use this class. */
  elementCount: number;
}

export interface TokenInfo {
  /** Full custom-property name, e.g. "--tl-15vkyd". */
  name: string;
  /** Light-mode value (or only value if the token has no dark override). */
  value: string;
  /** Dark-mode override, if the token has one. */
  darkValue: string | null;
}

export interface ThemeInfo {
  /** Class name, e.g. "tlTheme1q60ve". */
  cls: string;
  /** Whether the class is currently applied to <body> or <html>. */
  active: boolean;
}

export interface KeyframeInfo {
  /** @keyframes name, e.g. "tlKfXxx". */
  name: string;
  /** Number of stops (`from`, `to`, `0%`, `100%`, etc.). */
  stops: number;
  /** Concatenated stop CSS for preview. */
  cssText: string;
}

export interface PageState {
  detected:    boolean;
  isDark:      boolean;
  dir:         "ltr" | "rtl";
  classes:     ClassInfo[];
  tokens:      TokenInfo[];
  themes:      ThemeInfo[];
  keyframes:   KeyframeInfo[];
  stats: {
    totalRules:  number;
    usedClasses: number;
    bundleBytes: number;
  };
}

/* ── Accessibility audit (live page contrast scan) ─────────────── */

/**
 * One contrast finding from the live page audit. Built by walking every
 * text-bearing element, reading its computed `color` + the first solid
 * ancestor `background-color`, compositing if necessary, and measuring
 * the WCAG ratio + APCA Lc score.
 */
export interface A11yFinding {
  /** Tag + id + first 80 chars of textContent (truncated, sanitized). */
  label:        string;
  /** Selector path the panel can use to re-find / highlight the element. */
  selector:     string;
  /** Resolved foreground color in `rgb(R,G,B)` or `rgba(...)` form. */
  fgValue:      string;
  /** Resolved (composited) background. */
  bgValue:      string;
  /** WCAG 2.1 contrast ratio. */
  ratio:        number;
  /** APCA Lc score (advisory). */
  apca:         number;
  /** Best applicable WCAG threshold the element fails (4.5 / 3 / 7). */
  required:     number;
  /** "AA" / "AAA" / "1.4.11" — which standard the threshold comes from. */
  standard:     string;
  /** Severity bucket the panel renders in. */
  severity:     "fail" | "warn" | "pass";
  /** Best-effort font size in px (used for large-text classification). */
  fontSizePx:   number;
  /** Bold? (≥ 700). */
  bold:         boolean;
}

export interface A11yResult {
  /** Total elements scanned. */
  scanned:    number;
  /** When the audit started. */
  startedAt:  number;
  /** Audit duration in ms. */
  durationMs: number;
  findings:   A11yFinding[];
}

export const EMPTY_STATE: PageState = {
  detected:    false,
  isDark:      false,
  dir:         "ltr",
  classes:     [],
  tokens:      [],
  themes:      [],
  keyframes:   [],
  stats: { totalRules: 0, usedClasses: 0, bundleBytes: 0 },
};
