/**
 * traceless-style DevTools panel — main script.
 *
 * Loaded by panel.html. Coordinates everything the user sees:
 *
 *   - Detects state via INSPECTOR_SOURCE eval'd in the page.
 *   - Renders six tabs (Inspector / Classes / Tokens / Theme / Animations / Stats).
 *   - Drives mutations via the COMMANDS bag.
 *   - Element picker — "click anywhere on the page to inspect it."
 *   - Cascade view — for the inspected element, marks the WINNER for
 *     each property (last-applied non-variant rule wins; variant rules hgjgjh
 *     win over base when their selector matches).
 *   - Live token editing — click a token value, edit inline, page updates.
 *   - Keyboard shortcuts: 1-6 → tab; / → search; Esc → cancel; Ctrl+R → refresh.
 *   - Persistent state via chrome.storage.local — last tab + last filter
 *     survive panel reloads.
 *
 * Architecture: vanilla DOM. No framework. The whole bundle stays under
 * ~15 KB minified — DevTools panels need to load in <50 ms or users
 * feel the lag. React would balloon that 10x.
 */

import type {
  ClassInfo, KeyframeInfo, PageState, ThemeInfo, TokenInfo,
  A11yFinding, A11yResult,
} from "../shared/types";
import { EMPTY_STATE } from "../shared/types";
import { A11Y_AUDIT_SOURCE, COMMANDS, INSPECTOR_SOURCE } from "../shared/inspector";
import {
  evalPageRetry,
  installErrorHandler,
  ConnectionStatus,
  PersistedState,
  onPageNavigation,
  snapshot, diff,
  toast as showToast,
  type DiffSnapshot,
} from "./robust";

/* Robustness foundations — install once at module load. The error
 * handler catches anything our other code doesn't, so the panel never
 * goes silently dead. */
installErrorHandler();
const conn = new ConnectionStatus("conn-status");
let lastSnapshot: DiffSnapshot | null = null;
let welcomedThisSession = false;

let state: PageState = EMPTY_STATE;
let inspectedElementClasses: string[] = [];
let pickerActive = false;
let cascadeViewOnly = false;
let lastScanMs: number | null = null;

/* ── Persistent UI state (best-effort; falls back to defaults) ───── */
interface UIState {
  lastTab?:        string;
  classFilter?:    string;
  tokenFilter?:    string;
  cascadeOnly?:    boolean;
  showUnusedOnly?: boolean;
  /* Settings (Settings tab toggles) */
  showColorSwatches?: boolean;
  showElementCounts?: boolean;
  showConflicts?:     boolean;
  autoRefresh?:       boolean;
}
const STORAGE_KEY = "tlDevtoolsUI";

const DEFAULT_UI: UIState = {
  cascadeOnly:        false,
  showUnusedOnly:     false,
  showColorSwatches:  true,
  showElementCounts:  true,
  showConflicts:      true,
  autoRefresh:        true,
};

function loadUI(): UIState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_UI, ...(JSON.parse(raw) as UIState) } : { ...DEFAULT_UI };
  } catch { return { ...DEFAULT_UI }; }
}
function saveUI(patch: Partial<UIState>): void {
  try {
    const cur = loadUI();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, ...patch }));
  } catch { /* ignore */ }
}

/* ── DOM refs ─────────────────────────────────────────── */
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const statusEl = $("status");

/* ── Inspector (page eval) ───────────────────────────────
 *
 * `evalPage` now goes through the retry layer in robust.ts. Transient
 * failures (frame torn down during navigation, paint suspended, CSP
 * stutter) are retried with exponential backoff up to 3 times before
 * the panel surfaces a hard error. The connection-state dot in the
 * topbar reflects whether a scan is running, retrying, or has failed.
 */
function evalPage<T = unknown>(expr: string): Promise<T> {
  return evalPageRetry<T>(expr, { onConnChange: s => conn.update(s) });
}

async function refresh(): Promise<void> {
  statusEl.textContent = "Scanning…";
  hideError();
  // Mark the page so the runtime's one-time DevTools install hint
  // silences itself — the user clearly already has the panel.
  try { await evalPage(`window.__TRACELESS_DEVTOOLS__ = true;`); } catch { /* ignore */ }
  const t0 = performance.now();
  try {
    const json = await evalPage<string>(INSPECTOR_SOURCE);
    state = JSON.parse(json) as PageState;
  } catch (e) {
    // After all retries exhausted: show a real error UI but keep the
    // last good state on screen so the user isn't staring at a blank
    // panel during a flaky page load.
    statusEl.textContent = "Error";
    showError((e as Error).message);
    return;
  }
  lastScanMs = performance.now() - t0;

  // Diff against the previous successful scan — render into its own
  // visual badge in the topbar (animated flash on appear) so the user
  // notices changes at a glance. Same UX shape Chrome / React DevTools
  // surface for state changes.
  const cur = snapshot(state);
  const diffStr = diff(lastSnapshot, cur);
  lastSnapshot = cur;
  const badge = $("diff-badge") as HTMLElement;
  if (diffStr) {
    badge.textContent = diffStr;
    badge.hidden = false;
    // Re-trigger flash animation by removing/re-adding the element to the
    // DOM. Cheap; runs at most once per refresh.
    badge.style.animation = "none";
    void badge.offsetWidth;
    badge.style.animation = "";
  } else {
    badge.hidden = true;
  }

  const banner = $("not-detected") as HTMLElement;
  if (state.detected || notDetectedDismissed) {
    banner.hidden = true;
  } else {
    banner.hidden = false;
  }
  if (!state.detected) {
    statusEl.textContent = "No traceless-style detected on this page.";
  } else {
    statusEl.textContent =
      `${state.stats.totalRules} rules · ${state.stats.usedClasses} used · ` +
      `${formatBytes(state.stats.bundleBytes)} CSS`;
  }

  // First-scan welcome toast — only fires once per panel-session, only
  // when we successfully read state. Visible confirmation that the new
  // robustness layer is live, with the version number and scan time.
  if (state.detected && !welcomedThisSession) {
    welcomedThisSession = true;
    const version = chrome.runtime?.getManifest?.()?.version ?? "?";
    showToast(
      `traceless-style DevTools v${version} — ${state.stats.totalRules} rules · ${(lastScanMs ?? 0).toFixed(0)} ms`,
      "ok",
      4000
    );
  }

  renderAll();
}

