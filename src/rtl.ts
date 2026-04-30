// Static React imports (NOT a CJS require) so the bundler can resolve
// these at build time. Turbopack's ESM evaluator throws on dynamic
// `require("react")` calls during prerendering — the static form works
// in every bundler we target. React is already a peer dependency.
import { createElement, useState, useEffect } from "react";

/**
 * traceless-style/rtl — automatic right-to-left direction support.
 *
 * One-liner integration:
 *
 *   // Site-wide toggle (drop anywhere in your UI)
 *   import { RtlToggle } from "traceless-style/rtl";
 *   <RtlToggle />
 *
 *   // Component-scoped flip (use the native `dir` attribute)
 *   <section dir="rtl"> ... </section>
 *
 * The compiler rewrites physical directional CSS properties (marginLeft,
 * paddingRight, borderTopLeftRadius, left, etc.) to their logical
 * equivalents (marginInlineStart, paddingInlineEnd, borderStartStartRadius,
 * insetInlineStart). The browser then resolves them against the closest
 * `dir` ancestor at zero specificity cost — no extra CSS rules, no extra
 * runtime work.
 *
 * What `<RtlToggle />` adds: a one-click button that toggles `<html dir>`
 * between `ltr` and `rtl`, persists the choice in localStorage, and emits
 * a custom event so any open component using `useTracelessRtl()` updates.
 *
 * Anti-flash: the inline script in <TracelessRoot /> (from
 * traceless-style/dark) ALSO restores the saved `dir` before paint, so
 * RTL users never see a flash of LTR layout.
 */

/* ══════════════════════════════════════════
   DIRECTION ENGINE
══════════════════════════════════════════ */
export type Direction = "ltr" | "rtl";

const DIR_STORAGE_KEY = "traceless-dir";
const DIR_EVENT       = "traceless-dir-change";

class DirectionEngine {
  private listeners: Set<(dir: Direction) => void> = new Set();

  /** Toggle between ltr and rtl. */
  toggle(): void {
    this.set(this.get() === "rtl" ? "ltr" : "rtl");
  }

  /** Force RTL. */
  enableRtl(): void  { this.set("rtl"); }
  /** Force LTR. */
  enableLtr(): void  { this.set("ltr"); }

  /** Set explicitly. */
  set(dir: Direction): void {
    try { localStorage.setItem(DIR_STORAGE_KEY, dir); } catch { /* private mode */ }
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("dir", dir);
    }
    this.notify(dir);
  }

  /** Read the current direction. Reads the DOM (authoritative) over
   *  localStorage so a manual `<html dir>` change is reflected. */
  get(): Direction {
    if (typeof document === "undefined") return "ltr";
    const attr = document.documentElement.getAttribute("dir");
    return attr === "rtl" ? "rtl" : "ltr";
  }

  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(fn: (dir: Direction) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(dir: Direction): void {
    for (const fn of this.listeners) fn(dir);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(DIR_EVENT, { detail: dir }));
    }
  }
}

/** Singleton direction engine. Imperative API for power users. */
export const direction = new DirectionEngine();

/* ══════════════════════════════════════════
   ANTI-FLASH SCRIPT
   Restores saved direction before first paint so RTL users never see
   an LTR flash. Add to <head> via <TracelessRoot /> (which combines
   this with the dark-mode anti-flash) or directly via the inline form.
══════════════════════════════════════════ */
export const RTL_INIT_SCRIPT = `
(function(){
  try {
    var d = localStorage.getItem('traceless-dir');
    if (d === 'rtl' || d === 'ltr') document.documentElement.setAttribute('dir', d);
  } catch(e) {}
})();
`.trim();

/* ══════════════════════════════════════════
   ONE-LINE TOGGLE
══════════════════════════════════════════ */

type ReactElementLike = { type: string; props: Record<string, unknown>; key: string | null };

export interface RtlToggleProps {
  className?: string;
  labels?:    { ltr: string; rtl: string };
}

/**
 * <RtlToggle /> — drop it anywhere; one click flips the entire site.
 *
 * Works with the native `dir` attribute, so it composes correctly: a child
 * with `dir="ltr"` overrides a parent with `dir="rtl"` and vice-versa, and
 * `<RtlToggle />` only changes the root `<html>` direction. Combined with
 * the auto-rtl compiler pass, your physical-property CSS just works.
 */
export function RtlToggle(props: RtlToggleProps = {}): ReactElementLike {
  const [dir, setDir]         = useState<Direction>("ltr");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDir(direction.get());
    return direction.subscribe(d => setDir(d));
  }, []);

  const labels = props.labels ?? { ltr: "→ RTL", rtl: "← LTR" };

  return createElement("button", {
    type:           "button",
    onClick:        () => direction.toggle(),
    "aria-label":   "Toggle text direction",
    "aria-pressed": dir === "rtl",
    className:      props.className,
    suppressHydrationWarning: true,
  }, mounted ? (dir === "rtl" ? labels.rtl : labels.ltr) : labels.ltr) as unknown as ReactElementLike;
}

/* ══════════════════════════════════════════
   REACT HOOK
══════════════════════════════════════════ */

/** Subscribe to direction changes from inside any component. */
export function useTracelessRtl(): {
  dir:       Direction;
  isRtl:     boolean;
  toggle:    () => void;
  enableRtl: () => void;
  enableLtr: () => void;
  set:       (dir: Direction) => void;
} {
  const [dir, setDir] = useState<Direction>(() =>
    typeof document !== "undefined" ? direction.get() : "ltr"
  );

  useEffect(() => {
    setDir(direction.get());
    return direction.subscribe(d => setDir(d));
  }, []);

  return {
    dir,
    isRtl:     dir === "rtl",
    toggle:    () => direction.toggle(),
    enableRtl: () => direction.enableRtl(),
    enableLtr: () => direction.enableLtr(),
    set:       (d) => direction.set(d),
  };
}
