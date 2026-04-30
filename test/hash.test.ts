import { describe, expect, it } from "vitest";
import { fnv32a, toKebab, classFor } from "../src/compiler/hash";

describe("fnv32a", () => {
  it("is deterministic for the same input", () => {
    expect(fnv32a("hello")).toBe(fnv32a("hello"));
    expect(fnv32a("")).toBe(fnv32a(""));
  });

  it("returns a base36 string of EXACTLY 8 characters", () => {
    for (const s of ["", "a", "hello", "background-color:red", "🔥 spark"]) {
      const out = fnv32a(s);
      expect(out).toMatch(/^[0-9a-z]{8}$/);
    }
  });

  it("collision-resistant across a 100K-rule sample (post-extension to 8 chars)", () => {
    // Birthday paradox: 36^8 ≈ 2.8T → 50% collision risk at √(2.8T) ≈ 1.6M.
    // 100K samples should collision-free with overwhelming probability.
    const seen = new Set<string>();
    for (let i = 0; i < 100_000; i++) {
      seen.add(fnv32a(`prop-${i % 280}:value-${i}`));
    }
    expect(seen.size).toBe(100_000);
  });

  it("produces different hashes for different inputs in our sample set", () => {
    const inputs = [
      "display:flex",
      "display:block",
      "color:red",
      "color:blue",
      "background-color:red",
      "background-color:red::hover",
    ];
    const hashes = new Set(inputs.map(fnv32a));
    expect(hashes.size).toBe(inputs.length);
  });

  it("handles unicode and long strings without throwing", () => {
    expect(() => fnv32a("a".repeat(10_000))).not.toThrow();
    expect(() => fnv32a("μέγεθος")).not.toThrow();
  });
});

describe("toKebab", () => {
  it("leaves already-kebab properties unchanged", () => {
    expect(toKebab("display")).toBe("display");
    expect(toKebab("z-index")).toBe("z-index");
  });

  it("converts camelCase to kebab-case", () => {
    expect(toKebab("backgroundColor")).toBe("background-color");
    expect(toKebab("borderTopLeftRadius")).toBe("border-top-left-radius");
  });

  it("prefixes lowercase vendor names with a leading dash", () => {
    expect(toKebab("webkitTransform")).toBe("-webkit-transform");
    expect(toKebab("mozAppearance")).toBe("-moz-appearance");
    expect(toKebab("msFilter")).toBe("-ms-filter");
  });

  it("handles PascalCase vendor names (leading capital already produces leading dash)", () => {
    // Leading `W` becomes `-w`, so the vendor-prefix rule does NOT match
    // and we get a single leading dash, not two.
    expect(toKebab("WebkitMaskImage")).toBe("-webkit-mask-image");
  });
});

describe("classFor", () => {
  it("prefixes the hash with 'tl'", () => {
    expect(classFor("display", "flex")).toMatch(/^tl[0-9a-z]+$/);
  });

  it("is deterministic", () => {
    expect(classFor("display", "flex")).toBe(classFor("display", "flex"));
  });

  it("produces distinct classes for different prop/value/selector combos", () => {
    const a = classFor("display", "flex");
    const b = classFor("display", "block");
    const c = classFor("color", "flex");
    const d = classFor("display", "flex", ":hover");
    const e = classFor("display", "flex", ":focus");

    const all = new Set([a, b, c, d, e]);
    expect(all.size).toBe(5);
  });

  it("treats absence of selector as different from any selector", () => {
    expect(classFor("display", "flex")).not.toBe(
      classFor("display", "flex", ":hover")
    );
  });
});
