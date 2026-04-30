/**
 * Integration tests for the completion + color providers.
 *
 * These run on Node (no VS Code needed) by mocking the small subset of
 * the `vscode` module surface the providers actually touch. They drive
 * the providers against the real rtl-demo source so what's verified is
 * what a user would experience when typing in their editor.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";

/* ── vscode API stub ─────────────────────────────────────────────── */
// The provider code is import-time-tied to `vscode` — we register a
// require hook so importing it returns our stub. Keep the surface to
// EXACTLY what the providers reference; if they reach for something
// not here, the test fails loudly.

class Position { constructor(public line: number, public character: number) {} }
class Range    { constructor(public start: Position, public end: Position) {} }
class CompletionItem {
  detail?: string;
  documentation?: unknown;
  insertText?: unknown;
  sortText?: string;
  constructor(public label: string, public kind?: number) {}
}
class SnippetString { constructor(public value: string) {} }
class MarkdownString {
  isTrusted?: boolean;
  constructor(public value: string = "") {}
  appendMarkdown(s: string): MarkdownString { this.value += s; return this; }
  appendText(s: string):     MarkdownString { this.value += s; return this; }
  appendCodeblock(s: string, _lang?: string): MarkdownString { this.value += "\n```\n" + s + "\n```\n"; return this; }
}
class Color {
  constructor(public red: number, public green: number, public blue: number, public alpha: number) {}
}
class ColorInformation { constructor(public range: Range, public color: Color) {} }
class ColorPresentation { constructor(public label: string) {} }

const vscodeStub = {
  Position, Range,
  CompletionItem,
  CompletionItemKind: { Property: 9, Value: 11, Keyword: 13 },
  SnippetString,
  MarkdownString,
  Color, ColorInformation, ColorPresentation,
  workspace: {
    getConfiguration() {
      return {
        get<T>(key: string, fallback?: T): T | undefined {
          if (key === "enable") return true as unknown as T;
          if (key === "identifierAliases") return ["tl"] as unknown as T;
          return fallback;
        },
      };
    },
  },
  languages: {},
};

// Hook require("vscode") to return our stub.
const realResolve = Module.prototype.require;
(Module.prototype as unknown as { require: NodeJS.Require }).require = function patched(this: NodeJS.Module, id: string) {
  if (id === "vscode") return vscodeStub;
  return realResolve.call(this, id);
} as NodeJS.Require;

/* ── load providers AFTER patching ───────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TlCompletionProvider } = require("./completion");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TlColorProvider }      = require("./colors");

/* ── document stub ───────────────────────────────────────────────── */
function makeDoc(text: string) {
  const lines = text.split(/\r?\n/);
  const lineStarts: number[] = [0];
  for (let i = 0; i < lines.length; i++) lineStarts.push(lineStarts[i] + lines[i].length + 1);
  return {
    getText:   () => text,
    offsetAt:  (p: Position) => lineStarts[p.line] + p.character,
    positionAt:(o: number)   => {
      let lo = 0, hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid] <= o) lo = mid; else hi = mid - 1;
      }
      return new Position(lo, o - lineStarts[lo]);
    },
    // VS Code's lineAt accepts EITHER a number (line index) OR a Position.
    // The providers pass a Position, so we resolve to its line index here.
    lineAt: (arg: number | Position) => {
      const idx = typeof arg === "number" ? arg : arg.line;
      return { text: lines[idx] ?? "" };
    },
  };
}

/* ── load real source the user already has open ──────────────────── */
const RTL_DEMO = path.resolve(__dirname, "../../../spark-css-test/app/rtl-demo/page.tsx");
const rtlSrc = fs.existsSync(RTL_DEMO) ? fs.readFileSync(RTL_DEMO, "utf8") : "";

/* ══════════════════════════════════════════
   COMPLETION TESTS
══════════════════════════════════════════ */

test("[completion] property names suggested at key position inside a group", () => {
  const provider = new TlCompletionProvider();
  const src = `tl.create({ btn: { p } });`;
  const doc = makeDoc(src);
  const cursor = src.indexOf(" }") - 0; // right after `p`
  const items = provider.provideCompletionItems(doc, doc.positionAt(cursor)) as CompletionItem[];
  assert.ok(items, "expected completion items");
  const labels = items.map(i => i.label);
  assert.ok(labels.includes("padding"),     "padding should be suggested");
  assert.ok(labels.includes("paddingLeft"), "paddingLeft should be suggested");
  assert.ok(labels.includes("position"),    "position should be suggested");
});

test("[completion] returns null outside tl.create", () => {
  const provider = new TlCompletionProvider();
  const src = `import { foo } from "bar";\nconst x = 1;`;
  const doc = makeDoc(src);
  const result = provider.provideCompletionItems(doc, doc.positionAt(src.indexOf("x")));
  assert.equal(result, null);
});