// Session-scoped flag — once the user clicks ✕ on the banner, don't
// nag them again on every refresh.
let notDetectedDismissed = false;

/* ── Error banner helpers ─────────────────────────── */
function showError(message: string): void {
  const banner = $("error-banner");
  $("error-message").textContent = `Couldn't read state from the page — ${message}`;
  banner.hidden = false;
}
function hideError(): void { $("error-banner").hidden = true; }

async function refreshSelection(): Promise<void> {
  try {
    const cls = await evalPage<string>("(function(){return ($0 && $0.className) || '';})();");
    inspectedElementClasses = (cls || "")
      .toString().split(/\s+/).filter(Boolean).filter(c => c.startsWith("tl"));
  } catch {
    inspectedElementClasses = [];
  }
  renderInspector();
}

/* ══════════════════════════════════════════
   RENDER: INSPECTOR
══════════════════════════════════════════ */
function renderInspector(): void {
  const empty = $("inspector-empty");
  const body  = $("inspector-body");
  const rows  = $("inspector-rows");
  const target= $("inspector-target");

  if (inspectedElementClasses.length === 0) {
    empty.hidden = false; body.hidden = true; return;
  }
  empty.hidden = true; body.hidden = false;
  target.textContent = `Element classes: ${inspectedElementClasses.join(" ")}`;

  const matching = state.classes.filter(c => inspectedElementClasses.includes(c.cls));

  // Cascade analysis: group by property, mark winners + losers.
  // Winner = the LAST class in document order that applies (matches the
  // CSS cascade's last-wins rule for equal specificity). Variants
  // (`:hover`, `:is(.dark *)`, etc.) only "win" when their context is
  // currently active — for now we mark them as candidate winners in
  // their own group and let the user reason from there.
  const byProp = new Map<string, ClassInfo[]>();
  for (const r of matching) {
    const key = r.prop + (r.selector ?? "");
    let arr = byProp.get(key);
    if (!arr) { arr = []; byProp.set(key, arr); }
    arr.push(r);
  }
  // Within each (prop+selector) bucket, last wins.
  const winners = new Set<ClassInfo>();
  for (const arr of byProp.values()) winners.add(arr[arr.length - 1]);

  // Conflict detection: any base property (no selector) appearing in 2+
  // classes the element has is a *real* conflict — they fight at runtime.
  const baseConflictProps = new Set<string>();
  const baseCounts = new Map<string, number>();
  for (const r of matching) {
    if (r.selector) continue;
    baseCounts.set(r.prop, (baseCounts.get(r.prop) ?? 0) + 1);
  }
  for (const [prop, n] of baseCounts) if (n > 1) baseConflictProps.add(prop);

  let visible = matching;
  if (cascadeViewOnly) visible = matching.filter(r => winners.has(r));

  rows.innerHTML = visible.map(r => {
    const cls: string[] = [];
    if (winners.has(r))                                         cls.push("winner");
    else if (matching.includes(r) && r.selector === null)       cls.push("overridden");
    if (!r.selector && baseConflictProps.has(r.prop))           cls.push("conflict");
    return ruleRow(r, cls.join(" "));
  }).join("") || `<tr><td colspan="5" class="muted">No traceless-style rules apply.</td></tr>`;
  attachRowHandlers(rows);
}

/* ══════════════════════════════════════════
   RENDER: CLASSES BROWSER
══════════════════════════════════════════ */
let showUnusedOnly = false;

function renderClasses(filter = ""): void {
  const tbody = $("class-rows");
  let filtered = applyClassFilter(state.classes, filter);
  if (showUnusedOnly) filtered = filtered.filter(c => c.elementCount === 0);
  $("class-count").textContent = `${filtered.length} of ${state.classes.length}`;
  tbody.innerHTML = filtered.slice(0, 500).map(r => {
    const extra = r.elementCount === 0 ? "unused" : "";
    return ruleRow(r, extra, true);
  }).join("") || `<tr><td colspan="6" class="muted">No matches.</td></tr>`;
  attachRowHandlers(tbody);
}

/** Filter accepts:
 *   "padding"       — substring match across class/prop/value
 *   "padding:1rem"  — both halves must match (prop : value)
 *   "@media"        — also matches the variant column
 */
function applyClassFilter(all: ClassInfo[], filter: string): ClassInfo[] {
  const norm = filter.trim().toLowerCase();
  if (!norm) return all;
  if (norm.includes(":")) {
    const [a, b] = norm.split(":", 2).map(s => s.trim());
    return all.filter(c =>
      (a === "" || c.prop.toLowerCase().includes(a) || c.cls.toLowerCase().includes(a)) &&
      (b === "" || c.value.toLowerCase().includes(b))
    );
  }
  return all.filter(c =>
    c.cls.toLowerCase().includes(norm) ||
    c.prop.toLowerCase().includes(norm) ||
    c.value.toLowerCase().includes(norm) ||
    (c.selector ?? "").toLowerCase().includes(norm)
  );
}

/* ══════════════════════════════════════════
   RENDER: TOKENS (with live-edit)
══════════════════════════════════════════ */
function renderTokens(filter = ""): void {
  const tbody = $("token-rows");
  const norm  = filter.trim().toLowerCase();
  const filtered = norm
    ? state.tokens.filter(t => t.name.toLowerCase().includes(norm) || t.value.toLowerCase().includes(norm))
    : state.tokens;
  $("token-count").textContent = `${filtered.length} of ${state.tokens.length}`;
  tbody.innerHTML = filtered.map(tokenRow).join("") ||
    `<tr><td colspan="3" class="muted">No tokens defined.</td></tr>`;
  attachTokenEditHandlers(tbody);
}

