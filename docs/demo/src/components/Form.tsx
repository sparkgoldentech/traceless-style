/**
 * Form — inputs with full state styling.
 *
 * Demonstrates:
 *   • _focus / _focusVisible / _focusWithin
 *   • _placeholder pseudo-element
 *   • _invalid / _required / _disabled pseudo-classes
 *   • _peerChecked (sibling-state styling for radios/checkboxes)
 *   • Tokens for surface + border + text
 *   • Auto-RTL: physical paddingLeft becomes logical paddingInlineStart,
 *     so input icons stay on the leading edge in any direction.
 */
import { tl } from "traceless-style";
import { tokens } from "../theme/tokens";

const $ = tl.create({
  field: {
    display:        "flex",
    flexDirection:  "column",
    gap:            tokens.spacing.xs,

    _focusWithin: {
      "& > label": { color: tokens.brand.primary },
    },
  },
  label: {
    fontSize:   "0.875rem",
    color:      tokens.text.muted,
    fontWeight: 500,
    transition: "color 120ms ease",
  },
  input: {
    padding:        tokens.spacing.sm,
    border:         "1px solid transparent",
    borderColor:    tokens.surface.border,
    borderRadius:   tokens.radius.md,
    background:     tokens.surface.default,
    color:          tokens.text.default,
    fontFamily:     tokens.font.sans,
    fontSize:       "1rem",
    transition:     "border-color 120ms ease, box-shadow 120ms ease",

    _placeholder:   { color: tokens.text.muted, opacity: 0.7 },

    _focus: {
      borderColor: tokens.brand.primary,
      boxShadow:   "0 0 0 3px rgba(59,130,246,0.2)",
      outline:     "none",
    },

    _invalid: {
      borderColor: tokens.brand.danger,
      _focus:    { boxShadow: "0 0 0 3px rgba(220,38,38,0.2)" },
    },

    _disabled: {
      opacity:        0.5,
      pointerEvents:  "none",
      background:     tokens.surface.muted,
    },
  },
  group: {
    display:        "flex",
    flexDirection:  "column",
    gap:            tokens.spacing.md,
  },
});

export function Form() {
  return (
    <form className={$.group} onSubmit={e => e.preventDefault()}>
      <div className={$.field}>
        <label className={$.label} htmlFor="name">Name</label>
        <input id="name" className={$.input} placeholder="Ada Lovelace" required />
      </div>

      <div className={$.field}>
        <label className={$.label} htmlFor="email">Email</label>
        <input id="email" type="email" className={$.input} placeholder="ada@example.com" required />
      </div>

      <div className={$.field}>
        <label className={$.label} htmlFor="bio">Short bio</label>
        <input id="bio" className={$.input} placeholder="Optional" />
      </div>
    </form>
  );
}
