/**
 * Integration tests for the new providers added in v0.2:
 *   - hover (CSS docs / variant selectors / color resolution)
 *   - diagnostics (unknown property, non-literal, suspicious value)
 *   - code actions (quick-fix replacements)
 *   - document symbols (outline)
 *
 * Same vscode-API stub pattern as providers.test.ts.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import Module from "node:module";

/* ── vscode API stub ─────────────────────────────────────────────── */
class Position { constructor(public line: number, public character: number) {} }
class Range {
  constructor(public start: Position | number, public end?: Position | number, public ec?: number, public el?: number) {
    if (typeof start === "number" && typeof end === "number") {
      // Range(startLine, startChar, endLine, endChar) overload — used by hover.ts
      this.start = new Position(start, end);
      this.end   = new Position(ec ?? 0, el ?? 0);
    }
  }
}
class CompletionItem {
  detail?: string; documentation?: any; insertText?: any; sortText?: string; filterText?: string; preselect?: boolean;
  constructor(public label: string, public kind?: number) {}
}
class SnippetString { constructor(public value: string) {} }
class MarkdownString {
  isTrusted?: boolean;
  constructor(public value: string = "") {}
  appendMarkdown(s: string): MarkdownString { this.value += s; return this; }
  appendText(s: string):     MarkdownString { this.value += s; return this; }
}
class Hover { constructor(public contents: any, public range?: any) {} }
class Diagnostic {
  source?: string; code?: any;
  constructor(public range: any, public message: string, public severity?: number) {}
}
const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };
class DocumentSymbol {
  children: DocumentSymbol[] = [];
  constructor(public name: string, public detail: string, public kind: number, public range: any, public selectionRange: any) {}
}
const SymbolKind = { Class: 4, Field: 7, Function: 11, Namespace: 2, Event: 23 };
class Color { constructor(public red: number, public green: number, public blue: number, public alpha: number) {} }
class CodeAction {
  edit?: any; diagnostics?: any[]; isPreferred?: boolean; command?: any;
  constructor(public title: string, public kind?: any) {}
}
const CodeActionKind = { QuickFix: { value: "quickfix" } };
class WorkspaceEdit {
  edits: Array<{ uri: any; range: any; newText: string }> = [];
  replace(uri: any, range: any, newText: string): void { this.edits.push({ uri, range, newText }); }
}
const Uri = { parse: (s: string) => ({ toString: () => s, _s: s }) };

const vscodeStub = {
  Position, Range, CompletionItem, SnippetString, MarkdownString, Hover,
  Diagnostic, DiagnosticSeverity, DocumentSymbol, SymbolKind,
  Color,
  CompletionItemKind: { Property: 9, Value: 11, Keyword: 13 },
  ColorInformation: class {}, ColorPresentation: class {},
  CodeAction, CodeActionKind, WorkspaceEdit, Uri,
  workspace: {
    getConfiguration() {
      return {
        get(key: string) {
          if (key === "enable") return true;
          if (key === "diagnostics") return true;
          if (key === "identifierAliases") return ["tl"];
          return undefined;
        },
      };
    },
    onDidOpenTextDocument:   () => ({ dispose: () => {} }),
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
    onDidSaveTextDocument:   () => ({ dispose: () => {} }),
    onDidCloseTextDocument:  () => ({ dispose: () => {} }),
    textDocuments: [],
  },
  languages: {
    createDiagnosticCollection: () => ({ set: () => {}, delete: () => {}, dispose: () => {} }),
  },
};

const realResolve = Module.prototype.require;
(Module.prototype as unknown as { require: NodeJS.Require }).require = function patched(this: NodeJS.Module, id: string) {
  if (id === "vscode") return vscodeStub;
  return realResolve.call(this, id);
} as NodeJS.Require;

