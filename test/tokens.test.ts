import { describe, expect, it, beforeEach } from "vitest";
import { tl } from "../src/runtime/index";
import { transform, globalRegistry } from "../src/compiler/extractor";
import {
  tokenRegistry,
  tokenVarName,
  themeClassName,
  flattenTokenMap,
} from "../src/compiler/tokens";
import {
  generateTokensCSS,
  generateThemesCSS,
} from "../src/compiler/css-gen";

describe("runtime/compiler tokens hash invariant", () => {
  it("tokenVarName matches the runtime form used by tl.cssVar()", () => {
    // Runtime tl.cssVar produces "var(--<name>)". Compiler-side tokenVarName
    // returns the bare name. They MUST agree on the hash so build-time CSS
    // matches runtime references — same invariant as compiler/hash.ts ↔
    // runtime/index.ts FNV-1a.
    const runtimeForm  = tl.cssVar("brand-primary");
    const compilerName = tokenVarName("brand-primary");
    expect(runtimeForm).toBe(`var(--${compilerName})`);
  });

  it("themeClassName is deterministic and 'sc'-prefixed", () => {
    const a = themeClassName("dark");
    const b = themeClassName("dark");
    expect(a).toBe(b);
    expect(a.startsWith("tlTheme")).toBe(true);
    expect(themeClassName("dark")).not.toBe(themeClassName("light"));
  });

  it("flattenTokenMap produces dash-joined keys for nested objects", () => {
    expect(flattenTokenMap({
      brand:   { primary: "#3b82f6", secondary: "#10b981" },
      spacing: { sm: "0.5rem", md: "1rem" },
    })).toEqual([
      { key: "brand-primary",   value: "#3b82f6" },
      { key: "brand-secondary", value: "#10b981" },
      { key: "spacing-sm",      value: "0.5rem" },
      { key: "spacing-md",      value: "1rem" },
    ]);
  });
});

describe("tl.defineTokens — compile-time", () => {
  beforeEach(() => { globalRegistry.clear(); tokenRegistry.clear(); });

  it("registers :root token rules + auto-dark .dark rule from a defineTokens call", () => {
    const src = `
      import { tl } from "traceless-style";
      const t = tl.defineTokens({ brand: { primary: "#3b82f6" } });
    `;
    transform(src, "/virtual/Tokens.tsx");
    const tokens = tokenRegistry.getTokens();
    expect(tokens.length).toBe(1);
    expect(tokens[0].value).toBe("#3b82f6");
    expect(tokens[0].darkValue).toBeTruthy();   // auto-derived dark variant
    expect(tokens[0].name).toBe(tokenVarName("brand-primary"));

    const css = generateTokensCSS(tokens);
    // Two rules: :root with the light value, .dark re-binds to derived dark.
    expect(css).toMatch(/^:root\{--[\w-]+:#3b82f6\}\.dark\{--[\w-]+:#[0-9a-f]{6}\}$/);
  });

  it("rewrites the defineTokens() call to inline var() literals", () => {
    const src = `
      import { tl } from "traceless-style";
      const t = tl.defineTokens({ brand: { primary: "#3b82f6" } });
    `;
    const out = transform(src, "/virtual/Tokens.tsx");
    expect(out.code).toContain(`var(--${tokenVarName("brand-primary")})`);
    // The original literal value must NOT survive (we replaced the call).
    expect(out.code).not.toContain(`#3b82f6`);
  });
});

describe("tl.createTheme — compile-time", () => {
  beforeEach(() => { globalRegistry.clear(); tokenRegistry.clear(); });

  it("registers a theme class with override declarations", () => {
    const src = `
      import { tl } from "traceless-style";
      const dark = tl.createTheme("dark", { brand: { primary: "#60a5fa" } });
    `;
    transform(src, "/virtual/Theme.tsx");
    const themes = tokenRegistry.getThemes();
    expect(themes.length).toBe(1);
    expect(themes[0].cls).toBe(themeClassName("dark"));
    expect(themes[0].overrides[0].name).toBe(tokenVarName("brand-primary"));
    expect(themes[0].overrides[0].value).toBe("#60a5fa");

    const css = generateThemesCSS(themes);
    expect(css).toBe(`.${themes[0].cls}{--${themes[0].overrides[0].name}:#60a5fa}`);
  });

  it("rewrites the createTheme() call to the class-name string literal", () => {
    const src = `
      import { tl } from "traceless-style";
      const dark = tl.createTheme("dark", { brand: { primary: "#60a5fa" } });
    `;
    const out = transform(src, "/virtual/Theme.tsx");
    expect(out.code).toContain(JSON.stringify(themeClassName("dark")));
  });
});

describe("tl.cssVar inside tl.create()", () => {
  beforeEach(() => { globalRegistry.clear(); tokenRegistry.clear(); });

  it("expands tl.cssVar('name') into the literal var() string", () => {
    const src = `
      import { tl } from "traceless-style";
      const $ = tl.create({ btn: { color: tl.cssVar("brand-primary") } });
    `;
    const out = transform(src, "/virtual/Use.tsx");
    expect(out.errors).toEqual([]);
    expect(out.changed).toBe(true);
    // The resolved class string should reference a rule whose value is
    // the var() form.
    const rule = globalRegistry.getAll().find(r => r.prop === "color");
    expect(rule).toBeTruthy();
    expect(rule!.value).toBe(`var(--${tokenVarName("brand-primary")})`);
  });
});

describe("Vite plugin — smoke test", () => {
  it("returns a Plugin object with the expected hook shape", async () => {
    const { tracelessStyle } = await import("../src/plugins/vite");
    const plugin = tracelessStyle();
    expect(plugin.name).toBe("traceless-style");
    expect(plugin.enforce).toBe("pre");
    expect(typeof plugin.configResolved).toBe("function");
    expect(typeof plugin.buildStart).toBe("function");
    expect(typeof plugin.transform).toBe("function");
    expect(typeof plugin.handleHotUpdate).toBe("function");
  });

  it("transform() returns null for files without traceless-style APIs", async () => {
    const { tracelessStyle } = await import("../src/plugins/vite");
    const p = tracelessStyle();
    const result = p.transform!(
      `export const x = 1;`,
      "/virtual/Plain.tsx"
    );
    expect(result).toBeNull();
  });

  it("transform() rewrites a tl.create() call", async () => {
    const { tracelessStyle } = await import("../src/plugins/vite");
    const p = tracelessStyle();
    const result = p.transform!(
      `import { tl } from "traceless-style"; const $ = tl.create({ btn: { color: "red" } });`,
      "/virtual/Btn.tsx"
    );
    expect(result).not.toBeNull();
    expect(result!.code).not.toContain("tl.create(");
    expect(result!.code).toContain('"btn":');
  });
});
