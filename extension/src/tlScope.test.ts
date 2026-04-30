/**
 * Smoke tests for tlScope. These run via `node --test` against the
 * compiled output — we keep them here so they live next to the source
 * they exercise. Not wired into the library's vitest run because the
 * extension is its own self-contained package.
 *
 * To run:
 *   cd extension && npm install && npx tsx src/tlScope.test.ts
 *   (or compile with tsc and run the .js)
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { detectTlScope } from "./tlScope";

const ALIASES = ["tl"];

test("returns null when cursor is outside tl.create", () => {
  const src = `const x = 1;\nconst y = 2;`;
  assert.equal(detectTlScope(src, 5, ALIASES), null);
});

test("detects scope inside tl.create at depth 0", () => {
  const src = `const $ = tl.create({\n  btn: {\n    color: "red"\n  }\n});`;
  const cursor = src.indexOf("btn");
  const scope  = detectTlScope(src, cursor, ALIASES);
  assert.ok(scope);
  assert.equal(scope.method, "create");
  assert.equal(scope.depth, 0);
});

test("detects scope inside a group at depth 1", () => {
  const src = `tl.create({ btn: { color: "red", padding: "1rem" } });`;
  const cursor = src.indexOf("padding");
  const scope  = detectTlScope(src, cursor, ALIASES);
  assert.ok(scope);
  assert.equal(scope.depth, 1);
});

test("ignores tl.create inside a string", () => {
  const src = `const note = "tl.create({ x: 1 })"; const after = 1;`;
  const cursor = src.indexOf("after");
  assert.equal(detectTlScope(src, cursor, ALIASES), null);
});

test("ignores tl.create inside a comment", () => {
  const src = `// tl.create({ x: 1 })\nconst after = 1;`;
  const cursor = src.indexOf("after");
  assert.equal(detectTlScope(src, cursor, ALIASES), null);
});

test("handles template literals with ${} expressions inside values", () => {
  const src = "tl.create({ btn: { animation: `fade ${'0.2s'} ease` } }); const a = 1;";
  const insideAnim = src.indexOf("ease");
  const outside    = src.indexOf("const a");
  assert.ok(detectTlScope(src, insideAnim, ALIASES));
  assert.equal(detectTlScope(src, outside, ALIASES), null);
});

test("detects keyframes scope", () => {
  const src = `const fade = tl.keyframes({\n  from: { opacity: 0 },\n  to: { opacity: 1 }\n});`;
  const cursor = src.indexOf("from");
  const scope = detectTlScope(src, cursor, ALIASES);
  assert.ok(scope);
  assert.equal(scope.method, "keyframes");
});

test("supports renamed alias via config", () => {
  const src = `t.create({ btn: { color: "red" } });`;
  const cursor = src.indexOf("color");
  // Default ["tl"] alias misses it
  assert.equal(detectTlScope(src, cursor, ["tl"]), null);
  // Adding "t" alias picks it up
  const scope = detectTlScope(src, cursor, ["tl", "t"]);
  assert.ok(scope);
});

test("does not match longer identifiers ending in tl", () => {
  const src = `myTl.create({ btn: { color: "red" } });`;
  const cursor = src.indexOf("color");
  assert.equal(detectTlScope(src, cursor, ALIASES), null);
});

test("atKeyPosition is true right after { and after ,", () => {
  const src = `tl.create({\n   })`; //                ^
  const afterOpen = src.indexOf("{") + 2;
  const scope = detectTlScope(src, afterOpen, ALIASES);
  assert.ok(scope);
  assert.equal(scope.atKeyPosition, true);
});
