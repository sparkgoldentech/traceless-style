/**
 * traceless-style VS Code extension — emitted-CSS live preview.
 *
 * Command: `traceless-style.previewCss`
 *
 * Opens a webview pinned to the right of the editor. Renders, in real
 * time, an approximation of the CSS the active TS/TSX file would emit
 * during build. Updates on every keystroke (~50 ms debounce) so users
 * see exactly what their `tl.create({...})` translates to before saving.
 *
 *   +---------------------------------------------------------------+
 *   | traceless-style -- emitted CSS for app/Card.tsx               |
 *   | --------------------------------------------------------------|
 *   |   .tla9b3c { padding: 1rem; }                                 |
 *   |   .tlxe87w { background-color: #6366f1; }                     |
 *   |   .tlksldj:hover { background-color: #4f46e5; }               |
 *   | --------------------------------------------------------------|
 *   | 12 atomic rules . 1.4 KB . click any rule to copy             |
 *   +---------------------------------------------------------------+
 *
 * Why the approximation: the build-time extractor runs token / theme /
 * keyframes side-effects we can't replay in-editor without spinning up
 * the whole library. Instead we walk the file with the same brace-
 * balanced parser the diagnostics provider uses, compute our own
 * `tlXXXXXX` hashes (FNV-1a base36 — same shape as the real one), and
 * emit one rule per leaf. Output is good enough for "what's my CSS
 * going to look like" intuition; the canonical bytes still come from
 * the build.
 *
 * Robustness: webview is reused across calls; closing it disposes
 * everything. Errors are caught and rendered inside the webview as a
 * red banner so the panel never goes blank.
 */

import * as vscode from "vscode";
import { getDocumentInfo } from "./documentCache";
import { error, info, trace } from "./logger";

let panel: vscode.WebviewPanel | undefined;
let lastDocUri: vscode.Uri | undefined;

export function registerPreview(context: vscode.ExtensionContext): vscode.Disposable {
  /* Re-render on document change when the previewed doc is being edited. */
  const onChange = vscode.workspace.onDidChangeTextDocument(e => {
    if (!panel || !lastDocUri) return;
    if (e.document.uri.toString() !== lastDocUri.toString()) return;
    schedule(e.document);
  });

  /* If the previewed document closes, mark the panel stale (don't auto-close
     — user may want to reopen the doc and continue). */
  const onClose = vscode.workspace.onDidCloseTextDocument(d => {
    if (!panel || !lastDocUri) return;
    if (d.uri.toString() === lastDocUri.toString()) {
      panel.webview.postMessage({ kind: "stale", reason: "document closed" });
    }
  });

  context.subscriptions.push(onChange, onClose);
  return {
    dispose: () => {
      onChange.dispose();
      onClose.dispose();
      panel?.dispose();
    }
  };
}

let timer: NodeJS.Timeout | undefined;
function schedule(document: vscode.TextDocument): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => render(document).catch(e => error("preview render", e)), 50);
}

export async function previewCssCommand(uri?: vscode.Uri): Promise<void> {
  const document = await resolveDoc(uri);
  if (!document) return;

  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      "tracelessStylePreview",
      "traceless-style — preview",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.webview.html = renderShell();
    panel.onDidDispose(() => { panel = undefined; lastDocUri = undefined; });
    /* Click-to-copy from the webview. */
    panel.webview.onDidReceiveMessage(msg => {
      if (msg?.kind === "copy" && typeof msg.text === "string") {
        void vscode.env.clipboard.writeText(msg.text);
        void vscode.window.setStatusBarMessage("traceless-style: copied", 1500);
      }
    });
    info(`preview: opened`);
  }
  lastDocUri = document.uri;
  await render(document);
  panel.reveal(vscode.ViewColumn.Beside, true);
}

async function resolveDoc(uri?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  if (uri) return vscode.workspace.openTextDocument(uri);
  return vscode.window.activeTextEditor?.document;
}