function tokenRow(t: TokenInfo): string {
  return `<tr data-name="${escapeHtml(t.name)}">
    <td class="prop">${escapeHtml(t.name)}</td>
    <td class="value editable" data-which="light">${valueWithSwatch(t.value)}</td>
    <td class="value editable" data-which="dark">${t.darkValue ? valueWithSwatch(t.darkValue) : "<span class='muted'>—</span>"}</td>
  </tr>`;
}

function attachTokenEditHandlers(scope: HTMLElement): void {
  scope.querySelectorAll<HTMLElement>("td.editable").forEach(cell => {
    cell.addEventListener("click", () => beginTokenEdit(cell));
  });
}

function beginTokenEdit(cell: HTMLElement): void {
  if (cell.classList.contains("editing")) return;
  const tr     = cell.closest("tr") as HTMLElement;
  const name   = tr.dataset.name!;
  const which  = cell.dataset.which as "light" | "dark";
  const tok    = state.tokens.find(t => t.name === name);
  if (!tok) return;
  const original = which === "dark" ? (tok.darkValue ?? tok.value) : tok.value;

  cell.classList.add("editing");
  const input = document.createElement("input");
  input.type = "text";
  input.value = original;
  input.style.cssText = "width:100%;background:transparent;border:none;outline:none;color:inherit;font:inherit;";
  cell.innerHTML = "";
  cell.appendChild(input);
  input.focus();
  input.select();

  const commit = async () => {
    const value = input.value.trim();
    cell.classList.remove("editing");
    if (value && value !== original) {
      try {
        await evalPage(COMMANDS.setTokenValue(name, value, which === "dark"));
        if (which === "dark") tok.darkValue = value; else tok.value = value;
        toast(`Updated ${name}`);
      } catch (e) {
        toast(`Failed: ${(e as Error).message}`, true);
      }
    }
    cell.innerHTML = which === "dark"
      ? (tok.darkValue ? valueWithSwatch(tok.darkValue) : `<span class='muted'>—</span>`)
      : valueWithSwatch(tok.value);
  };
  const cancel = () => {
    cell.classList.remove("editing");
    cell.innerHTML = which === "dark"
      ? (tok.darkValue ? valueWithSwatch(tok.darkValue) : `<span class='muted'>—</span>`)
      : valueWithSwatch(tok.value);
  };

  input.addEventListener("blur",    commit);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter")  { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  });
}

/* ══════════════════════════════════════════
   RENDER: THEME
══════════════════════════════════════════ */
function renderTheme(): void {
  $("dark-state").textContent = state.isDark ? "currently DARK" : "currently LIGHT";
  $("dir-state").textContent  = state.dir === "rtl" ? "currently RTL" : "currently LTR";

  const list = $("theme-list");
  if (state.themes.length === 0) {
    list.innerHTML = `<p class="muted small">No themes defined on this page.</p>`;
    return;
  }
  list.innerHTML = state.themes.map(t =>
    `<div class="theme-row${t.active ? " active" : ""}" data-cls="${escapeHtml(t.cls)}">` +
      `<span class="theme-cls">.${escapeHtml(t.cls)}</span>` +
      `<span class="muted small">${t.active ? "active" : "click to apply"}</span>` +
    `</div>`
  ).join("");
  list.querySelectorAll<HTMLElement>(".theme-row").forEach(row => {
    row.addEventListener("click", async () => {
      const cls = row.dataset.cls!;
      const next = !state.themes.find(t => t.cls === cls)?.active;
      await evalPage(COMMANDS.setTheme(next ? cls : ""));
      refresh();
    });
  });
}

/* ══════════════════════════════════════════
   RENDER: ANIMATIONS
══════════════════════════════════════════ */
function renderAnimations(filter = ""): void {
  const list = $("kf-list");
  const norm = filter.trim().toLowerCase();
  const filtered = norm ? state.keyframes.filter(k => k.name.toLowerCase().includes(norm)) : state.keyframes;
  $("kf-count").textContent = `${filtered.length} of ${state.keyframes.length}`;
  if (filtered.length === 0) {
    list.innerHTML = `<p class="muted small">No @keyframes rules on this page.</p>`;
    return;
  }
  list.innerHTML = filtered.map(kf => `
    <div class="kf-row" data-name="${escapeHtml(kf.name)}">
      <div class="kf-name">@keyframes ${escapeHtml(kf.name)}</div>
      <div class="kf-meta">${kf.stops} stops</div>
      <div class="kf-controls">
        <div class="kf-preview" data-name="${escapeHtml(kf.name)}"></div>
        <button class="icon-btn play-kf">play preview</button>
        <button class="icon-btn copy-kf">copy CSS</button>
      </div>
      <pre>${escapeHtml(kf.cssText)}</pre>
    </div>`
  ).join("");

  list.querySelectorAll<HTMLElement>(".play-kf").forEach(btn => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".kf-row") as HTMLElement;
      const preview = row.querySelector<HTMLElement>(".kf-preview")!;
      const name = row.dataset.name!;
      // Inject the keyframe CSS into the PANEL's document so the
      // `animation:` declaration has something to bind to. The keyframes
      // live in the inspected page's stylesheet — the panel runs in a
      // separate CSS scope and otherwise references a non-existent name.
      const kf = state.keyframes.find(k => k.name === name);
      if (kf && kf.cssText) injectKeyframe(kf.cssText);
      preview.style.animation = "none";
      void preview.offsetWidth; // reflow to restart
      preview.style.animation = `${name} 1.2s ease`;
    });
  });
  list.querySelectorAll<HTMLElement>(".copy-kf").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".kf-row") as HTMLElement;
      const kf  = state.keyframes.find(k => k.name === row.dataset.name);
      if (kf) { await navigator.clipboard.writeText(kf.cssText); toast("Copied CSS"); }
    });
  });
}