test("[completion] returns null right after a comma (between-properties cool-off)", () => {
  // Reproduces the UX bug where typing `display: \"flex\",` then Enter
  // would accept a preselected suggestion. With the cool-off the popup
  // closes instead, and Enter inserts a newline.
  const provider = new TlCompletionProvider();
  const src = `tl.create({ btn: { display: "flex", } });`;
  const doc = makeDoc(src);
  const cursor = src.indexOf(", }") + 1;  // right after the comma, before space
  const result = provider.provideCompletionItems(doc, doc.positionAt(cursor));
  assert.equal(result, null);
});

test("[completion] returns null on a blank line inside a group body", () => {
  // After Enter, the cursor sits on an empty line — same logic, no
  // popup until the user types the first character of the next key.
  const provider = new TlCompletionProvider();
  const src = `tl.create({\n  btn: {\n    display: "flex",\n    \n  }\n});`;
  const doc = makeDoc(src);
  const cursor = src.indexOf("\n    \n") + "\n    ".length;
  const result = provider.provideCompletionItems(doc, doc.positionAt(cursor));
  assert.equal(result, null);
});

test("[completion] returns suggestions once the user types a character of the next key", () => {
  // Pop-up returns AFTER the user starts typing the next key.
  const provider = new TlCompletionProvider();
  const src = `tl.create({ btn: { display: "flex", p } });`;
  const doc = makeDoc(src);
  const cursor = src.indexOf("p }") + 1;  // right after `p`
  const items = provider.provideCompletionItems(doc, doc.positionAt(cursor)) as CompletionItem[];
  assert.ok(items, "expected items once a prefix is typed");
  const padding = items.find(i => i.label === "padding");
  assert.ok(padding, "padding should be in the list");
  // With a prefix, the first item gets preselected (existing behavior preserved).
  assert.ok(items[0].preselect === true, "first item should be preselected when a prefix is typed");
});

test("[completion] value-position completions: display: → flex/grid/block", () => {
  const provider = new TlCompletionProvider();
  const src = `tl.create({ btn: { display:  } });`;
  const doc = makeDoc(src);
  const cursor = src.indexOf("display: ") + "display: ".length;
  const items = provider.provideCompletionItems(doc, doc.positionAt(cursor)) as CompletionItem[];
  assert.ok(items, "expected items for value position");
  const labels = items.map(i => i.label);
  for (const v of ["flex", "grid", "block", "inline-block", "none"]) {
    assert.ok(labels.includes(v), `display value ${v} should be suggested`);
  }
});

test("[completion] variant keys offered with snippet expansion", () => {
  const provider = new TlCompletionProvider();
  const src = `tl.create({ btn: { _ } });`;
  const doc = makeDoc(src);
  const cursor = src.indexOf("_ }") + 1;
  const items = provider.provideCompletionItems(doc, doc.positionAt(cursor)) as CompletionItem[];
  assert.ok(items);
  const dark   = items.find(i => i.label === "_dark");
  const autoRtl= items.find(i => i.label === "_autoRtl");
  assert.ok(dark,    "_dark should be present");
  assert.ok(autoRtl, "_autoRtl should be present");
  // Variants insert as snippet `name: { $0 }`.
  assert.ok(dark.insertText instanceof SnippetString);
  assert.match((dark.insertText as SnippetString).value, /_dark: \{ \$0 \}/);
});

test("[completion] keyframes top level offers from / to / percentages", () => {
  const provider = new TlCompletionProvider();
  const src = `tl.keyframes({  });`;
  const doc = makeDoc(src);
  const cursor = src.indexOf("({ ") + 3;
  const items = provider.provideCompletionItems(doc, doc.positionAt(cursor)) as CompletionItem[];
  assert.ok(items);
  const labels = items.map(i => i.label);
  for (const stop of ["from", "to", "0%", "50%", "100%"]) {
    assert.ok(labels.includes(stop), `keyframe stop ${stop} should be suggested`);
  }
});

/* ══════════════════════════════════════════
   COLOR PROVIDER TESTS
══════════════════════════════════════════ */

test("[colors] hex literals inside tl.create are detected", () => {
  const provider = new TlColorProvider();
  const src = `tl.create({ btn: { color: "#1a73e8", bg: "rgba(0,0,0,0.5)" } });`;
  const doc = makeDoc(src);
  const colors = provider.provideDocumentColors(doc) as ColorInformation[];
  assert.equal(colors.length, 2);
  // First match: #1a73e8 → roughly (26/255, 115/255, 232/255, 1)
  const c1 = colors[0].color;
  assert.ok(Math.abs(c1.red   - 26/255)  < 0.01);
  assert.ok(Math.abs(c1.green - 115/255) < 0.01);
  assert.ok(Math.abs(c1.blue  - 232/255) < 0.01);
  assert.equal(c1.alpha, 1);
  // Second match: rgba(0,0,0,0.5)
  const c2 = colors[1].color;
  assert.equal(c2.red, 0); assert.equal(c2.green, 0); assert.equal(c2.blue, 0);
  assert.equal(c2.alpha, 0.5);
});

