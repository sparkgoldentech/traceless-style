/**
 * Integration tests for the v0.3 providers added on top of v0.2:
 *   - definition       (Ctrl+click `$.btn` → declaration)
 *   - folding          (collapsible regions)
 *   - selectionRanges  (smart-selection growth)
 *   - workspaceSymbols (Ctrl+T across project)
 *   - inlayHints       (rule counts next to group keys)
 *
 * Same vscode-API stub strategy as the earlier suites.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import Module from "node:module";

/* ── stub ─────────────────────────────────────────────────────────── */
class Position { constructor(public line: number, public character: number) {} }
class Range {
  constructor(public start: any, public end?: any, public ec?: any, public el?: any) {
    if (typeof start === "number" && typeof end === "number") {
      this.start = new Position(start, end);
      this.end   = new Position(ec ?? 0, el ?? 0);
    }
  }
}
class Location { constructor(public uri: any, public range: any) {} }
class FoldingRange { constructor(public start: number, public end: number, public kind?: number) {} }
const FoldingRangeKind = { Comment: 1, Imports: 2, Region: 3 };
class SelectionRange { constructor(public range: any, public parent?: any) {} }
class SymbolInformation {
  constructor(public name: string, public kind: number, public containerName: string, public location: any) {}
}
const SymbolKind = { Class: 4, Field: 7, Function: 11, Namespace: 2, Event: 23 };
class InlayHint {
  paddingLeft?: boolean; tooltip?: any;
  constructor(public position: Position, public label: string, public kind?: number) {}
}
const InlayHintKind = { Type: 1, Parameter: 2 };
class MarkdownString {
  isTrusted?: boolean; value: string;
  constructor(v = "") { this.value = v; }
  appendMarkdown(s: string): MarkdownString { this.value += s; return this; }
  appendText(s: string):     MarkdownString { this.value += s; return this; }
}

const vscodeStub = {
  Position, Range, Location, FoldingRange, FoldingRangeKind,
  SelectionRange, SymbolInformation, SymbolKind, InlayHint, InlayHintKind,
  MarkdownString,
  workspace: {
    getConfiguration() {
      return {
        get(key: string) {
          if (key === "enable")          return true;
          if (key === "inlayHints")      return true;
          if (key === "identifierAliases") return ["tl"];
          return undefined;
        },
      };
    },
    findFiles: async () => [],
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
    onDidSaveTextDocument:   () => ({ dispose: () => {} }),
    onDidDeleteFiles:        () => ({ dispose: () => {} }),
  },
  languages: {},
};

const realResolve = Module.prototype.require;
(Module.prototype as unknown as { require: NodeJS.Require }).require = function patched(this: NodeJS.Module, id: string) {
  if (id === "vscode") return vscodeStub;
  return realResolve.call(this, id);
} as NodeJS.Require;

/* ── load providers ──────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TlDefinitionProvider }     = require("./definition");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TlFoldingProvider }        = require("./folding");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TlSelectionRangeProvider } = require("./selectionRanges");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TlInlayHintsProvider }     = require("./inlayHints");

/* ── document mock ───────────────────────────────────────────────── */
function makeDoc(text: string) {
  const lines = text.split(/\r?\n/);
  const lineStarts: number[] = [0];
  for (let i = 0; i < lines.length; i++) lineStarts.push(lineStarts[i] + lines[i].length + 1);
  return {
    languageId: "typescriptreact",
    uri: { toString: () => "file:///t.tsx" },
    version: 1,
    getText: (range?: any) => {
      if (!range) return text;
      const s = lineStarts[range.start.line] + range.start.character;
      const e = lineStarts[range.end.line]   + range.end.character;
      return text.slice(s, e);
    },
    offsetAt:  (p: Position) => lineStarts[p.line] + p.character,
    positionAt:(o: number)   => {
      let lo = 0, hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid] <= o) lo = mid; else hi = mid - 1;
      }
      return new Position(lo, o - lineStarts[lo]);
    },
    lineAt: (arg: number | Position) => {
      const idx = typeof arg === "number" ? arg : arg.line;
      return { text: lines[idx] ?? "" };
    },
    getWordRangeAtPosition: (pos: Position, re: RegExp) => {
      const line = lines[pos.line] ?? "";
      const cloned = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      let m: RegExpExecArray | null;
      while ((m = cloned.exec(line)) !== null) {
        if (pos.character >= m.index && pos.character <= m.index + m[0].length) {
          return new Range(new Position(pos.line, m.index), new Position(pos.line, m.index + m[0].length));
        }
      }
      return undefined;
    },
  };
}