/* ══════════════════════════════════════════
   RENDER: STATS
══════════════════════════════════════════ */
function renderStats(): void {
  $("stat-rules").textContent    = String(state.stats.totalRules);
  $("stat-used").textContent     = String(state.stats.usedClasses);
  $("stat-bytes").textContent    = formatBytes(state.stats.bundleBytes);
  $("stat-tokens").textContent   = String(state.tokens.length);
  $("stat-themes").textContent   = String(state.themes.length);
  $("stat-anims").textContent    = String(state.keyframes.length);
  $("stat-scantime").textContent = lastScanMs !== null ? `${lastScanMs.toFixed(0)} ms` : "—";
}

function renderAll(): void {
  renderInspector();
  renderClasses(($("class-search") as HTMLInputElement).value);
  renderTokens(($("token-search") as HTMLInputElement).value);
  renderTheme();
  renderAnimations(($("kf-search") as HTMLInputElement).value);
  renderStats();
}

/* ══════════════════════════════════════════
   A11Y AUDIT — WCAG contrast + APCA Lc
══════════════════════════════════════════ */

let a11yResult: A11yResult | null = null;

async function runA11yAudit(): Promise<void> {
  const status = $("a11y-status");
  const card   = $("a11y-results-card") as HTMLElement;
  const btn    = $("a11y-run") as HTMLButtonElement;
  btn.disabled = true;
  status.textContent = "Scanning…";
  try {
    const json = await evalPage<string>(A11Y_AUDIT_SOURCE);
    a11yResult = JSON.parse(json) as A11yResult;
    card.hidden = false;
    const fails = a11yResult.findings.filter(f => f.severity === "fail").length;
    const warns = a11yResult.findings.filter(f => f.severity === "warn").length;
    status.textContent = `Scanned ${a11yResult.scanned} elements in ${a11yResult.durationMs.toFixed(0)} ms — ${fails} fail${fails===1?"":"s"}, ${warns} warning${warns===1?"":"s"}.`;
    renderA11y(($("a11y-search") as HTMLInputElement).value);
  } catch (e) {
    status.textContent = `Audit failed: ${(e as Error).message}`;
  } finally {
    btn.disabled = false;
  }
}

function renderA11y(filter: string): void {
  if (!a11yResult) return;
  const q = filter.trim().toLowerCase();
  const matches = a11yResult.findings.filter(f =>
    !q || f.label.toLowerCase().includes(q) || f.selector.toLowerCase().includes(q)
  );
  $("a11y-count").textContent = `${matches.length} finding${matches.length===1?"":"s"}`;
  const rows = $("a11y-rows");
  rows.innerHTML = matches.map(f => a11yRow(f)).join("") ||
    `<tr><td colspan="6" class="muted">No findings ${q ? "match the filter" : "— page is clean"}.</td></tr>`;
  attachA11yHandlers(rows);
}

function a11yRow(f: A11yFinding): string {
  const sev = f.severity === "fail" ? "✗" : "⚠";
  const sevClass = f.severity === "fail" ? "fail" : "warn";
  return `<tr class="${sevClass}" data-selector="${escapeHtml(f.selector)}">
    <td>${sev}</td>
    <td title="${escapeHtml(f.selector)}">${escapeHtml(f.label)}</td>
    <td class="num"><strong>${f.ratio.toFixed(2)}</strong>:1<br><span class="muted small">need ≥${f.required}:1</span></td>
    <td class="num">${f.apca.toFixed(0)}</td>
    <td class="value">
      <span class="swatch" style="background:${escapeHtml(f.fgValue)}"></span> ${escapeHtml(f.fgValue)}<br>
      <span class="swatch" style="background:${escapeHtml(f.bgValue)}"></span> ${escapeHtml(f.bgValue)}
    </td>
    <td class="muted small">${escapeHtml(f.standard)}</td>
  </tr>`;
}

function attachA11yHandlers(container: HTMLElement): void {
  container.querySelectorAll<HTMLTableRowElement>("tr[data-selector]").forEach(row => {
    row.style.cursor = "pointer";
    row.addEventListener("click", () => {
      const sel = row.getAttribute("data-selector");
      if (!sel) return;
      // Highlight the element on the page (2-second outline pulse).
      void evalPage(`(function(){var el=document.querySelector(${JSON.stringify(sel)});if(!el)return;var prev=el.style.outline;el.style.outline="2px solid #ff6f00";el.style.outlineOffset="2px";el.scrollIntoView({behavior:"smooth",block:"center"});setTimeout(function(){el.style.outline=prev;el.style.outlineOffset="";},2000);})();`);
    });
  });
}

/* ══════════════════════════════════════════
   ROW BUILDERS
══════════════════════════════════════════ */
function ruleRow(c: ClassInfo, extraClass = "", showCount = false): string {
  return `<tr class="${extraClass}">
    <td><span class="cls" data-cls="${escapeHtml(c.cls)}" title="Click to highlight on page">.${escapeHtml(c.cls)}</span></td>
    <td class="prop">${escapeHtml(c.prop)}</td>
    <td class="value">${valueWithSwatch(c.value)}</td>
    <td class="variant">${c.selector ? escapeHtml(c.selector) : ""}</td>
    ${showCount ? `<td class="num">${c.elementCount}</td>` : ""}
    <td class="row-actions">
      <button class="icon-btn copy-rule" data-cls="${escapeHtml(c.cls)}" data-prop="${escapeHtml(c.prop)}" data-value="${escapeHtml(c.value)}" data-sel="${escapeHtml(c.selector ?? "")}" title="Copy rule as CSS">⎘</button>
    </td>
  </tr>`;
}

