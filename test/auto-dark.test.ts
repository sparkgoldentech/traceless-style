import { describe, expect, it, beforeEach } from "vitest";
import {
  parseColor,
  deriveDarkColor,
  isAutoDarkProperty,
} from "../src/compiler/auto-dark";
import {
  transform,
  globalRegistry,
  setAutoDarkMode,
  getAutoDarkMode,
} from "../src/compiler/extractor";
import { tokenRegistry } from "../src/compiler/tokens";

describe("parseColor", () => {
  it("parses hex (3 / 6 / 8 digit) with alpha", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255, 1]);
    expect(parseColor("#000")).toEqual([0, 0, 0, 1]);
    expect(parseColor("#3b82f6")).toEqual([0x3b, 0x82, 0xf6, 1]);
    // 8-digit hex includes alpha — common in modern designs.
    const withAlpha = parseColor("#3b82f680");
    expect(withAlpha).not.toBeNull();
    expect(withAlpha![3]).toBeCloseTo(0x80 / 255, 2);
  });

  it("parses rgb / rgba (legacy + modern syntax) preserving alpha", () => {
    expect(parseColor("rgb(255, 0, 0)")).toEqual([255, 0, 0, 1]);
    expect(parseColor("rgb(255 0 0)")).toEqual([255, 0, 0, 1]);
    expect(parseColor("rgba(0, 128, 255, 0.5)")).toEqual([0, 128, 255, 0.5]);
    expect(parseColor("rgb(100%, 0%, 0%)")).toEqual([255, 0, 0, 1]);
    // The frosted-glass overlay case — must keep its 5% alpha.
    expect(parseColor("rgba(255,255,255,0.05)")).toEqual([255, 255, 255, 0.05]);
  });

  it("parses hsl / hsla", () => {
    const blue = parseColor("hsl(220, 100%, 50%)");
    expect(blue).not.toBeNull();
    expect(blue![2]).toBeGreaterThan(0xee);   // pure blue → b≈255
    expect(blue![3]).toBe(1);
    const semi = parseColor("hsla(220, 100%, 50%, 0.3)");
    expect(semi![3]).toBe(0.3);
  });

  it("parses common named colors (alpha defaults to 1)", () => {
    expect(parseColor("white")).toEqual([255, 255, 255, 1]);
    expect(parseColor("red")).toEqual([255, 0, 0, 1]);
    expect(parseColor("transparent")).toBeNull();
  });

  it("returns null for non-derivable values", () => {
    expect(parseColor("currentColor")).toBeNull();
    expect(parseColor("var(--brand)")).toBeNull();
    expect(parseColor("inherit")).toBeNull();
    expect(parseColor("none")).toBeNull();
    expect(parseColor("linear-gradient(red, blue)")).toBeNull();
    expect(parseColor("not-a-color")).toBeNull();
    expect(parseColor("")).toBeNull();
  });
});

describe("deriveDarkColor", () => {
  it("inverts pure black to a near-white", () => {
    const dark = deriveDarkColor("#000");
    expect(dark).toBeTruthy();
    const rgba = parseColor(dark!)!;
    expect(rgba[0]).toBeGreaterThan(220);
    expect(rgba[1]).toBeGreaterThan(220);
    expect(rgba[2]).toBeGreaterThan(220);
  });

  it("inverts pure white to a near-black", () => {
    const dark = deriveDarkColor("#fff");
    expect(dark).toBeTruthy();
    const rgba = parseColor(dark!)!;
    expect(rgba[0]).toBeLessThan(40);
    expect(rgba[1]).toBeLessThan(40);
    expect(rgba[2]).toBeLessThan(40);
  });

  it("preserves hue family (blue stays blue-ish, just lighter)", () => {
    const dark = deriveDarkColor("#1e3a8a");      // dark blue
    expect(dark).toBeTruthy();
    const rgba = parseColor(dark!)!;
    expect(rgba[2]).toBeGreaterThan(rgba[0]);
    expect(rgba[2]).toBeGreaterThan(rgba[1]);
  });

  it("preserves alpha — a translucent overlay stays translucent", () => {
    // The bug that broke /test and /merge-test: a 3% white overlay used
    // to come out as solid #141414 (no alpha), turning subtle frosted-glass
    // into opaque blocks. Now alpha round-trips correctly.
    const dark = deriveDarkColor("rgba(255,255,255,0.03)");
    expect(dark).toBeTruthy();
    expect(dark!.startsWith("rgba(")).toBe(true);
    const rgba = parseColor(dark!)!;
    expect(rgba[3]).toBe(0.03);                    // alpha kept
    expect(rgba[0]).toBeLessThan(40);              // rgb still dark-inverted
  });

  it("preserves alpha for branded translucent colors", () => {
    // A 12% orange tint inverts hue/lightness but keeps the 12% alpha.
    const dark = deriveDarkColor("rgba(249,115,22,0.12)");
    expect(dark).toBeTruthy();
    const rgba = parseColor(dark!)!;
    expect(rgba[3]).toBeCloseTo(0.12, 3);
  });

  it("emits #hex for opaque values, rgba() for translucent", () => {
    expect(deriveDarkColor("#3b82f6")!.startsWith("#")).toBe(true);
    expect(deriveDarkColor("rgba(59,130,246,0.5)")!.startsWith("rgba(")).toBe(true);
  });

  it("returns null for non-color inputs (caller skips auto-dark)", () => {
    expect(deriveDarkColor("currentColor")).toBeNull();
    expect(deriveDarkColor("var(--brand)")).toBeNull();
    expect(deriveDarkColor("none")).toBeNull();
    expect(deriveDarkColor("linear-gradient(red, blue)")).toBeNull();
  });
});

