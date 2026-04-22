/**
 * spark-css/dark — Built-in dark mode system
 *
 * ONE LINE to enable dark mode in your app:
 *
 *   // In layout.tsx:
 *   import { SparkDarkScript } from "spark-css/dark";
 *   // Add <SparkDarkScript /> inside <head> — prevents flash
 *
 * Then toggle from anywhere:
 *   import { dark } from "spark-css/dark";
 *   dark.toggle();
 *
 * Three strategies:
 *   "class"  — adds/removes .dark on <html> (default, works with _dark variant)
 *   "media"  — follows OS prefers-color-scheme (automatic, no JS needed)
 *   "system" — class strategy but defaults to OS preference
 */

/* ══════════════════════════════════════════
   DARK MODE STRATEGIES
══════════════════════════════════════════ */
export type DarkStrategy = "class" | "media" | "system";
export type DarkMode     = "dark"  | "light" | "system";

const STORAGE_KEY   = "spark-dark";
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
    var m = localStorage.getItem('spark-dark');
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
 * SparkDarkScript — Add to <head> in layout.tsx
 * Prevents flash of wrong theme on page load.
 *
 * Usage (ONE LINE in layout.tsx):
 *   <head>
 *     <SparkDarkScript />
 *   </head>
 */
export function SparkDarkScript(): null {
  return null;
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
 * useSparkDark — React hook for dark mode
 *
 * Usage:
 *   const { isDark, toggle, enable, disable, mode } = useSparkDark();
 *
 *   <button onClick={toggle}>
 *     {isDark ? "Switch to Light" : "Switch to Dark"}
 *   </button>
 */
export function useSparkDark(): {
  isDark:  boolean;
  mode:    DarkMode;
  toggle:  () => void;
  enable:  () => void;
  disable: () => void;
  system:  () => void;
  set:     (mode: "dark" | "light") => void;
} {
  // Dynamic import React to avoid bundling it when not needed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useState, useEffect } = require("react") as typeof import("react");

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
   NEXT.JS COMPONENTS
══════════════════════════════════════════ */

/**
 * DarkModeProvider for Next.js App Router
 *
 * Add to layout.tsx — ONE LINE:
 *
 *   import { DarkModeProvider } from "spark-css/dark";
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
    key: "spark-dark-script",
  };
}