function attachRowHandlers(scope: HTMLElement): void {
  scope.querySelectorAll<HTMLElement>(".cls").forEach(el => {
    el.addEventListener("click", async () => {
      const cls = el.dataset.cls!;
      await evalPage(COMMANDS.highlight(cls));
    });
  });
  scope.querySelectorAll<HTMLElement>(".copy-rule").forEach(el => {
    el.addEventListener("click", async () => {
      const cls = el.dataset.cls!, prop = el.dataset.prop!, value = el.dataset.value!, sel = el.dataset.sel!;
      const css = sel
        ? `.${cls}${sel.startsWith("@") ? "" : sel} { ${prop}: ${value}; }`
        : `.${cls} { ${prop}: ${value}; }`;
      await navigator.clipboard.writeText(css);
      toast("Copied as CSS");
    });
  });
}

/* ══════════════════════════════════════════
   ELEMENT PICKER
══════════════════════════════════════════ */
const pickerBtn = $("picker");
let pickerSyncTimer: number | undefined;

/**
 * Toggle the page-side picker. The page-side script handles its own
 * lifecycle — installs four-layer box-model overlay, captures every
 * pointer/click/key event in the capture phase, calls `inspect(target)`
 * directly when the user clicks (which promotes to `$0` and fires the
 * Elements panel selection-changed event we already listen to). So no
 * polling for the pick result. The only thing we DO poll is the picker's
 * active flag, at a much lower rate (500ms), so the toolbar button can
 * stop highlighting after the page-side picker self-cancels (Esc, click).
 */
async function togglePicker(): Promise<void> {
  if (pickerActive) {
    // User clicked the toolbar button while picker was active → cancel.
    pickerActive = false;
    pickerBtn.classList.remove("active");
    if (pickerSyncTimer !== undefined) clearInterval(pickerSyncTimer);
    pickerSyncTimer = undefined;
    try { await evalPage(COMMANDS.stopPicker); } catch { /* page may be unloading; ignore */ }
    return;
  }
  pickerActive = true;
  pickerBtn.classList.add("active");
  toast("Pick an element — Esc cancels · Tab walks up · Shift+Tab walks down · Alt freezes target");
  try {
    await evalPage(COMMANDS.startPicker);
  } catch (e) {
    pickerActive = false;
    pickerBtn.classList.remove("active");
    showError(`couldn't start picker — ${(e as Error).message}`);
    return;
  }
  // Low-rate sync: detect when the page-side picker self-cancelled (Esc,
  // navigation, or completed pick) so the toolbar button untoggles. We
  // ALSO refresh the inspector tab whenever we detect completion — the
  // elements-panel selection event normally drives that, but we can't
  // observe page-context events from the panel directly, so we trigger
  // refreshSelection() one extra time as a safety net.
  pickerSyncTimer = window.setInterval(async () => {
    if (!pickerActive) return;
    let stillActive = true;
    try {
      stillActive = await evalPage<boolean>(COMMANDS.isPickerActive);
    } catch { stillActive = false; }
    if (!stillActive) {
      pickerActive = false;
      pickerBtn.classList.remove("active");
      if (pickerSyncTimer !== undefined) clearInterval(pickerSyncTimer);
      pickerSyncTimer = undefined;
      // Pull selection — Chrome usually has fired its event by now, but
      // refreshSelection is idempotent and cheap.
      setTimeout(refreshSelection, 50);
      switchTab("inspector");
    }
  }, 500);
}

pickerBtn.addEventListener("click", togglePicker);

/* ══════════════════════════════════════════
   TABS, SEARCH, GLOBAL EVENTS
══════════════════════════════════════════ */
function switchTab(tab: string): void {
  document.querySelectorAll<HTMLElement>(".tab").forEach(t => {
    const active = t.dataset.tab === tab;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
    t.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll<HTMLElement>(".view").forEach(v => v.classList.toggle("active", v.dataset.view === tab));
  saveUI({ lastTab: tab });
}
document.querySelectorAll<HTMLElement>(".tab").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab!));
  // Arrow-key navigation across tabs (WAI-ARIA tablist pattern).
  btn.addEventListener("keydown", e => {
    const tabs = Array.from(document.querySelectorAll<HTMLElement>(".tab"));
    const idx  = tabs.indexOf(btn);
    if (e.key === "ArrowRight") { e.preventDefault(); tabs[(idx + 1) % tabs.length].focus(); tabs[(idx + 1) % tabs.length].click(); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); tabs[(idx - 1 + tabs.length) % tabs.length].focus(); tabs[(idx - 1 + tabs.length) % tabs.length].click(); }
    if (e.key === "Home") { e.preventDefault(); tabs[0].focus(); tabs[0].click(); }
    if (e.key === "End")  { e.preventDefault(); tabs[tabs.length - 1].focus(); tabs[tabs.length - 1].click(); }
  });
});

const classSearch = $("class-search") as HTMLInputElement;
const tokenSearch = $("token-search") as HTMLInputElement;
const kfSearch    = $("kf-search")    as HTMLInputElement;
classSearch.addEventListener("input", () => { renderClasses(classSearch.value); saveUI({ classFilter: classSearch.value }); });
tokenSearch.addEventListener("input", () => { renderTokens(tokenSearch.value); saveUI({ tokenFilter: tokenSearch.value }); });
kfSearch.addEventListener("input", () => renderAnimations(kfSearch.value));

/* A11y audit — explicit button (the scan touches every visible element,
   so we don't auto-run on every refresh). The filter input lets the user
   narrow large result lists in place. */
$("a11y-run").addEventListener("click", () => { void runA11yAudit(); });
($("a11y-search") as HTMLInputElement).addEventListener("input", e => {
  renderA11y((e.target as HTMLInputElement).value);
});

$("toggle-dark").addEventListener("click", async () => { await evalPage(COMMANDS.toggleDark); refresh(); });
$("toggle-rtl").addEventListener("click",  async () => { await evalPage(COMMANDS.toggleRtl);  refresh(); });

$("refresh").addEventListener("click", refresh);
$("error-retry").addEventListener("click", refresh);

