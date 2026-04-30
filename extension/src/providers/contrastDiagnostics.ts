/**
 * traceless-style VS Code extension — contrast diagnostics provider.
 *
 * Inline WCAG contrast checking inside `tl.create({...})` blocks. Catches
 * unreadable foreground/background pairs the moment the user types them.
 *
 * What we audit (per group, per mode):
 *
 *   1. Light-mode `color` + `backgroundColor` pair on the SAME group.
 *      Failed AA → red squiggle on the foreground value, with a hover
 *      that includes the measured ratio, the WCAG citation, the APCA Lc
 *      score, and the suggested AAA-grade replacement.
 *
 *   2. Dark-mode pair from the user's explicit `_dark: { color, backgroundColor }`
 *      overrides (we don't auto-derive — that's the build-time validator's job;
 *      the IDE only flags WHAT THE USER WROTE).
 *
 *   3. UI-affordance contrast (§1.4.11) for `borderColor`, `outlineColor`,
 *      `caretColor`, `accentColor`, `textDecorationColor` against the
 *      group's `backgroundColor`. Threshold 3:1.
 *
 * Performance: re-uses the per-document debounce machinery already wired
 * in diagnostics.ts. Walker is brace-balanced + string-aware (same
 * algorithm as the existing diagnostics walker), runs in microseconds
 * for typical files.
 *
 * Privacy: no network, no telemetry. All math runs locally in the
 * extension process.
 */

import * as vscode from "vscode";
import {
  auditPair,
  parseColor,
  contrastRatio,
  composite,
  apcaLc,
  suggestAccessibleColor,
  WCAG,
} from "../wcagMath";

const SOURCE = "traceless-style";

export const CONTRAST_CODES = {
  TEXT_AA:    "contrast-text-aa",
  TEXT_AAA:   "contrast-text-aaa",
  UI:         "contrast-ui",
} as const;

/** Properties we check against the group's bg under §1.4.11 (3:1 minimum). */
const UI_COLOR_PROPS = new Set([
  "borderColor", "border-color",
  "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "outlineColor", "outline-color",
  "caretColor",   "caret-color",
  "accentColor",  "accent-color",
  "textDecorationColor", "text-decoration-color",
]);

/** Auto-fix metadata that the code-action provider reads back. */
interface ContrastFixData {
  fgValue:   string;
  bgValue:   string;
  surface:   string;
  target:    number;
  /** The exact range of the FG VALUE token in the source — the rewrite. */
  replaceRange: vscode.Range;
}

/* ── Public API ─────────────────────────────────────────────── */

export function buildContrastDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
  const cfg = vscode.workspace.getConfiguration("traceless-style");
  if (cfg.get<boolean>("enable") === false) return [];
  if (cfg.get<boolean>("contrast.enable") === false) return [];
  const aliases = cfg.get<string[]>("identifierAliases") ?? ["tl"];
  const level   = (cfg.get<string>("contrast.level") ?? "AA").toUpperCase() as "AA" | "AAA";
  const surfaceLight = cfg.get<string>("contrast.surfaceLight") ?? "#fafafa";
  const surfaceDark  = cfg.get<string>("contrast.surfaceDark")  ?? "#0a0a0f";

  const text = document.getText();
  const out:  vscode.Diagnostic[] = [];

  // The walker resolves text offsets to vscode.Range via this doc handle.
  // Set once at entry, cleared on exit, never observed concurrently — the
  // extension host is single-threaded for diagnostics.
  activeDoc = document;
  try {
    for (const group of collectGroups(text, aliases)) {
      auditGroup(group, document, level, surfaceLight, "light", out);
      const darkBlock = group.props.get("_dark");
      if (darkBlock?.kind === "object") {
        const merged = mergeWithParent(group, darkBlock.children);
        auditGroup(merged, document, level, surfaceDark, "dark", out);
      }
    }
  } finally {
    activeDoc = null;
  }
  return out;
}

/** The code-action provider reads this off a diagnostic to build its fix edit. */
export function getContrastFix(d: vscode.Diagnostic): ContrastFixData | null {
  return (d as unknown as { _tlContrastFix?: ContrastFixData })._tlContrastFix ?? null;
}

/* ── Per-group audit ────────────────────────────────────────── */

