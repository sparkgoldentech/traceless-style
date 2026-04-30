import { describe, expect, it, beforeEach } from "vitest";
import { lint, DEFAULT_LINT_OPTIONS } from "../src/compiler/lint";
import { isValidRule } from "../src/compiler/css-gen";
import { isKnownProperty, suggestClosestProperty } from "../src/compiler/css-properties";
import { transform, globalRegistry } from "../src/compiler/extractor";

describe("DEFAULT_LINT_OPTIONS — strict by default", () => {
  it("turns on every rule by default", () => {
    expect(DEFAULT_LINT_OPTIONS.noInlineStyles).toBe(true);
    expect(DEFAULT_LINT_OPTIONS.noClassString).toBe(true);
    expect(DEFAULT_LINT_OPTIONS.noCSSModules).toBe(true);
    expect(DEFAULT_LINT_OPTIONS.noTailwind).toBe(true);
  });

  it("default options reject className=\"some-class\"", () => {
    const errors = lint(
      `export default function X() { return <div className="card" />; }`,
      "/virtual/X.tsx"
    );
    expect(errors.some(e => e.rule === "no-class-string")).toBe(true);
  });

  it("default options reject CSS-module imports", () => {
    const errors = lint(
      `import s from "./styles.module.css"; export default () => <div className={s.x} />;`,
      "/virtual/X.tsx"
    );
    expect(errors.some(e => e.rule === "no-css-modules")).toBe(true);
  });

  it("default options reject Tailwind utility classes", () => {
    const errors = lint(
      `export default () => <div className="flex items-center gap-4 p-2" />;`,
      "/virtual/X.tsx"
    );
    expect(errors.some(e => e.rule === "no-tailwind")).toBe(true);
  });
});

describe("isValidRule — CSS-injection guards", () => {
  it("rejects values containing semicolons", () => {
    expect(isValidRule("color", "red; } body { display: none")).toBe(false);
  });

  it("rejects values containing closing braces", () => {
    expect(isValidRule("color", "red }")).toBe(false);
  });

  it("rejects values containing < or > (HTML-shape)", () => {
    expect(isValidRule("content", "</style><script>x</script>")).toBe(false);
    expect(isValidRule("content", "<svg/>")).toBe(false);
  });

  it("rejects CSS comment escapes", () => {
    expect(isValidRule("color", "red */ } /*")).toBe(false);
  });

  it("rejects ASCII control characters", () => {
    expect(isValidRule("color", "redbeep")).toBe(false);
    expect(isValidRule("color", "redescape")).toBe(false);
  });

  it("rejects zero-width / bidi unicode in values", () => {
    expect(isValidRule("color", "red​")).toBe(false); // ZWSP
    expect(isValidRule("color", "‮red‬")).toBe(false); // RLO/PDF
    expect(isValidRule("color", "﻿red")).toBe(false); // BOM
  });

  it("accepts ordinary CSS values", () => {
    expect(isValidRule("color", "red")).toBe(true);
    expect(isValidRule("background-color", "rgba(0, 0, 0, 0.5)")).toBe(true);
    expect(isValidRule("padding", "1rem 2rem")).toBe(true);
    expect(isValidRule("font-family", "'Segoe UI', sans-serif")).toBe(true);
  });

  it("accepts CSS variable property names", () => {
    expect(isValidRule("--my-var", "red")).toBe(true);
  });
});

describe("css-properties — allowlist + suggestions", () => {
  it("recognizes standard properties", () => {
    for (const p of ["display", "color", "backgroundColor", "padding", "marginInlineStart"]) {
      expect(isKnownProperty(p)).toBe(true);
    }
  });

  it("accepts CSS variables (--foo)", () => {
    expect(isKnownProperty("--brand-color")).toBe(true);
    expect(isKnownProperty("--my_var")).toBe(true);
  });

  it("accepts vendor prefixes in both forms", () => {
    expect(isKnownProperty("webkitTransform")).toBe(true);
    expect(isKnownProperty("mozAppearance")).toBe(true);
    expect(isKnownProperty("-webkit-mask-image")).toBe(true);
    expect(isKnownProperty("-ms-overflow-style")).toBe(true);
  });

  it("rejects typos and suggests the closest property", () => {
    expect(isKnownProperty("colour")).toBe(false);
    expect(suggestClosestProperty("colour")).toBe("color");

    expect(isKnownProperty("dispaly")).toBe(false);
    expect(suggestClosestProperty("dispaly")).toBe("display");
  });

  it("rejects malformed names", () => {
    expect(isKnownProperty("color/")).toBe(false);
    expect(isKnownProperty("123property")).toBe(false);
    expect(isKnownProperty("")).toBe(false);
  });
});

