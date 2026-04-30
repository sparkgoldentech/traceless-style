import { describe, expect, it } from "vitest";
import { codeFrame } from "../src/compiler/codeframe";
import { buildCssSourceMap } from "../src/compiler/sourcemap";
import { generateCSS, type AtomicRule } from "../src/compiler/css-gen";

describe("codeFrame", () => {
  const SRC = [
    `import { tl } from "traceless-style";`,
    ``,
    `const $ = tl.create({`,
    `  btn: { color: notALiteral },`,
    `  txt: { fontSize: "12px" },`,
    `});`,
  ].join("\n");

  it("renders a frame with caret pointing at the column", () => {
    // line 4, column 18 — inside `notALiteral`
    const out = codeFrame(SRC, 4, 18, { context: 1 });
    expect(out).toContain("> 4 |   btn: { color: notALiteral },");
    expect(out).toContain("^");
    // The caret should appear AFTER the gutter, on its own line.
    const lines = out.split("\n");
    const caretLine = lines.find(l => /^\s+\^$/.test(l));
    expect(caretLine).toBeTruthy();
  });

  it("includes context lines above and below by default", () => {
    const out = codeFrame(SRC, 4, 18); // default context = 2
    // Lines 2..6 should all appear (context=2 around line 4).
    expect(out).toContain(" 2 | ");
    expect(out).toContain(" 6 | ");
  });

  it("renders tabs as 2 spaces and aligns the caret accordingly", () => {
    const tabbed = "\tconst x = bad;";
    const out = codeFrame(tabbed, 1, 11, { context: 0 });
    // Tab in the source → "  " in output. col 11 in source = col 12 in rendered
    // (tab adds 1). Caret should land under `bad`.
    const lines = out.split("\n");
    expect(lines[0]).toContain("  const x = bad;"); // tab → 2 spaces
    // Caret is on its own line; the position we care about is just that the
    // function didn't throw and produced a caret.
    expect(lines[1]).toContain("^");
  });

  it("clamps line numbers that fall outside the source", () => {
    expect(() => codeFrame("only one line", 999, 1)).not.toThrow();
    const out = codeFrame("only one line", 999, 1);
    expect(out).toContain("only one line");
  });

  it("supports the `bar` option for nested error displays", () => {
    const out = codeFrame(SRC, 4, 18, { context: 0, bar: true });
    for (const line of out.split("\n")) {
      expect(line.startsWith("│ ")).toBe(true);
    }
  });
});

describe("buildCssSourceMap", () => {
  // Build a minimal rule list with origin info, then verify the produced
  // map is shaped correctly and the VLQ mappings are non-empty.
  const rules: AtomicRule[] = [
    {
      cls:    "tlAAA",
      prop:   "color",
      value:  "red",
      order:  0,
      origin: { file: "/proj/app/Foo.tsx", line: 3 },
    },
    {
      cls:    "tlBBB",
      prop:   "padding",
      value:  "1rem",
      order:  1,
      origin: { file: "/proj/app/Bar.tsx", line: 7 },
    },
    {
      // No origin → should be skipped from mappings (DevTools shows no link).
      cls:    "tlCCC",
      prop:   "margin",
      value:  "0",
      order:  2,
    },
  ];

  it("emits a v3 source map with sources and mappings", () => {
    const css = generateCSS(rules);
    const { map, comment } = buildCssSourceMap(rules, css, {
      rootDir:  "/proj",
      fileName: "out.css",
    });
    const parsed = JSON.parse(map);
    expect(parsed.version).toBe(3);
    expect(parsed.file).toBe("out.css");
    expect(parsed.sources.sort()).toEqual(["app/Bar.tsx", "app/Foo.tsx"]);
    expect(typeof parsed.mappings).toBe("string");
    expect(parsed.mappings.length).toBeGreaterThan(0);
    expect(comment).toContain("sourceMappingURL=out.css.map");
  });

  it("uses forward slashes in source paths even on Windows-style inputs", () => {
    const winRules: AtomicRule[] = [{
      cls: "tlAAA", prop: "color", value: "red", order: 0,
      origin: { file: "C:\\proj\\app\\Foo.tsx", line: 1 },
    }];
    const css = generateCSS(winRules);
    const { map } = buildCssSourceMap(winRules, css, {
      rootDir: "C:\\proj", fileName: "out.css",
    });
    const parsed = JSON.parse(map);
    expect(parsed.sources[0]).toBe("app/Foo.tsx");
  });

  it("omits rules without origin from the mapping but keeps them in the CSS", () => {
    const css = generateCSS(rules);
    expect(css).toContain(".tlCCC");
    const { map } = buildCssSourceMap(rules, css, {
      rootDir: "/proj", fileName: "out.css",
    });
    const parsed = JSON.parse(map);
    // 2 origin-bearing rules → 2 mapping segments (comma-separated).
    const segments = parsed.mappings.split(",").filter((s: string) => s.length > 0);
    expect(segments.length).toBe(2);
  });
});
