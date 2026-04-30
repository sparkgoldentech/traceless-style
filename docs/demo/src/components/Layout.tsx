/**
 * Layout — responsive grid + group hover patterns.
 *
 * Demonstrates:
 *   • Mobile-first responsive grid (1 → 2 → 3 → 4 cols across breakpoints)
 *   • _groupHover (parent state styling)
 *   • Custom variant _tablet (defined in src/variants.ts)
 *   • Logical properties (paddingInline, paddingBlock) — inherently RTL-safe
 */
import { tl } from "traceless-style";
import { tokens } from "../theme/tokens";

const $ = tl.create({
  page: {
    minHeight:      "100vh",
    background:     tokens.surface.muted,
    color:          tokens.text.default,
    fontFamily:     tokens.font.sans,
  },
  container: {
    maxWidth:       "1200px",
    marginInline:   "auto",
    paddingInline:  tokens.spacing.lg,
    paddingBlock:   tokens.spacing.lg,
    display:        "flex",
    flexDirection:  "column",
    gap:            tokens.spacing.lg,
  },
  grid: {
    display:             "grid",
    gridTemplateColumns: "1fr",
    gap:                 tokens.spacing.md,

    sm: { gridTemplateColumns: "1fr 1fr"        },     // ≥ 640px
    md: { gridTemplateColumns: "1fr 1fr 1fr"    },     // ≥ 768px
    lg: { gridTemplateColumns: "repeat(4, 1fr)" },     // ≥ 1024px
  },
  section: {
    display:        "flex",
    flexDirection:  "column",
    gap:            tokens.spacing.sm,
  },
  sectionTitle: {
    margin:         0,
    fontSize:       "0.875rem",
    fontWeight:     600,
    textTransform:  "uppercase",
    letterSpacing:  "0.05em",
    color:          tokens.text.muted,
  },
});

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className={$.page}>
      <div className={$.container}>{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={$.section}>
      <h2 className={$.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

export function Grid({ children }: { children: React.ReactNode }) {
  return <div className={$.grid}>{children}</div>;
}
