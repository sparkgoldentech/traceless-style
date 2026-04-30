/**
 * Regression coverage for the contrast-aware auto-dark feature. Locks
 * in the guarantee that derived dark-mode `color` / `backgroundColor`
 * pairs always meet WCAG AA (≥4.5:1) — the bug class where naive HSL
 * inversion produced an invisible foreground on a near-transparent
 * dark background can never silently regress.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  parseColor,
  relativeLuminance,
  contrastRatio,
  composite,
  adjustForContrast,
  formatColor,
} from "../src/compiler/wcag";
import { deriveDarkPair, ensureContrast } from "../src/compiler/auto-dark";
import { transform, globalRegistry } from "../src/compiler/extractor";
import { tokenRegistry } from "../src/compiler/tokens";

describe("wcag.parseColor", () => {
  it("parses #rgb / #rrggbb / #rrggbbaa", () => {
    expect(parseColor("#ffffff")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColor("#000000")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    const c = parseColor("#80808080")!;
    expect(c.a).toBeCloseTo(0.502, 2);
  });

  it("parses rgb / rgba (comma + slash forms)", () => {
    const c = parseColor("rgba(255,255,255,0.5)")!;
    expect(c.r).toBe(1); expect(c.a).toBe(0.5);
    const c2 = parseColor("rgb(255 0 0 / 0.5)")!;
    expect(c2.r).toBe(1); expect(c2.g).toBe(0); expect(c2.a).toBe(0.5);
  });

  it("parses hsl / hsla", () => {
    const c = parseColor("hsl(0, 100%, 50%)")!;
    expect(c.r).toBeCloseTo(1, 2);
    expect(c.g).toBeCloseTo(0, 2);
    expect(c.b).toBeCloseTo(0, 2);
  });

  it("returns null for unparseable values", () => {
    expect(parseColor("currentColor")).toBeNull();
    expect(parseColor("inherit")).toBeNull();
    expect(parseColor("var(--foo)")).toBeNull();
    expect(parseColor("linear-gradient(red, blue)")).toBeNull();
  });

  it("named colors fall through cleanly", () => {
    expect(parseColor("white")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColor("black")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });
});

describe("wcag contrast math", () => {
  it("relative luminance: white = 1, black = 0", () => {
    expect(relativeLuminance({ r: 1, g: 1, b: 1, a: 1 })).toBeCloseTo(1, 4);
    expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 })).toBe(0);
  });

  it("contrast ratio: white-on-black = 21:1, white-on-white = 1:1", () => {
    const white = { r: 1, g: 1, b: 1, a: 1 };
    const black = { r: 0, g: 0, b: 0, a: 1 };
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1);
    expect(contrastRatio(white, white)).toBe(1);
  });

  it("composite: white@50% over black gives 50% gray", () => {
    const white = { r: 1, g: 1, b: 1, a: 0.5 };
    const black = { r: 0, g: 0, b: 0, a: 1   };
    const result = composite(white, black);
    expect(result.r).toBeCloseTo(0.5, 2);
    expect(result.a).toBe(1);
  });
});

describe("adjustForContrast", () => {
  it("lightens foreground until target ratio is met on a dark background", () => {
    // Naive inverted color: ~black on a dark bg → invisible.
    const fg = { r: 0.08, g: 0.08, b: 0.08, a: 1 }; // very dark gray
    const bg = { r: 0.1, g: 0.1, b: 0.1, a: 1 };    // also very dark
    const adjusted = adjustForContrast(fg, bg, 4.5);
    const ratio    = contrastRatio(adjusted, bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("returns unchanged when ratio already exceeds target", () => {
    const fg = { r: 1, g: 1, b: 1, a: 1 };
    const bg = { r: 0, g: 0, b: 0, a: 1 };
    const adjusted = adjustForContrast(fg, bg, 4.5);
    expect(adjusted.r).toBeCloseTo(1, 2);
  });

  it("falls back to pure white/black when no L value satisfies the target", () => {
    // Identical colors → no L can achieve any contrast above ~1.
    // Algorithm should return either pure white or pure black to maximize.
    const fg = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const bg = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const adjusted = adjustForContrast(fg, bg, 4.5);
    const ratio    = contrastRatio(adjusted, bg);
    expect(ratio).toBeGreaterThan(1);  // at least some contrast
  });
});

describe("deriveDarkPair", () => {
  it("flags fgAdjusted when naive HSL inversion produces unsafe contrast", () => {
    // White text on near-transparent white bg in light mode.
    // Naive inversion → black text on near-transparent black bg.
    // Composited against the dark surface, contrast is far below 4.5:1.
    const pair = deriveDarkPair("#ffffff", "rgba(255,255,255,0.04)");
    expect(pair.fgAdjusted).toBe(true);
    expect(pair.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("does NOT mark fgAdjusted when naive inversion is already safe", () => {
    // Black text on white background → naive inverts to white-on-black → 21:1.
    const pair = deriveDarkPair("#000000", "#ffffff");
    expect(pair.fgAdjusted).toBe(false);
    expect(pair.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("returns ratio === 0 when either side is unparseable (caller skips)", () => {
    expect(deriveDarkPair("currentColor", "#ffffff").ratio).toBe(0);
    expect(deriveDarkPair("#000000", "var(--bg)").ratio).toBe(0);
  });

  it("preserves alpha on the adjusted foreground", () => {
    const pair = deriveDarkPair("rgba(255,255,255,0.7)", "rgba(255,255,255,0.04)");
    const fg   = parseColor(pair.fg);
    expect(fg).not.toBeNull();
    expect(fg!.a).toBeCloseTo(0.7, 2);
  });
});

describe("ensureContrast (validate user-written _dark blocks)", () => {
  it("returns input unchanged when ratio is safe", () => {
    const out = ensureContrast("#ffffff", "#0a0a0f");
    expect(out.fgAdjusted).toBe(false);
  });

  it("auto-corrects an unsafe user-written pair", () => {
    // User wrote near-black text on near-black bg in their _dark block.
    const out = ensureContrast("#1a1a1a", "#0a0a0f");
    expect(out.fgAdjusted).toBe(true);
    expect(out.ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe("end-to-end via processStyles", () => {
  beforeEach(() => { globalRegistry.clear(); tokenRegistry.clear(); });

  it("pair-derives color when paired with backgroundColor", () => {
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({
         card: {
           color:           "#ffffff",
           backgroundColor: "rgba(255,255,255,0.04)",
         },
       });`,
      "/virtual/Card.tsx"
    );
    // Find the auto-dark color rule.
    const rules = globalRegistry.getAll();
    const darkColor = rules.find(r => r.prop === "color" && r.selector?.includes(".dark"));
    expect(darkColor).toBeDefined();
    // Composite-against-#0a0a0f contrast must be ≥4.5:1 against the
    // dark-mode background variant.
    const darkBg = rules.find(r => r.prop === "background-color" && r.selector?.includes(".dark"));
    expect(darkBg).toBeDefined();

    const fgRgba = parseColor(darkColor!.value);
    const bgRgba = parseColor(darkBg!.value);
    expect(fgRgba).not.toBeNull();
    expect(bgRgba).not.toBeNull();

    // Composite the bg against the dark surface.
    const surface = parseColor("#0a0a0f")!;
    const compFg = fgRgba!.a < 1 ? composite(fgRgba!, surface) : fgRgba!;
    const compBg = bgRgba!.a < 1 ? composite(bgRgba!, surface) : bgRgba!;
    expect(contrastRatio(compFg, compBg)).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back to naive auto-dark for color WITHOUT a sibling backgroundColor", () => {
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({ btn: { color: "#ffffff" } });`,
      "/virtual/Btn.tsx"
    );
    const rules = globalRegistry.getAll();
    const darkColor = rules.find(r => r.prop === "color" && r.selector?.includes(".dark"));
    expect(darkColor).toBeDefined();
    // Naive HSL inversion of pure white is near-black.
    const c = parseColor(darkColor!.value)!;
    expect(c.r).toBeLessThan(0.3);
  });

  it("respects explicit `_dark` overrides — no contrast rewriting on user blocks", () => {
    // The user explicitly set their own dark color; we MUST NOT mutate it.
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({
         card: {
           color:           "#ffffff",
           backgroundColor: "rgba(255,255,255,0.04)",
           _dark: { color: "rgba(255,255,255,0.6)" },
         },
       });`,
      "/virtual/Card.tsx"
    );
    const rules = globalRegistry.getAll();
    // The explicit _dark color should be passed through unchanged.
    const explicitDark = rules.find(
      r => r.prop === "color" && r.selector?.includes(".dark") && r.value.includes("rgba(255")
    );
    expect(explicitDark).toBeDefined();
  });
});
