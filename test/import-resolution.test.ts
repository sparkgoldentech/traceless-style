import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  scanDefineTokens,
  parseFileImports,
  transform,
  globalRegistry,
  loadPathAliases,
  installRegistryResolver,
} from "../src/compiler/extractor";
import {
  tokenRegistry,
  tokenExportRegistry,
  tokenVarName,
} from "../src/compiler/tokens";

const FX_DIR = path.resolve("test/.import-fx");

function reset() {
  globalRegistry.clear();
  tokenRegistry.clear();
  tokenExportRegistry.clear();
  installRegistryResolver();
}

function writeFx(rel: string, content: string): string {
  const full = path.join(FX_DIR, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("Cross-file import resolution — extended", () => {
  beforeEach(() => {
    reset();
    if (existsSync(FX_DIR)) rmSync(FX_DIR, { recursive: true, force: true });
    mkdirSync(FX_DIR, { recursive: true });
    loadPathAliases(FX_DIR);
    installRegistryResolver();
  });

  afterEach(() => {
    if (existsSync(FX_DIR)) rmSync(FX_DIR, { recursive: true, force: true });
  });

  /* ────────────────────────────────────────
     Re-exports
  ──────────────────────────────────────── */
  it("follows `export { x } from \"./y\"` chains", () => {
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      export const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
    `);
    const barrelPath = writeFx("barrel.ts", `
      export { tokens } from "./theme";
    `);
    scanDefineTokens(read(themePath), themePath);
    scanDefineTokens(read(barrelPath), barrelPath);

    const consumerPath = writeFx("Btn.tsx", `
      import { tokens } from "./barrel";
      import { tl } from "traceless-style";
      const $ = tl.create({ btn: { color: tokens.brand.primary } });
    `);
    const out = transform(read(consumerPath), consumerPath);
    expect(out.errors).toEqual([]);
    const colorRule = globalRegistry.getAll().find(r => r.prop === "color");
    expect(colorRule!.value).toBe(`var(--${tokenVarName("brand-primary")})`);
  });

  it("follows `export { x as y } from \"./z\"` renames", () => {
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      export const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
    `);
    const barrelPath = writeFx("barrel.ts", `
      export { tokens as themeTokens } from "./theme";
    `);
    scanDefineTokens(read(themePath), themePath);
    scanDefineTokens(read(barrelPath), barrelPath);

    const consumerPath = writeFx("Btn.tsx", `
      import { themeTokens } from "./barrel";
      import { tl } from "traceless-style";
      const $ = tl.create({ btn: { color: themeTokens.brand.primary } });
    `);
    const out = transform(read(consumerPath), consumerPath);
    expect(out.errors).toEqual([]);
    expect(globalRegistry.getAll().find(r => r.prop === "color")!.value)
      .toBe(`var(--${tokenVarName("brand-primary")})`);
  });

  it("follows `export * from \"./y\"` star re-exports", () => {
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      export const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
    `);
    const barrelPath = writeFx("barrel.ts", `
      export * from "./theme";
    `);
    scanDefineTokens(read(themePath), themePath);
    scanDefineTokens(read(barrelPath), barrelPath);

    const consumerPath = writeFx("Btn.tsx", `
      import { tokens } from "./barrel";
      import { tl } from "traceless-style";
      const $ = tl.create({ btn: { color: tokens.brand.primary } });
    `);
    const out = transform(read(consumerPath), consumerPath);
    expect(out.errors).toEqual([]);
    expect(globalRegistry.getAll().find(r => r.prop === "color")!.value)
      .toBe(`var(--${tokenVarName("brand-primary")})`);
  });

  it("survives a re-export cycle (no infinite loop)", () => {
    const aPath = writeFx("a.ts", `export * from "./b";`);
    const bPath = writeFx("b.ts", `export * from "./a";`);
    scanDefineTokens(read(aPath), aPath);
    scanDefineTokens(read(bPath), bPath);

    // tokenExportRegistry.resolve must not infinite-loop.
    const r = tokenExportRegistry.resolve(aPath, "doesNotExist");
    expect(r).toBeUndefined();
  });

  /* ────────────────────────────────────────
     Deferred / default exports
  ──────────────────────────────────────── */
  it("recognizes `const x = ...; export { x };` (deferred named export)", () => {
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
      export { tokens };
    `);
    scanDefineTokens(read(themePath), themePath);
    const consumerPath = writeFx("Btn.tsx", `
      import { tokens } from "./theme";
      import { tl } from "traceless-style";
      const $ = tl.create({ btn: { color: tokens.brand.primary } });
    `);
    const out = transform(read(consumerPath), consumerPath);
    expect(out.errors).toEqual([]);
    expect(globalRegistry.getAll().find(r => r.prop === "color")!.value)
      .toBe(`var(--${tokenVarName("brand-primary")})`);
  });

  it("recognizes `export default tokens` (default export of a binding)", () => {
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
      export default tokens;
    `);
    scanDefineTokens(read(themePath), themePath);
    const consumerPath = writeFx("Btn.tsx", `
      import T from "./theme";
      import { tl } from "traceless-style";
      const $ = tl.create({ btn: { color: T.brand.primary } });
    `);
    const out = transform(read(consumerPath), consumerPath);
    expect(out.errors).toEqual([]);
    expect(globalRegistry.getAll().find(r => r.prop === "color")!.value)
      .toBe(`var(--${tokenVarName("brand-primary")})`);
  });

  it("recognizes `export default { tokens }` (default object of bindings)", () => {
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
      export default { tokens };
    `);
    scanDefineTokens(read(themePath), themePath);
    const consumerPath = writeFx("Btn.tsx", `
      import M from "./theme";
      import { tl } from "traceless-style";
      const $ = tl.create({ btn: { color: M.tokens.brand.primary } });
    `);
    const out = transform(read(consumerPath), consumerPath);
    expect(out.errors).toEqual([]);
    expect(globalRegistry.getAll().find(r => r.prop === "color")!.value)
      .toBe(`var(--${tokenVarName("brand-primary")})`);
  });

  /* ────────────────────────────────────────
     Namespace imports
  ──────────────────────────────────────── */
  it("`import * as M from \"./theme\"` works for `M.tokens.brand.primary`", () => {
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      export const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
    `);
    scanDefineTokens(read(themePath), themePath);
    const consumerPath = writeFx("Btn.tsx", `
      import * as Theme from "./theme";
      import { tl } from "traceless-style";
      const $ = tl.create({ btn: { color: Theme.tokens.brand.primary } });
    `);
    const out = transform(read(consumerPath), consumerPath);
    expect(out.errors).toEqual([]);
    expect(globalRegistry.getAll().find(r => r.prop === "color")!.value)
      .toBe(`var(--${tokenVarName("brand-primary")})`);
  });

  /* ────────────────────────────────────────
     tsconfig path aliases
  ──────────────────────────────────────── */
  it("resolves `@/theme`-style imports via tsconfig paths", () => {
    writeFx("tsconfig.json", JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@/*": ["./*"] },
      },
    }));
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      export const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
    `);
    // Reload aliases now that tsconfig.json is on disk.
    loadPathAliases(FX_DIR);
    installRegistryResolver();

    scanDefineTokens(read(themePath), themePath);

    const consumerPath = writeFx("comp/Btn.tsx", `
      import { tokens } from "@/theme";
      import { tl } from "traceless-style";
      const $ = tl.create({ btn: { color: tokens.brand.primary } });
    `);
    const imported = parseFileImports(read(consumerPath), consumerPath);
    expect(imported.has("tokens")).toBe(true);

    const out = transform(read(consumerPath), consumerPath);
    expect(out.errors).toEqual([]);
    expect(globalRegistry.getAll().find(r => r.prop === "color")!.value)
      .toBe(`var(--${tokenVarName("brand-primary")})`);
  });

  it("resolves exact-pattern path aliases (no wildcard)", () => {
    writeFx("tsconfig.json", JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "design": ["./theme.ts"] },
      },
    }));
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      export const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
    `);
    loadPathAliases(FX_DIR);
    installRegistryResolver();

    scanDefineTokens(read(themePath), themePath);

    const consumerPath = writeFx("comp/Btn.tsx", `
      import { tokens } from "design";
      import { tl } from "traceless-style";
      const $ = tl.create({ btn: { color: tokens.brand.primary } });
    `);
    const out = transform(read(consumerPath), consumerPath);
    expect(out.errors).toEqual([]);
    expect(globalRegistry.getAll().find(r => r.prop === "color")!.value)
      .toBe(`var(--${tokenVarName("brand-primary")})`);
  });
});
