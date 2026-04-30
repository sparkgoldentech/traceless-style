import { describe, expect, it, beforeEach } from "vitest";
import { tl } from "../src/runtime/index";
import {
  transform,
  globalRegistry,
} from "../src/compiler/extractor";
import {
  tokenRegistry,
  keyframeName,
} from "../src/compiler/tokens";
import {
  generateKeyframesCSS,
  generateCSSPretty,
} from "../src/compiler/css-gen";

describe("tl.keyframes — runtime/compiler hash invariant", () => {
  it("runtime keyframes() returns the same name the compiler emits", () => {
    const a = tl.keyframes("fadeIn", { from: { opacity: 0 }, to: { opacity: 1 } });
    const b = keyframeName("fadeIn");
    expect(a).toBe(b);
    expect(a.startsWith("tlKf")).toBe(true);
  });

  it("different keyframes names hash differently", () => {
    expect(tl.keyframes("fadeIn", {})).not.toBe(tl.keyframes("fadeOut", {}));
  });
});

describe("tl.keyframes — compile-time emission", () => {
  beforeEach(() => { globalRegistry.clear(); tokenRegistry.clear(); });

  it("registers a keyframe with from/to steps", () => {
    const src = `
      import { tl } from "traceless-style";
      const fadeIn = tl.keyframes("fadeIn", {
        from: { opacity: 0 },
        to:   { opacity: 1 },
      });
    `;
    transform(src, "/virtual/Anim.tsx");
    const frames = tokenRegistry.getKeyframes();
    expect(frames.length).toBe(1);
    expect(frames[0].name).toBe(keyframeName("fadeIn"));
    expect(frames[0].steps).toHaveLength(2);
    expect(frames[0].steps[0].stop).toBe("from");
    expect(frames[0].steps[0].decls[0]).toEqual({ prop: "opacity", value: "0" });
  });

  it("rewrites the keyframes() call to a string-literal class name", () => {
    const src = `
      import { tl } from "traceless-style";
      const fadeIn = tl.keyframes("fadeIn", { from: { opacity: 0 }, to: { opacity: 1 } });
    `;
    const out = transform(src, "/virtual/Anim.tsx");
    expect(out.code).toContain(JSON.stringify(keyframeName("fadeIn")));
  });

  it("emits valid @keyframes CSS", () => {
    const src = `
      import { tl } from "traceless-style";
      const slide = tl.keyframes("slide", {
        from: { transform: "translateX(0)" },
        to:   { transform: "translateX(100%)" },
      });
    `;
    transform(src, "/virtual/Slide.tsx");
    const css = generateKeyframesCSS(tokenRegistry.getKeyframes());
    expect(css).toMatch(/^@keyframes tlKf[a-z0-9]+\{from\{[^}]+\}to\{[^}]+\}\}$/);
  });

  it("rejects unknown CSS properties inside frames", () => {
    const src = `
      import { tl } from "traceless-style";
      const x = tl.keyframes("bad", { from: { fakeprop: "1" }, to: { opacity: 1 } });
    `;
    const out = transform(src, "/virtual/Bad.tsx");
    expect(out.errors.some(e => e.message.includes("fakeprop"))).toBe(true);
  });

  it("rejects percentage stops with bad characters", () => {
    // The CSS-emitter filters out anything that's not from/to/<digit>%, so
    // a malicious step like `<script>` never reaches the output even if
    // the parser somehow let it through.
    const css = generateKeyframesCSS([{
      name:  "bad",
      steps: [
        { stop: "<script>", decls: [{ prop: "color", value: "red" }] },
        { stop: "from",     decls: [{ prop: "color", value: "red" }] },
      ],
    }]);
    expect(css).not.toContain("<script>");
    expect(css).toContain("from{color:red}");
  });
});

