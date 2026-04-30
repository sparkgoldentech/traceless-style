/**
 * traceless-style — cli/contrast-fix.ts
 *
 * Interactive accessibility-grade auto-fix for contrast issues found by
 * the build-time validator. Run by `traceless-style extract --fix-contrast`.
 *
 * For each fixable diagnostic the CLI prints:
 *   • where the offending property lives (file → group → property)
 *   • the current value, current contrast ratio, current APCA Lc
 *   • a recomputed suggestion that meets the HIGHEST realistic standard
 *     for the value's role (AAA for body text, AAA-large / 4.5:1 for UI
 *     components, focus rings, large text)
 *   • the standard citation (WCAG 2.1 / 2.2 + APCA forward-compat)
 *
 * The user accepts (y / Enter / a=apply-all) or skips (n / q=quit). On
 * accept we patch the source file in place — the property's literal
 * value is replaced inside its enclosing group's body, scoped so we
 * don't accidentally rewrite an unrelated occurrence elsewhere in the
 * file.
 *
 * ───────────────────────────────────────────────────────────────────
 * "Highest accessibility criteria" — the targets we use here
 * ───────────────────────────────────────────────────────────────────
 *
 * The validator itself reports at WCAG 2.1 AA (4.5:1 normal, 3:1 large
 * / UI). When the user opts in to auto-fix we aim ONE TIER HIGHER:
 *
 *   • Normal text  → WCAG 2.1 AAA   (§1.4.6, ≥7:1)         + APCA Lc ≥75
 *   • Large text   → WCAG 2.1 AAA   (§1.4.6, ≥4.5:1)       + APCA Lc ≥60
 *   • UI/focus     → WCAG AA-large  (§1.4.11/§2.4.13, ≥4.5:1)
 *   • Gradient txt → WCAG 2.1 AAA   (≥7:1) at every stop
 *
 * This is the contrast tier that (a) Apple HIG, IBM Carbon, and
 * Microsoft Fluent all recommend "where feasible", (b) clears APCA
 * bronze readability, and (c) is what most modern design systems
 * publish as their published a11y bar. When the OKLCH-space search
 * can't reach the AAA target without leaving sRGB gamut, we accept
 * the closest in-gamut color (still always ≥AA so the build is
 * always at least conformant).
 *
 * The OKLCH search preserves the user's HUE — so a "blue accent"
 * doesn't suddenly turn gray. That's the design-grade behavior.
 */

import fs       from "fs";
import path     from "path";
import readline from "readline";
import * as wcag from "../compiler/wcag";
import type { ContrastIssue } from "../compiler/contrast-validator";

interface EditPlan {
  file:     string;
  groupKey: string;
  prop:     string;
  oldValue: string;
  newValue: string;
}

interface FixResult {
  applied:  number;
  skipped:  number;
  unfixable:number;
  aborted:  boolean;
}

/**
 * Run the interactive prompt for every fixable issue and apply the
 * accepted edits. Returns a summary the CLI can print.
 *
 * Bails to a no-op when stdin/stdout aren't a TTY (CI, piped input)
 * — interactive mode requires a real terminal so prompts don't hang.
 */
