/**
 * traceless-style DevTools — robustness layer.
 *
 * Three jobs, all of them what separates a "looks professional" panel
 * from a "kinda works" one:
 *
 *   1. evalPageRetry()      — wraps `chrome.devtools.inspectedWindow.eval`
 *                             with exponential backoff. Transient failures
 *                             (page navigating, paint suspended, CSP
 *                             round-trip stutter) are retried before
 *                             surfacing a hard error to the user.
 *
 *   2. installErrorHandler() — global window.onerror + onunhandledrejection
 *                             trap. Any uncaught error in the panel script
 *                             is logged AND turned into a toast, so the
 *                             panel never goes silently dead.
 *
 *   3. PersistedState       — chrome.storage.local-backed UI state with a
 *                             localStorage fallback. Filters / scroll
 *                             positions / picker mode survive panel reload
 *                             and page navigation. Same pattern Chrome
 *                             DevTools, React DevTools, and Vue DevTools
 *                             use for their own persistence.
 *
 * Plus the small extras a polished panel ships with:
 *
 *   - ConnectionStatus      — green/amber/red dot in the topbar. Reflects
 *                             whether the last eval succeeded, is in
 *                             flight, or has been retrying.
 *   - onPageNavigation()    — Chrome DevTools fires
 *                             chrome.devtools.network.onNavigated; we wire
 *                             it so the panel auto-rescans after a SPA
 *                             route change or full reload.
 *   - toast()               — bottom-of-panel slide-up notification.
 *
 * Privacy: nothing here makes a network call. chrome.storage.local stays
 * on the user's machine; the panel is telemetry-free.
 */

/* ─── Types ─────────────────────────────────────────────────────── */

export type ConnState = "ok" | "scanning" | "retrying" | "error" | "no-page";

export interface RobustOptions {
  maxRetries?:    number;     // default 3
  baseDelayMs?:   number;     // default 120 — first retry after this; doubles each
  onConnChange?:  (s: ConnState) => void;
}

/* ─── Retry-aware page eval ─────────────────────────────────────── */

/**
 * Wraps chrome.devtools.inspectedWindow.eval with retries + backoff.
 *
 * Why retries help:
 *   - During SPA route changes, eval can briefly fail with "Cannot
 *     access page state" or "Frame was destroyed."
 *   - First paint after navigation can drop the eval channel for one
 *     tick.
 *   - Some pages have transient CSP weirdness during DOM swaps.
 *
 * We classify errors:
 *   - Transient (frame destroyed, page suspended, no result yet) →
 *     retry with exponential backoff.
 *   - Permanent (syntax error in our expression, CSP refusal) → fail
 *     immediately, no retry.
 *
 * Caller gets a nice promise that resolves with the result or rejects
 * after final failure with the original exception attached.
 */
const TRANSIENT_PATTERNS: RegExp[] = [
  /frame\s+was\s+destroyed/i,
  /no\s+frame\s+with/i,
  /cannot\s+access/i,
  /context\s+(?:was\s+)?invalidated/i,
  /no\s+inspected\s+window/i,
  /cannot\s+find\s+context/i,
  /target\s+closed/i,
];

function isTransient(message: string): boolean {
  for (const re of TRANSIENT_PATTERNS) if (re.test(message)) return true;
  return false;
}

export async function evalPageRetry<T = unknown>(
  expr:    string,
  options: RobustOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelay  = options.baseDelayMs ?? 120;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt === 0) options.onConnChange?.("scanning");
      else               options.onConnChange?.("retrying");
      const result = await evalOnce<T>(expr);
      options.onConnChange?.("ok");
      return result;
    } catch (e) {
      lastError = e as Error;
      if (!isTransient(lastError.message) || attempt === maxRetries) {
        options.onConnChange?.("error");
        throw lastError;
      }
      // Exponential backoff with a small jitter to avoid step-locked
      // retries when the page is slow to recover.
      const delay = baseDelay * 2 ** attempt + Math.random() * 40;
      await sleep(delay);
    }
  }
  options.onConnChange?.("error");
  throw lastError ?? new Error("evalPageRetry: unknown failure");
}