describe("processStyles — typed property errors", () => {
  beforeEach(() => globalRegistry.clear());

  it("emits a 'did you mean' error for unknown properties", () => {
    const result = transform(
      `import { tl } from "traceless-style";\nconst $ = tl.create({ btn: { colour: "red" } });`,
      "/virtual/Typo.tsx"
    );
    const typoErr = result.errors.find(e => e.message.includes("colour"));
    expect(typoErr).toBeTruthy();
    expect(typoErr!.message).toMatch(/did you mean 'color'/);
  });

  it("accepts valid properties without complaint", () => {
    const result = transform(
      `import { tl } from "traceless-style";\nconst $ = tl.create({ btn: { color: "red", padding: "1rem" } });`,
      "/virtual/Ok.tsx"
    );
    expect(result.errors).toEqual([]);
  });

  it("accepts CSS variables and vendor prefixes inside tl.create()", () => {
    const result = transform(
      `import { tl } from "traceless-style";\nconst $ = tl.create({ btn: { "--brand": "red", webkitTransform: "translateX(0)" } });`,
      "/virtual/Vars.tsx"
    );
    expect(result.errors).toEqual([]);
  });
});

describe("background-clip:text + background shorthand guard", () => {
  beforeEach(() => globalRegistry.clear());

  it("errors when `background:` shorthand sits next to `backgroundClip: \"text\"`", () => {
    const result = transform(
      `import { tl } from "traceless-style";\nconst $ = tl.create({ hero: { background: "linear-gradient(120deg,#000,#fff)", backgroundClip: "text", color: "transparent" } });`,
      "/virtual/Hero.tsx"
    );
    const conflict = result.errors.find(e => e.message.includes("background-clip"));
    expect(conflict).toBeTruthy();
    expect(conflict!.message).toMatch(/backgroundImage:/);
  });

  it("errors for the -webkit-background-clip:text variant of the same conflict", () => {
    const result = transform(
      `import { tl } from "traceless-style";\nconst $ = tl.create({ hero: { background: "linear-gradient(120deg,#000,#fff)", webkitBackgroundClip: "text", color: "transparent" } });`,
      "/virtual/HeroWebkit.tsx"
    );
    const conflict = result.errors.find(e => e.message.includes("background-clip") || e.message.includes("backgroundImage"));
    expect(conflict).toBeTruthy();
  });

  it("flags a child variant that uses `background:` shorthand under a parent that clips to text", () => {
    const result = transform(
      `import { tl } from "traceless-style";\nconst $ = tl.create({ hero: { backgroundImage: "linear-gradient(120deg,#000,#fff)", backgroundClip: "text", color: "transparent", _dark: { background: "linear-gradient(120deg,#fff,#000)" } } });`,
      "/virtual/HeroDark.tsx"
    );
    const variantConflict = result.errors.find(e => e.message.includes("'_dark'"));
    expect(variantConflict).toBeTruthy();
    expect(variantConflict!.message).toMatch(/backgroundImage:/);
  });

  it("accepts the longhand `backgroundImage:` form without error", () => {
    const result = transform(
      `import { tl } from "traceless-style";\nconst $ = tl.create({ hero: { backgroundImage: "linear-gradient(120deg,#000,#fff)", backgroundClip: "text", color: "transparent" } });`,
      "/virtual/HeroOk.tsx"
    );
    const conflict = result.errors.find(e => e.message.includes("background-clip") && e.message.includes("backgroundImage"));
    expect(conflict).toBeUndefined();
  });

  it("does not flag `background:` shorthand alone (no clip-to-text in the same block)", () => {
    const result = transform(
      `import { tl } from "traceless-style";\nconst $ = tl.create({ box: { background: "linear-gradient(135deg,#6366f1,#ec4899)" } });`,
      "/virtual/BoxBg.tsx"
    );
    const conflict = result.errors.find(e => e.message.includes("background-clip"));
    expect(conflict).toBeUndefined();
  });
});