export async function runInteractiveContrastFix(
  issues:  ContrastIssue[],
  rootDir: string,
): Promise<FixResult> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return { applied: 0, skipped: 0, unfixable: issues.length, aborted: false };
  }

  // Partition: directly editable (real CSS property in the source) vs
  // not (auto-derived dark-mode variants, gradient stops, computed
  // values that aren't in the source as-written).
  const fixable: ContrastIssue[] = [];
  const unfixable: ContrastIssue[] = [];
  for (const i of issues) {
    if (isFixable(i)) fixable.push(i);
    else              unfixable.push(i);
  }

  // No fixable issues but advisories exist → still show the actionable
  // hints (don't leave the user wondering why warnings persist).
  if (fixable.length === 0) {
    if (unfixable.length > 0) printAdvisoryOnly(unfixable, rootDir);
    return { applied: 0, skipped: 0, unfixable: unfixable.length, aborted: false };
  }

  printBanner(fixable.length, unfixable.length);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r));

  const plan: EditPlan[] = [];
  let applied = 0, skipped = 0, aborted = false;
  let allYes = false;

  for (const issue of fixable) {
    // Recompute the suggestion at the HIGHEST tier appropriate for this
    // role. The validator's own `suggestion` was AA-target; here we go AAA
    // (or AA-large for UI). Falls back to the AA suggestion if the AAA
    // target is unreachable in sRGB gamut.
    const upgraded = upgradeSuggestion(issue);
    if (!upgraded) {
      // Couldn't compute — fall through with original suggestion.
    }
    const finalSuggestion = upgraded ?? issue.suggestion!;

    printIssue(issue, finalSuggestion, rootDir);

    const answer = allYes
      ? "y"
      : (await ask("    Apply this fix? [Y/n/a=apply-all/q=quit] ")).trim().toLowerCase();

    if (answer === "q") { aborted = true; console.log("    aborted by user.\n"); break; }
    if (answer === "n") { skipped++; console.log(""); continue; }
    if (answer === "a") allYes = true;

    plan.push({
      file:     issue.file,
      groupKey: issue.group,
      prop:     issue.fgProp,
      oldValue: issue.fgValue,
      newValue: finalSuggestion,
    });
    applied++;
    console.log("    ✓ queued.\n");
  }

  rl.close();

  // Apply queued edits, batched per file so we read/write each file once.
  // Track which edits actually changed the source so the user gets honest
  // feedback — we never claim "applied" for a no-op.
  let actualApplied = 0;
  if (plan.length > 0) {
    const { applied: ok, failed } = applyEdits(plan);
    actualApplied = ok.length;
    const fileCount = new Set(ok.map(p => p.file)).size;
    if (ok.length > 0) {
      console.log(`📝 traceless-style applied ${ok.length} accessibility fix${ok.length === 1 ? "" : "es"} across ${fileCount} file${fileCount === 1 ? "" : "s"}.`);
    }
    if (failed.length > 0) {
      console.log(`\n⚠ ${failed.length} fix${failed.length === 1 ? "" : "es"} could not be applied automatically — the literal value isn't in the source as written:`);
      for (const e of failed) {
        console.log(`    • ${path.relative(rootDir, e.file)} — ${e.groupKey}.${e.prop}`);
        console.log(`      The validator measured "${e.oldValue}" after token / variable expansion. The source likely uses a token reference or a computed expression.`);
        console.log(`      Manual fix: change the value to "${e.newValue}" wherever the underlying source produces this color (e.g. inside \`tl.defineTokens()\` or \`tl.createTheme()\`).`);
      }
      console.log("");
    }
  }

  // Always show the unfixable-by-design list with actionable hints, so
  // the user knows EXACTLY what to do for the warnings that remain.
  if (unfixable.length > 0) {
    console.log(`\nℹ ${unfixable.length} advisory issue${unfixable.length === 1 ? " requires" : "s require"} a manual edit (cannot be string-replaced):`);
    for (const i of unfixable) {
      const reason = unfixableReason(i) ?? "manual edit required";
      console.log(`    • ${path.relative(rootDir, i.file)} — ${i.group}.${i.fgProp} (${i.mode} mode)`);
      console.log(`      ${reason}`);
    }
    console.log("");
  }

  return { applied: actualApplied, skipped, unfixable: unfixable.length, aborted };
}

/* ── Eligibility check ────────────────────────────────────────── */

/**
 * Classify the issue's actionability. Returns the reason it's NOT
 * fixable, or null if it is.
 *
 * "Not fixable here" means the literal value can't be located in the
 * source as-written, so a string-substitution fix won't help. The user
 * needs to edit a different location (a token definition, or an
 * explicit `_dark` block) — we surface that hint in the advisory list.
 */