function auditGroup(
  group:   GroupShape,
  doc:     vscode.TextDocument,
  level:   "AA" | "AAA",
  surface: string,
  mode:    "light" | "dark",
  out:     vscode.Diagnostic[],
): void {
  /* TEXT contrast (§1.4.3 / §1.4.6) */
  const colorProp = group.props.get("color");
  const bgProp    = group.props.get("backgroundColor") ?? group.props.get("background-color");
  if (colorProp?.kind === "literal" && bgProp?.kind === "literal") {
    const audit = auditPair(colorProp.value, bgProp.value, surface);
    if (audit) {
      const wantAaa = level === "AAA";
      const failsAA  = !audit.passesAA;
      const failsAAA = wantAaa && !audit.passesAAA;
      if (failsAA || failsAAA) {
        const target = wantAaa ? WCAG.AAA_NORMAL : WCAG.AA_NORMAL;
        const code   = failsAAA && !failsAA ? CONTRAST_CODES.TEXT_AAA : CONTRAST_CODES.TEXT_AA;
        const sev    = failsAA ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
        const tier   = failsAA ? "WCAG 2.1 §1.4.3 AA" : "WCAG 2.1 §1.4.6 AAA";
        const sug    = suggestAccessibleColor(colorProp.value, bgProp.value, target, surface);
        const range  = colorProp.valueRange;
        const apcaRound = audit.apca.toFixed(0);
        const msg = (
          `${mode === "dark" ? "Dark-mode " : ""}contrast ${audit.ratio.toFixed(2)}:1 — ${tier} requires ≥${target}:1 ` +
          `for normal text. APCA Lc ${apcaRound} (advisory).` +
          (sug ? ` Suggested fix: "${sug}".` : "")
        );
        const d = new vscode.Diagnostic(range, msg, sev);
        d.source = SOURCE;
        d.code   = code;
        if (sug) attachFix(d, colorProp.value, bgProp.value, surface, target, range);
        out.push(d);
      }
    }
  }

  /* UI-affordance contrast (§1.4.11) — borders, outlines, caret, accent. */
  if (bgProp?.kind === "literal") {
    for (const [propName, propVal] of group.props) {
      if (!UI_COLOR_PROPS.has(propName))    continue;
      if (propVal.kind !== "literal")       continue;
      const audit = auditPair(propVal.value, bgProp.value, surface);
      if (!audit || audit.passesUi)         continue;
      const sug   = suggestAccessibleColor(propVal.value, bgProp.value, WCAG.AA_UI, surface);
      const apcaRound = audit.apca.toFixed(0);
      const msg = (
        `${mode === "dark" ? "Dark-mode " : ""}UI contrast ${audit.ratio.toFixed(2)}:1 — ` +
        `WCAG 2.1 §1.4.11 (Level AA) requires ≥3:1 for UI components. APCA Lc ${apcaRound}.` +
        (sug ? ` Suggested fix: "${sug}".` : "")
      );
      const d = new vscode.Diagnostic(propVal.valueRange, msg, vscode.DiagnosticSeverity.Warning);
      d.source = SOURCE;
      d.code   = CONTRAST_CODES.UI;
      if (sug) attachFix(d, propVal.value, bgProp.value, surface, WCAG.AA_UI, propVal.valueRange);
      out.push(d);
    }
  }
}

function attachFix(
  d:        vscode.Diagnostic,
  fgValue:  string,
  bgValue:  string,
  surface:  string,
  target:   number,
  replaceRange: vscode.Range,
): void {
  (d as unknown as { _tlContrastFix: ContrastFixData })._tlContrastFix = {
    fgValue, bgValue, surface, target, replaceRange,
  };
}

/* ── Lightweight tl.create walker — group-shaped output ──────── */

type PropValue =
  | { kind: "literal";  value: string; valueRange: vscode.Range }
  | { kind: "non-literal" }
  | { kind: "object";   children: Map<string, PropValue> };

interface GroupShape {
  /** Group key (e.g. "btn"). */
  name:  string;
  /** Direct properties + nested variant blocks of this group. */
  props: Map<string, PropValue>;
}

/** Pretend a `_dark` block inherits the parent's color/bg when not overridden. */
function mergeWithParent(parent: GroupShape, darkProps: Map<string, PropValue>): GroupShape {
  const merged = new Map<string, PropValue>(parent.props);
  for (const [k, v] of darkProps) merged.set(k, v);
  // Drop the _dark key from the merged view to avoid re-recursion.
  merged.delete("_dark");
  return { name: parent.name, props: merged };
}

