/**
 * Coverage for the expanded WCAG-grounded contrast validator: full CSS
 * Color 4 named-color table, OKLCH/OKLab/HWB parsing, APCA Lc readout,
 * UI-component (§1.4.11) checks, gradient midpoint sampling, and the
 * per-category `_skipContrast` escape hatch.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  parseColor,
  contrastRatio,
  apcaLc,
  adjustForContrastOklch,
  WCAG_THRESHOLDS,
} from "../src/compiler/wcag";
import { tokenRegistry } from "../src/compiler/tokens";
import {
  validateGroupContrast,
  DEFAULT_CONTRAST_OPTIONS,
} from "../src/compiler/contrast-validator";

describe("wcag.parseColor — extended color spaces", () => {
  it("parses the full CSS Color 4 named-color table", () => {
    expect(parseColor("rebeccapurple")).toEqual({ r: 102/255, g: 51/255, b: 153/255, a: 1 });
    expect(parseColor("dodgerblue")).not.toBeNull();
    expect(parseColor("papayawhip")).not.toBeNull();
    expect(parseColor("seashell")).not.toBeNull();
    expect(parseColor("notacolor")).toBeNull();
  });

  it("parses oklch() colors (in-gamut)", () => {
    // oklch(0.5 0.1 30) — mid lightness, modest chroma, red-ish hue.
    // Well inside the sRGB gamut so clamping doesn't zero any channel.
    const c = parseColor("oklch(0.5 0.1 30)");
    expect(c).not.toBeNull();
    expect(c!.r).toBeGreaterThan(0);
    expect(c!.r).toBeLessThan(1);
    expect(c!.g).toBeGreaterThan(0);
  });

  it("parses oklab() colors", () => {
    const c = parseColor("oklab(0.5 0.05 -0.1)");
    expect(c).not.toBeNull();
  });

  it("parses hwb() colors", () => {
    // hwb(0deg 0% 0%) === pure red.
    const red = parseColor("hwb(0 0% 0%)");
    expect(red).not.toBeNull();
    expect(red!.r).toBeCloseTo(1, 1);
    expect(red!.g).toBeCloseTo(0, 1);
    // hwb with W+B == 100% → grayscale.
    const gray = parseColor("hwb(0 50% 50%)");
    expect(gray).not.toBeNull();
    expect(gray!.r).toBeCloseTo(gray!.g, 2);
    expect(gray!.g).toBeCloseTo(gray!.b, 2);
  });

  it("parses color-mix() in any space using sRGB approximation", () => {
    const half = parseColor("color-mix(in srgb, white 50%, black 50%)");
    expect(half).not.toBeNull();
    expect(half!.r).toBeCloseTo(0.5, 1);
  });

  it("parses light-dark() pessimistically (returns the light value)", () => {
    const c = parseColor("light-dark(#ffffff, #000000)");
    expect(c).not.toBeNull();
    expect(c!.r).toBe(1);
  });

  it("returns null for color() function (display-p3 etc.)", () => {
    expect(parseColor("color(display-p3 1 0 0)")).toBeNull();
  });
});

describe("APCA Lc advisory score", () => {
  it("produces a positive Lc when text is darker than bg", () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 1, g: 1, b: 1, a: 1 };
    const lc = apcaLc(black, white);
    expect(lc).toBeGreaterThan(0);
    expect(lc).toBeGreaterThan(75);  // black-on-white is well above body-text threshold
  });

  it("produces a negative Lc when text is lighter than bg (reverse polarity)", () => {
    const white = { r: 1, g: 1, b: 1, a: 1 };
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const lc = apcaLc(white, black);
    expect(lc).toBeLessThan(0);
  });

  it("returns ~0 for identical colors", () => {
    const gray = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    expect(Math.abs(apcaLc(gray, gray))).toBeLessThan(2);
  });
});

describe("adjustForContrastOklch", () => {
  it("produces a result that meets the target ratio", () => {
    const fg = { r: 0.4, g: 0.4, b: 0.5, a: 1 };
    const bg = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const out = adjustForContrastOklch(fg, bg, WCAG_THRESHOLDS.AA_NORMAL);
    expect(contrastRatio(out, bg)).toBeGreaterThanOrEqual(WCAG_THRESHOLDS.AA_NORMAL);
  });

  it("preserves alpha", () => {
    const fg = { r: 0.4, g: 0.4, b: 0.5, a: 0.65 };
    const bg = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const out = adjustForContrastOklch(fg, bg, 4.5);
    expect(out.a).toBeCloseTo(0.65, 2);
  });
});

describe("validateGroupContrast — UI components (§1.4.11)", () => {
  it("flags a borderColor that doesn't meet 3:1 against its bg", () => {
    const issues = validateGroupContrast(
      {
        backgroundColor: "#ffffff",
        borderColor:     "#f5f5f5",  // ~1.05:1 against white — fails 1.4.11
      } as any,
      "card",
      "/virtual/Card.tsx",
      DEFAULT_CONTRAST_OPTIONS,
    );
    const ui = issues.find(i => i.standard === "WCAG 2.1 AA — 1.4.11" && i.fgProp === "borderColor");
    expect(ui).toBeTruthy();
    expect(ui!.required).toBe(3);
  });

  it("flags an outlineColor under §2.4.13 (focus appearance)", () => {
    const issues = validateGroupContrast(
      {
        backgroundColor: "#ffffff",
        outlineColor:    "#fafafa",  // basically invisible
      } as any,
      "input",
      "/virtual/Input.tsx",
      DEFAULT_CONTRAST_OPTIONS,
    );
    const focus = issues.find(i => i.standard === "WCAG 2.2 AA — 2.4.13");
    expect(focus).toBeTruthy();
    expect(focus!.category).toBe("focus");
  });

  it("flags a low-contrast caretColor", () => {
    const issues = validateGroupContrast(
      {
        backgroundColor: "#ffffff",
        caretColor:      "#f8f8f8",
      } as any,
      "input",
      "/virtual/Input.tsx",
      DEFAULT_CONTRAST_OPTIONS,
    );
    expect(issues.find(i => i.fgProp === "caretColor")).toBeTruthy();
  });

  it("extracts the color from a boxShadow declaration and flags low contrast", () => {
    const issues = validateGroupContrast(
      {
        backgroundColor: "#ffffff",
        boxShadow:       "0 0 0 4px #fafafa",
      } as any,
      "btn",
      "/virtual/Btn.tsx",
      DEFAULT_CONTRAST_OPTIONS,
    );
    expect(issues.find(i => i.fgProp === "boxShadow color")).toBeTruthy();
  });

  it("does not flag a high-contrast border", () => {
    const issues = validateGroupContrast(
      {
        backgroundColor: "#ffffff",
        borderColor:     "#000000",
      } as any,
      "card",
      "/virtual/Card.tsx",
      DEFAULT_CONTRAST_OPTIONS,
    );
    expect(issues.find(i => i.fgProp === "borderColor")).toBeFalsy();
  });
});

describe("validateGroupContrast — gradient midpoint sampling", () => {
  it("flags a low-contrast trough between two acceptable stops", () => {
    // White surface, gradient: black → light gray → black.
    // Endpoints are fine, but the mid-gray will be a low-contrast trough.
    const issues = validateGroupContrast(
      {
        color:           "transparent",
        backgroundClip:  "text",
        background:      "linear-gradient(120deg, #000000 0%, #f0f0f0 50%, #000000 100%)",
      } as any,
      "hero",
      "/virtual/Hero.tsx",
      { ...DEFAULT_CONTRAST_OPTIONS, gradientSampleCount: 5 },
    );
    // Find a "midpoint" issue (not just the declared #f0f0f0 stop).
    const mid = issues.find(i => i.fgValue.startsWith("mix of"));
    expect(mid).toBeTruthy();
    expect(mid!.category).toBe("gradient");
  });

  it("respects gradientSampleCount: 0 (only declared stops)", () => {
    const issues = validateGroupContrast(
      {
        color:           "transparent",
        backgroundClip:  "text",
        background:      "linear-gradient(120deg, #000000 0%, #f0f0f0 50%, #000000 100%)",
      } as any,
      "hero",
      "/virtual/Hero.tsx",
      { ...DEFAULT_CONTRAST_OPTIONS, gradientSampleCount: 0 },
    );
    expect(issues.find(i => i.fgValue.startsWith("mix of"))).toBeFalsy();
  });
});

describe("validateGroupContrast — _skipContrast escape hatches", () => {
  const obj = (extra: any) => ({
    color:           "#bbbbbb",       // low contrast on white in light mode
    backgroundColor: "#ffffff",
    ...extra,
  } as any);

  it("_skipContrast: true skips every check", () => {
    const issues = validateGroupContrast(obj({ _skipContrast: true }), "x", "/x.tsx", DEFAULT_CONTRAST_OPTIONS);
    expect(issues).toEqual([]);
  });

  it("_skipContrast: \"light\" skips ONLY light-mode issues", () => {
    const issues = validateGroupContrast(obj({ _skipContrast: "light" }), "x", "/x.tsx", DEFAULT_CONTRAST_OPTIONS);
    expect(issues.find(i => i.mode === "light")).toBeFalsy();
  });

  it("_skipContrast: [\"ui\"] skips ONLY UI-component issues", () => {
    const issues = validateGroupContrast(
      {
        backgroundColor: "#ffffff",
        borderColor:     "#f0f0f0",  // would normally fail 1.4.11
        color:           "#bbb",     // would normally fail 1.4.3
        _skipContrast:   ["ui"],
      } as any,
      "card",
      "/x.tsx",
      DEFAULT_CONTRAST_OPTIONS,
    );
    expect(issues.find(i => i.category === "ui")).toBeFalsy();
    expect(issues.find(i => i.category === "text")).toBeTruthy();
  });
});

describe("APCA Lc appears in diagnostic", () => {
  it("attaches an apcaLc number to every text-contrast issue", () => {
    const issues = validateGroupContrast(
      {
        color:           "#cccccc",
        backgroundColor: "#dddddd",
      } as any,
      "x",
      "/x.tsx",
      DEFAULT_CONTRAST_OPTIONS,
    );
    expect(issues.length).toBeGreaterThan(0);
    for (const i of issues) {
      expect(typeof i.apcaLc).toBe("number");
    }
  });

  it("APCA Lc has correct polarity (positive when text darker than bg)", () => {
    expect(apcaLc({ r: 0, g: 0, b: 0, a: 1 }, { r: 1, g: 1, b: 1, a: 1 })).toBeGreaterThan(0);
    expect(apcaLc({ r: 1, g: 1, b: 1, a: 1 }, { r: 0, g: 0, b: 0, a: 1 })).toBeLessThan(0);
  });

  it("APCA Lc magnitude exceeds 90 for pure black/white (full reference scale)", () => {
    // SAPC-W3 0.1.9: pure black on pure white returns Lc ~+106, the
    // top of the bronze readability bracket. Anything noticeably below
    // would mean we degraded the implementation.
    const lc = apcaLc({ r: 0, g: 0, b: 0, a: 1 }, { r: 1, g: 1, b: 1, a: 1 });
    expect(lc).toBeGreaterThan(90);
  });
});

describe("validateGroupContrast — peer-bg tracing (opt-in)", () => {
  const peerOpts = { ...DEFAULT_CONTRAST_OPTIONS, auditPeerSurfaces: true };

  it("flags a fg that's safe on the page surface but unreadable on a peer-group bg", () => {
    // Black text — readable against the light page surface (#fafafa, ~19:1),
    // but disastrous on a sibling group whose bg is near-black.
    const issues = validateGroupContrast(
      { color: "#000000" } as any,
      "label",
      "/x.tsx",
      peerOpts,
      { light: ["#222222"], dark: [] },  // sibling group sits on near-black
    );
    const peer = issues.find(i => i.bgProp === "peer-group bg");
    expect(peer).toBeTruthy();
    expect(peer!.bgValue).toBe("#222222");
  });

  it("does NOT flag when the worst peer is still readable", () => {
    const issues = validateGroupContrast(
      { color: "#000000" } as any,
      "label",
      "/x.tsx",
      peerOpts,
      { light: ["#ffffff", "#fafafa", "#f0f0f0"], dark: [] },
    );
    expect(issues.find(i => i.category === "text" && i.mode === "light")).toBeFalsy();
  });

  it("only one issue per group (worst case wins)", () => {
    const issues = validateGroupContrast(
      { color: "#bbbbbb" } as any,
      "label",
      "/x.tsx",
      peerOpts,
      { light: ["#ffffff", "#cccccc", "#dddddd"], dark: [] },
    );
    const lightTextIssues = issues.filter(i => i.category === "text" && i.mode === "light");
    expect(lightTextIssues.length).toBe(1);
  });

  it("default options DON'T trace peers (off-by-default policy)", () => {
    const issues = validateGroupContrast(
      { color: "#000000" } as any,
      "label",
      "/x.tsx",
      DEFAULT_CONTRAST_OPTIONS,           // peer audit disabled
      { light: ["#222222"], dark: [] },
    );
    expect(issues.find(i => i.bgProp === "peer-group bg")).toBeFalsy();
  });
});

describe("validateGroupContrast — token resolution via tokenRegistry", () => {
  beforeEach(() => tokenRegistry.clear());

  it("resolves var(--tl-XXX) to its underlying value before measuring contrast", () => {
    tokenRegistry.addToken("tl-brand-bg",   "#ffffff");
    tokenRegistry.addToken("tl-brand-text", "#dddddd");  // very low contrast on white
    const issues = validateGroupContrast(
      {
        color:           "var(--tl-brand-text)",
        backgroundColor: "var(--tl-brand-bg)",
      } as any,
      "branded",
      "/x.tsx",
      DEFAULT_CONTRAST_OPTIONS,
    );
    const text = issues.find(i => i.category === "text" && i.mode === "light");
    expect(text).toBeTruthy();
    expect(text!.fgValue).toBe("var(--tl-brand-text)");  // diagnostic preserves the var()
  });

  it("uses darkValue for dark-mode audits when token registers one", () => {
    tokenRegistry.addToken("tl-fg", "#000000", "#ffffff");
    tokenRegistry.addToken("tl-bg", "#ffffff", "#000000");
    const issues = validateGroupContrast(
      {
        color:           "var(--tl-fg)",
        backgroundColor: "var(--tl-bg)",
      } as any,
      "x",
      "/x.tsx",
      DEFAULT_CONTRAST_OPTIONS,
    );
    expect(issues.filter(i => i.category === "text").length).toBe(0);
  });
});

describe("validateGroupContrast — image-background advisory", () => {
  it("emits an advisory when text sits on a url() background", () => {
    const issues = validateGroupContrast(
      {
        color: "#000000",
        backgroundImage: "url(/hero.jpg)",
      } as any,
      "hero",
      "/x.tsx",
      DEFAULT_CONTRAST_OPTIONS,
    );
    const adv = issues.find(i => i.category === "image-bg");
    expect(adv).toBeTruthy();
    expect(adv!.severity).toBe("warning");
    expect(adv!.message).toMatch(/runtime/);
  });

  it("does NOT emit when no text is set", () => {
    const issues = validateGroupContrast(
      { backgroundImage: "url(/hero.jpg)" } as any,
      "hero",
      "/x.tsx",
      DEFAULT_CONTRAST_OPTIONS,
    );
    expect(issues.find(i => i.category === "image-bg")).toBeFalsy();
  });
});
