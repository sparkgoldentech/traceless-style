/**
 * Integration tests for the v0.4 providers — references, rename,
 * signature help, plus the documentCache that backs all of them.
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
class WorkspaceEdit {
  edits: Array<{ uri: any; range: any; newText: string }> = [];
  replace(uri: any, range: any, newText: string): void { this.edits.push({ uri, range, newText }); }
}
class MarkdownString {
  isTrusted?: boolean; value: string;
  constructor(v = "") { this.value = v; }
  appendMarkdown(s: string): MarkdownString { this.value += s; return this; }
}
class SignatureHelp { signatures: any[] = []; activeSignature = 0; activeParameter = 0; }
class SignatureInformation {
  documentation?: any; parameters?: any[];
  constructor(public label: string) {}
}
class ParameterInformation {
  constructor(public label: string, public documentation?: any) {}
}

const vscodeStub = {
  Position, Range, Location, WorkspaceEdit, MarkdownString,
  SignatureHelp, SignatureInformation, ParameterInformation,
  workspace: {
    getConfiguration() {
      return {
        get(key: string) {
          if (key === "enable") return true;
          if (key === "identifierAliases") return ["tl"];
          return undefined;
        },
      };
    },
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
const { TlReferencesProvider }    = require("./references");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TlRenameProvider }        = require("./rename");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TlSignatureHelpProvider } = require("./signatureHelp");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDocumentInfo, clearCache } = require("../documentCache");

/* ── document mock ───────────────────────────────────────────────── */
let docVersion = 1;
function makeDoc(text: string) {
  const lines = text.split(/\r?\n/);
  const lineStarts: number[] = [0];
  for (let i = 0; i < lines.length; i++) lineStarts.push(lineStarts[i] + lines[i].length + 1);
  const v = docVersion++;
  return {
    languageId: "typescriptreact",
    uri: { toString: () => `file:///t-${v}.tsx` },
    version: v,
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

const NO_TOKEN = { isCancellationRequested: false } as any;

/* ══════════════════════════════════════════
   DOCUMENT CACHE
══════════════════════════════════════════ */

test("[cache] returns same object on repeated calls when version unchanged", () => {
  clearCache();
  const src = `tl.create({ btn: { color: "red" } });`;
  const doc = makeDoc(src);
  const a = getDocumentInfo(doc);
  const b = getDocumentInfo(doc);
  assert.strictEqual(a, b);
});

test("[cache] rebuilds on version change", () => {
  clearCache();
  const src = `tl.create({ btn: { color: "red" } });`;
  const doc = makeDoc(src);
  const a = getDocumentInfo(doc);
  doc.version = 999;
  const b = getDocumentInfo(doc);
  assert.notStrictEqual(a, b);
});

/* ══════════════════════════════════════════
   REFERENCES
══════════════════════════════════════════ */

test("[references] finds declaration + every usage of $.btn", () => {
  clearCache();
  const provider = new TlReferencesProvider();
  const src = [
    `const $ = tl.create({`,
    `  btn:  { color: "red" },`,
    `  card: { color: "blue" },`,
    `});`,
    `<div className={$.btn} />`,
    `<a   className={$.btn} />`,
  ].join("\n");
  const doc = makeDoc(src);
  // Cursor on the second `btn` usage. lastIndexOf("$.btn") points at $; +2 → b
  const cursorOffset = src.lastIndexOf("$.btn") + 2;
  const refs = provider.provideReferences(
    doc,
    doc.positionAt(cursorOffset),
    { includeDeclaration: true },
    NO_TOKEN
  ) as Location[];
  assert.ok(refs);
  // 1 declaration + 2 usages = 3 locations
  assert.equal(refs.length, 3, `got ${refs.length} refs: ${JSON.stringify(refs)}`);
});

test("[references] excludeDeclaration filters out the declaration site", () => {
  clearCache();
  const provider = new TlReferencesProvider();
  const src = [
    `const $ = tl.create({`,
    `  btn: { color: "red" },`,
    `});`,
    `<div className={$.btn} />`,
  ].join("\n");
  const doc = makeDoc(src);
  const cursorOffset = src.lastIndexOf("$.btn") + 2;
  const refs = provider.provideReferences(
    doc,
    doc.positionAt(cursorOffset),
    { includeDeclaration: false },
    NO_TOKEN
  ) as Location[];
  assert.equal(refs.length, 1, `got ${refs?.length} refs`);
});

/* ══════════════════════════════════════════
   RENAME
══════════════════════════════════════════ */

test("[rename] prepareRename rejects non-key positions", () => {
  clearCache();
  const provider = new TlRenameProvider();
  const src = `const x = "not a key";`;
  const doc = makeDoc(src);
  const cursor = src.indexOf("x");
  // Should throw or return null for a non-key position.
  let threw = false;
  try {
    provider.prepareRename(doc, doc.positionAt(cursor + 1), NO_TOKEN);
  } catch { threw = true; }
  assert.ok(threw, "prepareRename should reject non-key positions");
});

test("[rename] renames declaration + every usage", () => {
  clearCache();
  const provider = new TlRenameProvider();
  const src = [
    `const $ = tl.create({`,
    `  btn:  { color: "red" },`,
    `  card: { color: "blue" },`,
    `});`,
    `<div className={$.btn} />`,
    `<a   className={$.btn} />`,
  ].join("\n");
  const doc = makeDoc(src);
  const declOffset = src.indexOf("btn:") + 1; // cursor inside `btn`
  const edit = provider.provideRenameEdits(
    doc,
    doc.positionAt(declOffset),
    "button",
    NO_TOKEN
  ) as WorkspaceEdit;
  assert.ok(edit);
  // 1 declaration + 2 usages = 3 edits
  assert.equal(edit.edits.length, 3);
  assert.ok(edit.edits.every(e => e.newText === "button"));
});

test("[rename] rejects invalid identifiers", () => {
  clearCache();
  const provider = new TlRenameProvider();
  const src = `const $ = tl.create({ btn: { color: "red" } });`;
  const doc = makeDoc(src);
  const declOffset = src.indexOf("btn:");
  let threw = false;
  try {
    provider.provideRenameEdits(doc, doc.positionAt(declOffset + 1), "1invalid", NO_TOKEN);
  } catch { threw = true; }
  assert.ok(threw, "should reject names that aren't valid JS identifiers");
});

/* ══════════════════════════════════════════
   SIGNATURE HELP
══════════════════════════════════════════ */

test("[signature-help] tl.create shows the create signature", () => {
  clearCache();
  const provider = new TlSignatureHelpProvider();
  const src = `tl.create()`;
  const doc = makeDoc(src);
  const cursor = src.indexOf("(") + 1;
  const help = provider.provideSignatureHelp(doc, doc.positionAt(cursor), NO_TOKEN) as SignatureHelp;
  assert.ok(help);
  assert.equal(help.signatures.length, 1);
  assert.match(help.signatures[0].label, /tl\.create/);
});

test("[signature-help] tl.keyframes shows the keyframes signature", () => {
  clearCache();
  const provider = new TlSignatureHelpProvider();
  const src = `tl.keyframes("name", )`;
  const doc = makeDoc(src);
  const cursor = src.indexOf(", ") + 2;
  const help = provider.provideSignatureHelp(doc, doc.positionAt(cursor), NO_TOKEN) as SignatureHelp;
  assert.ok(help);
  assert.match(help.signatures[0].label, /tl\.keyframes/);
});

test("[signature-help] returns null outside any tl-method call", () => {
  clearCache();
  const provider = new TlSignatureHelpProvider();
  const src = `const x = foo(`;
  const doc = makeDoc(src);
  const cursor = src.indexOf("(") + 1;
  assert.equal(provider.provideSignatureHelp(doc, doc.positionAt(cursor), NO_TOKEN), null);
});

test("[signature-help] suppressed inside the styles object body on ContentChange", () => {
  // Direct repro: cursor inside the body, VS Code re-asks via
  // ContentChange — must return null so the popup hides.
  clearCache();
  const provider = new TlSignatureHelpProvider();
  const src = `tl.create({ btn: { padding: '1rem' } })`;
  const doc = makeDoc(src);
  const cursor = src.indexOf("padding");
  const ctx = { triggerKind: 3 /* ContentChange */, isRetrigger: false };
  assert.equal(provider.provideSignatureHelp(doc, doc.positionAt(cursor), NO_TOKEN, ctx), null);
});

test("[signature-help] suppressed when the popup is currently showing (isRetrigger=true)", () => {
  // `isRetrigger: true` means "popup is up, keep it up." When the user
  // is editing inside the body, that's exactly the case we want gone.
  // Returning null tells VS Code to dismiss the popup.
  clearCache();
  const provider = new TlSignatureHelpProvider();
  const src = `tl.create({ btn: { padding: '1rem' } })`;
  const doc = makeDoc(src);
  const cursor = src.indexOf("padding");
  const ctx = { triggerKind: 3 /* ContentChange */, isRetrigger: true };
  assert.equal(provider.provideSignatureHelp(doc, doc.positionAt(cursor), NO_TOKEN, ctx), null);
});

test("[signature-help] suppressed even on TriggerCharacter retrigger inside body", () => {
  // Typing `,` deep inside a property value (e.g. inside an rgba()
  // string) shouldn't pop the call signature back up.
  clearCache();
  const provider = new TlSignatureHelpProvider();
  const src = `tl.create({ btn: { padding: '1rem' } })`;
  const doc = makeDoc(src);
  const cursor = src.indexOf("padding");
  const ctx = { triggerKind: 2 /* TriggerCharacter */, triggerCharacter: ",", isRetrigger: true };
  assert.equal(provider.provideSignatureHelp(doc, doc.positionAt(cursor), NO_TOKEN, ctx), null);
});

test("[signature-help] still shows on explicit Invoke (Ctrl+Shift+Space) inside the body", () => {
  // The escape hatch — user explicitly asked.
  clearCache();
  const provider = new TlSignatureHelpProvider();
  const src = `tl.create({ btn: { padding: '1rem' } })`;
  const doc = makeDoc(src);
  const cursor = src.indexOf("padding");
  const ctx = { triggerKind: 1 /* Invoke */, isRetrigger: false };
  const help = provider.provideSignatureHelp(doc, doc.positionAt(cursor), NO_TOKEN, ctx) as SignatureHelp;
  assert.ok(help, "explicit invoke should bypass suppression");
});

test("[signature-help] shows when cursor is between `(` and the styles `{`", () => {
  // Right after typing `tl.create(` — popup should appear.
  clearCache();
  const provider = new TlSignatureHelpProvider();
  const src = `tl.create()`;
  const doc = makeDoc(src);
  const cursor = src.indexOf("(") + 1;
  const ctx = { triggerKind: 2 /* TriggerCharacter */, triggerCharacter: "(", isRetrigger: false };
  const help = provider.provideSignatureHelp(doc, doc.positionAt(cursor), NO_TOKEN, ctx) as SignatureHelp;
  assert.ok(help, "freshly-opened call should show signature");
});