/* ── load providers ──────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TlHoverProvider }            = require("./hover");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildDiagnostics, readSuggestions } = require("./diagnostics");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TlCodeActionProvider }       = require("./codeActions");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TlDocumentSymbolProvider }   = require("./symbols");

/* ── document mock ───────────────────────────────────────────────── */
function makeDoc(text: string, languageId = "typescriptreact") {
  const lines = text.split(/\r?\n/);
  const lineStarts: number[] = [0];
  for (let i = 0; i < lines.length; i++) lineStarts.push(lineStarts[i] + lines[i].length + 1);
  return {
    languageId,
    uri: { toString: () => "file:///test.tsx" },
    getText: (range?: any) => {
      if (!range) return text;
      // VS Code's getText(range) returns the substring between the two
      // positions. Our mock supports the common case the providers need.
      const startOff = lineStarts[range.start.line] + range.start.character;
      const endOff   = lineStarts[range.end.line]   + range.end.character;
      return text.slice(startOff, endOff);
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
   HOVER
══════════════════════════════════════════ */

test("[hover] CSS property name → docs + MDN link", () => {
  const provider = new TlHoverProvider();
  const src = `tl.create({ btn: { padding: "1rem" } });`;
  const doc = makeDoc(src);
  const pos = doc.positionAt(src.indexOf("padding") + 2);
  const hover = provider.provideHover(doc, pos);
  assert.ok(hover, "hover should fire on padding");
  const md = hover.contents as MarkdownString;
  assert.match(md.value, /padding/);
  assert.match(md.value, /MDN/);
});

test("[hover] variant key → selector explanation", () => {
  const provider = new TlHoverProvider();
  const src = `tl.create({ btn: { _dark: { color: "red" } } });`;
  const doc = makeDoc(src);
  const pos = doc.positionAt(src.indexOf("_dark") + 1);
  const hover = provider.provideHover(doc, pos);
  assert.ok(hover);
  const md = hover.contents as MarkdownString;
  assert.match(md.value, /_dark/);
  assert.match(md.value, /:is\(\.dark \*\)/);
});

test("[hover] hex color → rgb resolution", () => {
  const provider = new TlHoverProvider();
  const src = `tl.create({ btn: { color: "#1a73e8" } });`;
  const doc = makeDoc(src);
  const pos = doc.positionAt(src.indexOf("#1a73e8") + 3);
  const hover = provider.provideHover(doc, pos);
  assert.ok(hover);
  const md = hover.contents as MarkdownString;
  assert.match(md.value, /rgb\(26, 115, 232\)/);
});

test("[hover] outside tl.create returns null", () => {
  const provider = new TlHoverProvider();
  const src = `import { foo } from "bar";`;
  const doc = makeDoc(src);
  const pos = doc.positionAt(src.indexOf("foo") + 1);
  const hover = provider.provideHover(doc, pos);
  assert.equal(hover, null);
});

/* ══════════════════════════════════════════
   DIAGNOSTICS
══════════════════════════════════════════ */

test("[diagnostics] unknown CSS property → error with suggestion", () => {
  const src = `tl.create({ btn: { colour: "red" } });`;
  const doc = makeDoc(src);
  const diags = buildDiagnostics(doc) as Diagnostic[];
  const unknown = diags.find(d => d.message.includes("colour"));
  assert.ok(unknown, "should diagnose 'colour'");
  assert.match(unknown.message, /Did you mean .*color/);
  const suggestions = readSuggestions(unknown);
  assert.ok(suggestions.includes("color"));
});

test("[diagnostics] non-literal value → error", () => {
  const src = `const myColor = "red";\ntl.create({ btn: { color: myColor } });`;
  const doc = makeDoc(src);
  const diags = buildDiagnostics(doc) as Diagnostic[];
  const nonLit = diags.find(d => d.message.includes("literal"));
  assert.ok(nonLit, "should diagnose non-literal value");
});

test("[diagnostics] suspicious value (CSS-injection-like) → warning", () => {
  const src = `tl.create({ btn: { color: "red; }" } });`;
  const doc = makeDoc(src);
  const diags = buildDiagnostics(doc) as Diagnostic[];
  const sus = diags.find(d => d.code === "suspicious-value" || d.message.includes("CSS-injection"));
  assert.ok(sus, "should diagnose suspicious sequence");
});

test("[diagnostics] valid styles produce zero diagnostics", () => {
  const src = `tl.create({ btn: { padding: "1rem", color: "#000" } });`;
  const doc = makeDoc(src);
  const diags = buildDiagnostics(doc) as Diagnostic[];
  assert.equal(diags.length, 0);
});

test("[diagnostics] _dark and other variants don't trip the unknown-prop rule", () => {
  const src = `tl.create({ btn: { color: "red", _dark: { color: "white" }, _autoRtl: false } });`;
  const doc = makeDoc(src);
  const diags = buildDiagnostics(doc) as Diagnostic[];
  assert.equal(diags.length, 0, `expected 0, got: ${diags.map(d => d.message).join(" | ")}`);
});

test("[diagnostics] CSS custom properties (--foo) accepted", () => {
  const src = `tl.create({ btn: { "--my-token": "12px" } });`;
  const doc = makeDoc(src);
  const diags = buildDiagnostics(doc) as Diagnostic[];
  assert.equal(diags.length, 0);
});

/* ══════════════════════════════════════════
   CODE ACTIONS (quick-fix)
══════════════════════════════════════════ */

test("[code-actions] unknown property → 'Replace with X' actions", () => {
  const src = `tl.create({ btn: { colour: "red" } });`;
  const doc = makeDoc(src);
  const diags = buildDiagnostics(doc) as Diagnostic[];

  const provider = new TlCodeActionProvider();
  const actions = provider.provideCodeActions(doc, diags[0].range, { diagnostics: diags }) as CodeAction[];
  assert.ok(actions.length > 0, "should produce at least one quick-fix");
  const replaceColor = actions.find(a => a.title.includes("color"));
  assert.ok(replaceColor, "should offer 'Replace with color'");
  // The first action is marked preferred.
  assert.ok(actions[0].isPreferred);
});

/* ══════════════════════════════════════════
   DOCUMENT SYMBOLS (outline)
══════════════════════════════════════════ */

test("[symbols] tl.create produces a tree with each group as a child", () => {
  const provider = new TlDocumentSymbolProvider();
  const src = `tl.create({\n  btn: { padding: "1rem" },\n  card: { color: "red" },\n});`;
  const doc = makeDoc(src);
  const symbols = provider.provideDocumentSymbols(doc) as DocumentSymbol[];
  assert.equal(symbols.length, 1);
  const root = symbols[0];
  assert.equal(root.name, "tl.create");
  assert.equal(root.children.length, 2);
  assert.deepEqual(root.children.map(c => c.name).sort(), ["btn", "card"]);
});

test("[symbols] tl.keyframes pulls the animation name into the label", () => {
  const provider = new TlDocumentSymbolProvider();
  const src = `tl.keyframes("fadeIn", { from: { opacity: 0 }, to: { opacity: 1 } });`;
  const doc = makeDoc(src);
  const symbols = provider.provideDocumentSymbols(doc) as DocumentSymbol[];
  assert.equal(symbols.length, 1);
  assert.equal(symbols[0].name, "tl.keyframes: fadeIn");
});

test("[symbols] variants nested under their group", () => {
  const provider = new TlDocumentSymbolProvider();
  const src = `tl.create({ btn: { color: "red", _dark: { color: "white" }, _hover: { color: "blue" } } });`;
  const doc = makeDoc(src);
  const symbols = provider.provideDocumentSymbols(doc) as DocumentSymbol[];
  const btn = symbols[0].children[0];
  const childNames = btn.children.map(c => c.name).sort();
  assert.deepEqual(childNames, ["_dark", "_hover", "color"]);
});