/* ── About + help dialogs ─────────────────────────── */
const aboutBackdrop = $("about-backdrop");
const helpBackdrop  = $("help-backdrop");

function openAbout(): void {
  // Pull version dynamically from chrome.runtime so the dialog always
  // reflects the installed extension's actual version, not a hardcoded
  // string that might drift from the manifest.
  try {
    type Runtime = { getManifest?: () => { version?: string } };
    const r = (chrome as unknown as { runtime?: Runtime }).runtime;
    const v = r?.getManifest?.()?.version ?? "—";
    $("about-version").textContent = v;
  } catch { $("about-version").textContent = "—"; }
  aboutBackdrop.hidden = false;
  // Focus the close button so Enter/Space immediately dismisses.
  setTimeout(() => { try { ($("about-close") as HTMLElement).focus(); } catch {} }, 0);
}
function closeAbout(): void {
  aboutBackdrop.hidden = true;
  // Restore focus to the trigger so keyboard users don't lose context.
  try { ($("about") as HTMLElement).focus(); } catch {}
}

function openHelp(): void {
  helpBackdrop.hidden = false;
  setTimeout(() => { try { ($("help-close") as HTMLElement).focus(); } catch {} }, 0);
}
function closeHelp(): void {
  helpBackdrop.hidden = true;
  try { ($("help") as HTMLElement).focus(); } catch {}
}

$("about").addEventListener("click", openAbout);
$("about-close").addEventListener("click", closeAbout);
$("help").addEventListener("click", openHelp);
$("help-close").addEventListener("click", closeHelp);

/* Robust click-outside: any click that lands on the BACKDROP itself
   (not a child of the dialog) closes the dialog. We track mousedown
   origin so a drag-from-inside-to-outside doesn't accidentally close. */
function closeOnBackdropClick(backdrop: HTMLElement, close: () => void): void {
  let downOnBackdrop = false;
  backdrop.addEventListener("mousedown", e => { downOnBackdrop = e.target === backdrop; });
  backdrop.addEventListener("mouseup",   e => {
    if (downOnBackdrop && e.target === backdrop) close();
    downOnBackdrop = false;
  });
  // Click is fine too in case the user just clicked without dragging.
  backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
}
closeOnBackdropClick(aboutBackdrop, closeAbout);
closeOnBackdropClick(helpBackdrop,  closeHelp);

/* Dismiss handler for the inline "not-detected" banner. */
$("not-detected-close").addEventListener("click", () => {
  notDetectedDismissed = true;
  ($("not-detected") as HTMLElement).hidden = true;
});

/* Force-close every dialog. Called from Esc and as a hard-fallback in
   case ANY error in the panel UI ever leaves a modal stuck open. */
function closeAllDialogs(): void {
  try { closeAbout(); } catch { aboutBackdrop.hidden = true; }
  try { closeHelp();  } catch { helpBackdrop.hidden  = true; }
}
// Hard fallback — wrap unhandled errors so a stuck-open dialog can
// never freeze the panel. Defense in depth above the per-handler try/catches.
window.addEventListener("error",             () => closeAllDialogs());
window.addEventListener("unhandledrejection",() => closeAllDialogs());
($("cascade-only") as HTMLInputElement).addEventListener("change", e => {
  cascadeViewOnly = (e.target as HTMLInputElement).checked;
  saveUI({ cascadeOnly: cascadeViewOnly });
  renderInspector();
});

/* Keyboard shortcuts. */
document.addEventListener("keydown", e => {
  // Esc always works, even from inputs and dialogs.
  if (e.key === "Escape") {
    if (!aboutBackdrop.hidden) { closeAbout(); return; }
    if (!helpBackdrop.hidden)  { closeHelp();  return; }
    // Cancel picker via toggle (which routes through the page-side
    // cleanup callback). Fire-and-forget — the user just hit Esc, we
    // shouldn't block the keypress on a network round-trip.
    if (pickerActive) void togglePicker();
    (document.activeElement as HTMLElement | null)?.blur();
    return;
  }
  // Don't intercept other shortcuts while typing in an input.
  if (e.target instanceof HTMLInputElement) return;
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "p") { e.preventDefault(); togglePicker(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === "r")               { e.preventDefault(); refresh(); return; }
  if (e.key === "/")  { e.preventDefault(); focusSearchForCurrentTab(); return; }
  if (e.key === "?")  { e.preventDefault(); openHelp(); return; }
  // 1-6 → tab.
  const tab = document.querySelector<HTMLElement>(`.tab[data-key="${e.key}"]`);
  if (tab) { e.preventDefault(); switchTab(tab.dataset.tab!); }
});
function focusSearchForCurrentTab(): void {
  const active = document.querySelector<HTMLElement>(".tab.active")?.dataset.tab;
  if (active === "classes") classSearch.focus();
  else if (active === "tokens") tokenSearch.focus();
  else if (active === "animations") kfSearch.focus();
}

/* Reactive triggers — same shape Chrome / React DevTools use:
 *   - onNavigated: SPA route change OR full reload triggers a rescan.
 *     Wrapped via robust.ts so retries kick in if the new page hasn't
 *     finished painting yet.
 *   - onResourceContentCommitted: live-edit of CSS in the Sources panel
 *     reflects immediately.
 *   - onSelectionChanged: Element panel selection drives Inspector tab.
 */
onPageNavigation(() => {
  // Reset diff baseline — comparing against the previous URL's stats
  // would produce nonsense numbers ("+5000 rules" because we navigated
  // to a different app).
  lastSnapshot = null;
  // Brief grace period so the new page has a chance to mount its
  // stylesheet — robust.ts retries handle the rest.
  setTimeout(() => { void refresh(); }, 80);
});
try { chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(refresh); } catch { /* */ }
try { chrome.devtools.panels.elements.onSelectionChanged.addListener(refreshSelection); } catch { /* */ }

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
const ui = loadUI();
if (ui.lastTab)         switchTab(ui.lastTab);
if (ui.classFilter)     classSearch.value = ui.classFilter;
if (ui.tokenFilter)     tokenSearch.value = ui.tokenFilter;
if (ui.cascadeOnly) {
  ($("cascade-only") as HTMLInputElement).checked = true;
  cascadeViewOnly = true;
}