describe("tl.keyframes — `${binding}` template-literal resolution", () => {
  // Regression coverage for the bug where users who wrote
  //   `const fadeUp = tl.keyframes(...); animation: \`${fadeUp} 0.6s\``
  // saw their animations silently break because the literal-only AST
  // parser couldn't evaluate ${fadeUp}. processKeyframes now records
  // `const X = tl.keyframes(...)` bindings and substitutes them inside
  // backtick template literals before AST-parsing.
  beforeEach(() => { globalRegistry.clear(); tokenRegistry.clear(); });

  it("resolves `${binding}` inside a template literal to the keyframe class name", () => {
    const src = `
      import { tl } from "traceless-style";
      const fadeUp = tl.keyframes("fadeUp", { from: { opacity: 0 }, to: { opacity: 1 } });
      const $ = tl.create({
        hero: {
          animation: \`\${fadeUp} 0.6s ease-out both\`,
        },
      });
    `;
    transform(src, "/virtual/Hero.tsx");
    const rules = globalRegistry.getAll();
    const animRule = rules.find(r => r.prop === "animation");
    expect(animRule).toBeDefined();
    // The value must contain the resolved tlKf<hash>, NOT the unresolved
    // template placeholder.
    expect(animRule!.value).toContain(keyframeName("fadeUp"));
    expect(animRule!.value).not.toContain("${");
    expect(animRule!.value).toMatch(/^tlKf[a-z0-9]+ 0\.6s ease-out both$/);
  });

  it("resolves multiple bindings in the same template literal", () => {
    const src = `
      import { tl } from "traceless-style";
      const a = tl.keyframes("a", { from: { opacity: 0 }, to: { opacity: 1 } });
      const b = tl.keyframes("b", { from: { transform: "scale(0)" }, to: { transform: "scale(1)" } });
      const $ = tl.create({
        x: {
          animation: \`\${a} 1s ease, \${b} 0.5s ease-in\`,
        },
      });
    `;
    transform(src, "/virtual/Multi.tsx");
    const rules = globalRegistry.getAll();
    const animRule = rules.find(r => r.prop === "animation");
    expect(animRule).toBeDefined();
    expect(animRule!.value).toContain(keyframeName("a"));
    expect(animRule!.value).toContain(keyframeName("b"));
    expect(animRule!.value).not.toContain("${");
  });

  it("supports `let` and `var` bindings, not just `const`", () => {
    const src = `
      import { tl } from "traceless-style";
      let pulse = tl.keyframes("pulse", { from: { opacity: 1 }, to: { opacity: 0.5 } });
      var glow  = tl.keyframes("glow",  { from: { opacity: 0 }, to: { opacity: 1 } });
      const $ = tl.create({
        a: { animation: \`\${pulse} 2s\` },
        b: { animation: \`\${glow} 1s\`  },
      });
    `;
    transform(src, "/virtual/Both.tsx");
    const rules = globalRegistry.getAll().filter(r => r.prop === "animation");
    expect(rules.length).toBe(2);
    expect(rules.some(r => r.value.includes(keyframeName("pulse")))).toBe(true);
    expect(rules.some(r => r.value.includes(keyframeName("glow")))).toBe(true);
  });

  it("does NOT substitute `${X}` inside single-quoted strings (not a template)", () => {
    // `${X}` inside single quotes is a literal dollar-brace string, not a
    // template-literal interpolation. We must leave it alone.
    const src = `
      import { tl } from "traceless-style";
      const fadeUp = tl.keyframes("fadeUp", { from: { opacity: 0 }, to: { opacity: 1 } });
      const note = '\${fadeUp} should stay literal';
      const $ = tl.create({ x: { content: '"hello"' } });
    `;
    const out = transform(src, "/virtual/Mixed.tsx");
    // The post-rewrite source should still contain the literal "${fadeUp}"
    // inside the single-quoted note string.
    expect(out.code).toContain("'${fadeUp} should stay literal'");
  });

  it("leaves `${unknown}` unresolved when the binding isn't a tl.keyframes result", () => {
    // If the user writes `${foo}` where `foo` isn't a keyframe binding,
    // we must NOT substitute it. We assert this by checking the emitted
    // rule's `value` field — it should contain the literal "${unknownVar}"
    // text. (The original source is rewritten, so we can't grep for the
    // template — but the rule-registry value preserves what the AST
    // parser saw.)
    const src = `
      import { tl } from "traceless-style";
      const fadeUp = tl.keyframes("fadeUp", { from: { opacity: 0 }, to: { opacity: 1 } });
      const $ = tl.create({
        hero: { animation: \`\${unknownVar} 1s\` },
      });
    `;
    transform(src, "/virtual/Mixed.tsx");
    const rules = globalRegistry.getAll();
    const animRule = rules.find(r => r.prop === "animation");
    // We don't expect an animation rule at all — the value with `${...}`
    // text fails `isValidRule` defensive checks. EITHER it was filtered
    // out OR the literal placeholder survived. Both prove we didn't
    // silently magic-substitute.
    if (animRule) {
      expect(animRule.value).toContain("${unknownVar}");
    } else {
      // Filtered — that's also acceptable behavior.
      expect(rules.some(r => r.value.includes(keyframeName("fadeUp")))).toBe(false);
    }
  });

  it("resolves bindings even when the keyframes call appears LATER in the file", () => {
    // The expansion pass runs AFTER all keyframes are processed, so a
    // forward reference (binding declared after first use position) still
    // resolves — we don't depend on document order.
    const src = `
      import { tl } from "traceless-style";
      const $ = tl.create({
        early: { animation: \`\${fadeUp} 0.5s\` },
      });
      const fadeUp = tl.keyframes("fadeUp", { from: { opacity: 0 }, to: { opacity: 1 } });
    `;
    transform(src, "/virtual/Forward.tsx");
    const rules = globalRegistry.getAll();
    const animRule = rules.find(r => r.prop === "animation");
    expect(animRule).toBeDefined();
    expect(animRule!.value).toContain(keyframeName("fadeUp"));
  });

  it("keyframes survive end-to-end through generateKeyframesCSS", () => {
    // Smoke test for the full pipeline: declare keyframes, run transform,
    // generate the keyframes CSS section, and verify the @keyframes block
    // is present in the output. This caught a real regression where the
    // file-level extraction cache was bypassing token-registry writes for
    // cached files, dropping all `tl.keyframes` declarations on warm runs.
    const src = `
      import { tl } from "traceless-style";
      const fadeUp  = tl.keyframes("fadeUp",  { from: { opacity: 0 }, to: { opacity: 1 } });
      const slideIn = tl.keyframes("slideIn", { from: { transform: "translateX(-10px)" }, to: { transform: "translateX(0)" } });
      const $ = tl.create({
        a: { animation: \`\${fadeUp} 1s\`  },
        b: { animation: \`\${slideIn} 1s\` },
      });
    `;
    transform(src, "/virtual/Pipeline.tsx");
    const css = generateKeyframesCSS(tokenRegistry.getKeyframes());
    expect(css.match(/@keyframes /g)?.length ?? 0).toBe(2);
    expect(css).toContain(keyframeName("fadeUp"));
    expect(css).toContain(keyframeName("slideIn"));
  });
});

