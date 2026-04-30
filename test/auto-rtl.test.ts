import { describe, expect, it, beforeEach } from "vitest";
import { convertToLogical, hasLogicalForm } from "../src/compiler/auto-rtl";
import {
  transform,
  globalRegistry,
  setAutoRtl,
  getAutoRtl,
} from "../src/compiler/extractor";
import { tokenRegistry } from "../src/compiler/tokens";
import { tl } from "../src/runtime/index";
import { generateCSS } from "../src/compiler/css-gen";

describe("convertToLogical", () => {
  it("rewrites physical margin/padding properties to logical", () => {
    expect(convertToLogical("marginLeft", "1rem")).toEqual({
      prop: "marginInlineStart", value: "1rem", changed: true,
    });
    expect(convertToLogical("paddingRight", "0.5rem")).toEqual({
      prop: "paddingInlineEnd", value: "0.5rem", changed: true,
    });
  });

  it("rewrites border longhand directional properties", () => {
    expect(convertToLogical("borderLeftWidth", "1px").prop).toBe("borderInlineStartWidth");
    expect(convertToLogical("borderRightColor", "#000").prop).toBe("borderInlineEndColor");
    expect(convertToLogical("borderLeftStyle", "solid").prop).toBe("borderInlineStartStyle");
  });

  it("rewrites border-radius corners to start/end form", () => {
    expect(convertToLogical("borderTopLeftRadius",     "8px").prop).toBe("borderStartStartRadius");
    expect(convertToLogical("borderTopRightRadius",    "8px").prop).toBe("borderStartEndRadius");
    expect(convertToLogical("borderBottomLeftRadius",  "8px").prop).toBe("borderEndStartRadius");
    expect(convertToLogical("borderBottomRightRadius", "8px").prop).toBe("borderEndEndRadius");
  });

  it("rewrites positional left/right to insetInlineStart/End", () => {
    expect(convertToLogical("left",  "0").prop).toBe("insetInlineStart");
    expect(convertToLogical("right", "0").prop).toBe("insetInlineEnd");
  });

  it("translates value-level keywords on textAlign and float", () => {
    expect(convertToLogical("textAlign", "left")).toEqual({
      prop: "textAlign", value: "start", changed: true,
    });
    expect(convertToLogical("textAlign", "right")).toEqual({
      prop: "textAlign", value: "end", changed: true,
    });
    expect(convertToLogical("float",     "left").value).toBe("inline-start");
    expect(convertToLogical("clear",     "right").value).toBe("inline-end");
  });

  it("passes non-directional properties through unchanged", () => {
    expect(convertToLogical("color",   "red")).toEqual({ prop: "color",   value: "red", changed: false });
    expect(convertToLogical("display", "flex")).toEqual({ prop: "display", value: "flex", changed: false });
    expect(convertToLogical("padding", "1rem")).toEqual({ prop: "padding", value: "1rem", changed: false });
  });

  it("supports kebab-case input as well as camelCase", () => {
    expect(convertToLogical("margin-left",  "1rem").prop).toBe("margin-inline-start");
    expect(convertToLogical("border-right", "1px solid").prop).toBe("border-inline-end");
  });

  it("hasLogicalForm flags directional properties", () => {
    expect(hasLogicalForm("marginLeft")).toBe(true);
    expect(hasLogicalForm("textAlign")).toBe(true);
    expect(hasLogicalForm("color")).toBe(false);
    expect(hasLogicalForm("padding")).toBe(false);
  });
});

describe("auto-rtl integration with processStyles", () => {
  beforeEach(() => {
    globalRegistry.clear();
    tokenRegistry.clear();
    setAutoRtl(true);
  });

  it("emits logical CSS for physical properties (compiler side)", () => {
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({ btn: { marginLeft: "1rem", paddingRight: "0.5rem" } });`,
      "/virtual/Btn.tsx"
    );
    const rules = globalRegistry.getAll();
    const props = rules.map(r => r.prop).sort();
    expect(props).toContain("margin-inline-start");
    expect(props).toContain("padding-inline-end");
    expect(props).not.toContain("margin-left");
    expect(props).not.toContain("padding-right");
  });

  it("runtime _processStyles produces the SAME hashes as the compiler", () => {
    // Compile a tl.create with physical properties.
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({ btn: { marginLeft: "1rem" } });`,
      "/virtual/Btn.tsx"
    );
    const compilerCls = globalRegistry.getAll()[0].cls;

    // The runtime evaluating the same tl.create() must produce the same class.
    const runtimeResolved = tl.create({ btn: { marginLeft: "1rem" } });
    expect(runtimeResolved.btn).toBe(compilerCls);
  });

  it("`_autoRtl: false` keeps physical properties intact for that group", () => {
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({
         normal: { marginLeft: "1rem" },
         pinned: { marginLeft: "1rem", _autoRtl: false },
       });`,
      "/virtual/Btn.tsx"
    );
    const props = globalRegistry.getAll().map(r => r.prop);
    expect(props).toContain("margin-inline-start");
    expect(props).toContain("margin-left");          // pinned group stays physical
  });

  it("global setAutoRtl(false) disables conversion everywhere", () => {
    setAutoRtl(false);
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({ btn: { marginLeft: "1rem", textAlign: "left" } });`,
      "/virtual/Btn.tsx"
    );
    const props = globalRegistry.getAll().map(r => r.prop);
    const values = globalRegistry.getAll().map(r => r.value);
    expect(props).toContain("margin-left");
    expect(values).toContain("left");
    expect(getAutoRtl()).toBe(false);
    setAutoRtl(true);
  });

  it("emits logical CSS form in the generated stylesheet", () => {
    transform(
      `import { tl } from "traceless-style";
       const $ = tl.create({ x: { marginLeft: "1rem", textAlign: "left" } });`,
      "/virtual/X.tsx"
    );
    const css = generateCSS(globalRegistry.getAll());
    expect(css).toContain("margin-inline-start:1rem");
    expect(css).toContain("text-align:start");
    expect(css).not.toContain("margin-left:1rem");
  });
});

describe("RTL component (smoke test)", () => {
  it("traceless-style/rtl exports the expected names", async () => {
    const m = await import("../src/rtl");
    expect(typeof m.RtlToggle).toBe("function");
    expect(typeof m.useTracelessRtl).toBe("function");
    expect(typeof m.direction).toBe("object");
    expect(typeof m.RTL_INIT_SCRIPT).toBe("string");
    expect(m.RTL_INIT_SCRIPT).toContain("traceless-dir");
  });
});
