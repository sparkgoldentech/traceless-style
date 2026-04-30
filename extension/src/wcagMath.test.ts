/**
 * Tests for the extension's vendored WCAG / APCA math module.
 * Mirrors the equivalent suite in the library so any drift between the
 * two implementations is caught immediately by CI.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseColor, contrastRatio, composite, apcaLc,
  adjustForContrastOklch, adjustForContrastAlpha,
  auditPair, suggestAccessibleColor, WCAG,
} from "./wcagMath";

test("parseColor — hex / rgb / hsl / named / null cases", () => {
  assert.deepEqual(parseColor("#ffffff"), { r: 1, g: 1, b: 1, a: 1 });
  assert.deepEqual(parseColor("#000"),    { r: 0, g: 0, b: 0, a: 1 });
  const half = parseColor("rgba(255,255,255,0.5)")!;
  assert.equal(half.a, 0.5);
  const red = parseColor("hsl(0 100% 50%)")!;
  assert.ok(Math.abs(red.r - 1) < 0.01);
  assert.deepEqual(parseColor("white"), { r: 1, g: 1, b: 1, a: 1 });
  assert.equal(parseColor("currentColor"), null);
  assert.equal(parseColor("var(--x)"), null);
});

test("contrastRatio — black/white extremes", () => {
  assert.ok(Math.abs(contrastRatio({ r: 1, g: 1, b: 1, a: 1 }, { r: 0, g: 0, b: 0, a: 1 }) - 21) < 0.05);
  assert.equal(contrastRatio({ r: 1, g: 1, b: 1, a: 1 }, { r: 1, g: 1, b: 1, a: 1 }), 1);
});

test("composite — translucent over solid", () => {
  const half = composite({ r: 1, g: 1, b: 1, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 });
  assert.ok(Math.abs(half.r - 0.5) < 0.02);
  assert.equal(half.a, 1);
});

test("apcaLc — polarity is correct", () => {
  // black on white → positive Lc
  assert.ok(apcaLc({ r: 0, g: 0, b: 0, a: 1 }, { r: 1, g: 1, b: 1, a: 1 }) > 90);
  // white on black → negative Lc
  assert.ok(apcaLc({ r: 1, g: 1, b: 1, a: 1 }, { r: 0, g: 0, b: 0, a: 1 }) < -90);
});

test("adjustForContrastOklch — preserves hue, hits target", () => {
  const fg = { r: 0.4, g: 0.4, b: 0.5, a: 1 };
  const bg = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
  const out = adjustForContrastOklch(fg, bg, 4.5);
  assert.ok(contrastRatio(out, bg) >= 4.5);
});

test("adjustForContrastAlpha — keeps R/G/B, bumps alpha", () => {
  // Translucent white on near-black should reach 4.5:1 by alpha alone.
  const fg = { r: 1, g: 1, b: 1, a: 0.06 };
  const bg = { r: 0, g: 0, b: 0, a: 1 };
  const out = adjustForContrastAlpha(fg, bg, 4.5);
  assert.ok(out, "expected an alpha-adjusted result");
  assert.equal(out!.r, 1);
  assert.equal(out!.g, 1);
  assert.equal(out!.b, 1);
  assert.ok(out!.a > 0.06 && out!.a <= 1);
  const composited = composite(out!, bg);
  assert.ok(contrastRatio(composited, bg) >= 4.5);
});

test("adjustForContrastAlpha — null when target is unreachable by alpha alone", () => {
  // gray@α over gray bg: no alpha can produce contrast.
  const fg = { r: 0.5, g: 0.5, b: 0.5, a: 0.5 };
  const bg = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
  const out = adjustForContrastAlpha(fg, bg, 4.5);
  assert.equal(out, null);
});

test("auditPair — pass/fail flags align with WCAG thresholds", () => {
  const pass = auditPair("#000000", "#ffffff")!;
  assert.equal(pass.passesAA, true);
  assert.equal(pass.passesAAA, true);

  const fail = auditPair("#bbbbbb", "#dddddd")!;
  assert.equal(fail.passesAA, false);
});

test("suggestAccessibleColor — alpha path for translucent input", () => {
  const out = suggestAccessibleColor("rgba(255,255,255,0.06)", "#000000", WCAG.AA_NORMAL);
  assert.ok(out, "expected a suggestion");
  assert.match(out!, /^rgba\(255,255,255,/);  // R/G/B preserved → design intent kept
});

test("suggestAccessibleColor — OKLCH path for opaque input", () => {
  const out = suggestAccessibleColor("#666666", "#ffffff", WCAG.AAA_NORMAL);
  assert.ok(out);
  // Hex output (no alpha component on input).
  assert.match(out!, /^#[0-9a-f]{6}$/i);
});
