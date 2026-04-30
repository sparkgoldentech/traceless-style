# Recipe: Building a Button component

A complete, production-ready Button with variants, sizes, states, dark mode, and accessibility.

```tsx
// components/Button.tsx
import { tl } from "traceless-style";
import type { TracelessClass } from "traceless-style";

const $ = tl.create({
  base: {
    display:        "inline-flex",
    alignItems:     "center",
    justifyContent: "center",
    gap:            "0.5rem",
    border:         "1px solid transparent",
    borderRadius:   "6px",
    fontWeight:     500,
    cursor:         "pointer",
    transition:     "background 120ms ease, color 120ms ease, border-color 120ms ease",
    userSelect:     "none",
    whiteSpace:     "nowrap",

    _focusVisible: {
      outline:       "2px solid #3b82f6",
      outlineOffset: "2px",
    },

    _disabled: {
      opacity:        0.5,
      pointerEvents:  "none",
    },
  },

  /* ── Sizes ── */
  sizeSm: { padding: "0.25rem 0.5rem",  fontSize: "0.875rem" },
  sizeMd: { padding: "0.5rem 1rem",     fontSize: "1rem"     },
  sizeLg: { padding: "0.75rem 1.5rem",  fontSize: "1.125rem" },

  /* ── Variants ── */
  primary: {
    background:  "#3b82f6",
    color:       "white",
    _hover:      { background: "#2563eb" },
    _active:     { background: "#1d4ed8" },
  },
  secondary: {
    background:  "white",
    color:       "#3b82f6",
    borderColor: "#3b82f6",
    _hover:      { background: "#eff6ff" },
  },
  danger: {
    background:  "#dc2626",
    color:       "white",
    _hover:      { background: "#b91c1c" },
  },
  ghost: {
    background:  "transparent",
    color:       "#0f172a",
    _hover:      { background: "rgba(0,0,0,0.05)" },
  },
});

interface ButtonProps {
  variant?:  "primary" | "secondary" | "danger" | "ghost";
  size?:     "sm" | "md" | "lg";
  disabled?: boolean;
  className?: TracelessClass;
  onClick?:  () => void;
  children:  React.ReactNode;
}

export function Button({
  variant = "primary",
  size    = "md",
  disabled,
  className,
  onClick,
  children,
}: ButtonProps) {
  const sizeClass    = size    === "sm" ? $.sizeSm    : size    === "lg" ? $.sizeLg    : $.sizeMd;
  const variantClass = variant === "secondary" ? $.secondary
                     : variant === "danger"    ? $.danger
                     : variant === "ghost"     ? $.ghost
                     :                           $.primary;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={tl.merge($.base, sizeClass, variantClass, className)}
    >
      {children}
    </button>
  );
}
```

## Usage

```tsx
<Button>Save</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="danger" size="lg">Delete</Button>
<Button disabled>Loading…</Button>

{/* Override one property: */}
<Button className={tl.create({ wide: { width: "100%" } }).wide}>
  Full-width
</Button>
```

## What this demonstrates

- **`tl.merge`** combines base, size, variant, and user override classes — the override wins on any conflicting property.
- **`TracelessClass`** type forces callers to pass `tl.create` outputs (or explicitly cast). Bare strings are rejected at compile time.
- **Auto-dark-mode** automatically derives a dark variant of `#3b82f6`, `white`, `#0f172a`, etc. — you don't need `_dark` blocks here.
- **`_focusVisible`** uses the modern keyboard-focus pseudo-class (no focus ring on mouse click).
- **`_disabled`** uses CSS state, not a separate component — `<button disabled>` triggers the styles.
- **`transition`** specifies only the properties that animate, avoiding "transition: all" performance footguns.