function evalOnce<T>(expr: string): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.devtools.inspectedWindow.eval(expr, (result, exception) => {
        if (exception && (exception.isError || exception.isException)) {
          reject(new Error(String(exception.value ?? exception.code ?? "eval error")));
        } else {
          resolve(result as T);
        }
      });
    } catch (e) {
      reject(e as Error);
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/* ─── Global error trap ─────────────────────────────────────────── */

/**
 * Install window-level error + promise-rejection handlers so the panel
 * never dies silently. Caught errors go to:
 *   1. console.error (kept for power users with the panel devtools open)
 *   2. The toast (visible to everyone)
 *   3. An optional sink callback (for tests / future telemetry-free
 *      output channel).
 */
export function installErrorHandler(opts: { onError?: (msg: string, err: Error) => void } = {}): void {
  if (typeof window === "undefined") return;
  const handle = (msg: string, err: Error): void => {
    try { console.error("[traceless-style devtools]", msg, err); } catch { /* */ }
    try { opts.onError?.(msg, err); } catch { /* */ }
    try { toast(`Internal error — ${msg}`, "error"); } catch { /* */ }
  };
  window.addEventListener("error", e => {
    if (!e.error) return;
    handle(e.message || "unknown", e.error as Error);
  });
  window.addEventListener("unhandledrejection", e => {
    const reason = (e.reason as Error) ?? new Error("unknown");
    handle(reason.message || "promise rejected", reason instanceof Error ? reason : new Error(String(reason)));
  });
}

/* ─── Toast ─────────────────────────────────────────────────────── */

let toastTimer: number | undefined;

/**
 * Slide-up toast at the bottom of the panel. Uses an existing
 * `<div id="toast">` in the host page (panel.html ships one). Calls are
 * idempotent — overlapping calls clear the previous timeout so the
 * latest message is always visible for its full duration.
 *
 * Severity tints the border: ok=green, info=neutral, warn=amber, error=red.
 */
export type ToastSeverity = "ok" | "info" | "warn" | "error";

export function toast(message: string, severity: ToastSeverity = "info", durationMs = 3000): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.dataset.severity = severity;
  el.hidden = false;
  // The existing CSS animates opacity via `.show`. Add it on the next
  // frame so the transition fires instead of snapping in.
  requestAnimationFrame(() => el.classList.add("show"));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.remove("show");
    // Hide after the fade-out finishes.
    setTimeout(() => { el.hidden = true; }, 200);
  }, durationMs);
}

/* ─── Connection-state indicator ────────────────────────────────── */

export class ConnectionStatus {
  private el:    HTMLElement | null;
  private label: HTMLElement | null;
  private state: ConnState = "ok";
  constructor(elementId: string) {
    this.el    = document.getElementById(elementId);
    this.label = this.el?.querySelector(".conn-label") ?? null;
    this.update("ok");
  }
  /** Set the visible state. Idempotent — same state is a no-op. */
  update(state: ConnState): void {
    if (this.state === state && this.el?.dataset.state === state) return;
    this.state = state;
    if (!this.el) return;
    this.el.dataset.state = state;
    this.el.title         = LABELS[state];
    this.el.setAttribute("aria-label", LABELS[state]);
    if (this.label) this.label.textContent = SHORT_LABELS[state];
  }
}

const LABELS: Record<ConnState, string> = {
  "ok":         "Connected — page state is fresh",
  "scanning":   "Scanning the page…",
  "retrying":   "Page eval retrying — transient failure, backing off",
  "error":      "Couldn't read page state",
  "no-page":    "No inspected page",
};
/** Short labels for the visible pill text. Uppercase per the CSS rule. */
const SHORT_LABELS: Record<ConnState, string> = {
  "ok":         "Connected",
  "scanning":   "Scanning",
  "retrying":   "Retrying",
  "error":      "Error",
  "no-page":    "No page",
};