/* ══════════════════════════════════════════
   DEFINITION
══════════════════════════════════════════ */

test("[definition] $.btn → its declaration site", () => {
  const provider = new TlDefinitionProvider();
  const src = [
    `const $ = tl.create({`,
    `  btn:  { color: "red" },`,
    `  card: { color: "blue" },`,
    `});`,
    `<div className={$.btn} />`,
  ].join("\n");
  const doc = makeDoc(src);
  // Click on `btn` in `$.btn`.
  const useIdx = src.lastIndexOf("$.btn") + 2;
  const def = provider.provideDefinition(doc, doc.positionAt(useIdx + 1));
  assert.ok(def, "definition should be returned");
  const loc = def as any;
  // The declaration is on line 1.
  assert.equal(loc.range.start.line, 1);
});

test("[definition] returns null for a regular member access (not a tl alias)", () => {
  const provider = new TlDefinitionProvider();
  const src = `const obj = { foo: 1 }; obj.foo;`;
  const doc = makeDoc(src);
  const idx = src.lastIndexOf("obj.foo") + 4;
  assert.equal(provider.provideDefinition(doc, doc.positionAt(idx + 1)), null);
});

/* ══════════════════════════════════════════
   FOLDING
══════════════════════════════════════════ */

test("[folding] each tl.create group becomes a fold region", () => {
  const provider = new TlFoldingProvider();
  const src = [
    `const $ = tl.create({`,
    `  btn: {`,
    `    color: "red",`,
    `  },`,
    `  card: {`,
    `    color: "blue",`,
    `  },`,
    `});`,
  ].join("\n");
  const doc = makeDoc(src);
  const ranges = provider.provideFoldingRanges(doc) as FoldingRange[];
  // 1 outer call + 2 group bodies = 3 fold regions at minimum.
  assert.ok(ranges.length >= 3, `expected >=3 ranges, got ${ranges.length}`);
});

test("[folding] variant blocks are foldable", () => {
  const provider = new TlFoldingProvider();
  const src = [
    `tl.create({`,
    `  btn: {`,
    `    color: "red",`,
    `    _dark: {`,
    `      color: "white",`,
    `    },`,
    `  },`,
    `});`,
  ].join("\n");
  const doc = makeDoc(src);
  const ranges = provider.provideFoldingRanges(doc) as FoldingRange[];
  // Outer + btn + _dark = 3
  assert.ok(ranges.length >= 3);
});

/* ══════════════════════════════════════════
   SELECTION RANGES
══════════════════════════════════════════ */

test("[selection] cursor on a property key produces a chain key→pair→group→call", () => {
  const provider = new TlSelectionRangeProvider();
  const src = `tl.create({ btn: { color: "red" } });`;
  const doc = makeDoc(src);
  // Cursor on `color`.
  const cursor = src.indexOf("color") + 2;
  const ranges = provider.provideSelectionRanges(doc, [doc.positionAt(cursor)]) as SelectionRange[];
  assert.equal(ranges.length, 1);
  // The chain is innermost-first via .parent links — count depth.
  let depth = 0;
  let node: any = ranges[0];
  while (node) { depth++; node = node.parent; }
  assert.ok(depth >= 3, `expected at least 3 levels of selection, got ${depth}`);
});

/* ══════════════════════════════════════════
   INLAY HINTS
══════════════════════════════════════════ */

test("[inlay-hints] rule count appears next to each group key", () => {
  const provider = new TlInlayHintsProvider();
  const src = `tl.create({ btn: { color: "red", padding: "1rem" }, card: { color: "blue" } });`;
  const doc = makeDoc(src);
  const fullRange = new Range(new Position(0, 0), doc.positionAt(src.length));
  const hints = provider.provideInlayHints(doc, fullRange) as InlayHint[];
  assert.equal(hints.length, 2);
  // btn has 2 props, card has 1.
  const labels = hints.map(h => h.label);
  assert.ok(labels.some(l => l.includes("2 rule")));
  assert.ok(labels.some(l => l.includes("1 rule")));
});

test("[inlay-hints] variant blocks count toward the parent's total", () => {
  const provider = new TlInlayHintsProvider();
  const src = `tl.create({ btn: { color: "red", _dark: { color: "white" } } });`;
  const doc = makeDoc(src);
  const fullRange = new Range(new Position(0, 0), doc.positionAt(src.length));
  const hints = provider.provideInlayHints(doc, fullRange) as InlayHint[];
  assert.equal(hints.length, 1);
  // 1 base color + 1 dark color = 2 rules.
  assert.ok(hints[0].label.includes("2 rule"));
});