refresh();
refreshSelection();

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;"  :
    c === ">" ? "&gt;"  :
    c === '"' ? "&quot;" : "&#39;"
  ));
}

/**
 * Strict color validation — only accepts known-safe color literals. The
 * previous (looser) regex used `[^)]+` between parens which would have
 * accepted CSS-injection sequences like `rgba(red; background:url(...))`
 * if a hostile stylesheet ever made it past the browser's parser. The
 * tightened patterns below match each color family literally.
 *
 * Additionally:
 *   - We cap value length at 200 chars before inserting into the DOM.
 *   - We pass the matched value through `escapeHtml` AND emit it inside
 *     the `style` attribute via a custom property → variable indirection.
 *   - Any value that fails validation falls through to plain text — no
 *     swatch, no style attribute.
 */
const STRICT_COLOR_RE = new RegExp(
  "^(?:" +
    // hex: #abc, #abcd, #aabbcc, #aabbccdd
    "#[0-9a-fA-F]{3,8}" +
    "|" +
    // rgb / rgba — numeric (or %) channels separated by , or whitespace
    "rgba?\\(\\s*[0-9.%]+(?:\\s*[,/\\s]\\s*[0-9.%]+){2,3}\\s*\\)" +
    "|" +
    // hsl / hsla — h with optional unit, s + l as %, optional alpha
    "hsla?\\(\\s*[0-9.]+(?:deg|rad|turn|grad)?\\s*[,/\\s]\\s*[0-9.]+%\\s*[,/\\s]\\s*[0-9.]+%(?:\\s*[,/\\s]\\s*[0-9.%]+)?\\s*\\)" +
    "|" +
    // oklch / oklab / lab / lch — modern color spaces with similar structure
    "(?:oklch|oklab|lab|lch)\\(\\s*[0-9.%]+(?:\\s+[-0-9.%]+){2}(?:\\s*/\\s*[0-9.%]+)?\\s*\\)" +
  ")$"
);

function valueWithSwatch(value: string): string {
  const trimmed = value.length > 200 ? value.slice(0, 200) + "…" : value;
  const safe    = escapeHtml(trimmed);

  if (STRICT_COLOR_RE.test(trimmed.trim())) {
    // Inject the value via a CSS custom property → var(). Even if some
    // edge case smuggles a `;` past the strict regex (it shouldn't), the
    // payload is trapped inside the `--c` declaration. The browser's
    // CSS parser will reject anything not assignable to `background`.
    return `<span class="color-swatch" style="--c:${safe};background:var(--c)"></span>${safe}`;
  }
  return safe;
}

let toastTimer: number | undefined;
function toast(msg: string, isError = false): void {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  el.classList.add("show");
  if (isError) el.style.background = "#d32f2f"; else el.style.background = "";
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => { el.hidden = true; }, 200);
  }, 1800);
}

// Suppress unused-import warnings — these types travel through state.
type _USE_THEME_INFO     = ThemeInfo;
type _USE_KEYFRAME_INFO  = KeyframeInfo;

/**
 * Inject a keyframe's CSS text into the panel's document on demand.
 * Keyframes are stored once per name in a single `<style>` element,
 * `#tl-injected-kf-styles`, so subsequent play-preview clicks for the
 * same animation are no-ops. Defense-in-depth: we accept the cssText
 * verbatim from the inspected page's CSSOM (browser-normalized — no
 * injection risk), but cap at 16 KB so a degenerate input can't blow up
 * the panel's memory.
 */
const _injectedKfNames = new Set<string>();
function injectKeyframe(cssText: string): void {
  if (cssText.length > 16 * 1024) return;
  // Pull the keyframe name from the cssText so we don't re-inject the
  // same one on every play-preview click.
  const m = /^@keyframes\s+([\w-]+)/.exec(cssText.trim());
  const name = m?.[1];
  if (name && _injectedKfNames.has(name)) return;
  if (name) _injectedKfNames.add(name);

  let style = document.getElementById("tl-injected-kf-styles") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "tl-injected-kf-styles";
    document.head.appendChild(style);
  }
  // Append (don't overwrite) so multiple keyframes coexist.
  style.appendChild(document.createTextNode(cssText + "\n"));
}

/* ══════════════════════════════════════════
   GLOBAL SEARCH (Ctrl+Shift+F)
══════════════════════════════════════════ */
const searchBackdrop  = $("search-backdrop");
const globalSearch    = $("global-search") as HTMLInputElement;
const globalResults   = $("global-search-results");
let   activeSearchIdx = -1;

function openSearch(): void {
  searchBackdrop.hidden = false;
  globalSearch.value = "";
  globalResults.innerHTML = "";
  activeSearchIdx = -1;
  setTimeout(() => globalSearch.focus(), 0);
}
function closeSearch(): void {
  searchBackdrop.hidden = true;
  try { ($("search") as HTMLElement).focus(); } catch {}
}

interface SearchResult {
  tag:    "class" | "token" | "theme" | "animation";
  label:  string;
  meta?:  string;
  action: () => void;
}

