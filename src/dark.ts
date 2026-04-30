/**
 * traceless-style/dark — Built-in dark mode system
 *
 * ONE LINE to enable dark mode in your app:
 *
 *   // In layout.tsx:
 *   import { TracelessDarkScript } from "traceless-style/dark";
 *   // Add <TracelessDarkScript /> inside <head> — prevents flash
 *
 * Then toggle from anywhere:
 *   import { dark } from "traceless-style/dark";
 *   dark.toggle();
 *
 * Three strategies:
 *   "class"  — adds/removes .dark on <html> (default, works with _dark variant)
 *   "media"  — follows OS prefers-color-scheme (automatic, no JS needed)
 *   "system" — class strategy but defaults to OS preference
 */

// Static React imports (NOT a CJS require) so the bundler can resolve
// these at build time. Turbopack's ESM evaluator throws on dynamic
// `require("react")` calls during prerendering — the static form works
// in every bundler we target. React is already a peer dependency.
import { createElement, useState, useEffect } from "react";

/* ══════════════════════════════════════════
   DARK MODE STRATEGIES
══════════════════════════════════════════ */
export type DarkStrategy = "class" | "media" | "system";
export type DarkMode     = "dark"  | "light" | "system";

const STORAGE_KEY   = "traceless-dark";
const DARK_CLASS    = "dark";

/* ══════════════════════════════════════════
   CORE DARK MODE ENGINE
══════════════════════════════════════════ */
class DarkModeEngine {
  private strategy:  DarkStrategy = "class";
  private listeners: Set<(mode: DarkMode) => void> = new Set();

  /** Initialize — call once, reads saved preference or OS setting */
  init(strategy: DarkStrategy = "class"): void {
    this.strategy = strategy;

    if (typeof window === "undefined") return;

    /* Apply saved preference or OS default */
    const saved = this.getSaved();
    if (saved === "dark")  { this.applyClass(true);  return; }
    if (saved === "light") { this.applyClass(false); return; }

    /* No saved preference — follow OS */
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    this.applyClass(prefersDark);

    /* Watch for OS changes when no preference saved */
    window.matchMedia?.("(prefers-color-scheme: dark)")
      .addEventListener("change", e => {
        if (!this.getSaved()) this.applyClass(e.matches);
      });
  }

  /** Toggle between dark and light */
  toggle(): void {
    const isDark = this.isDark();
    this.set(isDark ? "light" : "dark");
  }

  /** Force dark mode */
  enable(): void { this.set("dark"); }

  /** Force light mode */
  disable(): void { this.set("light"); }

  /** Follow OS preference (clears saved setting) */
  system(): void {
    this.clearSaved();
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    this.applyClass(prefersDark);
    this.notify("system");
  }

  /** Set mode explicitly */
  set(mode: "dark" | "light"): void {
    this.save(mode);
    this.applyClass(mode === "dark");
    this.notify(mode);
  }

  /** Get current mode */
  getMode(): DarkMode {
    if (typeof window === "undefined") return "system";
    const saved = this.getSaved();
    if (saved) return saved as DarkMode;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  }

  /** Check if dark mode is currently active */
  isDark(): boolean {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains(DARK_CLASS);
  }

  /** Subscribe to mode changes */
  subscribe(fn: (mode: DarkMode) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn); // unsubscribe
  }

  /** Private: apply or remove .dark class */
  private applyClass(dark: boolean): void {
    if (typeof document === "undefined") return;
    if (dark) document.documentElement.classList.add(DARK_CLASS);
    else      document.documentElement.classList.remove(DARK_CLASS);
  }

  /** Private: notify all listeners */
  private notify(mode: DarkMode): void {
    this.listeners.forEach(fn => fn(mode));
  }

  /** Private: localStorage helpers */
  private getSaved(): string | null {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }
  private save(mode: string): void {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
  }
  private clearSaved(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}

/* ── Singleton dark mode engine ── */
export const dark = new DarkModeEngine();