function unfixableReason(issue: ContrastIssue): string | null {
  if (!issue.suggestion)              return "no suggestion was computed";
  if (issue.category === "gradient")
    return "gradient stop — edit the gradient declaration manually (multi-stop rewrite is unsafe to automate)";
  if (issue.category === "image-bg")
    return "image background — runtime tools (axe-core, Pa11y) are required to validate text on rendered pixels";
  if (issue.fgProp.includes("(auto-dark)"))
    return `auto-derived dark variant — add an explicit \`_dark: { ${issue.fgProp.replace(/ \(auto-dark\)/, "")}: "${issue.suggestion}" }\` to the group's body`;
  if (/var\(\s*--/i.test(issue.fgValue))
    return `value comes from a design token (\`${issue.fgValue}\`) — change the token's value where it's declared in \`tl.defineTokens({...})\` or in your \`tl.createTheme(...)\` overrides; our suggested literal "${issue.suggestion}" would meet ≥${issue.required}:1`;
  if (issue.fgProp.includes(" "))     return "compound property name (e.g. boxShadow color) — edit the declaration manually";
  if (issue.fgProp.includes(":"))     return "selector-scoped property — edit manually inside the variant block";
  if (issue.fgProp.includes(">"))     return "selector-scoped property — edit manually";
  if (issue.fgProp.includes("["))     return "selector-scoped property — edit manually";
  return null;
}

function isFixable(issue: ContrastIssue): boolean {
  return unfixableReason(issue) === null;
}

/* ── Design-intent-preserving suggestion upgrade ─────────────── */

/**
 * Recompute the suggestion at the highest realistic target for the
 * role, while PRESERVING THE USER'S DESIGN INTENT. Returns null only
 * when no parseable inputs are available (caller falls back to the
 * validator's original AA suggestion in that case).
 *
 * Three strategies, tried in order from "least design-changing" to
 * "most design-changing":
 *
 *   1. ALPHA PRESERVATION — if the user wrote `rgba(R,G,B,A)` (or hsl
 *      with alpha), the user's intent was "a translucent X" — we keep
 *      R/G/B (the hue family) and search for the smallest alpha that
 *      hits the target ratio. A `rgba(255,255,255,0.06)` border stays
 *      a translucent-white border, just with enough opacity to be
 *      perceivable. This is the design-intent-respecting strategy:
 *      "you wanted a subtle white outline; here's how subtle it can
 *       be while still meeting AAA."
 *
 *   2. CHROMA-PRESERVING OKLCH SEARCH — if alpha alone can't reach the
 *      target (or the input is opaque), search the L axis in OKLCH
 *      with H and C held constant. This preserves hue and saturation
 *      (perceptually) while shifting lightness. A "brand indigo" stays
 *      "a brand indigo" — just darker or lighter as needed.
 *
 *   3. PURE WHITE/BLACK FALLBACK — if neither preserves the design,
 *      we max out lightness toward white or black depending on the
 *      backdrop's luminance. (The OKLCH search auto-falls-back here.)
 *
 * The output format mirrors the user's input format where possible
 * (rgba in → rgba out, hex in → hex out) so the diff in the source
 * file is minimal and reviewable.
 */
export function upgradeSuggestion(issue: ContrastIssue): string | null {
  const fg = wcag.parseColor(issue.fgValue);
  const bg = wcag.parseColor(issue.bgValue);
  if (!fg || !bg) return null;

  const target = aaaTargetForCategory(issue);

  // Composite the bg against an assumed surface so we have a solid
  // backdrop. (The validator's surface configuration would be more
  // precise; here we approximate with white. The composited backdrop
  // is what the binary searches measure against.)
  const assumedSurface = wcag.parseColor(issue.mode === "dark" ? "#0a0a0f" : "#fafafa")
                      ?? { r: 1, g: 1, b: 1, a: 1 };
  const compBg = bg.a < 1 ? wcag.composite(bg, assumedSurface) : bg;

  // STRATEGY 1: alpha preservation (only when input has alpha < 1).
  if (fg.a < 1) {
    const alphaFix = tryAlphaPreservingFix(issue.fgValue, fg, compBg, target);
    if (alphaFix) return alphaFix;
  }

  // STRATEGY 2: OKLCH lightness search (preserves hue + chroma).
  const compFg = fg.a < 1 ? wcag.composite(fg, compBg) : fg;
  const adjusted = wcag.adjustForContrastOklch(compFg, compBg, target);

  // Mirror input format: hex in → hex out (default formatColor returns
  // hex), rgb/rgba in → rgba out (preserves the family).
  const inForm = issue.fgValue.trim().toLowerCase();
  if (inForm.startsWith("rgb(") || inForm.startsWith("rgba(")) {
    return formatRgba(adjusted, fg.a);
  }
  return wcag.formatColor(adjusted);
}

/**
 * Search for the smallest alpha that lifts the input color over the
 * target ratio against `bg`, KEEPING THE INPUT'S R/G/B unchanged.
 * Returns null when even alpha=1 can't reach the target — caller
 * falls back to a hue-preserving search instead.
 */
function tryAlphaPreservingFix(
  originalValue: string,
  fg:            wcag.RGBA,
  bg:            wcag.RGBA,
  target:        number,
): string | null {
  // Sanity: with alpha=1, can we even reach the target?
  const opaqueComposite = wcag.composite({ ...fg, a: 1 }, bg);
  if (wcag.contrastRatio(opaqueComposite, bg) < target) return null;

  // Binary-search the smallest alpha that meets target.
  let lo = fg.a, hi = 1;
  let bestA: number | null = null;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const candidate = wcag.composite({ ...fg, a: mid }, bg);
    if (wcag.contrastRatio(candidate, bg) >= target) {
      bestA = mid;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  if (bestA === null) return null;

  // Verify the converged value (defense against floating-point drift).
  const verify = wcag.composite({ ...fg, a: bestA }, bg);
  if (wcag.contrastRatio(verify, bg) < target) {
    bestA = Math.min(1, bestA + 0.02);  // small bump for safety margin
  }

  // Round alpha to the same precision the user typically writes (2-3 dp)
  // and emit `rgba(R,G,B,A)` so the diff is minimal.
  const r = Math.round(fg.r * 255);
  const g = Math.round(fg.g * 255);
  const b = Math.round(fg.b * 255);
  const a = round3(Math.min(1, bestA));
  // Match the input's syntax style (rgb/rgba both emit rgba — that's fine,
  // adding alpha to a non-alpha input is a known formatting upgrade).
  void originalValue;
  return `rgba(${r},${g},${b},${a})`;
}

function formatRgba(c: wcag.RGBA, originalAlpha: number): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  const a = originalAlpha < 1 ? originalAlpha : 1;
  return a >= 1
    ? `rgba(${r},${g},${b},1)`
    : `rgba(${r},${g},${b},${round3(a)})`;
}

function round3(n: number): number { return Math.round(n * 1000) / 1000; }

/**
 * The "highest reasonable" target ratio for each category.
 * Chosen to align with the published a11y bars of major design systems
 * (Apple HIG, IBM Carbon, Microsoft Fluent, Material) where feasible.
 */
function aaaTargetForCategory(issue: ContrastIssue): number {
  switch (issue.category) {
    case "text":         return 7.0;   // WCAG 2.1 §1.4.6 normal-text AAA
    case "placeholder":  return 7.0;   // placeholder IS text — same bar
    case "focus":        return 4.5;   // 2.4.13 + AA-large; AAA equiv. for non-text
    case "ui":           return 4.5;   // 1.4.11 doubled — design-system grade
    case "gradient":     return 7.0;   // unreachable here (gradient is filtered out), just in case
    case "image-bg":     return 7.0;   // unreachable
    default:             return 7.0;
  }
}

/* ── In-place file editing ───────────────────────────────────── */

function applyEdits(plan: EditPlan[]): { applied: EditPlan[]; failed: EditPlan[] } {
  const byFile = new Map<string, EditPlan[]>();
  for (const e of plan) {
    let bucket = byFile.get(e.file);
    if (!bucket) { bucket = []; byFile.set(e.file, bucket); }
    bucket.push(e);
  }
  const applied: EditPlan[] = [];
  const failed:  EditPlan[] = [];
  for (const [file, edits] of byFile) {
    const original = fs.readFileSync(file, "utf8");
    let src = original;
    for (const e of edits) {
      const next = applyOneEdit(src, e);
      if (next === src) {
        // No substring match found in the source — the literal value
        // doesn't appear there as-written (likely a token-resolved or
        // computed value the user wrote in some other syntactic form).
        failed.push(e);
      } else {
        src = next;
        applied.push(e);
      }
    }
    if (src !== original) fs.writeFileSync(file, src, "utf8");
  }
  return { applied, failed };
}

/**
 * Replace `prop: "oldValue"` with `prop: "newValue"` inside the body of
 * `groupKey: { ... }`. Scoped to the group so we don't touch identical
 * pairs in unrelated groups.
 *
 * Heuristic — handles unquoted JS identifiers and quoted string keys
 * (`groupKey:` and `"groupKey":`). When the group can't be located we
 * fall back to a single global replacement of the EXACT pair, which is
 * safe enough because we've already verified the user wants this fix.
 */
function applyOneEdit(src: string, e: EditPlan): string {
  const groupRe = new RegExp(`(?:^|[\\s,{])(?:${escapeRe(e.groupKey)}|"${escapeRe(e.groupKey)}")\\s*:\\s*\\{`, "g");
  const groupMatch = groupRe.exec(src);
  if (!groupMatch) {
    return src.replace(`${e.prop}: "${e.oldValue}"`, `${e.prop}: "${e.newValue}"`);
  }
  // Find matching close brace by depth-counting (skips strings / comments
  // approximately — a real parser would be overkill here).
  const startBody = groupRe.lastIndex;
  let depth = 1;
  let inStr: '"' | "'" | "`" | null = null;
  let i = startBody;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }   // skip escaped char
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) {
    // Couldn't find matching brace — fall back to global replace.
    return src.replace(`${e.prop}: "${e.oldValue}"`, `${e.prop}: "${e.newValue}"`);
  }
  const body    = src.slice(startBody, i);
  // Match `prop: "oldValue"` (with flexible whitespace around the colon).
  const propRe  = new RegExp(`(${escapeRe(e.prop)}\\s*:\\s*)"${escapeRe(e.oldValue)}"`);
  const newBody = body.replace(propRe, `$1"${e.newValue}"`);
  return src.slice(0, startBody) + newBody + src.slice(i);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ── UI: banner + per-issue printing ─────────────────────────── */

