/**
 * App — top-level glue.
 *
 * Demonstrates:
 *   • <TracelessRoot /> (anti-flash inline script)
 *   • Applying the dark theme class at the body level
 *   • Composing every other demo component
 */
import { useState } from "react";
import { TracelessRoot } from "traceless-style/dark";
import { tl } from "traceless-style";

import "./variants";                    // register custom variants
import { tokens, brandPink } from "./theme/tokens";

import { Page, Section, Grid } from "./components/Layout";
import { Card }                from "./components/Card";
import { Button }              from "./components/Button";
import { Form }                from "./components/Form";
import { ProgressBar }         from "./components/ProgressBar";
import { Modal }               from "./components/Modal";
import { ThemeBar }            from "./components/ThemeBar";

const $ = tl.create({
  hero: {
    display:        "flex",
    flexDirection:  "column",
    gap:            tokens.spacing.sm,
    paddingBlock:   tokens.spacing.xl,
    textAlign:      "center",
  },
  title: {
    margin:     0,
    fontSize:   "2.5rem",
    fontWeight: 700,
    color:      tokens.text.default,
    md: { fontSize: "3rem" },
  },
  subtitle: {
    margin: 0,
    color:  tokens.text.muted,
    fontSize: "1.125rem",
    maxWidth: "40rem",
    marginInline: "auto",
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacing.sm,
  },
  formColumn: {
    maxWidth: "30rem",
  },
});

export function App() {
  const [progress, setProgress] = useState(35);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <TracelessRoot />
      <ThemeBar />

      <Page>
        <header className={$.hero}>
          <h1 className={$.title}>traceless-style demo</h1>
          <p className={$.subtitle}>
            Zero-runtime atomic CSS. Toggle dark mode and RTL using the controls in the top-right corner —
            every color flips and every layout mirrors automatically.
          </p>
          <div className={$.buttonRow} style={{ justifyContent: "center" } as never}>
            <Button onClick={() => setModalOpen(true)}>Open modal</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </header>

        <Section title="Cards (responsive grid)">
          <Grid>
            <Card title="Dark mode">
              Built into the compiler. Every color value gets a paired
              dark variant generated automatically — no manual `_dark`
              blocks for routine swaps.
            </Card>
            <Card title="RTL support">
              Physical CSS properties get rewritten to logical at build
              time. The browser handles the rest. Toggle direction in
              the top-right corner.
            </Card>
            <Card title="WCAG contrast">
              Every color/background pair is checked against AA at build
              time. Failures surface a suggested replacement color.
            </Card>
            <Card title="Atomic CSS">
              Each unique property:value pair is one class. Two
              components both using `padding: 8px` share the same
              hashed class.
            </Card>
            <Card title={"Brand: pink"} className={brandPink as never}>
              Themes nest. Wrap any subtree in a theme class and tokens
              inside resolve to that theme's overrides — no React context
              required.
            </Card>
            <Card
              title="Buttons"
              actions={
                <>
                  <Button size="sm">Save</Button>
                  <Button size="sm" variant="secondary">Cancel</Button>
                  <Button size="sm" variant="danger">Delete</Button>
                </>
              }
            >
              Last-wins composition with `tl.merge`. Caller's `className`
              wins on any conflicting property.
            </Card>
          </Grid>
        </Section>

        <Section title="Form (focus + invalid + placeholder states)">
          <div className={$.formColumn}>
            <Form />
          </div>
        </Section>

        <Section title="Progress bar (CSS custom property)">
          <ProgressBar value={progress} />
          <div className={$.buttonRow}>
            <Button size="sm" variant="ghost"
              onClick={() => setProgress(p => Math.max(0, p - 10))}>−10</Button>
            <Button size="sm" variant="ghost"
              onClick={() => setProgress(p => Math.min(100, p + 10))}>+10</Button>
          </div>
        </Section>
      </Page>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Hello from traceless-style"
      >
        <p style={{ margin: "0 0 1rem", lineHeight: 1.6 } as never}>
          Native &lt;dialog&gt; element with a hashed keyframe-driven
          entrance animation. Respects `prefers-reduced-motion`.
        </p>
        <Button onClick={() => setModalOpen(false)}>Close</Button>
      </Modal>
    </>
  );
}