/* ══════════════════════════════════════════
   INLINE SCRIPT — prevents flash of wrong theme
   Add to <head> BEFORE any content renders
══════════════════════════════════════════ */

/**
 * The inline script that runs before React hydration.
 * Reads localStorage and applies .dark class immediately.
 * Prevents "flash of light" on dark mode users.
 */
export const DARK_INIT_SCRIPT = `
(function(){
  try {
    var m = localStorage.getItem('traceless-dark');
    if (m === 'dark') document.documentElement.classList.add('dark');
    else if (m === 'light') document.documentElement.classList.remove('dark');
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.add('dark');
  } catch(e) {}
})();
`.trim();

/* ══════════════════════════════════════════
   REACT COMPONENTS (optional)
══════════════════════════════════════════ */

/**
 * TracelessRoot — drop into the <head> of your root layout.
 *
 * Renders an inline <script> that reads the user's saved preference (or OS
 * setting) and applies the .dark class to <html> BEFORE first paint, so
 * dark-mode users never see a "flash of light." Uses suppressHydrationWarning
 * so React is happy when the server-rendered HTML and the post-script DOM
 * differ. Pure render — no hooks, no effects, safe in Server Components.
 *
 * Usage (one line):
 *   import { TracelessRoot } from "traceless-style/dark";
 *
 *   export default function RootLayout({ children }) {
 *     return (
 *       <html lang="en" suppressHydrationWarning>
 *         <head><TracelessRoot /></head>
 *         <body>{children}</body>
 *       </html>
 *     );
 *   }
 */
// Type the return as a generic JSX-compatible element so consumers can use
// it directly: `<TracelessRoot />`. We DON'T pull in @types/react here —
// React's runtime handles the actual rendering via createElement.
type ReactElementLike = { type: string; props: Record<string, unknown>; key: string | null };

/**
 * Combined anti-flash script: applies the saved dark-mode preference AND
 * the saved direction (LTR/RTL) before first paint. Inlined so users
 * never write either piece by hand — `<TracelessRoot />` is the single
 * line they need.
 *
 * The RTL piece is a verbatim copy of `RTL_INIT_SCRIPT` from rtl.ts. We
 * inline it (instead of importing) to keep `dark.ts` standalone — users
 * who only want dark mode don't need to load the RTL module at all.
 */
const COMBINED_INIT_SCRIPT = `
(function(){
  try {
    var m = localStorage.getItem('traceless-dark');
    if (m === 'dark') document.documentElement.classList.add('dark');
    else if (m === 'light') document.documentElement.classList.remove('dark');
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.add('dark');
  } catch(e) {}
  try {
    var d = localStorage.getItem('traceless-dir');
    if (d === 'rtl' || d === 'ltr') document.documentElement.setAttribute('dir', d);
  } catch(e) {}
})();
`.trim();

export function TracelessRoot(): ReactElementLike {
  // Use createElement (not a hand-rolled VDOM object) so we get a
  // properly tagged element for the host React version. Hand-rolled
  // `$$typeof: Symbol.for("react.element")` works in React 18 but is
  // rejected by React 19's stricter element validation.
  return createElement("script", {
    dangerouslySetInnerHTML: { __html: COMBINED_INIT_SCRIPT },
    suppressHydrationWarning: true,
  }) as unknown as ReactElementLike;
}

/** Backwards-compatible alias of TracelessRoot. */
export function TracelessDarkScript(): ReactElementLike {
  return TracelessRoot();
}

/**
 * Get the script tag HTML string for server-side rendering.
 * Use this in non-React environments.
 */
export function getDarkScriptTag(): string {
  return `<script>${DARK_INIT_SCRIPT}</script>`;
}

/* ══════════════════════════════════════════
   REACT HOOK
══════════════════════════════════════════ */

/**
 * useTracelessDark — React hook for dark mode
 *
 * Usage:
 *   const { isDark, toggle, enable, disable, mode } = useTracelessDark();
 *
 *   <button onClick={toggle}>
 *     {isDark ? "Switch to Light" : "Switch to Dark"}
 *   </button>
 */