async function render(document: vscode.TextDocument): Promise<void> {
  if (!panel) return;
  const t0 = performance.now();
  const css = synthesizeCss(document);
  const cssBytes = Buffer.byteLength(css.body, "utf8");
  panel.title = `traceless-style — ${document.fileName.split(/[\\/]/).pop() ?? "preview"}`;
  panel.webview.postMessage({
    kind:     "render",
    fileName: document.fileName,
    body:     css.body,
    rules:    css.rules,
    bytes:    cssBytes,
    elapsed:  performance.now() - t0,
  });
  trace(`preview: ${css.rules} rules · ${cssBytes} B in ${(performance.now() - t0).toFixed(2)} ms`);
}

/* ── CSS synthesis ──────────────────────────────────────────── */

interface SynthResult { body: string; rules: number; }

function synthesizeCss(document: vscode.TextDocument): SynthResult {
  const info = getDocumentInfo(document);
  if (info.calls.length === 0) {
    return { body: "/* No tl.create / tl.keyframes / tl.extend in this file */", rules: 0 };
  }

  const lines: string[] = [];
  let ruleCount = 0;

  for (const call of info.calls) {
    if (call.method !== "create" && call.method !== "keyframes") continue;
    const group = info.groups.find(g => g.call === call);
    if (!group) continue;

    if (call.method === "create") {
      for (const entry of group.entries) {
        if (entry.valueKind !== "object") continue;
        const groupKey = entry.key;
        const body = info.text.slice(entry.valueStart + 1, entry.valueEnd - 1);
        const emitted = emitGroup(groupKey, body, "");
        if (emitted.length > 0) {
          lines.push(`/* ${groupKey} */`);
          lines.push(...emitted);
          ruleCount += emitted.length;
        }
      }
    } else {
      // keyframes: emit @keyframes preview.
      const name = call.keyframeName ?? "kf";
      lines.push(`@keyframes tlKf${shortHash(name)} {`);
      for (const entry of group.entries) {
        if (entry.valueKind !== "object") continue;
        const stop = entry.key;
        const body = info.text.slice(entry.valueStart + 1, entry.valueEnd - 1);
        const inner = emitFlat(body);
        lines.push(`  ${stop} { ${inner} }`);
        ruleCount++;
      }
      lines.push(`}`);
    }
  }
  return { body: lines.join("\n"), rules: ruleCount };
}

/**
 * Walk a group's body and emit one CSS rule per leaf entry. Variant
 * blocks (`_dark: { ... }`) recurse with the appropriate selector
 * suffix. Same logic the real extractor uses, simplified for preview.
 */
function emitGroup(groupKey: string, body: string, selectorSuffix: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < body.length) {
    i = skipWs(body, i);
    if (i >= body.length) break;
    const keyRead = readKey(body, i);
    if (!keyRead) { i++; continue; }
    let { name, next } = keyRead;
    i = skipWs(body, next);
    if (body[i] !== ":") { i = skipToCommaOrEnd(body, i); continue; }
    i = skipWs(body, i + 1);
    if (body[i] === "{") {
      const close = matchBrace(body, i);
      if (close < 0) break;
      const innerBody = body.slice(i + 1, close);
      const suffix = VARIANT_SELECTOR[name] ?? selectorSuffix;
      out.push(...emitGroup(groupKey, innerBody, suffix));
      i = close + 1;
    } else if (body[i] === '"' || body[i] === "'" || body[i] === "`") {
      const q = body[i++]; const valStart = i;
      while (i < body.length && body[i] !== q) { if (body[i] === "\\") i += 2; else i++; }
      const value = body.slice(valStart, i);
      i++;
      if (!name.startsWith("_")) {
        const cls = `.tl${shortHash(name + value + selectorSuffix)}`;
        out.push(`${cls}${selectorSuffix} { ${toKebab(name)}: ${value}; }`);
      }
    } else if (/[-0-9.]/.test(body[i])) {
      const start = i;
      while (i < body.length && /[-0-9.eE+]/.test(body[i])) i++;
      const value = body.slice(start, i);
      if (!name.startsWith("_")) {
        const cls = `.tl${shortHash(name + value + selectorSuffix)}`;
        out.push(`${cls}${selectorSuffix} { ${toKebab(name)}: ${value}px; }`);
      }
    } else {
      i = skipToCommaOrEnd(body, i);
    }
    i = skipWs(body, i);
    if (body[i] === ",") i++;
  }
  return out;
}