describe("Source-comment dev mode (generateCSSPretty)", () => {
  beforeEach(() => { globalRegistry.clear(); tokenRegistry.clear(); });

  it("emits the origin file path above each rule when origin is set", () => {
    const src = `
      import { tl } from "traceless-style";
      const $ = tl.create({ btn: { display: "flex", color: "red" } });
    `;
    transform(src, "/virtual/Btn.tsx");
    const css = generateCSSPretty(globalRegistry.getAll());
    expect(css).toContain("/* /virtual/Btn.tsx");
    expect(css).toContain("display");
    expect(css).toContain("color");
  });

  it("strips block-comment closers from the origin tag", () => {
    // Even though origins come from our own extractor, the same defense-
    // in-depth posture as value validation says we never trust strings into
    // a comment without sanitizing. A malicious origin like
    // `evil*/<script>...` must NOT break out of the surrounding comment.
    const css = generateCSSPretty([{
      cls:    "tlABCDEF",
      prop:   "color",
      value:  "red",
      order:  0,
      origin: { file: "evil*/'>injection</style>", sourceKey: "color" },
    }]);
    // Locate the section between the origin comment opener and the rule.
    const originLineMatch = css.match(/\/\* evil[^\n]*/);
    expect(originLineMatch).not.toBeNull();
    const originLine = originLineMatch![0];
    // The malicious `*/` must NOT appear unescaped inside the origin tag
    // (it should have been broken with a zero-width space). If it did
    // appear, a future renderer could close the comment early.
    expect(originLine).not.toContain("evil*/'");
  });
});
