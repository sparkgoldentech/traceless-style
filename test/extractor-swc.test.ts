import { describe, expect, it, beforeEach } from "vitest";
import * as legacy from "../src/compiler/extractor";
import { createSwcExtractor } from "../src/compiler/extractor-swc";
import { globalRegistry, processStyles } from "../src/compiler/extractor";
import { mergeVariants, DEFAULT_VARIANTS } from "../src/compiler/variants";

const swcExt = createSwcExtractor({
  processStyles,
  globalRegistry,
  mergeVariants,
  DEFAULT_VARIANTS,
});

/**
 * Equivalence tests: legacy and SWC extractors must produce identical
 * outputs for valid input. This is the migration safety net — if these
 * pass, the SWC extractor is a drop-in replacement for valid code.
 */

interface Fixture {
  name: string;
  file: string;
  src:  string;
}

const FIXTURES: Fixture[] = [
  {
    name: "single tl.create with one rule",
    file: "/virtual/Button.tsx",
    src:  `import { tl } from "traceless-style";
const $ = tl.create({ btn: { display: "flex" } });
export default function Btn() { return <div className={$.btn} />; }`,
  },
  {
    name: "tl.create with pseudo variant",
    file: "/virtual/Hover.tsx",
    src:  `import { tl } from "traceless-style";
const $ = tl.create({
  link: {
    color: "blue",
    _hover: { color: "red", textDecoration: "underline" },
  },
});`,
  },
  {
    name: "tl.create with media variant",
    file: "/virtual/Responsive.tsx",
    src:  `import { tl } from "traceless-style";
const $ = tl.create({
  card: {
    padding: "1rem",
    md: { padding: "2rem" },
    lg: { padding: "3rem" },
  },
});`,
  },
  {
    name: "tl.create with multiple keys",
    file: "/virtual/Multi.tsx",
    src:  `import { tl } from "traceless-style";
const $ = tl.create({
  btn:  { display: "flex", color: "white" },
  link: { color: "blue", textDecoration: "underline" },
  card: { padding: "1rem", borderRadius: "8px" },
});`,
  },
  {
    name: "tl.extend custom variant + tl.create using it",
    file: "/virtual/Extended.tsx",
    src:  `import { tl } from "traceless-style";
const ext = tl.extend({ variants: { _tablet: "@media (min-width: 900px)" } });
const $   = tl.create({
  hero: { fontSize: "1rem", _tablet: { fontSize: "2rem" } },
});`,
  },
  {
    name: "negative numeric value",
    file: "/virtual/Neg.tsx",
    src:  `import { tl } from "traceless-style";
const $ = tl.create({ x: { marginTop: -4, zIndex: -1 } });`,
  },
  {
    name: "string with special characters",
    file: "/virtual/Special.tsx",
    src:  `import { tl } from "traceless-style";
const $ = tl.create({
  card: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    transform: "translate(-50%, -50%)",
  },
});`,
  },
  {
    name: "no traceless-style usage at all",
    file: "/virtual/Empty.tsx",
    src:  `export const x = 1;\nfunction f() { return 2; }`,
  },
  {
    // Regression: SWC reports byte offsets into a CRLF-normalized buffer.
    // If we splice the original source with byte offsets used as char
    // indices, em-dashes (3-byte UTF-8) + CRLF combine to skip valid calls.
    name: "CRLF line endings with non-ASCII chars in comments",
    file: "/virtual/CrlfDash.tsx",
    src:  [
      "/**",
      " * Component — does the thing",
      " * Another — line",
      " */",
      `import { tl } from "traceless-style";`,
      `const $ = tl.create({ btn: { display: "flex", color: "red" } });`,
    ].join("\r\n"),
  },
];

function clearRegistry() {
  globalRegistry.clear();
}

describe("extractor-swc — equivalence with legacy extractor", () => {
  beforeEach(clearRegistry);

  for (const fx of FIXTURES) {
    it(`extractCustomVariants matches: ${fx.name}`, () => {
      clearRegistry();
      const a = legacy.extractCustomVariants(fx.src, fx.file);
      clearRegistry();
      const b = swcExt.extractCustomVariants(fx.src, fx.file);
      expect(b).toEqual(a);
    });

    it(`transform(code) matches: ${fx.name}`, () => {
      clearRegistry();
      const a = legacy.transform(fx.src, fx.file);
      clearRegistry();
      const b = swcExt.transform(fx.src, fx.file);
      // Compare modulo whitespace differences that don't affect JS semantics:
      //   - SWC normalizes CRLF→LF; legacy preserves CRLF.
      //   - Legacy's import-strip regex doesn't consume CRLF, so it can leave
      //     an extra blank line where SWC doesn't.
      // The JS itself must be identical.
      const norm = (s: string) =>
        s.replace(/\r\n?/g, "\n").replace(/\n{2,}/g, "\n");
      expect(norm(b.code)).toBe(norm(a.code));
      expect(b.changed).toBe(a.changed);
    });

    it(`registry class names match: ${fx.name}`, () => {
      clearRegistry();
      legacy.transform(fx.src, fx.file);
      const legacyRules = globalRegistry.getAll().map(r => r.cls).sort();

      clearRegistry();
      swcExt.transform(fx.src, fx.file);
      const swcRules = globalRegistry.getAll().map(r => r.cls).sort();

      expect(swcRules).toEqual(legacyRules);
    });
  }
});

describe("extractor-swc — safety", () => {
  beforeEach(clearRegistry);

  it("rejects spread inside tl.create()", () => {
    const src = `import { tl } from "traceless-style";
const base = { display: "flex" };
const $ = tl.create({ btn: { ...base, color: "red" } });`;
    const result = swcExt.transform(src, "/virtual/Spread.tsx");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/spread/i);
  });

  it("rejects variable identifier as value", () => {
    const src = `import { tl } from "traceless-style";
const myColor = "red";
const $ = tl.create({ btn: { color: myColor } });`;
    const result = swcExt.transform(src, "/virtual/Var.tsx");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/myColor/);
  });

  it("rejects template literal with ${...} expression", () => {
    const src = `import { tl } from "traceless-style";
const w = "1rem";
const $ = tl.create({ btn: { padding: \`\${w} 2rem\` } });`;
    const result = swcExt.transform(src, "/virtual/Tpl.tsx");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/template literal/i);
  });

  it("rejects computed property keys", () => {
    const src = `import { tl } from "traceless-style";
const k = "color";
const $ = tl.create({ btn: { [k]: "red" } });`;
    const result = swcExt.transform(src, "/virtual/Computed.tsx");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/computed/i);
  });

  it("accepts a fully-static template literal", () => {
    const src = `import { tl } from "traceless-style";
const $ = tl.create({ btn: { padding: \`1rem 2rem\` } });`;
    const result = swcExt.transform(src, "/virtual/StaticTpl.tsx");
    expect(result.errors.length).toBe(0);
    expect(result.changed).toBe(true);
  });

  it("reports line/col for errors (not 0,0)", () => {
    const src = `import { tl } from "traceless-style";
const c = "red";
const $ = tl.create({
  btn: {
    color: c
  }
});`;
    const result = swcExt.transform(src, "/virtual/Pos.tsx");
    expect(result.errors.length).toBeGreaterThan(0);
    // The offending identifier is on line 5 — non-zero line/col is the
    // observable quality improvement over the legacy parser.
    expect(result.errors[0].line).toBeGreaterThan(0);
    expect(result.errors[0].col).toBeGreaterThan(0);
  });
});