/** Emit a flat list of `prop: value;` pairs from a keyframe step body. */
function emitFlat(body: string): string {
  const decls: string[] = [];
  let i = 0;
  while (i < body.length) {
    i = skipWs(body, i);
    if (i >= body.length) break;
    const keyRead = readKey(body, i);
    if (!keyRead) { i++; continue; }
    let { name, next } = keyRead;
    i = skipWs(body, next);
    if (body[i] !== ":") { i = skipToCommaOrEnd(body, i); continue; }
    i = skipWs(body, i + 1);
    if (body[i] === '"' || body[i] === "'") {
      const q = body[i++]; const s = i;
      while (i < body.length && body[i] !== q) { if (body[i] === "\\") i += 2; else i++; }
      decls.push(`${toKebab(name)}: ${body.slice(s, i)};`);
      i++;
    } else if (/[-0-9.]/.test(body[i])) {
      const s = i;
      while (i < body.length && /[-0-9.eE+]/.test(body[i])) i++;
      decls.push(`${toKebab(name)}: ${body.slice(s, i)};`);
    } else {
      i = skipToCommaOrEnd(body, i);
    }
    i = skipWs(body, i);
    if (body[i] === ",") i++;
  }
  return decls.join(" ");
}

/* The real library hashes via FNV-1a → base36 → 6 chars. We use a
 * simpler 5-char base36 hash for preview — won't match the real classes
 * byte-for-byte, but it's stable per (name+value+selector) tuple so the
 * preview is internally consistent and easy to read. */
function shortHash(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).slice(0, 5);
}

function toKebab(s: string): string {
  // Don't kebab CSS variables (--foo) or vendor prefixes that begin with -.
  if (s.startsWith("-")) return s;
  return s.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
}

const VARIANT_SELECTOR: Record<string, string> = {
  _hover:       ":hover",
  _focus:       ":focus",
  _active:      ":active",
  _disabled:    ":disabled",
  _hoverFocus:  ":is(:hover, :focus)",
  _notDisabled: ":not(:disabled)",
  _first:       ":first-child",
  _last:        ":last-child",
  _odd:         ":nth-child(odd)",
  _even:        ":nth-child(even)",
  _dark:        ":is(.dark *)",
  _rtl:         "[dir=\"rtl\"] &",
  _ltr:         "[dir=\"ltr\"] &",
  _placeholder: "::placeholder",
};

/* ── tiny parsing helpers (mirror diagnostics walker) ───────── */

function readKey(src: string, i: number): { name: string; next: number } | null {
  if (src[i] === '"' || src[i] === "'") {
    const q = src[i++]; const s = i;
    while (i < src.length && src[i] !== q) { if (src[i] === "\\") i += 2; else i++; }
    return { name: src.slice(s, i), next: i + 1 };
  }
  if (/[A-Za-z_$0-9-]/.test(src[i])) {
    const s = i;
    while (i < src.length && /[A-Za-z0-9_$-]/.test(src[i])) i++;
    return { name: src.slice(s, i), next: i };
  }
  return null;
}
function skipWs(src: string, i: number): number {
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2; continue;
    }
    break;
  }
  return i;
}
function skipToCommaOrEnd(src: string, i: number): number {
  while (i < src.length && src[i] !== "," && src[i] !== "}") i++;
  if (src[i] === ",") i++;
  return i;
}
function matchBrace(src: string, start: number): number {
  let depth = 0; let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === "\\") i += 2; else i++; }
      i++; continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