/* ─── Persistent UI state ───────────────────────────────────────── */

/**
 * chrome.storage.local with a localStorage fallback (the panel runs in
 * the DevTools origin and may or may not have storage permission
 * depending on manifest). Reads are async to match chrome.storage's
 * shape; writes are fire-and-forget.
 *
 * Strongly typed by generic — declare your shape once and read/write
 * partial updates from anywhere in the panel.
 */
export class PersistedState<T extends object> {
  constructor(
    private key:      string,
    private defaults: T,
  ) {}

  async load(): Promise<T> {
    /* Prefer chrome.storage.local — survives navigation. Fall back to
     * localStorage when the API isn't present (Firefox, restricted
     * contexts, tests). */
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const raw = await new Promise<Record<string, unknown>>(resolve =>
          chrome.storage.local.get([this.key], resolve)
        );
        const value = raw[this.key];
        if (value && typeof value === "object") return { ...this.defaults, ...(value as Partial<T>) };
        return { ...this.defaults };
      }
    } catch { /* fall through */ }
    try {
      const raw = window.localStorage.getItem(this.key);
      if (raw) return { ...this.defaults, ...(JSON.parse(raw) as Partial<T>) };
    } catch { /* */ }
    return { ...this.defaults };
  }

  async save(patch: Partial<T>): Promise<void> {
    const merged = { ...(await this.load()), ...patch };
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ [this.key]: merged });
        return;
      }
    } catch { /* */ }
    try { window.localStorage.setItem(this.key, JSON.stringify(merged)); } catch { /* */ }
  }
}

/* ─── Page-navigation observer ──────────────────────────────────── */

/**
 * Subscribe to inspected-page navigations. The callback fires on:
 *   - Full page reloads.
 *   - SPA pushState / replaceState navigations (Chrome treats them as
 *     navigations and fires onNavigated).
 *
 * Returns a disposer that removes the listener.
 */
export function onPageNavigation(callback: (url: string) => void): () => void {
  if (typeof chrome === "undefined" || !chrome.devtools?.network?.onNavigated) {
    return () => {};
  }
  const handler = (url: string): void => {
    try { callback(url); } catch (e) { console.error("onPageNavigation handler", e); }
  };
  chrome.devtools.network.onNavigated.addListener(handler);
  return () => {
    try { chrome.devtools.network.onNavigated.removeListener(handler); } catch { /* */ }
  };
}

/* ─── Diff tracker ──────────────────────────────────────────────── */

/**
 * Compute "what changed since last successful scan" for the topbar
 * badge. We compare the SHAPE of the state — total rules, used
 * classes, tokens, themes, animations — and report a tiny breakdown
 * the user can glance at:
 *
 *     +12 rules · -3 used · +1 token
 *
 * No-op when there's no previous state (first scan).
 */
export interface DiffSnapshot {
  totalRules:  number;
  usedClasses: number;
  tokens:      number;
  themes:      number;
  animations:  number;
}

export function snapshot(state: {
  stats: { totalRules: number; usedClasses: number };
  tokens: unknown[];
  themes: unknown[];
  keyframes: unknown[];
}): DiffSnapshot {
  return {
    totalRules:  state.stats.totalRules,
    usedClasses: state.stats.usedClasses,
    tokens:      state.tokens.length,
    themes:      state.themes.length,
    animations:  state.keyframes.length,
  };
}

export function diff(prev: DiffSnapshot | null, next: DiffSnapshot): string {
  if (!prev) return "";
  const parts: string[] = [];
  const fields: Array<[keyof DiffSnapshot, string]> = [
    ["totalRules",  "rule"],
    ["usedClasses", "used"],
    ["tokens",      "token"],
    ["themes",      "theme"],
    ["animations",  "anim"],
  ];
  for (const [k, label] of fields) {
    const d = next[k] - prev[k];
    if (d !== 0) parts.push(`${d > 0 ? "+" : ""}${d} ${label}${Math.abs(d) === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}