test("[colors] hex literals OUTSIDE tl.create are ignored", () => {
  const provider = new TlColorProvider();
  const src = `const note = "use #ff0000 for danger"; tl.create({ x: { color: "#00ff00" } });`;
  const doc = makeDoc(src);
  const colors = provider.provideDocumentColors(doc) as ColorInformation[];
  // Only the inside-tl.create one should appear.
  assert.equal(colors.length, 1);
  // Green channel should dominate.
  assert.equal(colors[0].color.green, 1);
});

test("[colors] hsl literals are parsed correctly", () => {
  const provider = new TlColorProvider();
  // hsl(0, 100%, 50%) is pure red.
  const src = `tl.create({ x: { color: "hsl(0, 100%, 50%)" } });`;
  const doc = makeDoc(src);
  const colors = provider.provideDocumentColors(doc) as ColorInformation[];
  assert.equal(colors.length, 1);
  const c = colors[0].color;
  assert.ok(Math.abs(c.red - 1) < 0.01,   "red channel ≈ 1");
  assert.ok(Math.abs(c.green) < 0.01,     "green channel ≈ 0");
  assert.ok(Math.abs(c.blue) < 0.01,      "blue channel ≈ 0");
});

test("[colors] presentations include hex / rgb / hsl in that order", () => {
  const provider = new TlColorProvider();
  const c = new Color(1, 0, 0, 1); // pure red
  const presentations = provider.provideColorPresentations(c) as ColorPresentation[];
  assert.equal(presentations.length, 3);
  assert.equal(presentations[0].label, "#ff0000");
  assert.match(presentations[1].label, /rgb\(255,0,0\)/);
  assert.match(presentations[2].label, /hsl\(0,100%,50%\)/);
});

test("[colors] alpha channel preserved through round-trip", () => {
  const provider = new TlColorProvider();
  const c = new Color(0.5, 0.5, 0.5, 0.5);
  const presentations = provider.provideColorPresentations(c) as ColorPresentation[];
  assert.match(presentations[0].label, /^#80808080$/);
  assert.match(presentations[1].label, /rgba\(128,128,128,0\.5\)/);
});

/* ══════════════════════════════════════════
   AGAINST THE REAL rtl-demo SOURCE
══════════════════════════════════════════ */

test("[real-file] all colors in rtl-demo.tsx are detected (~30+ swatches)", () => {
  if (!rtlSrc) { console.log("  rtl-demo not present, skipping"); return; }
  const provider = new TlColorProvider();
  const doc = makeDoc(rtlSrc);
  const colors = provider.provideDocumentColors(doc) as ColorInformation[];
  // The file has dozens of color literals. Expect at least 25.
  assert.ok(colors.length >= 25, `expected >=25 swatches, got ${colors.length}`);
});

test("[real-file] property completion fires inside the page: { ... } block", () => {
  if (!rtlSrc) { console.log("  rtl-demo not present, skipping"); return; }
  const provider = new TlCompletionProvider();
  const doc = makeDoc(rtlSrc);
  // Pick a line inside the `page:` group — the blank line at original
  // line 30 (index 29) sits between properties.
  const blankLineIdx = rtlSrc.split(/\r?\n/).findIndex(l => /^\s+$/.test(l) && rtlSrc.indexOf(l) > rtlSrc.indexOf("page: {"));
  if (blankLineIdx < 0) { console.log("  no blank line in page block — skipping"); return; }
  const offset = doc.offsetAt(new Position(blankLineIdx, 4));
  const items = provider.provideCompletionItems(doc, doc.positionAt(offset)) as CompletionItem[] | null;
  assert.ok(items, "completion should fire inside page: { ... }");
  assert.ok(items.some(i => i.label === "padding"), "padding should be suggested");
  assert.ok(items.some(i => i.label === "_dark"),   "_dark variant should be suggested");
});

test("[real-file] completion does NOT fire inside the imports block", () => {
  if (!rtlSrc) { console.log("  rtl-demo not present, skipping"); return; }
  const provider = new TlCompletionProvider();
  const doc = makeDoc(rtlSrc);
  const importLineIdx = rtlSrc.split(/\r?\n/).findIndex(l => l.startsWith("import"));
  const offset = doc.offsetAt(new Position(importLineIdx, 8));
  const items = provider.provideCompletionItems(doc, doc.positionAt(offset));
  assert.equal(items, null, "no completion outside tl.create");
});