export function useTracelessDark(): {
  isDark:  boolean;
  mode:    DarkMode;
  toggle:  () => void;
  enable:  () => void;
  disable: () => void;
  system:  () => void;
  set:     (mode: "dark" | "light") => void;
} {
  const [mode, setMode] = useState<DarkMode>(() =>
    typeof window !== "undefined" ? dark.getMode() : "system"
  );

  useEffect(() => {
    /* Sync with current state on mount */
    setMode(dark.getMode());
    /* Subscribe to changes */
    return dark.subscribe(newMode => setMode(newMode));
  }, []);

  return {
    isDark:  mode === "dark",
    mode,
    toggle:  () => dark.toggle(),
    enable:  () => dark.enable(),
    disable: () => dark.disable(),
    system:  () => dark.system(),
    set:     (m) => dark.set(m),
  };
}

/* ══════════════════════════════════════════
   ONE-LINE THEME TOGGLE
══════════════════════════════════════════ */

/**
 * <ThemeToggle /> — the one-line light/dark switcher.
 *
 * Drop it anywhere in your UI. Clicking flips the .dark class on <html>,
 * persists the choice in localStorage, and broadcasts the change so every
 * `useTracelessDark()` consumer in the tree updates. Combined with the
 * compiler's auto-dark-mode (every color value gets a derived dark
 * variant), a single `<ThemeToggle />` is enough — the developer never
 * writes `_dark: {...}` for routine color overrides.
 *
 * The button is rendered with inline-safe accessibility attributes and
 * shows a sun/moon emoji that swaps on click. To restyle, wrap your own
 * button around `useTracelessDark()` instead — `<ThemeToggle />` is the
 * "one line and you're done" path.
 *
 * Usage:
 *   import { ThemeToggle } from "traceless-style/dark";
 *   <ThemeToggle />
 *
 * Optional props:
 *   className   apply your own class (e.g. one from tl.create)
 *   labels      override the visible labels: { light: "🌙", dark: "☀️" }
 */
export interface ThemeToggleProps {
  className?: string;
  labels?:    { light: string; dark: string };
}

export function ThemeToggle(props: ThemeToggleProps = {}): ReactElementLike {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(dark.isDark());
    return dark.subscribe(mode => setIsDark(mode === "dark"));
  }, []);

  const labels = props.labels ?? { light: "🌙", dark: "☀️" };

  // Render a stable label until mount to avoid hydration-mismatch warnings.
  // The anti-flash script in <TracelessRoot /> has already applied the
  // correct class to <html> by the time the user can click anything.
  return createElement("button", {
    type:           "button",
    onClick:        () => dark.toggle(),
    "aria-label":   "Toggle color theme",
    "aria-pressed": isDark,
    className:      props.className,
    suppressHydrationWarning: true,
  }, mounted ? (isDark ? labels.dark : labels.light) : labels.light) as unknown as ReactElementLike;
}

/* ══════════════════════════════════════════
   NEXT.JS COMPONENTS
══════════════════════════════════════════ */

/**
 * DarkModeProvider for Next.js App Router
 *
 * Add to layout.tsx — ONE LINE:
 *
 *   import { DarkModeProvider } from "traceless-style/dark";
 *
 *   export default function RootLayout({ children }) {
 *     return (
 *       <html>
 *         <head>
 *           <DarkModeScript />    ← prevents flash
 *         </head>
 *         <body>
 *           <DarkModeProvider>   ← optional: wraps children
 *             {children}
 *           </DarkModeProvider>
 *         </body>
 *       </html>
 *     );
 *   }
 */
export function DarkModeScript(): unknown {
  return {
    type: "script",
    props: {
      dangerouslySetInnerHTML: { __html: DARK_INIT_SCRIPT },
      suppressHydrationWarning: true,
    },
    key: "traceless-dark-script",
  };
}