function* collectGroups(src: string, aliases: string[]): Generator<GroupShape> {
  const aliasRe = aliases.map(escape).join("|");
  // Match `tl.create(`. We only audit `tl.create` — keyframes and extend
  // don't have a fg/bg pairing relationship to test.
  const re = new RegExp(`(?<![A-Za-z0-9_$])(?:${aliasRe})\\.create\\s*\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const callOpen = m.index + m[0].length - 1;
    const objBrace = nextNonWs(src, callOpen + 1);
    if (src[objBrace] !== "{") continue;
    const objClose = matchBrace(src, objBrace);
    if (objClose < 0) continue;
    yield* readGroups(src, objBrace + 1, objClose);
  }
}

function* readGroups(src: string, start: number, end: number): Generator<GroupShape> {
  let i = start;
  while (i < end) {
    i = skipWs(src, i);
    if (i >= end) return;
    const keyRead = readKey(src, i, end);
    if (!keyRead) { i++; continue; }
    let { name, next } = keyRead;
    i = skipWs(src, next);
    if (src[i] !== ":") { i = skipToCommaOrBrace(src, i, end); continue; }
    i = skipWs(src, i + 1);
    if (src[i] !== "{") { i = skipToCommaOrBrace(src, i, end); continue; }
    const groupClose = matchBrace(src, i);
    if (groupClose < 0) return;
    yield { name, props: readProps(src, i + 1, groupClose) };
    i = groupClose + 1;
    i = skipWs(src, i);
    if (src[i] === ",") i++;
  }
}

function readProps(src: string, start: number, end: number): Map<string, PropValue> {
  const out = new Map<string, PropValue>();
  let i = start;
  while (i < end) {
    i = skipWs(src, i);
    if (i >= end) break;
    const keyRead = readKey(src, i, end);
    if (!keyRead) { i++; continue; }
    const name = keyRead.name;
    i = skipWs(src, keyRead.next);
    if (src[i] !== ":") { i = skipToCommaOrBrace(src, i, end); continue; }
    i = skipWs(src, i + 1);
    const value = readValue(src, i, end);
    if (value) {
      out.set(name, value.value);
      i = value.next;
    } else {
      i = skipToCommaOrBrace(src, i, end);
    }
    i = skipWs(src, i);
    if (src[i] === ",") i++;
  }
  return out;
}

function readKey(src: string, i: number, end: number): { name: string; next: number } | null {
  if (src[i] === '"' || src[i] === "'") {
    const q = src[i++];
    const s = i;
    while (i < end && src[i] !== q) { if (src[i] === "\\") i += 2; else i++; }
    return { name: src.slice(s, i), next: i + 1 };
  }
  if (/[A-Za-z_$0-9-]/.test(src[i])) {
    const s = i;
    while (i < end && /[A-Za-z0-9_$-]/.test(src[i])) i++;
    return { name: src.slice(s, i), next: i };
  }
  return null;
}

function readValue(
  src: string, i: number, end: number
): { value: PropValue; next: number } | null {
  // Build vscode.Range later via positionAt; we just record offsets here
  // and wrap into Range at the diagnostic site. Since we need a Range
  // typed value, do it inline using the document.
  const valueStart = i;
  if (src[i] === "{") {
    const close = matchBrace(src, i);
    if (close < 0) return null;
    return {
      value: { kind: "object", children: readProps(src, i + 1, close) },
      next: close + 1,
    };
  }
  if (src[i] === '"' || src[i] === "'") {
    const q = src[i++];
    const s = i;
    while (i < end && src[i] !== q) { if (src[i] === "\\") i += 2; else i++; }
    const literal = src.slice(s, i);
    i++; // closing quote
    return {
      value: { kind: "literal", value: literal, valueRange: makeRangePlaceholder(valueStart, i) },
      next: i,
    };
  }
  if (src[i] === "`") {
    const s = ++i;
    while (i < end && src[i] !== "`") { if (src[i] === "\\") i += 2; else i++; }
    const literal = src.slice(s, i);
    i++;
    return {
      value: { kind: "literal", value: literal, valueRange: makeRangePlaceholder(valueStart, i) },
      next: i,
    };
  }
  if (/[-0-9.]/.test(src[i])) {
    const s = i;
    while (i < end && /[-0-9.eE+]/.test(src[i])) i++;
    return {
      value: { kind: "literal", value: src.slice(s, i), valueRange: makeRangePlaceholder(valueStart, i) },
      next: i,
    };
  }
  if (/[A-Za-z_$]/.test(src[i])) {
    while (i < end && /[A-Za-z0-9_$.]/.test(src[i])) i++;
    return { value: { kind: "non-literal" }, next: i };
  }
  return null;
}

/* The walker collects raw offsets; we resolve to vscode.Range lazily at
   diagnostic creation time via this thread-local document handle. The
   placeholder Range carries the raw offsets so resolveRange can promote. */
let activeDoc: vscode.TextDocument | null = null;
function makeRangePlaceholder(start: number, end: number): vscode.Range {
  // We need a Range NOW because PropValue holds it. But Range needs Position
  // which requires a document. Use a sentinel: we tag the Range with offsets
  // in undefined-position form, then convert at audit time.
  if (activeDoc) {
    return new vscode.Range(activeDoc.positionAt(start), activeDoc.positionAt(end));
  }
  // Fallback: a degenerate range; auditGroup is always called with a doc set.
  return new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
}

/* ── Brace / string / whitespace helpers ─────────────────────── */

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nextNonWs(src: string, i: number): number {
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
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
function skipToCommaOrBrace(src: string, i: number, end: number): number {
  while (i < end && src[i] !== "," && src[i] !== "}") i++;
  if (src[i] === ",") i++;
  return i;
}
function matchBrace(src: string, start: number): number {
  let depth = 0; let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") { i = skipString(src, i); continue; }
    if (ch === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2; continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}
function skipString(src: string, i: number): number {
  const q = src[i++];
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") { i += 2; continue; }
    if (q === "`" && ch === "$" && src[i + 1] === "{") {
      i += 2; let depth = 1;
      while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === '"' || c === "'" || c === "`") { i = skipString(src, i); continue; }
        i++;
      }
      continue;
    }
    if (ch === q) return i + 1;
    i++;
  }
  return i;
}

/* ── helpers exposed for tests / metrics ─────────────────────── */
export const _internals = {
  parseColor, contrastRatio, composite, apcaLc,
};