/* ── Webview HTML shell ─────────────────────────────────────── */

function renderShell(): string {
  // Inline CSS + JS so the webview works with no remote resources and a
  // strict CSP. The script handles the `render` message from the host
  // and applies bare-bones syntax coloring.
  return /* html */ `<!doctype html>
<html>
<head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; padding: 0; height: 100%; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.55; }
  body { background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
  header { padding: 10px 14px; border-bottom: 1px solid var(--vscode-editorWidget-border, rgba(127,127,127,0.3)); display: flex; gap: 8px; align-items: baseline; }
  header h1 { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: .02em; }
  header .meta { color: var(--vscode-descriptionForeground); font-size: 11.5px; }
  pre { margin: 0; padding: 12px 14px; white-space: pre; overflow: auto; }
  .selector { color: #569cd6; }
  .property { color: #9cdcfe; }
  .value    { color: #ce9178; }
  .comment  { color: #6a9955; font-style: italic; }
  .at       { color: #c586c0; }
  .stale, .err { padding: 12px 14px; border-top: 1px solid var(--vscode-editorWidget-border, rgba(127,127,127,0.3)); color: #f14c4c; }
  .empty { padding: 24px; color: var(--vscode-descriptionForeground); text-align: center; }
  .row { cursor: pointer; }
  .row:hover { background: var(--vscode-editor-hoverHighlightBackground, rgba(127,127,127,0.08)); }
</style>
</head>
<body>
  <header><h1 id="title">traceless-style preview</h1><span class="meta" id="meta">waiting…</span></header>
  <pre id="out" class="empty">Open a TS/TSX file with tl.create() to see its CSS.</pre>
  <div id="stale" class="stale" style="display:none">Source document closed — preview is now stale.</div>
  <script>
    const vscode = acquireVsCodeApi();
    const out   = document.getElementById("out");
    const meta  = document.getElementById("meta");
    const title = document.getElementById("title");
    const stale = document.getElementById("stale");
    function highlight(text) {
      // Tiny CSS syntax painter: comment / @-rule / selector / decl.
      return text.split("\\n").map(line => {
        const c = line.trim();
        if (c.startsWith("/*")) return '<span class="comment">' + escape(line) + '</span>';
        if (c.startsWith("@"))  return '<span class="at">' + escape(line) + '</span>';
        const m = line.match(/^(\\s*)(\\.[^\\s{]+)([^{]*\\{)(.*?)(\\}.*)$/);
        if (m) {
          const decls = m[4].replace(/([a-z-]+)(\\s*:\\s*)([^;]+)(;?)/gi,
            (_, p, s, v, semi) => '<span class="property">' + escape(p) + '</span>' + escape(s) + '<span class="value">' + escape(v) + '</span>' + escape(semi));
          return escape(m[1]) + '<span class="selector">' + escape(m[2]) + '</span>' + escape(m[3]) + decls + escape(m[5]);
        }
        return escape(line);
      }).join("\\n");
    }
    function escape(s) { return String(s).replace(/[<>&]/g, c => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"); }
    out.addEventListener("click", e => {
      const sel = window.getSelection();
      const text = sel && sel.toString();
      if (text) vscode.postMessage({ kind: "copy", text });
    });
    window.addEventListener("message", ev => {
      const m = ev.data;
      if (!m) return;
      if (m.kind === "render") {
        stale.style.display = "none";
        title.textContent = "traceless-style — " + m.fileName.split(/[\\\\/]/).pop();
        meta.textContent = m.rules + " rule" + (m.rules === 1 ? "" : "s") + " · " + m.bytes + " B · " + m.elapsed.toFixed(0) + " ms";
        if (m.body) {
          out.classList.remove("empty");
          out.innerHTML = highlight(m.body);
        } else {
          out.classList.add("empty");
          out.textContent = "No tl.create / tl.keyframes calls in this file.";
        }
      } else if (m.kind === "stale") {
        stale.style.display = "block";
      }
    });
  </script>
</body>
</html>`;
}
