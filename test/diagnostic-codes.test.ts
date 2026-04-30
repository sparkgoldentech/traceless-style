/**
 * Diagnostic-codes registry + emitter wiring tests.
 *
 * The codes are the contract every traceless-style diagnostic carries —
 * users grep CI output for them, write code-aware suppression directives,
 * and click through to docs URLs. Anything that breaks the contract
 * (renaming a code, dropping the docs URL, mis-attaching a code) breaks
 * downstream tooling, so we lock the shape down here.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  DIAGNOSTICS,
  findByCode,
  allDiagnostics,
} from "../src/compiler/diagnostic-codes";
import { lint, formatLintErrors, DEFAULT_LINT_OPTIONS } from "../src/compiler/lint";
import {
  validateGroupContrast,
  formatContrastIssues,
  DEFAULT_CONTRAST_OPTIONS,
} from "../src/compiler/contrast-validator";
import { transform, globalRegistry } from "../src/compiler/extractor";
import { tokenRegistry } from "../src/compiler/tokens";

describe("diagnostic codes registry", () => {
  it("every entry has a TLS#### code, severity, title, description, docsUrl", () => {
    for (const d of allDiagnostics()) {
      expect(d.code).toMatch(/^TLS\d{4}$/);
      expect(["error", "warning", "info"]).toContain(d.severity);
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(20);
      expect(d.docsUrl).toMatch(/^https:\/\/.+#tls\d{4}$/);
    }
  });

  it("codes are unique across the registry", () => {
    const seen = new Set<string>();
    for (const d of allDiagnostics()) {
      expect(seen.has(d.code), `duplicate code ${d.code}`).toBe(false);
      seen.add(d.code);
    }
  });

  it("findByCode returns the entry for a known code", () => {
    expect(findByCode("TLS0101")?.title).toMatch(/Unknown CSS property/);
    expect(findByCode("TLS9999")).toBeNull();
  });
});

describe("lint emitters attach TLS codes", () => {
  it("no-tailwind emits TLS0404", () => {
    const errors = lint(
      `export default () => <div className="flex p-4" />;`,
      "/v/X.tsx",
      DEFAULT_LINT_OPTIONS
    );
    const tw = errors.find(e => e.rule === "no-tailwind");
    expect(tw).toBeTruthy();
    // Either tlsCode is attached at the source, OR the formatter
    // backfills it from the rule slug — both shapes are accepted as long
    // as the FORMATTED output contains the TLS#### code.
    const formatted = formatLintErrors(errors, "/v");
    expect(formatted).toContain(DIAGNOSTICS.LINT_TAILWIND.code);
    expect(formatted).toContain("docs:");
    expect(formatted).toContain(DIAGNOSTICS.LINT_TAILWIND.docsUrl);
  });

  it("no-inline-styles emits TLS0401", () => {
    const errors = lint(
      `export default () => <div style={{ padding: 4 }} />;`,
      "/v/X.tsx",
      DEFAULT_LINT_OPTIONS
    );
    const formatted = formatLintErrors(errors, "/v");
    expect(formatted).toContain(DIAGNOSTICS.LINT_INLINE_STYLE.code);
  });

  it("no-class-string emits TLS0402", () => {
    const errors = lint(
      `export default () => <div className="some-class" />;`,
      "/v/X.tsx",
      DEFAULT_LINT_OPTIONS
    );
    const formatted = formatLintErrors(errors, "/v");
    expect(formatted).toContain(DIAGNOSTICS.LINT_CLASS_STRING.code);
  });

  it("no-css-modules emits TLS0403", () => {
    const errors = lint(
      `import s from "./x.module.css"; export default () => <div className={s.x} />;`,
      "/v/X.tsx",
      DEFAULT_LINT_OPTIONS
    );
    const formatted = formatLintErrors(errors, "/v");
    expect(formatted).toContain(DIAGNOSTICS.LINT_CSS_MODULES.code);
  });
});

describe("property-allowlist errors carry TLS0101", () => {
  beforeEach(() => globalRegistry.clear());
  it("Unknown CSS property error has tlsCode + docsUrl", () => {
    const result = transform(
      `import { tl } from "traceless-style";\nconst $ = tl.create({ btn: { colour: "red" } });`,
      "/v/Typo.tsx"
    );
    const e = result.errors.find(x => x.message.includes("colour"));
    expect(e).toBeTruthy();
    expect(e!.tlsCode).toBe(DIAGNOSTICS.PROP_UNKNOWN.code);
    expect(e!.docsUrl).toBe(DIAGNOSTICS.PROP_UNKNOWN.docsUrl);
  });

  it("Unknown variant error has tlsCode TLS0201", () => {
    const result = transform(
      `import { tl } from "traceless-style";\nconst $ = tl.create({ btn: { color: "red", _zogus: { color: "blue" } } });`,
      "/v/V.tsx"
    );
    const e = result.errors.find(x => x.message.includes("_zogus"));
    expect(e).toBeTruthy();
    expect(e!.tlsCode).toBe(DIAGNOSTICS.VARIANT_UNKNOWN.code);
  });

  it("background shorthand + clip:text emits TLS0103", () => {
    const result = transform(
      `import { tl } from "traceless-style";\nconst $ = tl.create({ hero: { background: "linear-gradient(120deg,#000,#fff)", backgroundClip: "text", color: "transparent" } });`,
      "/v/H.tsx"
    );
    const e = result.errors.find(x => x.message.includes("background-clip"));
    expect(e).toBeTruthy();
    expect(e!.tlsCode).toBe(DIAGNOSTICS.PROP_BG_CLIP_TEXT_CONFLICT.code);
  });
});

describe("contrast validator output carries TLS5xx codes", () => {
  beforeEach(() => { globalRegistry.clear(); tokenRegistry.clear(); });

  it("text contrast failure surfaces TLS0501 in formatted output", () => {
    const issues = validateGroupContrast(
      { color: "#bbbbbb", backgroundColor: "#dddddd" } as any,
      "x",
      "/v/X.tsx",
      DEFAULT_CONTRAST_OPTIONS
    );
    expect(issues.length).toBeGreaterThan(0);
    const formatted = formatContrastIssues(issues);
    expect(formatted).toContain(DIAGNOSTICS.CONTRAST_TEXT_AA.code);
    expect(formatted).toContain("docs:");
    expect(formatted).toContain(DIAGNOSTICS.CONTRAST_TEXT_AA.docsUrl);
  });

  it("UI contrast failure surfaces TLS0503", () => {
    const issues = validateGroupContrast(
      { backgroundColor: "#ffffff", borderColor: "#fafafa" } as any,
      "card",
      "/v/X.tsx",
      DEFAULT_CONTRAST_OPTIONS
    );
    const formatted = formatContrastIssues(issues);
    expect(formatted).toContain(DIAGNOSTICS.CONTRAST_UI.code);
  });

  it("focus indicator failure surfaces TLS0504", () => {
    const issues = validateGroupContrast(
      { backgroundColor: "#ffffff", outlineColor: "#fafafa" } as any,
      "input",
      "/v/X.tsx",
      DEFAULT_CONTRAST_OPTIONS
    );
    const formatted = formatContrastIssues(issues);
    expect(formatted).toContain(DIAGNOSTICS.CONTRAST_FOCUS.code);
  });

  it("image-bg advisory surfaces TLS0506", () => {
    const issues = validateGroupContrast(
      { color: "#000", backgroundImage: "url(/x.jpg)" } as any,
      "hero",
      "/v/X.tsx",
      DEFAULT_CONTRAST_OPTIONS
    );
    const formatted = formatContrastIssues(issues);
    expect(formatted).toContain(DIAGNOSTICS.CONTRAST_IMAGE_BG.code);
  });
});
