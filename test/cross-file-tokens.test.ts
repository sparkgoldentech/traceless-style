import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import {
  scanDefineTokens,
  parseFileImports,
  transform,
  globalRegistry,
} from "../src/compiler/extractor";
import {
  tokenRegistry,
  tokenExportRegistry,
  tokenVarName,
} from "../src/compiler/tokens";

const FX_DIR = path.resolve("test/.cross-file-fx");

function reset() {
  globalRegistry.clear();
  tokenRegistry.clear();
  tokenExportRegistry.clear();
}

function writeFx(rel: string, content: string): string {
  const full = path.join(FX_DIR, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

describe("cross-file token member access", () => {
  beforeEach(() => {
    reset();
    if (existsSync(FX_DIR)) rmSync(FX_DIR, { recursive: true, force: true });
    mkdirSync(FX_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(FX_DIR)) rmSync(FX_DIR, { recursive: true, force: true });
  });

  it("scanDefineTokens registers exported bindings only", () => {
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      export const tokens = tl.defineTokens({
        brand: { primary: "#3b82f6" },
      });
      const local = tl.defineTokens({ x: "1px" });   // not exported
    `);
    const src = require("node:fs").readFileSync(themePath, "utf8");
    scanDefineTokens(src, themePath);

    expect(tokenExportRegistry.resolve(themePath, "tokens")).toBeTruthy();
    expect(tokenExportRegistry.resolve(themePath, "local")).toBeUndefined();

    // The shape we got back has the var() string at the leaf.
    const shape = tokenExportRegistry.resolve(themePath, "tokens")!;
    expect((shape.brand as Record<string, unknown>).primary)
      .toBe(`var(--${tokenVarName("brand-primary")})`);
  });

  it("parseFileImports resolves named imports of known token exports", () => {
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      export const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
    `);
    scanDefineTokens(require("node:fs").readFileSync(themePath, "utf8"), themePath);

    const consumerPath = writeFx("Btn.tsx", `
      import { tokens } from "./theme";
      import { tl } from "traceless-style";
    `);
    const consumerSrc = require("node:fs").readFileSync(consumerPath, "utf8");
    const imported = parseFileImports(consumerSrc, consumerPath);

    expect(imported.has("tokens")).toBe(true);
  });

  it("parseFileImports respects `as` aliases", () => {
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      export const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
    `);
    scanDefineTokens(require("node:fs").readFileSync(themePath, "utf8"), themePath);

    const consumerPath = writeFx("Btn.tsx", `
      import { tokens as t } from "./theme";
    `);
    const imported = parseFileImports(require("node:fs").readFileSync(consumerPath, "utf8"), consumerPath);

    expect(imported.has("t")).toBe(true);          // local alias
    expect(imported.has("tokens")).toBe(false);    // not the original name
  });

  it("transform expands cross-file `tokens.brand.primary` in tl.create", () => {
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      export const tokens = tl.defineTokens({
        brand: { primary: "#3b82f6", muted: "#94a3b8" },
        spacing: { md: "1rem" },
      });
    `);
    scanDefineTokens(require("node:fs").readFileSync(themePath, "utf8"), themePath);

    const consumerPath = writeFx("Btn.tsx", `
      import { tokens } from "./theme";
      import { tl } from "traceless-style";
      const $ = tl.create({
        btn: {
          color: tokens.brand.primary,
          padding: tokens.spacing.md,
        },
      });
    `);
    const out = transform(require("node:fs").readFileSync(consumerPath, "utf8"), consumerPath);
    expect(out.errors).toEqual([]);
    expect(out.changed).toBe(true);

    // The atomic rule for `color` should reference the brand-primary var.
    const colorRule = globalRegistry.getAll().find(r => r.prop === "color");
    expect(colorRule).toBeTruthy();
    expect(colorRule!.value).toBe(`var(--${tokenVarName("brand-primary")})`);

    const padRule = globalRegistry.getAll().find(r => r.prop === "padding");
    expect(padRule).toBeTruthy();
    expect(padRule!.value).toBe(`var(--${tokenVarName("spacing-md")})`);
  });

  it("leaves unresolved member access alone (graceful fallback)", () => {
    // tokens isn't imported from a known defineTokens file → should fall
    // through and trigger the existing identifier-rejection error rather
    // than silently misinterpret. Tests the safety boundary.
    const consumerPath = writeFx("Btn.tsx", `
      import { tokens } from "./mystery";
      import { tl } from "traceless-style";
      const $ = tl.create({
        btn: { color: tokens.unknown.path },
      });
    `);
    const out = transform(require("node:fs").readFileSync(consumerPath, "utf8"), consumerPath);
    // The parser should reject `tokens` as an identifier value — strict mode.
    expect(out.errors.length).toBeGreaterThan(0);
  });

  it("does not rewrite member access outside tl.create()", () => {
    const themePath = writeFx("theme.ts", `
      import { tl } from "traceless-style";
      export const tokens = tl.defineTokens({ brand: { primary: "#3b82f6" } });
    `);
    scanDefineTokens(require("node:fs").readFileSync(themePath, "utf8"), themePath);

    const consumerPath = writeFx("Btn.tsx", `
      import { tokens } from "./theme";
      import { tl } from "traceless-style";
      console.log(tokens.brand.primary);   // outside tl.create — stay verbatim
      const $ = tl.create({
        btn: { color: tokens.brand.primary },
      });
    `);
    const out = transform(require("node:fs").readFileSync(consumerPath, "utf8"), consumerPath);

    // The `console.log` call should still mention `tokens.brand.primary`
    // because we only rewrite inside tl.create() arg bodies.
    expect(out.code).toContain("console.log(tokens.brand.primary)");
  });

  it("skips imports whose specifier doesn't resolve to a registered file", () => {
    // ./theme isn't created as a fixture, so resolveImport returns null
    // and parseFileImports yields an empty map. (Star + default imports
    // ARE supported when the target file has known exports — covered in
    // test/import-resolution.test.ts.)
    const consumerPath = writeFx("Btn.tsx", `
      import * as Theme from "./theme";
      import Default from "./theme";
    `);
    const imported = parseFileImports(require("node:fs").readFileSync(consumerPath, "utf8"), consumerPath);
    expect(imported.size).toBe(0);
  });
});