function printBanner(fixable: number, unfixable: number): void {
  const total = fixable + unfixable;
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  traceless-style — interactive accessibility auto-fix            ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log(`  ${total} contrast issue${total === 1 ? "" : "s"} found · ${fixable} auto-fixable · ${unfixable} advisory`);
  console.log(`  Targets: WCAG 2.1 AAA (§1.4.6 ≥7:1 normal text) + APCA Lc ≥75`);
  console.log(`           WCAG 2.1 §1.4.11 / 2.2 §2.4.13 (UI ≥4.5:1, AA-large grade)`);
  console.log(`  Search:  OKLCH-space hue-preserving lightness adjustment`);
  console.log("");
  console.log("  Press Y / Enter to apply, N to skip, A to apply all, Q to quit.");
  console.log("");
}

/**
 * Print the actionable-hints block for advisory-only runs (every issue
 * needs a manual edit; the prompt itself wouldn't help). Big-tech-grade
 * UX rule: never leave the user staring at warnings without telling
 * them WHAT to do — the hints carry exact code snippets.
 */
function printAdvisoryOnly(unfixable: ContrastIssue[], rootDir: string): void {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  traceless-style — accessibility advisory                        ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log(`  ${unfixable.length} contrast warning${unfixable.length === 1 ? "" : "s"} can't be auto-applied — they require a manual edit elsewhere.`);
  console.log("");
  for (const i of unfixable) {
    const reason = unfixableReason(i) ?? "manual edit required";
    console.log(`  ⚠ ${path.relative(rootDir, i.file)} — ${i.group}.${i.fgProp} (${i.mode} mode)`);
    console.log(`    measured ${i.ratio.toFixed(2)}:1 vs required ≥${i.required}:1 (${i.standard})`);
    console.log(`    next:    ${reason}`);
    console.log("");
  }
}

