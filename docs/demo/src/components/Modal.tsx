/**
 * Modal — keyframes + backdrop + focus management.
 *
 * Demonstrates:
 *   • tl.keyframes (named, hashed, replayable across files)
 *   • _backdrop pseudo-element (native <dialog> support)
 *   • motionReduce variant for accessibility
 *   • Stacked variants: parent dark + hover
 */
import { useEffect, useRef } from "react";
import { tl } from "traceless-style";
import { tokens } from "../theme/tokens";

const fadeIn = tl.keyframes("modalFadeIn", {
  from: { opacity: 0,   transform: "scale(0.96)" },
  to:   { opacity: 1,   transform: "scale(1)"    },
});

const $ = tl.create({
  dialog: {
    /* dialog defaults */
    border:         "none",
    padding:        tokens.spacing.lg,
    borderRadius:   tokens.radius.lg,
    background:     tokens.surface.default,
    color:          tokens.text.default,
    boxShadow:      tokens.shadow.lg,
    minWidth:       "20rem",
    maxWidth:       "min(40rem, 90vw)",

    animation:      `${fadeIn} 180ms ease-out`,
    motionReduce:   { animation: "none" },

    _backdrop: {
      background: "rgba(0,0,0,0.4)",
      backdropFilter: "blur(2px)",
    },
  },

  closeBtn: {
    position:       "absolute",
    insetBlockStart: tokens.spacing.sm,
    insetInlineEnd:  tokens.spacing.sm,
    background:     "transparent",
    border:         "none",
    cursor:         "pointer",
    fontSize:       "1.25rem",
    color:          tokens.text.muted,
    _hover:        { color: tokens.text.default },
  },

  body: {
    position: "relative",
  },
});

export interface ModalProps {
  open:     boolean;
  onClose:  () => void;
  title:    string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open)  el.showModal();
    if (!open && el.open)  el.close();
  }, [open]);

  return (
    <dialog ref={ref} className={$.dialog} onClose={onClose}>
      <div className={$.body}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>{title}</h2>
        {children}
        <button className={$.closeBtn} aria-label="Close" onClick={onClose}>×</button>
      </div>
    </dialog>
  );
}
