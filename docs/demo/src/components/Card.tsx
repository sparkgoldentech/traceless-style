/**
 * Card — surface container with title + body + actions.
 *
 * Demonstrates:
 *   • Token usage at every layer
 *   • _hover / _focusWithin (focus ring on any descendant)
 *   • Raw selector for child element styling ("& > h3", "& > p")
 *   • Manual _dark override (one property — auto-derives the rest)
 *   • Container queries (_containerSm, _containerMd)
 *   • _autoRtl: false on a layout-locked drag handle
 */
import { tl } from "traceless-style";
import type { TracelessClass } from "traceless-style";
import { tokens } from "../theme/tokens";

const $ = tl.create({
  card: {
    containerType:  "inline-size",  // declare container query parent

    display:        "flex",
    flexDirection:  "column",
    gap:            tokens.spacing.sm,
    padding:        tokens.spacing.md,
    background:     tokens.surface.default,
    border:         "1px solid transparent",
    borderColor:    tokens.surface.border,
    borderRadius:   tokens.radius.md,
    boxShadow:      tokens.shadow.sm,
    color:          tokens.text.default,
    transition:     "transform 120ms ease, box-shadow 120ms ease",

    _hover:        { transform: "translateY(-2px)", boxShadow: tokens.shadow.md },
    _focusWithin:  { boxShadow: tokens.shadow.md, outline: "2px solid", outlineOffset: "2px" },

    /* Manual override: shadow needs different alpha in dark mode.
       Color values are auto-derived — we don't need _dark for them. */
    _dark: {
      boxShadow: "0 1px 3px rgba(255,255,255,0.05)",
    },

    /* Raw selectors for inline child styling */
    "& > h3": {
      margin:     0,
      fontSize:   "1.125rem",
      fontWeight: 600,
      color:      tokens.text.default,
    },
    "& > p": {
      margin: 0,
      color:  tokens.text.muted,
      fontSize: "0.9375rem",
      lineHeight: 1.5,
    },

    /* Adapt to PARENT width via container queries */
    _containerSm: { padding: tokens.spacing.lg },
    _containerMd: { gap: tokens.spacing.md },
  },

  actions: {
    display:        "flex",
    gap:            tokens.spacing.sm,
    marginBlockStart: tokens.spacing.sm,
  },
});

export interface CardProps {
  title:    string;
  className?: TracelessClass;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export function Card({ title, className, children, actions }: CardProps) {
  return (
    <article className={tl.merge($.card, className)}>
      <h3>{title}</h3>
      <p>{children}</p>
      {actions ? <div className={$.actions}>{actions}</div> : null}
    </article>
  );
}
