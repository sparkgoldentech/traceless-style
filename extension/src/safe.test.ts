/**
 * Tests for the error-boundary helpers in safe.ts. The wrapper is what
 * keeps the extension from ever crashing VS Code's host — every
 * assertion here is one less way it could regress.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import Module from "node:module";

/* ── vscode stub (same monkey-patch pattern as new-providers.test.ts) ── */
const vscodeStub = {
  workspace: {
    getConfiguration: () => ({ get: () => "off" }),
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
  },
  window: {
    createOutputChannel: () => ({
      appendLine: () => {}, append: () => {}, show: () => {}, dispose: () => {}, name: "stub",
    }),
  },
};

const realRequire = Module.prototype.require;
(Module.prototype as unknown as { require: NodeJS.Require }).require = function patched(this: NodeJS.Module, id: string) {
  if (id === "vscode") return vscodeStub;
  return realRequire.call(this, id);
} as NodeJS.Require;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { safe, safeProvider } = require("./safe");

test("safe: returns the function's value when it succeeds", () => {
  const result = safe("test", () => 42, 0);
  assert.equal(result, 42);
});

test("safe: returns the default when the function throws synchronously", () => {
  const result = safe("test", () => { throw new Error("boom"); }, 99);
  assert.equal(result, 99);
});

test("safe: returns the default when the async function rejects", async () => {
  const result = await safe(
    "test-async",
    () => Promise.reject(new Error("boom")),
    "fallback"
  );
  assert.equal(result, "fallback");
});

test("safe: passes through async resolved values", async () => {
  const result = await safe("test-async-ok", () => Promise.resolve(7), 0);
  assert.equal(result, 7);
});

test("safe: respects a pre-cancelled token (returns default without calling fn)", () => {
  let called = false;
  const token = { isCancellationRequested: true };
  const result = safe(
    "test-cancel",
    () => { called = true; return "ran"; },
    "default",
    token
  );
  assert.equal(called, false);
  assert.equal(result, "default");
});

test("safeProvider: success path passes through", () => {
  class P {
    provideHover() { return { contents: ["hi"] }; }
  }
  const wrapped = safeProvider("p", new P());
  const ok = wrapped.provideHover();
  assert.deepEqual(ok, { contents: ["hi"] });
});

test("safeProvider: throwing collection-shaped method returns []", () => {
  class P {
    provideDocumentSymbols() { throw new Error("boom"); }
  }
  const wrapped = safeProvider("p", new P());
  const sym = wrapped.provideDocumentSymbols();
  assert.deepEqual(sym, []);
});

test("safeProvider: throwing nullable-shaped method returns null", () => {
  class P {
    provideDefinition() { throw new Error("boom"); }
  }
  const wrapped = safeProvider("p", new P());
  const def = wrapped.provideDefinition();
  assert.equal(def, null);
});

test("safeProvider: async-rejecting method returns the typed default", async () => {
  class P {
    provideCodeLenses() { return Promise.reject(new Error("boom")); }
  }
  const wrapped = safeProvider("p", new P());
  const result = await wrapped.provideCodeLenses();
  assert.deepEqual(result, []);
});

test("safeProvider: instance methods stay bound to the original instance", () => {
  class P {
    private value = 17;
    provideHover() { return { contents: [String(this.value)] }; }
  }
  const wrapped = safeProvider("p", new P());
  assert.deepEqual(wrapped.provideHover(), { contents: ["17"] });
});