function runGlobalSearch(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SearchResult[] = [];

  for (const c of state.classes) {
    if (
      c.cls.toLowerCase().includes(q) ||
      c.prop.toLowerCase().includes(q) ||
      c.value.toLowerCase().includes(q)
    ) {
      out.push({
        tag: "class",
        label: `.${c.cls} { ${c.prop}: ${c.value} }`,
        meta: c.selector ?? "",
        action: () => {
          switchTab("classes");
          ($("class-search") as HTMLInputElement).value = c.cls;
          renderClasses(c.cls);
          closeSearch();
        },
      });
    }
    if (out.length >= 100) break;
  }
  for (const t of state.tokens) {
    if (t.name.toLowerCase().includes(q) || t.value.toLowerCase().includes(q)) {
      out.push({
        tag: "token",
        label: `${t.name} = ${t.value}`,
        meta: t.darkValue ? `dark: ${t.darkValue}` : "",
        action: () => {
          switchTab("tokens");
          ($("token-search") as HTMLInputElement).value = t.name;
          renderTokens(t.name);
          closeSearch();
        },
      });
    }
  }
  for (const th of state.themes) {
    if (th.cls.toLowerCase().includes(q)) {
      out.push({
        tag: "theme",
        label: `.${th.cls}`,
        meta: th.active ? "active" : "",
        action: () => { switchTab("theme"); closeSearch(); },
      });
    }
  }
  for (const k of state.keyframes) {
    if (k.name.toLowerCase().includes(q)) {
      out.push({
        tag: "animation",
        label: `@keyframes ${k.name}`,
        meta: `${k.stops} stops`,
        action: () => {
          switchTab("animations");
          ($("kf-search") as HTMLInputElement).value = k.name;
          renderAnimations(k.name);
          closeSearch();
        },
      });
    }
  }
  return out;
}

function renderGlobalSearch(): void {
  const results = runGlobalSearch(globalSearch.value);
  if (results.length === 0) {
    globalResults.innerHTML = `<p class="muted small" style="text-align:center;padding:20px">${globalSearch.value.trim() ? "No matches" : ""}</p>`;
    return;
  }
  globalResults.innerHTML = results.slice(0, 50).map((r, i) =>
    `<div class="gs-result${i === activeSearchIdx ? " active" : ""}" data-idx="${i}">` +
      `<span class="gs-result-tag">${r.tag}</span>` +
      `<span class="gs-result-label">${escapeHtml(r.label)}</span>` +
      (r.meta ? `<span class="gs-result-meta">${escapeHtml(r.meta)}</span>` : "") +
    `</div>`
  ).join("");
  globalResults.querySelectorAll<HTMLElement>(".gs-result").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx!, 10);
      results[idx]?.action();
    });
  });
}

globalSearch.addEventListener("input", () => { activeSearchIdx = 0; renderGlobalSearch(); });
globalSearch.addEventListener("keydown", e => {
  const results = runGlobalSearch(globalSearch.value);
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeSearchIdx = Math.min(activeSearchIdx + 1, Math.min(results.length, 50) - 1);
    renderGlobalSearch();
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    activeSearchIdx = Math.max(activeSearchIdx - 1, 0);
    renderGlobalSearch();
  }
  if (e.key === "Enter" && activeSearchIdx >= 0) {
    e.preventDefault();
    results[activeSearchIdx]?.action();
  }
});

$("search").addEventListener("click", openSearch);
$("search-close").addEventListener("click", closeSearch);
searchBackdrop.addEventListener("click", e => { if (e.target === searchBackdrop) closeSearch(); });

/* ══════════════════════════════════════════
   SETTINGS TAB
══════════════════════════════════════════ */
function bindSetting(id: string, key: keyof UIState, onChange?: (v: boolean) => void): void {
  const el = $(id) as HTMLInputElement;
  const ui = loadUI();
  el.checked = (ui[key] as boolean | undefined) ?? true;
  el.addEventListener("change", () => {
    saveUI({ [key]: el.checked } as Partial<UIState>);
    if (onChange) onChange(el.checked);
  });
}
bindSetting("setting-color-swatches", "showColorSwatches", () => renderAll());
bindSetting("setting-element-counts", "showElementCounts", () => renderAll());
bindSetting("setting-conflicts",      "showConflicts",     () => renderInspector());
bindSetting("setting-auto-refresh",   "autoRefresh");

const showUnusedCheckbox = $("show-unused-only") as HTMLInputElement;
showUnusedCheckbox.checked = !!loadUI().showUnusedOnly;
showUnusedOnly = showUnusedCheckbox.checked;
showUnusedCheckbox.addEventListener("change", () => {
  showUnusedOnly = showUnusedCheckbox.checked;
  saveUI({ showUnusedOnly });
  renderClasses(($("class-search") as HTMLInputElement).value);
});

/* ── Export ── */
$("export-json").addEventListener("click", () => {
  const blob = JSON.stringify(state, null, 2);
  download("traceless-state.json", "application/json", blob);
  $("export-status").textContent = "Saved as traceless-state.json";
  setTimeout(() => $("export-status").textContent = "", 3000);
});
$("export-css").addEventListener("click", async () => {
  // Reconstruct CSS from state.classes — same shape the build would emit.
  let css = "";
  for (const r of state.classes) {
    const decl = `${r.prop}:${r.value}`;
    if (!r.selector)                    css += `.${r.cls}{${decl}}\n`;
    else if (r.selector.startsWith("@")) css += `${r.selector}{.${r.cls}{${decl}}}\n`;
    else                                 css += `.${r.cls}${r.selector}{${decl}}\n`;
  }
  download("traceless-style.export.css", "text/css", css);
  $("export-status").textContent = "Saved as traceless-style.export.css";
  setTimeout(() => $("export-status").textContent = "", 3000);
});

/* ── Reset ── */
$("reset-settings").addEventListener("click", () => {
  if (!confirm("Reset all settings, filters, and remembered state? This affects this browser only.")) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  $("reset-status").textContent = "Reset. Reloading panel…";
  setTimeout(() => location.reload(), 600);
});

function download(name: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── Wire Ctrl+Shift+F into the existing keyboard handler ──────── */
document.addEventListener("keydown", e => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
    e.preventDefault();
    openSearch();
  }
}, true);  // capture phase so it wins even when the panel input has focus

/* Esc inside the search dialog closes it. */
globalSearch.addEventListener("keydown", e => {
  if (e.key === "Escape") { e.stopPropagation(); closeSearch(); }
});