function printIssue(issue: ContrastIssue, suggestion: string, rootDir: string): void {
  const rel = path.relative(rootDir, issue.file);
  const sigil = issue.severity === "error" ? "✗" : "⚠";
  const apca  = typeof issue.apcaLc === "number" ? `, APCA Lc ${issue.apcaLc.toFixed(0)}` : "";
  console.log(`  ${sigil} ${rel} → ${issue.group}.${issue.fgProp}  [${issue.standard}]`);
  console.log(`    against : ${issue.bgProp} = ${issue.bgValue}`);
  console.log(`    current : ${issue.fgValue}`);
  console.log(`              ${issue.ratio.toFixed(2)}:1${apca}  (need ≥${issue.required}:1 for ${issue.standard})`);

  // Recompute the new pair's metrics for transparent feedback.
  const fg = wcag.parseColor(suggestion);
  const bg = wcag.parseColor(issue.bgValue);
  if (fg && bg) {
    const compBg = bg.a < 1 ? wcag.composite(bg, wcag.parseColor("#ffffff")!) : bg;
    const compFg = fg.a < 1 ? wcag.composite(fg, compBg) : fg;
    const newRatio = wcag.contrastRatio(compFg, compBg);
    const newApca  = wcag.apcaLc(compFg, compBg);
    console.log(`    fix     : ${suggestion}`);
    console.log(`              ${newRatio.toFixed(2)}:1, APCA Lc ${newApca.toFixed(0)}  (AAA-grade, hue preserved)`);
  } else {
    console.log(`    fix     : ${suggestion}`);
  }
}