describe("isAutoDarkProperty", () => {
  it("recognizes color properties (camelCase + kebab-case)", () => {
    expect(isAutoDarkProperty("color")).toBe(true);
    expect(isAutoDarkProperty("backgroundColor")).toBe(true);
    expect(isAutoDarkProperty("background-color")).toBe(true);
    expect(isAutoDarkProperty("borderColor")).toBe(true);
    expect(isAutoDarkProperty("textDecorationColor")).toBe(true);
  });

  it("excludes non-color properties", () => {
    expect(isAutoDarkProperty("padding")).toBe(false);
    expect(isAutoDarkProperty("display")).toBe(false);
    // Shorthands deliberately excluded — auto-deriving "1px solid red"
    // would naïvely substitute the whole string.
    expect(isAutoDarkProperty("background")).toBe(false);
    expect(isAutoDarkProperty("border")).toBe(false);
  });
});

describe("auto-dark integration with processStyles", () => {
  beforeEach(() => {
    globalRegistry.clear();
    tokenRegistry.clear();
    setAutoDarkMode(true);
  });

  it("emits a paired :is(.dark *) rule for every color property", () => {
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({ btn: { color: "#3b82f6", backgroundColor: "#ffffff" } });`,
      "/virtual/Btn.tsx"
    );

    const rules = globalRegistry.getAll();
    const lightRules = rules.filter(r => !r.selector);
    const darkRules  = rules.filter(r => r.selector === ":is(.dark *)");

    expect(lightRules.length).toBe(2);
    expect(darkRules.length).toBe(2);

    // Each light rule's prop should have a matching dark rule.
    const lightProps = lightRules.map(r => r.prop).sort();
    const darkProps  = darkRules.map(r => r.prop).sort();
    expect(darkProps).toEqual(lightProps);
  });

  it("does NOT emit auto-dark for non-color properties", () => {
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({ btn: { padding: "1rem", display: "flex" } });`,
      "/virtual/Btn.tsx"
    );
    expect(globalRegistry.getAll().filter(r => r.selector === ":is(.dark *)").length).toBe(0);
  });

  it("respects an explicit _dark override (no auto-dark for those props)", () => {
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({ btn: { color: "#3b82f6", _dark: { color: "#ff00ff" } } });`,
      "/virtual/Btn.tsx"
    );
    const darkColorRules = globalRegistry.getAll().filter(r => r.prop === "color" && r.selector?.includes(".dark"));
    // Only the explicit _dark rule should be present, not an auto-derived one.
    expect(darkColorRules.length).toBe(1);
    expect(darkColorRules[0].value).toBe("#ff00ff");
  });

  it("`_autoDark: false` disables auto-dark for that style group", () => {
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({
         btn:   { color: "#3b82f6" },
         brand: { color: "#3b82f6", _autoDark: false },
       });`,
      "/virtual/Btn.tsx"
    );
    // Two atomic rules with `:is(.dark *)` would mean both groups got auto-dark.
    // Since "brand" opted out, we should see exactly ONE dark rule (for "btn").
    const darkRules = globalRegistry.getAll().filter(r => r.selector === ":is(.dark *)");
    expect(darkRules.length).toBe(1);
  });

  it("global setAutoDarkMode(false) disables auto-dark everywhere", () => {
    setAutoDarkMode(false);
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({ btn: { color: "#3b82f6", backgroundColor: "#fff" } });`,
      "/virtual/Btn.tsx"
    );
    expect(globalRegistry.getAll().filter(r => r.selector === ":is(.dark *)").length).toBe(0);
    expect(getAutoDarkMode()).toBe(false);
    setAutoDarkMode(true);  // restore for other tests
  });

  it("skips auto-dark for unparseable values (CSS vars, currentColor, etc.)", () => {
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({ btn: { color: "currentColor", backgroundColor: "transparent" } });`,
      "/virtual/Btn.tsx"
    );
    expect(globalRegistry.getAll().filter(r => r.selector === ":is(.dark *)").length).toBe(0);
  });
});
